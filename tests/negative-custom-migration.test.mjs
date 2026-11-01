import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
test('negative custom migration preserves historical rows, policies and function privileges',async t=>{
 const db=new PGlite();t.after(()=>db.close());const admin=randomUUID(),outsider=randomUUID();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.query("insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,'a942065123@gmail.com',now(),now()),($2,'outsider@example.com',now(),now())",[admin,outsider]);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 await db.exec(readFileSync(new URL('001_studio.sql',dir),'utf8'));await db.query('insert into public.teacher_access values($1)',[admin]);
 for(const file of readdirSync(dir).filter(f=>f!=='001_studio.sql'&&f.endsWith('.sql')&&!f.endsWith('_negative_custom_fees.sql')).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));

 const rows=async(q,p=[])=>(await db.query(q,p)).rows;
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);await db.exec('set role authenticated');
 const rpc=async b=>(await rows('select public.studio_action($1::jsonb) r',[JSON.stringify(b)]))[0].r;
 const bill=async b=>(await rows('select public.billing_action($1::jsonb) r',[JSON.stringify(b)]))[0].r;
 await rpc({action:'student',name:'遷移前已收費學生',fee:800});const student=(await rows('select id from public.students'))[0].id;
 const invoice=(await bill({action:'draft',student,month:'2026-11-01'})).invoice;
 await bill({action:'custom_add',invoice,id:randomUUID(),name:'舊費用',amount:3200});
 const inv=(await bill({action:'list'})).invoices[0];await bill({action:'issue',invoice,fingerprint:inv.fingerprint});
 await bill({action:'payment',invoice,id:randomUUID(),amount:3200,method:'cash',day:'2020-01-01'});
 await db.exec('reset role');
 const tables=['students','billing_invoices','billing_items','billing_payments','billing_adjustments','billing_audit'];
 async function snapshot(){return Promise.all(tables.map(table=>rows(`select to_jsonb(t) r from public.${table} t order by id`)))}
 const history=await snapshot();
 const policySQL='select * from pg_policies order by schemaname,tablename,policyname';const policies=await rows(policySQL);
 const functionSQL="select n.nspname,p.proname,p.oid::text,p.prosecdef,p.proconfig,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','studio_private') order by p.oid";
 const privileges=await rows(functionSQL);
 const migration=readdirSync(dir).find(f=>f.endsWith('_negative_custom_fees.sql'));await db.exec(readFileSync(new URL(migration,dir),'utf8'));
 assert.deepEqual(await snapshot(),history);assert.deepEqual(await rows(policySQL),policies);assert.deepEqual(await rows(functionSQL),privileges);
 assert.equal((await rows("select prosecdef from pg_proc where oid='public.billing_action(jsonb)'::regprocedure"))[0].prosecdef,false);
});
