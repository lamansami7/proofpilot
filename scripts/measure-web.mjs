import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--no-sandbox','--no-zygote']:[]});
const runs=[];
try {
 for(let i=0;i<5;i++){
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:8080');
  await page.getByRole('button',{name:'Skip',exact:true}).waitFor();
  const metrics=await page.evaluate(()=>{
   const n=performance.getEntriesByType('navigation')[0];
   return {uiReadyMs:Math.round(performance.now()),domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),fcpMs:Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0)};
  });runs.push(metrics);await context.close();
 }
 const sorted=runs.map(r=>r.uiReadyMs).sort((a,b)=>a-b);
 const result={environment:'Headless Chromium, local static server, fresh browser context each run; not a mobile/network benchmark',browser:browser.version(),runs,medianUiReadyMs:sorted[2]};
 await mkdir('.cache',{recursive:true});await writeFile('.cache/web-performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
