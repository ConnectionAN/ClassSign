begin;
create table public.billing_draft_exclusions(
 id uuid primary key default gen_random_uuid(),invoice uuid not null references public.billing_invoices(id),owner uuid not null,
 kind text not null check(kind in('tuition','material','custom')),source uuid not null,snapshot jsonb not null,active boolean not null default true,
 actor uuid not null references auth.users(id),changed timestamptz not null default now(),unique(invoice,kind,source));
create index on public.billing_draft_exclusions(owner);
create index on public.billing_draft_exclusions(actor);
alter table public.billing_draft_exclusions enable row level security;
revoke all on public.billing_draft_exclusions from public,anon,authenticated;
grant select on public.billing_draft_exclusions to authenticated;
create policy billing_workspace on public.billing_draft_exclusions for select to authenticated using(owner=(select public.studio_owner()));
do $patch$
declare definition text;updated text;
begin
 definition:=pg_get_functiondef('studio_private.billing_prepare(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'and c.status<>''cancelled''',
  'and c.status<>''cancelled'' and not exists(select 1 from public.billing_draft_exclusions excluded where excluded.invoice=v and excluded.kind=''tuition'' and excluded.source=c.id and excluded.active)');
 updated:=replace(updated,'and not m.cancelled',
  'and not m.cancelled and not exists(select 1 from public.billing_draft_exclusions excluded where excluded.invoice=v and excluded.kind=''material'' and excluded.source=m.id and excluded.active)');
 if updated=definition or position('excluded.kind=''tuition''' in updated)=0 or position('excluded.kind=''material''' in updated)=0 then raise exception 'Unexpected billing_prepare';end if;
 execute updated;
end $patch$;
alter function studio_private.billing_action(jsonb) rename to billing_before_item_controls;
revoke all on function studio_private.billing_before_item_controls(jsonb) from public,anon,authenticated;
create function studio_private.billing_action(b jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.studio_owner();op text:=b->>'action';inv public.billing_invoices%rowtype;
 item public.billing_items%rowtype;saved_exclusion public.billing_draft_exclusions%rowtype;v uuid;source_id uuid;result jsonb;
begin
 if u is null then raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';end if;
 if b is null or octet_length(b::text)>8192 then raise exception '帳務要求格式錯誤';end if;
 if op='list' then
  return studio_private.billing_before_item_controls(b)||jsonb_build_object('exclusions',coalesce((select jsonb_agg(e order by e.changed) from public.billing_draft_exclusions e where e.owner=u and e.active),'[]'::jsonb));
 end if;
 if op is null or op not in('draft_item_remove','draft_item_restore') then return studio_private.billing_before_item_controls(b);end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 v:=(b->>'invoice')::uuid;
 select * into inv from public.billing_invoices where id=v and owner=u for update;
 if not found then raise exception '找不到學費袋' using errcode='42501';end if;
 if inv.state<>'draft' then raise exception '只能刪除或還原草稿費用，已開立內容不可修改';end if;
 if op='draft_item_remove' then
  select * into item from public.billing_items where id=(b->>'id')::uuid;
  if not found then return jsonb_build_object('ok',true);end if;
  if item.invoice<>v or item.owner<>u or item.posted then raise exception '找不到可刪除的費用';end if;
  if item.kind not in('tuition','material','custom') then raise exception '自動抵扣與反向調整請透過原課程處理';end if;
  source_id:=coalesce(item.source_session,item.material,item.id);
  insert into public.billing_draft_exclusions(invoice,owner,kind,source,snapshot,actor)
   values(v,u,item.kind,source_id,to_jsonb(item),auth.uid())
   on conflict(invoice,kind,source) do update set active=true,snapshot=excluded.snapshot,actor=auth.uid(),changed=now();
  if item.kind='custom' then delete from public.billing_items where id=item.id;end if;
  insert into public.billing_audit(owner,actor,action,entity,before_data,after_data)
   values(u,auth.uid(),op,v,to_jsonb(item),jsonb_build_object('excluded_source',source_id));
 else
  select * into saved_exclusion from public.billing_draft_exclusions where id=(b->>'id')::uuid and invoice=v and owner=u for update;
  if not found then raise exception '找不到已刪除費用';end if;
  if not saved_exclusion.active then return jsonb_build_object('ok',true);end if;
  if saved_exclusion.kind='custom' then
   insert into public.billing_items(invoice,owner,kind,label,amount,snapshot)
   values(v,u,'custom',saved_exclusion.snapshot->>'label',(saved_exclusion.snapshot->>'amount')::bigint,saved_exclusion.snapshot->'snapshot');
  end if;
  update public.billing_draft_exclusions set active=false,actor=auth.uid(),changed=now() where id=saved_exclusion.id;
  insert into public.billing_audit(owner,actor,action,entity,before_data,after_data)
   values(u,auth.uid(),op,v,to_jsonb(saved_exclusion),jsonb_build_object('restored_source',saved_exclusion.source));
 end if;
 perform studio_private.billing_prepare(v,u);
 return jsonb_build_object('ok',true,'invoice',v);
end $$;
revoke all on function studio_private.billing_action(jsonb) from public,anon,authenticated;
grant execute on function studio_private.billing_action(jsonb) to authenticated;
create or replace function public.billing_action(b jsonb) returns jsonb language sql security invoker set search_path='' as $$select studio_private.billing_action(b);$$;
revoke all on function public.billing_action(jsonb) from public,anon,authenticated;
grant execute on function public.billing_action(jsonb) to authenticated;

alter function public.studio_action(jsonb) rename to before_student_rename;
alter function public.before_student_rename(jsonb) set schema studio_private;
revoke all on function studio_private.before_student_rename(jsonb) from public,anon,authenticated;
create function public.studio_action(b jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.studio_owner();s public.students%rowtype;new_name text;
begin
 if u is null then raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';end if;
 if b is null or octet_length(b::text)>350000 then raise exception '資料太大';end if;
 if b->>'action' is distinct from 'student_rename' then return studio_private.before_student_rename(b);end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into s from public.students where id=(b->>'student')::uuid and owner=u for update;
 if not found then raise exception '找不到學生' using errcode='42501';end if;
 new_name:=btrim(b->>'name');
 if jsonb_typeof(b->'name') is distinct from 'string' or length(new_name) not between 1 and 80 then raise exception '請填寫學生姓名（最多80字）';end if;
 if new_name=s.name then return jsonb_build_object('ok',true);end if;
 if b->>'expectedName' is distinct from s.name then raise exception '姓名已被其他使用者更新，請重新整理後再編輯';end if;
 update public.students set name=new_name where id=s.id;
 update public.billing_invoices set student_name=new_name where student=s.id and owner=u and state='draft';
 insert into public.schedule_events(owner,action,before_data,after_data)
 values(u,'student_rename',jsonb_build_object('student',s.id,'name',s.name),jsonb_build_object('student',s.id,'name',new_name));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.studio_action(jsonb) from public,anon,authenticated;
grant execute on function public.studio_action(jsonb) to authenticated;
commit;
