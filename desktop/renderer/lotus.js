(function(){
  'use strict';
  const D=window.BankeLotus,$=id=>document.getElementById(id);let current={};
  function regions(){D.regions(Array.from(document.querySelectorAll('.hit')).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0));}
  function render(value){
    current=value;const item=value.reminder;
    $('bubble').hidden=!item;$('pet').classList.toggle('alert',!!item);
    regions();if(!item)return;
    const time=new Date(item.boundary).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
    const remaining=Math.max(0,Math.ceil((item.boundary-Date.now())/60000));
    $('kind').textContent=(value.demo?'试播 · ':item.kind==='start'?'一念 · 将启':'从容 · 将歇')+(value.count>1?' · 另有 '+(value.count-1)+' 条':'');
    $('title').textContent=item.title;$('title').title=item.title;
    $('timing').textContent=(remaining?'约 '+remaining+' 分钟后':'现在')+(item.kind==='start'?'开始':'结束')+' · '+time;
    $('location').textContent=item.location;$('location').title=item.location;
  }
  D.onView(render);D.ready();
  $('dismiss').onclick=()=>D.dismiss();$('open').onclick=()=>D.open();$('settings').onclick=()=>D.settings();
  setInterval(()=>render(current),1000);
  new ResizeObserver(regions).observe($('pet'));regions();
})();
