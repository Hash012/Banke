/* Shared desktop/mobile preview; user text is always inserted as plain text. */
(function(root){
 'use strict';const T=root.BankeTextImport,C=root.PlannerCore,clone=x=>JSON.parse(JSON.stringify(x));
 function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
 function create(host){
  let preview=null,busy=false,previousFocus=null,formRows=[],replacedId=null;
  const layer=node('section','ti-modal');layer.id='textImportDialog';layer.hidden=true;
  const backdrop=node('div','ti-backdrop'),box=node('section','ti-box');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','textImportHeading');
  const header=node('header','ti-header'),heading=node('h2','','文本识别导入');heading.id='textImportHeading';const closeButton=node('button','ti-close','×');closeButton.type='button';closeButton.setAttribute('aria-label','关闭文本导入');header.append(heading,closeButton);
  const description=node('p','ti-description','离线识别，不发送文字、不需要 API Key。先预览确认；缺少关键时间的内容保存为待补全草稿，补齐后才进入日程。');
  const label=node('label','ti-field','输入日程文字'),input=node('textarea');input.id='textImportInput';input.rows=5;input.maxLength=20000;input.placeholder='第7周 周三 14:00-15:00 项目讨论 @A楼\n明天下午三点到五点 复习\n周五 写报告（时间待定）';label.append(input);
  const reference=node('p','ti-reference');reference.id='textImportReference';
  const inputActions=node('div','ti-actions'),parseButton=node('button','ti-primary','识别并预览'),pendingButton=node('button','ti-secondary','查看待核对');parseButton.id='textImportParse';pendingButton.id='textImportPending';inputActions.append(parseButton,pendingButton);
  const error=node('p','ti-error');error.id='textImportError';error.hidden=true;error.setAttribute('role','alert');
  const summary=node('p','ti-summary');summary.id='textImportSummary';summary.setAttribute('aria-live','polite');
  const results=node('div','ti-results');results.id='textImportResults';
  const footer=node('footer','ti-footer'),cancel=node('button','ti-secondary','取消'),confirm=node('button','ti-primary','确认导入所选');confirm.id='textImportConfirm';confirm.disabled=true;footer.append(cancel,confirm);
  box.append(header,description,label,reference,inputActions,error,summary,results,footer);layer.append(backdrop,box);document.body.append(layer);
  function showError(message){error.textContent=message||'';error.hidden=!message;}
  function setBusy(value){busy=value;layer.setAttribute('aria-busy',String(value));for(const button of [parseButton,pendingButton,confirm,cancel,closeButton])button.disabled=value;confirm.disabled=value||!preview;}
  function close(){if(busy)return;layer.hidden=true;host.onClose?.();previousFocus?.focus();}
  async function show(){const state=await host.getState();if(layer.hidden)previousFocus=document.activeElement;layer.hidden=false;host.onOpen?.();showError('');reference.textContent='学期第 1 周：'+state.semesterStart+'；未写周次时暂用第 '+state.selectedWeek+' 周，并标记待核对。';setTimeout(()=>input.focus(),0);}
  async function open(){replacedId=null;preview=null;formRows=[];results.replaceChildren();summary.textContent='';confirm.disabled=true;await show();}
  function field(parent,title,key,value,options){const label=node('label','ti-field',title);let el;
   if(options){el=node('select');for(const [v,text] of options){const option=node('option','',text);option.value=String(v);el.append(option);}}else el=node('input');
   el.dataset.field=key;el.value=value??'';if(el.tagName==='INPUT'){el.type='text';el.maxLength=key==='title'||key==='location'?200:150;}
   label.append(el);parent.append(label);return el;
  }
  function renderRows(rows){
   results.replaceChildren();formRows=[];
   for(const [index,row] of rows.entries()){
    const card=node('article','ti-card');card.dataset.candidateId=row.id;
    const top=node('div','ti-row-top'),selection=node('input');selection.type='checkbox';selection.checked=true;selection.dataset.field='selected';selection.setAttribute('aria-label','选择第 '+(index+1)+' 条');const status=node('strong','','第 '+(index+1)+' 条');top.append(selection,status);
    const fields=node('div','ti-fields');
    field(fields,'安排名称','title',row.title);field(fields,'星期','day',row.day,[['','待补全'],...['周一','周二','周三','周四','周五','周六','周日'].map((d,i)=>[i+1,d])]);
    field(fields,'开始（如 19:40）','start',row.start===null?'':C.formatTime(row.start));field(fields,'结束（可填 24:00）','end',row.end===null?'':C.formatTime(row.end));
    field(fields,'适用周次','weeks',C.formatWeeks(row.weeks));field(fields,'类型','category',row.category,[['course','课程'],['study','学习'],['life','生活'],['rest','休息']]);field(fields,'地点（可留空）','location',row.location);
    const warnings=node('p','ti-warnings',row.warnings.join('；')),source=node('p','ti-source','原文：'+row.source),reviewedLabel=node('label','ti-reviewed'),reviewed=node('input');reviewed.type='checkbox';reviewed.dataset.field='reviewed';reviewedLabel.append(reviewed,document.createTextNode('我已核对预览中的信息，清除疑点标记'));
    card.append(top,fields,warnings,source,reviewedLabel);results.append(card);formRows.push({card,row:clone(row),selection,status,warnings,reviewed});
   }
   confirm.disabled=false;
  }
  function collect(){return formRows.filter(x=>x.selection.checked).map(({card,row:original,reviewed})=>{
    const row=clone(original);
    const value=key=>card.querySelector('[data-field="'+key+'"]').value.trim();
    row.title=value('title');row.location=value('location');row.category=value('category');row.day=value('day')?Number(value('day')):null;
    for(const key of ['start','end']){const raw=value(key);row[key]=raw?C.parseTime(raw.replace(/：/g,':')):null;if(raw&&row[key]===null)throw Error('请更正 '+(row.title||'这条安排')+' 的'+(key==='start'?'开始':'结束')+'时间，或留空作为待补全。');}
    row.weeks=value('weeks')?C.parseWeeks(value('weeks')):[];
    row.warnings=[...new Set(row.warnings.concat(T.required(row)))];row.uncertain=!reviewed.checked&&!!row.warnings.length;
    if(reviewed.checked)row.notes=(row.notes+'\n已由用户核对预览信息。').slice(0,3000);
    return row;
   });}
  function conflicts(state,rows){const previous=state.events.slice();for(const row of rows){if(T.required(row).length)continue;const overlaps=previous.filter(e=>e.id!==row.id&&e.day===row.day&&e.start<row.end&&e.end>row.start&&e.weeks.some(w=>row.weeks.includes(w))&&!(e.title===row.title&&e.start===row.start&&e.end===row.end));if(overlaps.length){const warning='与已有安排时间重叠，请核对';row.warnings=[...new Set(row.warnings.concat(warning))];row.uncertain=true;row.notes=(row.notes+'\n'+warning).slice(0,3000);}previous.push(row);}return rows;}
  function describe(plan){summary.textContent=plan.added.length+' 条可加入日程，'+plan.drafts.length+' 条待补全，'+plan.duplicates.length+' 条重复将跳过。疑点安排会同时出现在待核对。';const duplicates=new Set(plan.duplicates),drafts=new Set(plan.drafts.map(d=>d.id));for(const item of formRows){item.status.textContent=duplicates.has(item.row.id)?'已存在，将跳过':drafts.has(item.row.id)?'待补全，不占用时间格':'可加入日程'+(item.row.uncertain?' · 同时待核对':'');if(duplicates.has(item.row.id))item.selection.checked=false;}}
  async function analyze(){if(busy)return;showError('');try{const state=await host.getState();preview=T.parse(input.value,{semesterStart:state.semesterStart,selectedWeek:state.selectedWeek,today:host.today()});conflicts(state,preview.rows);renderRows(preview.rows);describe(T.prepare(state,preview.rows));}catch(e){preview=null;confirm.disabled=true;showError(e.message);}}
  async function openDraft(row){await show();replacedId=row.id;input.value=row.source;const edited={...clone(row),id:T.newId()};preview={rows:[edited],context:{semesterStart:row.semesterStart}};renderRows(preview.rows);const state=await host.getState();if(row.semesterStart!==state.semesterStart)showError('学期设置已变化，请点击“识别并预览”重新识别原文。');describe(T.prepare(state,preview.rows));}
  async function pending(){if(busy)return;showError('');preview=null;confirm.disabled=true;results.replaceChildren();summary.textContent='';try{const state=await host.getState(),drafts=await host.readDrafts();if(!drafts.ok)throw Error(drafts.error);const unresolved=drafts.items.filter(x=>!state.events.some(e=>e.id===x.id)),marked=state.events.filter(e=>e.uncertain);summary.textContent=unresolved.length+' 条待补全 · '+marked.length+' 条日程待核对。待补全草稿仅保存在当前设备，补齐加入日程后可同步。';
    for(const row of unresolved){const card=node('article','ti-card');card.append(node('strong','',row.title||'未命名安排'),node('p','ti-source',row.source),node('p','ti-warnings',row.warnings.join('；')));const edit=node('button','ti-secondary','补全并预览'),remove=node('button','ti-secondary','移除草稿');edit.onclick=()=>openDraft(row).catch(e=>showError(e.message));remove.onclick=async()=>{const r=await host.removeDraft(row.id);if(!r.ok)showError(r.error);else {await host.changed?.();await pending();}};card.append(edit,remove);results.append(card);}
    for(const e of marked){const card=node('article','ti-card');card.append(node('strong','',e.title),node('p','','周'+['一','二','三','四','五','六','日'][e.day-1]+' '+C.formatTime(e.start)+'–'+C.formatTime(e.end)+' · 第 '+C.formatWeeks(e.weeks)+' 周'));const button=node('button','ti-secondary','查看／修改日程');button.onclick=()=>{close();host.editEvent(e.id);};card.append(button);results.append(card);}
   }catch(e){showError(e.message);}}
  async function save(){if(busy||!preview)return;setBusy(true);showError('');try{
    const rows=collect();if(!rows.length)throw Error('请至少选择一条内容。');const state=await host.getState();if(state.semesterStart!==preview.context.semesterStart)throw Error('学期设置已变化，请重新识别原文。');
    for(const row of rows)if(!T.validDraft(row))throw Error('某条内容超出保存限制，请缩短后重试。');
    const staged=await host.stageDrafts(rows);if(!staged.ok)throw Error(staged.error);
    const result=await host.apply(rows,preview.context.semesterStart);if(!result.ok)throw Error(result.error||'尚未保存，内容已留在待补全草稿，可重试。');
    for(const id of [...result.added.map(x=>x.id),...result.duplicates,...(replacedId&&!result.drafts.some(x=>x.id===replacedId)?[replacedId]:[])])await host.removeDraft(id);
    setBusy(false);preview=null;confirm.disabled=true;await host.changed?.();host.toast('已加入 '+result.added.length+' 条，'+result.drafts.length+' 条待补全，跳过 '+result.duplicates.length+' 条重复。');close();
   }catch(e){showError(e.message);setBusy(false);}}
  parseButton.onclick=analyze;pendingButton.onclick=pending;confirm.onclick=save;closeButton.onclick=cancel.onclick=backdrop.onclick=close;
  layer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const all=[...box.querySelectorAll('button:not(:disabled),input,select,textarea')].filter(n=>n.offsetParent!==null);const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  return {open,openDraft,openPending:async()=>{await show();await pending();},close,isOpen:()=>!layer.hidden};
 }
 root.BankeTextImportUI=Object.freeze({create});
})(window);
