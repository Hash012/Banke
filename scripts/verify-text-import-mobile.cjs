'use strict';
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),edition=process.argv.find(x=>x.startsWith('--edition='))?.slice(10)||'community';assert(['community','private'].includes(edition));
// Match the production Windows renderer compatibility configuration.
if(process.platform==='win32')app.disableHardwareAcceleration();
const evidence=path.join(root,'.local','text-mobile-'+edition+'-'+Date.now());fs.mkdirSync(evidence,{recursive:true});app.setPath('userData',path.join(evidence,'profile'));
const filename=path.join(evidence,'synthetic-bundle.json'),errors=[];let finished=false,w;
function report(r){fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(r,null,2));}
function fail(e){if(finished)return;finished=true;report({ok:false,edition,error:String(e.stack||e),errors});app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
ipcMain.on('test:mobile-load',event=>{event.returnValue=fs.existsSync(filename)?fs.readFileSync(filename,'utf8'):'';});
ipcMain.on('test:mobile-save',(event,raw)=>{try{const v=JSON.parse(raw);assert.equal(require('../mobile/web/core.js').validateState(v.state).length,0);fs.writeFileSync(filename,raw);event.returnValue=JSON.stringify({ok:true});}catch(e){event.returnValue=JSON.stringify({ok:false,error:e.message});}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=s=>w.webContents.executeJavaScript(s),click=id=>js(`document.getElementById(${JSON.stringify(id)}).click();true`);
async function until(fn,label){for(let n=0;n<100;n++){if(await fn())return;await pause(100);}throw Error('Timed out: '+label);}
async function capture(n){w.show();w.webContents.invalidate();await pause(1000);fs.writeFileSync(path.join(evidence,n+'.png'),(await w.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 w=new BrowserWindow({width:402,height:900,show:true,webPreferences:{preload:path.join(__dirname,'text-import-mobile-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 w.webContents.on('console-message',e=>{if(e.level===3||e.level==='error')errors.push(e.message);});w.webContents.on('preload-error',(_e,_p,e)=>errors.push(e.message));
 await w.loadFile(path.join(root,'.local/text-mobile-fixtures',edition,'index.html'));await until(()=>js("!!window.BankeHost&&!document.getElementById('app').getAttribute('aria-busy').includes('true')"),'boot');
 await capture('home');await click('textImportButton');await js("document.getElementById('textImportInput').value="+JSON.stringify('第7周 周三 14:00-15:00 手机导入验收\n明天写报告')+";document.getElementById('textImportParse').click();true");await until(()=>js("document.querySelectorAll('.ti-card').length===2"),'preview');
 assert(await js("document.documentElement.scrollWidth<=innerWidth"));await capture('preview-portrait');
 await click('textImportConfirm');await until(()=>js("document.getElementById('textImportDialog').hidden"),'save');assert.equal(JSON.parse(fs.readFileSync(filename)).state.events.length,1);assert.equal(await js("document.getElementById('textPendingCount').textContent"),'1');
 await w.webContents.reload();await until(()=>js("!!window.BankeHost&&document.getElementById('textPendingCount').textContent==='1'"),'draft restored');await click('textPendingButton');await until(()=>js("document.getElementById('textImportSummary').textContent.includes('1 条待补全')"),'pending');await capture('pending');
 await js("document.querySelector('.ti-card button:last-child').click();true");await until(()=>js("document.getElementById('textPendingCount').textContent==='0'"),'removed count');
 assert(await js('window.BankeMobileUI.back()'));assert(await js("document.getElementById('textImportDialog').hidden&&!document.getElementById('app').inert"));
 assert.equal(errors.length,0,JSON.stringify(errors));report({ok:true,edition,method:'Native Windows Electron at phone viewport, real mobile adapter and synthetic file-backed native bridge; not Android/device/touch acceptance',draftRestored:true,noHorizontalOverflow:true,nativeBack:true,errors});finished=true;app.quit();
}).catch(fail);
