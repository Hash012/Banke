"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { MAX_PAYLOAD_BYTES, createStateStore, atomicWriteFileSync, friendlyFileError } = require("./lib/state-store.cjs");
const { createDesktopPreferences } = require("./lib/desktop-preferences.cjs");
const { createDesktopLayer } = require("./lib/desktop-layer.cjs");
const { createWorkspaceController } = require("./lib/workspace-controller.cjs");
const { createBackupManager } = require("./lib/backup-manager.cjs");
const { configureRendering, prepareWindowPreferences } = require("./lib/runtime-compatibility.cjs");
const { createTaskbarAnchor } = require("./lib/taskbar-anchor.cjs");
const { createSyncService } = require("./lib/sync-service.cjs");

const VERSION = "1.3.2";
const APP_ID = "org.banke.community.desktop";
const WINDOW_TITLE = "半刻·我的周计划";
const MENU_ACTIONS = new Set(["add", "backup", "import", "print", "undo", "help"]);
const EXPORT_TYPES = Object.freeze({
  json: { name: "日程 JSON 备份", mimes: ["application/json", "text/json"] },
  csv: { name: "CSV 日程表", mimes: ["text/csv", "application/csv"] },
  txt: { name: "纯文本文件", mimes: ["text/plain"] },
  html: { name: "HTML 日程文件", mimes: ["text/html"] }
});

function resolveDataDirectory(defaultDirectory, argv, protectedDirectories=[]) {
  const flags=argv.filter(arg=>arg.startsWith('--banke-test-data-dir='));
  if(!flags.length)return defaultDirectory;
  if(flags.length!==1)throw new Error('只能指定一个测试数据目录。');
  const value=flags[0].slice('--banke-test-data-dir='.length);
  if(!path.isAbsolute(value))throw new Error('测试数据目录必须是绝对路径。');
  // Resolve existing ancestors too, so a junction cannot redirect a test run
  // into the real profile even when the final test directory does not exist.
  function canonical(value){
    const resolved=path.resolve(value);let parent=resolved;const missing=[];
    while(!fs.existsSync(parent)){missing.unshift(path.basename(parent));const next=path.dirname(parent);if(next===parent)throw new Error('无法解析测试目录。');parent=next;}
    return path.join(fs.realpathSync(parent),...missing).toLowerCase();
  }
  const real=canonical(defaultDirectory),test=canonical(value);
  for(const blocked of protectedDirectories){const target=canonical(blocked);if(test===target||test.startsWith(target+path.sep)||target.startsWith(test+path.sep))throw new Error('Protected data directory cannot be used for testing.');}
  if(real===test||real.startsWith(test+path.sep)||test.startsWith(real+path.sep)||path.parse(test).root===test)
    throw new Error('测试目录不能指向正式数据目录、其上级或子目录。');
  return path.resolve(value);
}

function isAllowedRendererURL(value, rendererEntry) {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:" || url.host || url.search) return false;
    let actual = path.resolve(fileURLToPath(url));
    let expected = path.resolve(rendererEntry);
    if (process.platform === "win32") { actual = actual.toLowerCase(); expected = expected.toLowerCase(); }
    return actual === expected;
  } catch (_) { return false; }
}

function isTrustedSender(event, window, rendererEntry) {
  try {
    if (!window || window.isDestroyed() || !event || event.sender !== window.webContents) return false;
    const frame = event.senderFrame;
    return !!frame && frame === window.webContents.mainFrame && !frame.parent &&
      isAllowedRendererURL(frame.url, rendererEntry) && isAllowedRendererURL(window.webContents.getURL(), rendererEntry);
  } catch (_) { return false; }
}

function isSafeFileName(fileName) {
  return typeof fileName === "string" && fileName.length > 0 && fileName.length <= 180 &&
    !/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(fileName) && !/[. ]$/.test(fileName) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName);
}

function validateExportRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return { ok: false, error: "导出参数无效。" };
  const fields = Object.keys(request);
  if (fields.length !== 3 || !["content", "fileName", "mime"].every(field => fields.includes(field))) return { ok: false, error: "导出仅接受内容、文件名与文件类型。" };
  if (typeof request.content !== "string" || typeof request.mime !== "string" || request.mime.length > 100 || !isSafeFileName(request.fileName)) return { ok: false, error: "导出的文件名或内容无效，请重新导出。" };
  if (Buffer.byteLength(request.content, "utf8") > MAX_PAYLOAD_BYTES) return { ok: false, error: "导出内容超过 16 MiB，请减少日程或备注后重试。" };
  const extension = path.extname(request.fileName).slice(1).toLowerCase();
  const type = EXPORT_TYPES[extension];
  if (!type || !type.mimes.includes(request.mime.split(";")[0].trim().toLowerCase())) return { ok: false, error: "仅支持导出 JSON、CSV、TXT 和 HTML 文件；PDF 请使用“打印 / 另存为 PDF”。" };
  return { ok: true, extension, type };
}

function createDesktopApplication(electron, options={}) {
  const {app,BrowserWindow,Menu,ipcMain,dialog,shell,screen,Tray}=electron;
  const platform=options.platform || process.platform;
  configureRendering(app,platform);
  const rendererEntry=path.join(__dirname,'renderer','index.html');
  let editor=null,widget=null,controller=null,service=null,backup=null,tray=null,anchor=null,quitting=false,fileDialogBusy=false,startupNotice='';
  const windows=new Set(), roles=new WeakMap(), loads=new WeakMap(), retiring=new WeakSet();
  app.setName('BankeCommunity');
  const defaultDirectory=path.join(app.getPath('appData'),'BankeCommunity');
  let directory;
  try{directory=resolveDataDirectory(defaultDirectory,options.argv||process.argv,[path.join(app.getPath('appData'),'BankePlanner'),path.join(app.getPath('appData'),'BankeGenericSync')]);fs.mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);if(directory!==defaultDirectory)app.setPath('sessionData',directory);}catch(e){dialog.showErrorBox('半刻无法启动','无法访问日程文件夹：'+e.message);app.quit();return {ready:Promise.resolve(null),getWindow:()=>null};}
  if(platform==='win32')app.setAppUserModelId(APP_ID);
  if(!app.requestSingleInstanceLock()){app.quit();return {ready:Promise.resolve(null),getWindow:()=>null};}
  const alive=w=>w&&!w.isDestroyed();
  function log(where,error){try{const p=path.join(directory,'diagnostics');fs.mkdirSync(p,{recursive:true});const f=path.join(p,'app.log');if(fs.existsSync(f)&&fs.statSync(f).size>512*1024)fs.renameSync(f,f+'.previous');fs.appendFileSync(f,new Date().toISOString()+' '+where+' '+String(error&&error.message||error).slice(0,1500)+'\n');}catch{}}
  function senderWindow(event){for(const w of windows)if(isTrustedSender(event,w,rendererEntry))return w;return null;}
  const denied=()=>({ok:false,error:'此窗口无权访问半刻数据。'});
  function send(w,channel,value){if(alive(w)&&isAllowedRendererURL(w.webContents.getURL(),rendererEntry)){try{w.webContents.send(channel,value);}catch{}}}
  function sendAll(channel,value,except){for(const w of windows)if(w!==except)send(w,channel,value);}
  function active(){return controller&&controller.isDesktop()&&alive(widget)?widget:editor;}
  function dispatch(action){if(MENU_ACTIONS.has(action))send(active(),'banke:menu-action',action);}
  function showEditor(){return controller?controller.showEditor():Promise.resolve({ok:false,error:'窗口正在启动。'});}
  function statusChanged(s){
    if(anchor)anchor.update(s.mode==='desktop');
    for(const w of windows)send(w,'banke:desktop-status-changed',controller?controller.statusForWindow(w):s);
    try{if(tray&&!tray.isDestroyed())tray.setContextMenu(Menu.buildFromTemplate(desktopMenu()));}catch{}
  }
  function desktopMenu(){const s=controller.status();return [
    {label:'固定到桌面右半屏',type:'checkbox',checked:s.mode==='desktop',enabled:s.supported,click:item=>controller.setMode(item.checked)},
    {label:'返回普通窗口',click:showEditor},
    {label:'切换显示器',enabled:s.mode==='desktop',click:()=>controller.nextDisplay()},
    {type:'separator'},
    {label:'登录 Windows 时自动启动',type:'checkbox',checked:s.startAtLogin,enabled:s.canStartAtLogin,click:item=>controller.setStartAtLogin(item.checked)},
    {type:'separator'},{label:'退出半刻',click:()=>app.quit()}];}
  function retireWidget(w){if(!w)return;retiring.add(w);if(widget===w)widget=null;windows.delete(w);try{if(alive(w))w.destroy();}catch(e){log('retire-widget',e);}}
  function createWindow(role){
    if(role==='editor'&&alive(editor))return editor;if(role==='desktop'&&alive(widget))return widget;
    const isWidget=role==='desktop';
    const w=new BrowserWindow({width:1440,height:940,minWidth:isWidget?0:640,minHeight:isWidget?0:480,
      frame:false,show:false,alwaysOnTop:false,skipTaskbar:isWidget,title:WINDOW_TITLE,
      resizable:!isWidget,movable:!isWidget,minimizable:!isWidget,maximizable:!isWidget,fullscreenable:!isWidget,
      backgroundColor:'#f5f7f8',autoHideMenuBar:true,
      icon:path.join(__dirname,'assets',platform==='win32'?'icon.ico':'icon.png'),
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,
        nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,webviewTag:false,webSecurity:true,allowRunningInsecureContent:false,
        backgroundThrottling:false,paintWhenInitiallyHidden:true,devTools:false}});
    const contentsId=w.webContents.id;
    if(isWidget)widget=w;else editor=w;windows.add(w);roles.set(w,role);
    let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});promise.catch(()=>{});
    const timer=setTimeout(()=>{reject(new Error('日程界面初始化超过 15 秒。'));if(!isWidget){try{w.show();}catch{}}},15000);timer.unref?.();
    loads.set(w,{promise,resolve:()=>{clearTimeout(timer);resolve(w);},reject:e=>{clearTimeout(timer);reject(e);}});
    if(platform==='win32'){
      w.setAppDetails({appId:APP_ID,appIconPath:app.getPath('exe'),appIconIndex:0,relaunchCommand:'"'+app.getPath('exe')+'"',relaunchDisplayName:WINDOW_TITLE});
      w.setThumbnailToolTip(WINDOW_TITLE);
    }
    if(!isWidget)controller?.bindEditor(w);
    w.on('close',event=>{if(quitting||retiring.has(w))return;if(isWidget){event.preventDefault();return;}app.quit();});
    w.on('closed',()=>{
      loads.get(w)?.reject(new Error('窗口已关闭。'));windows.delete(w);backup?.forget(contentsId);
      if(editor===w)editor=null;if(widget===w)widget=null;
      if(!quitting&&!retiring.has(w)&&isWidget)showEditor().catch(e=>log('widget-closed',e));
    });
    w.on('page-title-updated',event=>{event.preventDefault();if(alive(w))w.setTitle(WINDOW_TITLE);});
    const c=w.webContents;c.setWindowOpenHandler(()=>({action:'deny'}));
    c.on('will-navigate',(e,url)=>{if(!isAllowedRendererURL(e.url||url,rendererEntry))e.preventDefault();});
    c.on('will-frame-navigate',e=>{if(!e.isMainFrame||!isAllowedRendererURL(e.url,rendererEntry))e.preventDefault();});
    c.on('will-redirect',(e,url)=>{if(e.isMainFrame===false||!isAllowedRendererURL(e.url||url,rendererEntry))e.preventDefault();});
    c.on('will-attach-webview',e=>e.preventDefault());
    const session=c.session;session.setPermissionRequestHandler((_c,_p,cb)=>cb(false));session.setPermissionCheckHandler(()=>false);session.setDevicePermissionHandler?.(()=>false);session.on('will-download',e=>e.preventDefault());
    c.on('did-fail-load',(_e,code,description,_url,main)=>{if(main!==false){log('did-fail-load',code+' '+description);loads.get(w)?.reject(new Error(description));}});
    c.on('render-process-gone',(_e,details)=>{
      if(quitting||details.reason==='clean-exit')return;log('render-process-gone',details.reason);
      if(isWidget){showEditor().finally(()=>retireWidget(w));return;}
      dialog.showMessageBox({type:'error',title:'半刻',message:'普通窗口停止了响应。已保存的日程仍在本机。',buttons:['重新打开','退出'],defaultId:0,cancelId:1}).then(x=>{
        if(x.response===0){retiring.add(w);if(editor===w)editor=null;if(alive(w))w.destroy();showEditor();}else app.quit();
      }).catch(()=>app.quit());
    });
    w.loadFile(rendererEntry).catch(e=>{log('loadFile',e);loads.get(w)?.reject(e);});
    return w;
  }
  async function openFolder(){try{const result=await shell.openPath(directory);return result?{ok:false,error:result}:{ok:true};}catch(e){return {ok:false,error:e.message};}}
  function invoke(name,handler){ipcMain.handle(name,async(event,arg)=>{
    const w=senderWindow(event);if(!w)return denied();
    try{return await handler(w,arg,event);}catch(e){log(name,e);return {ok:false,error:e.message||'操作未完成。'};}
  });}
  function installIpc(){
    ipcMain.on('banke:load-state',event=>{event.returnValue=senderWindow(event)?service.loadDesktopState():denied();});
    ipcMain.on('banke:save-state',(event,request)=>{
      const w=senderWindow(event);if(!w){event.returnValue=denied();return;}
      try{const wrapped=request&&typeof request==='object'&&Object.hasOwn(request,'state');const result=service.saveDesktopState(wrapped?request.state:request,wrapped?request.baseline:undefined);event.returnValue=result;
        if(result.ok&&result.state)sendAll('banke:state-changed',{...result,source:'desktop-window'},w);
      }catch(e){log('save-state',e);event.returnValue={ok:false,error:e.message};}
    });
    invoke('banke:renderer-ready',w=>{loads.get(w)?.resolve();return {ok:true};});
    invoke('banke:get-info',w=>({ok:true,version:VERSION,dataPath:directory,platform,role:roles.get(w),startupNotice}));
    invoke('banke:open-data-folder',openFolder);
    invoke('banke:desktop-status',w=>controller.statusForWindow(w));
    invoke('banke:set-desktop-mode',(_w,enabled)=>controller.setMode(enabled));
    invoke('banke:desktop-next-display',()=>controller.nextDisplay());
    invoke('banke:set-start-at-login',(_w,enabled)=>controller.setStartAtLogin(enabled));
    invoke('banke:window-action',(w,action)=>{
      if(!['minimize','maximize','close'].includes(action))return {ok:false,error:'窗口操作无效。'};
      if(action==='close'){app.quit();return {ok:true};}
      if(roles.get(w)!=='editor')return {ok:false,error:'请先返回普通窗口。'};
      if(action==='minimize')w.minimize();else if(w.isMaximized())w.unmaximize();else w.maximize();return {ok:true};
    });
    invoke('banke:sync-status',()=>service.getStatus());
    invoke('banke:sync-enable',(_w,enabled)=>typeof enabled==='boolean'?(enabled?service.start():service.stop()):{ok:false,error:'同步开关参数无效。'});
    invoke('banke:sync-pair',()=>service.beginPairing());
    invoke('banke:sync-approve',(_w,x)=>x&&typeof x.deviceId==='string'&&typeof x.approved==='boolean'?service.approvePairing(x.deviceId,x.approved):{ok:false,error:'配对参数无效。'});
    invoke('banke:sync-revoke',(_w,id)=>typeof id==='string'?service.revoke(id):{ok:false,error:'设备编号无效。'});
    invoke('banke:open-backup',async w=>{
      if(fileDialogBusy)return {ok:false,error:'请先完成已打开的文件对话框。'};fileDialogBusy=true;
      try{
        // No BrowserWindow owner: never pass an Explorer child HWND to a dialog.
        const picked=await dialog.showOpenDialog({title:'选择半刻日程备份',buttonLabel:'预览备份',filters:[{name:'半刻日程 JSON',extensions:['json']}],properties:['openFile','dontAddToRecent']});
        if(picked.canceled||!picked.filePaths?.length)return {ok:false,canceled:true};
        if(!alive(w)||!windows.has(w))return denied();return backup.preview(w.webContents.id,picked.filePaths[0]);
      }finally{fileDialogBusy=false;}
    });
    invoke('banke:import-backup',(w,token)=>{
      if(typeof token!=='string'||!/^\w{48}$/.test(token))return {ok:false,error:'导入预览编号无效。'};
      const result=backup.apply(w.webContents.id,token);if(result.ok)sendAll('banke:state-changed',{...result,source:'import'},w);return result;
    });
    invoke('banke:save-file',async(w,request)=>{
      const valid=validateExportRequest(request);if(!valid.ok)return valid;if(fileDialogBusy)return {ok:false,error:'请先完成已打开的文件对话框。'};fileDialogBusy=true;
      try{
        const result=await dialog.showSaveDialog({title:'保存'+valid.type.name,defaultPath:path.join(app.getPath('downloads'),request.fileName),buttonLabel:'保存',filters:[{name:valid.type.name,extensions:[valid.extension]}],properties:['createDirectory','showOverwriteConfirmation','dontAddToRecent']});
        if(result.canceled||!result.filePath)return {ok:false,canceled:true};if(!alive(w))return denied();
        let target=result.filePath;if(!path.isAbsolute(target)||!isSafeFileName(path.basename(target)))return {ok:false,error:'文件名无效。'};
        if(!path.extname(target))target+='.'+valid.extension;if(path.extname(target).slice(1).toLowerCase()!==valid.extension)return {ok:false,error:'文件后缀应为 .'+valid.extension};
        atomicWriteFileSync(target,Buffer.from(request.content,'utf8'));return {ok:true,path:target};
      }finally{fileDialogBusy=false;}
    });
    invoke('banke:print-schedule',async()=>{
      const shown=await showEditor();if(!shown.ok)return shown;
      await editor.webContents.executeJavaScript('window.BankeView && window.BankeView.preparePrint()');
      return new Promise(resolve=>editor.webContents.print({silent:false,printBackground:true},(success,reason)=>resolve(success?{ok:true}:{ok:false,canceled:/cancel/i.test(reason||''),error:reason||'打印已取消。'})));
    });
  }
  app.on('second-instance',()=>{showEditor().catch(e=>log('relaunch',e));});
  app.on('before-quit',()=>{quitting=true;controller?.dispose();anchor?.dispose();service?.dispose();if(tray&&!tray.isDestroyed())tray.destroy();});
  app.on('window-all-closed',()=>{if(!quitting&&controller?.wantsDesktop())return;app.quit();});
  const ready=app.whenReady().then(async()=>{
    const store=options.store || createStateStore({directory});
    const preferences=options.preferences || createDesktopPreferences({directory});startupNotice=prepareWindowPreferences(directory,preferences,platform);
    service=options.syncService || createSyncService({directory,store,port:options.syncPort,onState:r=>sendAll('banke:state-changed',r),onStatus:r=>sendAll('banke:sync-status-changed',r)});
    backup=createBackupManager({directory,service});
    controller=createWorkspaceController({app,screen,preferences,layer:options.layer || createDesktopLayer({platform}),platform,
      getEditor:()=>editor,makeEditor:()=>createWindow('editor'),getWidget:()=>widget,makeWidget:()=>createWindow('desktop'),
      waitReady:w=>loads.get(w).promise,retireWidget,onStatusChange:statusChanged,timers:options.timers});
    if(platform==='win32')anchor=createTaskbarAnchor({BrowserWindow,app,appId:APP_ID,icon:path.join(__dirname,'assets','icon.ico'),onRestore:showEditor,onQuit:()=>app.quit()});
    installIpc();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'文件',submenu:[{label:'添加安排',accelerator:'CmdOrCtrl+N',click:()=>dispatch('add')},{label:'导出备份',click:()=>dispatch('backup')},{label:'导入备份',accelerator:'CmdOrCtrl+O',click:()=>dispatch('import')},{label:'打印',accelerator:'CmdOrCtrl+P',click:()=>dispatch('print')},{label:'打开数据文件夹',click:openFolder},{type:'separator'},{label:'退出半刻',click:()=>app.quit()}]},
      {label:'编辑',submenu:[{label:'撤销日程编辑',click:()=>dispatch('undo')},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'桌面',submenu:desktopMenu()},{label:'帮助',submenu:[{label:'使用说明',click:()=>dispatch('help')},{label:'关于',click:()=>dialog.showMessageBox({message:'半刻周计划 '+VERSION,detail:'独立普通窗口 + 可替换桌面挂件\n日程与手机配对数据保存在本机。',buttons:['知道了']})}]}
    ]));
    if(platform==='win32'&&Tray){try{tray=new Tray(path.join(__dirname,'assets','icon.ico'));tray.setToolTip('半刻周计划 '+VERSION);tray.setContextMenu(Menu.buildFromTemplate(desktopMenu()));tray.on('double-click',showEditor);}catch(e){log('tray',e);}}
    if(service.getStatus().enabled)service.start().catch(e=>log('sync-start',e));
    await controller.initialize();return editor;
  }).catch(e=>{log('startup',e);dialog.showErrorBox('半刻无法打开','程序启动失败：'+e.message+'\n原日程没有被删除。');return null;});
  return {ready,getWindow:()=>editor,getWidget:()=>widget,getController:()=>controller,getSyncService:()=>service};
}
module.exports={VERSION,APP_ID,resolveDataDirectory,isAllowedRendererURL,isTrustedSender,validateExportRequest,createDesktopApplication};
if(require.main===module)createDesktopApplication(require('electron'));
