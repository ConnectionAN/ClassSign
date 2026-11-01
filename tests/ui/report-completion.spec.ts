import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {setup} from './report-fixture';
const sizes=[[320,900],[375,900],[390,900],[430,900],[768,1024],[1024,768],[1280,900],[1440,900]];
const titles=['營運總覽','學費袋報表','實際收款報表','課務統計','教材代收報表'];
for(const [width,height] of sizes)test('completion comparison '+width+'x'+height,async({page,browserName})=>{
 await page.setViewportSize({width,height});await setup(page);
 const phase=process.env.REPORT_PHASE||'after',dir=`artifacts/completion/${browserName}/${phase}`;fs.mkdirSync(dir,{recursive:true});
 for(let i=0;i<titles.length;i++){
  await page.getByRole('tab',{name:titles[i],exact:true}).click();await expect(page.locator('.report-print h2').first()).toHaveText(titles[i]);
  if(width<768&&phase==='after'&&i===0){await expect(page.locator('.mobile-report-details')).not.toHaveAttribute('open','');await page.locator('.mobile-report-details summary').click()}
  await page.screenshot({path:`${dir}/${width}-${i}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(phase==='after'){
   const failures=await page.locator('.reports').evaluate(root=>{
    const lum=(rgb:string)=>{const c=(rgb.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
    return [...root.querySelectorAll<HTMLElement>('h2,h3,p,span,strong,summary,label,button,input,select,th,td,small')].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height&&!el.closest('[disabled]')&&((el.matches('input')&&!!(el as HTMLInputElement).value)||[...el.childNodes].some(n=>n.nodeType===3&&n.textContent?.trim()))).flatMap(el=>{
     const st=getComputedStyle(el);if(st.visibility==='hidden')return [];let bg='',parent:Element|null=el;while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement}if(!parent)bg='rgb(255,255,255)';const a=lum(st.color),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),minimum=parseFloat(st.fontSize)>=24||(parseFloat(st.fontSize)>=18.66&&Number(st.fontWeight)>=700)?3:4.5;return ratio+.01<minimum?[{text:el.textContent?.slice(0,60),ratio,minimum}]:[];
    });
   });expect(failures).toEqual([]);
  }
  if(width===1440){
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 CSV'}).click();const file=await download;const csv=fs.readFileSync((await file.path())!,'utf8');
   fs.writeFileSync(`${dir}/${i}.csv`,csv);
   if(phase==='after')expect(csv).toBe(fs.readFileSync(`tests/fixtures/report-baseline/${i}.csv`,'utf8'));
  }
  await page.emulateMedia({media:'print'});await expect(page.locator('.report-table')).toBeVisible();
  if(width===1440&&browserName==='chromium')await page.pdf({path:`${dir}/${i}-A4.pdf`,format:'A4'});
  await page.emulateMedia({media:'screen'});
 }
});

test('keyboard tabs, focus and collapsed mobile controls',async({page})=>{
 await setup(page);const first=page.getByRole('tab',{name:'營運總覽',exact:true});await first.focus();
 for(const key of ['ArrowRight','End','Home']){await page.keyboard.press(key);const tab=page.getByRole('tab',{selected:true});await expect(tab).toBeFocused();expect(await tab.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid')}
 await page.setViewportSize({width:390,height:900});await expect(page.locator('.mobile-report-details')).not.toHaveAttribute('open','');
 const summary=page.locator('.mobile-report-details summary');await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('.mobile-report-card').first()).toBeVisible();
 await page.getByText('篩選、匯出與列印',{exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'匯出 CSV'})).toBeVisible();
});

test('graphics preserve zero, negative reversal and overpayment values',async({page})=>{
 const {data}=await setup(page);await expect(page.getByRole('meter')).toHaveAttribute('aria-valuetext','68.2% 已配置');
 for(const item of data.items)item.amount=0;for(const payment of data.payments)payment.amount=0;
 await page.getByRole('button',{name:'更新報表'}).click();await expect(page.getByRole('meter')).toHaveCount(0);await expect(page.locator('.report-collection')).toContainText('本期無正數正式應收');
 data.items.find((i:any)=>i.invoice==='v').amount=1000;data.payments.find((p:any)=>p.id==='p').amount=-200;
 await page.getByRole('button',{name:'更新報表'}).click();await expect(page.locator('.report-collection')).toContainText('已配置收款為負數');await expect(page.getByRole('meter')).toHaveCount(0);
 await page.getByRole('tab',{name:'實際收款報表',exact:true}).click();await expect(page.getByRole('region',{name:'收款方式淨額'})).toContainText('-NT$200');
 data.payments.find((p:any)=>p.id==='p').amount=1500;await page.getByRole('button',{name:'更新報表'}).click();await page.getByRole('tab',{name:'營運總覽',exact:true}).click();
 await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow','100');await expect(page.getByRole('meter')).toHaveAttribute('aria-valuetext','150.0% 已配置');
 await expect(page.locator('.report-collection')).toContainText('圖形以 100% 為上限');
});

test('A4 multi-page materials keep all rows and repeated headings',async({page,browserName})=>{
 const {data}=await setup(page);for(let i=1;i<=65;i++)data.materials.push({id:'many-'+i,student:'s',name:`教材 ${String(i).padStart(2,'0')} - 長文字版本與教材說明`,purchased:'2026-10-20',quantity:i,unit_price:100,cancelled:false});
 await page.getByRole('button',{name:'更新報表'}).click();await page.getByRole('tab',{name:'教材代收報表',exact:true}).click();
 await expect(page.locator('.report-table tbody tr')).toHaveCount(67);await page.emulateMedia({media:'print'});await expect(page.locator('.report-table')).toBeVisible();
 expect(await page.locator('thead').evaluate(el=>getComputedStyle(el).display)).toBe('table-header-group');
 if(browserName==='chromium')await page.pdf({path:'artifacts/completion/materials-multipage.pdf',format:'A4'});
});
