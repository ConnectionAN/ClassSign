import {test,expect} from '@playwright/test';

for(const width of [390,1024])test('void moves a draft out of active bags while preserving paid bags and history '+width,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.clock.install({time:new Date('2026-11-01T02:00:00Z')});
 await page.goto('/previews/billing/');
 async function openBilling(){if(width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'收費',exact:true}).click();else await page.getByRole('button',{name:/學費袋與收款/}).click()}
 await openBilling();
 const folders=page.getByRole('group',{name:'學費袋分類'}),active=folders.getByRole('button',{name:/有效學費袋/}),archive=folders.getByRole('button',{name:/作廢紀錄/});
 const list=page.locator('.invoice-list');
 await expect(active).toHaveAttribute('aria-pressed','true');await expect(list.locator('button')).toHaveCount(4);await expect(list).not.toContainText('吳若晴');
 await page.getByLabel('狀態',{exact:true}).selectOption('已結清');await expect(list.locator('button')).toHaveCount(1);await expect(list).toContainText('張予樂');
 await page.getByLabel('狀態',{exact:true}).selectOption('草稿');await list.getByRole('button').click();
 await page.getByText('作廢學費袋',{exact:true}).click();await page.getByLabel('作廢原因',{exact:true}).fill('月份有誤，重新建立');await page.getByRole('button',{name:'確認作廢',exact:true}).click();
 await expect(page.getByRole('status',{name:'學費袋操作結果'})).toContainText('已移至「作廢紀錄」');await expect(page.locator('.invoice-print')).toHaveCount(0);await expect(list).not.toContainText('陳以安');
 await archive.focus();await page.keyboard.press('Enter');await expect(archive).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('狀態',{exact:true})).toHaveCount(0);
 await expect(list.locator('button')).toHaveCount(2);await expect(list).not.toContainText('張予樂');await list.getByRole('button').filter({hasText:'陳以安'}).click();
 const article=page.locator('.invoice-print');await expect(article).toContainText('月份有誤，重新建立');await expect(article).toContainText('11 月預定課程 4 堂');await expect(article).toContainText('已作廢');
 await expect(article.getByRole('button',{name:'確認收款',exact:true})).toHaveCount(0);await expect(article.getByRole('button',{name:'確認金額並正式開立',exact:true})).toHaveCount(0);
 await page.emulateMedia({media:'print'});await expect(article.getByText('作廢原因：月份有誤，重新建立')).toBeVisible();await expect(folders).toBeHidden();await page.emulateMedia({media:'screen'});
 await page.getByLabel('搜尋學生').fill('不存在');await expect(list.locator('button')).toHaveCount(0);await expect(page.getByRole('status',{name:'學費袋搜尋結果'})).toContainText('沒有作廢紀錄');await page.getByLabel('搜尋學生').fill('');
 // A new draft for the same student/month must return to the active folder.
 await page.getByRole('button',{name:'產生／重算草稿',exact:true}).click();await expect(active).toHaveAttribute('aria-pressed','true');await expect(article).toContainText('陳以安');await expect(article).toContainText('草稿');
 await active.click();await expect(list.locator('button')).toHaveCount(4);await expect(list).not.toContainText('已作廢');
 await list.getByRole('button').filter({hasText:'張予樂'}).click();await expect(article).toContainText('已結清');await expect(article.locator('.billing-summary')).toContainText('$3,550');
 // Remount Billing via the existing navigation; void history must remain stored.
 if(width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'學生',exact:true}).click();else await page.getByRole('button',{name:/學生資料夾/}).click();
 await openBilling();await expect(list.locator('button')).toHaveCount(4);await archive.click();await expect(list.locator('button')).toHaveCount(2);
});

test('a failed void leaves the draft in the active folder and paid bags cannot be voided',async({page})=>{
 await page.clock.install({time:new Date('2026-11-01T02:00:00Z')});await page.goto('/previews/billing/');await page.getByRole('button',{name:/學費袋與收款/}).click();
 const list=page.locator('.invoice-list');await list.getByRole('button').filter({hasText:'張予樂'}).click();await page.getByText('作廢學費袋',{exact:true}).click();await page.getByLabel('作廢原因',{exact:true}).fill('測試');await expect(page.getByRole('button',{name:'確認作廢',exact:true})).toBeDisabled();
 await list.getByRole('button').filter({hasText:'陳以安'}).click();await page.getByLabel('作廢原因',{exact:true}).fill('測試失敗不移動');
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async(input,init)=>{if(init?.body&&JSON.parse(String(init.body)).b?.action==='void')return new Response(JSON.stringify({message:'測試連線失敗'}),{status:400,headers:{'Content-Type':'application/json'}});return original(input,init)}});
 await page.getByRole('button',{name:'確認作廢',exact:true}).click();await expect(page.getByRole('alert')).toContainText('測試連線失敗');await expect(page.locator('.invoice-print')).toContainText('草稿');await expect(list.locator('button')).toHaveCount(4);await expect(page.getByRole('status',{name:'學費袋操作結果'})).toHaveCount(0);
 await page.getByRole('button',{name:/作廢紀錄/}).click();await expect(list.locator('button')).toHaveCount(1);await expect(list).not.toContainText('陳以安');
});
