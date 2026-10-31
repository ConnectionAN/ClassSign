import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const student={id:'s',name:'測試學生',fee:800,active:1};
async function setup(page:any,fail=false){
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'teacher@example.com',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 const invoice={id:'v',student:'s',student_name:'測試學生',month:'2026-10-01',state:'issued',total:3200,paid:2000};
 const data={generated_at:'2026-10-31T02:00:00Z',students:[student],invoices:[invoice],items:[{id:'item',invoice:'v',amount:3200,posted:true,kind:'tuition'}],payments:[{id:'p',invoice:'v',day:'2026-10-03',amount:2000,method:'transfer',reverses:null,notes:'=formula'}],materials:[{id:'m',student:'s',name:'教本',purchased:'2026-10-20',quantity:1,unit_price:350,cancelled:false}],adjustments:[],lessons:[{id:'l',student:'s',day:'2026-10-05',fee:800,session:null,voided:null}],sessions:[],pending:[]};
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
 await page.goto('/');await page.getByRole('button',{name:/統計報表/}).click();
 return queries;
}
test('five reports, separate metrics, period filters, CSV, print and invoice navigation',async({page})=>{
 const queries=await setup(page);
 const report=page.getByRole('region',{name:'統計報表'});
 await expect(report.getByRole('heading',{name:'營運總覽'})).toBeVisible();
 await expect(report.locator('.metrics')).toContainText('3,200');await expect(report.locator('.metrics')).toContainText('2,000');await expect(report.locator('.metrics')).toContainText('1,200');
 await expect(page.getByLabel('授課老師')).toHaveValue('susu');
 await page.getByLabel('期間',{exact:true}).selectOption('quarter');await expect.poll(()=>queries.at(-1)?.date_from).toBe('2026-10-01');await expect.poll(()=>queries.at(-1)?.date_to).toBe('2026-12-31');
 await page.getByLabel('期間',{exact:true}).selectOption('year');await expect.poll(()=>queries.at(-1)?.date_from).toBe('2026-01-01');
 await page.getByRole('tab',{name:'實際收款報表'}).click();await expect(report.getByRole('cell',{name:'2026-10-03'})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 CSV'}).click();const file=await download;expect(file.suggestedFilename()).toContain('實際收款報表');const csv=readFileSync((await file.path())!,'utf8');expect(csv).toContain("'=formula");expect(csv).toContain('2026-10-03');
 await page.getByRole('tab',{name:'課務統計'}).click();await expect(report.getByRole('cell',{name:'蘇蘇老師'})).toBeVisible();await expect(page.getByLabel('收費狀態')).toHaveCount(0);
 await page.getByRole('tab',{name:'教材代收報表'}).click();await expect(report.getByRole('cell',{name:'待代收',exact:true})).toBeVisible();
 await page.getByLabel('教材日期依據').selectOption('invoice');await expect(report.getByText('此篩選條件沒有紀錄。')).toBeVisible();
 await page.getByRole('tab',{name:'學費袋報表'}).click();await page.getByLabel('收費狀態').selectOption('paid');await expect(report.getByText('此篩選條件沒有紀錄。')).toBeVisible();await page.getByLabel('收費狀態').selectOption('partial');
 await page.screenshot({path:'test-results/reports-bags.png',fullPage:true});
 await page.emulateMedia({media:'print'});await expect(page.locator('.report-print')).toBeVisible();await expect(page.getByRole('button',{name:'匯出 CSV'})).toBeHidden();await page.screenshot({path:'test-results/reports-print.png',fullPage:true});await page.pdf({path:'test-results/reports-print.pdf',format:'A4'});await page.emulateMedia({media:'screen'});
 await page.getByRole('button',{name:'開啟學費袋'}).click();await expect(page.getByRole('article')).toContainText('測試學生');await expect(page.getByLabel('收費月份')).toHaveValue('2026-10');
});
test('invalid ranges and failed requests disable export, with no stale metrics',async({page})=>{
 await setup(page);await page.getByLabel('期間',{exact:true}).selectOption('custom');await page.getByLabel('起始日期').fill('2026-12-01');
 await expect(page.getByRole('alert')).toContainText('起始不可晚於結束');await expect(page.getByRole('button',{name:'匯出 CSV'})).toBeDisabled();await expect(page.locator('.report-print')).toHaveCount(0);
});
test('missing migration shows an error rather than zero financial totals',async({page})=>{
 await setup(page,true);await expect(page.getByRole('alert')).toContainText('migration');await expect(page.getByRole('button',{name:'列印報表'})).toBeDisabled();await expect(page.locator('.report-print')).toHaveCount(0);
});
