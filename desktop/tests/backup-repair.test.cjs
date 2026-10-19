'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStateStore}=require('../lib/state-store.cjs'),{createSyncService}=require('../lib/sync-service.cjs'),{createBackupManager}=require('../lib/backup-manager.cjs');
const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/synthetic-schedule.json'),'utf8'));
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'banke-import-')),store=createStateStore({directory});store.saveState(original);const service=createSyncService({directory,store,host:'127.0.0.1',port:0}),backups=createBackupManager({directory,service});t.after(()=>{service.dispose();fs.rmSync(directory,{recursive:true,force:true});});return {directory,store,service,backups};}
test('import succeeds without window conversion or any save-file dialog and keeps exact pre-import backup',t=>{
 const f=fixture(t),candidate=structuredClone(original);candidate.events[0].title='导入的新标题';const file=path.join(f.directory,'test.json');fs.writeFileSync(file,'\uFEFF'+JSON.stringify(candidate));const p=f.backups.preview(1,file),r=f.backups.apply(1,p.token);assert.equal(r.ok,true);assert.deepEqual(r.state,candidate);assert.deepEqual(JSON.parse(fs.readFileSync(r.backupPath)),original);assert.deepEqual(f.service.loadDesktopState().state,candidate);
});
test('invalid preview token and concurrent edits cannot overwrite the latest schedule',t=>{
 const f=fixture(t),file=path.join(f.directory,'import.json');fs.writeFileSync(file,JSON.stringify(original));const p=f.backups.preview(1,file);assert.equal(f.backups.apply(2,p.token).ok,false);const updated=structuredClone(original);updated.events[0].title='手机刚编辑';f.service.saveDesktopState(updated);assert.equal(f.backups.apply(1,p.token).ok,false);assert.equal(f.service.loadDesktopState().state.events[0].title,'手机刚编辑');
});
test('backup write failure blocks import and leaves existing schedule unchanged',t=>{
 const f=fixture(t),file=path.join(f.directory,'import.json');fs.writeFileSync(file,JSON.stringify(original));const p=f.backups.preview(1,file);fs.writeFileSync(path.join(f.directory,'backups'),'not a directory');assert.equal(f.backups.apply(1,p.token).ok,false);assert.deepEqual(f.service.loadDesktopState().state,original);
});
test('bad input is rejected before replacing any schedule',t=>{
 const f=fixture(t),file=path.join(f.directory,'bad.json');fs.writeFileSync(file,'{"version":1}');assert.throws(()=>f.backups.preview(1,file));assert.deepEqual(f.service.loadDesktopState().state,original);
});
