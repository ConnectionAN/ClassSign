import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 const students=[{id:'late',name:'林小王',active:1},{id:'none',name:'未排課學生',active:1},{id:'mid',name:'李王明',active:1},{id:'early',name:'王小安',active:1},{id:'sun',name:'陳小美',active:1},{id:'archived',name:'王舊生',active:0}].map(s=>({...s,fee:800}));
 let slots=[{student:'early',weekday:1,minute:540},{student:'late',weekday:1,minute:600},{student:'mid',weekday:2,minute:540},{student:'sun',weekday:7,minute:540},{student:'archived',weekday:1,minute:480}].map(s=>({...s,starts:'2026-01-01',ends:null}));
 const invoices=students.map(s=>({id:'invoice-'+s.id,student:s.id,student_name:s.id==='early'?'更名前姓名':s.name,month:'2026-11-01',state:s.active?'issued':'void',total:800,paid:0,fingerprint:'test'}));
 const writes:any[]=[];
 await page.clock.install({time:new Date('2026-11-02T02:00:00Z')});
 await page.addInitScript(()=>{const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'test@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated'}}));sessionStorage.setItem('classsign.page.teacher','billing')});
 await page.route('https://classsign-test.invalid/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result:any=[];
  if(path.endsWith('/teacher_access'))result={user_id:'teacher'};
  if(path.endsWith('/rpc/account_action'))result={user_id:'teacher',is_admin:false,disabled:false};
  if(path.endsWith('/students'))result=students;if(path.endsWith('/weekly_slots'))result=slots;
  if(path.endsWith('/rpc/billing_action')){const b=route.request().postDataJSON().b;if(b.action!=='list')writes.push(b);result={invoices,items:[],payments:[],materials:[],adjustments:[],pending:[],audit:[],exclusions:[]}}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');await expect(page.getByLabel('學生',{exact:true}).locator('option')).toHaveCount(6);
 return {writes,changeSlots:()=>{slots=slots.map(s=>s.student==='late'?{...s,minute:500}:s)}};
}
for(const width of [320,390,768,1180])test('lesson order and substring student suggestions '+width,async({page})=>{
 await page.setViewportSize({width,height:900});const {writes,changeSlots}=await setup(page);
 const picker=page.getByLabel('學生',{exact:true});await expect(picker.locator('option')).toHaveText(['選擇學生','王小安','林小王','李王明','陳小美','未排課學生']);
 const input=page.getByRole('combobox',{name:'搜尋學生',exact:true});await input.fill('王');
 const options=page.getByRole('listbox',{name:'搜尋學生建議'}).getByRole('option');await expect(options).toHaveCount(4);await expect(options).toContainText(['王舊生','王小安','林小王','李王明']);
 await page.screenshot({path:`artifacts/billing-search/${width}.png`,fullPage:true});
 await page.keyboard.press('ArrowDown');await expect(input).toHaveAttribute('aria-activedescendant',/.+-0$/);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(input).toHaveValue('王小安');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(page.locator('.invoice-list button')).toHaveCount(1);await expect(page.locator('.invoice-list')).toContainText('更名前姓名');expect(writes).toEqual([]);
 await input.fill('小王');await page.getByRole('listbox',{name:'搜尋學生建議'}).getByRole('option',{name:'林小王',exact:true}).click();await expect(page.locator('.invoice-list')).toContainText('林小王');
 await input.fill(' 王 ');await expect(page.getByRole('listbox',{name:'搜尋學生建議'}).getByRole('option')).toHaveCount(4);await page.keyboard.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);
 await input.fill('不存在');await expect(page.getByRole('status').filter({hasText:'沒有姓名包含'})).toBeVisible();
 await input.fill('');await expect(page.locator('.invoice-list button')).toHaveCount(5);await expect(page.getByRole('listbox')).toHaveCount(0);
 changeSlots();await page.getByRole('button',{name:/重新整理/}).click();await expect(picker.locator('option').nth(1)).toHaveText('林小王');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(writes).toEqual([]);
});
