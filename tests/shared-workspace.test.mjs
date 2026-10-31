import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
const dir=new URL('../supabase/migrations/',import.meta.url);
const file=readdirSync(dir).find(f=>f.endsWith('_shared_workspace.sql'));
const sign='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
async function setup(){
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<file).sort())await db.exec(readFileSync(new URL(f,dir),'utf8'));
 return db;
}
test('shared studio: approved accounts manage the same immutable history and schedule',async t=>{
 const db=await setup();t.after(()=>db.close());
 const a=randomUUID(),b=randomUUID(),outsider=randomUUID();
 await db.query('insert into auth.users values($1),($2),($3)',[a,b,outsider]);
 await db.query('insert into public.teacher_access values($1),($2)',[a,b]);
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 const rpc=async b=>(await db.query('select public.studio_action($1::jsonb) result',[JSON.stringify(b)])).rows[0].result;
 const rows=async q=>(await db.query(q)).rows;
 await as(a);await rpc({action:'student',name:'原老師學生',fee:1000});
 const originalStudent=(await rows('select * from public.students'))[0];
 const oldId=randomUUID();await rpc({action:'lesson',student:originalStudent.id,id:oldId,day:'2020-01-01',expectedFee:1000,feeConfirmed:true,teacher:sign,learner:sign});
 const originalLesson=(await rows('select * from public.lessons'))[0];
 await db.exec('reset role');await db.exec(readFileSync(new URL(file,dir),'utf8'));
 await as(a);
 await t.test('migration preserves existing student, fee and signed values',async()=>{
  assert.deepEqual((await rows('select * from public.students'))[0],originalStudent);
  assert.deepEqual((await rows('select * from public.lessons'))[0],originalLesson);
  assert.equal((await rows('select public.studio_owner() owner'))[0].owner,a);
 });
 let sid,session,makeup;
 await t.test('second approved account reads originals and creates shared students',async()=>{
  await as(b);assert.equal((await rows('select user_id from public.teacher_access')).length,1);
  assert.equal((await rows('select * from public.students'))[0].id,originalStudent.id);
  assert.equal((await rpc({action:'detail',student:originalStudent.id,id:oldId})).lesson.teacher,sign);
  await rpc({action:'student',name:'第二帳號新增',fee:800});
  sid=(await rows("select id from public.students where name='第二帳號新增'"))[0].id;
  assert.equal((await rows("select owner from public.students where name='第二帳號新增'"))[0].owner,a);
  await as(a);assert.equal((await rows('select * from public.students')).length,2);
 });
 await t.test('both accounts share recurring schedules, conflict checks, leave and makeup',async()=>{
  await as(b);await rpc({action:'slot',student:sid,starts:'2020-01-06',ends:'2020-01-27',weekday:1,minute:540});
  await as(a);const calendar=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'});
  session=calendar.sessions.find(c=>c.student===sid);assert.ok(session);
  await assert.rejects(rpc({action:'slot',student:originalStudent.id,starts:'2020-01-06',ends:'2020-01-27',weekday:1,minute:570}),/重疊/);
  await rpc({action:'move',student:sid,session:session.id,day:'2020-01-07',minute:600});
  await as(b);await rpc({action:'leave',student:sid,session:session.id,needsMakeup:true});
  await as(a);const pending=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'});assert.ok(pending.pending.some(c=>c.id===session.id));
  await rpc({action:'makeup',student:sid,session:session.id,day:'2020-01-08',minute:540});
  const d=await rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'});makeup=d.makeups.find(c=>c.original===session.id);assert.ok(makeup);
 });
 await t.test('shared signing, fee adjustment and void preserve snapshot and record the actor',async()=>{
  await as(b);await rpc({action:'fee',student:sid,fee:900});
  const id=randomUUID(),body={action:'lesson',student:sid,session:makeup.id,id,day:makeup.day,actualFee:800,feeConfirmed:true,teacher:sign,learner:sign};
  await rpc(body);await rpc(body);
  assert.equal((await rows("select actor from public.schedule_events where action='sign'"))[0].actor,b);
  await as(a);assert.equal((await rpc({action:'detail',student:sid,id})).lesson.fee,800);
  await assert.rejects(rpc({action:'move',student:sid,session:makeup.id,day:'2020-01-09',minute:540}),/已簽/);
  await rpc({action:'void',student:sid,id,reason:'共用帳號更正'});
  assert.equal((await rows("select actor from public.schedule_events where action='void'"))[0].actor,a);
  assert.equal((await rpc({action:'detail',student:sid,id})).lesson.teacher,sign);
  await as(b);await rpc({action:'archive',student:sid});assert.equal((await rows('select active from public.students where id=\''+sid+'\''))[0].active,0);
  await as(a);await rpc({action:'archive',student:sid});
 });
 await t.test('direct writes and unapproved/anonymous access stay denied',async()=>{
  await assert.rejects(db.exec('update public.lessons set fee=1'));
  await assert.rejects(db.exec('update studio_private.workspace_settings set singleton=false'));
  await assert.rejects(db.exec('insert into public.teacher_access select auth.uid()'));
  await assert.rejects(db.exec("select studio_private.studio_action('{}')"));
  await as(outsider);
  for(const table of ['students','lessons','fee_changes','weekly_slots','class_sessions','schedule_events'])assert.equal((await rows('select * from public.'+table)).length,0);
  assert.equal((await rows('select public.studio_owner() owner'))[0].owner,null);
  await assert.rejects(rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'}),/老師權限/);
  await assert.rejects(rpc({action:'fee',student:sid,fee:1}),/老師權限/);
  await db.exec('reset role;set role anon');await assert.rejects(db.exec('select public.studio_owner()'));await assert.rejects(rpc({action:'student',name:'x',fee:1}));
 });
 await t.test('revoking an account removes access without changing the shared data owner',async()=>{
  await db.exec('reset role');await db.query('delete from public.teacher_access where user_id=$1',[a]);
  await as(a);assert.equal((await rows('select * from public.students')).length,0);
  await as(b);assert.equal((await rows('select public.studio_owner() owner'))[0].owner,a);
  await rpc({action:'fee',student:sid,fee:950});await rpc({action:'student',name:'原帳號撤權後',fee:500});
  await db.exec('reset role');await db.query('delete from public.teacher_access where user_id=$1',[b]);await as(b);
  assert.equal((await rows('select * from public.students')).length,0);
  await assert.rejects(rpc({action:'calendar',from:'2020-01-06',to:'2020-01-12'}),/老師權限/);
 });
});
test('empty installations initialize a stable studio on first account approval',async t=>{
 const db=await setup();t.after(()=>db.close());
 await db.exec(readFileSync(new URL(file,dir),'utf8'));
 const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
 await db.query('insert into public.teacher_access values($1)',[a]);await db.query('insert into public.teacher_access values($1)',[b]);
 assert.equal((await db.query('select owner from studio_private.workspace_settings')).rows[0].owner,a);
});
