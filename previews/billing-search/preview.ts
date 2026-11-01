// Isolated synthetic preview: all fetches are fulfilled locally.
 const students=[{id:'late',name:'林小王',active:1},{id:'none',name:'未排課學生',active:1},{id:'mid',name:'李王明',active:1},{id:'early',name:'王小安',active:1},{id:'sun',name:'陳小美',active:1},{id:'archived',name:'王舊生',active:0}].map(s=>({...s,fee:800}));
 let slots=[{student:'early',weekday:1,minute:540},{student:'late',weekday:1,minute:600},{student:'mid',weekday:2,minute:540},{student:'sun',weekday:7,minute:540},{student:'archived',weekday:1,minute:480}].map(s=>({...s,starts:'2026-01-01',ends:null}));
 const invoices=students.map(s=>({id:'invoice-'+s.id,student:s.id,student_name:s.id==='early'?'更名前姓名':s.name,month:'2026-11-01',state:s.active?'issued':'void',total:800,paid:0,fingerprint:'test'}));

const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));
localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'preview@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}));
sessionStorage.setItem('classsign.page.teacher','billing');
window.fetch=async(input,init)=>{
 const path=new URL(String(input instanceof Request?input.url:input)).pathname;let result:unknown=[];
 if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
 if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
 if(path.endsWith('/students'))result=students;if(path.endsWith('/weekly_slots'))result=slots;
 if(path.endsWith('/rpc/billing_action')){
  const b=JSON.parse(String(init?.body||'{}')).b;
  if(b?.action!=='list')return new Response(JSON.stringify({message:'此預覽僅提供學生排序與搜尋操作。'}),{status:400,headers:{'Content-Type':'application/json'}});
  result={invoices,items:[],payments:[],materials:[],adjustments:[],pending:[],audit:[],exclusions:[]};
 }
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
await import('../../src/main');
