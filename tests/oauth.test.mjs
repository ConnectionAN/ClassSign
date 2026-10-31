import test from 'node:test';
import assert from 'node:assert/strict';
import {finishGoogle,startGoogle,requireTeacher} from '../src/oauth.ts';

function browser(href='https://classsign.example/'){
 const memory=new Map();let assigned='',cleaned='';
 globalThis.sessionStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 globalThis.window={location:{href,origin:new URL(href).origin,assign:v=>{assigned=v}},history:{replaceState:(_a,_b,v)=>{cleaned=v}}};
 return {memory,get assigned(){return assigned},get cleaned(){return cleaned}};
}
function client({id='old-uuid',teacher=true,exchangeError=false}={}){
 const calls=[];
 const query={select(){return this},eq(k,v){calls.push(['filter',k,v]);return this},async maybeSingle(){return {data:teacher?{user_id:id}:null,error:null}}};
 return {calls,from(table){calls.push(['table',table]);return query},auth:{
 async signInWithOAuth(c){calls.push(['signin',c]);return {data:{url:'https://provider.example/'},error:null}},
 async linkIdentity(c){calls.push(['link',c]);return {data:{url:'https://provider.example/'},error:null}},
 async exchangeCodeForSession(code,options){calls.push(['exchange',code,options]);return {data:{session:exchangeError?null:{user:{id,identities:[{provider:'google'}]}}},error:exchangeError?new Error('secret provider response'):null}},
 async signOut(){calls.push(['signout']);return {error:null}}
 }};
}
test('Google sign-in uses PKCE redirect destination without email lookup or grants',async()=>{
 const b=browser(),c=client();await startGoogle(c,null);
 assert.equal(c.calls[0][0],'signin');assert.equal(c.calls[0][1].options.redirectTo,'https://classsign.example/');assert.equal(b.assigned,'https://provider.example/');
});
test('link uses authorized current UUID and never signs in a replacement account',async()=>{
 browser();const c=client();await startGoogle(c,'old-uuid');assert.ok(c.calls.some(x=>x[0]==='link'));assert.ok(c.calls.some(x=>x[0]==='filter'&&x[2]==='old-uuid'));assert.ok(!c.calls.some(x=>x[0]==='signin'));
 browser();const denied=client({teacher:false});await assert.rejects(startGoogle(denied,'new-uuid'),/老師權限/);assert.ok(!denied.calls.some(x=>x[0]==='link'));
});
test('callback retains UUID, cleans URL, consumes intent once',async()=>{
 const b=browser('https://classsign.example/?code=one-time-code');b.memory.set('classsign.oauth',JSON.stringify({userId:'old-uuid',started:Date.now()}));
 const c=client();assert.match(await finishGoogle(c),/已連結/);assert.equal(b.cleaned,'/');assert.equal(b.memory.size,0);
 await assert.rejects(finishGoogle(c));assert.equal(c.calls.filter(x=>x[0]==='exchange').length,1);
});
test('wrong callback UUID signs out and cannot open old workspace',async()=>{
 const b=browser('https://classsign.example/?code=x');b.memory.set('classsign.oauth',JSON.stringify({userId:'old-uuid',started:Date.now()}));const c=client({id:'wrong-uuid'});await assert.rejects(finishGoogle(c));assert.ok(c.calls.some(x=>x[0]==='signout'));
});
test('cancelled, expired, missing intent and failed exchanges return only generic errors',async()=>{
 for(const href of ['https://classsign.example/?error=access_denied&error_description=SECRET','https://classsign.example/#error=SECRET','https://classsign.example/?code=x']){
  const b=browser(href),c=client();await assert.rejects(finishGoogle(c),e=>!e.message.includes('SECRET'));assert.equal(b.cleaned,'/');assert.equal(c.calls.length,0);
 }
 for(const expired of [true,false]){
  const b=browser('https://classsign.example/?code=x'),c=client({exchangeError:true});b.memory.set('classsign.oauth',JSON.stringify({userId:null,started:Date.now()-(expired?900001:0)}));await assert.rejects(finishGoogle(c),e=>!e.message.includes('secret'));assert.equal(c.calls.length,expired?0:1);
 }
});
test('ordinary password session is left alone; unapproved Google UUID denied',async()=>{
 browser();const c=client();assert.equal(await finishGoogle(c),'');assert.equal(c.calls.length,0);await assert.rejects(requireTeacher(client({teacher:false}),'new-uuid'),/沒有老師權限/);
});

test('SDK per-flow PKCE verifier is forwarded after URL cleanup; mismatched flow rejected',async()=>{
 const b=browser('https://classsign.example/?code=x&sb_flow_id=flow-1');b.memory.set('classsign.oauth',JSON.stringify({userId:null,started:Date.now(),flowId:'flow-1'}));const c=client();await finishGoogle(c);assert.deepEqual(c.calls[0],['exchange','x',{flowId:'flow-1'}]);assert.equal(b.cleaned,'/');
 const wrong=browser('https://classsign.example/?code=x&sb_flow_id=other');wrong.memory.set('classsign.oauth',JSON.stringify({userId:null,started:Date.now(),flowId:'flow-1'}));const d=client();await assert.rejects(finishGoogle(d));assert.equal(d.calls.length,0);
});

test('default SDK code-only callback uses saved PKCE flow and allows a new Google UUID',async()=>{
 const b=browser(),c=client({id:'new-google-uuid'});
 c.auth.signInWithOAuth=async()=>({data:{url:'https://provider.example/',flowId:'flow-1'},error:null});
 await startGoogle(c,null);
 window.location.href='https://classsign.example/?code=new-account-code';
 assert.equal(await finishGoogle(c),'');
 assert.deepEqual(c.calls,[['exchange','new-account-code',{flowId:'flow-1'}]]);
 assert.equal(b.cleaned,'/');assert.equal(b.memory.size,0);
 await assert.rejects(finishGoogle(c));
 assert.equal(c.calls.length,1);
});
