'use strict';
// Native Windows Electron, real DOM/IPC, actual WorkerW desktop layer.
// Internal window captures do not assert physical dragging or touch gestures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),electron=require('electron');
const root=path.resolve(__dirname,'..');
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const edition=arg('edition'),phase=arg('phase'),suite=path.resolve(arg('suite'));
assert(['community','private'].includes(edition)&&['live','cold'].includes(phase));assert(suite.startsWith(path.join(root,'.local')+path.sep));
const attempt=arg('attempt')||'';assert(/^[a-z0-9-]*$/.test(attempt));
const base=path.join(suite,edition),source=path.join(base,'app'),directory=path.join(base,'data'),evidence=path.join(base,phase+(attempt?'-'+attempt:''));
fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(directory,{recursive:true});
const errors=[],windows=[];let api,completed=false;
const save=(name,value)=>fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(value,null,2));
const log=(name,detail)=>fs.appendFileSync(path.join(evidence,'runtime.jsonl'),JSON.stringify({at:new Date().toISOString(),name,detail})+'\n');
const observed=new Proxy(electron.BrowserWindow,{construct(Target,args){const w=Reflect.construct(Target,args);windows.push(w);
  for(const name of ['preload-error','did-fail-load','render-process-gone'])w.webContents.on(name,(_e,...details)=>{if(name==='render-process-gone'&&details[0]?.reason==='clean-exit')return;errors.push({name,details:String(details)});log(name,String(details));});
  w.webContents.on('console-message',(...args)=>{const e=args[0];if(e.level===3||e.level==='error'){errors.push({name:'console',message:e.message});log('console',e.message);}});return w;}});
process.on('uncaughtException',e=>fail(e));process.on('unhandledRejection',e=>fail(e));
function fail(e){if(completed)return;completed=true;save('result',{ok:false,edition,phase,error:String(e.stack||e),errors});electron.app.exit(1);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await delay(100);}throw Error('Timed out: '+label);}
async function js(w,code){return w.webContents.executeJavaScript(code);}
async function capture(w,name){await delay(250);const image=await w.webContents.capturePage();fs.writeFileSync(path.join(evidence,name+'.png'),image.toPNG());assert(image.getSize().width>0);}
async function getPet(){return until(()=>{const pet=api.getLotus().getWindow();return pet&&!pet.isDestroyed()&&pet.isVisible()&&pet.webContents.getURL().endsWith('lotus.html')?pet:null;},'lotus visible');}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
if(phase==='live')assert(!fs.existsSync(path.join(directory,'schedule.json')),'Never overwrite a prior suite');
api=require(path.join(source,'main.cjs')).createDesktopApplication({...electron,BrowserWindow:observed},{argv:['--banke-test-data-dir='+directory]});
electron.app.on('will-quit',()=>log('will-quit',{completed}));
(async()=>{
 await api.ready;assert(api.getWindow());const editor=api.getWindow();
 const info=await js(editor,'window.BankeDesktop.getInfo()');assert.equal(info.dataPath,directory);assert.equal((await js(editor,'window.BankeDesktop.getSyncStatus()')).enabled,false);
 if(phase==='cold'){
   const pet=await getPet();await until(()=>js(pet,'!!window.BankeLotus'),'lotus preload');
   await delay(1500);
   const laterOccurrence=!(await js(pet,'document.getElementById("bubble").hidden'));
   if(laterOccurrence){
     // The start-test event also has a later END. A slow operator may reach
     // that new due time during this cold suite; it is not a repeated start.
     assert.equal(await js(pet,'document.getElementById("title").textContent'),'莲花开始提醒 · 合成');
     assert.match(await js(pet,'document.getElementById("kind").textContent'),/将歇/);
     await js(pet,'document.getElementById("dismiss").click();true');
   }
   const current=await js(editor,'window.BankeDesktop.getLotusStatus()');assert(current.settings.enabled);assert.equal(current.settings.startMinutes,3);
   if(process.argv.includes('--interaction')){
     const flower=await js(pet,'(()=>{const r=document.querySelector(".flower").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
     save('input-target',{pid:process.pid,handle:pet.getNativeWindowHandle().readBigUInt64LE().toString(),flower,bounds:pet.getBounds(),display:electron.screen.getDisplayMatching(pet.getBounds()),alwaysOnTop:pet.isAlwaysOnTop()});
     const observe=setInterval(()=>save('pointer-observation',{cursor:electron.screen.getCursorScreenPoint(),bounds:pet.getBounds()}),100);
     await until(()=>fs.existsSync(path.join(evidence,'native-input-result.json')),'guarded native input',90000);
     clearInterval(observe);
     assert(JSON.parse(fs.readFileSync(path.join(evidence,'native-input-result.json'),'utf8')).ok);await capture(pet,'lotus-after-native-drag');
   }
   assert.equal(await js(pet,'document.getElementById("quiet").textContent'),'半刻 · 念念相续');
   await capture(pet,'lotus-cold');assert.equal(errors.length,0,JSON.stringify(errors));save('result',{ok:true,edition,phase,method:'Native Windows Electron; real preload and DOM/IPC; internal capture',settingsPersisted:true,noDuplicateAfterRestart:true,laterOccurrenceObserved:laterOccurrence,copyVerified:true,errors});completed=true;electron.app.quit();return;
 }
 const loaded=await js(editor,'window.BankeDesktop.loadState()');assert(loaded.ok);assert.equal(loaded.state.events.length,0);
 await js(editor,'document.getElementById("lotusButton").click();true');await until(()=>js(editor,'document.getElementById("lotusDialog").open'),'settings dialog');await capture(editor,'settings-default');
 const trigger=Math.ceil((Date.now()+20000)/60000)*60000,boundary=new Date(trigger+2*60000),monday=new Date(boundary);monday.setDate(monday.getDate()-((monday.getDay()+6)%7)-7);
 const minute=boundary.getHours()*60+boundary.getMinutes(),endDate=new Date(boundary);if(minute===0)endDate.setDate(endDate.getDate()-1);
 const ev=(id,title,start,end,date=boundary)=>{const offset=(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(monday.getFullYear(),monday.getMonth(),monday.getDate()))/86400000;return {id,title,day:offset%7+1,start,end,category:'rest',location:'合成验收地点',notes:'仅用于莲花独立测试',weeks:[Math.floor(offset/7)+1],uncertain:false};};
 const startEvent=ev('lotus-start','莲花开始提醒 · 合成',minute,Math.min(1440,minute+5)),doneEvent={...startEvent,id:'lotus-done',title:'已完成不提醒 · 合成'};
 const endEvent=ev('lotus-end','莲花结束提醒 · 合成',minute===0?1430:Math.max(0,minute-10),minute===0?1440:minute,endDate);
 const state={...loaded.state,semesterStart:iso(monday),selectedWeek:24,events:[startEvent,endEvent,doneEvent],completed:['lotus-done:'+doneEvent.weeks[0]]};
 assert((await js(editor,'window.BankeDesktop.saveState('+JSON.stringify(state)+')')).ok);
 await js(editor,`document.getElementById('lotusEnabled').checked=true;document.getElementById('lotusStartMinutes').value='2';document.getElementById('lotusEndMinutes').value='2';document.getElementById('lotusFloating').checked=false;document.getElementById('lotusForm').requestSubmit();true`);
 await until(()=>js(editor,'!document.getElementById("lotusDialog").open'),'settings save');const pet=await getPet();await until(()=>js(pet,'!!window.BankeLotus'),'lotus ready');
 assert.equal(pet.isAlwaysOnTop(),false);assert.equal(await js(pet,'typeof window.BankeDesktop'),'undefined');await capture(pet,'lotus-idle');
 await js(editor,'document.getElementById("lotusButton").click();true');await until(()=>js(editor,'document.getElementById("lotusDialog").open'),'preview settings');
 await js(editor,'document.getElementById("lotusPreview").click();true');await until(()=>js(pet,'!document.getElementById("bubble").hidden'),'preview bubble');await capture(pet,'lotus-preview');
 assert.match(await js(pet,'document.getElementById("kind").textContent'),/试播/);await js(pet,'document.getElementById("dismiss").click();true');await js(editor,'document.getElementById("lotusClose").click();true');
 const cycles=[];
 for(let i=0;i<3;i++){
   const pinned=await js(editor,'window.BankeDesktop.setDesktopMode(true)');assert(pinned.ok,pinned.error);const widget=api.getWidget();assert(widget);assert.equal(widget.isAlwaysOnTop(),false);assert.equal(pet.isAlwaysOnTop(),false);
   const back=await js(widget,'window.BankeDesktop.setDesktopMode(false)');assert(back.ok,back.error);assert(editor.isVisible());cycles.push(true);
 }
 save('waiting',{trigger:new Date(trigger).toISOString(),pid:process.pid,lotusHandle:pet.getNativeWindowHandle().readBigUInt64LE().toString(),method:'Real timer; no fake clock'});
 await until(()=>js(pet,'!document.getElementById("bubble").hidden'), 'actual timer boundary',Math.max(15000,trigger-Date.now()+10000));
 const first=await js(pet,'({title:document.getElementById("title").textContent,kind:document.getElementById("kind").textContent})');assert.match(first.kind,/另有 1 条/);await capture(pet,'lotus-live-first');
 await js(pet,'document.getElementById("dismiss").click();true');await delay(150);const second=await js(pet,'({title:document.getElementById("title").textContent,kind:document.getElementById("kind").textContent})');assert(new Set([first.title,second.title]).size===2);assert.match([first.kind,second.kind].join(' '),/将启/);assert.match([first.kind,second.kind].join(' '),/将歇/);await capture(pet,'lotus-live-second');
 await js(pet,'document.getElementById("open").click();true');assert(editor.isVisible());await js(pet,'document.getElementById("dismiss").click();true');
 const config=await js(editor,'window.BankeDesktop.getLotusStatus()');assert((await js(editor,'window.BankeDesktop.setLotusSettings('+JSON.stringify({...config.settings,startMinutes:3,floating:true})+')')).ok);assert(pet.isAlwaysOnTop());await delay(1500);assert(await js(pet,'document.getElementById("bubble").hidden'));
 assert.equal(errors.length,0,JSON.stringify(errors));save('result',{ok:true,edition,phase,method:'Native Windows Electron; actual 1-second timer; real DOM/IPC; real WorkerW pin/return; internal window captures',emptyInitial:true,settingsUi:true,preview:true,actualStartAndEnd:true,completedSkipped:true,simultaneousQueue:true,pinReturnCycles:cycles.length,petTopmostOptional:true,widgetTopmost:false,errors});completed=true;electron.app.quit();
})().catch(fail);
