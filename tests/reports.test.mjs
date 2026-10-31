import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {buildReports,periodRange,csvText} from '../src/reportModel.ts';
test('reports: real ledger, read-only virtual schedule, cash dates, reversal and RLS',async t=>{
 const db=new PGlite();t.after(()=>db.close());const admin=randomUUID(),other=randomUUID();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'a942065123@gmail.com',now(),now()),($2,'teacher@example.com',now(),now())",[admin,other]);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 await db.exec(readFileSync(new URL('001_studio.sql',dir),'utf8'));await db.query('insert into public.teacher_access values($1)',[admin]);
 for(const file of readdirSync(dir).filter(f=>f!=='001_studio.sql'&&f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));
 const rows=async(q,p=[])=>(await db.query(q,p)).rows;
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const rpc=async b=>(await rows('select public.studio_action($1::jsonb) r',[JSON.stringify(b)]))[0].r;
 const bill=async b=>(await rows('select public.billing_action($1::jsonb) r',[JSON.stringify(b)]))[0].r;
 const snapshot=async(from='2025-11-01',to='2025-11-30')=>(await rows('select public.report_snapshot($1::date,$2::date) r',[from,to]))[0].r;
 const filters={from:'2025-11-01',to:'2025-11-30',student:'',status:'',materialBasis:'purchase'};
 await as(admin);await rpc({action:'student',name:'測試學生',fee:800});const sid=(await rows('select id from public.students'))[0].id;
 await rpc({action:'slot',student:sid,starts:'2025-11-01',ends:'2026-02-28',weekday:7,minute:540});
 const mid=randomUUID();await bill({action:'material',student:sid,id:mid,name:'教本',purchased:'2025-11-01',quantity:1,unit_price:350});
 const nov=(await bill({action:'draft',student:sid,month:'2025-11-01'})).invoice;
 async function issue(id){const d=await bill({action:'list'});await bill({action:'issue',invoice:id,fingerprint:d.invoices.find(v=>v.id===id).fingerprint})}
 await issue(nov);const p=randomUUID();await bill({action:'payment',invoice:nov,id:p,amount:2000,method:'cash',day:'2025-11-03'});
 await bill({action:'payment',invoice:nov,id:randomUUID(),amount:2350,method:'transfer',day:'2025-12-02'});
 const draft=(await bill({action:'draft',student:sid,month:'2025-12-01'})).invoice;
 await t.test('cohorts exclude drafts; cross-month cash differs from allocated balance',async()=>{
  const d=await snapshot(),r=buildReports(d,filters);
  assert.equal(r.summary.due,4350);assert.equal(r.summary.cash,2000);assert.equal(r.summary.allocated,4350);assert.equal(r.summary.outstanding,0);
  assert.equal(r.materials[0].state,'整張學費袋結清');
  const dec=buildReports(await snapshot('2025-12-01','2025-12-31'),{...filters,from:'2025-12-01',to:'2025-12-31'});
  assert.equal(dec.summary.due,0);assert.equal(dec.summary.cash,2350);assert.equal(dec.bags[0].id,draft);
  assert.equal(buildReports(d,{...filters,from:'2025-11-15',to:'2025-11-16'}).summary.due,4350);
  assert.equal(buildReports(d,{...filters,student:randomUUID()}).summary.due,0);
 });
 await t.test('report expands future occurrences without mutations or duplicate moved slots',async()=>{
  const first=(await rows("select id from public.class_sessions where day='2025-11-02'"))[0].id;
  await rpc({action:'move',student:sid,session:first,day:'2026-01-05',minute:600});
  const before=await rows('select count(*) n from public.class_sessions');
  const d=await snapshot('2025-11-01','2026-02-28');
  assert.equal(d.sessions.filter(c=>c.id===first).length,1);
  assert.equal(d.sessions.filter(c=>c.day==='2025-11-02').length,0);
  assert.ok(d.sessions.some(c=>c.id.includes(':')&&c.day==='2026-02-01'));
  assert.deepEqual(await rows('select count(*) n from public.class_sessions'),before);
  await db.exec('begin read only');await snapshot();await db.exec('rollback');
  assert.equal((await rows("select prosecdef from pg_proc where proname='report_snapshot'"))[0].prosecdef,false);
  await assert.rejects(snapshot('2025-12-01','2025-11-01'),/有效期間/);
 });
 await t.test('negative reversal is dated on correction, void does not erase historic cash',async()=>{
  await bill({action:'reverse_payment',invoice:nov,payment:p,reason:'輸入更正'});
  const d=await snapshot();const correction=d.payments.find(x=>x.reverses===p);
  assert.equal(Number(correction.amount),-2000);
  const current=buildReports(d,{...filters,from:correction.day,to:correction.day});
  assert.equal(current.summary.cash,-2000);
  assert.equal(buildReports(d,filters).summary.outstanding,2000);
  const second=d.payments.find(x=>!x.reverses&&x.id!==p);
  await bill({action:'reverse_payment',invoice:nov,payment:second.id,reason:'重新開立'});
  await bill({action:'void',invoice:nov,reason:'重開'});
  const r=buildReports(await snapshot(),filters);assert.equal(r.summary.due,0);assert.equal(r.summary.cash,2000);
  assert.equal(r.materials[0].state,'待代收');
 });
 await t.test('unknown, disabled and anonymous callers cannot invoke or select report data',async()=>{
  await as(other);await assert.rejects(snapshot(),/停用|權限/);
  await db.exec('reset role');await db.query("insert into auth.identities values($1,'google')",[other]);await as(other);
  await db.exec(`select public.account_action('{"action":"bootstrap"}')`);
  assert.ok((await snapshot()).invoices.length>0);
  await as(admin);await db.query('select public.account_action($1::jsonb)',[JSON.stringify({action:'set_status',user_id:other,disabled:true})]);
  await as(other);await assert.rejects(snapshot(),/停用|權限/);assert.equal((await rows('select * from public.billing_items')).length,0);
  await db.exec('reset role;set role anon');await assert.rejects(snapshot(),/permission denied/);
 });
});
test('report arithmetic: compensating credit, filters, materials, snapshots, periods and CSV',()=>{
 const d={generated_at:'2026-11-01',students:[{id:'s',name:'學生',active:0}],invoices:[{id:'v',student:'s',student_name:'歷史姓名',month:'2026-11-01',state:'issued'}],
  items:[{invoice:'v',amount:350,posted:true,material:'m'},{invoice:'v',amount:-100,posted:true,adjustment:'a'}],
  payments:[{id:'p',invoice:'v',day:'2026-11-05',amount:100,method:'cash',reverses:null}],
  adjustments:[{id:'a',student:'s',amount:800},{id:'b',student:'s',amount:-800}],
  materials:[{id:'m',student:'s',name:'教本',purchased:'2026-10-31',quantity:1,unit_price:350},{id:'u',student:'s',name:'待收',purchased:'2026-11-01',quantity:2,unit_price:100}],
  lessons:[{id:'l',student:'s',day:'2026-11-05',fee:800,session:'c',voided:null},{id:'x',student:'s',day:'2026-11-06',fee:900,voided:'now'}],
  sessions:[{id:'c',student:'s',day:'2026-11-05',original:'origin',slot:null,status:'signed'}],pending:[]};
 const f={from:'2026-11-01',to:'2026-11-30',student:'',status:'',materialBasis:'purchase'};
 let r=buildReports(d,f);assert.equal(r.summary.credit,0);assert.equal(r.summary.debit,100);assert.equal(r.course.taught,800);assert.equal(r.course.completed,1);assert.equal(r.course.makeup,1);
 assert.equal(r.materials.length,1);assert.equal(r.materials[0].state,'待代收');
 r=buildReports(d,{...f,materialBasis:'invoice'});assert.equal(r.materials.length,1);assert.equal(r.materials[0].state,'已列帳待結清');
 assert.equal(buildReports(d,{...f,status:'paid'}).bags.length,0);assert.equal(buildReports(d,{...f,status:'partial'}).bags.length,1);
 assert.deepEqual(periodRange('quarter','2026-11'),{from:'2026-10-01',to:'2026-12-31'});
 assert.deepEqual(periodRange('year','2024-11'),{from:'2024-01-01',to:'2024-12-31'});
 assert.deepEqual(periodRange('month','2024-02'),{from:'2024-02-01',to:'2024-02-29'});
 assert.ok(csvText([['=SUM(A1)',' x','"quoted"','\n@evil']]).includes("'\n@evil"));
});
