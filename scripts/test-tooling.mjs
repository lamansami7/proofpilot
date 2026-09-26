// Regression tests for the exact compatibility APIs changed by dependency patches.
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const tar=require('tar');const plist=require('@expo/plist').default;const uuid=require('uuid');
const temp=await mkdtemp(join(tmpdir(),'proofpilot-tooling-'));
try {
 const source=join(temp,'source'); const output=join(temp,'output');await mkdir(join(source,'package'),{recursive:true});await mkdir(output);
 await writeFile(join(source,'package','package.json'),'{"name":"proofpilot-test"}');
 await tar.create({file:join(temp,'fixture.tgz'),gzip:true,cwd:source},['package']);
 await require('../node_modules/@expo/cli/build/src/utils/npm.js').extractLocalNpmTarballAsync(join(temp,'fixture.tgz'),{cwd:output,name:'ProofPilot'});
 assert.equal(JSON.parse(await readFile(join(output,'package.json'),'utf8')).name,'proofpilot-test');
 const values={title:'ProofPilot & records',enabled:true,number:7,array:['one','two'],nested:{x:'y'}};
 assert.deepEqual(plist.parse("\n" + plist.build(values)),values);
 assert.equal(uuid.validate(uuid.v1()),true);assert.equal(uuid.validate(uuid.v4()),true);
 const assets=require('metro/src/Assets');
 const image=await assets.getAssetData(join(process.cwd(),'assets/icon.png'),'assets/icon.png',[],null,'/assets');
 assert.equal(image.width,1024);assert.equal(image.height,1024);
 console.log('Tooling compatibility: 5 checks passed (Expo tar, plist, UUID v1/v4, Metro image path).');
} finally {await rm(temp,{recursive:true,force:true});}
