begin;
-- Read projection only: preserve original signed values and signatures for audit.
create view public.lesson_records with (security_invoker=true) as
select l.id,l.student,l.owner,l.day,l.created,l.reason,l.voided,l.session,
 l.fee as original_fee,
 case when l.fee=0 and c.estimated_fee=0 and c.original is null and w.estimated_fee=0
   and rate.amount>0 and exists(select 1 from public.fee_changes z
    where z.student=l.student and z.owner=l.owner and z.amount=0 and z.changed<rate.changed)
  then rate.amount else l.fee end as fee,
 case when l.fee=0 and c.estimated_fee=0 and c.original is null and w.estimated_fee=0
   and rate.amount>0 and exists(select 1 from public.fee_changes z
    where z.student=l.student and z.owner=l.owner and z.amount=0 and z.changed<rate.changed)
  then 'signing_rate' else 'signed_snapshot' end as fee_source
from public.lessons l
left join public.class_sessions c on c.id=l.session and c.owner=l.owner and c.student=l.student
left join public.weekly_slots w on w.id=c.slot and w.owner=l.owner and w.student=l.student
left join lateral (
 select f.amount,f.changed from public.fee_changes f
 where f.student=l.student and f.owner=l.owner and f.changed<=l.created
 order by f.changed desc,f.id desc limit 1
) rate on true;
revoke all on public.lesson_records from public,anon,authenticated;
grant select on public.lesson_records to authenticated;

do $upgrade$
declare definition text;updated text;
begin
 -- Old clients must reload instead of creating another hidden zero-rate signature.
 definition:=pg_get_functiondef('studio_private.scheduled_action(jsonb)'::regprocedure);
 updated:=replace(definition,
  'if b->''feeConfirmed'' is distinct from ''true''::jsonb then raise exception ''請確認實際學費'';end if;',
  'if b->''feeConfirmed'' is distinct from ''true''::jsonb then raise exception ''請確認實際學費'';end if;
   if vf=0 and c.estimated_fee=0 and c.original is null and s.fee>0
    and exists(select 1 from public.weekly_slots legacy_slot where legacy_slot.id=c.slot and legacy_slot.owner=u and legacy_slot.estimated_fee=0) then
    raise exception ''課表仍使用舊的零元費率，請重新整理後再簽到'';end if;');
 if updated=definition then raise exception 'Unexpected scheduled_action definition';end if;
 execute updated;
 -- Detail and list use the same projection, without exposing signature images in the view.
 definition:=pg_get_functiondef('studio_private.before_student_rename(jsonb)'::regprocedure);
 updated:=replace(definition,'result:=studio_private.pre_billing_action(b);',
  'result:=studio_private.pre_billing_action(b);
   if b->>''action''=''detail'' then
    result:=jsonb_set(result,''{lesson}'',(result->''lesson'') ||
     coalesce((select jsonb_build_object(''fee'',r.fee,''original_fee'',r.original_fee,''fee_source'',r.fee_source)
      from public.lesson_records r where r.id=(b->>''id'')::uuid and r.owner=u),''{}''::jsonb));end if;');
 if updated=definition then raise exception 'Unexpected studio_action definition';end if;
 execute updated;
 definition:=pg_get_functiondef('public.report_snapshot(date,date)'::regprocedure);
 updated:=replace(definition,'from public.lessons l where','from public.lesson_records l where');
 if updated=definition then raise exception 'Unexpected report_snapshot definition';end if;
 execute updated;
 -- Future draft billing uses the same historical resolved fee; issued items stay untouched.
 definition:=pg_get_functiondef('studio_private.billing_prepare(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'select l.fee from public.lessons l','select l.fee from public.lesson_records l');
 if updated=definition then raise exception 'Unexpected billing_prepare definition';end if;
 execute updated;
end $upgrade$;
commit;
