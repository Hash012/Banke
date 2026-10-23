"use strict";
// Native Windows Electron/packaged app, real animation time and isolated data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),edition=process.argv[2];assert(['community','private'].includes(edition));
const fromSource=process.argv[3]==='--source';
const executable=fromSource?path.join(root,'node_modules/electron/dist/electron.exe'):path.resolve(process.argv[3]);
const launchArgs=[];
const base=path.join(root,'.local','lotus-breath-'+edition+'-'+Date.now()),data=path.join(base,'data');fs.mkdirSync(data,{recursive:true});
if(fromSource){
 const original=edition==='community'?path.join(root,'desktop'):'D:/Banke-Codex-Handoff/source/banke-repair/app',copy=path.join(base,'app');fs.mkdirSync(copy);
 for(const name of ['main.cjs','preload.cjs','package.json'])fs.copyFileSync(path.join(original,name),path.join(copy,name));
 for(const name of ['lib','renderer','assets'])fs.cpSync(path.join(original,name),path.join(copy,name),{recursive:true,filter:p=>path.basename(p)!=='seed.js'});
 fs.copyFileSync(path.join(root,'desktop/renderer/seed.js'),path.join(copy,'renderer/seed.js'));
 for(const name of ['koffi','@koromix'])fs.cpSync(path.join(root,'node_modules',name),path.join(copy,'node_modules',name),{recursive:true});
 const entry=path.join(base,'native-entry.cjs');fs.writeFileSync(entry,'require('+JSON.stringify(path.join(copy,'main.cjs'))+').createDesktopApplication(require("electron"));');launchArgs.push(entry);
}
require('../desktop/lib/state-store.cjs').createStateStore({directory:data}).saveState({version:1,semesterStart:'2026-10-19',selectedWeek:1,rangeStart:960,rangeEnd:1440,events:[],completed:[],theme:'light'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child,port,connections=[];
class CDP{
 constructor(url){this.next=0;this.pending=new Map();this.ws=new WebSocket(url);this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});}
 async command(method,params={}){await this.ready;const id=++this.next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},35000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async js(expression){const r=await this.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;}
 close(){this.ws.close();}
}
async function target(entry){for(let n=0;n<80;n++){const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();for(const page of pages.filter(p=>p.type==='page'&&p.url.startsWith('file:')&&p.url.endsWith('/'+entry))){const c=new CDP(page.webSocketDebuggerUrl);try{if(await c.js(entry==='index.html'?'!!window.BankeView && !!window.BankeDesktop':'!!window.BankeLotus')){connections.push(c);return c;}}catch{}c.close();}await delay(100);}throw Error('No real renderer '+entry);}
async function launch(){port=null;const portFile=path.join(data,'DevToolsActivePort');if(fs.existsSync(portFile))fs.unlinkSync(portFile);child=spawn(executable,[...launchArgs,'--banke-test-data-dir='+data,'--user-data-dir='+data,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0'],{windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>{fs.appendFileSync(path.join(base,'stderr.log'),b);const match=String(b).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);if(match)port=Number(match[1]);});for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Packaged app exited early');if(port>0)break;if(fs.existsSync(portFile)){port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);break;}await delay(100);}assert(port>0);return target('index.html');}
async function capture(c,name){const r=await c.command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(base,name+'.png'),Buffer.from(r.data,'base64'));}
async function quit(editor){try{await editor.js('window.BankeDesktop.windowAction("close")');}catch{}for(let n=0;n<100&&child.exitCode===null;n++)await delay(100);assert.notEqual(child.exitCode,null,'Normal quit timed out');for(const c of connections)c.close();connections=[];assert.equal(child.exitCode,0);}

async function waitFor(c,expr){for(let i=0;i<140;i++){if(await c.js(expr))return;await delay(100);}throw Error('Actual app condition timed out: '+expr);}
async function observe(pet,ms,duration){
 const facts=await pet.js(`new Promise(resolve=>{const rows=[],start=performance.now();function tick(){const a=document.querySelector('.petals').getAnimations()[0],p=a.effect.getComputedTiming().progress,q=document.getElementById('quiet');rows.push({progress:p,duration:a.effect.getTiming().duration,text:q.textContent,opacity:Number(getComputedStyle(q).opacity)});if(performance.now()-start>=${ms})resolve(rows);else requestAnimationFrame(tick);}requestAnimationFrame(tick);})`);
 const meaningful=facts.filter(r=>r.progress>.05&&r.progress<.95&&Math.abs(r.progress-.5)>.05);
 assert(meaningful.length>40);for(const r of meaningful){assert.equal(r.duration,duration);assert.equal(r.text,r.progress<.5?'半刻 · 念念相续':'半刻 · 无喜无惧');assert(r.opacity>=0&&r.opacity<=1);}
 const phases=[];for(const r of meaningful){const text=r.text;if(phases.at(-1)!==text)phases.push(text);}
 assert(phases.length>=4,'Expected repeated real half-breath changes');
 return {samples:facts.length,durationMs:duration,observedAlternations:phases.length,sequence:phases};
}
(async()=>{
 let editor=await launch();const info=await editor.js('window.BankeDesktop.getInfo()');assert.equal(info.dataPath,data);assert.equal(info.version,'1.3.5');
 await editor.js('document.getElementById("lotusButton").click();true');await waitFor(editor,'document.getElementById("lotusDialog").open');
 await editor.js('document.getElementById("lotusEnabled").checked=true;document.getElementById("lotusFloating").checked=false;document.getElementById("lotusForm").requestSubmit();true');
 const pet=await target('lotus.html');
 const idle=await observe(pet,15500,7000);
 for(const [phase,name] of [['inhale','caption-inhale'],['exhale','caption-exhale']]){await waitFor(pet,`document.getElementById('quiet').dataset.phase==='${phase}'&&Number(getComputedStyle(document.getElementById('quiet')).opacity)>.95`);await capture(pet,name);}
 await editor.js('document.getElementById("lotusButton").click();true');await waitFor(editor,'document.getElementById("lotusDialog").open');await editor.js('document.getElementById("lotusPreview").click();true');await waitFor(pet,'!document.getElementById("bubble").hidden');
 const alert=await observe(pet,6500,3000);await pet.js('document.getElementById("dismiss").click();true');
 await waitFor(pet,'document.getElementById("bubble").hidden');
 await pet.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(250);
 assert.equal(await pet.js('document.getElementById("quiet").textContent'),'半刻 · 念念相续 · 无喜无惧');assert.equal(await pet.js('document.querySelector(".petals").getAnimations().length'),0);
 await pet.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await delay(250);
 assert.equal(await pet.js('document.querySelector(".petals").getAnimations()[0].effect.getTiming().duration'),7000);
 await editor.js('document.getElementById("lotusClose").click();true');
 for(let i=0;i<2;i++){const pinned=await editor.js('window.BankeDesktop.setDesktopMode(true)');assert(pinned.ok,pinned.error);assert((await editor.js('window.BankeDesktop.setDesktopMode(false)')).ok);}
 await quit(editor);editor=await launch();const again=await target('lotus.html');await waitFor(again,"document.getElementById('quiet').dataset.phase==='exhale'");await quit(editor);
 const result={ok:true,edition,fromSource,executable,version:info.version,idle,alert,reducedMotionStaticBothPhrases:true,resumesAfterPreferenceChange:true,pinReturnCycles:2,coldRestartAlternates:true,scope:'Actual native Windows application; local CDP drives real DOM/IPC and real-time animation; internal captures, not physical Computer Use'};
 fs.writeFileSync(path.join(base,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result,evidence:base}));
})().catch(async error=>{for(const c of connections)c.close();if(child&&child.exitCode===null)child.kill();fs.writeFileSync(path.join(base,'failure.json'),JSON.stringify({error:String(error.stack||error)},null,2));console.error(String(error.stack||error));console.error('Evidence: '+base);process.exitCode=1;});
