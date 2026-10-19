'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createWorkspaceController}=require('../lib/workspace-controller.cjs');
function fixture(){
 let id=0, editor=null,widget=null,modePrefs={version:1,mode:'window',displayId:null,normalBounds:null};
 let timers=[],bad=false,delayed=null;const calls=[];
 class Window extends EventEmitter{
  constructor(role){super();this.role=role;this.id=++id;this.dead=false;this.visible=false;this.bounds={x:40,y:50,width:1300,height:850};}
  isDestroyed(){return this.dead;}getNativeWindowHandle(){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(this.id));return b;}
  show(){this.visible=true;calls.push(['show',this.role]);}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){}
  isMinimized(){return false;}isMaximized(){return false;}setAlwaysOnTop(v){assert.equal(v,false);}setSkipTaskbar(v){assert.equal(this.role,'editor');assert.equal(v,false);}
  setBounds(b){this.bounds=b;}getNormalBounds(){return this.bounds;}
 }
 const layer={attach(h){assert.notEqual(Number(h.readBigUInt64LE()),editor.id,'NEVER reparent editor');assert.equal(widget.visible,true,'native renderer must be realized before parenting');calls.push(['attach']);return bad?{ok:false,error:'Windows error 1400'}:{ok:true,attached:true};},
  position(){return bad?{ok:false,error:'Windows error 1400'}:{ok:true,attached:true};},hide(){calls.push(['hideWidget']);return bad?{ok:false,error:'1400'}:{ok:true};},forget(){calls.push(['forget']);},detach(){throw Error('FORBIDDEN: detach must never be called');}};
 const displays=[{id:1,label:'Main',workArea:{x:0,y:0,width:1920,height:1080}},{id:2,label:'Second',workArea:{x:-1600,y:0,width:1600,height:900}}];
 const screen=Object.assign(new EventEmitter(),{getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],dipToScreenRect:(_w,b)=>b});
 const controller=createWorkspaceController({platform:'win32',screen,layer,app:{isPackaged:true,getPath:()=>'/test/Banke.exe',getLoginItemSettings:()=>({openAtLogin:false})},
  preferences:{load:()=>({ok:true,state:modePrefs}),save:p=>{modePrefs=structuredClone(p);return {ok:true};}},getEditor:()=>editor,makeEditor:()=>editor=new Window('editor'),getWidget:()=>widget,
  makeWidget:()=>widget=new Window('desktop'),waitReady:win=>win.role==='desktop'&&delayed?delayed:Promise.resolve(win),retireWidget:w=>{w.dead=true;w.visible=false;if(widget===w)widget=null;},
  timers:{setInterval:fn=>{timers.push(fn);return {unref(){}};},clearInterval(){},setTimeout,clearTimeout}});
 return {controller,calls,get editor(){return editor;},get widget(){return widget;},setBad(v){bad=v;},setDelay(p){delayed=p;},poll:()=>timers[0]()};
}
test('pin/return twenty times never detaches a wallpaper HWND and keeps one normal editor',async()=>{
 const f=fixture();await f.controller.initialize();const editor=f.editor;
 for(let i=0;i<20;i++){assert.equal((await f.controller.setMode(true)).ok,true);assert.notEqual(f.editor,f.widget);assert.equal(f.editor.visible,false);assert.equal((await f.controller.setMode(false)).ok,true);assert.equal(f.editor,editor);assert.equal(editor.visible,true);}
 assert.equal(f.calls.filter(x=>x[0]==='attach').length,1,'reuse healthy dedicated widget');f.controller.dispose();
});
test('1400 and invalid/destroyed wallpaper cannot block ordinary window recovery',async()=>{
 const f=fixture();await f.controller.initialize();await f.controller.setMode(true);const id=f.editor.id;f.setBad(true);
 const result=await f.controller.showEditor();assert.equal(result.ok,true);assert.equal(f.editor.id,id);assert.equal(f.editor.visible,true);assert.equal(f.widget,null);f.controller.dispose();
});
test('failed attach leaves editor visible without an endless automatic retry loop',async()=>{
 const f=fixture();await f.controller.initialize();f.setBad(true);assert.equal((await f.controller.setMode(true)).ok,false);assert.equal(f.editor.visible,true);assert.equal(f.controller.status().mode,'window');assert.equal(f.widget,null);f.controller.dispose();
});
test('return during pending widget load cancels attachment and retains ordinary editor',async()=>{
 const f=fixture();await f.controller.initialize();let resolve;f.setDelay(new Promise(r=>resolve=r));const pin=f.controller.setMode(true);await f.controller.showEditor();resolve();assert.equal((await pin).ok,false);assert.equal(f.controller.status().mode,'window');assert.equal(f.calls.some(x=>x[0]==='attach'),false);f.controller.dispose();
});
test('Explorer loss during periodic health check recovers a normal window without detach',async()=>{
 const f=fixture();await f.controller.initialize();await f.controller.setMode(true);f.setBad(true);f.poll();await new Promise(setImmediate);assert.equal(f.controller.status().mode,'window');assert.equal(f.editor.visible,true);f.controller.dispose();
});
test('screen switch uses correct negative-monitor right half without changing editor parent',async()=>{
 const f=fixture();await f.controller.initialize();await f.controller.setMode(true);assert.equal((await f.controller.nextDisplay()).ok,true);assert.equal(f.controller.status().displayLabel,'Second');assert.equal(f.controller.statusForWindow(f.editor).mode,'window');assert.equal(f.controller.statusForWindow(f.widget).mode,'desktop');f.controller.dispose();
});
