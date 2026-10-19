"use strict";

// A normal editor is NEVER reparented to Explorer. The wallpaper surface is a
// dedicated, replaceable BrowserWindow. Returning to the editor never calls
// SetParent(NULL), restores an old OWNER, or requires a valid wallpaper HWND.
const { rightHalfBounds, clampWindowBounds } = require('./desktop-preferences.cjs');
function createWorkspaceController(options) {
  const { app, screen, layer, preferences, getEditor, makeEditor, getWidget, makeWidget, waitReady, retireWidget } = options;
  const timers = options.timers || { setTimeout, clearTimeout, setInterval, clearInterval };
  const platform=options.platform || process.platform;
  const supported = ['win32','darwin'].includes(platform) && !!layer && !!screen;
  const nativeBounds=bounds=>platform==='win32'?screen.dipToScreenRect(null,bounds):bounds;
  const loaded = preferences.load();
  let prefs = loaded.ok ? loaded.state : { version: 1, mode: 'window', displayId: null, normalBounds: null };
  let mode = 'window', connected = false, error = '', disposed = false, epoch = 0, pending = null, poll = null, recoveryQueued = false;
  const born = new WeakSet(), attached = new WeakSet(), handles = new WeakMap();
  const alive = win => !!win && !win.isDestroyed();
  const call = (win, name, ...args) => alive(win) && typeof win[name] === 'function' ? win[name](...args) : undefined;
  function displays() { try { return screen.getAllDisplays().filter(x => x.workArea && x.workArea.width > 0 && x.workArea.height > 0); } catch { return []; } }
  function display() { const all = displays(); return all.find(x => x.id === prefs.displayId) || (screen && screen.getPrimaryDisplay()) || {id:0,workArea:{x:0,y:0,width:1440,height:940}}; }
  function loginState() {
    try { const settings = app.getLoginItemSettings(platform==='darwin'?{}:{ path: '"' + app.getPath('exe') + '"', args: [] }); return !!settings.openAtLogin || !!(settings.launchItems || []).find(x => x.name === 'BankeCommunity' && x.enabled && x.scope === 'user'); } catch { return false; }
  }
  const canStartAtLogin = supported && app.isPackaged && typeof app.setLoginItemSettings === 'function';
  function status() { const d = display(); return {ok:true,mode,connected,supported,displayLabel:d.label || '显示器 '+d.id,canStartAtLogin:!!canStartAtLogin,startAtLogin:canStartAtLogin ? loginState() : false,...(error?{error}:{})}; }
  function statusForWindow(win) { return {...status(), mode: win === getWidget() ? 'desktop' : 'window', appMode:mode}; }
  function publish() { const s = status(); try { options.onStatusChange?.(s); } catch {} return s; }
  function save(modeValue) { prefs = {...prefs,mode:modeValue}; const result=preferences.save(prefs); if(!result.ok)error=result.error || '窗口设置未保存。'; }
  function remember(win) {
    if(disposed || mode!=='window' || win!==getEditor() || call(win,'isMinimized') || call(win,'isMaximized'))return;
    try{const b=call(win,'getNormalBounds') || call(win,'getBounds');if(b && ['x','y','width','height'].every(k=>Number.isSafeInteger(b[k]))) {prefs={...prefs,normalBounds:b};preferences.save(prefs);}}catch{}
  }
  function bindEditor(win) { if(born.has(win))return;born.add(win);win.on('resize',()=>remember(win));win.on('move',()=>remember(win)); }
  function configureEditor(win, focus=true) {
    // All style setters here target our ordinary window, never the wallpaper.
    if(!alive(win))throw new Error('普通窗口正在重新打开。');
    call(win,'setAlwaysOnTop',false);call(win,'setSkipTaskbar',false);
    if(call(win,'isMinimized'))call(win,'restore');
    const normal=prefs.normalBounds || {x:display().workArea.x+50,y:display().workArea.y+40,width:1440,height:940};
    const target=displays().find(x=>normal.x>=x.workArea.x && normal.x<x.workArea.x+x.workArea.width && normal.y>=x.workArea.y && normal.y<x.workArea.y+x.workArea.height) || display();
    call(win,'setBounds',clampWindowBounds(normal,target.workArea));
    if(focus){call(win,'show');call(win,'focus');}else call(win,'showInactive');
  }
  function hideWidget() {
    const widget=getWidget();if(!alive(widget))return;
    try { const result=layer.hide(handles.get(widget) || widget.getNativeWindowHandle());if(result.ok)return; }catch{}
    // Invalid HWND cleanup cannot veto recovery of an independent editor.
    retire(widget);
  }
  function retire(win) {
    if(!win)return;
    const h=handles.get(win);
    try { retireWidget(win); }catch{}
    try { if(h)layer.forget(h); }catch{}
    attached.delete(win);handles.delete(win);
  }
  async function showEditor({focus=true,remember=true}={}) {
    if(disposed)return {ok:false,error:'软件正在退出。'};
    ++epoch; // Supersedes any in-flight wallpaper creation.
    const editor=alive(getEditor()) ? getEditor() : makeEditor();
    try {
      bindEditor(editor); await waitReady(editor);
      if(disposed)return {ok:false,error:'软件正在退出。'};
      configureEditor(editor,focus);
      mode='window';connected=false;error='';
      if(remember)save('window');
      hideWidget();
      return publish();
    }catch(e){error='普通窗口未能加载：'+e.message;publish();return {ok:false,error};}
  }
  async function pin() {
    if(disposed)return {ok:false,error:'软件正在退出。'};
    if(!supported)return {ok:false,error:'当前系统不支持固定到桌面。'};
    if(pending)return pending;
    const token=++epoch;
    const operation=(async()=>{
      let widget=getWidget();
      try {
        remember(getEditor());error='';
        if(!alive(widget)){widget=makeWidget();await waitReady(widget);}
        if(disposed || token!==epoch){if(mode!=='desktop')hideWidget();return {ok:false,canceled:true,error:'已保留普通窗口。'};}
        const d=display(), dip=rightHalfBounds(d.workArea);
        let result;
        if(attached.has(widget)) {
          result=layer.position(handles.get(widget),nativeBounds(dip));
          if(!result.ok){retire(widget);widget=makeWidget();await waitReady(widget);}
        }
        if(!attached.has(widget)) {
          if(disposed || token!==epoch){retire(widget);return {ok:false,canceled:true,error:'桌面切换已取消。'};}
          call(widget,'setBounds',dip);
          // Realize Electron's native rendering surface before SetParent. On
          // the tested Windows desktop, parenting a never-shown window leaves
          // the desktop blank even though capturePage contains the full UI.
          call(widget,'showInactive');
          const h=widget.getNativeWindowHandle(); handles.set(widget,h);
          result=layer.attach(h,nativeBounds(dip));
          if(!result.ok || !result.attached)throw new Error(result.error || '无法连接桌面。');
          attached.add(widget);
        }
        mode='desktop';connected=true;prefs={...prefs,displayId:d.id};save('desktop');
        publish(); // CSS is switched before the ordinary editor is hidden.
        call(getEditor(),'hide');
        return status();
      }catch(e){
        retire(widget);mode='window';connected=false;save('window');error='桌面固定未成功，已保留普通窗口：'+e.message;
        try{const editor=alive(getEditor())?getEditor():makeEditor();await waitReady(editor);configureEditor(editor,false);}catch{}
        publish();return {ok:false,error};
      }
    })();
    pending=operation;
    try{return await operation;}finally{if(pending===operation)pending=null;}
  }
  async function setMode(enabled) { if(typeof enabled!=='boolean')return {ok:false,error:'窗口模式参数无效。'};return enabled?pin():showEditor(); }
  function refresh() {
    if(disposed || mode!=='desktop' || pending || recoveryQueued)return;
    const widget=getWidget();
    let result;
    try{result=alive(widget) ? layer.position(handles.get(widget),nativeBounds(rightHalfBounds(display().workArea))) : {ok:false};}catch(e){result={ok:false,error:e.message};}
    if(result.ok){connected=true;return;}
    connected=false;error='桌面连接已变化，正在打开普通窗口。';publish();
    recoveryQueued=true;
    showEditor({focus:false}).finally(()=>{retire(widget);recoveryQueued=false;});
  }
  async function nextDisplay() { const all=displays();if(mode!=='desktop'||all.length<2)return {ok:false,error:'请在连接多块显示器的桌面模式下切换。'};prefs={...prefs,displayId:all[(all.findIndex(x=>x.id===display().id)+1)%all.length].id};const result=await pin();return result; }
  function setStartAtLogin(enabled) {
    if(!canStartAtLogin || typeof enabled!=='boolean')return {ok:false,error:'无法设置系统登录启动。'};
    try{app.setLoginItemSettings(platform==='darwin'?{openAtLogin:enabled}:{openAtLogin:enabled,enabled,name:'BankeCommunity',path:app.getPath('exe'),args:[]});error='';return publish();}catch(e){return {ok:false,error:e.message};}
  }
  function windowClosed(win) { if(win===getWidget() && mode==='desktop' && !disposed)showEditor({focus:false}).catch(()=>{}); }
  async function initialize() { const previous=prefs.mode; await showEditor({remember:false});if(previous==='desktop' && supported)return pin();return status(); }
  if(supported){poll=timers.setInterval(refresh,3000);poll?.unref?.();for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on?.(name,refresh);}
  function dispose() {if(disposed)return;remember(getEditor());disposed=true;++epoch;if(poll)timers.clearInterval(poll);for(const name of ['display-added','display-removed','display-metrics-changed'])screen?.removeListener?.(name,refresh);retire(getWidget());}
  return Object.freeze({status,statusForWindow,setMode,showEditor,nextDisplay,setStartAtLogin,bindEditor,windowClosed,initialize,dispose,isDesktop:()=>mode==='desktop',wantsDesktop:()=>!disposed&&prefs.mode==='desktop'});
}
module.exports={createWorkspaceController};
