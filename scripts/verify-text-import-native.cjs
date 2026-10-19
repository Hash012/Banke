'use strict';
// Actual Windows Electron and native IPC, isolated --banke-test-data-dir.
// DOM automation and capturePage do not assert physical pointer/touch actions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),electron=require('electron');
const root=path.resolve(__dirname,'..'),arg=n=>process.argv.find(s=>s.startsWith('--'+n+'='))?.slice(n.length+3);
const suite=path.resolve(arg('suite')),edition=arg('edition'),cold=process.argv.includes('--cold');
assert(suite.startsWith(path.join(root,'.local')+path.sep));assert(['community','private'].includes(edition));
const base=path.join(suite,edition),directory=path.join(base,'text-data'),evidence=path.join(base,'text-'+(cold?'cold':'live'));fs.mkdirSync(evidence,{recursive:true});
const errors=[];let finished=false,api;
const BW=new Proxy(electron.BrowserWindow,{construct(T,args){const w=Reflect.construct(T,args);
 for(const name of ['preload-error','did-fail-load','render-process-gone'])w.webContents.on(name,(_e,...details)=>{if(name==='render-process-gone'&&details[0]?.reason==='clean-exit')return;errors.push({name,details:String(details)});});
 w.webContents.on('console-message',(_e,...args)=>{if(_e.level===3||_e.level==='error')errors.push({name:'console',message:_e.message});});return w;}});
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(value,null,2));
function fail(e){if(finished)return;finished=true;save('result',{ok:false,edition,cold,error:String(e.stack||e),errors});electron.app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let i=0;i<150;i++){if(await f())return;await pause(100);}throw Error('Timed out: '+label);}
const js=(w,s)=>w.webContents.executeJavaScript(s),click=(w,id)=>js(w,`document.getElementById(${JSON.stringify(id)}).click();true`);
async function capture(w,n){await pause(150);fs.writeFileSync(path.join(evidence,n+'.png'),(await w.webContents.capturePage()).toPNG());}
api=require(path.join(base,'app/main.cjs')).createDesktopApplication({...electron,BrowserWindow:BW},{argv:['--banke-test-data-dir='+directory]});
(async()=>{
 await api.ready;const w=api.getWindow();assert(w);const info=await js(w,'window.BankeDesktop.getInfo()');assert.equal(info.dataPath,directory);
 assert(!(await js(w,'window.BankeDesktop.getSyncStatus()')).enabled);
 const load=()=>js(w,'window.BankeDesktop.loadState()'),drafts=()=>js(w,'window.BankeDesktop.readTextDrafts()');
 if(cold){assert.equal((await load()).state.events.length,3);assert.equal((await drafts()).items.length,1);await click(w,'navPending');await capture(w,'pending-restored');}
 else{
  assert.equal((await load()).state.events.length,0);
  const text='第7周 周三 14:00-15:00 项目讨论 @合成A楼\n周五 19:40-20:10 可能阅读\n明天写报告';
  async function analyze(value){await click(w,'textImportButton');await js(w,`document.getElementById('textImportInput').value=${JSON.stringify(value)};document.getElementById('textImportParse').click();true`);await until(()=>js(w,"document.querySelectorAll('.ti-card').length>0"),'preview');}
  async function confirm(){await click(w,'textImportConfirm');await until(()=>js(w,"document.getElementById('textImportDialog').hidden||!document.getElementById('textImportError').hidden"),'save');assert(await js(w,"document.getElementById('textImportDialog').hidden"),await js(w,"document.getElementById('textImportError').textContent"));}
  await analyze(text);assert.equal(await js(w,"document.querySelectorAll('.ti-card').length"),3);assert.equal((await load()).state.events.length,0);await capture(w,'preview');
  await confirm();assert.equal((await load()).state.events.length,2);assert.equal((await drafts()).items.length,1);assert.equal((await load()).state.events.filter(e=>e.uncertain).length,1);
  await click(w,'navPending');assert.equal(await js(w,"document.getElementById('pendingCount').textContent"),'2');await capture(w,'pending');
  await analyze(text.split('\n').slice(0,2).join('\n'));assert.equal(await js(w,"document.querySelectorAll('[data-field=selected]:checked').length"),0);await js(w,"document.querySelector('.ti-close').click();true");assert.equal((await load()).state.events.length,2);
  await click(w,'navPending');await js(w,"document.querySelector('#pendingPanel .pending-item button').click();true");await until(()=>js(w,"!document.getElementById('textImportDialog').hidden"),'draft edit');
  await js(w,"document.querySelector('[data-field=start]').value='16:00';document.querySelector('[data-field=end]').value='17:00';document.querySelector('[data-field=reviewed]').checked=true;true");await confirm();assert.equal((await load()).state.events.length,3);assert.equal((await drafts()).items.length,0);
  // Cancel makes no write. Failure at the real native draft path preserves the preview.
  await analyze('周日 写总结');await js(w,"document.querySelector('.ti-close').click();true");assert.equal((await drafts()).items.length,0);
  const draftPath=path.join(directory,'text-import-drafts.json');fs.renameSync(draftPath,draftPath+'.safe');fs.mkdirSync(draftPath);
  await analyze('周日 写总结');await click(w,'textImportConfirm');await until(()=>js(w,"!document.getElementById('textImportError').hidden"),'failure displayed');assert(!(await js(w,"document.getElementById('textImportDialog').hidden")));assert.equal((await load()).state.events.length,3);await capture(w,'save-failure');
  fs.rmdirSync(draftPath);fs.renameSync(draftPath+'.safe',draftPath);await confirm();assert.equal((await drafts()).items.length,1);
  const pinned=await js(w,'window.BankeDesktop.setDesktopMode(true)');assert(pinned.ok,pinned.error);const widget=api.getWidget();assert(widget&&!widget.isAlwaysOnTop());
  await click(widget,'textImportButton');await until(()=>js(widget,"!document.getElementById('textImportDialog').hidden"),'widget import');await capture(widget,'widget-import');assert((await js(widget,'window.BankeDesktop.setDesktopMode(false)')).ok);
 }
 assert.equal(errors.length,0,JSON.stringify(errors));save('result',{ok:true,edition,cold,method:'Native Windows Electron; actual renderer DOM, preload, IPC, isolated filesystem and WorkerW',errors});finished=true;electron.app.quit();
})().catch(fail);
