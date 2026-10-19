"use strict";
// Real packaged Electron + real AppKit windows. CDP only controls the isolated
// app; captures are renderer images, not physical Mac/Mission Control evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(process.platform!=='darwin')throw Error('This test requires native macOS');
const app=path.resolve(process.argv[2]),info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Contents','Info.plist')],{encoding:'utf8'}));
assert.equal(info.CFBundleIdentifier,'org.banke.community.desktop');
const executable=path.join(app,'Contents','MacOS',info.CFBundleExecutable),data=path.join(root,'.local','mac-packaged-smoke-'+process.arch),evidence=path.join(root,'.local','apple-evidence',process.arch);
assert(!fs.existsSync(data),'Never overwrite an existing profile');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
class CDP {
 constructor(url){this.id=0;this.pending=new Map();this.ws=new WebSocket(url);this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});this.ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});}
 async command(method,params={}){await this.ready;const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},15000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async js(expression){const r=await this.command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
 close(){this.ws.close();}
}
let child,port,connections=[];
async function launch(){
 const portFile=path.join(data,'DevToolsActivePort');if(fs.existsSync(portFile))fs.unlinkSync(portFile);
 child=spawn(executable,['--banke-test-data-dir='+data,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0'],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});
 for(let n=0;n<120;n++){if(child.exitCode!==null)throw Error('Packaged app exited during startup');if(fs.existsSync(portFile)){port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);break;}await delay(250);}
 assert(port>0,'No local debugging port');return target('editor');
}
async function target(role){
 for(let n=0;n<100;n++){
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  for(const page of pages.filter(x=>x.type==='page'&&x.url.startsWith('file:'))){
   let c;try{c=new CDP(page.webSocketDebuggerUrl);const i=await c.js('window.BankeDesktop && window.BankeDesktop.getInfo()');if(i&&i.role===role&&await c.js('!!window.BankeView && document.readyState==="complete" && ("'+role+'"!=="desktop" || document.body.classList.contains("desktop-widget"))')){connections.push(c);return c;}}catch{}if(c)c.close();
  }await delay(200);
 }throw Error('Packaged renderer unavailable: '+role);
}
async function capture(c,name){const r=await c.command('Page.captureScreenshot',{format:'png'});const p=path.join(evidence,name+'.png');fs.writeFileSync(p,Buffer.from(r.data,'base64'));assert(fs.statSync(p).size>8000);}
async function quit(c){try{await c.js('window.BankeDesktop.windowAction("close")');}catch{}for(let n=0;n<60&&child.exitCode===null;n++)await delay(100);assert.notEqual(child.exitCode,null,'Normal app quit timed out');connections.forEach(c=>c.close());connections=[];}
(async()=>{
 let editor=await launch();assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events.length,0);await capture(editor,'ordinary-blank');
 await editor.js(`document.getElementById('addButton').click();document.getElementById('eventTitle').value='Apple packaged smoke';document.getElementById('eventStart').value='19:40';document.getElementById('eventEnd').value='20:00';document.getElementById('eventWeeks').value='1';document.getElementById('eventForm').requestSubmit();true`);
 await delay(500);assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events[0].title,'Apple packaged smoke');
 const cycles=[];
 for(let n=0;n<5;n++){
  const pinned=await editor.js('window.BankeDesktop.setDesktopMode(true)');assert.equal(pinned.ok,true,pinned.error);assert.equal(pinned.connected,true);
  const widget=await target('desktop');assert.equal(await widget.js('document.body.classList.contains("desktop-widget")'),true);
  const native=JSON.parse(execFileSync(path.join(root,'.local','mac-window-probe'),[String(child.pid)],{encoding:'utf8'}));assert(native.some(w=>w.layer<0&&w.onscreen),'No actual visible desktop-level NSWindow');
  if(n===0)await capture(widget,'desktop-widget');
  const returned=await widget.js('window.BankeDesktop.setDesktopMode(false)');assert.equal(returned.ok,true);assert.equal(returned.mode,'window');widget.close();
  cycles.push({round:n+1,actualNativeDesktopLevel:true,returnOrdinary:true});
 }
 await capture(editor,'ordinary-with-event');const before=fs.readFileSync(path.join(data,'schedule.json'));await quit(editor);
 editor=await launch();assert.deepEqual(fs.readFileSync(path.join(data,'schedule.json')),before);assert.equal((await editor.js('window.BankeDesktop.loadState()')).state.events.length,1);await capture(editor,'ordinary-after-restart');await quit(editor);
 const result={platform:process.platform,arch:process.arch,packaged:true,version:info.CFBundleShortVersionString,blankFirstRun:true,actualUiSave:true,cycles,dataSurvivesNormalRestart:true,scope:'Native hosted macOS, CDP UI and renderer captures; no physical Mac/Mission Control test'};
 fs.writeFileSync(path.join(evidence,'mac-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(async error=>{console.error(error.message);try{if(child&&child.exitCode===null){const c=await target('editor');await quit(c);}}catch{}process.exitCode=1;});
