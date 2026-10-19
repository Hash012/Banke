'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {prepareWindowPreferences,configureRendering}=require('../lib/runtime-compatibility.cjs');
const {createDesktopPreferences}=require('../lib/desktop-preferences.cjs');
function temp(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'banke-compat-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
test('1.3.1 one-time display migration preserves schedule, paired data and window bounds',t=>{
 const p=temp(t),prefs=createDesktopPreferences({directory:p});const before={version:1,mode:'desktop',displayId:-4,normalBounds:{x:-1500,y:20,width:1100,height:750}};assert(prefs.save(before).ok);
 const schedule=Buffer.from('personal schedule bytes'),sync=Buffer.from('paired data must not be touched');fs.writeFileSync(path.join(p,'schedule.json'),schedule);fs.writeFileSync(path.join(p,'sync-state.json'),sync);fs.writeFileSync(path.join(p,'display-compatibility.json'),JSON.stringify({version:1}));
 assert(prepareWindowPreferences(p,prefs,'win32'));assert.deepEqual(prefs.load().state,{...before,mode:'window'});assert.equal(JSON.parse(fs.readFileSync(path.join(p,'display-compatibility.json'))).version,2);assert.deepEqual(fs.readFileSync(path.join(p,'schedule.json')),schedule);assert.deepEqual(fs.readFileSync(path.join(p,'sync-state.json')),sync);
 prefs.save(before);assert.equal(prepareWindowPreferences(p,prefs,'win32'),'');assert.deepEqual(prefs.load().state,before,'the user can pin again; upgrade does not force window mode every launch');
});
test('new data directory starts safely; software rendering is configured only for Windows',t=>{
 const p=temp(t),prefs=createDesktopPreferences({directory:p});assert(prepareWindowPreferences(p,prefs,'win32'));assert.equal(prefs.load().state.mode,'window');assert.equal(fs.existsSync(path.join(p,'schedule.json')),false);let calls=0;const app={disableHardwareAcceleration(){calls++;}};configureRendering(app,'linux');assert.equal(calls,0);configureRendering(app,'win32');assert.equal(calls,1);
});
test('preload import updates the merge baseline and rejects stale remote snapshots afterwards',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8');let exposed,lastSave,listener;let state={semesterStart:'2026-09-07',events:[{id:'old'}],completed:[]},revision=4;
 const ipc={sendSync(channel,value){if(channel==='banke:save-state'){lastSave=value;state=value.state;}return {ok:true,state,revision};},async invoke(channel){if(channel==='banke:import-backup'){revision=8;state={...state,events:[{id:'imported'}]};return {ok:true,state,revision};}return {ok:true};},on(channel,cb){if(channel==='banke:state-changed')listener=cb;},removeListener(){}};
 vm.runInNewContext(source,{require:name=>{assert.equal(name,'electron');return {ipcRenderer:ipc,contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'BankeDesktop');exposed=value;}}};},process:{isMainFrame:true}});
 assert.equal(exposed.version,require('../package.json').version);exposed.loadState();await exposed.importBackup('a'.repeat(48));exposed.saveState(state);assert.equal(lastSave.baseline.events[0].id,'imported');let delivered=0;exposed.onState(()=>delivered++);listener({}, {ok:true,state:{...state,events:[{id:'stale'}]},revision:7});assert.equal(delivered,0);listener({}, {ok:true,state,revision:9});assert.equal(delivered,1);
});
