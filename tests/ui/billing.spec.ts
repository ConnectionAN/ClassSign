import {test,expect} from '@playwright/test';
const sid='11111111-1111-4111-8111-111111111111',vid='22222222-2222-4222-8222-222222222222';
test('material entry stays in student folder; billing reviews, issues, receives and prints',async({page})=>{
 const data:any={invoices:[],items:[],materials:[],payments:[],adjustments:[],pending:[],audit:[]};const calls:any[]=[];
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'teacher@example.com',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 await page.route('https://classsign-test.invalid/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result:any=[];
  if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
  if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
  if(path.endsWith('/students'))result=[{id:sid,name:'測試學生',fee:800,active:1,created:'2026-10-01'}];
  if(path.endsWith('/rpc/studio_action')){const b=route.request().postDataJSON().b;result=b.action==='calendar'?{sessions:[],slots:[],pending:[],makeups:[],origins:[],events:[]}:{slots:[],next:null}}
  if(path.endsWith('/rpc/billing_action')){
   const b=route.request().postDataJSON().b;calls.push(b);
   if(b.action==='list')result=data;
   else if(b.action==='material'){data.materials.push({...b,unit_price:b.unit_price,cancelled:false});result={ok:true}}
   else if(b.action==='draft'){
    data.invoices=[{id:vid,student:sid,student_name:'測試學生',month:'2026-11-01',state:'draft',total:3550,paid:0,fingerprint:'reviewed'}];
    data.items=[{id:'tuition',invoice:vid,kind:'tuition',label:'11 月預定課程 4 堂',amount:3200,posted:false,snapshot:{}},
     {id:'material',invoice:vid,kind:'material',label:'鋼琴教本',amount:350,material:data.materials[0].id,posted:false,snapshot:{quantity:1,unit_price:350,purchased:'2026-10-31'}}];result={ok:true,invoice:vid};
   }else if(b.action==='issue'){expect(b.fingerprint).toBe('reviewed');data.invoices[0].state='issued';data.items.forEach((i:any)=>i.posted=true);result={ok:true}}
   else if(b.action==='payment'){data.payments.push({...b,actor:'teacher',reverses:null});data.invoices[0].paid+=b.amount;result={ok:true}}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');await page.getByRole('button',{name:/學生資料夾/}).click();await page.getByRole('button',{name:/測試學生.*堂/}).click();
 await page.getByText('＋ 登記購入教材',{exact:true}).click();await page.getByLabel('教材名稱').fill('鋼琴教本');await page.getByLabel('單價（TWD）').fill('350');await page.getByRole('button',{name:'儲存教材',exact:true}).click();
 await expect(page.getByRole('region',{name:'教材紀錄'})).toContainText('待代收');expect(calls.find(b=>b.action==='material')).toMatchObject({student:sid,name:'鋼琴教本',quantity:1,unit_price:350,purchased:'2026-10-31'});
 await page.getByRole('button',{name:/學費袋與收款/}).click();await page.getByLabel('收費月份').fill('2026-11');await page.getByLabel('學生',{exact:true}).selectOption(sid);await page.getByRole('button',{name:'產生／重算草稿'}).click();
 await expect(page.getByRole('article')).toContainText('鋼琴教本');await page.getByRole('button',{name:'確認金額並正式開立'}).click();
 await page.getByLabel('金額',{exact:true}).fill('2000');await page.getByLabel('方式').selectOption('transfer');await page.getByRole('button',{name:'確認收款',exact:true}).click();
 await expect(page.getByRole('article')).toContainText('部分收款');await expect(page.getByRole('article')).toContainText('1,550');
 await page.screenshot({path:'test-results/billing-partial.png',fullPage:true});
 await page.emulateMedia({media:'print'});await expect(page.getByRole('article')).toBeVisible();await expect(page.getByRole('button',{name:'確認收款',exact:true})).toBeHidden();
 await page.screenshot({path:'test-results/billing-print.png',fullPage:true});
 await page.pdf({path:'test-results/billing-print.pdf',format:'A4'});
});
