import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const script=new URL('./build-offline-shell.mjs',import.meta.url);
test('offline shell version includes unchanged-name assets and is deterministic',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proofpilot-shell-test-'));
 try {
  await mkdir(join(directory,'dist'));
  await writeFile(join(directory,'dist/index.html'),'<html><head></head><body>shell</body></html>');
  await writeFile(join(directory,'dist/icon.png'),'original');
  const build=async()=>{execFileSync(process.execPath,[script.pathname],{cwd:directory});return readFile(join(directory,'dist/service-worker.js'),'utf8');};
  const original=await build(); assert.equal(await build(),original);
  const manifest=JSON.parse(await readFile(join(directory,'dist/manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
  assert.equal((await readFile(join(directory,'dist/index.html'),'utf8')).match(/rel="manifest"/g).length,1);
  assert.ok(original.includes('/manifest.webmanifest'));assert.ok(original.includes('/app-icon.png'));
  await writeFile(join(directory,'dist/icon.png'),'updated icon');
  assert.notEqual(await build(),original);
  const worker=await build();
  const current=JSON.parse(worker.match(/const CACHE=("[^"]+");/)[1]);
  const keys=new Set([current,'proofpilot-shell-old','another-app-cache']);
  const handlers={};let skipped=false,claimed=false;
  runInNewContext(worker,{
    URL,
    self:{addEventListener:(name,handler)=>{handlers[name]=handler;},skipWaiting:()=>{skipped=true;},clients:{claim:()=>{claimed=true;}}},
    caches:{
      keys:async()=>[...keys],delete:async name=>keys.delete(name),
      open:async()=>({addAll:async()=>{throw new Error('Asset unavailable');}}),
    },
  });
  let task;
  handlers.install({waitUntil:value=>{task=value;}});
  await assert.rejects(task,/Asset unavailable/);
  assert.equal(skipped,false,'failed precache must not activate a broken replacement');
  assert.equal(keys.has('proofpilot-shell-old'),true,'previous shell remains available');
  handlers.activate({waitUntil:value=>{task=value;}});await task;
  assert.deepEqual([...keys].sort(),[current,'another-app-cache'].sort());
  assert.equal(claimed,true);

 }finally{await rm(directory,{recursive:true,force:true});}
});
