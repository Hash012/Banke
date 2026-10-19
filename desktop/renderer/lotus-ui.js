(function(){
  'use strict';
  const D=window.BankeDesktop,$=id=>document.getElementById(id);
  if(!D||!D.getLotusStatus){$('lotusButton').hidden=true;return;}
  const ids={enabled:'lotusEnabled',startEnabled:'lotusStartEnabled',endEnabled:'lotusEndEnabled',startMinutes:'lotusStartMinutes',endMinutes:'lotusEndMinutes',floating:'lotusFloating'};
  let busy=false;
  function error(message){$('lotusError').textContent=message||'';$('lotusError').hidden=!message;}
  async function open(){const result=await D.getLotusStatus();if(result.settings){for(const [key,id] of Object.entries(ids)){const node=$(id);if(node.type==='checkbox')node.checked=result.settings[key];else node.value=result.settings[key];}}error(result.error);if(!$('lotusDialog').open)$('lotusDialog').showModal();}
  $('lotusButton').onclick=open;
  $('lotusClose').onclick=()=>$('lotusDialog').close();
  $('lotusForm').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;error('');$('lotusSave').disabled=true;try{const settings={};for(const [key,id] of Object.entries(ids)){const node=$(id);settings[key]=node.type==='checkbox'?node.checked:Number(node.value);}const result=await D.setLotusSettings(settings);if(!result.ok)error(result.error);else $('lotusDialog').close();}finally{busy=false;$('lotusSave').disabled=false;}};
  $('lotusPreview').onclick=async()=>{const result=await D.previewLotus();error(result.ok?'':result.error);};
  D.onLotusSettings(open);
})();
