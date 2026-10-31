begin;
-- Drafts use the student's current rate; issued items and signed lesson values stay immutable.
do $upgrade$
declare definition text;updated text;rate_sql text:= $rate$case when c.status='signed' then coalesce((select l.fee from public.lessons l where l.session=c.id and l.voided is null),c.estimated_fee) else s.fee end$rate$;
begin
 definition:=pg_get_functiondef('studio_private.billing_prepare(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'delete from public.billing_items where invoice=v;',
  'delete from public.billing_items where invoice=v and kind<>''custom'';');
 updated:=replace(updated,'c.estimated_fee,c.id,',rate_sql||',c.id,');
 updated:=replace(updated,'''rate'',c.estimated_fee,''slot''','''rate'','||rate_sql||',''rate_source'',case when c.status=''signed'' then ''signed_lesson'' else ''student_current'' end,''slot''');
 if updated=definition or position('kind<>''custom''' in updated)=0 or position('student_current' in updated)=0 then raise exception 'Unexpected billing_prepare definition';end if;
 execute updated;
end $upgrade$;
alter table public.billing_items drop constraint billing_items_kind_check;
alter table public.billing_items add constraint billing_items_kind_check check(kind in('tuition','material','credit','reversal','custom'));
alter table public.billing_items drop constraint billing_items_check;
alter table public.billing_items add constraint billing_items_check check(
 (kind='tuition' and source_session is not null and material is null and adjustment is null and amount>=0)
 or (kind='material' and material is not null and source_session is null and adjustment is null and amount>=0)
 or (kind in('credit','reversal') and adjustment is not null and source_session is null and material is null)
 or (kind='custom' and source_session is null and material is null and adjustment is null and amount between 1 and 100000000));

alter function studio_private.billing_action(jsonb) rename to billing_v1_action;
revoke all on function studio_private.billing_v1_action(jsonb) from public,anon,authenticated;
create function studio_private.billing_action(b jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.studio_owner();op text:=b->>'action';inv public.billing_invoices%rowtype;
 item public.billing_items%rowtype;v uuid;item_id uuid;amount_value bigint;label_value text;old jsonb;newrow jsonb;
begin
 if u is null then raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';end if;
 if b is null or octet_length(b::text)>8192 then raise exception '帳務要求格式錯誤';end if;
 if op is null or op not in('custom_add','custom_remove') then return studio_private.billing_v1_action(b);end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 v:=(b->>'invoice')::uuid;item_id:=(b->>'id')::uuid;
 select * into inv from public.billing_invoices where id=v and owner=u for update;
 if not found then raise exception '找不到學費袋' using errcode='42501';end if;
 if inv.state<>'draft' then raise exception '只有草稿可以新增或移除自訂費用';end if;
 select * into item from public.billing_items where id=item_id;
 if op='custom_add' then
  label_value:=btrim(b->>'name');
  if label_value is null or length(label_value) not between 1 and 120 then raise exception '請填寫費用名稱（最多120字）';end if;
  if coalesce(b->>'amount','') !~ '^[0-9]{1,9}$' then raise exception '費用需為正整數';end if;
  amount_value:=(b->>'amount')::bigint;
  if amount_value not between 1 and 100000000 or length(coalesce(b->>'notes',''))>500 then raise exception '費用或備註超出範圍';end if;
  if item.id is not null then
   if item.invoice=v and item.owner=u and item.kind='custom' and item.label=label_value and item.amount=amount_value
    and item.snapshot->>'notes'=coalesce(b->>'notes','') then return jsonb_build_object('ok',true);end if;
   raise exception '費用識別碼已存在';
  end if;
  insert into public.billing_items(id,invoice,owner,kind,label,amount,snapshot)
   values(item_id,v,u,'custom',label_value,amount_value,jsonb_build_object('name',label_value,'amount',amount_value,'notes',coalesce(b->>'notes',''),'actor',auth.uid(),'created',now()))
   returning to_jsonb(billing_items.*) into newrow;
 else
  if item.id is null then return jsonb_build_object('ok',true);end if;
  if item.invoice<>v or item.owner<>u or item.kind<>'custom' or item.posted then raise exception '找不到可移除的自訂費用';end if;
  old:=to_jsonb(item);
  delete from public.billing_items where id=item.id;
 end if;
 perform studio_private.billing_prepare(v,u);
 insert into public.billing_audit(owner,actor,action,entity,before_data,after_data)
 values(u,auth.uid(),op,v,old,coalesce(newrow,jsonb_build_object('removed',item_id)));
 return jsonb_build_object('ok',true,'invoice',v);
end $$;
revoke all on function studio_private.billing_action(jsonb) from public,anon,authenticated;
grant execute on function studio_private.billing_action(jsonb) to authenticated;
create or replace function public.billing_action(b jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select studio_private.billing_action(b);
$$;
revoke all on function public.billing_action(jsonb) from public,anon,authenticated;
grant execute on function public.billing_action(jsonb) to authenticated;
commit;
