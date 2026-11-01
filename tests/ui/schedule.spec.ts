import {test,expect,type Page} from '@playwright/test';
const sid='11111111-1111-4111-8111-111111111111',cid='22222222-2222-4222-8222-222222222222';
const initial={id:cid,student:sid,slot:'weekly',original_day:'2026-10-31',day:'2026-10-31',minute:540,duration:60,estimated_fee:1000,status:'planned',needs_makeup:false,original:null};
async function setup(page:Page,makeup=false,legacyZero=false){
 const calls:Record<string,any>[]=[];let sessions=[{...initial,estimated_fee:legacyZero?0:initial.estimated_fee,original:makeup?'original-session':null}],lessons:Record<string,any>[]=legacyZero?[{id:'historic',student:sid,day:'2026-10-30',fee:400,original_fee:0,fee_source:'signing_rate',voided:null,created:'2026-10-30'}]:[];
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{
  const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));
  localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'test@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}));
 });
 await page.route('https://classsign-test.invalid/**',async route=>{
  const url=new URL(route.request().url());let result:any=[];
  if(url.pathname.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
  if(url.pathname.endsWith('/teacher_access'))result={user_id:'teacher'};
  if(url.pathname.endsWith('/students'))result=[{id:sid,name:'測試學生',fee:1200,active:1,created:'2026-10-01'}];
  if(url.pathname.endsWith('/lesson_records'))result=lessons;
  if(url.pathname.endsWith('/rpc/studio_action')){
   const b=route.request().postDataJSON().b;calls.push(b);
   if(b.action==='calendar')result={sessions:sessions.filter(c=>c.day>=b.from&&c.day<=b.to),slots:[],pending:sessions.filter(c=>c.status==='leave'&&c.needs_makeup),makeups:makeup?sessions.filter(c=>c.status==='planned'):[],origins:makeup?[{...initial,id:'original-session',day:'2026-10-17',status:'leave',needs_makeup:true}]:[],events:[]};
   else if(b.action==='student_schedule')result={slots:[],next:null};
   else if(b.action==='leave'){sessions=sessions.map(c=>({...c,status:'leave',needs_makeup:b.needsMakeup}));result={ok:true};}
   else if(b.action==='oneoff_lesson'){lessons.push({id:b.id,student:b.student,day:b.day,fee:1200,voided:null});result={ok:true};}
   else if(b.action==='lesson'){lessons.push({id:b.id,student:sid,day:b.day,fee:b.actualFee,voided:null});sessions=sessions.map(c=>({...c,status:'signed'}));result={ok:true};}
   else result={ok:true};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');if(page.viewportSize()!.width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'課表',exact:true}).click();else await page.getByRole('button',{name:'日／週課表'}).click();
 await expect(page.getByRole('button',{name:/09:00–10:00/}).first()).toBeVisible();return calls;
}
async function ink(page:Page,label:string){
 const canvas=page.getByLabel(label+'手寫區'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+30,box.y+40);await page.mouse.down();await page.mouse.move(box.x+130,box.y+70,{steps:8});await page.mouse.up();
}
test('day/week navigation and recurring form preserve 60-minute default',async({page})=>{
 const calls=await setup(page);
 await expect(page.getByText('在學學生',{exact:true})).toHaveCount(0);
 await expect(page.getByText('本月授課應收',{exact:true})).toHaveCount(0);
 expect(calls.at(-1)).toMatchObject({action:'calendar',from:'2026-10-26',to:'2026-11-01'});
 await page.getByRole('button',{name:'日檢視',exact:true}).click();
 await expect.poll(()=>calls.at(-1)?.from).toBe('2026-10-31');
 expect(calls.at(-1)?.to).toBe('2026-10-31');
 await page.getByRole('button',{name:'下一日'}).click();
 await expect.poll(()=>calls.at(-1)?.from).toBe('2026-11-01');
 await page.getByRole('button',{name:'固定每週課表'}).click();
 await expect(page.getByLabel('課程長度')).toHaveValue('60');
 await page.getByLabel('生效日期').fill('2026-11-02');
 await page.getByRole('button',{name:'確認儲存'}).click();
 await expect.poll(()=>calls.find(c=>c.action==='slot')).toMatchObject({student:sid,starts:'2026-11-02',duration:60,weekday:1,minute:540});
});
test('leave requires a per-class choice and displays the pending makeup',async({page})=>{
 const calls=await setup(page);await page.getByRole('button',{name:/09:00–10:00/}).click();
 await page.getByRole('button',{name:'請假',exact:true}).click();
 await expect(page.getByLabel('這次請假是否需要補課')).toHaveValue('');
 await page.getByRole('button',{name:'確認儲存'}).click();expect(calls.some(c=>c.action==='leave')).toBe(false);
 await page.getByLabel('這次請假是否需要補課').selectOption('yes');await page.getByLabel('請假原因').fill('學生請假');
 await page.getByRole('button',{name:'確認儲存'}).click();
 await expect(page.getByRole('button',{name:'安排補課',exact:true})).toBeVisible();
 expect(calls.find(c=>c.action==='leave')).toMatchObject({session:cid,needsMakeup:true,reason:'學生請假'});
 await expect(page.getByText('本月已完成',{exact:true})).toHaveCount(0);
});
test('scheduled signature hides tuition and saves the scheduled fee without a checkbox',async({page})=>{
 const calls=await setup(page);await page.getByRole('button',{name:/09:00–10:00/}).click();await page.getByRole('button',{name:'開啟師生簽到'}).click();
 await expect(page.getByLabel('上課日期')).toBeDisabled();
 const dialog=page.getByRole('dialog');
 await expect(dialog).not.toContainText('學費');await expect(dialog).not.toContainText('$');
 await expect(dialog.getByRole('checkbox')).toHaveCount(0);await expect(dialog.locator('input[type="number"]')).toHaveCount(0);
 const submit=page.getByRole('button',{name:'確認雙方簽署並儲存'});await expect(submit).toBeDisabled();
 await ink(page,'老師簽名');await expect(submit).toBeDisabled();await ink(page,'學生／家長簽名');await expect(submit).toBeEnabled();await submit.click();
 await expect.poll(()=>calls.find(c=>c.action==='lesson')).toMatchObject({session:cid,student:sid,actualFee:1000,feeConfirmed:true,day:'2026-10-31'});
 expect(calls.find(c=>c.action==='lesson')?.teacher).toMatch(/^data:image\/png;base64,/);
 await expect(page.getByText('本月已完成',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'學生資料夾',exact:false}).click();
 await expect(page.getByText('本月已完成').locator('..')).toContainText('1');
});
test('mobile calendar scrolls inside its container',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-results/schedule-mobile.png',fullPage:true});
});
test('arranged makeup remains visible until signed and links its original leave outside this week',async({page})=>{
 await setup(page,true);
 await expect(page.getByRole('heading',{name:'已安排補課（待完成雙簽）'})).toBeVisible();
 await page.getByRole('button',{name:/09:00–10:00/}).last().click();
 await page.getByRole('button',{name:'2026-10-17 09:00 · 測試學生'}).click();
 await expect(page.getByRole('dialog')).toContainText('2026-10-17 09:00–10:00 · 請假');
 await expect(page.getByText('本月已完成',{exact:true})).toHaveCount(0);
});

test('calendar dialogs and pending makeup never render tuition',async({page})=>{
 await setup(page);await expect(page.locator('main')).not.toContainText(/學費|NT\$|應收|計費/);
 await page.getByRole('button',{name:/09:00–10:00/}).click();
 await expect(page.getByRole('dialog')).not.toContainText(/學費|NT\$/);
 await page.getByRole('button',{name:'請假',exact:true}).click();await page.getByLabel('這次請假是否需要補課').selectOption('yes');await page.getByRole('button',{name:'確認儲存'}).click();
 await expect(page.locator('main')).not.toContainText(/學費|NT\$/);
 await page.getByRole('button',{name:'安排補課',exact:true}).click();await expect(page.getByRole('dialog')).not.toContainText(/學費|NT\$/);
});
test('collapsed tablet layout fits seven days and removes other page entrances',async({page})=>{
 await page.setViewportSize({width:1024,height:768});await setup(page);
 await page.getByRole('button',{name:'收合功能列',exact:true}).click();
 await expect(page.getByRole('button',{name:'學生資料夾',exact:false})).toBeHidden();
 await expect(page.locator('aside')).toBeHidden();
 for(const size of [{width:1024,height:768},{width:768,height:1024}]){
  await page.setViewportSize(size);
  const sizes=await page.locator('.calendar.week').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,children:el.children.length,right:el.lastElementChild!.getBoundingClientRect().right,viewport:innerWidth,bottom:el.getBoundingClientRect().bottom,viewportHeight:innerHeight}));
  expect(sizes.children).toBe(7);expect(sizes.scroll).toBeLessThanOrEqual(sizes.width+1);expect(sizes.right).toBeLessThanOrEqual(sizes.viewport);expect(sizes.bottom).toBeLessThanOrEqual(sizes.viewportHeight);
 }
 await page.screenshot({path:'test-results/tablet-seven-days.png',fullPage:true});
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const toggle=await page.getByRole('button',{name:'展開功能列',exact:true}).boundingBox();expect(toggle!.x).toBe(8);expect(toggle!.y).toBe(8);
 await page.reload();await expect(page.locator('aside')).toBeHidden();
 await page.getByRole('button',{name:'展開功能列'}).click();await expect(page.getByRole('button',{name:'學生資料夾',exact:false})).toBeVisible();
});
test('one-off signing selects a student and time, clears signatures after edits and submits without fee fields',async({page})=>{
 const calls=await setup(page);await page.getByRole('button',{name:'＋ 單堂簽到'}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).not.toContainText(/學費|NT\$/);await expect(page.getByLabel('簽到學生')).toHaveValue(sid);
 await page.getByLabel('上課日期').fill('2026-10-30');await page.getByLabel('上課開始時間').fill('15:00');
 await ink(page,'老師簽名');await ink(page,'學生／家長簽名');
 const submit=page.getByRole('button',{name:'確認雙方簽署並儲存'});await expect(submit).toBeEnabled();
 await page.getByLabel('上課開始時間').fill('15:30');await expect(submit).toBeDisabled();
 await ink(page,'老師簽名');await ink(page,'學生／家長簽名');await submit.click();
 await expect.poll(()=>calls.find(c=>c.action==='oneoff_lesson')).toMatchObject({student:sid,day:'2026-10-30',minute:930,duration:60});
 expect(calls.find(c=>c.action==='oneoff_lesson')).not.toHaveProperty('actualFee');
});

test('legacy zero schedule signs at current fee and folder preserves historical resolved fee',async({page})=>{
 const calls=await setup(page,false,true);await page.getByRole('button',{name:/09:00–10:00/}).click();await page.getByRole('button',{name:'開啟師生簽到'}).click();
 await ink(page,'老師簽名');await ink(page,'學生／家長簽名');await page.getByRole('button',{name:'確認雙方簽署並儲存'}).click();
 await expect.poll(()=>calls.find(c=>c.action==='lesson')).toMatchObject({actualFee:1200,session:cid});
 await page.getByRole('button',{name:'學生資料夾',exact:false}).click();await page.getByRole('button',{name:/測試學生.*堂/}).click();
 const history=page.getByRole('button').filter({hasText:'2026-10-30'});await expect(history).toContainText('$400');await expect(history).toContainText('原紀錄 $0');
 await expect(page.getByRole('button').filter({hasText:'2026-10-31'}).last()).toContainText('$1,200');
});
