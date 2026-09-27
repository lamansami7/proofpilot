import {test,expect,chromium,type BrowserContext} from '@playwright/test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('real browser restart retains the purchase and original attachment bytes',async({baseURL},testInfo)=>{
 const directory=await mkdtemp(join(tmpdir(),'proofpilot-restart-'));
 const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJWQAAAAASUVORK5CYII=','base64');
 const launch=()=>chromium.launchPersistentContext(directory,{
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--no-sandbox','--disable-dev-shm-usage','--no-zygote']:[],
  viewport:{width:320,height:900},acceptDownloads:true,
 });
 let context:BrowserContext|undefined;
 try{
  context=await launch();let page=await context.newPage();
  await page.goto(baseURL!);await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.getByRole('button',{name:'Protect a purchase',exact:true}).first().click();
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload a receipt or document',exact:true}).click();
  await(await chooser).setFiles({name:'restart-receipt.png',mimeType:'image/png',buffer:original});
  await page.getByRole('textbox',{name:'PRODUCT NAME — REQUIRED',exact:true}).fill('Restart record');
  await page.getByRole('textbox',{name:'MERCHANT — REQUIRED',exact:true}).fill('QA merchant');
  await page.getByRole('textbox',{name:'Purchase price',exact:true}).fill('10');
  await page.getByRole('textbox',{name:'PURCHASE DATE — REQUIRED',exact:true}).fill('2026-01-01');
  await page.getByRole('button',{name:'Review purchase',exact:true}).click();await page.getByRole('button',{name:'Save purchase',exact:true}).click();
  await page.getByRole('button',{name:'View purchase record',exact:true}).click();
  await expect(page.getByText('restart-receipt.png',{exact:true})).toBeVisible();
  await context.close();context=undefined;
  context=await launch();page=await context.newPage();await page.goto(baseURL!);
  await page.getByRole('tab',{name:/Purchases/}).click();await page.getByText('Restart record',{exact:true}).click();
  await page.getByRole('button',{name:'Open restart-receipt.png',exact:true}).click();
  await expect(page.getByRole('img',{name:'Preview of restart-receipt.png'})).toBeVisible();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Open / download file',exact:true}).click();
  expect(await readFile((await(await downloading).path())!)).toEqual(original);
  await page.screenshot({path:testInfo.outputPath('restart-file-320.png')});
 }finally{if(context)await context.close();await rm(directory,{recursive:true,force:true});}
});
