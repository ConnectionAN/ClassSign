import {useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from './client';
import {startGoogle} from './oauth';

export default function GoogleAccount({session}:{session:Session}){
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const linked=session.user.identities?.some(i=>i.provider==='google');
 if(import.meta.env.VITE_GOOGLE_AUTH_ENABLED!=='true')return null;
 return <details className="account"><summary>登入方式：{linked?'Google 已連結':'連結 Google 帳號'}</summary>{linked?<p>Google 已連結；原本帳密仍可使用。</p>:<form onSubmit={async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{
   const {data,error}=await supabase!.auth.signInWithPassword({email:session.user.email!,password});
   setPassword('');
   if(error||data.user?.id!==session.user.id)throw new Error('請確認原本密碼。');
   await startGoogle(supabase!,session.user.id);
  }catch{setError('連結未完成，請確認原本密碼及 Google 設定後重試。')}finally{setPassword('');setBusy(false)}
 }}><p>先確認原本密碼，再選擇您要連結的 Google 帳號。連結後可使用兩種方式登入。</p><label>原本密碼<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?'處理中…':'確認並連結 Google'}</button></form>}{error&&<p role="alert" className="alert">{error}</p>}</details>;
}
