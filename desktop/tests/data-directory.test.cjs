'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolveDataDirectory}=require('../main.cjs');
test('explicit test data directory preserves default and rejects overlap or relative paths',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'banke-isolation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const real=path.join(root,'real','BankePlanner');fs.mkdirSync(real,{recursive:true});
 const flag=p=>['--banke-test-data-dir='+p];
 assert.equal(resolveDataDirectory(real,[]),real);
 const isolated=path.join(root,'isolated','nested');assert.equal(resolveDataDirectory(real,flag(isolated)),isolated);
 for(const p of [real,path.dirname(real),path.join(real,'child'),'relative',path.parse(root).root])assert.throws(()=>resolveDataDirectory(real,flag(p)));
 assert.throws(()=>resolveDataDirectory(real,[...flag(isolated),...flag(isolated)]));
 const link=path.join(root,'redirect');
 fs.symlinkSync(real,link,process.platform==='win32'?'junction':'dir');
 assert.throws(()=>resolveDataDirectory(real,flag(path.join(link,'new-test'))));
});
