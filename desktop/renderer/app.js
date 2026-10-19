(function () {
  'use strict';
  const C = window.PlannerCore;
  const SEED = window.BANKE_SEED;
  const D = window.BankeDesktop;
  if (!D) {
    const message=document.createElement('div');
    message.textContent='桌面组件未能加载，请关闭软件并重新打开。若仍无法启动，请重新安装半刻。';
    message.style.cssText='position:fixed;inset:0;z-index:9999;background:#f5f7f8;display:grid;place-items:center;padding:40px;color:#31594d';
    document.body.append(message);return;
  }
  const $ = id => document.getElementById(id);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const categoryNames = {course:'课程', study:'学习', life:'生活', rest:'休息'};
  const clone = value => JSON.parse(JSON.stringify(value));
  const history = [];
  let storageUnavailable = false;
  let damagedData = null;
  let storageError = '';
  let toastTimer;
  let currentPage = 'calendar';
  let editingId = null;
  let editingSnapshot = null;
  let syncBaseline;
  let pendingId = null;
  let importCandidate = null;
  let importToken = null;
  let desktopStatus = {mode:'window',connected:false,displayLabel:'',startAtLogin:false,canStartAtLogin:false};
  let desktopBusy = false;
  let nativeDialogBusy = false;
  let desktopError = '';
  let desktopStatusRevision = 0;
  let widgetFitFrame = 0;
  let widgetResizeObserver = null;
  let state = loadState();

  function shanghaiDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type,part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }
  function currentTeachingWeek() { return C.teachingWeek(shanghaiDate(), state.semesterStart); }
  function defaultState() {
    const embedded = window.BANKE_INITIAL_STATE;
    if (embedded && !C.validateState(embedded).length) return clone(embedded);
    const initial = clone(SEED.state);
    const week = C.teachingWeek(shanghaiDate(), initial.semesterStart);
    initial.selectedWeek = Math.max(1,Math.min(24,week));
    return initial;
  }
  function loadState() {
    try {
      const saved = D.loadState();
      if (saved.ok && saved.state) {
        if (!C.validateState(saved.state).length) { syncBaseline = shared(saved.state); return clone(saved.state); }
        damagedData=JSON.stringify(saved.state);storageUnavailable=true;
        storageError='日程文件格式不正确。';
      } else if (!saved.ok) {
        damagedData=typeof saved.raw==='string' ? saved.raw : null;
        storageUnavailable=true;storageError=saved.error || '日程文件暂时无法读取。';
      }
    } catch (_) { storageUnavailable = true;storageError='暂时无法连接本机保存组件。'; }
    return defaultState();
  }
  function showStorageState() {
    const bad = storageUnavailable || !!damagedData;
    $('saveStatus').classList.toggle('error',bad);
    $('saveStatus').replaceChildren();
    const dot = node('span','dot tiny');
    $('saveStatus').append(dot,document.createTextNode(bad ? '暂未保存到文件' : '已保存到本机文件'));
    $('storageWarning').hidden = !bad;
    if (damagedData) {
      $('storageWarning').textContent = '发现无法读取的日程文件，原文件已保留。当前编辑暂存在窗口中：请先导出原数据或当前备份，再导入一份有效备份恢复保存。';
    } else if (bad) {
      $('storageWarning').textContent = storageError + ' 你仍可编辑，请在关闭前用“备份与导出”把当前日程另存为 JSON 文件。';
    }
    $('exportDamaged').hidden = !damagedData;
  }
  function persist() {
    if (!damagedData) {
      try {
        const saved=D.saveState(clone(state), syncBaseline);
        storageUnavailable=!saved.ok;storageError=saved.ok ? '' : saved.error || '日程文件暂时无法保存。';
        if (saved.ok) {
          if (saved.state && !C.validateState(saved.state).length) {
            if (JSON.stringify(saved.state) !== JSON.stringify(state)) history.length = 0;
            state = clone(saved.state);
          }
          syncBaseline = shared(state);
        }
      } catch (_) { storageUnavailable = true;storageError='暂时无法连接本机保存组件。'; }
    }
    showStorageState();
  }
  function shared(value) { return clone({ semesterStart: value.semesterStart, events: value.events, completed: value.completed }); }
  function acceptRemote(result) {
    if (!result || !result.ok || !result.state || C.validateState(result.state).length) return;
    if (damagedData || storageUnavailable) {
      toast('手机有新的更新。请先保存或导出当前未保存的编辑，再恢复同步。'); return;
    }
    if (JSON.stringify(result.state) === JSON.stringify(state)) return;
    state = clone(result.state); syncBaseline = shared(state); history.length = 0;
    render();
    toast(result.conflicts && result.conflicts.length ? '已收到更新；同时修改的安排已保留副本，请核对。' : result.source === 'device' ? '已自动接收手机上的更新' : '已载入另一个窗口保存的日程');
  }
  function checkEditingSnapshot() {
    if (editingId && JSON.stringify(state.events.find(item => item.id === editingId) || null) !== JSON.stringify(editingSnapshot)) {
      $('eventError').textContent = '这条安排刚刚在另一窗口或手机上发生了变化。请关闭编辑面板，重新打开最新安排后再修改。';
      $('eventError').hidden = false; return false;
    }
    return true;
  }
  function commit(change,message) {
    const next = clone(state);
    change(next);
    const errors = C.validateState(next);
    if (errors.length) { toast(errors[0]); return false; }
    history.push(clone(state));
    if (history.length > 30) history.shift();
    state = next;
    persist();
    render();
    if (message) toast(storageUnavailable || damagedData ? '安排已更新，但尚未保存到本机文件。请先导出备份。' : message);
    return true;
  }
  function updateView(change) { change(state); persist(); render(); }
  function undo() {
    if (!history.length) return;
    state = history.pop(); persist(); render(); toast(storageUnavailable || damagedData ? '已撤销，但尚未保存到本机文件。请先导出备份。' : '已撤销上一次编辑');
  }
  function node(tag,className,text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; },4300);
  }
  function newId() {
    return 'e-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10));
  }
  function openDialog(dialog) {
    if (dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
  }
  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
  function rendererMounted() { return typeof document !== 'undefined' && !!document.body; }
  function updateDesktopControls() {
    if (!rendererMounted()) return;
    const desktop = desktopStatus.mode === 'desktop';
    const busy = desktopBusy || nativeDialogBusy;
    $('desktopModeButton').textContent = desktop ? '返回普通窗口' : '固定到桌面';
    $('desktopModeButton').title = desktop ? '离开桌面模式，恢复普通窗口' : '在桌面右半屏保持展开';
    $('desktopModeButton').disabled = busy;
    $('desktopDialogToggle').textContent = desktop ? '返回普通窗口' : '固定到桌面右半屏';
    $('desktopDialogToggle').disabled = busy;
    $('windowControls').hidden = desktop;
    $('desktopQuitButton').hidden = !desktop;
    $('nextDisplayButton').disabled = busy || !desktop;
    $('startAtLogin').disabled = busy || !desktopStatus.canStartAtLogin;
    $('importJson').disabled = nativeDialogBusy;
    $('printButton').disabled = nativeDialogBusy;
    $('startAtLogin').checked = desktopStatus.startAtLogin;
    $('startAtLoginHelp').textContent = desktopStatus.canStartAtLogin ? '只在你勾选后启用；启动时沿用上次的窗口模式。' : '当前环境暂不支持设置登录自动启动。';
    $('desktopStateSummary').textContent = desktop ? (desktopStatus.connected ? '已固定在桌面右半屏' : '正在恢复桌面连接') : '当前使用普通窗口';
    $('desktopDisplayLabel').textContent = desktopStatus.displayLabel ? '当前屏幕：' + desktopStatus.displayLabel : '固定后可选择显示日程的屏幕。';
    const reconnecting = desktop && !desktopStatus.connected;
    const notice = desktopError || (reconnecting ? '桌面连接正在恢复。日程仍可编辑，也可以点击顶部“返回普通窗口”。' : '');
    $('desktopNotice').textContent = notice;
    $('desktopNotice').hidden = !notice;
    $('desktopModeError').textContent = desktopError;
    $('desktopModeError').hidden = !desktopError;
    queueWidgetFit();
  }
  function reportDesktopError(message) {
    desktopError = message || '桌面操作未完成，请重试。';
    updateDesktopControls();
    toast(desktopError);
  }
  function applyDesktopStatus(result) {
    if (!result || result.ok !== true || !['window','desktop'].includes(result.mode)) return false;
    desktopStatus = {
      mode:result.mode,connected:result.connected === true,
      displayLabel:typeof result.displayLabel === 'string' ? result.displayLabel : '',
      startAtLogin:result.startAtLogin === true,canStartAtLogin:result.canStartAtLogin === true
    };
    desktopError = typeof result.error === 'string' ? result.error : '';
    desktopStatusRevision += 1;
    document.body.classList.toggle('desktop-widget',desktopStatus.mode === 'desktop');
    if (desktopStatus.mode !== 'desktop') document.body.style.removeProperty('--widget-row-height');
    updateDesktopControls();
    return true;
  }
  async function desktopOperation(method,...args) {
    if (desktopBusy) return false;
    if (typeof D[method] !== 'function') {
      reportDesktopError('当前桌面组件不支持这项功能，请安装新版半刻后重试。');
      return false;
    }
    desktopBusy = true;
    updateDesktopControls();
    try {
      const result = await D[method](...args);
      if (!rendererMounted()) return false;
      if (!applyDesktopStatus(result)) throw new Error(result && result.error || '未能确认窗口状态，已保留当前界面。');
      return true;
    } catch (error) {
      if (rendererMounted()) reportDesktopError(error && error.message || '桌面操作未完成，请重试。');
      return false;
    } finally {
      desktopBusy = false;
      updateDesktopControls();
    }
  }
  async function changeDesktopMode() {
    const enabled = desktopStatus.mode !== 'desktop';
    if (!await desktopOperation('setDesktopMode',enabled)) return;
    if (enabled && desktopStatus.mode === 'desktop' && desktopStatus.connected) toast('已固定到桌面右半屏');
    else if (!enabled && desktopStatus.mode === 'window') toast('已返回普通窗口');
    else if (enabled && desktopStatus.mode !== 'desktop') reportDesktopError(desktopError || '未能连接桌面，已保留普通窗口。');
  }
  async function openNativeScheduleDialog(action) {
    if (!['import','print'].includes(action) || nativeDialogBusy || document.querySelector('dialog[open]')) return false;
    nativeDialogBusy = true; $('exportMenu').open = false; updateDesktopControls();
    try {
      if (action === 'print') {
        const result = await D.printSchedule();
        if (!result.ok && !result.canceled) toast(result.error || '打印未完成。');
        return result.ok;
      }
      // Native picker deliberately has NO Explorer child owner and never asks
      // to restore/convert the wallpaper window before reading a backup.
      const result = await D.openBackup();
      if (!result.ok) { if (!result.canceled) toast(result.error || '备份未打开。'); return false; }
      if (!result.state || C.validateState(result.state).length) throw new Error('备份格式不正确。');
      importCandidate = clone(result.state); importToken = result.token;
      $('importSummary').textContent = '这份备份包含 '+importCandidate.events.length+' 条安排，第 '+importCandidate.selectedWeek+' 教学周，显示时间 '+C.formatTime(importCandidate.rangeStart)+'–'+C.formatTime(importCandidate.rangeEnd)+'。';
      openDialog($('importDialog')); return true;
    } catch (error) { toast(error.message || '操作未完成。'); return false; }
    finally { nativeDialogBusy = false; updateDesktopControls(); }
  }
  async function nativeWindowAction(action) {
    if (typeof D.windowAction !== 'function') {
      reportDesktopError('当前桌面组件不支持窗口控制，请安装新版半刻后重试。');
      return;
    }
    try {
      const result = await D.windowAction(action);
      if (rendererMounted() && (!result || result.ok !== true)) reportDesktopError(result && result.error || '窗口操作未完成，请重试。');
    } catch (error) {
      if (rendererMounted()) reportDesktopError(error && error.message || '窗口操作未完成，请重试。');
    }
  }
  function fitWidgetRows() {
    widgetFitFrame = 0;
    if (!rendererMounted() || desktopStatus.mode !== 'desktop' || currentPage !== 'calendar') return;
    const viewport = $('calendarScroll');
    const header = $('calendarGrid').querySelector('.day-heading');
    const available = viewport.clientHeight - (header ? header.offsetHeight : 34) - 1;
    if (available <= 0) return;
    const rows = (state.rangeEnd-state.rangeStart)/30;
    const height = Math.max(24,Math.min(44,available/rows));
    const old = Number.parseFloat(document.body.style.getPropertyValue('--widget-row-height'));
    if (!Number.isFinite(old) || Math.abs(old-height) > 0.1) document.body.style.setProperty('--widget-row-height',height.toFixed(2)+'px');
  }
  function queueWidgetFit() {
    if (!rendererMounted() || widgetFitFrame || desktopStatus.mode !== 'desktop') return;
    widgetFitFrame = window.requestAnimationFrame(fitWidgetRows);
  }
  function initializeDesktopControls() {
    $('desktopModeButton').onclick = changeDesktopMode;
    $('desktopDialogToggle').onclick = changeDesktopMode;
    $('desktopOptionsButton').onclick = () => { updateDesktopControls();openDialog($('desktopModeDialog')); };
    $('nextDisplayButton').onclick = async () => {
      if (await desktopOperation('nextDesktopDisplay')) {
        if (desktopStatus.mode === 'desktop' && desktopStatus.connected) toast('日程当前显示在 '+(desktopStatus.displayLabel || '所选屏幕'));
      }
    };
    $('startAtLogin').onchange = async () => {
      const enabled = $('startAtLogin').checked;
      if (await desktopOperation('setStartAtLogin',enabled)) toast(desktopStatus.startAtLogin ? '已启用登录 Windows 自动启动' : '已关闭登录 Windows 自动启动');
    };
    $('minimizeWindow').onclick = () => nativeWindowAction('minimize');
    $('maximizeWindow').onclick = () => nativeWindowAction('maximize');
    $('closeWindow').onclick = () => nativeWindowAction('close');
    $('desktopQuitButton').onclick = () => nativeWindowAction('close');
    $('desktopDialogQuit').onclick = () => nativeWindowAction('close');
    let unsubscribe;
    if (typeof D.onDesktopStatus === 'function') {
      unsubscribe = D.onDesktopStatus(result => {
        if (!rendererMounted()) return;
        if (!applyDesktopStatus(result)) reportDesktopError(result && result.error || '暂时无法读取桌面状态。');
      });
    }
    updateDesktopControls();
    if (typeof D.getDesktopStatus === 'function') {
      const revision = desktopStatusRevision;
      Promise.resolve().then(() => D.getDesktopStatus()).then(result => {
        if (!rendererMounted() || desktopStatusRevision !== revision) return;
        if (!applyDesktopStatus(result)) reportDesktopError(result && result.error || '暂时无法读取桌面状态；日程可以继续编辑。');
      }).catch(error => { if (rendererMounted()) reportDesktopError(error && error.message || '暂时无法读取桌面状态；日程可以继续编辑。'); });
    }
    if (typeof ResizeObserver === 'function') {
      widgetResizeObserver = new ResizeObserver(queueWidgetFit);
      widgetResizeObserver.observe($('calendarScroll'));
    }
    window.addEventListener('beforeunload',() => {
      if (typeof unsubscribe === 'function') unsubscribe();
      if (widgetResizeObserver) widgetResizeObserver.disconnect();
      if (widgetFitFrame) window.cancelAnimationFrame(widgetFitFrame);
    });
  }
  function completionKey(id) { return id + ':' + state.selectedWeek; }
  function isComplete(event) { return state.completed.includes(completionKey(event.id)); }
  function shortTitle(title) {
    return title.replace('（上机，名称待补全）',' · 上机').replace('（名称待补全）','').replace('《红楼梦》与中…','《红楼梦》').replace('（上机）',' · 上机');
  }
  function shortLocation(location) { return location; }
  function palette(event) {
    if (event.category === 'study') return ['#fcf2df','#d4ae64','#8b7137'];
    if (event.category === 'life') return ['#eaf2fb','#8badd3','#567da3'];
    if (event.category === 'rest') return ['#f0ebf7','#b09cc8','#826b9d'];
    if (/数据库/.test(event.title)) return ['#eaf0f9','#92afd0','#597797'];
    if (/处理器/.test(event.title)) return ['#f0eafa','#b69cd2','#82669d'];
    if (/红楼梦/.test(event.title)) return ['#f8e9ec','#d6a1ad','#a57380'];
    if (/并行/.test(event.title)) return ['#fbefde','#d6b382','#927243'];
    if (/人工智能/.test(event.title)) return ['#f9ecdd','#daa17b','#a4734f'];
    return ['#e7f2ec','#86b5a0','#557f6d'];
  }
  function applyPalette(el,event) {
    const [bg,accent,ink] = palette(event);
    el.style.setProperty('--event-bg',bg); el.style.setProperty('--event-accent',accent); el.style.setProperty('--event-ink',ink);
  }
  function unresolvedPending() { return SEED.pending.filter(item => !state.events.some(event => event.id === item.id)); }
  function hours(minutes) { return Number((minutes / 60).toFixed(1)).toString(); }
  function setMetric(id,minutes) {
    $(id).replaceChildren(document.createTextNode(hours(minutes)),node('i','', '小时'));
  }
  function render() {
    const active = C.weekEvents(state.events,state.selectedWeek);
    const metrics = C.summarize(state.events,state.selectedWeek,state.rangeStart,state.rangeEnd);
    document.documentElement.style.setProperty('--print-row-height',Math.min(40,780/((state.rangeEnd-state.rangeStart)/30))+'px');
    setMetric('courseHours',metrics.courseMinutes); setMetric('plannedHours',metrics.plannedMinutes); setMetric('freeHours',metrics.freeMinutes);
    $('freeDescription').textContent = '共 ' + hours((state.rangeEnd-state.rangeStart)*days.length) + ' 小时 · 周一至周日';
    $('rangeLabel').textContent = C.formatTime(state.rangeStart) + '–' + C.formatTime(state.rangeEnd);
    const preset = state.rangeStart + ',' + state.rangeEnd;
    $('rangePreset').value = ['960,1440','240,1440','240,720'].includes(preset) ? preset : 'custom';
    $('weekSelect').value = String(state.selectedWeek);
    const dates = C.weekDates(state.semesterStart,state.selectedWeek);
    $('weekDates').textContent = dates[0].slice(5).replace('-','.') + ' — ' + dates[days.length-1].slice(5).replace('-','.');
    $('prevWeek').disabled = state.selectedWeek <= 1; $('nextWeek').disabled = state.selectedWeek >= 24;
    $('undoButton').disabled = !history.length;
    const pending = unresolvedPending();
    const marked = state.events.filter(event => event.uncertain);
    $('pendingCount').textContent = String(pending.length + marked.length);
    $('auditBanner').hidden = pending.length + marked.length === 0;
    $('auditBannerText').textContent = pending.length ? pending.length + ' 条 AI 编程课待核对时间与周次' + (marked.length ? '，另有 ' + marked.length + ' 条标记待核对' : '') : marked.length + ' 条安排已标记为待核对';
    $('calendarPanel').hidden = currentPage !== 'calendar'; $('coursesPanel').hidden = currentPage !== 'courses'; $('pendingPanel').hidden = currentPage !== 'pending';
    ['Calendar','Courses','Pending'].forEach((suffix,index) => {
      const selected = currentPage === ['calendar','courses','pending'][index];
      $('nav' + suffix).classList.toggle('active',selected);
      if (selected) $('nav' + suffix).setAttribute('aria-current','page'); else $('nav' + suffix).removeAttribute('aria-current');
    });
    const title = currentPage === 'calendar' ? '我的一周' : currentPage === 'courses' ? '课程与安排' : '核对一下';
    $('pageTitle').replaceChildren(document.createTextNode(title),node('span','title-dot','.'));
    $('breadcrumbPage').textContent = currentPage === 'calendar' ? '周计划' : currentPage === 'courses' ? '课程与安排' : '待核对';
    $('pageSubtitle').textContent = currentPage === 'pending' ? '把不确定的时间确认好，再放心排进日程。' : '课程先安放好，其余时间由你来写。';
    renderGrid(active,dates);
    if (currentPage === 'courses') renderList();
    if (currentPage === 'pending') renderPending();
    showStorageState();
    queueWidgetFit();
  }
  function renderGrid(active,dates) {
    const scrollTop = $('calendarScroll').scrollTop;
    const scrollLeft = $('calendarScroll').scrollLeft;
    const grid = $('calendarGrid'); grid.replaceChildren();
    grid.append(node('div','corner','GMT+8'));
    const today = shanghaiDate();
    days.forEach((day,index) => {
      const header = node('div','day-heading' + (index >= 5 ? ' weekend' : '') + (dates[index] === today ? ' today' : ''));
      header.append(node('strong','',day),node('span','day-date',dates[index].slice(5).replace('-','/')));
      grid.append(header);
    });
    const totalHeight = 'calc(' + ((state.rangeEnd - state.rangeStart)/30) + ' * var(--row-height))';
    const times = node('div','times-column');
    times.style.height = totalHeight;
    for (let time = state.rangeStart; time < state.rangeEnd; time += 30) times.append(node('div','time-label' + (time%60 === 0 ? ' hour' : ''),C.formatTime(time)));
    times.append(node('div','time-end',C.formatTime(state.rangeEnd)));
    grid.append(times);
    const conflicts = C.findConflicts(state.events,state.selectedWeek).filter(item => item.start < state.rangeEnd && item.end > state.rangeStart);
    const conflicted = new Set(conflicts.flatMap(item => [item.a,item.b]));
    $('conflictBanner').hidden = !conflicts.length;
    $('conflictBanner').textContent = conflicts.length + ' 组安排时间重叠，已并排显示。点击有边框的卡片可调整。';
    for (let day = 1; day <= days.length; day += 1) {
      const column = node('div','day-column' + (dates[day-1] === today ? ' today' : ''));
      column.style.height = totalHeight;
      column.dataset.day = String(day);
      for (let time = state.rangeStart; time < state.rangeEnd; time += 30) {
        const slot = node('button','slot' + (time % 60 === 30 ? ' on-hour' : ''));
        slot.type = 'button'; slot.dataset.day = String(day); slot.dataset.time = String(time);
        slot.setAttribute('aria-label',days[day-1] + ' ' + C.formatTime(time) + '–' + C.formatTime(time+30) + '，添加安排');
        slot.append(node('span','slot-plus','＋'));
        slot.addEventListener('click',() => openEvent(null,day,time));
        column.append(slot);
      }
      const layouts = C.layoutEvents(active.filter(event => event.day === day),state.rangeStart,state.rangeEnd);
      for (const layout of layouts) {
        const event = layout.event;
        const card = node('button','event-card' + (layout.heightMinutes<22 ? ' tiny' : layout.heightMinutes<45 ? ' short' : '') + (layout.laneCount>1 ? ' multi-lane' : '') + (isComplete(event) ? ' completed' : '') + (conflicted.has(event.id) ? ' conflicted' : ''));
        card.type = 'button'; card.dataset.eventId = event.id;
        card.style.top = 'calc(' + (layout.topMinutes/30) + ' * var(--row-height) + 1px)';
        card.style.height = 'max(1px, calc(' + (layout.heightMinutes/30) + ' * var(--row-height) - 3px))';
        card.style.left = 'calc(' + (layout.lane/layout.laneCount*100) + '% + var(--event-inset,4px))';
        card.style.width = 'calc(' + (100/layout.laneCount) + '% - var(--event-inset,4px) * 2)';
        applyPalette(card,event);
        const time = C.formatTime(event.start) + '–' + C.formatTime(event.end);
        const clipped = event.start < state.rangeStart || event.end > state.rangeEnd;
        card.title = event.title + '\n' + days[day-1] + ' ' + time + '\n' + event.location + '\n第 ' + C.formatWeeks(event.weeks) + ' 周' + (event.uncertain ? '\n信息待核对' : '') + (clipped ? '\n部分时间在当前显示范围外' : '') + '\n点击编辑';
        card.setAttribute('aria-label',card.title.replace(/\n/g,'，'));
        const timeLine = node('span','event-time');
        const timeRange = node('span','event-time-range');
        timeRange.append(node('span','event-start',C.formatTime(event.start)),node('span','event-time-separator','–'),node('span','event-end',C.formatTime(event.end)));
        timeLine.append(timeRange);
        if (isComplete(event) || event.uncertain || conflicted.has(event.id)) timeLine.append(node('span','event-warning',isComplete(event) ? '✓' : '!'));
        card.append(timeLine,node('span','event-name',shortTitle(event.title)),node('span','event-location',shortLocation(event.location) || categoryNames[event.category]));
        card.addEventListener('click',() => openEvent(event.id));
        column.append(card);
      }
      if (dates[day-1] === today) {
        const clock = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
        const now = C.parseTime(clock);
        if (now > state.rangeStart && now < state.rangeEnd) { const line = node('div','now-line'); line.style.top = 'calc(' + ((now-state.rangeStart)/30) + ' * var(--row-height))'; column.append(line); }
      }
      grid.append(column);
    }
    const outside = active.filter(event => event.start < state.rangeStart || event.end > state.rangeEnd).length;
    $('hiddenCount').textContent = outside ? outside + ' 段安排含范围外时间 · 查看全部' : '保留课程实际时间与课间';
    $('hiddenCount').style.cursor = outside ? 'pointer' : 'default';
    $('hiddenCount').tabIndex = outside ? 0 : -1;
    $('hiddenCount').setAttribute('role',outside ? 'button' : 'note');
    $('hiddenCount').onclick = outside ? () => { currentPage = 'courses'; $('listAllWeeks').checked = false; render(); } : null;
    $('calendarScroll').scrollTop = scrollTop; $('calendarScroll').scrollLeft = scrollLeft;
  }
  function renderList() {
    const list = $('courseList'); list.replaceChildren();
    const visible = $('listAllWeeks').checked ? state.events : C.weekEvents(state.events,state.selectedWeek);
    if (!visible.length) { list.append(node('div','empty-state','本周暂时没有安排，点击“添加安排”写下第一件事。')); return; }
    for (let day = 1; day <= days.length; day += 1) {
      const items = visible.filter(event => event.day === day).sort((a,b) => a.start-b.start || a.end-b.end);
      if (!items.length) continue;
      list.append(node('h3','list-day',days[day-1]));
      for (const event of items) {
        const row = node('button','course-row'); applyPalette(row,event); row.type = 'button'; row.dataset.eventId = event.id;
        row.append(node('span','bar'),node('span','row-time',C.formatTime(event.start)+'–'+C.formatTime(event.end)),node('span','row-title',event.title + (event.uncertain ? ' · 待核对' : '')),node('span','row-location',shortLocation(event.location)),node('span','row-weeks','第 '+C.formatWeeks(event.weeks)+' 周'),node('span','chevron','›'));
        row.addEventListener('click',() => openEvent(event.id)); list.append(row);
      }
    }
  }
  function renderPending() {
    const panel = $('pendingPanel'); panel.replaceChildren();
    const heading = node('div','pending-heading');
    heading.append(node('h2','','让每一门课都有准确的位置'),node('p','','手机课表中的两条 AI 编程课，起止时间与重复周次无法从图片可靠辨认。它们暂不占用网格；填写确认过的时间后就会加入课程。'));
    panel.append(heading);
    const list = unresolvedPending();
    for (const item of list) {
      const card = node('div','pending-item'); const body = node('div','pending-body');
      body.append(node('span','pending-tag','时间与周次待确认'),node('h3','',item.title+' · '+days[item.day-1]),node('p','',item.notes),node('div','pending-meta',item.location+' · 仅能确认在第 6 周截图中出现'));
      const button = node('button','button secondary','补充时间 →'); button.addEventListener('click',() => openPending(item));
      card.append(body,button); panel.append(card);
    }
    const marked = state.events.filter(event => event.uncertain);
    for (const item of marked) {
      const card = node('div','pending-item'); const body = node('div','pending-body');
      body.append(node('span','pending-tag','你标记的待核对安排'),node('h3','',item.title),node('p','',days[item.day-1]+' '+C.formatTime(item.start)+'–'+C.formatTime(item.end)+' · 第 '+C.formatWeeks(item.weeks)+' 周'));
      const button = node('button','button secondary','查看 / 修改'); button.addEventListener('click',() => openEvent(item.id)); card.append(body,button); panel.append(card);
    }
    if (!list.length && !marked.length) {
      const empty = node('div','empty-state'); empty.append(node('strong','','全部核对好了 ✓'),document.createTextNode('已经确认的课程会按你填写的时间和周次显示。')); panel.append(empty);
    }
    const back = node('button','button secondary','← 返回周计划'); back.addEventListener('click',() => { currentPage='calendar'; render(); }); panel.append(back);
  }
  function prepareForm(event,isNew,isPending) {
    $('eventForm').reset();
    $('eventTitle').value = event.title;
    $('eventCategory').value = event.category;
    $('eventDay').value = String(event.day);
    $('eventStart').value = event.start === null ? '' : C.formatTime(event.start);
    $('eventEnd').value = event.end === null ? '' : C.formatTime(event.end);
    $('eventLocation').value = event.location || '';
    $('eventWeeks').value = C.formatWeeks(event.weeks);
    $('eventNotes').value = event.notes || '';
    $('eventUncertain').checked = !!event.uncertain;
    $('eventError').hidden = true; $('formConflict').hidden = true;
    $('pendingHint').hidden = !isPending;
    $('editScopeRow').hidden = isNew || !event.weeks.includes(state.selectedWeek) || event.weeks.length < 2;
    $('editScope').value = 'all'; $('eventWeeks').disabled = false;
    $('deleteEvent').hidden = isNew;
    $('completeEvent').hidden = isNew || !event.weeks.includes(state.selectedWeek);
    $('completeEvent').textContent = isComplete(event) ? '取消本周完成标记' : '标记本周完成';
    $('eventDialogTitle').textContent = isPending ? '补充课程时间' : isNew ? '添加安排' : '编辑安排';
    openDialog($('eventDialog'));
    requestAnimationFrame(() => { (isPending ? $('eventStart') : $('eventTitle')).focus(); });
  }
  function openEvent(id,day=1,start=state.rangeStart) {
    editingId = id; pendingId = null;
    const existing = id ? state.events.find(event => event.id === id) : null;
    if (id && !existing) { toast('这条安排已不存在'); return; }
    editingSnapshot = existing ? clone(existing) : null;
    const event = existing || {id:'new',title:'',day,start,end:Math.min(start+30,1440),category:'study',location:'',notes:'',weeks:[state.selectedWeek],uncertain:false};
    prepareForm(event,!existing,false);
  }
  function openPending(item) {
    editingId = null; pendingId = item.id;
    editingSnapshot = null;
    const event = {...item,category:'course',uncertain:false};
    prepareForm(event,true,true);
  }
  function collectEvent() {
    $('eventStart').value=$('eventStart').value.trim().replace(/：/g,':');
    $('eventEnd').value=$('eventEnd').value.trim().replace(/：/g,':');
    const start = C.parseTime($('eventStart').value); const end = C.parseTime($('eventEnd').value);
    if (start === null || end === null) throw new Error('请填写有效时间，例如 16:00、19:40、24:00。');
    const original = editingId && state.events.find(event => event.id === editingId);
    const onlyThis = original && !$('editScopeRow').hidden && $('editScope').value === 'this';
    const weeks = onlyThis ? [state.selectedWeek] : C.parseWeeks($('eventWeeks').value);
    const event = {id:editingId || pendingId || newId(),title:$('eventTitle').value.trim(),day:Number($('eventDay').value),start,end,category:$('eventCategory').value,location:$('eventLocation').value.trim(),notes:$('eventNotes').value.trim(),weeks,uncertain:$('eventUncertain').checked};
    const errors = C.validateEvent(event);
    if (errors.length) throw new Error(errors.join(' '));
    return {event,onlyThis};
  }
  function updateFormConflict() {
    $('formConflict').hidden = true;
    try {
      const {event} = collectEvent();
      const other = state.events.filter(item => item.id !== editingId);
      const hits = other.filter(item => item.day === event.day && item.start < event.end && item.end > event.start && event.weeks.some(week => item.weeks.includes(week)));
      if (hits.length) {
        $('formConflict').textContent = '时间重叠：' + hits.slice(0,3).map(item => shortTitle(item.title) + ' ' + C.formatTime(item.start)+'–'+C.formatTime(item.end) + '（第 '+C.formatWeeks(item.weeks.filter(week=>event.weeks.includes(week)))+' 周）').join('；') + '。仍可保存，网格会并排显示。';
        $('formConflict').hidden = false;
      }
    } catch (_) { /* Incomplete fields are validated on submit. */ }
  }
  function saveEvent(eventObject) {
    eventObject.preventDefault();
    if (!checkEditingSnapshot()) return;
    try {
      const {event,onlyThis} = collectEvent();
      const done = commit(next => {
        const index = next.events.findIndex(item => item.id === editingId);
        if (index >= 0 && onlyThis && next.events[index].weeks.length > 1) {
          const originalId = next.events[index].id;
          next.events[index].weeks = next.events[index].weeks.filter(week=>week!==next.selectedWeek);
          event.id = newId(); event.weeks = [next.selectedWeek]; next.events.push(event);
          const oldKey = originalId+':'+next.selectedWeek;
          if (next.completed.includes(oldKey)) { next.completed = next.completed.filter(key=>key!==oldKey); next.completed.push(event.id+':'+next.selectedWeek); }
        } else if (index >= 0) { next.events[index] = event; }
        else { next.events.push(event); }
      },onlyThis ? '仅修改了当前教学周 · 可撤销' : '安排已保存 · 可撤销');
      if (done) closeDialog($('eventDialog'));
    } catch (error) { $('eventError').textContent=error.message; $('eventError').hidden=false; }
  }
  function deleteEvent() {
    if (!checkEditingSnapshot()) return;
    const target = state.events.find(event => event.id === editingId);
    if (!target) return;
    const onlyThis = !$('editScopeRow').hidden && $('editScope').value === 'this';
    const done = commit(next => {
      const event = next.events.find(item => item.id === editingId);
      if (onlyThis) event.weeks = event.weeks.filter(week => week !== next.selectedWeek);
      if (!onlyThis || !event.weeks.length) next.events = next.events.filter(item=>item.id!==editingId);
      next.completed = next.completed.filter(key => onlyThis ? key !== editingId+':'+next.selectedWeek : key.slice(0,key.lastIndexOf(':')) !== editingId);
    },onlyThis ? '已移除本周的这条安排 · 可撤销' : '已删除这条安排的全部周次 · 可撤销');
    if (done) closeDialog($('eventDialog'));
  }
  function toggleCompleted() {
    if (!editingId) return;
    if (!checkEditingSnapshot()) return;
    const key=completionKey(editingId);
    const checked=state.completed.includes(key);
    if (commit(next => { next.completed = checked ? next.completed.filter(item=>item!==key) : next.completed.concat(key); }, checked ? '已取消本周完成标记' : '本周这件事完成了 ✓')) closeDialog($('eventDialog'));
  }
  function openSettings() {
    $('semesterStart').value = state.semesterStart;
    $('settingRangeStart').value = String(state.rangeStart); $('settingRangeEnd').value = String(state.rangeEnd);
    $('settingsError').hidden = true; openDialog($('settingsDialog'));
  }
  function saveSettings(event) {
    event.preventDefault();
    const candidate=clone(state);
    candidate.semesterStart=$('semesterStart').value; candidate.rangeStart=Number($('settingRangeStart').value); candidate.rangeEnd=Number($('settingRangeEnd').value);
    const errors=C.validateState(candidate);
    if(errors.length){$('settingsError').textContent=errors.join(' ');$('settingsError').hidden=false;return;}
    commit(next => {next.semesterStart=candidate.semesterStart;next.rangeStart=candidate.rangeStart;next.rangeEnd=candidate.rangeEnd;},'日程设置已保存');
    $('calendarScroll').scrollTop=0; closeDialog($('settingsDialog'));
  }
  async function download(content,mime,filename) {
    try {
      const result=await D.saveFile({content,mime,fileName:filename});
      if(result.ok){toast('文件已保存');return true;}
      if(!result.canceled)toast(result.error || '文件保存失败，请更换保存位置后再试。');
      return false;
    }catch(_){toast('文件保存失败，请更换保存位置后再试。');return false;}
  }
  function exportJson(prefix='半刻日程备份') {
    return download(JSON.stringify(state,null,2),'application/json;charset=utf-8',prefix+'-'+shanghaiDate()+'.json');
  }
  async function readImportFile(event) {
    const file=event.target.files && event.target.files[0]; event.target.value='';
    if(!file)return;
    if(file.size>16*1024*1024){toast('备份不能超过 16 MB，请选择半刻导出的 JSON 文件。');return;}
    try{
      const candidate=JSON.parse((await file.text()).replace(/^\uFEFF/,''));const errors=C.validateState(candidate);
      if(errors.length)throw new Error(errors.slice(0,2).join(' '));
      importCandidate=candidate;
      $('importSummary').textContent='这份备份包含 '+candidate.events.length+' 条安排，第 '+candidate.selectedWeek+' 教学周，显示时间 '+C.formatTime(candidate.rangeStart)+'–'+C.formatTime(candidate.rangeEnd)+'。';
      openDialog($('importDialog'));
    }catch(error){toast('未导入：'+error.message);}
  }
  async function confirmImport() {
    if(!importCandidate || !importToken)return;
    $('confirmImport').disabled=true;
    try {
      const saved = await D.importBackup(importToken);
      if(!saved.ok){toast(saved.error || '导入未完成，原日程保持不变。');return;}
      if(!saved.state || C.validateState(saved.state).length)throw new Error('未收到有效的导入结果。');
      state=clone(saved.state);syncBaseline=shared(state);history.length=0;damagedData=null;storageUnavailable=false;storageError='';
      importToken=null;importCandidate=null;closeDialog($('importDialog'));render();
      toast('备份已导入；导入前日程已自动保存在本机 backups 文件夹。');
    }catch(e){toast(e.message || '导入未完成。');}
    finally{$('confirmImport').disabled=false;}
  }
  async function openDataFolder() {
    $('exportMenu').open=false;
    try {const result=await D.openDataFolder();if(result && result.ok===false)toast(result.error || '无法打开数据文件夹。');}
    catch(_){toast('无法打开数据文件夹，请稍后再试。');}
  }
  async function openDesktop(){
    openDialog($('desktopDialog'));
    try{const info=await D.getInfo();$('desktopVersion').textContent='版本 '+(info.version || D.version || '1.3.2')+' · Windows 桌面版';$('dataDirectory').textContent=info.dataPath || '本机应用数据目录';}
    catch(_){$('desktopVersion').textContent='Windows 桌面版';}
  }
  function setWeek(week) {
    if(week<1||week>24)return;
    updateView(next=>{next.selectedWeek=week;});
  }
  function initialize() {
    $('weekSelect').replaceChildren();$('settingRangeStart').replaceChildren();$('settingRangeEnd').replaceChildren();
    for(let week=1;week<=24;week++){const option=node('option','', '第 '+week+' 周');option.value=String(week);$('weekSelect').append(option);}
    for(let minute=0;minute<=1440;minute+=30){
      if(minute<1440){const option=node('option','',C.formatTime(minute));option.value=String(minute);$('settingRangeStart').append(option);}
      if(minute>0){const option=node('option','',C.formatTime(minute));option.value=String(minute);$('settingRangeEnd').append(option);}
    }
    $('navCalendar').onclick=()=>{currentPage='calendar';render();};$('navCourses').onclick=()=>{currentPage='courses';render();};$('navPending').onclick=()=>{currentPage='pending';render();};$('auditBanner').onclick=$('navPending').onclick;
    document.querySelector('.brand').onclick=event=>{event.preventDefault();currentPage='calendar';render();};
    $('addButton').onclick=()=>openEvent(null);
    $('prevWeek').onclick=()=>setWeek(state.selectedWeek-1);$('nextWeek').onclick=()=>setWeek(state.selectedWeek+1);$('weekSelect').onchange=()=>setWeek(Number($('weekSelect').value));
    $('thisWeek').onclick=()=>{const week=currentTeachingWeek();if(week<1||week>24){toast('当前日期不在已设置的 24 个教学周内，可在设置中修改学期起点。');return;}setWeek(week);};
    $('rangePreset').onchange=()=>{if($('rangePreset').value==='custom'){openSettings();return;}const [start,end]=$('rangePreset').value.split(',').map(Number);updateView(next=>{next.rangeStart=start;next.rangeEnd=end;});$('calendarScroll').scrollTop=0;};
    $('settingsButton').onclick=openSettings;$('mobileRange').onclick=openSettings;
    $('undoButton').onclick=undo;$('listAllWeeks').onchange=renderList;
    $('eventForm').onsubmit=saveEvent;$('deleteEvent').onclick=deleteEvent;$('completeEvent').onclick=toggleCompleted;$('settingsForm').onsubmit=saveSettings;
    $('onlyThisWeek').onclick=()=>{$('eventWeeks').value=String(state.selectedWeek);updateFormConflict();};$('allSemester').onclick=()=>{$('eventWeeks').value='1-16';updateFormConflict();};
    $('editScope').onchange=()=>{$('eventWeeks').disabled=$('editScope').value==='this';updateFormConflict();};
    ['eventStart','eventEnd','eventDay','eventWeeks','eventTitle'].forEach(id=>$(id).addEventListener('input',updateFormConflict));
    document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>closeDialog(button.closest('dialog'))));
    document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog(dialog);}}));
    $('exportJson').onclick=()=>{exportJson();$('exportMenu').open=false;};
    $('exportCsv').onclick=()=>{download(C.gridCsv(state),'text/csv;charset=utf-8','半刻-第'+state.selectedWeek+'周-'+C.formatTime(state.rangeStart).replace(':','')+'-'+C.formatTime(state.rangeEnd).replace(':','')+'.csv');$('exportMenu').open=false;};
    $('importJson').onclick=()=>openNativeScheduleDialog('import');$('importFile').onchange=readImportFile;$('confirmImport').onclick=confirmImport;
    $('exportDamaged').onclick=()=>{if(damagedData)download(damagedData,'text/plain;charset=utf-8','半刻原始数据-'+shanghaiDate()+'.txt');};
    $('printButton').onclick=()=>openNativeScheduleDialog('print');
    $('downloadOffline').onclick=openDataFolder;$('helpDownloadOffline').onclick=openDataFolder;
    $('desktopButton').onclick=openDesktop;
    let desktopMenu=$('desktopHelpMenu');if(!desktopMenu){desktopMenu=node('button','','桌面使用 / 课表说明');desktopMenu.id='desktopHelpMenu';document.querySelector('.menu-popover').append(desktopMenu);}desktopMenu.onclick=()=>{$('exportMenu').open=false;openDesktop();};
    document.querySelectorAll('.mobile-page-nav').forEach(el=>el.remove());
    const mobileNav=node('div','mobile-page-nav no-print');
    [['周计划','calendar'],['课程清单','courses'],['待核对','pending']].forEach(([label,page])=>{const button=node('button','small-button',label);button.onclick=()=>{currentPage=page;render();};mobileNav.append(button);});
    document.querySelector('.page-heading').after(mobileNav);
    document.addEventListener('keydown',event=>{
      const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||event.target.isContentEditable;
      const shortcut = event.key.toLowerCase();
      if ((event.ctrlKey||event.metaKey)&&!event.altKey&&(shortcut==='o'||shortcut==='p')) {
        event.preventDefault();
        openNativeScheduleDialog(shortcut==='o' ? 'import' : 'print');
        return;
      }
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!typing&&!document.querySelector('dialog[open]')){event.preventDefault();undo();}
      if(event.target===$('hiddenCount')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.target.click();}
      if(event.target.classList.contains('slot')&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
        let day=Number(event.target.dataset.day),time=Number(event.target.dataset.time);
        if(event.key==='ArrowUp')time-=30;if(event.key==='ArrowDown')time+=30;if(event.key==='ArrowLeft')day-=1;if(event.key==='ArrowRight')day+=1;
        const next=document.querySelector('.slot[data-day="'+day+'"][data-time="'+time+'"]');if(next){event.preventDefault();next.focus();}
      }
    });
    document.addEventListener('click',event=>{if(!$('exportMenu').contains(event.target))$('exportMenu').open=false;});
    if(typeof D.onMenuAction==='function')D.onMenuAction(action=>{
      if(document.querySelector('dialog[open]') && action!=='help')return;
      if(action==='add')openEvent(null);
      else if(action==='backup')exportJson();
      else if(action==='import')return openNativeScheduleDialog('import');
      else if(action==='print')return openNativeScheduleDialog('print');
      else if(action==='undo')undo();
      else if(action==='help')openDesktop();
    });
    let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{renderGrid(C.weekEvents(state.events,state.selectedWeek),C.weekDates(state.semesterStart,state.selectedWeek));queueWidgetFit();},140);});
    persist();render();
    initializeDesktopControls();
    window.BankeView = Object.freeze({preparePrint(){currentPage='calendar';render();return true;}});
    if(typeof D.rendererReady==='function')D.rendererReady();
    if (typeof D.onState === 'function') D.onState(acceptRemote);
    if (typeof D.getInfo === 'function') D.getInfo().then(info => { if (info && info.startupNotice) toast(info.startupNotice); }).catch(() => {});
    if(!storageUnavailable)showStorageState();
  }
  initialize();
})();
