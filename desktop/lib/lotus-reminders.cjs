'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWriteFileSync } = require('./state-store.cjs');
const DEFAULTS = Object.freeze({ enabled: false, startEnabled: true, endEnabled: true, startMinutes: 5, endMinutes: 1, floating: true });
const KEYS = Object.keys(DEFAULTS);
function validSettings(s) {
  return !!s && typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length === KEYS.length &&
    KEYS.every(k => Object.hasOwn(s, k)) && ['enabled','startEnabled','endEnabled','floating'].every(k => typeof s[k] === 'boolean') &&
    ['startMinutes','endMinutes'].every(k => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 1440);
}
function daySignature(now) { const d = new Date(now); return [d.getFullYear(),d.getMonth(),d.getDate(),d.getTimezoneOffset()].join(':'); }
function makePlan(state, settings, now) {
  if (!state || !state.semesterStart || !Array.isArray(state.events)) return [];
  const [y,m,d] = state.semesterStart.split('-').map(Number), today = new Date(now);
  const completed = new Set(state.completed || []), plan = [];
  // Calendar-day arithmetic preserves local wall time across DST and includes
  // next-day starts with a lead of up to 24 hours and yesterday's 24:00 ends.
  const dayNumber = date => Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()) / 86400000;
  const offsetToday = dayNumber(today) - dayNumber(new Date(y,m-1,d));
  for (let offset = offsetToday-1; offset <= offsetToday+1; offset++) {
    const week = Math.floor(offset/7)+1, day = ((offset%7)+7)%7+1;
    if (week < 1 || week > 24) continue;
    for (const event of state.events) {
      if (event.day !== day || !event.weeks.includes(week) || completed.has(event.id+':'+week)) continue;
      for (const kind of ['start','end']) {
        if (!settings[kind+'Enabled']) continue;
        const boundary = new Date(y,m-1,d+offset,0,event[kind]).getTime();
        const due = boundary-settings[kind+'Minutes']*60000;
        const key = crypto.createHash('sha256').update(JSON.stringify([event.id,kind,boundary])).digest('hex');
        plan.push({ key, due, boundary, kind, title: event.title, location: event.location || '', minutes: settings[kind+'Minutes'] });
      }
    }
  }
  return plan.sort((a,b)=>a.due-b.due || a.boundary-b.boundary || a.key.localeCompare(b.key));
}
function createLotusReminders({ directory, onReminders=()=>{}, now=Date.now }) {
  const filename = path.join(directory,'lotus-preferences.json');
  let record = { version: 1, settings: {...DEFAULTS}, delivered: [], position: null };
  let error = '', state = null, plan = [], signature = '', timer = null;
  try {
    if (fs.existsSync(filename)) {
      const stat=fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size>4*1024*1024) throw Error('莲花设置文件无效，原文件已保留。');
      const value=JSON.parse(fs.readFileSync(filename,'utf8'));
      if (value.version!==1 || !validSettings(value.settings) || !Array.isArray(value.delivered) ||
          value.delivered.some(x=>!x || !/^[a-f0-9]{64}$/.test(x.key) || !Number.isFinite(x.until)) ||
          (value.position!==null && (!value.position || !Number.isInteger(value.position.x) || !Number.isInteger(value.position.y)))) throw Error('莲花设置文件无效，原文件已保留。');
      record=value;
    }
  } catch(e) { error=e.message; }
  function persist(next) {
    if(error) throw Error(error);
    atomicWriteFileSync(filename,Buffer.from(JSON.stringify(next),'utf8')); record=next;
  }
  function rebuild() { const time=now(); signature=daySignature(time); plan=makePlan(state,record.settings,time); }
  function status() { return { ok: !error, settings: {...record.settings}, error, position: record.position && {...record.position} }; }
  function tick() {
    if (error || !record.settings.enabled || !state) return [];
    const time=now(); if(signature!==daySignature(time)) rebuild();
    const seen=new Set(record.delivered.map(x=>x.key));
    // Catch up only while an advance reminder is still useful. At-time alerts
    // allow one polling minute; expired reminders after sleep are discarded.
    const due=plan.filter(x=>!seen.has(x.key) && time>=x.due && time<(x.minutes===0?x.boundary+60000:x.boundary));
    if(!due.length)return [];
    const delivered=record.delivered.filter(x=>x.until>time).concat(due.map(x=>({key:x.key,until:x.boundary+86400000})));
    try { persist({...record,delivered}); }
    catch(e) { error='无法保存提醒记录：'+e.message; return []; }
    onReminders(due); return due;
  }
  return {
    status,
    configure(settings) {
      if(!validSettings(settings)) return {ok:false,error:'提前量须为 0–1440 的整数分钟。'};
      try { persist({...record,settings:{...settings}}); rebuild(); return status(); }
      catch(e) { return {ok:false,error:e.message}; }
    },
    setState(value) { state=value; rebuild(); }, tick,
    savePosition(position) {
      if(!position || !Number.isInteger(position.x) || !Number.isInteger(position.y))return;
      try { persist({...record,position:{x:position.x,y:position.y}}); } catch(_) { /* Keep the previous position on disk. */ }
    },
    start() { if(!timer) { timer=setInterval(tick,1000); timer.unref?.(); } },
    dispose() { clearInterval(timer); timer=null; }
  };
}
module.exports={DEFAULTS,validSettings,makePlan,createLotusReminders};
