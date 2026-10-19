'use strict';
// Test-only native bridge. Production builds exclude scripts/ entirely.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('BankeNative',Object.freeze({
 loadBundle:()=>ipcRenderer.sendSync('test:mobile-load'),
 saveBundle:raw=>ipcRenderer.sendSync('test:mobile-save',raw),
 getDeviceName:()=>'合成手机验收',request:()=>{throw Error('此离线验收禁止网络请求');}
}));
