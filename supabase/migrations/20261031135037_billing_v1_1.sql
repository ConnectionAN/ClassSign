begin;
-- Additive billing storage. No auth, student, lesson or schedule identifiers are rewritten.
create table public.student_material_purchases(
 id uuid primary key, owner uuid not null, student uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120), purchased date not null,
 quantity int not null check(quantity between 1 and 10000), unit_price int not null check(unit_price between 0 and 1000000),
 notes text not null default '' check(length(notes)<=500), cancelled boolean not null default false,
 actor uuid not null references auth.users(id), created timestamptz not null default now(),
 foreign key(student,owner) references public.students(id,owner));
create table public.billing_invoices(
 id uuid primary key default gen_random_uuid(),owner uuid not null,student uuid not null,month date not null check(extract(day from month)=1),
 state text not null default 'draft' check(state in('draft','issued','void')),
 student_name text not null, issued_at timestamptz, created timestamptz not null default now(),
 actor uuid not null references auth.users(id),
 foreign key(student,owner) references public.students(id,owner));
create unique index billing_one_month on public.billing_invoices(owner,student,month) where state<>'void';
create table public.billing_adjustments(
 id uuid primary key default gen_random_uuid(),owner uuid not null,student uuid not null,
 source uuid not null references public.class_sessions(id), amount bigint not null check(amount<>0), eligible date not null,
 actor uuid not null references auth.users(id), created timestamptz not null default now(),
 foreign key(student,owner) references public.students(id,owner));
create table public.billing_items(
 id uuid primary key default gen_random_uuid(),invoice uuid not null references public.billing_invoices(id),
 owner uuid not null,kind text not null check(kind in('tuition','material','credit','reversal')),
 label text not null,amount bigint not null,source_session uuid references public.class_sessions(id),
 material uuid references public.student_material_purchases(id), adjustment uuid references public.billing_adjustments(id),
 snapshot jsonb not null, posted boolean not null default false,
 check((kind='tuition' and source_session is not null and material is null and adjustment is null and amount>=0)
 or (kind='material' and material is not null and source_session is null and adjustment is null and amount>=0)
 or (kind in('credit','reversal') and adjustment is not null and source_session is null and material is null)));
create unique index billing_session_once on public.billing_items(source_session) where posted and source_session is not null;
create unique index billing_material_once on public.billing_items(material) where posted and material is not null;
create table public.billing_payments(
 id uuid primary key,owner uuid not null,invoice uuid not null references public.billing_invoices(id),
 amount bigint not null check(amount<>0),method text not null check(method in('cash','transfer')),
 day date not null,notes text not null default '' check(length(notes)<=500),
 reverses uuid unique references public.billing_payments(id),actor uuid not null references auth.users(id),created timestamptz not null default now(),
 check((reverses is null and amount>0) or (reverses is not null and amount<0)));
create table public.billing_audit(
 id uuid primary key default gen_random_uuid(),owner uuid not null,actor uuid not null references auth.users(id),
 action text not null,entity uuid not null,before_data jsonb,after_data jsonb,created timestamptz not null default now());
do $$ declare t text; begin
 foreach t in array array['student_material_purchases','billing_invoices','billing_adjustments','billing_items','billing_payments','billing_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy billing_workspace on public.%I for select to authenticated using(owner=(select public.studio_owner()))',t);
  execute format('create index on public.%I(owner)',t);
 end loop;
end $$;
create index on public.billing_items(invoice);
create index on public.billing_items(adjustment) where adjustment is not null;
create index on public.billing_payments(invoice);
create index on public.billing_adjustments(source);
create index on public.student_material_purchases(student,purchased);

-- Credit entitlement follows the active makeup chain back to its once-billed original.
-- Append compensating entries when leave is restored; never edit an issued snapshot.
create function studio_private.billing_sync(u uuid) returns void language plpgsql set search_path='' as $$
declare r record; entitlement bigint; previous bigint; leave_day date; eligible_day date;
begin
 for r in select c.id,c.student,c.day,
   coalesce((select i.amount from public.billing_items i where i.source_session=c.id and i.posted),0) fee,
   coalesce((select v.month from public.billing_items i join public.billing_invoices v on v.id=i.invoice where i.source_session=c.id and i.posted),date_trunc('month',c.day)::date) bill_month
  from public.class_sessions c where c.owner=u and c.original is null and
  (exists(select 1 from public.billing_items i where i.source_session=c.id and i.posted)
   or exists(select 1 from public.billing_adjustments a where a.source=c.id)) loop
  with recursive chain as (
   select c.* from public.class_sessions c where c.id=r.id
   union all select m.* from public.class_sessions m join chain p on m.original=p.id where m.status<>'cancelled'
  ) select max(c.day) into leave_day from chain c where c.status='leave' and not c.needs_makeup
    and not exists(select 1 from chain m where m.original=c.id);
  entitlement:=case when leave_day is not null then r.fee else 0 end;
  eligible_day:=greatest((greatest(r.bill_month,date_trunc('month',coalesce(leave_day,r.day))::date)+interval '1 month')::date,
   date_trunc('month',now() at time zone 'Asia/Taipei')::date,
   (select max(eligible) from public.billing_adjustments where source=r.id));
  select coalesce(sum(amount),0) into previous from public.billing_adjustments where source=r.id;
  if entitlement<>previous then
   insert into public.billing_adjustments(owner,student,source,amount,eligible,actor)
   values(u,r.student,r.id,entitlement-previous,eligible_day,auth.uid());
   insert into public.billing_audit(owner,actor,action,entity,after_data)
   values(u,auth.uid(),'credit_entitlement',r.id,jsonb_build_object('previous',previous,'entitlement',entitlement));
  end if;
 end loop;
end $$;
revoke all on function studio_private.billing_sync(uuid) from public,anon,authenticated;

create function studio_private.billing_fingerprint(v uuid) returns text language sql set search_path='' as $$
 select md5(coalesce(jsonb_agg(jsonb_build_array(kind,label,amount,source_session,material,adjustment,snapshot)
 order by kind,label,source_session,material,adjustment)::text,'[]')) from public.billing_items where invoice=v;
$$;
revoke all on function studio_private.billing_fingerprint(uuid) from public,anon,authenticated;

create function studio_private.billing_prepare(v uuid,u uuid) returns void language plpgsql set search_path='' as $$
declare inv public.billing_invoices%rowtype;s public.students%rowtype;r record;budget bigint;take bigint;
begin
 select * into strict inv from public.billing_invoices where id=v and owner=u and state='draft' for update;
 select * into strict s from public.students where id=inv.student and owner=u;
 if s.active<>1 then raise exception '學生已封存，無法產生新學費袋';end if;
 -- Materialize the complete billing month through the existing scheduling engine.
 perform public.studio_action(jsonb_build_object('action','calendar','from',inv.month,'to',(inv.month+interval '1 month' - interval '1 day')::date));
 perform studio_private.billing_sync(u);
 delete from public.billing_items where invoice=v;
 update public.billing_invoices set student_name=s.name where id=v;
 insert into public.billing_items(invoice,owner,kind,label,amount,source_session,snapshot)
 select v,u,'tuition',c.day::text||' 預收課程',c.estimated_fee,c.id,
 jsonb_build_object('day',c.day,'original_day',c.original_day,'minute',c.minute,'duration',c.duration,'rate',c.estimated_fee,'slot',c.slot)
 from public.class_sessions c where c.owner=u and c.student=s.id and c.original is null
 and c.day>=inv.month and c.day<(inv.month+interval '1 month') and c.status<>'cancelled'
 and not exists(select 1 from public.billing_items i where i.source_session=c.id and i.posted);
 insert into public.billing_items(invoice,owner,kind,label,amount,material,snapshot)
 select v,u,'material',m.name,m.quantity::bigint*m.unit_price,m.id,to_jsonb(m)
 from public.student_material_purchases m where m.owner=u and m.student=s.id and not m.cancelled
 and not exists(select 1 from public.billing_items i where i.material=m.id and i.posted);
 select coalesce(sum(amount),0) into budget from public.billing_items where invoice=v;
 -- Reversals are applied first. Positive credit is capped, leaving the rest for later periods.
 for r in select a.*,a.amount+coalesce((select sum(i.amount) from public.billing_items i where i.adjustment=a.id and i.posted),0) remaining
  from public.billing_adjustments a where a.owner=u and a.student=s.id and a.eligible<=inv.month
  order by (a.amount>0),a.created,a.id loop
  take:=case when r.remaining<0 then r.remaining else least(r.remaining,budget) end;
  if take<>0 then
   insert into public.billing_items(invoice,owner,kind,label,amount,adjustment,snapshot)
   values(v,u,case when take>0 then 'credit' else 'reversal' end,
    case when take>0 then '請假未補課抵扣' else '撤銷請假抵扣調整' end,-take,r.id,to_jsonb(r));
   budget:=budget-take;
  end if;
 end loop;
end $$;
revoke all on function studio_private.billing_prepare(uuid,uuid) from public,anon,authenticated;

-- Keep all existing scheduling behavior behind its original authorization and owner lock.
alter function public.studio_action(jsonb) rename to pre_billing_action;
alter function public.pre_billing_action(jsonb) set schema studio_private;
revoke all on function studio_private.pre_billing_action(jsonb) from public,anon,authenticated;
create function public.studio_action(b jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.studio_owner();result jsonb;
begin
 if u is null then raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 result:=studio_private.pre_billing_action(b);
 perform studio_private.billing_sync(u);
 return result;
end $$;
revoke all on function public.studio_action(jsonb) from public,anon,authenticated;
grant execute on function public.studio_action(jsonb) to authenticated;

-- Privileged writes are kept in the private schema. Public facade is SECURITY INVOKER.
create function studio_private.billing_action(b jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare u uuid:=public.studio_owner();op text:=b->>'action';sid uuid;v uuid;mid uuid;period date;
 s public.students%rowtype;inv public.billing_invoices%rowtype;m public.student_material_purchases%rowtype;
 p public.billing_payments%rowtype;c public.class_sessions%rowtype;old jsonb;newrow jsonb;
 due bigint;paid bigint;amt bigint;fp text;result jsonb;
begin
 if u is null then raise exception '此帳號已停用或沒有工作室權限' using errcode='42501';end if;
 if b is null or octet_length(b::text)>8192 then raise exception '帳務要求格式錯誤';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if op='list' then
  return jsonb_build_object(
   'invoices',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('total',coalesce((select sum(amount) from public.billing_items where invoice=x.id),0),
    'paid',coalesce((select sum(amount) from public.billing_payments where invoice=x.id),0),'fingerprint',studio_private.billing_fingerprint(x.id)) order by x.month desc,x.created desc) from public.billing_invoices x where x.owner=u),'[]'::jsonb),
   'items',coalesce((select jsonb_agg(x) from public.billing_items x where x.owner=u),'[]'::jsonb),
   'materials',coalesce((select jsonb_agg(x order by x.purchased desc,x.created desc) from public.student_material_purchases x where x.owner=u),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(x order by x.created desc) from public.billing_payments x where x.owner=u),'[]'::jsonb),
   'adjustments',coalesce((select jsonb_agg(x) from public.billing_adjustments x where x.owner=u),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(x order by x.created desc,x.id) from public.billing_audit x where x.owner=u),'[]'::jsonb),
   'pending',coalesce((select jsonb_agg(x) from public.class_sessions x where x.owner=u and x.status='leave' and x.needs_makeup
    and not exists(select 1 from public.class_sessions m where m.original=x.id and m.status<>'cancelled')),'[]'::jsonb));
 end if;
 if op in('material','cancel_material','draft','confirm_no_makeup') then
  sid:=(b->>'student')::uuid;
  select * into s from public.students where id=sid and owner=u for update;
  if not found then raise exception '找不到學生' using errcode='42501';end if;
 end if;
 if op='material' then
  mid:=(b->>'id')::uuid;
  select * into m from public.student_material_purchases where id=mid;
  if found then
   if m.owner=u and m.student=sid and m.name=btrim(b->>'name') and m.purchased=(b->>'purchased')::date
    and m.quantity=(b->>'quantity')::int and m.unit_price=(b->>'unit_price')::int and m.notes=coalesce(b->>'notes','') then return jsonb_build_object('ok',true);end if;
   raise exception '教材識別碼已存在';
  end if;
  insert into public.student_material_purchases(id,owner,student,name,purchased,quantity,unit_price,notes,actor)
   values(mid,u,sid,btrim(b->>'name'),(b->>'purchased')::date,(b->>'quantity')::int,(b->>'unit_price')::int,coalesce(b->>'notes',''),auth.uid()) returning to_jsonb(student_material_purchases.*) into newrow;
  v:=mid;
 elsif op='cancel_material' then
  select * into m from public.student_material_purchases where id=(b->>'id')::uuid and owner=u and student=sid for update;
  if not found then raise exception '找不到教材';end if;
  if exists(select 1 from public.billing_items where material=m.id and posted) then raise exception '已列帳教材不可取消，請先處理原學費袋';end if;
  if length(btrim(coalesce(b->>'reason',''))) not between 1 and 500 then raise exception '請填寫原因';end if;
  old:=to_jsonb(m);v:=m.id;
  update public.student_material_purchases set cancelled=true where id=m.id returning to_jsonb(student_material_purchases.*) into newrow;
 elsif op='confirm_no_makeup' then
  select * into c from public.class_sessions where id=(b->>'session')::uuid and owner=u and student=sid for update;
  if not found or c.status<>'leave' or not c.needs_makeup or exists(select 1 from public.class_sessions where original=c.id and status<>'cancelled') then raise exception '請先取消已安排補課，並確認待補課狀態';end if;
  if length(btrim(coalesce(b->>'reason',''))) not between 1 and 500 then raise exception '請填寫原因';end if;
  old:=to_jsonb(c);v:=c.id;
  update public.class_sessions set needs_makeup=false where id=c.id returning to_jsonb(class_sessions.*) into newrow;
  insert into public.schedule_events(owner,session,action,before_data,after_data) values(u,c.id,op,old,newrow);
  perform studio_private.billing_sync(u);
 elsif op='draft' then
  period:=(b->>'month')::date;
  if period is null or extract(day from period)<>1 then raise exception '請指定收費月份首日';end if;
  insert into public.billing_invoices(owner,student,month,student_name,actor) values(u,sid,period,s.name,auth.uid())
   on conflict(owner,student,month) where state<>'void' do nothing;
  select * into inv from public.billing_invoices where owner=u and student=sid and month=period and state<>'void' for update;
  if inv.state<>'draft' then raise exception '此月份已正式開立';end if;
  v:=inv.id;old:=to_jsonb(inv);perform studio_private.billing_prepare(v,u);
  newrow:=jsonb_build_object('fingerprint',studio_private.billing_fingerprint(v));
 else
  v:=(b->>'invoice')::uuid;
  select * into inv from public.billing_invoices where id=v and owner=u for update;
  if not found then raise exception '找不到學費袋' using errcode='42501';end if;
  old:=to_jsonb(inv);
  select coalesce(sum(amount),0) into due from public.billing_items where invoice=v;
  select coalesce(sum(amount),0) into paid from public.billing_payments where invoice=v;
  if op='issue' then
   if inv.state='issued' then return jsonb_build_object('ok',true);end if;
   if inv.state<>'draft' then raise exception '只能開立草稿';end if;
   perform studio_private.billing_prepare(v,u);
   fp:=studio_private.billing_fingerprint(v);
   if fp is distinct from b->>'fingerprint' then raise exception '課表、教材或抵扣已變更，請重算草稿並確認後開立';end if;
   update public.billing_items set posted=true where invoice=v;
   update public.billing_invoices set state='issued',issued_at=now() where id=v;
   perform studio_private.billing_sync(u);
  elsif op='payment' then
   select * into p from public.billing_payments where id=(b->>'id')::uuid;
   if found then
    if p.owner=u and p.invoice=v and p.amount=(b->>'amount')::bigint and p.method=b->>'method' and p.day=(b->>'day')::date and p.notes=coalesce(b->>'notes','') and p.reverses is null then return jsonb_build_object('ok',true);end if;
    raise exception '收款識別碼已存在';
   end if;
   amt:=(b->>'amount')::bigint;
   if inv.state<>'issued' or amt is null or amt<=0 or amt>due-paid then raise exception '收款需大於零且不可超過未收餘額';end if;
   if (b->>'day')::date>(now() at time zone 'Asia/Taipei')::date then raise exception '不可登記未來收款';end if;
   insert into public.billing_payments(id,owner,invoice,amount,method,day,notes,actor)
    values((b->>'id')::uuid,u,v,amt,b->>'method',(b->>'day')::date,coalesce(b->>'notes',''),auth.uid()) returning to_jsonb(billing_payments.*) into newrow;
  elsif op='reverse_payment' then
   select * into p from public.billing_payments where id=(b->>'payment')::uuid and owner=u and invoice=v and reverses is null;
   if not found or inv.state<>'issued' then raise exception '找不到可沖銷收款';end if;
   if exists(select 1 from public.billing_payments where reverses=p.id) then return jsonb_build_object('ok',true);end if;
   if length(btrim(coalesce(b->>'reason',''))) not between 1 and 500 then raise exception '請填寫沖銷原因';end if;
   insert into public.billing_payments(id,owner,invoice,amount,method,day,notes,reverses,actor)
    values(gen_random_uuid(),u,v,-p.amount,p.method,(now() at time zone 'Asia/Taipei')::date,b->>'reason',p.id,auth.uid()) returning to_jsonb(billing_payments.*) into newrow;
  elsif op='void' then
   if inv.state='void' then return jsonb_build_object('ok',true);end if;
   if paid<>0 then raise exception '請先沖銷原收款，再作廢學費袋';end if;
   if length(btrim(coalesce(b->>'reason',''))) not between 1 and 500 then raise exception '請填寫作廢原因';end if;
   update public.billing_items set posted=false where invoice=v;
   update public.billing_invoices set state='void' where id=v;
   perform studio_private.billing_sync(u);
  else raise exception '不支援的帳務操作';end if;
 end if;
 insert into public.billing_audit(owner,actor,action,entity,before_data,after_data)
 values(u,auth.uid(),op,v,old,coalesce(newrow,(select to_jsonb(i) from public.billing_invoices i where id=v))||jsonb_build_object('reason',b->>'reason'));
 return jsonb_build_object('ok',true,'invoice',v);
end $$;
revoke all on function studio_private.billing_action(jsonb) from public,anon,authenticated;
-- Private endpoint is required by the invoker facade, and independently enforces studio_owner.
grant usage on schema studio_private to authenticated;
grant execute on function studio_private.billing_action(jsonb) to authenticated;
create function public.billing_action(b jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select studio_private.billing_action(b);
$$;
revoke all on function public.billing_action(jsonb) from public,anon,authenticated;
grant execute on function public.billing_action(jsonb) to authenticated;
commit;
