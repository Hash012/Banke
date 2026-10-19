'use strict';
// Actual packaged executables with separate synthetic profiles. Local CDP only
// activates the real DOM/bridge; it is not Computer Use or physical input.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),edition=process.argv[2];assert(['community','private'].includes(edition));
const executable=path.resolve(process.argv[3]||path.join(root,'dist',edition==='community'?'1.3.4':'private-1.3.4','win-unpacked',edition==='community'?'BankeCommunity.exe':'Banke.exe'));
const base=path.join(root,'.local','text-packaged-'+edition+'-'+Date.now()),data=path.join(base,'data');fs.mkdirSync(data,{recursive:true});
const initial={version:1,semesterStart:'2026-10-19',selectedWeek:1,rangeStart:960,rangeEnd:1440,events:[],completed:[],theme:'light'};
// Preseed only our synthetic empty state, especially for the private executable.
require('../desktop/lib/state-store.cjs').createStateStore({directory:data}).saveState(initial);
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child,port,connections=[];
class CDP{
 constructor(url){this.next=0;this.pending=new Map();this.ws=new WebSocket(url);this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});}
 async command(method,params={}){await this.ready;const id=++this.next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},10000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async js(expression){const r=await this.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;}
 close(){this.ws.close();}
}
async function target(entry){for(let n=0;n<80;n++){const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();for(const page of pages.filter(p=>p.type==='page'&&p.url.startsWith('file:')&&p.url.endsWith('/'+entry))){const c=new CDP(page.webSocketDebuggerUrl);try{if(await c.js(entry==='index.html'?'!!window.BankeView && !!window.BankeDesktop':'!!window.BankeLotus')){connections.push(c);return c;}}catch{}c.close();}await delay(100);}throw Error('No real renderer '+entry);}
async function launch(){const portFile=path.join(data,'DevToolsActivePort');if(fs.existsSync(portFile))fs.unlinkSync(portFile);child=spawn(executable,['--banke-test-data-dir='+data,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0'],{windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>fs.appendFileSync(path.join(base,'stderr.log'),b));for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Packaged app exited early');if(fs.existsSync(portFile)){port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);break;}await delay(100);}assert(port>0);return target('index.html');}
async function capture(c,name){const r=await c.command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(base,name+'.png'),Buffer.from(r.data,'base64'));}
async function quit(editor){try{await editor.js('window.BankeDesktop.windowAction("close")');}catch{}for(let n=0;n<100&&child.exitCode===null;n++)await delay(100);assert.notEqual(child.exitCode,null,'Normal quit timed out');for(const c of connections)c.close();connections=[];assert.equal(child.exitCode,0);}

(async()=>{
 let editor=await launch();const info=await editor.js('window.BankeDesktop.getInfo()');assert.equal(info.version,'1.3.4');assert.equal(info.dataPath,data);assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events.length,0);
 const click=id=>editor.js('document.getElementById('+JSON.stringify(id)+').click();true');
 async function until(fn,label){for(let n=0;n<100;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+label);}
 async function preview(text){await click('textImportButton');await editor.js("document.getElementById('textImportInput').value="+JSON.stringify(text)+";document.getElementById('textImportParse').click();true");await until(()=>editor.js("document.querySelectorAll('.ti-card').length>0"),'preview');}
 async function confirm(){await click('textImportConfirm');await until(()=>editor.js("document.getElementById('textImportDialog').hidden||!document.getElementById('textImportError').hidden"),'confirm');assert(await editor.js("document.getElementById('textImportDialog').hidden"),await editor.js("document.getElementById('textImportError').textContent"));}
 const text='第1周 周三 14:00-15:00 成品导入验收 @合成A楼\n周五 19:40-20:10 可能阅读\n明天写报告';
 await preview(text);assert.equal(await editor.js("document.querySelectorAll('.ti-card').length"),3);await capture(editor,'preview');await confirm();
 assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events.length,2);assert.equal((await editor.js('window.BankeDesktop.readTextDrafts()')).items.length,1);
 await click('navPending');assert.equal(await editor.js("document.getElementById('pendingCount').textContent"),'2');await capture(editor,'pending');
 await editor.js("document.querySelector('#pendingPanel .pending-item button').click();true");await until(()=>editor.js("!document.getElementById('textImportDialog').hidden"),'draft');
 await editor.js("document.querySelector('[data-field=start]').value='16:00';document.querySelector('[data-field=end]').value='17:00';document.querySelector('[data-field=reviewed]').checked=true;true");await confirm();
 assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events.length,3);assert.equal((await editor.js('window.BankeDesktop.readTextDrafts()')).items.length,0);
 await preview(text.split(String.fromCharCode(10)).slice(0,2).join(String.fromCharCode(10)));assert.equal(await editor.js("document.querySelectorAll('[data-field=selected]:checked').length"),0);await editor.js("document.querySelector('.ti-close').click();true");
 await preview('第3周 下周一 19:00-20:00 矛盾周次验收');assert.equal(await editor.js("document.querySelector('[data-field=weeks]').value"),'');assert.match(await editor.js("document.getElementById('textImportSummary').textContent"),/1 条待补全/);await editor.js("document.querySelector('.ti-close').click();true");
 await preview('周日 写总结');await confirm();assert.equal((await editor.js('window.BankeDesktop.readTextDrafts()')).items.length,1);
 await quit(editor);editor=await launch();assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events.length,3);assert.equal((await editor.js('window.BankeDesktop.readTextDrafts()')).items.length,1);await editor.js("document.getElementById('navPending').click();true");await capture(editor,'cold');await quit(editor);
 const result={ok:true,edition,executable,dataPath:data,method:'Actual packaged Windows executable, isolated synthetic state; local CDP activates real DOM/preload/IPC, not physical input',version:'1.3.4',preview:true,draftComplete:true,duplicatesSkipped:true,coldRestored:true};fs.writeFileSync(path.join(base,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,evidence:base}));
})().catch(e=>{for(const c of connections)c.close();if(child&&child.exitCode===null)child.kill();const result={ok:false,error:String(e.stack||e),edition,evidence:base};fs.writeFileSync(path.join(base,'result.json'),JSON.stringify(result,null,2));console.error(JSON.stringify(result));process.exitCode=1;});
