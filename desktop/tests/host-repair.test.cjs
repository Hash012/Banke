'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{EventEmitter}=require('node:events');
const {createDesktopApplication}=require('../main.cjs');
const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/synthetic-schedule.json'),'utf8'));
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'banke-host-'));let id=0,modebad=false;const asyncHandlers=new Map(),syncHandlers=new Map(),all=[];let dialogs=[];
 const app=new EventEmitter();Object.assign(app,{isPackaged:true,setName(){},disableHardwareAcceleration(){},setAppUserModelId(){},getPath:name=>name==='exe'?path.join(dir,'Banke.exe'):dir,setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve(),getLoginItemSettings:()=>({openAtLogin:false}),setLoginItemSettings(){},quit(){app.emit('before-quit');}});
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.id=++id;this.dead=false;this.visible=false;this.bounds={x:50,y:50,width:1280,height:900};
   this.webContents=Object.assign(new EventEmitter(),{id:this.id,mainFrame:{url:'',parent:null},getURL:()=>this.webContents.mainFrame.url,setWindowOpenHandler(){},session:Object.assign(new EventEmitter(),{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){}}),messages:[],send:(channel,data)=>this.webContents.messages.push({channel,data}),executeJavaScript:async()=>true,print:(_o,cb)=>cb(true,'')});all.push(this);
  }
  loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;setImmediate(()=>{this.emit('ready-to-show');if(file.endsWith('index.html'))asyncHandlers.get('banke:renderer-ready')({sender:this.webContents,senderFrame:this.webContents.mainFrame});});return Promise.resolve();}
  getNativeWindowHandle(){const x=Buffer.alloc(8);x.writeBigUInt64LE(BigInt(this.id));return x;}isDestroyed(){return this.dead;}destroy(){this.dead=true;this.emit('closed');}show(){this.visible=true;}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){}isFocused(){return false;}setMenu(){}setAppDetails(){}setThumbnailToolTip(){}setTitle(){}setAlwaysOnTop(v){assert.equal(v,false);}setSkipTaskbar(){}isMinimized(){return false;}isMaximized(){return false;}setBounds(b){this.bounds=b;}getNormalBounds(){return this.bounds;}getBounds(){return this.bounds;}minimize(){}maximize(){}unmaximize(){}
 }
 const screen=Object.assign(new EventEmitter(),{getAllDisplays:()=>[{id:1,workArea:{x:0,y:0,width:1920,height:1080}}],getPrimaryDisplay:()=>({id:1,workArea:{x:0,y:0,width:1920,height:1080}}),dipToScreenRect:(_w,b)=>b});
 const dialog={showErrorBox(title,error){dialogs.push({type:'error',title,error});},showMessageBox:async()=>({response:1}),showOpenDialog:async(...args)=>{assert.equal(args.length,1,'open dialog must not borrow a wallpaper owner');dialogs.push({type:'open'});return {canceled:false,filePaths:[path.join(dir,'input.json')]};},showSaveDialog:async(...args)=>{assert.equal(args.length,1);return {canceled:true};}};
 const layer={attach:()=>({ok:true,attached:true}),position:()=>modebad?{ok:false,error:'1400'}:{ok:true,attached:true},hide:()=>modebad?{ok:false,error:'1400'}:{ok:true},forget(){},detach(){assert.fail('NEVER detach an editor or borrowed native handle');}};
 const api=createDesktopApplication({app,BrowserWindow:Window,screen,dialog,Menu:{buildFromTemplate:x=>x,setApplicationMenu(){}},ipcMain:{on:(k,v)=>syncHandlers.set(k,v),handle:(k,v)=>asyncHandlers.set(k,v)},shell:{openPath:async()=>''}},{platform:'win32',layer,syncPort:0});
 const event=w=>({sender:w.webContents,senderFrame:w.webContents.mainFrame});
 t.after(()=>{app.quit();for(const w of all)if(!w.dead)w.destroy();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,all,api,dialog,dialogs,app,asyncHandlers,syncHandlers,event,setBad:v=>modebad=v,call:(w,name,arg)=>asyncHandlers.get(name)(event(w),arg)};
}
test('actual host loads two independent windows and import in wallpaper mode does not detach either one',async t=>{
 const f=fixture(t);await f.api.ready;const editor=f.api.getWindow();const saveEvent=f.event(editor);f.syncHandlers.get('banke:save-state')(saveEvent,{state:seed});assert(saveEvent.returnValue.ok);
 assert.equal((await f.call(editor,'banke:set-desktop-mode',true)).ok,true);const widget=f.api.getWidget();assert.notEqual(widget,editor);assert.equal(editor.visible,false);
 fs.writeFileSync(path.join(f.dir,'input.json'),JSON.stringify(seed));f.setBad(true);
 const preview=await f.call(widget,'banke:open-backup');assert(preview.ok);assert.equal(f.api.getController().isDesktop(),true);
 const imported=await f.call(widget,'banke:import-backup',preview.token);assert(imported.ok);assert(fs.existsSync(imported.backupPath));assert.deepEqual(imported.state,seed);
 const back=await f.call(widget,'banke:set-desktop-mode',false);assert(back.ok);assert.equal(f.api.getWindow(),editor);assert.equal(editor.visible,true);assert.equal(f.api.getWidget(),null);
 assert.equal(f.dialogs.some(x=>x.type==='error'),false);
});
test('normal-editor commits are broadcast to the wallpaper renderer, not silently lost in a hidden view',async t=>{
 const f=fixture(t);await f.api.ready;const editor=f.api.getWindow(),ev=f.event(editor);f.syncHandlers.get('banke:save-state')(ev,{state:seed});await f.call(editor,'banke:set-desktop-mode',true);const widget=f.api.getWidget();const next=structuredClone(seed);next.events[0].title='正常窗口新安排';const request=f.event(editor);f.syncHandlers.get('banke:save-state')(request,{state:next});assert(request.returnValue.ok);assert.equal(widget.webContents.messages.filter(x=>x.channel==='banke:state-changed').at(-1).data.state.events[0].title,'正常窗口新安排');
});
test('foreign and child frames cannot read, import, start sync or control windows',async t=>{
 const f=fixture(t);await f.api.ready;const editor=f.api.getWindow();const child={sender:editor.webContents,senderFrame:{url:editor.webContents.getURL(),parent:editor.webContents.mainFrame}};
 for(const name of ['banke:open-backup','banke:import-backup','banke:sync-enable','banke:set-desktop-mode','banke:get-info','banke:lotus-status','banke:lotus-configure','banke:lotus-preview'])assert.equal((await f.asyncHandlers.get(name)(child,true)).ok,false,name);
});

test('closed callback does not access Electron webContents after native destruction',async t=>{
 const f=fixture(t);await f.api.ready;
 await f.call(f.api.getWindow(),'banke:set-desktop-mode',true);
 const widget=f.api.getWidget(),contents=widget.webContents;
 Object.defineProperty(widget,'webContents',{get(){if(widget.dead)throw new Error('Object has been destroyed');return contents;}});
 assert.doesNotThrow(()=>f.app.quit());
});
