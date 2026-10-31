begin;
-- Read-only, single-statement snapshot. Existing RLS remains the access boundary.
-- Never call calendar/billing_sync here: viewing reports must not create ledger rows.
create function public.report_snapshot(date_from date, date_to date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if public.studio_owner() is null then
  raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';
 end if;
 if date_from is null or date_to is null or date_to<date_from or date_to-date_from>3660 then
  raise exception '請指定有效期間（最多十年）';
 end if;
 with sessions as (
  select c.id::text,c.student,c.slot,c.original_day,c.day,c.status,c.original,c.needs_makeup
  from public.class_sessions c where c.day between date_from and date_to
  union all
  -- Expand unmaterialized recurring occurrences without changing the schedule.
  select w.id::text||':'||d::date::text,w.student,w.id,d::date,d::date,'planned',null::uuid,false
  from public.weekly_slots w join public.students s on s.id=w.student and s.active=1
  cross join generate_series(date_from::timestamp,date_to::timestamp,interval '1 day') d
  where d::date>=w.starts and (w.ends is null or d::date<=w.ends)
   and extract(isodow from d)=w.weekday
   and not exists(select 1 from public.class_sessions c where c.slot=w.id and c.original_day=d::date)
 )
 select jsonb_build_object(
  'generated_at',now(),
  'invoices',coalesce((select jsonb_agg(v order by v.month,v.id) from public.billing_invoices v),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(i) from public.billing_items i),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(p order by p.day,p.created,p.id) from public.billing_payments p),'[]'::jsonb),
  'adjustments',coalesce((select jsonb_agg(a) from public.billing_adjustments a),'[]'::jsonb),
  'materials',coalesce((select jsonb_agg(m order by m.purchased,m.id) from public.student_material_purchases m),'[]'::jsonb),
  'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'active',s.active)) from public.students s),'[]'::jsonb),
  'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'student',l.student,'day',l.day,'fee',l.fee,'session',l.session,'voided',l.voided) order by l.day,l.id)
   from public.lessons l where l.day between date_from and date_to),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(c order by c.day,c.id) from sessions c),'[]'::jsonb),
  'pending',coalesce((select jsonb_agg(c.id) from public.class_sessions c where c.status='leave' and c.needs_makeup
    and not exists(select 1 from public.class_sessions m where m.original=c.id and m.status<>'cancelled')),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.report_snapshot(date,date) from public,anon,authenticated;
grant execute on function public.report_snapshot(date,date) to authenticated;
commit;

