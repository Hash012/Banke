"use strict";
// Isolated CI fixture using the production protocol. Never read a real profile.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.local','apple-sync-'+process.pid);
assert(!fs.existsSync(directory));fs.mkdirSync(directory,{recursive:true});
const ctx={window:{},Date};vm.runInNewContext(fs.readFileSync(path.join(root,'desktop/renderer/seed.js'),'utf8'),ctx);
const state=JSON.parse(JSON.stringify(ctx.window.BANKE_SEED.state));fs.writeFileSync(path.join(directory,'schedule.json'),JSON.stringify(state));
const {createStateStore}=require('../desktop/lib/state-store.cjs'),S=require('../desktop/lib/sync-core.cjs'),{createSyncService,isPrivateAddress}=require('../desktop/lib/sync-service.cjs');
const store=createStateStore({directory});let renamed=false,arrived=false,service;
const evidence=path.join(root,'.local','apple-evidence','ios');fs.mkdirSync(evidence,{recursive:true});
function summary(){fs.writeFileSync(path.join(evidence,'sync-summary.json'),JSON.stringify({pairedDevices:service.getStatus().devices.length,phoneEventArrived:arrived,desktopRenameWritten:renamed},null,2));}
service=createSyncService({directory,store,port:0,onStatus:status=>{for(const p of status.pendingPairings||[])if(p.status==='pending')service.approvePairing(p.deviceId,true);},onState:result=>{
 if(result.state.events.some(e=>e.title==='iOS simulator smoke')&&!renamed){arrived=true;renamed=true;setTimeout(()=>{const current=service.loadDesktopState();const next=structuredClone(current.state);next.events.find(e=>e.title==='iOS simulator smoke').title='iOS desktop roundtrip';const saved=service.saveDesktopState(next,S.extractSnapshot(current.state));assert(saved.ok);summary();},500);}
}});
(async()=>{
 const started=await service.beginPairing();assert(started.ok);
 const address=Object.values(os.networkInterfaces()).flat().find(x=>x&&!x.internal&&(x.family==='IPv4'||x.family===4)&&isPrivateAddress(x.address));assert(address,'Hosted Mac has no private IPv4 for the real simulator LAN test');
 fs.writeFileSync(path.join(root,'.local','apple-test-config.json'),JSON.stringify({address:'http://'+address.address+':'+service.getStatus().port}));
 fs.writeFileSync(path.join(root,'.local','apple-sync-ready.json'),JSON.stringify({pid:process.pid,ready:true}));
 console.log('Isolated production-protocol fixture ready');
})().catch(e=>{console.error(e.message);service.dispose();process.exitCode=1;});
process.on('SIGTERM',()=>{summary();service.dispose();process.exit(0);});
