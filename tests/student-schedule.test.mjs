import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
const dir=new URL('../supabase/migrations/',import.meta.url);
test('student folder schedules: exact next class, atomic recurring edits and archive shutdown',async t=>{
 const db=new PGlite();t.after(()=>db.close());const admin=randomUUID(),member=randomUUID();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'a942065123@gmail.com',now(),now()),($2,'member@example.com',now(),now())",[admin,member]);
 await db.exec(readFileSync(new URL('001_studio.sql',dir),'utf8'));await db.query('insert into public.teacher_access values($1)',[admin]);
 for(const file of readdirSync(dir).filter(f=>f!=='001_studio.sql'&&f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const rpc=async b=>(await db.query('select public.studio_action($1::jsonb) result',[JSON.stringify(b)])).rows[0].result;
 const rows=async(q,args=[])=>(await db.query(q,args)).rows;
 const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const today=(await rows("select (now() at time zone 'Asia/Taipei')::date::text as today_date"))[0].today_date;
 const future=add(today,14),base=add(future,(8-new Date(future+'T00:00:00Z').getUTCDay())%7);
 await as(admin);await rpc({action:'student',name:'學生',fee:800});const sid=(await rows('select id from public.students'))[0].id;
 const sign='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',lid=randomUUID();await rpc({action:'lesson',student:sid,id:lid,day:'2020-01-01',actualFee:800,expectedFee:800,feeConfirmed:true,teacher:sign,learner:sign});
 const signed=(await rows('select * from public.lessons'))[0];
 await rpc({action:'slot',student:sid,starts:base,ends:add(base,1000),weekday:1,minute:540});
 let summary=await rpc({action:'student_schedule',student:sid});const slot=summary.slots[0];assert.equal(summary.next.day,base);assert.equal(summary.next.source,'regular');
 let cal=await rpc({action:'calendar',from:base,to:add(base,20)});const first=cal.sessions.find(c=>c.day===base),third=cal.sessions.find(c=>c.day===add(base,14));
 await t.test('single moves affect next class but never the weekly display',async()=>{
  await rpc({action:'move',student:sid,session:first.id,day:add(base,1),minute:600});
  summary=await rpc({action:'student_schedule',student:sid});assert.equal(summary.slots[0].weekday,1);assert.equal(summary.slots[0].minute,540);assert.equal(summary.next.day,add(base,1));assert.equal(summary.next.minute,600);assert.equal(summary.next.source,'moved');
 });
 await t.test('leave is skipped and makeup becomes the actual next class',async()=>{
  await rpc({action:'leave',student:sid,session:first.id,needsMakeup:true});summary=await rpc({action:'student_schedule',student:sid});assert.equal(summary.next.day,add(base,7));
  await rpc({action:'makeup',student:sid,session:first.id,day:add(base,2),minute:660});summary=await rpc({action:'student_schedule',student:sid});assert.equal(summary.next.day,add(base,2));assert.equal(summary.next.source,'makeup');
 });
 await t.test('conflicting permanent edits roll back template and generated classes together',async()=>{
  await rpc({action:'student',name:'另一位學生',fee:800});const other=(await rows('select id from public.students where id<>$1',[sid]))[0].id;
  await rpc({action:'slot',student:other,starts:base,ends:add(base,30),weekday:4,minute:840});
  const before=JSON.stringify(await rows('select * from public.weekly_slots order by id'))+JSON.stringify(await rows('select * from public.class_sessions order by id'));
  await assert.rejects(rpc({action:'replace_slot',student:sid,slot:slot.id,starts:add(base,7),weekday:4,minute:840,duration:60}),/重疊/);
  assert.equal(JSON.stringify(await rows('select * from public.weekly_slots order by id'))+JSON.stringify(await rows('select * from public.class_sessions order by id')),before);
  await rpc({action:'stop_slot',student:other,slot:(await rows('select id from public.weekly_slots where student=$1',[other]))[0].id,starts:base});
 });
 await t.test('permanent edit preserves history and single overrides, replacing untouched future recurrences',async()=>{
  await rpc({action:'move',student:sid,session:third.id,day:add(base,15),minute:720});
  await rpc({action:'replace_slot',student:sid,slot:slot.id,starts:add(base,7),weekday:4,minute:840,duration:60});
  assert.equal((await rows('select ends::text from public.weekly_slots where id=$1',[slot.id]))[0].ends,add(base,6));
  assert.equal((await rows('select status from public.class_sessions where id=$1',[third.id]))[0].status,'planned');
  assert.equal((await rows('select status from public.class_sessions where slot=$1 and original_day=$2',[slot.id,add(base,7)]))[0].status,'cancelled');
  assert.deepEqual((await rows('select * from public.lessons'))[0],signed);
  cal=await rpc({action:'calendar',from:add(base,7),to:add(base,13)});assert.ok(cal.sessions.some(c=>c.day===add(base,10)&&c.minute===840&&c.status==='planned'));
  summary=await rpc({action:'student_schedule',student:sid});assert.ok(summary.slots.some(w=>w.weekday===4&&w.minute===840));
 });
 await t.test('next class can be found beyond 62 days without creating calendar rows',async()=>{
  await rpc({action:'student',name:'遠期',fee:800});const far=(await rows("select id from public.students where name='遠期'"))[0].id;
  await rpc({action:'slot',student:far,starts:add(base,210),weekday:1,minute:500});
  const count=(await rows('select count(*)::int n from public.class_sessions'))[0].n;
  assert.equal((await rpc({action:'student_schedule',student:far})).next.day,add(base,210));assert.equal((await rows('select count(*)::int n from public.class_sessions'))[0].n,count);
 });
 await t.test('archive cancels future moves and makeups, stops pending requests, and restore does not revive them',async()=>{
  await rpc({action:'archive',student:sid});assert.equal((await rows("select count(*)::int n from public.class_sessions where student=$1 and status='planned' and day>=$2",[sid,today]))[0].n,0);
  assert.equal((await rows('select count(*)::int n from public.class_sessions where student=$1 and needs_makeup',[sid]))[0].n,0);
  assert.deepEqual(await rpc({action:'student_schedule',student:sid}),{slots:[],next:null});assert.deepEqual((await rows('select * from public.lessons'))[0],signed);
  await rpc({action:'archive',student:sid});assert.deepEqual(await rpc({action:'student_schedule',student:sid}),{slots:[],next:null});
  await assert.rejects(rpc({action:'replace_slot',student:sid,slot:slot.id,starts:today,weekday:1,minute:540,duration:60}),/生效日期/);
 });
 await t.test('new summary and edit commands respect suspended and anonymous access',async()=>{
  await db.exec('reset role');await db.query("insert into auth.identities values($1,'google')",[member]);await as(member);await db.exec("select public.account_action('{\"action\":\"bootstrap\"}')");
  await as(admin);await db.query("select public.account_action($1::jsonb)",[JSON.stringify({action:'set_status',user_id:member,disabled:true})]);await as(member);
  await assert.rejects(rpc({action:'student_schedule',student:sid}),/停用|權限/);await assert.rejects(rpc({action:'replace_slot',student:sid}),/停用|權限/);await assert.rejects(db.exec("select studio_private.scheduled_action('{}')"));
  await db.exec('reset role;set role anon');await assert.rejects(rpc({action:'student_schedule',student:sid}));
 });
});
