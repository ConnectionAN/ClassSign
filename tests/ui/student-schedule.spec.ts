import {test,expect,type Page} from '@playwright/test';
const sid='11111111-1111-4111-8111-111111111111',slot='22222222-2222-4222-8222-222222222222';
async function setup(page:Page){
 let active=1,notes='',studentName='測試學生';let summary={slots:[{id:slot,weekday:1,minute:540,duration:60,starts:'2026-10-01',ends:null}],next:{day:'2026-11-03',minute:600,duration:60,source:'moved'}};const calls:any[]=[];
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'teacher@example.com',app_metadata:{},user_metadata:{},aud:'authenticated'}}))});
 await page.route('https://classsign-test.invalid/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result:any=[];
  if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
  if(path.endsWith('/rpc/account_action')){calls.push(route.request().postDataJSON().b);result={user_id:'teacher',is_admin:false,disabled:false}};
  if(path.endsWith('/rpc/report_snapshot'))result={generated_at:'2026-10-31T02:00:00Z',students:[],invoices:[],items:[],payments:[],adjustments:[],materials:[],lessons:[],sessions:[],pending:[]};
  if(path.endsWith('/students'))result=[{id:sid,name:studentName,fee:800,active,notes,created:'2026-10-01'}];
  if(path.endsWith('/rpc/studio_action')){
   const b=route.request().postDataJSON().b;calls.push(b);
   if(b.action==='calendar')result={sessions:[],slots:[],pending:[],makeups:[],origins:[],events:[]};
   else if(b.action==='student_schedule')result=active?summary:{slots:[],next:null};
   else if(b.action==='replace_slot'){summary={slots:[{id:'replacement',weekday:b.weekday,minute:b.minute,duration:b.duration,starts:b.starts,ends:null}],next:{day:'2026-11-05',minute:b.minute,duration:b.duration,source:'regular'}};result={ok:true}}
   else if(b.action==='student_notes'){notes=b.notes;result={ok:true}}
   else if(b.action==='student_rename'){studentName=b.name;result={ok:true}}
   else if(b.action==='archive'){active=active?0:1;result={ok:true}}
   else result={ok:true};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');return calls;
}
async function folder(page:Page){await page.getByRole('button',{name:'學生資料夾',exact:false}).click();await page.getByRole('button',{name:/測試學生.*堂/}).click();await expect(page.getByRole('region',{name:'學生上課時間'})).toBeVisible()}
test('system opens on the weekly schedule and folder distinguishes regular and next adjusted time',async({page})=>{
 await setup(page);await expect(page.getByRole('heading',{name:'安排每一堂學習。'})).toBeVisible();await expect(page.getByText('在學學生',{exact:true})).toHaveCount(0);
 await folder(page);const section=page.getByRole('region',{name:'學生上課時間'});await expect(section.getByText('週一 09:00',{exact:true})).toBeVisible();await expect(section).toContainText('2026-11-03 10:00（調課）');
});
test('folder edits a recurring slot with an effective date then refreshes the display',async({page})=>{
 const calls=await setup(page);await folder(page);await page.getByRole('button',{name:'編輯固定時段'}).click();
 await page.getByLabel('生效日期').fill('2026-11-02');await page.getByLabel('每週星期').selectOption('4');await page.getByLabel('表定開始時間').fill('14:00');
 await page.getByRole('button',{name:'儲存固定時段'}).click();await expect(page.getByRole('region',{name:'學生上課時間'})).toContainText('週四 14:00');
 expect(calls.find(b=>b.action==='replace_slot')).toMatchObject({student:sid,slot,starts:'2026-11-02',weekday:4,minute:840,duration:60});
 await page.screenshot({path:'test-results/student-folder-schedule.png',fullPage:true});
});
test('archived folder shows no next lesson or editable recurring slots',async({page})=>{
 const calls=await setup(page);await folder(page);await page.getByRole('button',{name:'封存學生',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('含調課與補課');await page.getByRole('dialog').getByRole('button',{name:'確認',exact:true}).click();
 await expect(page.getByRole('region',{name:'學生上課時間'})).toContainText('已停止後續排課');await expect(page.getByRole('button',{name:'編輯固定時段'})).toHaveCount(0);expect(calls.some(b=>b.action==='archive'&&b.student===sid)).toBe(true);
});

test('student notes save multiline text and remain visible after reopening the folder',async({page})=>{
 const calls=await setup(page);await folder(page);
 await page.getByRole('textbox',{name:'學生備註',exact:true}).fill('教材：第一冊\n下週帶樂譜 <script>');await page.getByRole('button',{name:'儲存備註'}).click();
 await expect.poll(()=>calls.find(b=>b.action==='student_notes')).toMatchObject({student:sid,notes:'教材：第一冊\n下週帶樂譜 <script>',expectedNotes:''});
 await page.getByRole('button',{name:'日／週課表'}).click();await folder(page);
 await expect(page.getByRole('textbox',{name:'學生備註',exact:true})).toHaveValue('教材：第一冊\n下週帶樂譜 <script>');
});

test('student list and selected details scroll independently on a tablet',async({page})=>{
 await page.setViewportSize({width:1024,height:768});await setup(page);
 await page.route('https://classsign-test.invalid/rest/v1/students**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:40},(_,i)=>({id:i===0?sid:`student-${i}`,name:i===0?'測試學生':`其他學生${String(i).padStart(2,'0')}`,fee:800,active:1,notes:'',created:'2026-10-01'})))}));
 await page.route('https://classsign-test.invalid/rest/v1/lesson_records**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:60},(_,i)=>({id:`lesson-${i}`,student:sid,day:'2026-10-01',fee:800,voided:null,created:'2026-10-01'})))}));
 await page.reload();await folder(page);
 const workspace=page.locator('.workspace'),left=page.locator('.student-list'),right=page.locator('.workspace>.records');
 await workspace.evaluate(el=>el.scrollIntoView({block:'start'}));
 const beforeY=await page.evaluate(()=>window.scrollY),leftTop=await left.evaluate(el=>el.scrollTop);
 const rightBox=(await right.boundingBox())!;await page.mouse.move(rightBox.x+rightBox.width/2,rightBox.y+200);await page.mouse.wheel(0,500);
 await expect.poll(()=>right.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 expect(await left.evaluate(el=>el.scrollTop)).toBe(leftTop);expect(await page.evaluate(()=>window.scrollY)).toBe(beforeY);
 const rightTop=await right.evaluate(el=>el.scrollTop),leftBox=(await left.boundingBox())!;
 await page.mouse.move(leftBox.x+leftBox.width/2,leftBox.y+100);await page.mouse.wheel(0,-350);
 await expect.poll(()=>left.evaluate(el=>el.scrollTop)).toBeLessThan(leftTop);
 expect(await right.evaluate(el=>el.scrollTop)).toBe(rightTop);expect(await page.evaluate(()=>window.scrollY)).toBe(beforeY);
 const button=await page.getByRole('button',{name:'收合功能列',exact:true}).boundingBox();expect(button!.x).toBe(8);expect(button!.y).toBe(8);
 await page.screenshot({path:'test-results/independent-student-panes.png',fullPage:false});
 // At a pane boundary, upward wheel movement must return to the page overview.
 await right.evaluate(el=>el.scrollTop=0);await page.mouse.move(rightBox.x+rightBox.width/2,rightBox.y+200);await page.mouse.wheel(0,-1200);
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeLessThan(beforeY);
});

test('collapsing navigation preserves the current page and student selection',async({page})=>{
 await setup(page);await folder(page);await page.getByRole('textbox',{name:'學生備註',exact:true}).fill('尚未儲存');
 await page.getByRole('button',{name:'收合功能列',exact:true}).click();await expect(page.getByRole('region',{name:'學生上課時間'})).toBeVisible();await expect(page.getByRole('textbox',{name:'學生備註',exact:true})).toHaveValue('尚未儲存');
 await page.getByRole('button',{name:'展開功能列',exact:true}).click();await page.getByRole('button',{name:/統計報表/}).click();await expect(page.getByRole('button',{name:'匯出 CSV'})).toBeVisible();
 await page.getByRole('button',{name:'收合功能列',exact:true}).click();await expect(page.getByRole('button',{name:'匯出 CSV'})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'匯出 CSV'})).toBeVisible();
});

test('same-user sign-in notification preserves the workspace and unsaved notes',async({page})=>{
 const calls=await setup(page);await folder(page);await page.getByRole('textbox',{name:'學生備註',exact:true}).fill('重新驗證也保留');const before=calls.filter(b=>b.action==='status').length;
 await page.evaluate(()=>{const session=JSON.parse(localStorage.getItem('sb-classsign-test-auth-token')!);const channel=new BroadcastChannel('sb-classsign-test-auth-token');channel.postMessage({event:'SIGNED_IN',session});channel.close()});
 await expect.poll(async()=>{await page.clock.runFor(100);return calls.filter(b=>b.action==='status').length}).toBeGreaterThan(before);await expect(page.getByRole('textbox',{name:'學生備註',exact:true})).toHaveValue('重新驗證也保留');
 await page.getByRole('button',{name:'收合功能列',exact:true}).click();await expect(page.getByRole('textbox',{name:'學生備註',exact:true})).toHaveValue('重新驗證也保留');
});

test('student name edit saves the same student identifier and refreshes the folder',async({page})=>{
 const calls=await setup(page);await folder(page);await page.getByRole('button',{name:'編輯學生姓名',exact:true}).click();
 await page.getByRole('dialog').getByLabel('學生姓名',{exact:true}).fill('更正後姓名');await page.getByRole('button',{name:'儲存姓名',exact:true}).click();
 await expect(page.getByRole('heading',{name:'更正後姓名',exact:true})).toBeVisible();expect(calls.find(b=>b.action==='student_rename')).toMatchObject({student:sid,name:'更正後姓名',expectedName:'測試學生'});
});
