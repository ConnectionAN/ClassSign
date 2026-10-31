// Read-only production export is kept outside git. Rehearse against a disposable database.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const file=process.argv[2];if(!file)throw Error('Usage: node scripts/rehearse-billing.mjs <private-data-export.json> [report.json]');
const backup=JSON.parse(readFileSync(file,'utf8'));const db=new PGlite();
const dir=new URL('../supabase/migrations/',import.meta.url);
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const u of backup.auth_ids)await db.query('insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values($1,$2,now(),now())',[u.id,u.email]);
 // Establish schema with the same pinned admin. Restore rows after all pre-billing migrations.
 const files=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
 const billing=files.find(f=>f.endsWith('_billing_v1_1.sql'));
 for(const f of files.filter(f=>f!==billing))await db.exec(readFileSync(new URL(f,dir),'utf8'));
 await db.exec('delete from studio_private.workspace_settings;delete from public.teacher_access;delete from public.app_accounts;');
 const tables=['students','fee_changes','weekly_slots','class_sessions','lessons','schedule_events','teacher_access','app_accounts'];
 for(const table of tables){
  if(!backup[table].length)continue;
  // Public exports have known allowlisted table names; JSON records retain all columns and UUIDs.
  await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(backup[table])]);
 }
 await db.exec('delete from studio_private.workspace_settings');
 await db.query('insert into studio_private.workspace_settings select * from jsonb_populate_recordset(null::studio_private.workspace_settings,$1::jsonb)',[JSON.stringify(backup.workspace_settings)]);
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.query(`select * from public.${t} order by 1`)).rows])));
 const before=await snapshot();await db.exec(readFileSync(new URL(billing,dir),'utf8'));assert.deepEqual(await snapshot(),before);
 for(const u of backup.auth_ids){const x=(await db.query('select id from auth.users where id=$1',[u.id])).rows;assert.equal(x.length,1)}
 const owner=backup.workspace_settings[0].owner;await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
 const response=(await db.query(`select public.billing_action('{"action":"list"}') r`)).rows[0].r;assert.equal(response.invoices.length,0);
 const report={result:'PASS',database:'disposable PGlite/PostgreSQL',auth_uid_count:backup.auth_ids.length,preserved_rows:Object.fromEntries(tables.map(t=>[t,before[t].length])),new_invoices:response.invoices.length,note:'Logical application-data rehearsal; not a full Auth/service backup or live migration.'};
 if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.close()}
