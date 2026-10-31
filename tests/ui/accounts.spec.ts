import {test,expect,type Page} from '@playwright/test';
const adminEmail='a942065123@gmail.com';
async function setup(page:Page,admin=false){
 const user='teacher';const calls:any[]=[];let suspended=false,disabledSession=false;
 await page.clock.install({time:new Date('2026-10-31T02:00:00Z')});
 await page.addInitScript(()=>{
  const payload=btoa(JSON.stringify({sub:'teacher',exp:2000000000,role:'authenticated'}));
  localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'teacher',email:'member@example.com',identities:[{provider:'google'}],app_metadata:{provider:'google'},user_metadata:{},aud:'authenticated'}}));
 });
 await page.route('https://classsign-test.invalid/**',async route=>{
  const url=new URL(route.request().url());let result:any=[];
  if(url.pathname.endsWith('/logout'))return route.fulfill({status:204});
  if(url.pathname.endsWith('/teacher_access'))result={user_id:user};
  if(url.pathname.endsWith('/rpc/account_action')){
   const b=route.request().postDataJSON().b;calls.push(b);
   if(b.action==='status'&&disabledSession)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'disabled'})});
   result={user_id:user,is_admin:admin,disabled:false};
   if(b.action==='list')result={is_admin:admin,accounts:[{user_id:'admin',email:adminEmail,is_admin:true,disabled:false,first_login:'2026-10-01',last_login:'2026-10-31'},{user_id:'member',email:'member@example.com',is_admin:false,disabled:suspended,first_login:'2026-10-02',last_login:'2026-10-31'}]};
   if(b.action==='set_status'){suspended=b.disabled;result={ok:true}}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');await expect(page.getByRole('button',{name:'帳號管理',exact:false})).toBeVisible();return {calls,disableSession:()=>{disabledSession=true}};
}
test('first Google login bootstraps automatically and ordinary account sees a read-only directory',async({page})=>{
 const {calls}=await setup(page);expect(calls.some(x=>x.action==='bootstrap')).toBe(true);
 await expect(page.getByRole('button',{name:'確認並連結 Google'})).toHaveCount(0);
 await page.getByRole('button',{name:'帳號管理',exact:false}).click();
 await expect(page.getByRole('cell',{name:adminEmail,exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'member@example.com',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'停用帳號',exact:true})).toHaveCount(0);
});
test('admin confirms suspension and can restore without an account creation form',async({page})=>{
 const {calls}=await setup(page,true);await page.getByRole('button',{name:'帳號管理',exact:false}).click();
 await expect(page.getByRole('button',{name:'停用帳號',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'停用帳號',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('不刪除任何歷史資料');
 await page.getByRole('dialog').getByRole('button',{name:'確認',exact:true}).click();
 await expect(page.getByRole('button',{name:'恢復帳號',exact:true})).toBeVisible();expect(calls.find(x=>x.action==='set_status')).toMatchObject({user_id:'member',disabled:true});
 await page.getByRole('button',{name:'恢復帳號',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'確認',exact:true}).click();
 await expect(page.getByRole('button',{name:'停用帳號',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'新增帳號'})).toHaveCount(0);
});
test('an already open workspace is cleared when its account is suspended',async({page})=>{
 const fixture=await setup(page);fixture.disableSession();await page.clock.runFor(15001);
 await expect(page.getByRole('button',{name:'使用 Google 帳號登入',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('停用');
 await expect(page.getByRole('button',{name:'帳號管理',exact:false})).toHaveCount(0);
});
