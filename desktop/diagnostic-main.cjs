'use strict';
// Local diagnostic entry only. Not part of a production build.
const fs=require('node:fs'),path=require('node:path');
const electron=require('electron');
const root=path.resolve(__dirname,'..');
const profile=process.env.BANKE_DIAGNOSTIC_PROFILE;
const variant=process.env.BANKE_DIAGNOSTIC_VARIANT||'baseline';
if(!profile || !/^[a-z0-9-]+$/.test(profile))throw Error('Explicit diagnostic profile required');
const base=path.join(root,'.local','test-profiles',profile);
const expected=path.join(base,'appdata','BankeCommunity');
const real=path.join(process.env.APPDATA,'BankeCommunity');
if(path.resolve(expected).toLowerCase()===path.resolve(real).toLowerCase() || !expected.startsWith(path.join(root,'.local')+path.sep))throw Error('Unsafe diagnostic data path');
fs.mkdirSync(path.dirname(expected),{recursive:true});
if(!process.argv.some(arg=>arg.startsWith('--banke-test-data-dir=')))electron.app.setPath('appData',path.dirname(expected));
const run=path.join(root,'.local','evidence','run-'+profile+'-'+Date.now());
fs.mkdirSync(run,{recursive:true});
const log=(event,detail={})=>fs.appendFileSync(path.join(run,'runtime.jsonl'),JSON.stringify({at:new Date().toISOString(),event,...detail})+'\n');
const http=require('node:http'),originalHttpServer=http.createServer;
http.createServer=function(...args){
 const server=originalHttpServer.apply(this,args);
 server.prependListener('request',(request,response)=>{
  const allowedPaths=new Set(['/banke/v1/info','/banke/v1/pair/request','/banke/v1/message']);
  const metadata={method:request.method,path:allowedPaths.has(request.url)?request.url:'other',originPresent:request.headers.origin!==undefined,privateAddress:require('./lib/sync-service.cjs').isPrivateAddress(request.socket.remoteAddress||'')};
  response.once('finish',()=>log('http-result',{...metadata,status:response.statusCode}));
 });
 server.on('error',e=>log('listen-error',{code:e.code}));
 server.on('listening',()=>log('listening',{port:server.address().port}));
 return server;
};
fs.writeFileSync(path.join(root,'.local','active-run.json'),JSON.stringify({run,profile,expected,pid:process.pid}));
process.on('uncaughtException',e=>log('uncaught-exception',{name:e.name,message:e.message,stack:String(e.stack).replaceAll(process.env.USERPROFILE,'<USER>')}));
process.on('unhandledRejection',e=>log('unhandled-rejection',{name:e?.name,message:e?.message}));
const windows=new Map();
const ObservedWindow=new Proxy(electron.BrowserWindow,{construct(Target,args){
 const w=Reflect.construct(Target,args);
 const opts=args[0]||{};
 const role=opts.webPreferences?.javascript===false?'taskbar-anchor':opts.skipTaskbar?'desktop-widget':'editor';
 const id=w.id,c=w.webContents,cid=c.id;
 windows.set(id,{w,role,cid});
 log('window-created',{role,id,cid});
 for(const event of ['show','hide','minimize','restore','ready-to-show','closed'])w.on(event,()=>log(event,{role,id,cid}));
 for(const event of ['dom-ready','did-finish-load','did-stop-loading'])c.on(event,()=>log(event,{role,id,cid}));
 c.on('preload-error',(_event,file,error)=>log('preload-error',{role,id,file:path.basename(file),message:error.message}));
 c.on('did-fail-load',(_e,code,description,_url,main)=>log('did-fail-load',{role,id,code,description,main}));
 c.on('render-process-gone',(_e,d)=>log('renderer-gone',{role,id,reason:d.reason,exitCode:d.exitCode}));
 c.on('console-message',(...args)=>{
   const obj=args[0],entry=typeof args[1]==='number'?{level:args[1],message:args[2],line:args[3],source:args[4]}:obj;
   if(entry.level===3||entry.level==='error')log('console-error',{role,id,message:String(entry.message).slice(0,600),line:entry.lineNumber||entry.line,source:path.basename(entry.sourceId||entry.source||'')});
 });
 return w;
}});
const handle=electron.ipcMain.handle.bind(electron.ipcMain);
electron.ipcMain.handle=(channel,callback)=>handle(channel,async(...args)=>{
 const started=Date.now();
 try{const result=await callback(...args);if(['banke:renderer-ready','banke:set-desktop-mode','banke:open-backup','banke:import-backup'].includes(channel))log('ipc',{channel,cid:args[0].sender.id,ok:result?.ok,error:result?.error,duration:Date.now()-started});return result;}
 catch(e){log('ipc-error',{channel,name:e.name,message:e.message});throw e;}
});
electron.app.on('before-quit',()=>log('before-quit'));
electron.app.on('will-quit',()=>log('will-quit'));
const layer=require('./lib/desktop-layer.cjs').createDesktopLayer();
const observedLayer={...layer,attach(buffer,bounds){
 const target=[...windows.values()].find(({w})=>!w.isDestroyed()&&w.getNativeWindowHandle().equals(buffer));
 log('native-attach-before',{variant,role:target?.role,hwnd:buffer.readBigUInt64LE().toString()});
 if(variant==='realize-first'&&target)target.w.showInactive();
 const result=layer.attach(buffer,bounds);
 log('native-attach-after',{variant,ok:result.ok,attached:result.attached,error:result.error});return result;
}};
const api=require('./main.cjs').createDesktopApplication({...electron,BrowserWindow:ObservedWindow},{layer:observedLayer});
if(path.resolve(electron.app.getPath('userData')).toLowerCase()!==expected.toLowerCase())throw Error('Diagnostic isolation assertion failed');
log('isolation',{expected,actual:electron.app.getPath('userData'),realDataUntouched:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function snapshot(label){
 const out=[];
 for(const {w,role,cid} of windows.values()){
  if(w.isDestroyed())continue;
  const record={role,id:w.id,cid,visible:w.isVisible(),minimized:w.isMinimized(),bounds:w.getBounds(),hwnd:w.getNativeWindowHandle().readBigUInt64LE().toString()};
  if(role!=='taskbar-anchor'){
   record.dom=await w.webContents.executeJavaScript(`({ready:document.readyState,bridge:typeof window.BankeDesktop,core:typeof window.PlannerCore,buttons:document.querySelectorAll('button').length,events:document.querySelectorAll('.event-card').length,bodyClass:document.body.className,innerWidth,innerHeight,modeButton:document.getElementById('desktopModeButton')?.textContent,openDialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.id),toast:document.getElementById('toast')?.hidden?'':document.getElementById('toast')?.textContent,controls:Object.fromEntries([['desktopModeButton','#desktopModeButton'],['importJson','#importJson'],['confirmImport','#confirmImport'],['importCancel','#importDialog .modal-footer .close-dialog'],['exportMenuSummary','#exportMenu>summary'],['syncButton','#syncButton'],['syncEnable','#syncEnable'],['syncPair','#syncPair'],['syncDone','#syncDialog .modal-footer .close-dialog']].map(([id,selector])=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return [id,r?{x:r.x,y:r.y,width:r.width,height:r.height,disabled:e.disabled,visible:e.checkVisibility()}:null]}))})`);
   if(!api.getSyncService()?.getStatus().pendingPairings?.length){
    const capture=await w.webContents.capturePage();
    record.image=label+'-'+role+'.png';record.imageSize=capture.getSize();record.imageEmpty=capture.isEmpty();
    fs.writeFileSync(path.join(run,record.image),capture.toPNG());
   }else record.imageOmitted='Pairing prompt: no screenshot recorded';
  }
  out.push(record);
 }
 const report={label,status:api.getController()?.status(),windows:out};
 fs.writeFileSync(path.join(run,label+'.json'),JSON.stringify(report,null,2));log('snapshot',{label});return report;
}
const commandFile=path.join(root,'.local','diagnostic-command.json');
let busy=false,lastCommand=fs.existsSync(commandFile)?JSON.parse(fs.readFileSync(commandFile,'utf8').replace(/^\uFEFF/,'')).id:'';
api.ready.then(async()=>{
 log('application-ready',{appVersion:require('./main.cjs').VERSION,versions:process.versions});
 await delay(1200);await snapshot('startup');
 setInterval(async()=>{
  if(busy||!fs.existsSync(commandFile))return;
  const command=JSON.parse(fs.readFileSync(commandFile,'utf8').replace(/^\uFEFF/,''));
  if(!command.id||command.id===lastCommand)return;
  busy=true;lastCommand=command.id;
  try{
   log('command',{id:command.id,action:command.action});let result;
   if(command.action==='snapshot')result=await snapshot(command.id);
   else if(command.action==='pin')result=await api.getController().setMode(true);
   else if(command.action==='editor')result=await api.getController().showEditor();
   else if(command.action==='sync-status'){
    const s=api.getSyncService().getStatus();result={ok:s.ok,running:s.running,port:s.port,pairedDevices:s.devices.length,pendingCount:s.pendingPairings.length,error:s.error,networkWarning:s.networkWarning};
   }
   else if(['ui-test-rename','ui-test-delete'].includes(command.action)){
    if(profile!=='phone-check')throw Error('Phone test action requires the dedicated profile');
    const before=api.getSyncService().loadDesktopState().state;
    const from=command.action==='ui-test-rename'?'同步验收-手机':'同步验收-电脑';
    const targets=before.events.filter(e=>e.title===from);
    if(targets.length!==1)throw Error('Exactly one temporary test event required');
    const editor=api.getWindow(),target=targets[0];
    const activate=`(()=>{
     const sync=document.getElementById('syncDialog');if(sync.open)sync.querySelector('.close-dialog').click();
     document.getElementById('navCourses').click();
     const button=[...document.querySelectorAll('.course-row')].find(e=>e.dataset.eventId===${JSON.stringify(target.id)});
     if(!button)throw Error('Temporary event is missing from the real list');button.click();
     if(document.getElementById('eventTitle').value!==${JSON.stringify(from)})throw Error('Wrong editor event');
     document.getElementById('editScope').value='all';
     ${command.action==='ui-test-rename'?"document.getElementById('eventTitle').value='同步验收-电脑';document.getElementById('eventForm').requestSubmit();":"document.getElementById('deleteEvent').click();"}
     return !document.getElementById('eventDialog').open;
    })()`;
    const ok=await editor.webContents.executeJavaScript(activate);
    const after=api.getSyncService().loadDesktopState().state;
    if(!ok||after.events.some(e=>e.title===from))throw Error('Temporary event UI edit did not commit');
    result={ok:true,method:'Real Electron list and event form activation; not physical mouse input',eventCount:after.events.length};
   }
   else if(command.action.startsWith('ui-')){
    const editor=api.getWindow();
    const actions={
     'ui-import':`document.getElementById('exportMenu').open=true;document.getElementById('importJson').click();true`,
     'ui-cancel-import':`if(!document.getElementById('importDialog').open)throw Error('No import preview');document.querySelector('#importDialog .modal-footer .close-dialog').click();true`,
     'ui-confirm-import':`if(!document.getElementById('importDialog').open)throw Error('No import preview');document.getElementById('confirmImport').click();true`,
     'ui-sync-open':`document.getElementById('syncButton').click();true`,
     'ui-sync-enable':`document.getElementById('syncEnable').click();true`,
     'ui-sync-pair':`document.getElementById('syncPair').click();true`,
     'ui-sync-done':`document.querySelector('#syncDialog .modal-footer .close-dialog').click();true`
    };
    if(!actions[command.action])throw Error('Unknown UI action');
    result={ok:await editor.webContents.executeJavaScript(actions[command.action]),method:'Real Electron DOM activation; not physical mouse input'};
   }
   else if(command.action==='concurrent-save'){
    const service=api.getSyncService(),before=service.loadDesktopState(),next=structuredClone(before.state);
    next.events[0].title+=' [isolated concurrent edit]';result=service.saveDesktopState(next);result={ok:result.ok,revision:result.revision};
   }
   else if(command.action==='quit'){electron.app.quit();return;}
   else throw Error('Unsupported diagnostic command');
   await delay(1000);
   if(command.action!=='snapshot')await snapshot(command.id);
   fs.writeFileSync(path.join(run,'result-'+command.id+'.json'),JSON.stringify({ok:true,action:command.action,result},null,2));
  }catch(e){log('command-error',{name:e.name,message:e.message});fs.writeFileSync(path.join(run,'result-'+command.id+'.json'),JSON.stringify({ok:false,error:e.message}));}
  finally{busy=false;}
 },250);
});
