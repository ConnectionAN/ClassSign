begin;
-- Custom lines may add fees or deduct from this draft; existing history and grants stay intact.
alter table public.billing_items drop constraint billing_items_check;
alter table public.billing_items add constraint billing_items_check check(
 (kind='tuition' and source_session is not null and material is null and adjustment is null and amount>=0)
 or (kind='material' and material is not null and source_session is null and adjustment is null and amount>=0)
 or (kind in('credit','reversal') and adjustment is not null and source_session is null and material is null)
 or (kind='custom' and source_session is null and material is null and adjustment is null
     and amount between -100000000 and 100000000 and amount<>0));
do $patch$
declare definition text;updated text;
begin
 definition:=pg_get_functiondef('studio_private.billing_before_item_controls(jsonb)'::regprocedure);
 updated:=replace(definition,'''^[0-9]{1,9}$''','''^-?[0-9]{1,9}$''');
 updated:=replace(updated,'費用需為正整數','費用需為非零整數（正數加費、負數扣除）');
 updated:=replace(updated,'amount_value not between 1 and 100000000',
  '(amount_value=0 or amount_value not between -100000000 and 100000000)');
 if updated=definition or position('^-?[0-9]{1,9}$' in updated)=0 or position('amount_value=0' in updated)=0 then
  raise exception 'Unexpected custom billing handler definition';
 end if;
 execute updated;
 -- Guard before allocating automatic credits; negative budgets must never generate reversals.
 definition:=pg_get_functiondef('studio_private.billing_prepare(uuid,uuid)'::regprocedure);
 updated:=replace(definition,
  'select coalesce(sum(amount),0) into budget from public.billing_items where invoice=v;',
  'select coalesce(sum(amount),0) into budget from public.billing_items where invoice=v;
   if budget<0 then raise exception ''扣除金額不可超過本期費用，學費袋應收不可為負數'';end if;');
 if updated=definition then raise exception 'Unexpected billing_prepare definition';end if;
 execute updated;
end $patch$;
commit;
