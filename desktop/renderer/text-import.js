/* Offline Chinese schedule parsing. Unknown fields stay unknown. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.BankeTextImport=factory(root.PlannerCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const NUMBER='[0-9零〇一二两三四五六七八九十]{1,3}';
  const PERIOD='(?:凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)';
  const TOKEN='('+PERIOD+'?\\s*'+NUMBER+'(?:[:：]\\d{1,2}|[点时](?:'+NUMBER+'分?|半|一刻|三刻)?)?)';
  const TIME_RANGE=new RegExp(TOKEN+'\\s*(?:-|—|–|~|～|至|到)\\s*'+TOKEN,'g');
  const categories=['course','study','life','rest'];
  function number(text){
    if(/^\d+$/.test(text))return Number(text);
    const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    if(text==='十')return 10;
    if(text.includes('十')){const [a,b]=text.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0);}
    return Object.hasOwn(digits,text)?digits[text]:NaN;
  }
  function date(y,m,d){
    const value=new Date(Date.UTC(y,m-1,d));
    return value.getUTCFullYear()===y&&value.getUTCMonth()===m-1&&value.getUTCDate()===d?value.toISOString().slice(0,10):null;
  }
  function addDays(iso,n){return new Date(Date.parse(iso+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
  function dayOf(iso){return ((new Date(iso+'T00:00:00Z').getUTCDay()+6)%7)+1;}
  function time(text,inherited){
    const p=text.match(new RegExp(PERIOD)),period=p?p[0]:inherited||'';
    const value=text.replace(new RegExp(PERIOD),'').trim();
    const match=value.match(new RegExp('^('+NUMBER+')(?:[:：](\\d{1,2})|[点时]('+NUMBER+'分?|半|一刻|三刻)?)?$'));
    if(!match)return null;
    let h=number(match[1]),m=0;
    if(match[2]!==undefined)m=Number(match[2]);
    else if(match[3])m=match[3]==='半'?30:match[3]==='一刻'?15:match[3]==='三刻'?45:number(match[3].replace(/分$/,''));
    if(/凌晨|早上|早晨|上午/.test(period)&&h>12)return null;
    if(/下午|傍晚|晚上|夜里/.test(period)&&h<12)h+=12;
    if(period==='中午'&&h>=1&&h<=10)h+=12;
    if(period==='凌晨'&&h===12)h=0;
    return Number.isInteger(h)&&Number.isInteger(m)&&h>=0&&h<=24&&m>=0&&m<60&&(h<24||m===0)?{value:h*60+m,period}:null;
  }
  function newId(){return 'text-'+(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
  function required(row){
    const issues=[];
    if(!row.title.trim())issues.push('缺少安排名称');
    if(!Number.isInteger(row.day)||row.day<1||row.day>7)issues.push('缺少有效星期或日期');
    if(row.start===null||row.start<0||row.start>=1440)issues.push('缺少有效开始时间');
    if(row.end===null||row.end<1||row.end>1440)issues.push('缺少有效结束时间');
    if(row.start!==null&&row.end!==null&&row.end<=row.start)issues.push('结束须晚于开始；跨日请拆分');
    if(!row.weeks.length)issues.push('缺少有效周次');
    return issues;
  }
  function event(row){return {id:row.id,title:row.title.trim(),day:row.day,start:row.start,end:row.end,category:row.category,location:row.location.trim(),notes:row.notes,weeks:row.weeks.slice(),uncertain:row.uncertain};}
  function sameSlot(a,b){return a.title.trim()===b.title.trim()&&a.day===b.day&&a.start===b.start&&a.end===b.end&&a.location.trim()===b.location.trim();}
  function prepare(state,rows){
    const events=clone(state.events),drafts=[],added=[],duplicates=[];
    for(const original of rows){
      const row=clone(original);
      if(required(row).length){drafts.push(row);continue;}
      const candidate=event(row),errors=C.validateEvent(candidate);
      if(errors.length)throw Error(errors[0]);
      const covered=new Set(events.filter(e=>sameSlot(e,candidate)).flatMap(e=>e.weeks));
      candidate.weeks=candidate.weeks.filter(w=>!covered.has(w));
      if(!candidate.weeks.length||events.some(e=>e.id===candidate.id)){duplicates.push(row.id);continue;}
      events.push(candidate);added.push(candidate);
    }
    const next={...clone(state),events};const errors=C.validateState(next);
    if(errors.length)throw Error(errors[0]);
    return {state:next,added,drafts,duplicates};
  }
  function parse(input,context){
    if(typeof input!=='string'||!input.trim())throw Error('请先输入要识别的文字。');
    if(input.length>20000)throw Error('一次最多输入 20000 个字符，请分批导入。');
    C.weekDates(context.semesterStart,1);
    if(!Number.isInteger(context.selectedWeek)||context.selectedWeek<1||context.selectedWeek>24)throw Error('参考周次无效。');
    const today=context.today;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(today||'')||!date(...today.split('-').map(Number)))throw Error('参考日期无效。');
    const normalized=input.normalize('NFKC').replace(/[‐‑−]/g,'-').replace(/週/g,'周');
    const lines=normalized.split(/[\n；;]+|[，,](?=\s*(?:今天|明天|后天|下周|本周|这周|周[一二三四五六日天]|星期))/).map(s=>s.replace(/^\s*(?:[-*•]\s+|\d+[、.)]\s+)/,'').trim()).filter(Boolean);
    if(lines.length>100)throw Error('一次最多识别 100 段文字，请分批导入。');
    let inheritedWeeks=null;const rows=[];
    for(const source of lines){
      if(source.length>1500)throw Error('单段最多 1500 字，请按安排分行。');
      const warnings=[];let text=source,weekMatch=text.match(/(?:第\s*)?([\d\s,、\-—~～至到]+)\s*周(?![一二三四五六日天])/);
      let weeks=null,explicitWeeks=false;
      if(weekMatch){
        try{weeks=C.parseWeeks(weekMatch[1].replace(/[—~～至到]/g,'-').replace(/、/g,','));explicitWeeks=true;}catch(_){weeks=[];warnings.push('周次范围无效，请核对');}
        text=text.replace(weekMatch[0],' ');
      }
      if(!weeks&&inheritedWeeks){weeks=inheritedWeeks.slice();explicitWeeks=true;}
      if(weeks&&/[单双]周/.test(text)){const odd=/单周/.test(text);weeks=weeks.filter(w=>w%2===(odd?1:0));text=text.replace(/[单双]周/g,' ');}
      if(weekMatch&&!text.replace(/[：:\s()（）]/g,'')){inheritedWeeks=weeks;continue;}
      let days=[],absolute=null;
      const absoluteMatch=text.match(/(?:(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})(?:日|号)?|(\d{1,2})月(\d{1,2})(?:日|号)?|(\d{1,2})\/(\d{1,2}))/);
      if(absoluteMatch){
        absolute=date(Number(absoluteMatch[1]||today.slice(0,4)),Number(absoluteMatch[2]||absoluteMatch[4]||absoluteMatch[6]),Number(absoluteMatch[3]||absoluteMatch[5]||absoluteMatch[7]));
        if(!absoluteMatch[1])warnings.push('日期未写年份，按 '+today.slice(0,4)+' 年识别');
        if(!absolute){weeks=[];warnings.push('日期不存在，请核对');}
        text=text.replace(absoluteMatch[0],' ');
      }
      const relative=text.match(/今天|明天|后天/);
      if(relative){const relativeDate=addDays(today,{今天:0,明天:1,后天:2}[relative[0]]);if(absolute&&absolute!==relativeDate)warnings.push('文字日期与相对日期不一致');else absolute=relativeDate;text=text.replace(relative[0],' ');}
      const dayPattern=/(?:周|星期|礼拜)([一二三四五六日天1-7])((?:[、,和及]\s*(?:(?:周|星期|礼拜))?[一二三四五六日天1-7])*)/g;
      const map={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7};
      for(const match of text.matchAll(dayPattern)){for(const token of (match[1]+match[2].replace(/周|星期|礼拜/g,'')).match(/[一二三四五六日天1-7]/g)||[])days.push(map[token]||Number(token));}
      const explicitDays=[...new Set(days)];
      if(absolute){
        const week=C.teachingWeek(absolute,context.semesterStart),actualDay=dayOf(absolute);
        if(explicitDays.length&&(!explicitDays.includes(actualDay)||explicitDays.length>1))warnings.push('日期与星期不一致，优先按日期识别');
        days=[actualDay];
        if(week<1||week>24){weeks=[];warnings.push('日期不在当前学期的 24 周内');}
        else if(explicitWeeks&&!weeks.includes(week)){weeks=[];warnings.push('日期与给定周次冲突，请核对');}
        else weeks=[week];
      }else{
        days=explicitDays;
        if(/(?:下周|下星期|下礼拜)/.test(text)||/(?:本周|这周|本星期)/.test(text)){
          const target=addDays(today,/(?:下周|下星期|下礼拜)/.test(text)?7:0),week=C.teachingWeek(target,context.semesterStart);
          if(week<1||week>24){weeks=[];warnings.push('相对日期不在当前学期内');}
          else if(explicitWeeks&&!weeks.includes(week)){weeks=[];warnings.push('相对日期与给定周次冲突，请核对');}
          else weeks=[week];
        }
      }
      text=text.replace(/(?:下|本|这)(?=周|星期|礼拜)/g,'').replace(dayPattern,' ').replace(/每\s*(?:周|星期|礼拜)?/g,' ');
      if(!weeks){weeks=[context.selectedWeek];warnings.push('未写周次，暂按参考第 '+context.selectedWeek+' 周，请核对');}
      if(/每周|每星期|每礼拜/.test(source)&&!explicitWeeks&&!absolute)warnings.push('重复范围未写明，目前仅加入参考周');
      let start=null,end=null;
      TIME_RANGE.lastIndex=0;
      const ranges=[...text.matchAll(TIME_RANGE)].filter(m=>/[:：点时]|凌晨|上午|中午|下午|晚上/.test(m[0]));
      if(ranges.length===1){
        const match=ranges[0],a=time(match[1]),b=time(match[2],a?.period);
        start=a&&a.value<1440?a.value:null;end=b?b.value:null;
        if(!a||!b)warnings.push('时间格式或时段不明确，请核对');
        if(!a?.period&&!/[:：]/.test(match[0])&&a&&a.value<720)warnings.push('未写上午／下午，请核对时间');
        text=text.replace(match[0],' ');
      }else if(ranges.length>1){warnings.push('同一段出现多组时间，请拆分为多条安排');}
      else{
        const single=text.match(new RegExp('('+PERIOD+'?\\s*'+NUMBER+'(?:[:：]\\d{1,2}|[点时](?:半|'+NUMBER+'分?)?))'));
        if(single){start=time(single[0])?.value??null;if(start===1440)start=null;text=text.replace(single[0],' ');}
      }
      if(/大概|大约|左右|可能|待定|暂定|不确定|待确认|待核对|[?？]/.test(source))warnings.push('原文含有不确定表述');
      let location='',notes='';const note=text.match(/(?:备注|说明)\s*[:：]\s*(.+)$/);
      if(note){notes=note[1].trim();text=text.replace(note[0],' ');}
      const place=text.match(/(?:地点\s*[:：]|@)\s*([^\n]+)$/);
      if(place){location=place[1].trim();text=text.replace(place[0],' ');}
      let category='study';const categoryMatch=text.match(/[\[【](课程|学习|生活|休息)[\]】]/);
      if(categoryMatch){category={课程:'course',学习:'study',生活:'life',休息:'rest'}[categoryMatch[1]];text=text.replace(categoryMatch[0],' ');}
      else if(/课程|上课|讲座|实验课/.test(text))category='course';
      else if(/吃饭|午餐|晚餐|运动|跑步|购物|就医/.test(text))category='life';
      else if(/睡觉|休息|午睡/.test(text))category='rest';
      const title=text.replace(/^[\s:：,，、()（）-]+|[\s:：,，、()（）-]+$/g,'').replace(/\s+/g,' ').replace(/(?:大概|大约|左右|可能|待定|暂定|不确定|待确认|待核对|[?？])/g,'').trim();
      for(const day of days.length?[...new Set(days)]:[null]){
        const row={id:newId(),title:title.slice(0,200),day,start,end,weeks:weeks.slice(),category,location:location.slice(0,200),notes:'',uncertain:false,source,warnings:warnings.slice(),semesterStart:context.semesterStart};
        if(title.length>200)row.warnings.push('名称过长，预览已截到 200 字');
        if(location.length>200)row.warnings.push('地点过长，预览已截到 200 字');
        row.warnings=[...new Set(row.warnings.concat(required(row)))];row.uncertain=!!row.warnings.length;
        row.notes=([notes,'文本导入原文：'+source,row.warnings.length?'待核对：'+row.warnings.join('；'):''].filter(Boolean).join('\n')).slice(0,3000);
        rows.push(row);if(rows.length>200)throw Error('展开后超过 200 条，请分批导入。');
      }
    }
    if(!rows.length)throw Error('没有识别到安排，请补充名称、日期和时间。');
    return {rows,context:{semesterStart:context.semesterStart,selectedWeek:context.selectedWeek,today}};
  }
  function validDraft(x){
    return !!x&&typeof x==='object'&&typeof x.id==='string'&&/^text-[a-zA-Z0-9._:-]{1,110}$/.test(x.id)&&
      typeof x.title==='string'&&x.title.length<=200&&(x.day===null||Number.isInteger(x.day)&&x.day>=1&&x.day<=7)&&
      (x.start===null||Number.isInteger(x.start)&&x.start>=0&&x.start<1440)&&(x.end===null||Number.isInteger(x.end)&&x.end>=1&&x.end<=1440)&&
      Array.isArray(x.weeks)&&x.weeks.length<=24&&x.weeks.every(w=>Number.isInteger(w)&&w>=1&&w<=24)&&new Set(x.weeks).size===x.weeks.length&&
      categories.includes(x.category)&&typeof x.location==='string'&&x.location.length<=200&&typeof x.notes==='string'&&x.notes.length<=3000&&typeof x.uncertain==='boolean'&&
      typeof x.source==='string'&&x.source.length<=1500&&typeof x.semesterStart==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.semesterStart)&&!!date(...x.semesterStart.split('-').map(Number))&&Array.isArray(x.warnings)&&x.warnings.length<=16&&x.warnings.every(w=>typeof w==='string'&&w.length<=200);
  }
  return Object.freeze({parse,prepare,required,event,newId,validDraft});
});
