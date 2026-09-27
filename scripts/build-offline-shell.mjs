// Cache public application assets only. Never cache API calls, authentication
// callback URLs, purchase exports or document requests.
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Use the existing brand asset; no generated logo or external install dependency.
const icon = new URL('../assets/icon.png', import.meta.url);
const iconBytes = await readFile(icon);
await copyFile(icon, 'dist/app-icon.png');
await writeFile('dist/manifest.webmanifest', JSON.stringify({
  id: '/', name: 'ProofPilot', short_name: 'ProofPilot', start_url: '/', scope: '/',
  display: 'standalone', background_color: '#F6F7F3', theme_color: '#193831',
  icons: [{ src: '/app-icon.png', sizes: `${iconBytes.readUInt32BE(16)}x${iconBytes.readUInt32BE(20)}`, type: 'image/png', purpose: 'any' }],
}, null, 2));
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('rel="manifest"')) await writeFile('dist/index.html', html.replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#193831"></head>'));
const files=[];
async function walk(directory) { for(const entry of await readdir(`dist/${directory}`,{withFileTypes:true})) {const path=`${directory}${entry.name}`;if(entry.isDirectory())await walk(`${path}/`);else if(path!=='service-worker.js'&&/\.(js|css|ttf|otf|woff2?|png|jpe?g|webp|svg|ico|html|webmanifest)$/.test(path))files.push(`/${path}`);} }
await walk('');
files.sort();
const hash=createHash('sha256');
for (const file of files) hash.update(file).update('\0').update(await readFile(`dist${file}`)).update('\0');
const version=hash.digest('hex').slice(0,16);
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
