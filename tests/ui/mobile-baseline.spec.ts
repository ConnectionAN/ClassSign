import {test,expect} from '@playwright/test';
const sid='11111111-1111-4111-8111-111111111111';
for(const width of [768,1024,1280,1440])test('baseline '+width,async({page})=>{
 await page.setViewportSize({width,height:width===768?1024:768});
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'test@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 await page.route('https://classsign-test.invalid/**',async route=>{const path=new URL(route.request().url()).pathname;let result:any=[];
 if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
 if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false,accounts:[]};
 if(path.endsWith('/students'))result=[{id:sid,name:'測試學生',fee:800,active:1,created:'2026-10-01'}];
 if(path.endsWith('/rpc/studio_action')){const b=route.request().postDataJSON().b;result=b.action==='calendar'?{sessions:[{id:'session',student:sid,day:'2026-10-31',original_day:'2026-10-31',minute:540,duration:60,status:'planned',estimated_fee:800}],slots:[],pending:[],makeups:[],origins:[],events:[]}:{slots:[],next:null};}
 if(path.endsWith('/rpc/billing_action'))result={invoices:[],items:[],materials:[],payments:[],adjustments:[],pending:[],audit:[],exclusions:[]};
 if(path.endsWith('/rpc/report_snapshot'))result={generated_at:'2026-10-31T02:00:00Z',students:[{id:sid,name:'測試學生',active:1}],invoices:[{id:'invoice',student:sid,student_name:'測試學生',month:'2026-10-01',state:'issued',total:3200,paid:2000}],items:[],payments:[{id:'payment',invoice:'invoice',day:'2026-10-03',amount:2000,method:'cash',reverses:null}],materials:[],adjustments:[],lessons:[],sessions:[],pending:[]};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});});
 await page.goto('/');await expect(page.getByText('09:00–10:00')).toBeVisible();
 for(const [key,label] of [['schedule','日／週課表'],['students','學生資料夾'],['billing','學費袋與收款'],['stats','統計報表'],['accounts','帳號管理']]){
 await page.getByRole('button',{name:new RegExp(label)}).click();if(key==='students'){await page.getByRole('button',{name:/測試學生.*堂/}).click();await expect(page.getByRole('textbox',{name:'學生備註'})).toBeVisible();await expect(page.getByText('表定上課時間',{exact:true})).toBeVisible();await expect(page.getByText('讀取帳務資料…',{exact:true})).toHaveCount(0);}if(key==='stats')await expect(page.getByRole('heading',{name:'營運總覽',exact:true})).toBeVisible();
 await page.mouse.move(0,0);const screenshot=await page.screenshot({path:`artifacts/${process.env.BASELINE_PHASE||'after'}/${width}-${key}.png`,fullPage:true,animations:'disabled'});if(process.env.CLASS_SIGN_VISUAL_BASELINE==='1')expect(screenshot).toMatchSnapshot(width+'-'+key+'.png',{threshold:0.01,maxDiffPixels:0});
 }
});
