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
  // Read the actual petal animation phase, so captions stay aligned when a
  // reminder changes the breath from seven seconds to three, or after resume.
  const quiet=$('quiet'),petals=document.querySelector('.petals');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let captionFrame;
  function caption(){
    const animation=petals.getAnimations().find(a=>a.animationName==='breathe'||a.animationName==='bloom');
    const progress=animation?.effect.getComputedTiming().progress;
    const still=reduced.matches;
    const phase=still?'still':progress!=null&&progress>=.5?'exhale':'inhale';
    const text=still?'半刻 · 念念相续 · 无喜无惧':phase==='inhale'?'半刻 · 念念相续':'半刻 · 无喜无惧';
    if(quiet.textContent!==text){quiet.textContent=text;regions();}
    quiet.dataset.phase=phase;
    const half=progress==null?0.5:(progress%0.5)*2;
    // Fade out at each half-breath boundary, then bring in the next phrase.
    quiet.style.opacity=still?'1':String(Math.min(1,half/.12,(1-half)/.12));
    if(!still)captionFrame=requestAnimationFrame(caption);
  }
  reduced.addEventListener('change',()=>{cancelAnimationFrame(captionFrame);caption();});
  caption();
  D.onView(render);D.ready();
  $('dismiss').onclick=()=>D.dismiss();$('open').onclick=()=>D.open();$('settings').onclick=()=>D.settings();
  setInterval(()=>render(current),1000);
  new ResizeObserver(regions).observe($('pet'));regions();
})();
