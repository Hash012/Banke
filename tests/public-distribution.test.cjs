"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const root=path.resolve(__dirname,'..');
test('desktop and phone ship an identical empty current-week seed, never a personal schedule',()=>{
 const seeds=['desktop/renderer/seed.js','mobile/web/seed.js'].map(name=>fs.readFileSync(path.join(root,name),'utf8'));
 assert.equal(seeds[0],seeds[1]);
 for(const source of seeds){const window={};vm.runInNewContext(source,{window,Date});const state=JSON.parse(JSON.stringify(window.BANKE_SEED.state));assert.deepEqual(state.events,[]);assert.deepEqual(state.completed,[]);assert.equal(state.selectedWeek,1);assert.equal(new Date(state.semesterStart+'T12:00:00').getDay(),1);assert.deepEqual(require('../desktop/lib/core.cjs').validateState(state),[]);}
});
test('test data override cannot write the private or old public profile',t=>{
 const {resolveDataDirectory}=require('../desktop/main.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'community-boundary-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const current=path.join(dir,'BankeCommunity'),privateDir=path.join(dir,'BankePlanner'),legacy=path.join(dir,'BankeGenericSync');
 for(const bad of [privateDir,path.join(privateDir,'child'),legacy,dir])assert.throws(()=>resolveDataDirectory(current,['--banke-test-data-dir='+bad],[privateDir,legacy]));
 assert.equal(resolveDataDirectory(current,['--banke-test-data-dir='+path.join(dir,'isolated')],[privateDir,legacy]),path.join(dir,'isolated'));
});
test('desktop and Android identities are separate from previous applications',()=>{
 const pkg=require('../package.json');assert.equal(pkg.build.appId,'org.banke.community.desktop');assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);assert.equal(pkg.build.win.executableName,'BankeCommunity');
 const manifest=fs.readFileSync(path.join(root,'mobile/android/AndroidManifest.xml'),'utf8');assert.match(manifest,/package="org.banke.community.mobile"/);assert.match(manifest,/android:allowBackup="false"/);
 const host=fs.readFileSync(path.join(root,'mobile/android/src/org/banke/community/mobile/MainActivity.java'),'utf8');assert.match(host,/setAllowUniversalAccessFromFileURLs\(false\)/);assert.match(host,/setInstanceFollowRedirects\(false\)/);
});
