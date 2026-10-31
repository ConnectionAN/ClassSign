import {test,expect} from '@playwright/test';
test('real SDK exchanges a code-only Google callback and bootstraps the new account',async({page})=>{
 let exchanged=false,bootstrapped=false;
 await page.route('https://classsign-test.invalid/**',async route=>{
  const url=new URL(route.request().url());let result:any=[];
  if(url.pathname.endsWith('/authorize'))return route.fulfill({status:302,headers:{location:'http://127.0.0.1:4185/?code=fresh-code'}});
  if(url.pathname.endsWith('/token')){
   const body=route.request().postDataJSON();
   expect(body.auth_code).toBe('fresh-code');expect(body.code_verifier.length).toBeGreaterThan(40);exchanged=true;
   const payload=Buffer.from(JSON.stringify({sub:'new-google',exp:2000000000,role:'authenticated'})).toString('base64url');
   result={access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_in:3600,token_type:'bearer',user:{id:'new-google',email:'new@example.invalid',identities:[{provider:'google'}],app_metadata:{provider:'google'},user_metadata:{},aud:'authenticated'}};
  }
  if(url.pathname.endsWith('/rpc/account_action')){
   if(route.request().postDataJSON().b.action==='bootstrap')bootstrapped=true;
   result={user_id:'new-google',is_admin:false,disabled:false};
  }
  if(url.pathname.endsWith('/teacher_access'))result={user_id:'new-google'};
  if(url.pathname.endsWith('/rpc/studio_action'))result={sessions:[],slots:[],pending:[],makeups:[],origins:[],events:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');await page.getByRole('button',{name:'使用 Google 帳號登入',exact:true}).click();
 await expect(page.getByRole('button',{name:'帳號管理',exact:false})).toBeVisible();
 expect(exchanged).toBe(true);expect(bootstrapped).toBe(true);
 await expect(page).toHaveURL('http://127.0.0.1:4185/');
});
test('password and Google controls coexist; cancelled Google returns a safe retry message',async({page})=>{
 await page.route('https://classsign-test.invalid/auth/v1/authorize**',route=>route.fulfill({status:302,headers:{location:'http://127.0.0.1:4185/?error=access_denied&error_description=PROVIDER_PRIVATE_DETAIL'}}));
 await page.goto('/');
 await expect(page.getByRole('button',{name:'使用帳密登入'})).toBeVisible();
 await expect(page.getByLabel('密碼',{exact:true})).toHaveAttribute('autocomplete','current-password');
 await page.getByRole('button',{name:'使用 Google 帳號登入',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('未完成');
 await expect(page).toHaveURL('http://127.0.0.1:4185/');
 await expect(page.getByText('PROVIDER_PRIVATE_DETAIL')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'使用帳密登入'})).toBeEnabled();
});
test('a signed-in Google user without teacher_access cannot open the schedule or students',async({page})=>{
 await page.addInitScript(()=>{
  const payload=btoa(JSON.stringify({sub:'unapproved',exp:2000000000,role:'authenticated'}));
  localStorage.setItem('sb-classsign-test-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.test',refresh_token:'test',expires_at:2000000000,token_type:'bearer',user:{id:'unapproved',email:'test@example.invalid',identities:[{provider:'google'}],app_metadata:{provider:'google'},user_metadata:{role:'teacher'},aud:'authenticated'}}));
 });
 let businessReads=0;
 await page.route('https://classsign-test.invalid/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(/students|lessons|fee_changes|studio_action/.test(path))businessReads++;
  await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'disabled'})});
 });
 await page.goto('/');await expect(page.getByRole('heading',{name:'無法進入教學工作室'})).toBeVisible();
 await expect(page.getByRole('button',{name:'登出並更換帳號'})).toBeVisible();
 expect(businessReads).toBe(0);
 await expect(page.getByRole('button',{name:'日／週課表'})).toHaveCount(0);
});
