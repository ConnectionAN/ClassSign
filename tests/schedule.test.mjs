import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

test('incremental schedule migration: lifecycle, billing, ownership, future conflicts',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 const migrations=new URL('../supabase/migrations/',import.meta.url);
 await db.exec(readFileSync(new URL('001_studio.sql',migrations),'utf8'));
 const a=randomUUID(),b=randomUUID(),unapproved=randomUUID();
 await db.query('insert into auth.users values($1),($2),($3)',[a,b,unapproved]);
 await db.query('insert into public.teacher_access values($1),($2)',[a,b]);
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const rpc=async body=>(await db.query('select public.studio_action($1::jsonb) result',[JSON.stringify(body)])).rows[0].result;
 const rows=async sql=>(await db.query(sql)).rows;
 await as(a);await rpc({action:'student',name:'原有學生',fee:1000});
 const sid=(await rows('select id from public.students'))[0].id;
 const sign='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
 const existing={action:'lesson',student:sid,id:randomUUID(),day:'2020-01-01',expectedFee:1000,teacher:sign,learner:sign};
 await rpc(existing);
 await db.exec('reset role');
 // Keep this suite on the original per-owner scheduling stage. Shared access has its own migration suite.
 for(const file of readdirSync(migrations).filter(f=>f.endsWith('_weekly_schedule.sql')).sort())await db.exec(readFileSync(new URL(file,migrations),'utf8'));
 await as(a);
 await t.test('001 records survive incremental migration',async()=>{
  assert.equal((await rows('select count(*)::int n from public.students'))[0].n,1);
  assert.equal((await rows('select fee,session from public.lessons'))[0].fee,1000);
  assert.equal((await rows('select session from public.lessons'))[0].session,null);
 });
 const slot={action:'slot',student:sid,starts:'2020-01-06',ends:'2020-02-24',weekday:1,minute:540,duration:60};
 let first,original,makeup,slotId;
 await t.test('weekly expansion is idempotent, default duration, no billing',async()=>{
  await rpc({...slot,duration:undefined});
  let d=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'});
  first=d.sessions[0];slotId=d.slots[0].id;assert.equal(first.duration,60);assert.equal(first.estimated_fee,1000);
  d=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'});assert.equal(d.sessions.length,1);
  assert.equal((await rows('select count(*)::int n from public.lessons'))[0].n,1);
  await assert.rejects(rpc({action:'calendar',from:'2020-01-01',to:'2021-01-01'}),/62/);
 });
 await t.test('overlaps include unmaterialized recurrences and allow adjacent lessons',async()=>{
  await assert.rejects(rpc({...slot,minute:570}),/重疊/);
  await rpc({...slot,minute:600});
  await assert.rejects(rpc({action:'move',student:sid,session:first.id,day:'2020-02-03',minute:540,duration:60}),/重疊/);
  await assert.rejects(rpc({...slot,minute:1430}),/格式/);
 });
 await t.test('single move keeps original date and history, does not change next week',async()=>{
  await rpc({action:'move',student:sid,session:first.id,day:'2020-01-07',minute:660,duration:90});
  const d=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-19'});
  const moved=d.sessions.find(c=>c.id===first.id);assert.equal(moved.original_day,'2020-01-06');assert.equal(moved.day,'2020-01-07');
  assert.ok(d.events.some(e=>e.action==='move'&&e.before_data.day==='2020-01-06'));
  original=d.sessions.find(c=>c.day==='2020-01-13'&&c.minute===540);assert.ok(original);
 });
 await t.test('leave requires an explicit choice; only needed leave enters pending list',async()=>{
  await assert.rejects(rpc({action:'leave',student:sid,session:first.id}),/選擇/);
  await rpc({action:'leave',student:sid,session:first.id,needsMakeup:false});
  await rpc({action:'leave',student:sid,session:original.id,needsMakeup:true});
  const d=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-19'});
  assert.deepEqual(d.pending.map(c=>c.id),[original.id]);
 });
 await t.test('makeup links original, preserves estimate after fee change, cannot duplicate',async()=>{
  await rpc({action:'fee',student:sid,fee:1200});
  await rpc({action:'makeup',student:sid,session:original.id,day:'2020-01-15',minute:540});
  const d=await rpc({action:'calendar',from:'2020-01-13',to:'2020-01-19'});
  makeup=d.sessions.find(c=>c.original===original.id);assert.equal(makeup.estimated_fee,1000);assert.equal(d.pending.length,0);
  assert.ok(d.makeups.some(c=>c.id===makeup.id));
  assert.ok(d.origins.some(c=>c.id===original.id));
  await assert.rejects(rpc({action:'makeup',student:sid,session:original.id,day:'2020-01-16',minute:540}),/待補課/);
  await assert.rejects(rpc({action:'restore',student:sid,session:original.id}),/取消關聯補課/);
 });
 const attendance={action:'lesson',student:sid,session:null,id:randomUUID(),day:'2020-01-15',actualFee:900,expectedFee:1200,feeConfirmed:true,teacher:sign,learner:sign};
 await t.test('scheduled double sign checks fee, state and day; retries count only once',async()=>{
  attendance.session=makeup.id;
  await assert.rejects(rpc({...attendance,feeConfirmed:false}),/實際學費/);
  await assert.rejects(rpc({...attendance,day:'2020-01-16'}),/已異動/);
  await rpc(attendance);await rpc(attendance);
  const calendar=await rpc({action:'calendar',from:'2020-01-15',to:'2020-01-15'});
  assert.equal(calendar.makeups.length,0);
  assert.equal((await rows('select sum(fee)::int n from public.lessons where voided is null'))[0].n,1900);
  await assert.rejects(rpc({...attendance,id:randomUUID()}),/已異動/);
  await assert.rejects(rpc({action:'move',student:sid,session:makeup.id,day:'2020-01-17',minute:600}),/已簽/);
  await assert.rejects(db.query('update public.lessons set fee=1'));
  await assert.rejects(db.query('update public.class_sessions set minute=1'));
 });
 await t.test('void preserves signed record and allows a new signature linked to the same class',async()=>{
  await rpc({action:'void',student:sid,id:attendance.id,reason:'更正學費'});
  await rpc({...attendance,id:randomUUID(),actualFee:950});
  assert.equal((await rows('select sum(fee)::int n from public.lessons where voided is null'))[0].n,1950);
  assert.equal((await rows('select count(*)::int n from public.lessons'))[0].n,3);
 });
 await t.test('manual backfill requires fee confirmation and saves actual fee',async()=>{
  const manual={...attendance,id:randomUUID(),session:null,actualFee:800};
  await assert.rejects(rpc({...manual,feeConfirmed:false}),/補登/);await rpc(manual);
  await assert.rejects(rpc({...manual,id:randomUUID(),expectedFee:1000}),/學費已異動/);
 });
 await t.test('cancelled makeup re-enters pending; restore detects conflicts',async()=>{
  await rpc({action:'restore',student:sid,session:first.id});
  await rpc({action:'leave',student:sid,session:first.id,needsMakeup:true});
  await rpc({action:'makeup',student:sid,session:first.id,day:'2020-01-21',minute:540});
  let d=await rpc({action:'calendar',from:'2020-01-20',to:'2020-01-26'});const m=d.sessions.find(c=>c.original===first.id);
  await rpc({action:'cancel',student:sid,session:m.id});
  d=await rpc({action:'calendar',from:'2020-01-20',to:'2020-01-26'});assert.ok(d.pending.some(c=>c.id===first.id));
  await rpc({...slot,starts:'2020-01-21',ends:'2020-01-21',weekday:2});
  await assert.rejects(rpc({action:'restore',student:sid,session:m.id}),/重疊/);
  await rpc({action:'restore',student:sid,session:first.id});
  await assert.rejects(rpc({action:'restore',student:sid,session:m.id,day:'2020-01-22'}),/原課已撤回/);
 });
 await t.test('future stop and archive preserve history; restoring student does not restart slots',async()=>{
  await assert.rejects(rpc({action:'stop_slot',student:sid,slot:slotId,starts:'2020-01-06'}),/停止日期/);
  const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
  const wd=(new Date(date+'T00:00:00Z').getUTCDay()+6)%7+1;
  await rpc({...slot,starts:date,ends:null,minute:900,weekday:wd});
  let todayData=await rpc({action:'calendar',from:date,to:date});
  const todaySession=todayData.sessions.find(c=>c.minute===900),todaySlot=todayData.slots.find(c=>c.minute===900);
  assert.ok(todaySession);
  const signedToday={...attendance,id:randomUUID(),session:todaySession.id,day:date,actualFee:1200};
  await rpc(signedToday);
  await assert.rejects(rpc({action:'stop_slot',student:sid,slot:todaySlot.id,starts:date}),/已簽/);
  await rpc({action:'void',student:sid,id:signedToday.id,reason:'測試作廢'});
  await rpc({action:'stop_slot',student:sid,slot:todaySlot.id,starts:date});
  todayData=await rpc({action:'calendar',from:date,to:date});
  assert.equal(todayData.sessions.find(c=>c.id===todaySession.id).status,'cancelled');
  // An additional active future slot must also be stopped by archive.
  await rpc({...slot,starts:date,ends:null,minute:1000,weekday:wd});
  await rpc({action:'calendar',from:date,to:date});
  await rpc({action:'archive',student:sid});
  await assert.rejects(rpc({...slot,starts:date}),/封存/);
  await rpc({action:'archive',student:sid});
  const d=await rpc({action:'calendar',from:date,to:date});
  assert.equal(d.sessions.filter(c=>c.status==='planned').length,0);
  assert.equal((await rows('select count(*)::int n from public.lessons'))[0].n,5);
 });
 await t.test('other teacher, unapproved user, anonymous and private RPC are isolated',async()=>{
  await as(b);
  for(const table of ['weekly_slots','class_sessions','schedule_events','lessons'])assert.equal((await rows('select * from public.'+table)).length,0);
  await assert.rejects(rpc({action:'move',student:sid,session:makeup.id}),/找不到學生/);
  await assert.rejects(db.query("select studio_private.studio_action('{}')"));
  await as(unapproved);await assert.rejects(rpc({action:'calendar',from:'2020-01-01',to:'2020-01-02'}),/老師權限/);
  await db.exec('reset role;set role anon');await assert.rejects(rpc({action:'calendar'}));
 });
});
