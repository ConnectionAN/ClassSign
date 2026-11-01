export const student={id:'s',name:'測試學生－長姓名與歷史資料',fee:800,active:1};
export async function setup(page:any,fail=false,advance=false){
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'teacher@example.com',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 const invoice={id:'v',student:'s',student_name:'測試學生',month:'2026-10-01',state:'issued',total:3200,paid:2000};
 const data:any={generated_at:'2026-10-31T02:00:00Z',students:[student],invoices:[invoice],items:[{id:'item',invoice:'v',amount:3200,posted:true,kind:'tuition'}],payments:[{id:'p',invoice:'v',day:'2026-10-03',amount:2000,method:'transfer',reverses:null,notes:'=formula'}],materials:[{id:'m',student:'s',name:'教本',purchased:'2026-10-20',quantity:1,unit_price:350,cancelled:false}],adjustments:[],lessons:[{id:'l',student:'s',day:'2026-10-05',fee:800,session:null,voided:null}],sessions:[],pending:[]};
 if(advance){invoice.month='2026-11-01';invoice.total=2850;invoice.paid=2850;data.items[0].amount=2850;data.payments[0].amount=2850;data.payments[0].day='2026-10-31'}
 data.students[0].name='測試學生－長姓名與歷史資料';
 data.invoices.push({id:'paid',student:'s',student_name:'已結清學生',month:'2026-10-01',state:'issued'},{id:'void',student:'s',student_name:'作廢不可顯示',month:'2026-10-01',state:'void'},{id:'draft',student:'s',student_name:'草稿學生',month:'2026-10-01',state:'draft'});
 data.items.push({invoice:'paid',amount:1200,posted:true,kind:'material',material:'m2'},{invoice:'void',amount:99999,posted:false});
 data.payments.push({id:'paid-p',invoice:'paid',day:'2026-09-30',amount:1200,method:'cash',reverses:null,notes:'跨月預繳'},{id:'reverse',invoice:'v',day:'2026-11-02',amount:-200,method:'transfer',reverses:'p',notes:'輸入更正，不代表退款'});
 data.materials.push({id:'m2',student:'s',name:'已列帳教材－長教材名稱與版本說明',purchased:'2026-10-10',quantity:3,unit_price:400,cancelled:false});
 data.sessions=[{id:'lesson-session',student:'s',day:'2026-10-05',status:'signed',original:null,slot:'slot',needs_makeup:false},{id:'leave',student:'s',day:'2026-10-12',status:'leave',original:null,slot:'slot',needs_makeup:true}];
 data.pending=['leave'];data.lessons[0].session='lesson-session';
 const queries:any[]=[];
 await page.route('https://classsign-test.invalid/**',async(route:any)=>{
  const path=new URL(route.request().url()).pathname;let result:any=[];
  if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
  if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
  if(path.endsWith('/students'))result=[student];
  if(path.endsWith('/rpc/studio_action'))result={sessions:[],slots:[],pending:[],makeups:[],origins:[],events:[]};
  if(path.endsWith('/rpc/billing_action'))result={...data,audit:[],exclusions:[]};
  if(path.endsWith('/rpc/report_snapshot')){
   queries.push(route.request().postDataJSON());
   if(fail){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'report_snapshot does not exist'})});return}
   result=data;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.addInitScript(()=>sessionStorage.setItem('classsign.page.teacher','stats'));await page.goto('/');
 return {queries,data};
}
