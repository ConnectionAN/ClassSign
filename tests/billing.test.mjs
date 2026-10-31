import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
test('billing: immutable snapshots, materials, receipts, carry forward and authorization',async t=>{
 const db=new PGlite();t.after(()=>db.close());const admin=randomUUID(),outsider=randomUUID();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'a942065123@gmail.com',now(),now()),($2,'outsider@example.com',now(),now())",[admin,outsider]);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 await db.exec(readFileSync(new URL('001_studio.sql',dir),'utf8'));await db.query('insert into public.teacher_access values($1)',[admin]);
 for(const file of readdirSync(dir).filter(f=>f!=='001_studio.sql'&&f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));
 const rows=async(q,p=[])=>(await db.query(q,p)).rows;
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const rpc=async b=>(await rows('select public.studio_action($1::jsonb) r',[JSON.stringify(b)]))[0].r;
 const bill=async b=>(await rows('select public.billing_action($1::jsonb) r',[JSON.stringify(b)]))[0].r;
 const list=()=>bill({action:'list'});
 const draft=async(student,month)=>(await bill({action:'draft',student,month})).invoice;
 const issue=async id=>{const v=(await list()).invoices.find(v=>v.id===id);await bill({action:'issue',invoice:id,fingerprint:v.fingerprint})};
 await as(admin);await rpc({action:'student',name:'帳務學生',fee:800});const sid=(await rows('select id from public.students'))[0].id;
 await rpc({action:'slot',student:sid,starts:'2026-11-01',ends:'2027-05-31',weekday:1,minute:540});
 const mid=randomUUID();const material={action:'material',student:sid,id:mid,name:'教本',purchased:'2026-10-31',quantity:2,unit_price:350,notes:'第二冊'};
 await bill(material);await bill(material);assert.equal((await list()).materials.length,1);
 const nov=await draft(sid,'2026-11-01');let d=await list();assert.equal(d.invoices[0].total,4700);assert.equal(d.items.filter(i=>i.kind==='tuition').length,5);
 await t.test('changed draft cannot issue until reviewed; draft does not reserve material',async()=>{
  const old=d.invoices[0].fingerprint;
  await bill({action:'material',student:sid,id:randomUUID(),name:'練習簿',purchased:'2026-11-01',quantity:1,unit_price:100});
  await assert.rejects(bill({action:'issue',invoice:nov,fingerprint:old}),/重算/);
  await draft(sid,'2026-11-01');await issue(nov);await issue(nov);
  await assert.rejects(draft(sid,'2026-11-01'),/已正式/);
  await assert.rejects(bill({action:'cancel_material',student:sid,id:mid,reason:'測試'}),/已列帳/);
  const dec=await draft(sid,'2026-12-01');d=await list();assert.equal(d.items.filter(i=>i.invoice===dec&&i.kind==='material').length,0);
 });
 await t.test('issued bill survives rate edits and cross month moves; makeup is free',async()=>{
  d=await list();const before=JSON.stringify(d.items.filter(i=>i.invoice===nov));
  const source=(await rows("select * from public.class_sessions where day='2026-11-02'"))[0];
  await rpc({action:'fee',student:sid,fee:900});
  await rpc({action:'move',student:sid,session:source.id,day:'2026-12-01',minute:600});
  await draft(sid,'2026-12-01');d=await list();assert.equal(JSON.stringify(d.items.filter(i=>i.invoice===nov)),before);
  assert.equal(d.items.filter(i=>i.posted&&i.source_session===source.id).length,1);
  assert.equal(d.items.filter(i=>!i.posted&&i.source_session===source.id).length,0);
  await rpc({action:'leave',student:sid,session:source.id,needsMakeup:true});
  await rpc({action:'makeup',student:sid,session:source.id,day:'2026-12-02',minute:600});
  await draft(sid,'2026-12-01');d=await list();assert.equal(d.adjustments.length,0);
  const makeup=(await rows('select * from public.class_sessions where original=$1',[source.id]))[0];
  await rpc({action:'leave',student:sid,session:makeup.id,needsMakeup:false});
  d=await list();assert.equal(d.adjustments.reduce((n,a)=>n+Number(a.amount),0),800);
  // Moved December source becomes eligible in January, never a past period.
 });
 await t.test('receipt retries are idempotent; partial, overpayment, reversal and void are safe',async()=>{
  const p={action:'payment',invoice:nov,id:randomUUID(),amount:2000,method:'cash',day:'2020-01-01',notes:'訂金'};
  await bill(p);await bill(p);d=await list();assert.equal(d.invoices.find(v=>v.id===nov).paid,2000);
  await assert.rejects(bill({...p,id:randomUUID(),amount:10000}),/餘額/);
  await assert.rejects(bill({action:'void',invoice:nov,reason:'測試'}),/先沖銷/);
  await bill({action:'reverse_payment',invoice:nov,payment:p.id,reason:'輸入錯誤'});await bill({action:'reverse_payment',invoice:nov,payment:p.id,reason:'重試'});
  assert.equal((await list()).payments.length,2);
  const full={...p,id:randomUUID(),amount:4800,method:'transfer'};await bill(full);
  d=await list();assert.equal(d.invoices.find(v=>v.id===nov).paid,4800);
  await assert.rejects(db.exec('delete from public.billing_payments'),/permission denied/);
 });
 await t.test('credit applies next available period, caps at zero and restoration adds a compensating debit',async()=>{
  const dec=(await list()).invoices.find(v=>v.month==='2026-12-01').id;
  await draft(sid,'2026-12-01');await issue(dec);d=await list();assert.equal(d.invoices.find(v=>v.id===dec).total,3600);
  const jan=await draft(sid,'2027-01-01');d=await list();assert.equal(d.invoices.find(v=>v.id===jan).total,2800);await issue(jan);
  const makeup=(await rows("select * from public.class_sessions where original is not null"))[0];
  await rpc({action:'restore',student:sid,session:makeup.id});
  d=await list();assert.equal(d.adjustments.reduce((n,a)=>n+Number(a.amount),0),0);

  // Large credit from November's remaining four lessons carries through an empty month.
  const sources=await rows("select * from public.class_sessions where day between '2026-11-01' and '2026-11-30' and original is null");
  for(const c of sources)await rpc({action:'leave',student:sid,session:c.id,needsMakeup:false});
  await rpc({action:'calendar',from:'2027-02-01',to:'2027-02-28'});
  for(const c of await rows("select * from public.class_sessions where day between '2027-02-01' and '2027-02-28' and status='planned'"))await rpc({action:'cancel',student:sid,session:c.id});
  const feb=await draft(sid,'2027-02-01');d=await list();assert.equal(d.invoices.find(v=>v.id===feb).total,0);await issue(feb);
  d=await list();assert.equal(d.items.filter(i=>i.invoice===feb&&i.kind==='reversal').reduce((n,i)=>n+Number(i.amount),0),800);
  assert.equal(d.adjustments.reduce((n,a)=>n+Number(a.amount),0)+d.items.filter(i=>i.posted&&i.adjustment).reduce((n,i)=>n+Number(i.amount),0),2400);
  const mar=await draft(sid,'2027-03-01');d=await list();assert.ok(d.invoices.find(v=>v.id===mar).total>=0);
 });
 await t.test('void releases material and allocations but preserves snapshots and audit',async()=>{
  const jan=(await list()).invoices.find(v=>v.month==='2027-01-01');
  const before=(await list()).items.filter(i=>i.invoice===jan.id).map(i=>({...i,posted:false}));
  await bill({action:'void',invoice:jan.id,reason:'重開'});d=await list();assert.deepEqual(d.items.filter(i=>i.invoice===jan.id),before);
  assert.ok(d.audit.some(a=>a.action==='void'&&a.entity===jan.id&&a.actor===admin));
  await assert.rejects(bill({action:'payment',invoice:jan.id,id:randomUUID(),amount:1,method:'cash',day:'2020-01-01'}));
 });
 await t.test('pending makeup confirmation and unbilled material cancellation retain reasons',async()=>{
  const id=randomUUID();await bill({...material,id,name:'更正教材'});
  await bill({action:'cancel_material',student:sid,id,reason:'買錯版本'});
  assert.equal((await list()).materials.find(m=>m.id===id).cancelled,true);
  const mar=await draft(sid,'2027-03-01');await issue(mar);
  const c=(await rows("select * from public.class_sessions where day='2027-03-01' and original is null"))[0];
  await rpc({action:'leave',student:sid,session:c.id,needsMakeup:true});
  await assert.rejects(bill({action:'confirm_no_makeup',student:sid,session:c.id,reason:''}),/原因/);
  await bill({action:'confirm_no_makeup',student:sid,session:c.id,reason:'家長確認不再補課'});
  const after=await list();assert.ok(after.adjustments.some(a=>a.source===c.id&&Number(a.amount)===900));
  assert.ok(after.audit.some(a=>a.action==='confirm_no_makeup'&&a.after_data.reason==='家長確認不再補課'));
 });
 await t.test('legacy zero schedule rates use student fee; custom charges survive recalculation and lock on issue',async()=>{
  await rpc({action:'student',name:'舊課表零元回歸',fee:700});const student=(await rows("select id from public.students where name='舊課表零元回歸'"))[0].id;
  await rpc({action:'slot',student,starts:'2030-11-01',ends:'2030-11-30',weekday:5,minute:1000});
  await db.exec('reset role');await db.query('update public.weekly_slots set estimated_fee=0 where student=$1',[student]);await as(admin);
  const invoice=await draft(student,'2030-11-01');let state=await list();const tuition=state.items.filter(i=>i.invoice===invoice&&i.kind==='tuition');
  assert.ok(tuition.length>0);assert.ok(tuition.every(i=>Number(i.amount)===700&&i.snapshot.rate_source==='student_current'));
  const base=tuition.length*700,id=randomUUID();const custom={action:'custom_add',invoice,id,name:'10月未列帳學費',amount:1200,notes:'家長確認補登'};
  await bill(custom);await bill(custom);await draft(student,'2030-11-01');state=await list();
  assert.equal(state.items.filter(i=>i.invoice===invoice&&i.kind==='custom').length,1);assert.equal(state.invoices.find(v=>v.id===invoice).total,base+1200);
  await assert.rejects(bill({...custom,id:randomUUID(),amount:-1}),/正整數/);
  await bill({action:'custom_remove',invoice,id});await bill({action:'custom_remove',invoice,id});
  await rpc({action:'fee',student,fee:0});await draft(student,'2030-11-01');state=await list();assert.equal(state.invoices.find(v=>v.id===invoice).total,0);
  await rpc({action:'fee',student,fee:850});await draft(student,'2030-11-01');await bill({...custom,id:randomUUID(),name:'活動費',amount:900});
  await issue(invoice);state=await list();const frozen=state.items.filter(i=>i.invoice===invoice);assert.equal(state.invoices.find(v=>v.id===invoice).total,tuition.length*850+900);
  await rpc({action:'fee',student,fee:999});assert.deepEqual((await list()).items.filter(i=>i.invoice===invoice),frozen);
  await assert.rejects(bill({...custom,id:randomUUID()}),/只有草稿/);await assert.rejects(bill({action:'custom_remove',invoice,id:frozen.find(i=>i.kind==='custom').id}),/只有草稿/);
  assert.ok(state.audit.some(a=>a.action==='custom_add'&&a.after_data.label==='活動費'&&a.actor===admin));
 });
 await t.test('unknown, suspended and anonymous callers cannot read or change billing',async()=>{
  await as(outsider);await assert.rejects(list(),/停用|權限/);assert.equal((await rows('select * from public.billing_invoices')).length,0);
  await db.exec('reset role');await db.query("insert into auth.identities values($1,'google')",[outsider]);await as(outsider);await db.exec("select public.account_action('{\"action\":\"bootstrap\"}')");
  await as(admin);await db.query('select public.account_action($1::jsonb)',[JSON.stringify({action:'set_status',user_id:outsider,disabled:true})]);
  await as(outsider);await assert.rejects(list(),/停用|權限/);await assert.rejects(bill({action:'draft',student:sid,month:'2027-04-01'}));
  await assert.rejects(db.exec("select studio_private.pre_billing_action('{}')"),/permission denied/);
  await db.exec('reset role;set role anon');await assert.rejects(list(),/permission denied/);
 });
});
