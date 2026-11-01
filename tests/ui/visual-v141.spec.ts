import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '@playwright/test';
const sid='11111111-1111-4111-8111-111111111111';
for(const width of [375,390,768,1024,1440])test('v141 visual workflow '+width,async({page})=>{
 await page.setViewportSize({width,height:width===768?1024:768});
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'test@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 await page.route('https://classsign-test.invalid/**',async route=>{const path=new URL(route.request().url()).pathname;let result:any=[];
 if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
 if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false,accounts:[]};
 if(path.endsWith('/students'))result=[{id:'s2',name:'林沐晴',fee:1000,active:1},{id:'s3',name:'許品言',fee:800,active:1},{id:'s4',name:'張予樂',fee:900,active:1},{id:sid,name:'陳以安',fee:800,active:1,notes:'本週練習：拜爾第 18 首，注意左右手的力度與樂句。',created:'2026-10-01'}];
 if(path.endsWith('/rpc/studio_action')){const b=route.request().postDataJSON().b;result=b.action==='calendar'?{sessions:[{id:'session',student:sid,day:'2026-10-31',original_day:'2026-10-31',minute:540,duration:60,status:'planned',estimated_fee:800},{id:'session2',student:'s2',day:'2026-10-31',original_day:'2026-10-31',minute:660,duration:60,status:'signed',estimated_fee:1000},{id:'session3',student:'s3',day:'2026-10-30',original_day:'2026-10-30',minute:840,duration:60,status:'leave',estimated_fee:800},{id:'session4',student:'s4',day:'2026-10-29',original_day:'2026-10-29',minute:900,duration:60,status:'planned',estimated_fee:900}],slots:[],pending:[],makeups:[],origins:[],events:[]}:{slots:[{id:'slot',weekday:6,minute:540,duration:60,starts:'2026-10-01',ends:null}],next:{day:'2026-11-07',minute:540,duration:60,source:'regular'}};}
 if(path.endsWith('/rpc/billing_action'))result={invoices:[],items:[],materials:[],payments:[],adjustments:[],pending:[],audit:[],exclusions:[]};
 if(path.endsWith('/rpc/report_snapshot'))result={generated_at:'2026-10-31T02:00:00Z',students:[{id:sid,name:'測試學生',active:1}],invoices:[{id:'invoice',student:sid,student_name:'測試學生',month:'2026-10-01',state:'issued',total:3200,paid:2000}],items:[],payments:[{id:'payment',invoice:'invoice',day:'2026-10-03',amount:2000,method:'cash',reverses:null}],materials:[],adjustments:[],lessons:[],sessions:[],pending:[]};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});});


 const phase=process.env.UI141_PHASE||'after';const dir=path.resolve('../../outputs/visual-v141',phase);fs.mkdirSync(dir,{recursive:true});
 await page.goto('/');await expect(page.getByText('09:00–10:00')).toBeVisible();
 async function shot(key:string){await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,width+'-'+key+'.png'),animations:'disabled'});await page.screenshot({path:path.join(dir,width+'-'+key+'-full.png'),fullPage:true,animations:'disabled'});if(phase==='after')expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
 await shot('schedule');await page.getByRole('button',{name:'日檢視',exact:true}).click();await shot('day');await page.getByRole('button',{name:'週檢視',exact:true}).click();await shot('week');
 await page.getByRole('button',{name:/09:00–10:00/}).click();await page.getByRole('button',{name:'開啟師生簽到'}).click();await page.screenshot({path:path.join(dir,width+'-signature.png'),animations:'disabled'});await expect(page.getByRole('button',{name:'確認雙方簽署並儲存'})).toBeDisabled();await page.getByRole('button',{name:'關閉',exact:true}).click();
 if(width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'學生',exact:true}).click();else await page.getByRole('button',{name:/學生資料夾/}).click();
 await shot('students-list');await page.getByRole('button',{name:/陳以安.*堂/}).click();await expect(page.getByText('表定上課時間',{exact:true})).toBeVisible();await shot('student');
 if(width<768)await page.getByRole('button',{name:'備註',exact:true}).click();await expect(page.getByRole('textbox',{name:'學生備註'})).toBeVisible();await shot('notes');
 if(phase==='after'){const primary=page.locator('.primary:not(:disabled)').first();await expect(primary).toHaveCSS('color','rgb(255, 255, 255)');await expect(primary).toHaveCSS('background-color','rgb(205, 118, 172)')}
});
for(const width of [375,390,768,1024,1440])test('v141 login '+width,async({page})=>{
 const phase=process.env.UI141_PHASE||'after';const dir=path.resolve('../../outputs/visual-v141',phase);fs.mkdirSync(dir,{recursive:true});await page.setViewportSize({width,height:width===768?1024:844});await page.goto('/');await expect(page.getByRole('button',{name:'使用帳密登入',exact:true})).toBeVisible();await page.screenshot({path:path.join(dir,width+'-login.png'),fullPage:true});if(phase==='after'){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.login')).toHaveCSS('background-image','none');await expect(page.locator('.primary')).toHaveCSS('color','rgb(255, 255, 255)')}
});
