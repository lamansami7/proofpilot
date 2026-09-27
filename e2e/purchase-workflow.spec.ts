import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

async function addPurchase(page: Page, name: string, formScreenshot?: string) {
  await page.getByRole('button',{name:'Protect a purchase',exact:true}).first().click();
  await page.getByRole('button',{name:'Enter details manually'}).click();
  await page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill(name);
  await page.getByRole('textbox',{name:'MERCHANT — REQUIRED',exact:true}).fill('QA test merchant');
  await page.getByRole('textbox',{name:'Purchase price',exact:true}).fill('0');
  await page.getByRole('textbox',{name:'PURCHASE DATE — REQUIRED',exact:true}).fill('2026-01-01');
  await page.getByRole('textbox',{name:'RETURN DEADLINE',exact:true}).fill('2026-12-31');
  if (formScreenshot) {
    await page.getByText('Purchase details',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:formScreenshot,animations:'disabled'});
  }
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
    await addPurchase(page,'QA test purchase',width===320?testInfo.outputPath('form-320.png'):undefined);
    const clipped = await page.getByRole('dialog').locator('button').evaluateAll(buttons => buttons.filter(button => {
      const rect=button.getBoundingClientRect();return rect.width>0&&(rect.left < -1 || rect.right > innerWidth+1);
    }).map(button=>button.getAttribute('aria-label') ?? button.textContent));
    expect(clipped,'dialog buttons must fit completely, not just intersect the viewport').toEqual([]);
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
    if (width <= 430) await expect(page.getByText('QA edited purchase',{exact:true}).first()).toBeInViewport();
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
  // Pause one real IndexedDB open with an explicit release signal, not a timer.
  await page.evaluate(()=>{
    const original=indexedDB.open.bind(indexedDB);
    indexedDB.open=(...args:Parameters<IDBFactory['open']>)=>{
      indexedDB.open=original;
      const request=original(...args);
      Object.defineProperty(request,'onsuccess',{set(handler: (this:IDBOpenDBRequest,event:Event)=>void){
        request.addEventListener('success',event=>{
          (window as typeof window & {resumeDocumentRead:()=>void}).resumeDocumentRead=()=>handler.call(request,event);
        });
      }});
      return request;
    };
  });
  await page.getByRole('button',{name:'Open QA-receipt.png',exact:true}).click();
  await expect(page.getByText('Loading preview from this device…',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('document-loading-375.png'),animations:'disabled'});
  await page.waitForFunction(()=>typeof (window as typeof window & {resumeDocumentRead?:()=>void}).resumeDocumentRead==='function');
  await page.evaluate(()=>(window as typeof window & {resumeDocumentRead:()=>void}).resumeDocumentRead());
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

for (const width of [320,375,430,768,1024,1280,1440]) {
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


test('stale edit cannot recreate a purchase deleted in another tab',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 await addPurchase(page,'QA stale record');
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill('Stale edited name');
 const other=await context.newPage();await other.goto('/');
 await other.getByRole('tab',{name:/Purchases/}).click();await other.getByText('QA stale record',{exact:true}).click();
 await other.getByRole('button',{name:'Delete this purchase',exact:true}).click();await other.getByRole('button',{name:'Delete permanently',exact:true}).click();
 await expect(other.getByText('No purchases yet',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Review purchase',exact:true}).click();await page.getByRole('button',{name:'Save purchase',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Edit purchase',exact:true}).getByText('This purchase was removed in another window. Refresh before editing.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items)).toEqual([]);
});

test('settings changes propagate between real tabs without losing unrelated settings',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 const other=await context.newPage();await other.goto('/');
 for(const tab of [page,other])await tab.getByRole('tab',{name:/Settings/}).click();
 await page.getByRole('textbox',{name:'Suggested return window in days'}).fill('90');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(other.getByRole('textbox',{name:'Suggested return window in days'})).toHaveValue('90');
 await other.getByRole('textbox',{name:'Suggested return window in days'}).fill('45');
 await other.getByRole('button',{name:'Save',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Suggested return window in days'})).toHaveValue('45');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.settings')!).onboardingCompleted)).toBe(true);
 await page.reload();await page.getByRole('tab',{name:/Settings/}).click();await expect(page.getByRole('textbox',{name:'Suggested return window in days'})).toHaveValue('45');
});

test('corrupt persisted records stay untouched and expose retry instead of an empty success',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 const raw=JSON.stringify({version:2,items:[null],pending:[],deleted:[]});
 await page.evaluate(value=>localStorage.setItem('proofpilot.v1.purchases',value),raw);
 await page.reload();
 await expect(page.getByText(/Saved records could not be read/)).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('proofpilot.v1.purchases'))).toBe(raw);
});


test('phone filters remain keyboard accessible and preserve selection when collapsed',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 await addPurchase(page,'QA filter purchase');await page.keyboard.press('Escape');await page.getByRole('tab',{name:/Purchases/}).click();
 const toggle=page.getByRole('button',{name:'Filters & sort',exact:true});
 await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(page.getByText('QA filter purchase',{exact:true})).toBeInViewport();
 await toggle.focus();await page.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'Pinned only',exact:true}).click();
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(page.getByText('No matches',{exact:true})).toBeVisible();
 await expect(page.getByText('Filters active',{exact:true})).toBeVisible();
 await toggle.click();await page.getByRole('button',{name:'Reset',exact:true}).click();await toggle.click();
 await expect(page.getByText('QA filter purchase',{exact:true})).toBeVisible();
 const search=page.getByRole('textbox').first();await search.fill('Unmatched purchase');
 await page.getByRole('button',{name:'Clear search and filters',exact:true}).click();await expect(search).toHaveValue('');
 await expect(page.getByText('QA filter purchase',{exact:true})).toBeVisible();
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('compact-purchases-320.png')});
});

test('stale edit of an existing record cannot overwrite another tab change',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 await addPurchase(page,'Concurrent record');await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill('Stale name');
 const other=await context.newPage();await other.goto('/');await other.getByRole('tab',{name:/Purchases/}).click();
 await other.getByText('Concurrent record',{exact:true}).click();await other.getByRole('button',{name:'Edit',exact:true}).click();
 await other.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill('Newer name');
 await other.getByRole('button',{name:'Review purchase',exact:true}).click();await other.getByRole('button',{name:'Save purchase',exact:true}).click();
 await other.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Review purchase',exact:true}).click();await page.getByRole('button',{name:'Save purchase',exact:true}).click();
 await expect(page.getByRole('dialog').getByText(/This purchase changed in another window/)).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items[0].name)).toBe('Newer name');
});

test('install metadata is valid and cached for offline access',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 const cdp=await context.newCDPSession(page);const manifest=await cdp.send('Page.getAppManifest');
 expect(manifest.errors).toEqual([]);expect(JSON.parse(manifest.data!).name).toBe('ProofPilot');
 await page.getByRole('tab',{name:/Settings/}).click();await expect(page.getByText('Offline start is available in this browser. Cloud and AI still require a connection.',{exact:true})).toBeVisible();
 await context.setOffline(true);await page.reload();await page.getByRole('tab',{name:/Settings/}).click();
 await expect(page.getByText('Offline start is available in this browser. Cloud and AI still require a connection.',{exact:true})).toBeVisible();
 expect(await page.evaluate(async()=> (await fetch('/manifest.webmanifest')).ok)).toBe(true);
 await context.setOffline(false);await page.reload();await expect(page.getByRole('tab',{name:/Home/})).toBeVisible();
});

test('long purchase titles never push dialog dismissal outside the phone viewport',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 await addPurchase(page,'長い商品名 — Long purchase '.repeat(50));
 const close=page.getByRole('button',{name:'Close dialog',exact:true});
 await expect(close).toBeInViewport();
 await expect(page.getByRole('button',{name:'Edit',exact:true})).toBeInViewport({ratio:1});
 await page.screenshot({path:testInfo.outputPath('long-name-dialog-320.png')});
 await close.click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('long-name-recovery-320.png')});
});

test('unexpected render errors expose recovery without clearing saved records',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 await addPurchase(page,'Recovery record');await page.keyboard.press('Escape');
 const saved=await page.evaluate(()=>localStorage.getItem('proofpilot.v1.purchases'));
 await page.evaluate(()=>{
  const original=Intl.DateTimeFormat;
  (window as typeof window & {restoreFormatter:()=>void}).restoreFormatter=()=>{Intl.DateTimeFormat=original;};
  Intl.DateTimeFormat=new Proxy(original,{construct(){throw new Error('Deliberate render-failure test');}});
 });
 await page.getByRole('tab',{name:/Purchases/}).click();
 await expect(page.getByText('ProofPilot couldn’t display this screen',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('proofpilot.v1.purchases'))).toBe(saved);
 await page.screenshot({path:testInfo.outputPath('render-error-320.png')});
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 await page.evaluate(()=>(window as typeof window & {restoreFormatter:()=>void}).restoreFormatter());
 await page.getByRole('button',{name:'Retry opening ProofPilot',exact:true}).click();await page.getByRole('tab',{name:/Purchases/}).click();
 await expect(page.getByText('Recovery record',{exact:true})).toBeVisible();
});

test('clearing browser storage in another tab invalidates displayed guest records',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();await addPurchase(page,'Record before clear');
 await page.keyboard.press('Escape');await page.getByRole('tab',{name:/Purchases/}).click();
 const other=await context.newPage();await other.goto('/');await other.evaluate(()=>localStorage.clear());
 await expect(page.getByText('Let’s protect something you own.',{exact:true})).toBeVisible();
 await expect(page.getByText('Record before clear',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('proofpilot.v1.purchases'))).toBeNull();
});

for(const width of [320,375,430,768,1024,1280,1440]) {
 test(`claim templates save independently and report clipboard failure at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
  await addPurchase(page,'Claim lifecycle purchase');await page.getByRole('button',{name:'Open Claim generator',exact:true}).click();
  await page.getByText('Claim generator',{exact:true}).evaluate(node=>node.scrollIntoView({block:'start'}));
  await page.screenshot({path:testInfo.outputPath(`claim-facts-${width}.png`),animations:'disabled'});
  await page.getByRole('button',{name:'Create from saved facts (no AI)',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Editable claim draft'});
  await editor.fill('Reviewed return request — user-entered facts only.');await page.getByRole('button',{name:'Save to Vault',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save to Vault',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Warranty claim',exact:true}).click();
  await expect(page.getByRole('button',{name:'Warranty claim',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Create from saved facts (no AI)',exact:true}).click();
  await editor.fill('Reviewed warranty request — verify terms before sending.');
  await expect(page.getByRole('button',{name:'Save to Vault',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Save to Vault',exact:true}).click();await expect(page.getByRole('button',{name:'Save to Vault',exact:true})).toBeDisabled();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Permission denied for test');}}}));
  await page.getByRole('button',{name:'Copy draft',exact:true}).click();
  await expect(page.getByText(/Copy or sharing is unavailable/)).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  const overflow=await page.getByRole('dialog').locator('button').evaluateAll(nodes=>nodes.filter(node=>{
   const r=node.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right > innerWidth+1 || node.scrollWidth>node.clientWidth+1);
  }).map(node=>node.getAttribute('aria-label')??node.textContent));
  expect(overflow).toEqual([]);
  await editor.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`claim-${width}.png`),animations:'disabled'});
  await page.reload();
  const documents=await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items[0].documents);
  expect(documents.map((document:{content:string})=>document.content)).toEqual(['Reviewed return request — user-entered facts only.','Reviewed warranty request — verify terms before sending.']);
 });
}

test('corrupted stored Blob is not previewed or downloaded and the original can be recovered',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();
 await addPurchase(page,'Corrupt file recovery');await page.getByRole('button',{name:'Add',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Receipt',exact:true}).click();
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJWQAAAAASUVORK5CYII=','base64');
 await(await chooser).setFiles({name:'integrity.png',mimeType:'image/png',buffer:bytes});await expect(page.getByText('integrity.png',{exact:true})).toBeVisible();
 const uri=await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items[0].documents[0].uri as string);
 const downloads:string[]=[];page.on('download',download=>downloads.push(download.suggestedFilename()));
 for(const mime of ['text/html','image/svg+xml','image/png']) {
  await page.evaluate(({uri,mime})=>new Promise<void>((resolve,reject)=>{
   const r=indexedDB.open('proofpilot-documents',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('files','readwrite');tx.objectStore('files').put(new Blob(mime==='image/png'?[]:['untrusted'],{type:mime}),uri.slice('proofpilot-file:'.length));tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),{uri,mime});
  await page.getByRole('button',{name:'Open integrity.png',exact:true}).click();
  await expect(page.getByText(/A thumbnail preview isn’t available/)).toBeVisible();
  await expect(page.getByRole('img',{name:'Preview of integrity.png'})).toHaveCount(0);
  await page.getByRole('button',{name:'Open / download file',exact:true}).click();
  const failure=page.getByText(/This file can’t be opened right now/);await expect(failure).toBeVisible();
  expect(downloads).toEqual([]);await failure.scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('corrupt-file-320.png'),animations:'disabled'});await page.keyboard.press('Escape');
 }
 await page.evaluate(({uri,bytes})=>new Promise<void>((resolve,reject)=>{
  const r=indexedDB.open('proofpilot-documents',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('files','readwrite');tx.objectStore('files').put(new Blob([new Uint8Array(bytes)],{type:'image/png'}),uri.slice('proofpilot-file:'.length));tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 }),{uri,bytes:[...bytes]});
 await page.getByRole('button',{name:'Open integrity.png',exact:true}).click();await expect(page.getByRole('img',{name:'Preview of integrity.png'})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Open / download file',exact:true}).click();
 expect(await readFile((await(await download).path())!)).toEqual(bytes);
});

test('invalid replacement backup removes the old confirmation without changing records',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();await addPurchase(page,'Backup selection safety');await page.keyboard.press('Escape');
 await page.getByRole('tab',{name:/Settings/}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();const bytes=await readFile((await(await download).path())!);
 for(const data of [bytes,Buffer.from('invalid replacement')]) {
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose backup',exact:true}).click();await(await chooser).setFiles({name:'backup.json',mimeType:'application/json',buffer:data});
  if(data===bytes)await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toBeEnabled();
 }
 await expect(page.getByText(/Invalid backup. Nothing was restored/)).toBeVisible();await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items.map((item:{name:string})=>item.name))).toEqual(['Backup selection safety']);
});

test('stale Vault document deletion preserves a newer purchase edit from another tab',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();await addPurchase(page,'Vault conflict record');
 await page.getByRole('button',{name:'Open Claim generator',exact:true}).click();await page.getByRole('button',{name:'Create from saved facts (no AI)',exact:true}).click();await page.getByRole('button',{name:'Save to Vault',exact:true}).click();await expect(page.getByRole('button',{name:'Save to Vault',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await page.getByRole('tab',{name:/Vault/}).click();
 await page.getByRole('button',{name:/^Delete .*claim/i}).click();await expect(page.getByRole('dialog',{name:'Delete this document?',exact:true})).toBeVisible();
 const other=await context.newPage();await other.goto('/');await other.getByRole('tab',{name:/Purchases/}).click();await other.getByText('Vault conflict record',{exact:true}).click();await other.getByRole('button',{name:'Edit',exact:true}).click();
 await other.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill('Newer name kept');await other.getByRole('button',{name:'Review purchase',exact:true}).click();await other.getByRole('button',{name:'Save purchase',exact:true}).click();await expect(other.getByRole('button',{name:'Done',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Delete document',exact:true}).click();await expect(page.getByText('The purchase changed in another window. Nothing was deleted. Choose Keep document, then reopen this confirmation to use the latest record.',{exact:true})).toBeVisible();
 const latest=await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items[0]);expect(latest.name).toBe('Newer name kept');expect(latest.documents).toHaveLength(1);
 await page.getByRole('button',{name:'Keep document',exact:true}).click();await page.getByRole('button',{name:/^Delete .*claim/i}).click();await page.getByRole('button',{name:'Delete document',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Delete this document?',exact:true})).toHaveCount(0);
 const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items[0]);expect(recovered.name).toBe('Newer name kept');expect(recovered.documents).toHaveLength(0);
});

for(const width of [320,375,430,768,1024,1280,1440]) {
 test(`large-library pagination remains reachable and searchable at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();await addPurchase(page,'Load fixture');
  await page.evaluate(()=>{
   const base=JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!).items[0];
   const items=Array.from({length:80},(_,index)=>({...base,id:`load-${index}`,name:`Load record ${index}`,documents:[{id:'scoped-doc',name:`Load draft ${index}`,kind:'claim',mimeType:'text/plain',content:'Synthetic QA draft'}],deadlines:[{id:'scoped-deadline',title:'QA deadline',type:'custom',date:'2099-01-01',completed:false}]}));
   localStorage.setItem('proofpilot.v1.purchases',JSON.stringify({version:2,items,pending:[],deleted:[]}));
  });await page.reload();
  for(const tab of ['Vault','Deadlines']) {
   await page.getByRole('tab',{name:new RegExp(tab)}).click();
   const rows=page.getByRole('button',{name:tab==='Vault'?/^Open Load draft /:/^View .* for Load record /});await expect(rows).toHaveCount(50);
   if(tab==='Vault')expect(await page.getByText('Load draft 0',{exact:true}).evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
   const more=page.getByRole('button',{name:/^Show more/});await more.scrollIntoViewIfNeeded();await expect(more).toBeInViewport();
   expect(await more.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:testInfo.outputPath(`${tab}-pagination-${width}.png`),animations:'disabled'});
   await more.click();await expect(rows).toHaveCount(80);await expect(more).toHaveCount(0);
   await page.getByRole('textbox',{name:tab==='Vault'?'Search documents':'Search deadlines',exact:true}).fill('Load record 79');await expect(rows).toHaveCount(1);
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
 });
}

for(const collection of ['documents','deadlines'] as const){
 test(`duplicate ${collection} IDs fail closed without changing stored records`,async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();await addPurchase(page,'Ambiguous record');
  const raw=await page.evaluate(collection=>{
   const snapshot=JSON.parse(localStorage.getItem('proofpilot.v1.purchases')!);
   const child=collection==='documents'?{id:'duplicate',name:'Original.pdf',kind:'receipt',mimeType:'application/pdf'}:{id:'duplicate',title:'Original deadline',date:'2099-01-01',type:'custom'};
   snapshot.items[0][collection]=[child,{...child}];const raw=JSON.stringify(snapshot);localStorage.setItem('proofpilot.v1.purchases',raw);return raw;
  },collection);
  await page.reload();await expect(page.getByText(/Saved records could not be read/)).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('proofpilot.v1.purchases'))).toBe(raw);
 });
}
test('settings edited in one tab are not erased by a second tab saving',async({page,context})=>{
 await page.goto('/');await page.getByRole('button',{name:'Skip',exact:true}).click();const other=await context.newPage();await other.goto('/');
 for(const tab of [page,other])await tab.getByRole('tab',{name:/Settings/}).click();
 const field=page.getByRole('textbox',{name:'Suggested return window in days'});await field.fill('90');
 await other.getByRole('textbox',{name:'Suggested return window in days'}).fill('45');await other.getByRole('button',{name:'Save',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('proofpilot.v1.settings')!).defaultReturnWindowDays)).toBe(45);
 await expect(field).toHaveValue('90');await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect(other.getByRole('textbox',{name:'Suggested return window in days'})).toHaveValue('90');
});
