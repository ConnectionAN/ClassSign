begin;
-- Server-owned membership: all verified Google users may join this one shared studio.
create table public.app_accounts(
 user_id uuid primary key references auth.users(id), email text not null,
 is_admin boolean not null default false, disabled boolean not null default false,
 first_login timestamptz not null, last_login timestamptz not null,
 changed_at timestamptz, changed_by uuid references auth.users(id));
create unique index one_account_admin on public.app_accounts(is_admin) where is_admin;
alter table public.app_accounts enable row level security;
revoke all on public.app_accounts from public,anon,authenticated;
grant select on public.app_accounts to authenticated;

-- Bind once to the EXISTING confirmed account UUID. Email is never used for runtime roles.
do $admin$
declare admin_id uuid;
begin
 select id into strict admin_id from auth.users where lower(email)='a942065123@gmail.com' and email_confirmed_at is not null;
 insert into public.app_accounts(user_id,email,is_admin,first_login,last_login)
 select id,email,true,coalesce(last_sign_in_at,created_at,now()),coalesce(last_sign_in_at,created_at,now()) from auth.users where id=admin_id;
end $admin$;
insert into public.app_accounts(user_id,email,first_login,last_login)
 select u.id,coalesce(u.email,''),coalesce(u.last_sign_in_at,u.created_at,now()),coalesce(u.last_sign_in_at,u.created_at,now())
 from auth.users u where u.last_sign_in_at is not null and (
 exists(select 1 from public.teacher_access t where t.user_id=u.id) or
 (u.email_confirmed_at is not null and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')))
 on conflict(user_id) do nothing;

insert into public.teacher_access(user_id) select user_id from public.app_accounts on conflict(user_id) do nothing;

-- Central gate reads the CURRENT disabled flag, so old JWTs cannot bypass suspension.
create or replace function public.studio_owner() returns uuid
language sql stable security definer set search_path='' as $$
 select w.owner from studio_private.workspace_settings w
 where exists(select 1 from public.teacher_access t join public.app_accounts a on a.user_id=t.user_id
  where t.user_id=(select auth.uid()) and not a.disabled);
$$;
revoke all on function public.studio_owner() from public,anon,authenticated;
grant execute on function public.studio_owner() to authenticated;
alter policy own_access on public.teacher_access using(user_id=(select auth.uid()) and (select public.studio_owner()) is not null);
create policy active_account_directory on public.app_accounts for select to authenticated
 using((select public.studio_owner()) is not null);

create function studio_private.account_action(b jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); person auth.users%rowtype; account public.app_accounts%rowtype; target uuid; state boolean;
begin
 if u is null then raise exception '請先登入' using errcode='42501';end if;
 if b is null or octet_length(b::text)>2048 then raise exception '帳號要求格式錯誤';end if;
 if b->>'action'='bootstrap' then
  select * into person from auth.users where id=u;
  if not found then raise exception '登入已失效' using errcode='42501';end if;
  if not exists(select 1 from public.teacher_access where user_id=u)
   and not (person.email_confirmed_at is not null and exists(select 1 from auth.identities where user_id=u and provider='google')) then
   raise exception '請使用已驗證的 Google 帳號登入' using errcode='42501';
  end if;
  insert into public.app_accounts(user_id,email,first_login,last_login)
   values(u,coalesce(person.email,''),coalesce(person.last_sign_in_at,now()),coalesce(person.last_sign_in_at,now()))
   on conflict(user_id) do nothing;
  select * into account from public.app_accounts where user_id=u for update;
  if account.disabled then raise exception '此帳號已停用，請聯絡管理員' using errcode='42501';end if;
  update public.app_accounts set email=coalesce(person.email,''),last_login=greatest(last_login,coalesce(person.last_sign_in_at,last_login)) where user_id=u;
  insert into public.teacher_access(user_id) values(u) on conflict(user_id) do nothing;
 else
  select * into account from public.app_accounts where user_id=u;
  if not found or account.disabled or public.studio_owner() is null then raise exception '此帳號已停用或尚未啟用' using errcode='42501';end if;
 end if;
 if b->>'action' in ('bootstrap','status') then
  return jsonb_build_object('user_id',u,'is_admin',account.is_admin,'disabled',false);
 elsif b->>'action'='list' then
  return jsonb_build_object('is_admin',account.is_admin,'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.first_login,a.user_id) from public.app_accounts a),'[]'::jsonb));
 elsif b->>'action'='set_status' then
  if not account.is_admin then raise exception '只有管理員可以變更帳號狀態' using errcode='42501';end if;
  if jsonb_typeof(b->'disabled') is distinct from 'boolean' then raise exception '請指定停用狀態';end if;
  target:=(b->>'user_id')::uuid;state:=(b->>'disabled')::boolean;
  select * into account from public.app_accounts where user_id=target for update;
  if not found then raise exception '找不到帳號';end if;
  if account.is_admin then raise exception '不能停用管理員帳號';end if;
  update public.app_accounts set disabled=state,changed_at=now(),changed_by=u where user_id=target;
  return jsonb_build_object('ok',true);
 else raise exception '不支援的帳號操作';end if;
end $$;
revoke all on function studio_private.account_action(jsonb) from public,anon,authenticated;
-- Public facade is intentionally authenticated-only; implementation owns all authorization.
create function public.account_action(b jsonb) returns jsonb
language sql security definer set search_path='' as $$ select studio_private.account_action(b); $$;
revoke all on function public.account_action(jsonb) from public,anon,authenticated;
grant execute on function public.account_action(jsonb) to authenticated;
commit;
