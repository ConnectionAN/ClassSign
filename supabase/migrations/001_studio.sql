-- Run once in a NEW Supabase project. No migration of the existing Sites data.
begin;
create table public.teacher_access(user_id uuid primary key references auth.users(id));
create table public.students(
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 80),
 fee integer not null check(fee between 0 and 1000000),
 active integer not null default 1 check(active in(0,1)),created timestamptz not null default now(),
 unique(id,owner));
create table public.fee_changes(
 id uuid primary key default gen_random_uuid(),student uuid not null,owner uuid not null,
 amount integer not null check(amount between 0 and 1000000),changed timestamptz not null default now(),
 foreign key(student,owner) references public.students(id,owner));
create table public.lessons(
 id uuid primary key,student uuid not null,owner uuid not null,
 day date not null,fee integer not null check(fee between 0 and 1000000),
 teacher text not null check(length(teacher) between 30 and 149999),
 learner text not null check(length(learner) between 30 and 149999),
 created timestamptz not null default now(),reason text,voided timestamptz,
 foreign key(student,owner) references public.students(id,owner),
 check((voided is null and reason is null) or (voided is not null and length(btrim(reason)) between 1 and 300)));
create index on public.students(owner,created);
create index on public.lessons(owner,day);
create index on public.fee_changes(owner,changed);
alter table public.teacher_access enable row level security;
alter table public.students enable row level security;
alter table public.fee_changes enable row level security;
alter table public.lessons enable row level security;
create policy own_access on public.teacher_access for select to authenticated using(user_id=(select auth.uid()));
create policy own_students on public.students for select to authenticated using(owner=(select auth.uid()) and exists(select 1 from public.teacher_access where user_id=(select auth.uid())));
create policy own_fees on public.fee_changes for select to authenticated using(owner=(select auth.uid()) and exists(select 1 from public.teacher_access where user_id=(select auth.uid())));
create policy own_lessons on public.lessons for select to authenticated using(owner=(select auth.uid()) and exists(select 1 from public.teacher_access where user_id=(select auth.uid())));
revoke all on public.teacher_access,public.students,public.fee_changes,public.lessons from anon,authenticated;
grant select on public.teacher_access,public.students,public.fee_changes,public.lessons to authenticated;
-- All mutations through one transaction. Clients cannot modify signed lessons directly.
create function public.studio_action(b jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); op text:=b->>'action'; s public.students%rowtype; l public.lessons%rowtype;
 sid uuid; lid uuid; amount integer; lesson_day date;
begin
 if uid is null or not exists(select 1 from public.teacher_access where user_id=uid) then
  raise exception '此帳號沒有老師權限' using errcode='42501';
 end if;
 if octet_length(b::text)>350000 then raise exception '資料太大';end if;
 if op='student' then
  if length(btrim(b->>'name')) not between 1 and 80 or b->>'name' is null then raise exception '請填寫學生姓名';end if;
  if coalesce(b->>'fee','') !~ '^[0-9]{1,7}$' then raise exception '請填寫整數學費';end if;
  amount:=(b->>'fee')::integer;
  if amount not between 0 and 1000000 then raise exception '學費超出範圍';end if;
  insert into public.students(owner,name,fee) values(uid,btrim(b->>'name'),amount) returning id into sid;
  insert into public.fee_changes(student,owner,amount) values(sid,uid,amount);
  return jsonb_build_object('ok',true);
 end if;
 sid:=(b->>'student')::uuid;
 select * into s from public.students where id=sid and owner=uid for update;
 if not found then raise exception '找不到學生' using errcode='42501';end if;
 if op='fee' then
  if coalesce(b->>'fee','') !~ '^[0-9]{1,7}$' then raise exception '請填寫整數學費';end if;
  amount:=(b->>'fee')::integer;
  if amount not between 0 and 1000000 then raise exception '學費超出範圍';end if;
  update public.students set fee=amount where id=sid;
  insert into public.fee_changes(student,owner,amount) values(sid,uid,amount);
 elsif op='archive' then
  update public.students set active=1-active where id=sid;
 elsif op='lesson' then
  lid:=(b->>'id')::uuid;
  select * into l from public.lessons where id=lid;
  if found then
   if l.owner=uid and l.student=sid and l.day=(b->>'day')::date
    and l.teacher=b->>'teacher' and l.learner=b->>'learner'
    and l.fee=(b->>'expectedFee')::integer then return jsonb_build_object('ok',true);
   else raise exception '送出識別碼已存在，請重新開始簽到';end if;
  end if;
  if s.active<>1 then raise exception '學生已封存';end if;
  if s.fee is distinct from (b->>'expectedFee')::integer then raise exception '學費已異動，請重新整理後確認並重簽';end if;
  if coalesce(b->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '日期格式錯誤';end if;
  lesson_day:=(b->>'day')::date;
  if lesson_day>(now() at time zone 'Asia/Taipei')::date then raise exception '不可簽到未來課程';end if;
  if coalesce(b->>'teacher','') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$'
   or coalesce(b->>'learner','') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$' then raise exception '請提供兩份 PNG 簽名';end if;
  insert into public.lessons(id,student,owner,day,fee,teacher,learner)
   values(lid,sid,uid,lesson_day,s.fee,b->>'teacher',b->>'learner');
 elsif op='void' then
  if length(btrim(b->>'reason')) not between 1 and 300 or b->>'reason' is null then raise exception '請填寫作廢原因';end if;
  update public.lessons set voided=now(),reason=btrim(b->>'reason')
   where id=(b->>'id')::uuid and student=sid and owner=uid and voided is null;
 elsif op='detail' then
  select * into l from public.lessons where id=(b->>'id')::uuid and student=sid and owner=uid;
  if not found then raise exception '找不到課程';end if;
  return jsonb_build_object('lesson',to_jsonb(l));
 else raise exception '不支援的操作';
 end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.studio_action(jsonb) from public,anon,authenticated;
grant execute on function public.studio_action(jsonb) to authenticated;
commit;

