begin;
create table public.weekly_slots(
 id uuid primary key default gen_random_uuid(), owner uuid not null, student uuid not null,
 weekday int not null check(weekday between 1 and 7), minute int not null check(minute between 0 and 1439),
 duration int not null default 60 check(duration between 1 and 1440 and minute+duration<=1440),
 starts date not null, ends date, estimated_fee int not null check(estimated_fee between 0 and 1000000),
 check(ends is null or ends>=starts-1), unique(id,owner,student),
 foreign key(student,owner) references public.students(id,owner));
create table public.class_sessions(
 id uuid primary key default gen_random_uuid(),owner uuid not null,student uuid not null,
 slot uuid, original_day date not null, day date not null,minute int not null check(minute between 0 and 1439),
 duration int not null default 60 check(duration between 1 and 1440 and minute+duration<=1440),
 estimated_fee int not null check(estimated_fee between 0 and 1000000),
 status text not null default 'planned' check(status in('planned','leave','signed','cancelled')),
 needs_makeup boolean not null default false, original uuid,
 unique(slot,original_day),unique(id,owner,student),
 foreign key(student,owner) references public.students(id,owner),
 foreign key(slot,owner,student) references public.weekly_slots(id,owner,student),
 foreign key(original,owner,student) references public.class_sessions(id,owner,student));
create unique index one_makeup on public.class_sessions(original) where original is not null and status<>'cancelled';
create index sessions_calendar on public.class_sessions(owner,day);
create index slots_owner on public.weekly_slots(owner);
alter table public.lessons add column session uuid;
alter table public.lessons add foreign key(session,owner,student) references public.class_sessions(id,owner,student);
create unique index one_signed_session on public.lessons(session) where voided is null;
create table public.schedule_events(
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),
 session uuid references public.class_sessions(id),action text not null,before_data jsonb,after_data jsonb,
 created timestamptz not null default now());
create index events_owner on public.schedule_events(owner,created);
alter table public.weekly_slots enable row level security;
alter table public.class_sessions enable row level security;
alter table public.schedule_events enable row level security;
create policy own_slots on public.weekly_slots for select to authenticated using(owner=(select auth.uid()) and exists(select 1 from public.teacher_access where user_id=(select auth.uid())));
create policy own_sessions on public.class_sessions for select to authenticated using(owner=(select auth.uid()) and exists(select 1 from public.teacher_access where user_id=(select auth.uid())));
create policy own_events on public.schedule_events for select to authenticated using(owner=(select auth.uid()) and exists(select 1 from public.teacher_access where user_id=(select auth.uid())));
revoke all on public.weekly_slots,public.class_sessions,public.schedule_events from public,anon,authenticated;
grant select on public.weekly_slots,public.class_sessions,public.schedule_events to authenticated;
create schema if not exists studio_private;
revoke all on schema studio_private from public,anon,authenticated;
alter function public.studio_action(jsonb) set schema studio_private;
revoke all on function studio_private.studio_action(jsonb) from public,anon,authenticated;

-- Called only under the per-owner transaction lock. Includes unmaterialized weekly slots.
create function studio_private.check_time(u uuid,d date,m int,n int,exclude_id uuid default null) returns void
language plpgsql set search_path='' as $$
begin
 if d is null or m is null or n is null or m<0 or n<1 or m+n>1440 then raise exception '時段格式錯誤';end if;
 if exists(select 1 from public.class_sessions c where c.owner=u and c.day=d and c.status in('planned','signed')
  and c.id is distinct from exclude_id and c.minute<m+n and m<c.minute+c.duration)
 or exists(select 1 from public.weekly_slots w join public.students s on s.id=w.student
  where w.owner=u and s.active=1 and d>=w.starts and (w.ends is null or d<=w.ends)
  and extract(isodow from d)=w.weekday and w.minute<m+n and m<w.minute+w.duration
  and not exists(select 1 from public.class_sessions c where c.slot=w.id and c.original_day=d))
 then raise exception '課程時段重疊';end if;
end $$;
revoke all on function studio_private.check_time(uuid,date,int,int,uuid) from public,anon,authenticated;

create function public.studio_action(b jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid();op text:=b->>'action';s public.students%rowtype;c public.class_sessions%rowtype;
 w public.weekly_slots%rowtype;l public.lessons%rowtype;sid uuid;cid uuid;vdate date;vto date;vm int;vn int;
 vf int;vwd int;result jsonb;old jsonb;newrow jsonb;
begin
 if u is null or not exists(select 1 from public.teacher_access where user_id=u) then raise exception '此帳號沒有老師權限' using errcode='42501';end if;
 if b is null or octet_length(b::text)>350000 then raise exception '資料太大';end if;
 -- Serialize all writes for this teacher, including different students and recurring slots.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if op='calendar' then
  vdate:=(b->>'from')::date;vto:=(b->>'to')::date;
  if vdate is null or vto is null or vto<vdate or vto-vdate>61 then raise exception '一次最多查詢62日';end if;
  insert into public.class_sessions(owner,student,slot,original_day,day,minute,duration,estimated_fee)
  select u,cw.student,cw.id,d::date,d::date,cw.minute,cw.duration,cw.estimated_fee
  from public.weekly_slots cw join public.students cs on cs.id=cw.student
  cross join generate_series(vdate::timestamp,vto::timestamp,interval '1 day') d
  where cw.owner=u and cs.active=1 and d::date>=cw.starts and (cw.ends is null or d::date<=cw.ends)
   and extract(isodow from d)=cw.weekday on conflict(slot,original_day) do nothing;
  return jsonb_build_object('sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.day,x.minute) from public.class_sessions x where x.owner=u and x.day between vdate and vto),'[]'::jsonb),
   'slots',coalesce((select jsonb_agg(to_jsonb(x)) from public.weekly_slots x where x.owner=u),'[]'::jsonb),
   'makeups',coalesce((select jsonb_agg(to_jsonb(x) order by x.day,x.minute) from public.class_sessions x where x.owner=u and x.original is not null and x.status='planned'),'[]'::jsonb),
   'origins',coalesce((select jsonb_agg(to_jsonb(x)) from public.class_sessions x where x.owner=u and x.id in(select original from public.class_sessions where owner=u and original is not null and (day between vdate and vto or status='planned'))),'[]'::jsonb),
   'pending',coalesce((select jsonb_agg(to_jsonb(x)) from public.class_sessions x where x.owner=u and x.status='leave' and x.needs_makeup
    and not exists(select 1 from public.class_sessions m where m.original=x.id and m.status<>'cancelled')),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created,x.id) from public.schedule_events x where x.owner=u and x.session in(select id from public.class_sessions where owner=u and (day between vdate and vto or (original is not null and status='planned')) union select original from public.class_sessions where owner=u and original is not null and (day between vdate and vto or status='planned'))),'[]'::jsonb));
 end if;
 if op='student' then return studio_private.studio_action(b);end if;
 sid:=(b->>'student')::uuid;
 select * into s from public.students where owner=u and id=sid for update;
 if not found then raise exception '找不到學生' using errcode='42501';end if;
 if op in('slot','stop_slot') then
  vdate:=(b->>'starts')::date;
  if vdate is null then raise exception '請填生效日期';end if;
  if op='stop_slot' then
   select * into w from public.weekly_slots where id=(b->>'slot')::uuid and owner=u and student=sid for update;
   if not found then raise exception '找不到固定課表';end if;
   if vdate<(now() at time zone 'Asia/Taipei')::date or vdate<w.starts then raise exception '停止日期不可早於今天或原生效日期';end if;
   if exists(select 1 from public.class_sessions where slot=w.id and original_day>=vdate and status='signed') then raise exception '不可變更已簽課程';end if;
   old:=to_jsonb(w);
   update public.weekly_slots set ends=least(coalesce(ends,vdate-1),vdate-1) where id=w.id returning to_jsonb(weekly_slots.*) into newrow;
   with changed as(update public.class_sessions set status='cancelled' where slot=w.id and original_day>=vdate and status='planned' returning *)
    insert into public.schedule_events(owner,session,action,after_data) select u,id,'stop_slot',to_jsonb(changed.*) from changed;
  else
   if s.active<>1 then raise exception '學生已封存';end if;
   vm:=(b->>'minute')::int;vn:=coalesce((b->>'duration')::int,60);vwd:=(b->>'weekday')::int;vto:=nullif(b->>'ends','')::date;
   if vm is null or vwd is null or vwd not between 1 and 7 or vn<1 or vm<0 or vm+vn>1440 or (vto is not null and vto<vdate) then raise exception '課表格式錯誤';end if;
   -- First matching weekday in the common effective interval must be within its end.
   if exists(select 1 from public.weekly_slots x join public.students st on st.id=x.student
    where x.owner=u and st.active=1 and x.weekday=vwd and x.minute<vm+vn and vm<x.minute+x.duration
    and greatest(x.starts,vdate)+((vwd-extract(isodow from greatest(x.starts,vdate))::int+7)%7)<=least(coalesce(x.ends,'9999-12-31'),coalesce(vto,'9999-12-31')))
   or exists(select 1 from public.class_sessions x where x.owner=u and x.status in('planned','signed') and x.day>=vdate and (vto is null or x.day<=vto) and extract(isodow from x.day)=vwd and x.minute<vm+vn and vm<x.minute+x.duration)
    then raise exception '課程時段重疊';end if;
   insert into public.weekly_slots(owner,student,weekday,minute,duration,starts,ends,estimated_fee)
   values(u,sid,vwd,vm,vn,vdate,vto,s.fee) returning to_jsonb(weekly_slots.*) into newrow;
  end if;
  insert into public.schedule_events(owner,action,before_data,after_data) values(u,op,old,newrow);
 elsif op in('leave','move','makeup','cancel','restore') then
  select * into c from public.class_sessions where id=(b->>'session')::uuid and owner=u and student=sid for update;
  if not found then raise exception '找不到排課';end if;
  if c.status='signed' then raise exception '不可變更已簽課程，請先作廢';end if;
  old:=to_jsonb(c);cid:=c.id;
  if op='leave' then
   if c.status<>'planned' or jsonb_typeof(b->'needsMakeup') is distinct from 'boolean' then raise exception '請選擇是否補課';end if;
   update public.class_sessions set status='leave',needs_makeup=(b->>'needsMakeup')::boolean where id=c.id;
  elsif op='makeup' then
   if c.status<>'leave' or not c.needs_makeup or exists(select 1 from public.class_sessions where original=c.id and status<>'cancelled') then raise exception '原課不在待補課清單';end if;
   -- Chains are explicit: a makeup that is itself excused becomes the next original.
   if s.active<>1 then raise exception '學生已封存';end if;
   vdate:=(b->>'day')::date;vm:=(b->>'minute')::int;vn:=coalesce((b->>'duration')::int,c.duration);
   perform studio_private.check_time(u,vdate,vm,vn);
   insert into public.class_sessions(owner,student,original,original_day,day,minute,duration,estimated_fee)
    values(u,sid,c.id,vdate,vdate,vm,vn,c.estimated_fee) returning id into cid;
  elsif op='move' or op='restore' then
   if op='move' and c.status<>'planned' then raise exception '只有待上課可調課';end if;
   if op='restore' and c.status not in('leave','cancelled') then raise exception '此課程無法恢復';end if;
   if op='restore' and c.original is not null and not exists(select 1 from public.class_sessions p where p.id=c.original and p.owner=u and p.status='leave' and p.needs_makeup) then raise exception '原課已撤回請假，無法恢復補課';end if;
   if exists(select 1 from public.class_sessions where original=c.id and status<>'cancelled') then raise exception '請先取消關聯補課';end if;
   if s.active<>1 then raise exception '學生已封存';end if;
   vdate:=coalesce((b->>'day')::date,c.day);vm:=coalesce((b->>'minute')::int,c.minute);vn:=coalesce((b->>'duration')::int,c.duration);
   perform studio_private.check_time(u,vdate,vm,vn,c.id);
   update public.class_sessions set day=vdate,minute=vm,duration=vn,status='planned',needs_makeup=false where id=c.id;
  else
   if c.status<>'planned' then raise exception '只能取消待上課課程';end if;
   update public.class_sessions set status='cancelled' where id=c.id;
  end if;
  select to_jsonb(x) into newrow from public.class_sessions x where id=cid;
  insert into public.schedule_events(owner,session,action,before_data,after_data) values(u,cid,op,old,newrow||jsonb_build_object('reason',left(coalesce(b->>'reason',''),300)));
 elsif op='lesson' then
  select * into l from public.lessons where id=(b->>'id')::uuid;
  vf:=coalesce((b->>'actualFee')::int,(b->>'expectedFee')::int);
  if found then
   if l.owner=u and l.student=sid and l.day=(b->>'day')::date and l.fee=vf and l.teacher=b->>'teacher' and l.learner=b->>'learner' and l.session is not distinct from (b->>'session')::uuid then return jsonb_build_object('ok',true);end if;
   raise exception '送出識別碼已存在，請重新開始簽到';
  end if;
  if s.active<>1 then raise exception '學生已封存';end if;
  vdate:=(b->>'day')::date;
  if vdate is null or vdate>(now() at time zone 'Asia/Taipei')::date then raise exception '不可簽到未來課程';end if;
  if vf is null or vf not between 0 and 1000000 then raise exception '請填寫整數學費';end if;
  if b ? 'session' and b->>'session' is not null then
   select * into c from public.class_sessions where id=(b->>'session')::uuid and owner=u and student=sid for update;
   if not found or c.status<>'planned' or c.day<>vdate then raise exception '排課已異動，請重新整理';end if;
   if b->'feeConfirmed' is distinct from 'true'::jsonb then raise exception '請確認實際學費';end if;
  else
   if s.fee is distinct from (b->>'expectedFee')::int then raise exception '學費已異動，請重新整理後確認並重簽';end if;
   if (vdate<(now() at time zone 'Asia/Taipei')::date or vf<>s.fee) and b->'feeConfirmed' is distinct from 'true'::jsonb then raise exception '補登需確認實際學費';end if;
  end if;
  if coalesce(b->>'teacher','') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$' or coalesce(b->>'learner','') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$' then raise exception '請提供兩份 PNG 簽名';end if;
  insert into public.lessons(id,student,owner,day,fee,teacher,learner,session) values((b->>'id')::uuid,sid,u,vdate,vf,b->>'teacher',b->>'learner',c.id);
  if c.id is not null then
   update public.class_sessions set status='signed' where id=c.id;
   insert into public.schedule_events(owner,session,action,before_data,after_data) values(u,c.id,'sign',to_jsonb(c),jsonb_build_object('lesson',b->>'id'));
  end if;
 elsif op='void' then
  select * into l from public.lessons where id=(b->>'id')::uuid and owner=u and student=sid;
  result:=studio_private.studio_action(b);
  if l.session is not null and l.voided is null then
   update public.class_sessions set status='planned' where id=l.session;
   insert into public.schedule_events(owner,session,action,after_data) values(u,l.session,'void',jsonb_build_object('lesson',l.id,'reason',b->>'reason'));
  end if;
 elsif op='archive' then
  if s.active=1 then
   vdate:=(now() at time zone 'Asia/Taipei')::date;
   update public.weekly_slots set ends=greatest(starts-1,least(coalesce(ends,vdate-1),vdate-1)) where owner=u and student=sid;
   with changed as(update public.class_sessions set status='cancelled' where owner=u and student=sid and day>=vdate and status='planned' returning *)
    insert into public.schedule_events(owner,session,action,after_data) select u,id,'archive',to_jsonb(changed.*) from changed;
  end if;
  return studio_private.studio_action(b);
 else return studio_private.studio_action(b);
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.studio_action(jsonb) from public,anon,authenticated;
grant execute on function public.studio_action(jsonb) to authenticated;
commit;
