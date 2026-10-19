'use strict';
const path=require('node:path');
const {createLotusReminders}=require('./lotus-reminders.cjs');
function createLotusWindow({electron,directory,isTrustedSender,onOpen,onSettings,log=()=>{}}) {
  const {BrowserWindow,screen,ipcMain}=electron;
  const entry=path.join(__dirname,'../renderer/lotus.html');
  let window=null,ready=false,queue=[],sample=null,disposed=false,moveTimer=null,regions=[],ignoring=true;
  const alive=()=>window&&!window.isDestroyed();
  const trusted=e=>alive()&&isTrustedSender(e,window,entry);
  const engine=createLotusReminders({directory,onReminders:items=>{queue.push(...items);sample=null;show();render();}});
  function view(){return {reminder:queue[0]||sample,count:queue.length||(sample?1:0),demo:!queue.length&&!!sample,error:engine.status().error};}
  function render(){if(alive()&&ready)window.webContents.send('banke:lotus-view',view());}
  function place() {
    if(!alive())return;
    const saved=engine.status().position, displays=screen.getAllDisplays();
    const area=(saved&&displays.find(d=>saved.x>=d.workArea.x&&saved.x<d.workArea.x+d.workArea.width&&saved.y>=d.workArea.y&&saved.y<d.workArea.y+d.workArea.height)||screen.getPrimaryDisplay()).workArea;
    window.setBounds({x:Math.round(Math.max(area.x,Math.min(saved?saved.x:area.x+area.width-365,area.x+area.width-360))),y:Math.round(Math.max(area.y,Math.min(saved?saved.y:area.y+area.height-330,area.y+area.height-320))),width:360,height:320});
  }
  function show(){
    if(disposed||!engine.status().settings.enabled)return;
    if(alive()){window.setAlwaysOnTop(engine.status().settings.floating);window.showInactive();return;}
    ready=false;regions=[];ignoring=true;
    const w=window=new BrowserWindow({width:360,height:320,frame:false,transparent:true,backgroundColor:'#00000000',show:false,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:engine.status().settings.floating,title:'半刻 · 莲花桌宠',hasShadow:false,
      webPreferences:{preload:path.join(__dirname,'lotus-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false,devTools:false}});
    place();w.setIgnoreMouseEvents(true,{forward:true});
    w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    for(const name of ['will-navigate','will-frame-navigate','will-redirect'])w.webContents.on(name,e=>e.preventDefault());
    w.webContents.on('will-attach-webview',e=>e.preventDefault());
    w.webContents.on('render-process-gone',(_e,details)=>{log('lotus-renderer',details.reason);if(!w.isDestroyed())w.destroy();});
    w.on('move',()=>{clearTimeout(moveTimer);moveTimer=setTimeout(()=>{if(alive()){const {x,y}=window.getBounds();engine.savePosition({x,y});}},350);});
    w.on('closed',()=>{if(window===w){window=null;ready=false;}});
    w.loadFile(entry).catch(e=>log('lotus-load',e));
  }
  function refresh(){if(engine.status().settings.enabled&&engine.status().ok)show();else{queue=[];sample=null;if(alive())window.hide();}}
  function handle(name,fn){ipcMain.handle(name,async e=>{if(!trusted(e))return {ok:false,error:'无权操作莲花桌宠。'};try{return await fn();}catch(e){log(name,e);return {ok:false,error:e.message};}});}
  handle('banke:lotus-ready',()=>{ready=true;render();if(engine.status().settings.enabled)window.showInactive();return {ok:true};});
  handle('banke:lotus-dismiss',()=>{if(queue.length)queue.shift();else sample=null;render();return {ok:true};});
  handle('banke:lotus-open',onOpen);handle('banke:lotus-settings',onSettings);
  ipcMain.on('banke:lotus-regions',(e,rects)=>{
    if(!trusted(e)||!Array.isArray(rects)||rects.length>8)return;
    if(rects.some(r=>!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>361||r.y+r.height>321))return;
    regions=rects;
  });
  // CSS drag regions consume DOM mouse events. Main-process cursor hit testing
  // enables the native caption drag before a press, while blank pixels remain
  // transparent to input. All geometry comes from this trusted pet renderer.
  const hitTimer=setInterval(()=>{
    if(!alive()||!ready||!engine.status().settings.enabled)return;
    const cursor=screen.getCursorScreenPoint(),bounds=window.getBounds(),x=cursor.x-bounds.x,y=cursor.y-bounds.y;
    const next=!regions.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);
    if(next!==ignoring){ignoring=next;window.setIgnoreMouseEvents(next,{forward:true});}
  },80);hitTimer.unref?.();
  screen.on('display-removed',place);screen.on('display-metrics-changed',place);
  const expiryTimer=setInterval(()=>{const time=Date.now(),before=queue.length,previousSample=sample;queue=queue.filter(x=>time<(x.minutes===0?x.boundary+60000:x.boundary));if(sample&&time>=sample.boundary)sample=null;if(before!==queue.length||previousSample!==sample)render();},1000);expiryTimer.unref?.();
  engine.start();refresh();
  return {
    status:engine.status,
    configure(settings){const result=engine.configure(settings);if(result.ok){queue=queue.filter(x=>settings[x.kind+'Enabled']);refresh();render();engine.tick();}return result;},
    update(state){engine.setState(state);engine.tick();if(queue.length){const current=new Map(require('./lotus-reminders.cjs').makePlan(state,engine.status().settings,Date.now()).map(x=>[x.key,x]));queue=queue.map(x=>current.get(x.key)).filter(Boolean);render();}},
    preview(){if(!engine.status().settings.enabled)return {ok:false,error:'请先保存并开启莲花桌宠。'};if(queue.length)return {ok:false,error:'请先确认莲花上正在显示的日程提醒，再试播。'};sample={title:'静心片刻',location:'这是试播，不会修改日程',kind:'start',boundary:Date.now()+5*60000,minutes:5};show();render();return {ok:true};},
    getWindow:()=>window,
    dispose(){disposed=true;engine.dispose();clearInterval(hitTimer);clearInterval(expiryTimer);clearTimeout(moveTimer);screen.removeListener('display-removed',place);screen.removeListener('display-metrics-changed',place);if(alive())window.destroy();}
  };
}
module.exports={createLotusWindow};
