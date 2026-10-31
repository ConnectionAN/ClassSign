import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
test('PostgreSQL migration and RPC: access, snapshots, retry, immutable records',async()=>{
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await db.exec(readFileSync(new URL('../supabase/migrations/001_studio.sql',import.meta.url),'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',lesson='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into public.teacher_access values($1)',[a]);
 async function as(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
 async function rpc(b){return (await db.query('select public.studio_action($1::jsonb) result',[JSON.stringify(b)])).rows[0].result}
 await as(a);await rpc({action:'student',name:'測試學生',fee:1000});
 const sid=(await db.query('select id from public.students')).rows[0].id;
 const sign='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
 const first={action:'lesson',student:sid,id:lesson,day:'2020-01-01',expectedFee:1000,teacher:sign,learner:sign};
 await rpc(first);await rpc(first);
 assert.equal((await db.query('select count(*)::int n from public.lessons')).rows[0].n,1);
 await assert.rejects(db.query('update public.lessons set fee=1'));
 await rpc({action:'fee',student:sid,fee:1200});
 await rpc({...first,id:'44444444-4444-4444-8444-444444444444',expectedFee:1200});
 assert.equal((await db.query('select sum(fee)::int total from public.lessons')).rows[0].total,2200);
 await assert.rejects(rpc({...first,id:'55555555-5555-4555-8555-555555555555'}),/學費已異動/);
 await assert.rejects(rpc({...first,teacher:sign+'changed'}),/識別碼/);
 await rpc({action:'void',student:sid,id:lesson,reason:'測試作廢'});
 assert.equal((await db.query('select sum(fee)::int total from public.lessons where voided is null')).rows[0].total,1200);
 await as(b);assert.equal((await db.query('select * from public.students')).rows.length,0);
 await assert.rejects(rpc({action:'detail',student:sid,id:lesson}),/老師權限/);
 await db.exec('reset role');await db.query('insert into public.teacher_access values($1)',[b]);await as(b);
 await assert.rejects(rpc({action:'fee',student:sid,fee:1}),/找不到學生/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.lessons'));await assert.rejects(rpc(first));
 await db.close();
});

