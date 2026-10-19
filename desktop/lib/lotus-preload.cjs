'use strict';
const {contextBridge,ipcRenderer}=require('electron');
if(process.isMainFrame!==false) contextBridge.exposeInMainWorld('BankeLotus',Object.freeze({
  ready:()=>ipcRenderer.invoke('banke:lotus-ready'),
  dismiss:()=>ipcRenderer.invoke('banke:lotus-dismiss'),
  open:()=>ipcRenderer.invoke('banke:lotus-open'),
  settings:()=>ipcRenderer.invoke('banke:lotus-settings'),
  regions:rects=>ipcRenderer.send('banke:lotus-regions',rects),
  onView:callback=>ipcRenderer.on('banke:lotus-view',(_e,value)=>callback(value))
}));
