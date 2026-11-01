import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '@playwright/test';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/visual-v14-layout.json',import.meta.url),'utf8'));
const sid='11111111-1111-4111-8111-111111111111';
for(const width of [320,375,390,430,768,1024,1280,1440])test('visual structure '+width,async({page})=>{
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

 const dir=path.resolve('../../outputs/visual-v14',process.env.VISUAL_PHASE||'after');fs.mkdirSync(dir,{recursive:true});
 await page.goto('/');await expect(page.getByText('09:00–10:00')).toBeVisible();
 async function capture(key:string){
  await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,width+'-'+key+'.png'),fullPage:true,animations:'disabled'});
  const geometry=await page.locator('main,header,.heading,.records,.folders,.calendar,.schedule-card,.metrics,.mobile-navigation,.dialog,.signature canvas').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height).map(n=>{const r=n.getBoundingClientRect();return {selector:n.tagName+'.'+n.className,x:r.x,y:r.y,width:r.width,height:r.height}}));
  const file=path.join(dir,width+'-'+key+'.json');fs.writeFileSync(file,JSON.stringify(geometry,null,2));
  if(process.env.VISUAL_PHASE!=='before')expect(geometry).toEqual(baseline[width+'-'+key]);
 }
 await capture('schedule');
 await page.getByRole('button',{name:'週檢視',exact:true}).click();await capture('week');
 await page.getByRole('button',{name:/09:00–10:00/}).click();await page.getByRole('button',{name:'開啟師生簽到'}).click();await capture('signature');await page.getByRole('button',{name:'關閉',exact:true}).click();
 for(const [key,label] of [['students','學生資料夾'],['billing','學費袋與收款'],['stats','統計報表']]){
  if(width<768){const nav=page.getByRole('navigation',{name:'手機主要導覽'});await nav.getByRole('button',{name:key==='students'?'學生':key==='billing'?'收費':'更多',exact:true}).click();if(key==='stats')await page.getByRole('button',{name:'統計報表 ›'}).click()}
  else await page.getByRole('button',{name:new RegExp(label)}).click();
  if(key==='students'){await page.getByRole('button',{name:/測試學生.*堂/}).click();if(width<768)await page.getByRole('button',{name:'備註',exact:true}).click();await expect(page.getByRole('textbox',{name:'學生備註'})).toBeVisible()}
  if(key==='stats')await expect(page.getByRole('heading',{name:'營運總覽',exact:true})).toBeVisible();
  await capture(key);
  if(key==='stats'){await page.emulateMedia({media:'print'});await capture('reports-print');await page.pdf({path:path.join(dir,width+'-reports.pdf'),format:'A4'});await page.emulateMedia({media:'screen'})}
 }
});

test('login branding stays within the original centered form',async({page})=>{
 const dir=path.resolve('../../outputs/visual-v14/after');fs.mkdirSync(dir,{recursive:true});
 await page.route('https://classsign-test.invalid/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 for(const width of [320,375,390,430,768,1024,1280,1440]){
  await page.setViewportSize({width,height:width===768?1024:844});await page.goto('/');
  await expect(page.getByRole('button',{name:'使用帳密登入',exact:true})).toBeVisible();
  await expect(page.locator('.login-brand')).toHaveJSProperty('naturalWidth',638);
  await page.screenshot({path:path.join(dir,width+'-login.png'),fullPage:true});
  const painted=await page.locator('.login .dialog').boundingBox();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth);
  await page.evaluate(()=>{document.querySelector('style[data-vite-dev-id$="/src/visual-refresh.css"]')?.remove();document.querySelector('.login-brand')?.remove()});
  expect(await page.locator('.login .dialog').boundingBox()).toEqual(painted);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(overflow);
  fs.writeFileSync(path.join(dir,width+'-login-check.json'),JSON.stringify({width,scrollWidth:overflow,originalLayoutUnchanged:true}));
 }
});
