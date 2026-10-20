'use strict';
// Real mobile adapter/WebCrypto + real desktop HTTP service. Native transport is
// a Node test bridge, not an Android device. All records and pairing are synthetic.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),arg=n=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3);
const web=path.resolve(arg('web-root')),lib=path.resolve(arg('desktop-lib')||path.join(root,'desktop/lib'));
assert(web.startsWith(path.join(root,'.local')+path.sep));assert(lib.startsWith(root+path.sep));
const evidence=path.join(root,'.local','personal-sync-'+Date.now()),directory=path.join(evidence,'desktop');fs.mkdirSync(directory,{recursive:true});
const bundleFile=path.join(evidence,'synthetic-phone-bundle.json'),draftFile=path.join(evidence,'synthetic-phone-drafts.json');
const {createStateStore}=require(path.join(lib,'state-store.cjs')),{createSyncService}=require(path.join(lib,'sync-service.cjs'));
const clone=x=>JSON.parse(JSON.stringify(x)),timers=new Set();let service,address,context,finished=false;
function phone(){
 const c={console,crypto:webcrypto,TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,atob,btoa,Date,
  document:{hidden:false,addEventListener(){}},addEventListener(){},
  setTimeout(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;},clearTimeout(t){clearTimeout(t);timers.delete(t);},setInterval(){return null;}};
 c.window=c;c.globalThis=c;
 c.BankeNative={getDeviceName:()=>'新私有手机 · 合成验证',loadBundle:()=>fs.existsSync(bundleFile)?fs.readFileSync(bundleFile,'utf8'):'',
  saveBundle:raw=>{const v=JSON.parse(raw);assert.equal(require(path.join(web,'core.js')).validateState(v.state).length,0);fs.writeFileSync(bundleFile,raw);return JSON.stringify({ok:true});},
  request(id,raw){(async()=>{const r=JSON.parse(raw),url=new URL(r.url),allowed=new URL(address);assert.equal(url.origin,allowed.origin);assert(['/banke/v1/info','/banke/v1/pair/request','/banke/v1/message'].includes(url.pathname));const response=await fetch(url,{method:r.method,body:r.method==='POST'?r.body:undefined,headers:{'Content-Type':'application/json'},redirect:'error'});c.__bankeNativeResult(id,JSON.stringify({ok:response.ok,status:response.status,body:await response.text()}));})().catch(e=>c.__bankeNativeResult(id,JSON.stringify({ok:false,error:e.message})));}};
 vm.createContext(c);for(const name of ['core.js','seed.js','sync-core.js','adapter.js','text-import.js','text-import-drafts.js'])vm.runInContext(fs.readFileSync(path.join(web,name),'utf8'),c,{filename:name});
 return c;
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function synchronized(predicate){for(let n=0;n<30;n++){const r=await context.BankeHost.syncNow();if(predicate())return;assert(r.ok,r.error);await pause(100);}throw Error('Sync state did not converge');}
function clearTimers(){for(const t of timers)clearTimeout(t);timers.clear();}
(async()=>{
 context=phone();const loaded=context.BankeHost.loadState();assert(loaded.ok,loaded.error);const initial=clone(loaded.state);assert.equal(initial.events.length,0);
 const desktopEvent={id:'personal-desktop-synthetic',title:'电脑原有合成安排',day:2,start:540,end:600,weeks:[1],category:'study',location:'合成地点',notes:'隔离测试',uncertain:false};
 const store=createStateStore({directory});assert(store.saveState({...initial,events:[desktopEvent]}).ok);
 service=createSyncService({directory,store,port:0});await service.start();const status=service.getStatus();
 const lan=status.addresses.find(a=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address));assert(lan,'No private LAN interface available');address=lan.url;
 const parsed=context.BankeTextImport.parse('第1周 周三 14:00-15:00 手机导入合成\n明天写报告',{semesterStart:initial.semesterStart,selectedWeek:1,today:initial.semesterStart});
 const plan=context.BankeTextImport.prepare(initial,parsed.rows);assert.equal(plan.added.length,1);assert.equal(plan.drafts.length,1);assert(context.BankeHost.saveState(plan.state).ok);
 let draftRaw=null;const drafts=context.BankeTextDrafts.createLocal({getItem:()=>draftRaw,setItem:(_k,raw)=>{draftRaw=raw;fs.writeFileSync(draftFile,raw);}});assert(drafts.stage(plan.drafts).ok);
 await service.beginPairing();const paired=await context.BankeHost.pair(address);assert(paired.ok,paired.error);
 const pending=service.getStatus().pendingPairings.find(p=>p.status==='pending');assert(pending);assert.equal((await context.BankeHost.getSyncStatus()).sas,pending.sas);service.approvePairing(pending.deviceId,true);
 await synchronized(()=>context.BankeHost.loadState().state.events.length===2&&service.loadDesktopState().state.events.length===2);
 assert.equal(drafts.read().items.length,1);assert(!service.loadDesktopState().state.events.some(e=>e.id===plan.drafts[0].id));
 const before=service.loadDesktopState().state,next=clone(before);next.events.find(e=>e.id===desktopEvent.id).title='电脑改名回传 · 合成';assert(service.saveDesktopState(next,{semesterStart:before.semesterStart,events:before.events,completed:before.completed}).ok);
 await synchronized(()=>context.BankeHost.loadState().state.events.some(e=>e.title==='电脑改名回传 · 合成'));
 clearTimers();context=phone();assert((await context.BankeHost.getSyncStatus()).paired);assert.equal(context.BankeHost.loadState().state.events.length,2);await synchronized(()=>context.BankeHost.loadState().state.events.length===2);
 const result={ok:true,applicationId:'cn.banke.personal.mobile',method:'Actual packaged web adapter in Node VM; WebCrypto, real private-edition desktop service and HTTP on this machine private LAN interface; synthetic native transport, not Android/device acceptance',emptyInitial:true,offlineTextImport:true,missingTimeDraftKeptLocal:true,sasCompared:true,desktopAndPhoneMerged:true,desktopRenameReturned:true,pairingAndScheduleRestoredAfterAdapterReload:true,realUserDataTouched:false};
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));finished=true;console.log(JSON.stringify({...result,evidence}));
})().catch(e=>{fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({ok:false,error:String(e.stack||e)},null,2));console.error(String(e.stack||e));process.exitCode=1;}).finally(()=>{clearTimers();service?.dispose();});
