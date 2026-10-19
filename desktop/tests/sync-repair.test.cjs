'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {createStateStore}=require('../lib/state-store.cjs');
const {createSyncService,sealEnvelope,openEnvelope}=require('../lib/sync-service.cjs');
const Sync=require('../lib/sync-core.cjs');
const state=()=>({version:1,semesterStart:'2026-09-07',selectedWeek:7,rangeStart:960,rangeEnd:1440,events:[{id:'test-course',title:'测试课程',day:7,start:1180,end:1270,category:'course',location:'测试',notes:'不可丢失',weeks:[7],uncertain:false}],completed:[],theme:'light'});
function fixture(t,port=0,extra={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banke-sync-'));const store=createStateStore({directory});store.saveState(state());const service=createSyncService({directory,store,host:'127.0.0.1',port,...extra});t.after(()=>{service.dispose();fs.rmSync(directory,{recursive:true,force:true});});return {directory,store,service};}
async function json(port,p,data,headers={}){const response=await fetch('http://127.0.0.1:'+port+p,{method:data?'POST':'GET',headers:{...(data?{'content-type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return {status:response.status,body:await response.json()};}
async function pair(f){await f.service.beginPairing();const port=f.service.getStatus().port;const client=crypto.createECDH('prime256v1');client.generateKeys();const publicKey=client.getPublicKey(null,'uncompressed').toString('base64'),clientNonce=crypto.randomBytes(16).toString('base64');
 const p=(await json(port,'/banke/v1/pair/request',{deviceName:'协议1测试手机',publicKey,clientNonce})).body;assert.equal(p.ok,true);
 const transcript=['banke-pair-v1',p.serverId,p.deviceId,clientNonce,p.serverNonce,publicKey,p.publicKey].join('\n');const key=Buffer.from(crypto.hkdfSync('sha256',client.computeSecret(Buffer.from(p.publicKey,'base64')),crypto.createHash('sha256').update(transcript).digest(),Buffer.from('banke-device-key-v1'),32));
 const sas=String(crypto.createHmac('sha256',key).update('banke-pair-sas-v1\n'+transcript).digest().readUInt32BE()%100000000).padStart(8,'0');assert.equal(f.service.getStatus().pendingPairings[0].sas,sas);
 assert.equal(f.service.approvePairing(p.deviceId,true).ok,true);return {...p,key};}
async function message(f,p,payload,requestId=crypto.randomUUID()){const env=sealEnvelope(p.key,'request',p.serverId,p.deviceId,requestId,payload);const r=await json(f.service.getStatus().port,'/banke/v1/message',env);assert.equal(r.status,200);return openEnvelope(p.key,'response',p.serverId,r.body);}
test('twenty concurrent start requests and pairing attempts share one listener',async t=>{const f=fixture(t);const starts=await Promise.all(Array.from({length:20},()=>f.service.start()));assert(starts.every(x=>x.ok&&x.running));assert.equal(new Set(starts.map(x=>x.port)).size,1);const pairStarts=await Promise.all([f.service.beginPairing(),f.service.start()]);assert(pairStarts.every(x=>x.port===starts[0].port));assert.equal((await json(starts[0].port,'/banke/v1/info')).body.protocol,1);});
test('busy requested port falls back without terminating its owner and remembers successful port',async t=>{
 const blocker=http.createServer((_q,r)=>r.end('not Banke'));await new Promise(r=>blocker.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>blocker.close(r)));
 const occupied=blocker.address().port,f=fixture(t,occupied);const r=await f.service.start();assert.equal(r.ok,true);assert.notEqual(r.port,occupied);assert.match(r.networkWarning,/原端口不可用/);assert.equal(await (await fetch('http://127.0.0.1:'+occupied)).text(),'not Banke');assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory,'sync-network.json'))).port,r.port);
});
test('start-stop-start sequencing never leaves a ghost listener',async t=>{const f=fixture(t);for(let i=0;i<5;i++){const r=await f.service.start();assert(r.running);const stop=await f.service.stop();assert.equal(stop.running,false);}assert.equal((await f.service.start()).running,true);});
test('unchanged mobile protocol pairs, syncs phone edits, receives desktop edits and rejects stale replay',async t=>{
 const f=fixture(t),p=await pair(f);const pulled=await message(f,p,{action:'pull'});const base=pulled.snapshot,local=structuredClone(base);local.events[0].title='手机编辑';
 const requestId=crypto.randomUUID(),sync={action:'sync',sequence:1,baseline:base,local};const first=await message(f,p,sync,requestId);assert.equal(first.ok,true);assert.equal(f.service.loadDesktopState().state.events[0].title,'手机编辑');
 const desktop=f.service.loadDesktopState().state;desktop.events[0].notes='电脑最新备注';f.service.saveDesktopState(desktop);
 const retry=await message(f,p,sync,requestId);assert.equal(retry.replayed,true);assert.equal(retry.snapshot.events[0].notes,'电脑最新备注');
 const stale=await message(f,p,sync);assert.equal(stale.ok,false);assert.equal(stale.code,'STALE_REQUEST');
 const plain=await json(f.service.getStatus().port,'/banke/v1/info');assert.equal('events' in plain.body,false);
 const rejected=await json(f.service.getStatus().port,'/banke/v1/info',undefined,{origin:'https://example.com'});assert.equal(rejected.status,403);
});
test('device key and last committed sequence survive service restart',async t=>{
 const f=fixture(t),p=await pair(f),base=(await message(f,p,{action:'pull'})).snapshot,local=structuredClone(base);local.events[0].notes='离线保存';const id=crypto.randomUUID(),txn={action:'sync',sequence:1,baseline:base,local};await message(f,p,txn,id);
 await f.service.stop();f.service.dispose();const service=createSyncService({directory:f.directory,store:f.store,host:'127.0.0.1',port:0});t.after(()=>service.dispose());f.service=service;await service.start();const retry=await message(f,p,txn,id);assert(retry.replayed);assert.equal(retry.snapshot.events[0].notes,'离线保存');assert.equal((await message(f,p,{action:'status'})).status,'approved');
});
test('dispose during startup cancels listening rather than starting a server after exit',async t=>{const f=fixture(t);const p=f.service.start();f.service.dispose();const r=await p;assert.equal(r.ok,false);assert.equal(f.service.getStatus().running,false);});
