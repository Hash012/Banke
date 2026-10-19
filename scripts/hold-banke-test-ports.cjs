'use strict';
// Only owns the listeners it creates; never terminates or changes other owners.
const net=require('node:net'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),token=Date.now().toString();
const release=path.join(root,'.local','release-test-ports-'+token+'.flag');
const listeners=[];
const results=[];
(async()=>{
 for(const port of [47831,50554]){
  await new Promise(resolve=>{
   const server=net.createServer(socket=>socket.end());
   server.once('error',e=>{results.push({port,held:false,error:e.code});resolve();});
   server.listen({host:'0.0.0.0',port,exclusive:true},()=>{listeners.push(server);results.push({port,held:true});resolve();});
  });
 }
 fs.writeFileSync(path.join(root,'.local','test-port-holder.json'),JSON.stringify({pid:process.pid,results,release}));
 const poll=setInterval(()=>{if(fs.existsSync(release)){clearInterval(poll);for(const server of listeners)server.close();}},250);
 const timeout=setTimeout(()=>{clearInterval(poll);for(const server of listeners)server.close();},300000);timeout.unref();
})();
