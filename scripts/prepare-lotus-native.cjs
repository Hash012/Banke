'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),suite=path.join(root,'.local','lotus-native-'+Date.now());
for(const [edition,source] of [['community',path.join(root,'desktop')],['private','D:/Banke-Codex-Handoff/source/banke-repair/app']]){
  const destination=path.join(suite,edition,'app');fs.mkdirSync(destination,{recursive:true});
  for(const filename of ['main.cjs','preload.cjs','package.json'])fs.copyFileSync(path.join(source,filename),path.join(destination,filename));
  for(const folder of ['lib','renderer','assets'])fs.cpSync(path.join(source,folder),path.join(destination,folder),{recursive:true,filter:file=>path.basename(file)!=='seed.js'});
  // Private built-in courses must never become a fixture. Both native suites
  // start with the same public empty seed and generate their own timed events.
  fs.copyFileSync(path.join(root,'desktop/renderer/seed.js'),path.join(destination,'renderer/seed.js'));
  for(const folder of ['koffi','@koromix'])fs.cpSync(path.join(root,'node_modules',folder),path.join(destination,'node_modules',folder),{recursive:true});
}
fs.writeFileSync(path.join(root,'.local','lotus-suite.json'),JSON.stringify({suite}));console.log(JSON.stringify({suite}));
