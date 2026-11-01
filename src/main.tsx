import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {configured,supabase} from './client';
import {finishGoogle,startGoogle} from './oauth';
import {accountRequest,AccountError} from './accounts';
import Studio from './Studio';
import './style.css';
import './visual-refresh.css';

// One exchange across StrictMode remounts. SDK URL auto-detection stays disabled.
const initialization=supabase?finishGoogle(supabase).then(message=>({message}),()=>({message:'Google 登入或連結未完成，請使用原本帳密登入後重試。'})):Promise.resolve({message:''});
function App(){
 const authorizedUser=useRef<string|null>(null);
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[allowed,setAllowed]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(!supabase){setReady(true);return;}
  const client=supabase;let disposed=false,revision=0;
  async function check(s:Session|null){
   const current=++revision,retain=!!s&&authorizedUser.current===s.user.id;
   if(!retain){authorizedUser.current=null;setReady(false);setAllowed(false)}setSession(s);
   try{if(s){const access=await accountRequest(retain?'status':'bootstrap');if(access?.user_id!==s.user.id||access.disabled!==false)throw new Error('無法確認帳號狀態，請重新登入。');}if(!disposed&&current===revision){authorizedUser.current=s?.user.id||null;setAllowed(!!s)}}
   catch(e){if(!disposed&&current===revision){authorizedUser.current=null;setAllowed(false);setError((e as Error).message)}}
   finally{if(!disposed&&current===revision)setReady(true)}
  }
  let subscription:{unsubscribe:()=>void}|undefined;
  initialization.then(async result=>{
   if(disposed)return;setNotice(result.message);
   // Do not await Supabase calls inside its auth event lock.
   subscription=client.auth.onAuthStateChange((event,s)=>{setTimeout(()=>{if(disposed)return;if(event==='TOKEN_REFRESHED'){setSession(s);return;}void check(s)},0)}).data.subscription;
   const {data,error}=await client.auth.getSession();
   if(disposed)return;
   if(error)setError('登入狀態讀取失敗，請重新登入');
   void check(data.session);
  });
  return()=>{disposed=true;revision++;subscription?.unsubscribe()};
 },[]);
 useEffect(()=>{
  if(!session||!allowed)return;let disposed=false,pending=false;
  async function verify(){if(pending||disposed)return;pending=true;try{await accountRequest('status')}catch(e){if(!disposed&&e instanceof AccountError&&e.denied){setAllowed(false);setError(e.message);await supabase!.auth.signOut({scope:'local'})}}finally{pending=false}}
  const timer=window.setInterval(verify,15000);window.addEventListener('focus',verify);document.addEventListener('visibilitychange',verify);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',verify);document.removeEventListener('visibilitychange',verify)};
 },[session?.user.id,allowed]);
 if(!configured)return <div className="login"><section className="dialog"><h1>鋼琴課小幫手</h1><p>網站尚未連接 Supabase。</p><p className="muted">請依專案設定指南填入 Project URL 與 Publishable key，再重新建置。</p></section></div>;
 if(!ready)return <p className="empty">正在確認登入狀態與帳號狀態…</p>;
 if(session&&allowed)return <React.Fragment key={session.user.id}><div className="account-bar">{notice&&<p role="status">{notice}</p>}<span>已登入：{session.user.email}</span><button onClick={async()=>{const {error}=await supabase!.auth.signOut();if(error)setNotice('登出失敗，請重試')}}>登出</button></div><Studio userId={session.user.id}/></React.Fragment>;
 if(session)return <div className="login"><section className="dialog"><h1>無法進入教學工作室</h1><p role="alert">{error}</p><button onClick={()=>{setError('');void accountRequest('bootstrap').then(()=>setAllowed(true),e=>setError(e.message))}}>重試帳號確認</button><button onClick={async()=>{const {error}=await supabase!.auth.signOut();if(error)setError('登出失敗，請重試')}}>登出並更換帳號</button></section></div>;
 return <div className="login"><section className="dialog"><img className="login-brand" src="/brand/jing-le-original-avatar.jpg" alt="靖樂巷語原始品牌標誌"/><p className="eyebrow">PIANO LESSON JOURNAL</p><h1>歡迎回到鋼琴課小幫手</h1><p className="muted">使用 Google 或原本帳密登入，開始今天的課程。</p>{notice&&<p role="status">{notice}</p>}{error&&<p className="alert" role="alert">{error}</p>}<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const {error}=await supabase!.auth.signInWithPassword({email,password});if(error)throw error;setPassword('')}catch{setError('登入失敗，請確認 Email、密碼及帳號是否已啟用。')}finally{setBusy(false)}}}><label>Email<input autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>密碼<input autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary full" disabled={busy}>{busy?'登入中…':'使用帳密登入'}</button></form>{import.meta.env.VITE_GOOGLE_AUTH_ENABLED==='true'&&<><button className="full" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await startGoogle(supabase!,null)}catch{setError('Google 登入未完成，請使用原本帳密登入後重試。')}finally{setBusy(false)}}}>使用 Google 帳號登入</button><p className="muted">首次 Google 登入會自動建立系統帳號，與其他使用者共用學生與課表，無需另行綁定。</p></>}<small>學生／家長在老師裝置簽名，不需要帳號。忘記原密碼時請由管理員協助重設。<br/><a href="/privacy.html" target="_blank" rel="noreferrer">隱私權政策與共用資料說明</a></small></section></div>;
}createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
