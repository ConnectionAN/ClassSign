begin;
-- One studio, multiple explicitly approved accounts. Preserve all original owner values.
do $guard$
begin
 if (select count(distinct owner) from public.students)>1 then
  raise exception 'Existing data belongs to multiple studios; review before enabling shared access';
 end if;
end $guard$;
create table studio_private.workspace_settings(
 singleton boolean primary key default true check(singleton),
 owner uuid not null references auth.users(id));
alter table studio_private.workspace_settings enable row level security;
revoke all on studio_private.workspace_settings from public,anon,authenticated;
insert into studio_private.workspace_settings(singleton,owner)
 select true,chosen from(select coalesce(
  (select owner from public.students order by created,id limit 1),
  (select user_id from public.teacher_access order by user_id limit 1)) as chosen) x
 where chosen is not null;

-- Fresh installations initialize once when the first account is approved.
create function studio_private.initialize_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into studio_private.workspace_settings(singleton,owner)
 values(true,coalesce((select owner from public.students order by created,id limit 1),new.user_id))
 on conflict(singleton) do nothing;
 return new;
end $$;
revoke all on function studio_private.initialize_workspace() from public,anon,authenticated;
create trigger initialize_shared_workspace after insert on public.teacher_access
 for each row execute function studio_private.initialize_workspace();

-- RLS and every RPC use the same fixed data owner; authorization remains per caller.
create function public.studio_owner() returns uuid
language sql stable security definer set search_path='' as $$
 select w.owner from studio_private.workspace_settings w
 where exists(select 1 from public.teacher_access t where t.user_id=(select auth.uid()));
$$;
revoke all on function public.studio_owner() from public,anon,authenticated;
grant execute on function public.studio_owner() to authenticated;
alter policy own_students on public.students using(owner=(select public.studio_owner()));
alter policy own_fees on public.fee_changes using(owner=(select public.studio_owner()));
alter policy own_lessons on public.lessons using(owner=(select public.studio_owner()));
alter policy own_slots on public.weekly_slots using(owner=(select public.studio_owner()));
alter policy own_sessions on public.class_sessions using(owner=(select public.studio_owner()));
alter policy own_events on public.schedule_events using(owner=(select public.studio_owner()));

-- Add a nullable actor separate from the stable studio owner. Historical rows stay null.
alter table public.schedule_events add column actor uuid references auth.users(id);
alter table public.schedule_events alter column actor set default auth.uid();

-- Preserve the tested RPC bodies, replacing only identity resolution and its guard.
do $rpc$
declare def text;updated text;
begin
 def:=pg_get_functiondef('studio_private.studio_action(jsonb)'::regprocedure);
 updated:=replace(def,'uid uuid:=auth.uid();','uid uuid:=public.studio_owner();');
 updated:=replace(updated,'if uid is null or not exists(select 1 from public.teacher_access where user_id=uid) then','if uid is null then');
 if updated=def or position('user_id=uid' in updated)>0 or position('uid uuid:=public.studio_owner();' in updated)=0 then raise exception 'Unexpected legacy RPC definition';end if;
 execute updated;
 def:=pg_get_functiondef('public.studio_action(jsonb)'::regprocedure);
 updated:=replace(def,'u uuid:=auth.uid();','u uuid:=public.studio_owner();');
 updated:=replace(updated,'if u is null or not exists(select 1 from public.teacher_access where user_id=u) then','if u is null then');
 if updated=def or position('user_id=u)' in updated)>0 or position('u uuid:=public.studio_owner();' in updated)=0 then raise exception 'Unexpected scheduling RPC definition';end if;
 execute updated;
end $rpc$;
-- Keep client mutations restricted to the public transaction RPC.
revoke all on function studio_private.studio_action(jsonb) from public,anon,authenticated;
revoke all on function public.studio_action(jsonb) from public,anon,authenticated;
grant execute on function public.studio_action(jsonb) to authenticated;
commit;
