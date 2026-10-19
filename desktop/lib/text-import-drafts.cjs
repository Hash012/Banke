'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicWriteFileSync}=require('./state-store.cjs');
const {createBackend}=require('../renderer/text-import-drafts.js');
function createTextDrafts({directory}){
 const filename=path.join(directory,'text-import-drafts.json');
 function read(){try{const s=fs.lstatSync(filename);if(!s.isFile()||s.isSymbolicLink()||s.size>4*1024*1024)throw Error('待补全位置无效。');return fs.readFileSync(filename,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 return createBackend({read,write:raw=>{read();atomicWriteFileSync(filename,Buffer.from(raw,'utf8'));}});
}
module.exports={createTextDrafts};
