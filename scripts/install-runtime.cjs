"use strict";
// Use the pinned official archive and the checksum shipped in Electron's npm
// package. All cache/extraction paths belong to this repository.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const packageFile=require.resolve('electron/package.json');
const electron=path.dirname(packageFile),version=require(packageFile).version;
const platform=process.platform,arch=process.arch;
const name=`electron-v${version}-${platform}-${arch}.zip`;
const checksums=require(path.join(electron,'checksums.json'));
if(!checksums[name])throw Error('Unsupported Electron platform or architecture');
const executable=platform==='win32'?'electron.exe':platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron';
const dest=path.join(electron,'dist'),marker=path.join(electron,'path.txt'),verified=path.join(electron,'.banke-runtime-verified');
if(fs.existsSync(verified)&&fs.readFileSync(verified,'utf8')===checksums[name]&&fs.existsSync(marker)&&fs.readFileSync(marker,'utf8')===executable&&fs.existsSync(path.join(dest,executable))&&fs.existsSync(path.join(dest,'version'))&&fs.readFileSync(path.join(dest,'version'),'utf8').trim().replace(/^v/,'')===version){fs.writeFileSync(marker,executable);process.exit(0);}
const cache=path.join(root,'.local','electron-cache');fs.mkdirSync(cache,{recursive:true});
const archive=path.join(cache,name);
function correct(){return fs.existsSync(archive)&&crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')===checksums[name];}
if(!correct()){
 const result=spawnSync(platform==='win32'?'curl.exe':'curl',['--fail','--location','--retry','2','--max-time','240','--output',archive,`https://github.com/electron/electron/releases/download/v${version}/${name}`],{stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw Error('Official Electron download failed; verify network/proxy settings and retry npm ci');
}
if(!correct())throw Error('Official Electron checksum mismatch; archive not extracted');
require('@electron-internal/extract-zip').extract(archive,{dir:dest}).then(()=>{
 if(!fs.existsSync(path.join(dest,executable)))throw Error('Electron archive missing its executable');
 fs.writeFileSync(verified,checksums[name]);fs.writeFileSync(marker,executable);console.log('Pinned official Electron runtime verified and installed');
}).catch(error=>{console.error(error.message);process.exitCode=1;});
