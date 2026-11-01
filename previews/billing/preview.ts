// Isolated development preview. No network requests or real financial data.
const students=[{id:'s1',name:'陳以安',active:1,fee:800},{id:'s2',name:'林沐晴',active:1,fee:1000},{id:'s3',name:'許品言',active:1,fee:900},{id:'s4',name:'張予樂',active:1,fee:800},{id:'s5',name:'吳若晴',active:1,fee:800}];
const month='2026-11-01';
const invoices=students.map((s,i)=>({id:'invoice-'+i,student:s.id,student_name:s.name,month,state:i===0?'draft':i===4?'void':'issued',total:3550,paid:i===2?2000:i===3?3550:0,fingerprint:'preview'}));
const items=invoices.flatMap(v=>[{id:v.id+'t',invoice:v.id,kind:'tuition',label:'11 月預定課程 4 堂',amount:3200,posted:v.state==='issued',snapshot:{}},{id:v.id+'m',invoice:v.id,kind:'material',label:'鋼琴教本 · 第 2 冊',amount:350,posted:v.state==='issued',snapshot:{quantity:1,unit_price:350,purchased:'2026-10-28'}},{id:v.id+'c',invoice:v.id,kind:'custom',label:'音樂會報名費',amount:200,posted:v.state==='issued',snapshot:{notes:'冬季成果發表會'}},{id:v.id+'a',invoice:v.id,kind:'adjustment',label:'前期課程抵扣',amount:-200,posted:v.state==='issued',snapshot:{}}]);
const data:any={invoices,items,payments:[{id:'p1',invoice:'invoice-2',amount:2000,method:'transfer',day:'2026-10-30',notes:'第一筆收款',actor:'preview@example.invalid',reverses:null}],materials:[],adjustments:[],pending:[],audit:[],exclusions:[]};
const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));
localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'preview@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}));
window.fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);const b=init?.body?JSON.parse(String(init.body)).b:{};let result:any=[];
 if(url.includes('/teacher_access'))result={user_id:'teacher'};
 if(url.includes('/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
 if(url.includes('/students'))result=students;
 if(url.includes('/studio_action'))result={sessions:[],slots:[],pending:[],makeups:[],origins:[],events:[]};
 if(url.includes('/billing_action')){
  result={ok:true};const v=data.invoices.find((v:any)=>v.id===b.invoice);
  if(b.action==='list')result=data;
  if(b.action==='draft')result={invoice:data.invoices.find((v:any)=>v.student===b.student)?.id};
  if(b.action==='issue'&&v)v.state='issued';
  if(b.action==='custom_add'&&v){data.items.push({id:b.id,invoice:v.id,kind:'custom',label:b.name,amount:b.amount,posted:false,snapshot:{notes:b.notes}});v.total+=b.amount;}
  if(b.action==='draft_item_remove'&&v){const item=data.items.find((i:any)=>i.id===b.id);data.exclusions.push({id:b.id,invoice:v.id,snapshot:item});data.items=data.items.filter((i:any)=>i.id!==b.id);v.total-=item.amount;}
  if(b.action==='draft_item_restore'&&v){const ex=data.exclusions.find((e:any)=>e.id===b.id);data.items.push(ex.snapshot);v.total+=ex.snapshot.amount;data.exclusions=data.exclusions.filter((e:any)=>e.id!==b.id);}
  if(b.action==='payment'&&v){data.payments.push({...b,actor:'preview@example.invalid',reverses:null});v.paid+=b.amount;}
  if(b.action==='reverse_payment'&&v){const p=data.payments.find((p:any)=>p.id===b.payment);data.payments.push({...p,id:crypto.randomUUID(),amount:-p.amount,reverses:p.id,notes:b.reason});v.paid-=p.amount;}
  if(b.action==='void'&&v)v.state='void';
 }
 if(url.includes('/report_snapshot'))result={...data,students,generated_at:'2026-11-01T02:00:00Z',lessons:[],sessions:[]};
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
await import('../../src/main');
