"use strict";
// Operates exclusively on a live BrowserWindow owned by this process. An NSView
// belongs to its NSWindow; never apply Windows HWND operations on macOS.
function createMacDesktopLayer({platform=process.platform,resolveWindow,loadKoffi=()=>require('koffi')}={}) {
 const attached=new Set();let api;
 function native(win){
  if(platform!=='darwin'||!win||win.isDestroyed())throw Error('The macOS desktop window is no longer available.');
  const b=win.getNativeWindowHandle();
  if(!Buffer.isBuffer(b)||b.length!==8||b.readBigUInt64LE()===0n)throw Error('Invalid NSView handle.');
  if(!api){
   const k=loadKoffi(),objc=k.load('/usr/lib/libobjc.A.dylib'),cg=k.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
   api={selector:objc.func('void *sel_registerName(const char *)'),pointer:objc.func('void *objc_msgSend(void *, void *)'),integer:objc.func('intptr_t objc_msgSend(void *, void *)'),setInteger:objc.func('void objc_msgSend(void *, void *, intptr_t)'),windowLevel:cg.func('int32_t CGWindowLevelForKey(int32_t)')};
   api.level=api.windowLevel(18)+1; // Above desktop icons, below ordinary windows.
   if(!Number.isSafeInteger(api.level)||api.level>=0)throw Error('Invalid macOS desktop level.');
  }
  const window=api.pointer(b.readBigUInt64LE(),api.selector('window'));
  if(!window)throw Error('NSView has no live window.');
  return window;
 }
 function own(handle){
  if(!Buffer.isBuffer(handle)||handle.length!==8||typeof resolveWindow!=='function')throw Error('An owned desktop window is required.');
  const win=resolveWindow(handle);
  if(!win||win.isDestroyed()||!win.getNativeWindowHandle().equals(handle))throw Error('Unknown or closed desktop window.');
  return win;
 }
 function bounds(value){
  if(!value||!['x','y','width','height'].every(k=>Number.isSafeInteger(value[k]))||value.width<=0||value.height<=0)throw Error('Invalid desktop bounds.');
  return {x:value.x,y:value.y,width:value.width,height:value.height};
 }
 function position(handle,rectangle){
  try{
   const win=own(handle),target=bounds(rectangle),current=win.getBounds();
   if(Object.keys(target).some(k=>current[k]!==target[k]))win.setBounds(target);
   if(!win.isVisible())win.showInactive();
   const window=native(win);
   api.setInteger(window,api.selector('setCollectionBehavior:'),1|16|64|256);
   api.setInteger(window,api.selector('setLevel:'),api.level);
   const level=Number(api.integer(window,api.selector('level')));
   if(level!==api.level)throw Error('macOS did not accept the desktop window level.');
   attached.add(handle.toString('hex'));
   return {ok:true,attached:true,level};
  }catch(error){return {ok:false,attached:false,error:error.message};}
 }
 function hide(handle){try{own(handle).hide();return {ok:true};}catch(error){return {ok:false,error:error.message};}}
 return Object.freeze({attach:position,position,hide,forget:handle=>{if(Buffer.isBuffer(handle))attached.delete(handle.toString('hex'));}});
}
module.exports={createMacDesktopLayer};
