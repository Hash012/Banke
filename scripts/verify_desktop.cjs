"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),archive=path.resolve(process.argv[2]||path.join(root,'dist/win-unpacked/resources/app.asar'));
let checked=0;
function walk(folder){for(const item of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){const rel=path.join(folder,item.name);if(item.isDirectory())walk(rel);else{assert(asar.extractFile(archive,rel).equals(fs.readFileSync(path.join(root,rel))),'Packed source mismatch: '+rel);checked++;}}}
for(const f of ['main.cjs','preload.cjs']){const rel=path.join('desktop',f);assert(asar.extractFile(archive,rel).equals(fs.readFileSync(path.join(root,rel))));checked++;}
for(const dir of ['lib','renderer','assets'])walk(path.join('desktop',dir));
const entries=asar.listPackage(archive).map(p=>p.replaceAll('\\','/'));
assert(!entries.some(p=>p.includes('diagnostic')||p.includes('/tests/')||p.includes('/.local/')),'Non-production files in ASAR');
const meta=JSON.parse(asar.extractFile(archive,'package.json').toString());assert.equal(meta.name,'banke-community');assert.equal(meta.version,require('../package.json').version);assert.equal(meta.license,'MIT');
const ctx={window:{},Date};vm.runInNewContext(asar.extractFile(archive,path.join('desktop','renderer','seed.js')).toString(),ctx);assert.equal(ctx.window.BANKE_SEED.state.events.length,0);
console.log(JSON.stringify({version:meta.version,packedSourceFilesMatch:checked,blankSeed:true,diagnosticExcluded:true}));
