'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const Core = require('./core.cjs');
const { atomicWriteFileSync, MAX_PAYLOAD_BYTES } = require('./state-store.cjs');
function readBackup(filename) {
  const stat=fs.statSync(filename);
  if(!stat.isFile() || stat.size>MAX_PAYLOAD_BYTES)throw new Error('请选择不超过 16 MiB 的日程 JSON 备份文件。');
  const bytes=fs.readFileSync(filename);if(bytes.length>MAX_PAYLOAD_BYTES)throw new Error('备份文件过大。');
  const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));
  const errors=Core.validateState(state);if(errors.length)throw new Error(errors.slice(0,3).join(' '));
  return state;
}
function createBackupManager({directory,service,now=Date.now}) {
  const previews=new Map();
  function preview(senderId,filename) {
    const state=readBackup(filename),current=service.loadDesktopState();
    const token=crypto.randomBytes(24).toString('hex');
    previews.set(senderId,{token,state,revision:current.revision,expires:now()+10*60*1000});
    return {ok:true,token,state,fileName:path.basename(filename)};
  }
  function apply(senderId,token) {
    const p=previews.get(senderId);
    if(!p || p.token!==token || p.expires<now())return {ok:false,error:'导入预览已失效，请重新选择备份。'};
    const current=service.loadDesktopState();
    if(current.revision!==p.revision)return {ok:false,error:'预览后日程已发生变化。没有导入，请重新选择备份并核对。'};
    // Automatic local backup: does not depend on a second save dialog, Explorer,
    // Internet, or the wallpaper HWND. Backup failure aborts the import.
    const folder=path.join(directory,'backups');
    const name='before-import-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
    let backupPath=null;
    try {
      fs.mkdirSync(folder,{recursive:true,mode:0o700});
      if(current.state){backupPath=path.join(folder,name+'.json');atomicWriteFileSync(backupPath,JSON.stringify(current.state,null,2)+'\n');}
      else if(typeof current.raw==='string'){backupPath=path.join(folder,name+'-unreadable.txt');atomicWriteFileSync(backupPath,current.raw);}
      else if(!current.ok)return {ok:false,error:'无法备份原日程，导入已停止：'+(current.error||'文件暂时不可读。')};
      const result=service.replaceDesktopState(p.state,p.revision);
      if(!result.ok)return {...result,backupPath};
      previews.delete(senderId);return {...result,backupPath};
    }catch(e){return {ok:false,error:'原日程未被替换：'+e.message};}
  }
  return {preview,apply,forget:senderId=>previews.delete(senderId)};
}
module.exports={readBackup,createBackupManager};
