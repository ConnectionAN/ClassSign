// Offline fixture preview: no outgoing requests or real data.
const student={id:'s',name:'測試學生',fee:800,active:1};
 const invoice={id:'v',student:'s',student_name:'測試學生',month:'2026-10-01',state:'issued',total:3200,paid:2000};
 const data={generated_at:'2026-10-31T02:00:00Z',students:[student],invoices:[invoice],items:[{id:'item',invoice:'v',amount:3200,posted:true,kind:'tuition'}],payments:[{id:'p',invoice:'v',day:'2026-10-03',amount:2000,method:'transfer',reverses:null,notes:'=formula'}],materials:[{id:'m',student:'s',name:'教本',purchased:'2026-10-20',quantity:1,unit_price:350,cancelled:false}],adjustments:[],lessons:[{id:'l',student:'s',day:'2026-10-05',fee:800,session:null,voided:null}],sessions:[],pending:[]};

const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));
localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'preview@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}));
sessionStorage.setItem('classsign.page.teacher','stats');
window.fetch=async(input)=>{
 const path=new URL(String(input instanceof Request?input.url:input)).pathname;let result:unknown=[];
 if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
 if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
 if(path.endsWith('/students'))result=[student];
 if(path.endsWith('/rpc/studio_action'))result={sessions:[],slots:[],pending:[],makeups:[],origins:[],events:[]};
 if(path.endsWith('/rpc/billing_action'))result={...data,audit:[],exclusions:[]};
 if(path.endsWith('/rpc/report_snapshot'))result=data;
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
await import('../../src/main');
