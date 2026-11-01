import {test,expect} from '@playwright/test';
for(const width of [390,1180])test('custom negative deduction is visible, removable, restorable and printable '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.install({time:new Date('2026-11-01T02:00:00Z')});await page.goto('/previews/billing/');
 if(width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'收費',exact:true}).click();else await page.getByRole('button',{name:/學費袋與收款/}).click();
 await page.locator('.invoice-list button').filter({hasText:'陳以安'}).click();
 await page.getByRole('button',{name:'＋ 自訂費用',exact:true}).click();await page.getByLabel('自訂費用名稱').fill('10月請假不補課扣除');
 await page.getByLabel('自訂費用金額（TWD）').fill('-800');await page.getByLabel('自訂費用備註').fill('原學費已收，尚未抵扣');await page.getByRole('button',{name:'加入自訂費用'}).click();
 const article=page.locator('.invoice-print');await expect(article).toContainText('2,750');await expect(article.getByRole('row').filter({hasText:'10月請假不補課扣除'})).toContainText('-$800');
 await page.screenshot({path:`artifacts/custom-deductions/${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'刪除費用：10月請假不補課扣除'}).click();await expect(article).toContainText('3,550');
 await page.getByText('已刪除費用（可還原）',{exact:true}).click();await page.locator('.lesson').filter({hasText:'10月請假不補課扣除'}).getByRole('button',{name:'還原費用'}).click();await expect(article).toContainText('2,750');
 await page.emulateMedia({media:'print'});await expect(article).toContainText('10月請假不補課扣除');await expect(article).toContainText('-$800');await expect(page.getByRole('button',{name:'加入自訂費用'})).toBeHidden();await page.emulateMedia({media:'screen'});
 await page.getByLabel('自訂費用名稱').fill('不應加入零元');await page.getByLabel('自訂費用金額（TWD）').fill('0');await page.getByRole('button',{name:'加入自訂費用'}).click();await expect(page.getByRole('alert')).toContainText('非零整數');
});
