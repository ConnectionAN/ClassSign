import type {SupabaseClient} from '@supabase/supabase-js';

const pendingKey='classsign.oauth';
const failure='Google 登入或連結未完成，請使用原本帳密登入後重試。';
type Pending={userId:string|null;started:number;flowId?:string|null};

export async function requireTeacher(client:SupabaseClient,userId:string){
 const {data,error}=await client.from('teacher_access').select('user_id').eq('user_id',userId).maybeSingle();
 if(error)throw new Error('老師權限確認失敗，請重試。');
 if(!data)throw new Error('此帳號沒有老師權限。請使用原本帳密登入；若選錯 Google 帳號，請登出後重試。');
}

export async function startGoogle(client:SupabaseClient,userId:string|null){
 // No email lookup, user creation, ownership rewrite, or permission grant.
 if(userId)await requireTeacher(client,userId);
 sessionStorage.setItem(pendingKey,JSON.stringify({userId,started:Date.now()}));
 try{
  const credentials={provider:'google' as const,options:{redirectTo:window.location.origin+'/',skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}};
  const {data,error}=userId?await client.auth.linkIdentity(credentials):await client.auth.signInWithOAuth(credentials);
  if(error||!data.url)throw new Error(failure);
  sessionStorage.setItem(pendingKey,JSON.stringify({userId,started:Date.now(),flowId:data.flowId}));
  window.location.assign(data.url);
 }catch{sessionStorage.removeItem(pendingKey);throw new Error(failure)}
}

export async function finishGoogle(client:SupabaseClient){
 const url=new URL(window.location.href),hash=new URLSearchParams(url.hash.slice(1));
 const code=url.searchParams.get('code');
 if(!code&&!url.searchParams.has('error')&&!hash.has('error')&&!hash.has('access_token'))return '';
 // Remove credentials/errors before any UI or data load. Never echo provider text.
 window.history.replaceState(null,'',url.pathname);
 const raw=sessionStorage.getItem(pendingKey);sessionStorage.removeItem(pendingKey);
 try{
  const pending:Pending=JSON.parse(raw||'null');
  if(!pending||!code||Date.now()-pending.started>15*60*1000||pending.started>Date.now()||!Number.isFinite(pending.started))throw new Error(failure);
  const flowId=url.searchParams.get('sb_flow_id');
  if(pending.flowId&&flowId!==pending.flowId)throw new Error(failure);
  const {data,error}=await client.auth.exchangeCodeForSession(code,pending.flowId?{flowId:pending.flowId}:undefined);
  if(error||!data.session)throw new Error(failure);
  if(pending.userId&&data.session.user.id!==pending.userId){
   await client.auth.signOut({scope:'local'});
   throw new Error(failure);
  }
  if(pending.userId&&!data.session.user.identities?.some(i=>i.provider==='google'))throw new Error(failure);
  return pending.userId?'Google 已連結，原本帳密仍可使用。':'';
 }catch{throw new Error(failure)}
}
