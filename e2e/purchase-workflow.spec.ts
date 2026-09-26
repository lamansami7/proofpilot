import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function addPurchase(page: Page, name: string) {
  await page.getByRole('button',{name:'Protect a purchase',exact:true}).first().click();
  await page.getByRole('button',{name:'Enter details manually'}).click();
  await page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill(name);
  await page.getByRole('textbox',{name:'MERCHANT — REQUIRED',exact:true}).fill('QA test merchant');
  await page.getByRole('textbox',{name:'Purchase price',exact:true}).fill('0');
  await page.getByRole('textbox',{name:'PURCHASE DATE — REQUIRED',exact:true}).fill('2026-01-01');
  await page.getByRole('textbox',{name:'RETURN DEADLINE',exact:true}).fill('2026-12-31');
  await page.getByRole('button',{name:'Review purchase',exact:true}).click();
  await page.getByRole('button',{name:'Save purchase',exact:true}).click();
  await page.getByRole('button',{name:'View purchase record',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
for (const width of [320,375,430,768,1024,1280,1440]) {
  test(`real local purchase create, pin, edit, reload, delete at ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
    await addPurchase(page,'QA test purchase');
    await page.getByRole('button',{name:/^Pin QA/}).click();
    await expect(page.getByRole('button',{name:/^Unpin QA/})).toBeVisible();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill('QA edited purchase');
    await page.getByRole('button',{name:'Review purchase',exact:true}).click();
    await page.getByRole('button',{name:'Save purchase',exact:true}).click();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect(page.getByRole('button',{name:/^Unpin QA/})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await page.getByRole('tab',{name:/Purchases/}).click();
    await expect(page.getByText('QA edited purchase',{exact:true}).first()).toBeVisible();
    for (const tab of ['Home','Purchases','Deadlines','Vault','Settings']) {
      await page.getByRole('tab',{name:new RegExp(tab)}).click();
      await expect(page.getByRole('tab',{name:new RegExp(tab)})).toHaveAttribute('aria-selected','true');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (tab === 'Purchases' || tab === 'Deadlines') {
        const heading = await page.getByRole('heading', {name: tab === 'Purchases' ? 'Your purchases' : 'Deadline Radar', exact:true}).boundingBox();
        expect(heading!.width).toBeGreaterThan(220);
        expect(heading!.height).toBeLessThan(100);
      }
      const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      await testInfo.attach(`${tab}-axe`,{body:JSON.stringify(scan.violations,null,2),contentType:'application/json'});
      expect(scan.violations,`${tab} accessibility`).toEqual([]);
      await page.screenshot({path:testInfo.outputPath(`${tab}-${width}.png`),animations:'disabled'});
    }
    await page.getByRole('tab',{name:/Purchases/}).click();
    await page.getByText('QA edited purchase',{exact:true}).first().click();
    await page.getByRole('button',{name:'Delete this purchase',exact:true}).click();
    await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
    await expect(page.getByText('No purchases yet',{exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('dialog focus stays contained and returns to the trigger',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
  const trigger=page.getByRole('button',{name:'Protect a purchase',exact:true}).first();
  await trigger.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);}
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});

test('real file attachment, nested dialog Escape, export, and durable file cleanup',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
  await addPurchase(page,'QA receipt purchase');
  await page.getByRole('button',{name:'Add document',exact:true}).click();
  const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Receipt',exact:true}).click();
  await (await choosing).setFiles({name:'QA-receipt.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJWQAAAAASUVORK5CYII=','base64')});
  await expect(page.getByText('QA-receipt.png',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open QA-receipt.png',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'QA-receipt.png',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Preview of QA-receipt.png'})).toBeVisible();
  const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('receipt-preview-375.png'),animations:'disabled'});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'QA receipt purchase',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab',{name:/Settings/}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();
  const download=await downloading; const path=await download.path();
  const backup=JSON.parse(await readFile(path!,'utf8'));
  expect(backup.schemaVersion).toBe(1);expect(backup.purchases[0].documents[0].uri).toBeUndefined();
  expect(backup.purchases[0].documents[0].sizeBytes).toBeGreaterThan(0);
  await page.getByRole('tab',{name:/Purchases/}).click();await page.getByText('QA receipt purchase',{exact:true}).click();
  await page.getByRole('button',{name:'Delete this purchase',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>new Promise<number>((resolve,reject)=>{const r=indexedDB.open('proofpilot-documents',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('files');const get=tx.objectStore('files').count();get.onsuccess=()=>{resolve(get.result);db.close();};};}))).toBe(0);
  await page.getByRole('tab',{name:/Settings/}).click();
  const restoring=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose backup',exact:true}).click();
  await(await restoring).setFiles({name:'QA-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await page.getByRole('button',{name:'Confirm restore',exact:true}).click();
  await page.getByRole('tab',{name:/Purchases/}).click();await expect(page.getByText('QA receipt purchase',{exact:true})).toBeVisible();
});

test('two browser tabs preserve simultaneous local saves and refresh their caches',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
  const other=await context.newPage();await other.goto('/');
  await Promise.all([addPurchase(page,'QA tab one'),addPurchase(other,'QA tab two')]);
  await page.keyboard.press('Escape');await other.keyboard.press('Escape');
  for(const tab of [page,other]) {
    await tab.getByRole('tab',{name:/Purchases/}).click();
    await expect(tab.getByText('QA tab one',{exact:true})).toBeVisible();
    await expect(tab.getByText('QA tab two',{exact:true})).toBeVisible();
  }
});

test('arrow keys select and focus navigation tabs',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.getByRole('tab',{name:/Home/}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:/Purchases/})).toBeFocused();
  await expect(page.getByRole('tab',{name:/Purchases/})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End');await expect(page.getByRole('tab',{name:/Settings/})).toBeFocused();
});

test('offline reload uses only the public shell cache and retains local purchases',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();await addPurchase(page,'QA offline purchase');await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:/Settings/}).click();await expect(page.getByText('Offline start is available in this browser. Cloud and AI still require a connection.',{exact:true})).toBeVisible();
  await context.setOffline(true);await page.reload();await page.getByRole('tab',{name:/Purchases/}).click();await expect(page.getByText('QA offline purchase',{exact:true})).toBeVisible();
  const cached=await page.evaluate(async()=>{const urls:string[]=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
  expect(cached.some(url=>/functions|purchase-question|claim-draft|export|access_token|code=/.test(url))).toBe(false);
});

for (const width of [320,375,768,1024,1440]) {
  test(`empty, form validation and cleanup recovery states at ${width}px`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/'); await page.getByRole('button',{name:'Skip',exact:true}).click();
    await page.getByRole('tab',{name:/Purchases/}).click();
    await expect(page.getByText('No purchases yet',{exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`empty-${width}.png`)});
    await page.getByRole('button',{name:'Protect a purchase',exact:true}).first().click();
    await page.getByRole('button',{name:'Enter details manually'}).click();
    await page.getByRole('button',{name:'Review purchase',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true})).toBeFocused();
    await expect(page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true})).toBeInViewport();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`form-error-${width}.png`)});
    await page.keyboard.press('Escape');
    await page.evaluate(()=>localStorage.setItem('proofpilot.v1.account-purge.qa',JSON.stringify({userId:'qa',confirmed:false,files:[]})));
    await page.reload();
    await expect(page.getByText('Device cleanup needs attention',{exact:true})).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await page.getByRole('button',{name:'Retry device cleanup'}).click();
    await expect(page.getByText('Device cleanup needs attention',{exact:true})).toBeVisible();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`cleanup-error-${width}.png`)});
  });
}
