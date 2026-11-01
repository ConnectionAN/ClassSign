import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
for(const width of [320,375,390,430,768,1024,1280,1440])test('Phase 1 billing responsive '+width,async({page,browserName})=>{
 await page.setViewportSize({width,height:width===768?1024:900});
 await page.clock.install({time:new Date('2026-11-01T02:00:00Z')});
 await page.goto('/previews/billing/');
 if(width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'收費',exact:true}).click();
 else await page.getByRole('button',{name:/學費袋與收款/}).click();
 const phase=process.env.UI142_PHASE||'after';const dir=path.resolve('artifacts/visual-v142',browserName==='webkit'?'webkit-'+phase:phase);fs.mkdirSync(dir,{recursive:true});
 const field=page.getByLabel('收費月份');await expect(field).toHaveValue('2026-11');
 const bounds=await field.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement!.getBoundingClientRect();return {left:a.left,right:a.right,parentLeft:b.left,parentRight:b.right}});
 expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft-1);expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight+1);
 if(width<768)await expect(page.locator('.mobile-navigation svg')).toHaveCount(4);
 for(const [key,name] of [['draft','陳以安'],['issued','林沐晴'],['partial','許品言'],['paid','張予樂'],['void','吳若晴']]){
  if(key==='void')await page.getByRole('group',{name:'學費袋分類'}).getByRole('button',{name:/作廢紀錄/}).click();
  await page.locator('.invoice-list button').filter({hasText:name}).click();
  await expect(page.locator('.invoice-print')).toContainText(name);
  await page.locator('.invoice-print').scrollIntoViewIfNeeded();await page.mouse.move(0,0);
  await page.screenshot({path:path.join(dir,`${width}-${key}.png`),fullPage:true,animations:'disabled'});
  if(phase==='after')expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.getByRole('group',{name:'學費袋分類'}).getByRole('button',{name:/有效學費袋/}).click();
 await page.locator('.invoice-list button').filter({hasText:'許品言'}).click();
 if(phase==='after'){
  const card=page.locator('.invoice-list button').filter({hasText:'許品言'});await card.focus();await expect(card).toBeFocused();await page.keyboard.press('Enter');await expect(card).toHaveAttribute('aria-pressed','true');
  expect(await card.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
  const ratios=await page.locator('.billing .primary:not(:disabled),.billing .ui-status').evaluateAll(els=>{
   const lum=(rgb:string)=>{const c=(rgb.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
   return els.map(el=>{const s=getComputedStyle(el),a=lum(s.color),b=lum(s.backgroundColor);return {text:el.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
  });for(const r of ratios)expect(r.ratio,r.text||'contrast').toBeGreaterThanOrEqual(4.5);
 }
 await page.emulateMedia({media:'print'});await expect(page.locator('.invoice-print')).toBeVisible();await expect(page.getByRole('button',{name:'確認收款',exact:true})).toBeHidden();
 await page.screenshot({path:path.join(dir,`${width}-print.png`),fullPage:true});
 if(width===1440&&browserName==='chromium')await page.pdf({path:path.join(dir,'billing-A4.pdf'),format:'A4'});
 await page.emulateMedia({media:'screen'});
 if(width<768)await page.getByRole('navigation',{name:'手機主要導覽'}).getByRole('button',{name:'學生',exact:true}).click();
 else await page.getByRole('button',{name:/學生資料夾/}).click();
 await expect(page.locator('.student-metrics .ui-metric-icon svg')).toHaveCount(3);
 await page.locator('.student-metrics').screenshot({path:path.join(dir,`${width}-student-metrics.png`)});
});


