// Cache public application assets only. Never cache API calls, authentication
// callback URLs, purchase exports or document requests.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files=[];
async function walk(directory) { for(const entry of await readdir(`dist/${directory}`,{withFileTypes:true})) {const path=`${directory}${entry.name}`;if(entry.isDirectory())await walk(`${path}/`);else if(/\.(js|css|ttf|woff2?|png|ico|html)$/.test(path))files.push(`/${path}`);} }
await walk('');
const version=createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0,16);
await writeFile('dist/service-worker.js',`const CACHE=${JSON.stringify(`proofpilot-shell-${version}`)};
const ASSETS=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('proofpilot-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const navigation=request.mode==='navigate'&&(url.pathname==='/'||url.pathname==='/index.html');
 const key=navigation?'/index.html':url.pathname;
 if(!navigation&&(!ASSETS.includes(key)||url.search))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(key))||fetch(request)));
});
`);
console.log(`Offline shell: ${files.length} public assets, version ${version}. No user data cached by the worker.`);
