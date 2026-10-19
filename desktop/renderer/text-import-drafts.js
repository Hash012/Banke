/* Recoverable local drafts. This data never enters the pairing protocol. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./text-import.js'));
 else root.BankeTextDrafts=factory(root.BankeTextImport);
})(typeof globalThis!=='undefined'?globalThis:this,function(T){
 'use strict';const MAX=2*1024*1024,clone=x=>JSON.parse(JSON.stringify(x));
 function createBackend({read,write}){
  function load(){const raw=read();if(raw===null||raw===undefined)return {version:1,items:[]};if(typeof raw!=='string'||raw.length>MAX)throw Error('待补全记录过大，原记录已保留。');const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.items)||value.items.length>500||!value.items.every(T.validDraft)||new Set(value.items.map(x=>x.id)).size!==value.items.length)throw Error('待补全记录无效，原记录已保留。');return value;}
  function save(value){const raw=JSON.stringify(value);if(raw.length>MAX)throw Error('待补全内容已超过本机保存上限，请先处理已有草稿。');write(raw);return {ok:true,items:clone(value.items)};}
  return {
   read(){try{return {ok:true,items:clone(load().items)};}catch(_){return {ok:false,error:'无法读取待补全记录，原记录已保留。',items:[]};}},
   stage(items,existingIds=[]){try{if(!Array.isArray(items)||items.length>200||!items.every(T.validDraft))throw Error('导入草稿无效。');const value=load(),ids=new Set(existingIds);value.items=value.items.filter(x=>!ids.has(x.id));for(const item of items){if(ids.has(item.id))continue;const old=value.items.find(x=>x.id===item.id);if(old&&JSON.stringify(old)!==JSON.stringify(item))throw Error('这条草稿已改变，请重新打开预览。');if(!old)value.items.push(clone(item));}if(value.items.length>500)throw Error('最多保留 500 条待补全草稿，请先处理已有内容。');return save(value);}catch(e){return {ok:false,error:e.message||'草稿保存失败。'};}},
   remove(id){try{const value=load();value.items=value.items.filter(x=>x.id!==id);return save(value);}catch(e){return {ok:false,error:e.message||'草稿尚未移除。'};}}
  };
 }
 function createLocal(storage){const key='banke.text-import.drafts.v1';return createBackend({read:()=>storage.getItem(key),write:raw=>storage.setItem(key,raw)});}
 return Object.freeze({createBackend,createLocal});
});
