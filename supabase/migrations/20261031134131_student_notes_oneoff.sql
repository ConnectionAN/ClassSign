begin;
alter table public.students add column notes text not null default '' check(length(notes)<=4000);
-- Keep the existing authorized facade and scheduling semantics.
create or replace function public.studio_action(b jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=public.studio_owner();op text:=b->>'action';s public.students%rowtype;w public.weekly_slots%rowtype;
 current_day date:=(now() at time zone 'Asia/Taipei')::date;
 current_minute int:=extract(hour from now() at time zone 'Asia/Taipei')::int*60+extract(minute from now() at time zone 'Asia/Taipei')::int;
 candidate date;next_day date;next_minute int;next_duration int;next_source text;next_id uuid;
 effective date;vm int;vn int;vwd int;old jsonb;changed record;result jsonb;
 oneoff_session public.class_sessions%rowtype;request_id uuid;lesson_day date;
begin
 if u is null then raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';end if;
 if b is null or octet_length(b::text)>350000 then raise exception '資料太大';end if;
 if op not in ('student_schedule','replace_slot','archive','student_notes','oneoff_lesson') then return studio_private.scheduled_action(b);end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into s from public.students where owner=u and id=(b->>'student')::uuid for update;
 if not found then raise exception '找不到學生' using errcode='42501';end if;
 if op='student_notes' then
  if jsonb_typeof(b->'notes') is distinct from 'string' or length(b->>'notes')>4000 then raise exception '備註最多4000字';end if;
  if b->>'expectedNotes' is distinct from s.notes then raise exception '備註已被其他使用者更新，請重新整理後再編輯';end if;
  update public.students set notes=b->>'notes' where id=s.id;
  return jsonb_build_object('ok',true);
 elsif op='oneoff_lesson' then
  if s.active<>1 then raise exception '學生已封存';end if;
  request_id:=(b->>'id')::uuid;lesson_day:=(b->>'day')::date;vm:=(b->>'minute')::int;vn:=(b->>'duration')::int;
  if request_id is null or lesson_day is null or lesson_day>current_day then raise exception '不可簽到未來課程';end if;
  if vm is null or vn is null or vm<0 or vn<1 or vm+vn>1440 then raise exception '時段格式錯誤';end if;
  select * into oneoff_session from public.class_sessions where id=request_id for update;
  if found then
   -- Same request can be retried after a lost response, but never rewritten.
   if oneoff_session.owner<>u or oneoff_session.student<>s.id or oneoff_session.day<>lesson_day or oneoff_session.minute<>vm or oneoff_session.duration<>vn or oneoff_session.slot is not null or oneoff_session.original is not null
    or not exists(select 1 from public.lessons l where l.id=request_id and l.session=oneoff_session.id and l.voided is null)
   then raise exception '送出識別碼已存在，請重新開始簽到';end if;
  else
   perform studio_private.check_time(u,lesson_day,vm,vn);
   insert into public.class_sessions(id,owner,student,original_day,day,minute,duration,estimated_fee)
    values(request_id,u,s.id,lesson_day,lesson_day,vm,vn,s.fee) returning * into oneoff_session;
  end if;
  -- The server selects the fee. Session and signatures commit together or not at all.
  return studio_private.scheduled_action(b||jsonb_build_object('action','lesson','session',oneoff_session.id,'actualFee',oneoff_session.estimated_fee,'expectedFee',s.fee,'feeConfirmed',true));
 elsif op='student_schedule' then
  if s.active<>1 then return jsonb_build_object('slots','[]'::jsonb,'next',null);end if;
  -- Materialized single moves and makeups take their actual day/time. Leave/cancel/signed are skipped.
  select c.day,c.minute,c.duration,c.id,
   case when c.original is not null then 'makeup'
    when c.day<>c.original_day or (sw.id is not null and (c.minute<>sw.minute or c.duration<>sw.duration)) then 'moved'
    else 'regular' end
   into next_day,next_minute,next_duration,next_id,next_source
   from public.class_sessions c left join public.weekly_slots sw on sw.id=c.slot
   where c.owner=u and c.student=s.id and c.status='planned'
    and (c.day>current_day or (c.day=current_day and c.minute>=current_minute))
   order by c.day,c.minute,c.id limit 1;
  -- No arbitrary calendar horizon. Walk weekly occurrences only while an explicit exception exists.
  for w in select * from public.weekly_slots where owner=u and student=s.id and (ends is null or (ends>=current_day and ends>=starts)) loop
   candidate:=greatest(current_day,w.starts);
   candidate:=candidate+((w.weekday-extract(isodow from candidate)::int+7)%7);
   if candidate=current_day and w.minute<current_minute then candidate:=candidate+7;end if;
   while (w.ends is null or candidate<=w.ends) and exists(select 1 from public.class_sessions c where c.slot=w.id and c.original_day=candidate) loop
    candidate:=candidate+7;
   end loop;
   if (w.ends is null or candidate<=w.ends) and
    (next_day is null or (candidate,w.minute)<(next_day,next_minute)) then
    next_day:=candidate;next_minute:=w.minute;next_duration:=w.duration;next_source:='regular';next_id:=null;
   end if;
  end loop;
  return jsonb_build_object('slots',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts,x.weekday,x.minute,x.id) from public.weekly_slots x where x.owner=u and x.student=s.id and (x.ends is null or (x.ends>=current_day and x.ends>=x.starts))),'[]'::jsonb),
   'next',case when next_day is null then null else jsonb_build_object('day',next_day,'minute',next_minute,'duration',next_duration,'source',next_source,'id',next_id) end);
 elsif op='replace_slot' then
  if s.active<>1 then raise exception '學生已封存';end if;
  select * into w from public.weekly_slots where id=(b->>'slot')::uuid and owner=u and student=s.id for update;
  if not found then raise exception '找不到固定課表';end if;
  effective:=(b->>'starts')::date;vm:=(b->>'minute')::int;vn:=(b->>'duration')::int;vwd:=(b->>'weekday')::int;
  if effective is null or effective<current_day or effective<w.starts or (w.ends is not null and effective>w.ends) then raise exception '生效日期不可早於今天、原課表或晚於原結束日';end if;
  if vm is null or vn is null or vwd is null or vm<0 or vn<1 or vm+vn>1440 or vwd not between 1 and 7 then raise exception '課表格式錯誤';end if;
  if exists(select 1 from public.class_sessions where slot=w.id and original_day>=effective and status='signed') then raise exception '生效範圍有已簽課程，請改用較晚生效日';end if;
  old:=to_jsonb(w);
  update public.weekly_slots set ends=effective-1 where id=w.id;
  -- Keep single adjustments, leave and makeup history. Only untouched future template occurrences are replaced.
  for changed in update public.class_sessions set status='cancelled'
   where slot=w.id and original_day>=effective and status='planned'
    and day=original_day and minute=w.minute and duration=w.duration returning * loop
   insert into public.schedule_events(owner,session,action,after_data) values(u,changed.id,'replace_slot',to_jsonb(changed));
  end loop;
  result:=studio_private.scheduled_action(jsonb_build_object('action','slot','student',s.id,'starts',effective,'ends',w.ends,'weekday',vwd,'minute',vm,'duration',vn));
  insert into public.schedule_events(owner,action,before_data,after_data)
   values(u,'replace_slot',old,jsonb_build_object('ends',effective-1,'starts',effective,'weekday',vwd,'minute',vm,'duration',vn));
  return result;
 else
  if s.active=1 then
   -- Archive also clears pending makeup requests; restoring never revives old arrangements.
   for changed in update public.class_sessions set needs_makeup=false
    where owner=u and student=s.id and needs_makeup returning * loop
    insert into public.schedule_events(owner,session,action,after_data) values(u,changed.id,'archive',to_jsonb(changed));
   end loop;
  end if;
  return studio_private.scheduled_action(b);
 end if;
end $$;
revoke all on function public.studio_action(jsonb) from public,anon,authenticated;
grant execute on function public.studio_action(jsonb) to authenticated;
commit;
