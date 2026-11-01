import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const student={id:'s',name:'測試學生',fee:800,active:1};
async function setup(page:any,fail=false,advance=false){
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'teacher@example.com',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 const invoice={id:'v',student:'s',student_name:'測試學生',month:'2026-10-01',state:'issued',total:3200,paid:2000};
 const data={generated_at:'2026-10-31T02:00:00Z',students:[student],invoices:[invoice],items:[{id:'item',invoice:'v',amount:3200,posted:true,kind:'tuition'}],payments:[{id:'p',invoice:'v',day:'2026-10-03',amount:2000,method:'transfer',reverses:null,notes:'=formula'}],materials:[{id:'m',student:'s',name:'教本',purchased:'2026-10-20',quantity:1,unit_price:350,cancelled:false}],adjustments:[],lessons:[{id:'l',student:'s',day:'2026-10-05',fee:800,session:null,voided:null}],sessions:[],pending:[]};
 if(advance){invoice.month='2026-11-01';invoice.total=2850;invoice.paid=2850;data.items[0].amount=2850;data.payments[0].amount=2850;data.payments[0].day='2026-10-31'}
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
 return queries;
}

for(const width of [320,375,390,430,768,1024,1280,1440])test('reports responsive '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 const phase=process.env.REPORT_PHASE||'after',dir='artifacts/reports/'+phase;fs.mkdirSync(dir,{recursive:true});
 const titles=['營運總覽','學費袋報表','實際收款報表','課務統計','教材代收報表'];
 for(let i=0;i<titles.length;i++){
  await page.getByRole('tab',{name:titles[i],exact:true}).click();await expect(page.locator('.report-print h2').first()).toHaveText(titles[i]);
  if(phase==='after'){
   const ratios=await page.locator('.report-metric strong,.report-tabs [aria-selected=true],.reports .ui-status').evaluateAll(els=>{
    const lum=(rgb:string)=>{const c=(rgb.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
    return els.filter(el=>el.getBoundingClientRect().width>0).map(el=>{let p:Element|null=el,bg='';while(p){bg=getComputedStyle(p).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;p=p.parentElement}const a=lum(getComputedStyle(el).color),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
   });for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
  await page.screenshot({path:dir+'/'+width+'-'+i+'.png',fullPage:true});
  if(phase==='after')expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.emulateMedia({media:'print'});await expect(page.locator('.report-table')).toBeVisible();
  if(width===1440)await page.pdf({path:dir+'/'+i+'-A4.pdf',format:'A4'});
  await page.emulateMedia({media:'screen'});
 }
});
