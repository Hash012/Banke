(function () {
  "use strict";
  const C = window.PlannerCore;
  const M = window.BankeMobileModel;
  const H = window.BankeHost;
  const $ = id => document.getElementById(id);
  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const categoryNames = { course: "课程", study: "学习", life: "生活", rest: "休息" };
  const minutesToPixels = 1.8;
  let state = null;
  let selectedDay = 1;
  let currentView = "timeline";
  let syncStatus = { paired: false, phase: "unpaired", pending: 0 };
  let editing = null;
  let activeSheet = null;
  let returnFocus = null;
  let toastTimer;
  let saving = false;
  let mutationQueue = Promise.resolve();
  let statusOperation = false;
  let subscriptionsReady = false;
  const drafts=window.BankeTextDrafts.createBackend({read:()=>window.localStorage.getItem('banke.text-import.drafts.v1'),write:raw=>window.localStorage.setItem('banke.text-import.drafts.v1',raw)});
  const textImport=window.BankeTextImportUI.create({
    getState:()=>{if(!state)throw Error('日程尚未加载，请稍后重试。');return M.clone(state);},today:todayIso,
    readDrafts:()=>drafts.read(),stageDrafts:rows=>drafts.stage(rows,(state?.events||[]).map(e=>e.id)),removeDraft:id=>drafts.remove(id),
    async apply(rows,semesterStart){let plan;try{
      await commit(fresh=>{if(fresh.semesterStart!==semesterStart)throw Error('学期设置已变化，请重新识别。');plan=window.BankeTextImport.prepare(fresh,rows);return plan.state;});
      return {ok:true,...plan};
    }catch(e){return {ok:false,error:e.message};}},
    changed:()=>render(),toast,editEvent:id=>openEvent(id),
    onOpen:()=>{$('app').inert=true;document.body.classList.add('modal-open');},
    onClose:()=>{if(!activeSheet){$('app').inert=false;document.body.classList.remove('modal-open');}}
  });

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function clear(element) { element.textContent = ""; }
  function todayIso() {
    try {
      const values = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const get = part => values.find(value => value.type === part).value;
      return get("year") + "-" + get("month") + "-" + get("day");
    } catch (_) {
      return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    }
  }
  function chinaMinute() {
    const now = new Date(Date.now() + 8 * 3600000);
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  function unwrapState(result) {
    if (!result) throw new Error("没有收到本机日程数据，请重新打开软件。");
    if (result.ok === false) throw new Error(result.error || result.message || "本机保存失败，请稍后重试。");
    return M.checked(M.clone(result.state || result));
  }
  function toast(message) {
    $("toast").textContent = String(message);
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3800);
  }
  function setBusy(value) {
    saving = value;
    $("app").setAttribute("aria-busy", String(value));
    $("saveEvent").disabled = value;
    $("completeEvent").disabled = value;
    $("confirmDelete").disabled = value;
    $("saveEvent").textContent = value ? "正在保存…" : "保存安排";
  }
  function commit(operation, message) {
    const perform = async () => {
      setBusy(true);
      try {
        // Read immediately before editing so changes received while a sheet was open survive.
        state = unwrapState(await H.loadState());
        const next = M.checked(operation(M.clone(state)));
        const saved = await H.saveState(next);
        if (!saved || saved.ok === false) throw new Error(saved && (saved.error || saved.message) || "保存没有完成，请重试。");
        state = saved.state ? unwrapState(saved) : unwrapState(await H.loadState());
        render();
        if (message) toast(message);
        return true;
      } finally { setBusy(false); }
    };
    const result = mutationQueue.then(perform);
    mutationQueue = result.catch(() => {});
    return result;
  }
  function isComplete(event, week) { return state.completed.includes(event.id + ":" + (week || state.selectedWeek)); }
  function activeEvents() { return C.weekEvents(state.events, state.selectedWeek); }
  function dailyEvents() { return activeEvents().filter(event => event.day === selectedDay).sort((a, b) => a.start - b.start || a.end - b.end || a.title.localeCompare(b.title)); }
  function render() {
    if (!state) return;
    const pending=drafts.read();$('textPendingCount').textContent=pending.ok?String(pending.items.filter(d=>!state.events.some(e=>e.id===d.id)).length+state.events.filter(e=>e.uncertain).length):'!';
    document.body.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]').content = state.theme === "dark" ? "#1e2722" : "#f6f5f0";
    $("weekSelect").value = String(state.selectedWeek);
    $("prevWeek").disabled = state.selectedWeek <= 1;
    $("nextWeek").disabled = state.selectedWeek >= 24;
    const dates = C.weekDates(state.semesterStart, state.selectedWeek), today = todayIso(), events = activeEvents();
    clear($("dayStrip"));
    dayNames.forEach((name, index) => {
      const hasEvents = events.some(event => event.day === index + 1);
      const button = node("button", "day-button" + (index + 1 === selectedDay ? " selected" : "") + (dates[index] === today ? " today" : "") + (hasEvents ? " has-events" : ""));
      button.type = "button";
      button.dataset.day = String(index + 1);
      button.setAttribute("aria-pressed", String(index + 1 === selectedDay));
      button.setAttribute("aria-label", name + " " + dates[index] + (hasEvents ? "，有安排" : "，暂无安排"));
      button.append(node("span", "day-name", name.slice(1)), node("span", "day-number", String(Number(dates[index].slice(8)))), node("span", "day-dot"));
      button.onclick = () => { selectedDay = index + 1; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
      $("dayStrip").append(button);
    });
    const date = dates[selectedDay - 1];
    $("dateCaption").textContent = Number(date.slice(5, 7)) + " 月 " + Number(date.slice(8)) + " 日 · 第 " + state.selectedWeek + " 教学周";
    $("dayTitle").textContent = (date === today ? "今天" : dayNames[selectedDay - 1]) + "，慢慢来";
    const daily = dailyEvents();
    const completed = daily.filter(event => isComplete(event)).length;
    $("daySummary").textContent = daily.length ? daily.length + " 项安排 · " + completed + " 项完成" : "今天也为自己留一点空白";
    const outside = daily.filter(event => event.start < state.rangeStart || event.end > state.rangeEnd);
    $("outsideRange").hidden = !outside.length || currentView === "list";
    $("outsideRange").textContent = outside.length + " 项安排超出当前时间范围，点此查看全天列表 ›";
    const conflicts = C.findConflicts(daily, state.selectedWeek);
    $("conflictNotice").hidden = !conflicts.length;
    $("conflictNotice").textContent = "有 " + conflicts.length + " 处时间重叠，原安排均已保留。";
    $("rangeCaption").textContent = C.formatTime(state.rangeStart) + "—" + C.formatTime(state.rangeEnd);
    $("timelinePanel").hidden = currentView !== "timeline";
    $("listPanel").hidden = currentView !== "list";
    for (const [id, view] of [["timelineTab", "timeline"], ["listTab", "list"]]) {
      $(id).classList.toggle("active", currentView === view);
      $(id).setAttribute("aria-pressed", String(currentView === view));
    }
    renderTimeline(daily, date === today);
    renderList(daily);
    renderStatus();
  }
  function renderTimeline(events, isToday) {
    const timeline = $("timeline"), span = state.rangeEnd - state.rangeStart;
    clear(timeline);
    timeline.style.height = (span * minutesToPixels + 10) + "px";
    for (let minute = state.rangeStart; minute <= state.rangeEnd; minute += 30) {
      const top = (minute - state.rangeStart) * minutesToPixels;
      const label = node("span", "time-label", C.formatTime(minute));
      label.style.top = top + "px";
      timeline.append(label);
      if (minute < state.rangeEnd) {
        const slot = node("div", "time-slot" + (minute % 60 ? " half" : ""));
        slot.style.top = top + "px";
        const add = node("button", "slot-add", "+");
        add.type = "button";
        add.setAttribute("aria-label", "在" + dayNames[selectedDay - 1] + " " + C.formatTime(minute) + "添加安排");
        add.onclick = () => openEvent(null, minute);
        slot.append(add); timeline.append(slot);
      }
    }
    const layout = C.layoutEvents(events, state.rangeStart, state.rangeEnd);
    layout.forEach(item => {
      const event = item.event, height = item.heightMinutes * minutesToPixels;
      const card = node("button", "event-card " + event.category + (isComplete(event) ? " completed" : "") + (height < 83 ? " short" : "") + (height < 47 ? " tiny" : ""));
      card.type = "button";
      card.dataset.eventId = event.id;
      card.style.top = (item.topMinutes * minutesToPixels + 2) + "px";
      card.style.height = Math.max(27, height - 4) + "px";
      const percent = item.lane / item.laneCount * 100;
      card.style.left = "calc(47px + (100% - 47px) * " + (item.lane / item.laneCount) + " + 4px)";
      // Percentage + fixed gutter form is supported by old Android WebViews.
      card.style.left = "calc(" + percent + "% + " + (47 * (1 - item.lane / item.laneCount) + 4) + "px)";
      card.style.width = "calc(" + (100 / item.laneCount) + "% - " + (47 / item.laneCount + 8) + "px)";
      const time = C.formatTime(event.start) + "–" + C.formatTime(event.end);
      card.setAttribute("aria-label", event.title + "，" + time + (event.location ? "，" + event.location : "") + (isComplete(event) ? "，本周已完成" : "") + "，点按编辑");
      card.append(node("span", "event-time", time), node("span", "event-name", (isComplete(event) ? "✓ " : "") + event.title), node("span", "event-place", (event.uncertain ? "待核对 · " : "") + (event.location || categoryNames[event.category])));
      card.onclick = () => openEvent(event.id);
      timeline.append(card);
    });
    if (!layout.length) {
      const empty = node("div", "empty-day");
      empty.append(node("div", "empty-symbol", "◷"), node("strong", "", "这一段时间，留给你"), node("p", "", "点按任意半小时空白\n或下方“新增安排”开始计划。"));
      timeline.append(empty);
    }
    if (isToday) {
      const minute = chinaMinute();
      if (minute >= state.rangeStart && minute <= state.rangeEnd) {
        const line = node("div", "now-line");
        line.style.top = ((minute - state.rangeStart) * minutesToPixels) + "px";
        line.append(node("span", "now-label", "现在 " + C.formatTime(minute)));
        timeline.append(line);
      }
    }
  }
  function renderList(events) {
    const list = $("listPanel"); clear(list);
    if (!events.length) {
      const empty = node("div", "list-empty");
      empty.append(node("p", "", "这一天还没有安排。"), node("p", "", "从一件想完成的小事开始。"));
      list.append(empty); return;
    }
    events.forEach(event => {
      const card = node("button", "agenda-card " + event.category + (isComplete(event) ? " completed" : ""));
      card.type = "button"; card.dataset.eventId = event.id;
      const time = node("div", "agenda-time", C.formatTime(event.start)); time.append(node("div", "agenda-end", C.formatTime(event.end)));
      const content = node("div", "agenda-content");
      content.append(node("div", "agenda-title", (isComplete(event) ? "✓ " : "") + event.title));
      if (event.location) content.append(node("div", "agenda-location", event.location));
      const tags = node("div", "agenda-tags");
      tags.append(node("span", "tag", categoryNames[event.category]), node("span", "tag", "第 " + C.formatWeeks(event.weeks) + " 周"));
      if (event.uncertain) tags.append(node("span", "tag", "待核对"));
      content.append(tags); card.append(time, content, node("span", "agenda-chevron", "›"));
      card.onclick = () => openEvent(event.id); list.append(card);
    });
  }
  function switchView(view) { currentView = view; render(); }
  async function setWeek(week) {
    if (!Number.isInteger(week) || week < 1 || week > 24) return;
    try { await commit(next => M.settings(next, { selectedWeek: week })); } catch (error) { toast(error.message); render(); }
  }
  async function goToday() {
    const today = todayIso(), week = C.teachingWeek(today, state.semesterStart);
    if (week < 1 || week > 24) { toast("今天不在设置的 24 个教学周内，可在日程设置中修改学期起点。"); return; }
    selectedDay = C.weekDates(state.semesterStart, week).indexOf(today) + 1;
    await setWeek(week); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openSheet(id) {
    if (activeSheet) $(activeSheet).hidden = true;
    else returnFocus = document.activeElement;
    activeSheet = id; $(id).hidden = false;
    document.body.classList.add("modal-open");
    $("app").inert = true;
    const sheet = $(id).querySelector(".sheet"); sheet.scrollTop = 0;
    // Focus the close control without opening the keyboard automatically.
    $(id).querySelector(".close-button").focus({ preventScroll: true });
  }
  function closeSheet(id) {
    if (saving) { toast("正在保存，请稍等片刻。"); return false; }
    if (id !== activeSheet) return false;
    $(id).hidden = true; activeSheet = null;
    document.body.classList.remove("modal-open"); $("app").inert = false;
    if (id === "eventSheet") editing = null;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    returnFocus = null; return true;
  }
  function openEvent(id, start) {
    if (saving) return;
    const original = id ? state.events.find(event => event.id === id) : null;
    if (id && !original) { toast("这条安排已不存在。"); return; }
    const from = start === undefined ? Math.min(state.rangeStart, 1410) : start;
    const event = original || { id: "new", title: "", day: selectedDay, start: from, end: Math.min(from + 30, 1440), category: "study", location: "", notes: "", weeks: [state.selectedWeek], uncertain: false };
    editing = { id: id || null, original: original && M.clone(original), week: state.selectedWeek };
    $("eventHeading").textContent = original ? "编辑安排" : "新增安排";
    $("eventSubheading").textContent = "第 " + editing.week + " 周 · " + dayNames[event.day - 1];
    for (const [id, value] of [["eventTitle", event.title], ["eventDay", event.day], ["eventCategory", event.category], ["eventStart", C.formatTime(event.start)], ["eventEnd", C.formatTime(event.end)], ["eventLocation", event.location], ["eventNotes", event.notes], ["eventWeeks", C.formatWeeks(event.weeks)]]) $(id).value = value;
    $("eventUncertain").checked = event.uncertain;
    $("eventScope").value = "this";
    $("scopeLabel").hidden = !original || original.weeks.length < 2 || !original.weeks.includes(editing.week);
    $("completeEvent").hidden = !original || !original.weeks.includes(editing.week);
    $("completeEvent").textContent = original && isComplete(original, editing.week) ? "取消本周完成标记" : "标记本周完成";
    $("deleteEvent").hidden = !original;
    for (const id of ["eventError", "eventRemoteNotice", "eventConflicts", "deleteConfirm"]) $(id).hidden = true;
    updateScope(); updateConflicts(); openSheet("eventSheet");
  }
  function editScope() { return !$("scopeLabel").hidden && $("eventScope").value === "this" ? "this" : "all"; }
  function updateScope() {
    const onlyThis = editScope() === "this";
    $("eventWeeks").disabled = onlyThis;
    $("eventWeeks").value = onlyThis ? String(editing.week) : editing.original ? C.formatWeeks(editing.original.weeks) : String(editing.week);
    $("deleteConfirm").hidden = true;
    updateConflicts();
  }
  function collectEvent() {
    const start = C.parseTime($("eventStart").value), end = C.parseTime($("eventEnd").value);
    if (start === null || end === null) throw new Error("请输入有效时间，例如 16:00、18:40 或 24:00。");
    const event = {
      id: editing.id || "new", title: $("eventTitle").value.trim(), day: Number($("eventDay").value), start, end,
      category: $("eventCategory").value, location: $("eventLocation").value.trim(), notes: $("eventNotes").value.trim(),
      weeks: editScope() === "this" ? [editing.week] : C.parseWeeks($("eventWeeks").value), uncertain: $("eventUncertain").checked
    };
    const errors = C.validateEvent(event); if (errors.length) throw new Error(errors.slice(0, 3).join(" "));
    return event;
  }
  function updateConflicts() {
    $("eventConflicts").hidden = true;
    if (!editing || !state) return;
    try {
      const hits = M.conflicts(state, collectEvent(), editing.id);
      if (hits.length) { $("eventConflicts").textContent = "时间重叠：" + hits.slice(0, 3).map(event => event.title + " " + C.formatTime(event.start) + "–" + C.formatTime(event.end)).join("；") + "。可以继续保存，时间轴会同时显示。"; $("eventConflicts").hidden = false; }
    } catch (_) { /* Fields are validated together when the user saves. */ }
  }
  function showError(id, error) { $(id).textContent = error.message || String(error); $(id).hidden = false; }
  async function saveEvent(eventObject) {
    eventObject.preventDefault(); if (saving || !editing) return;
    try {
      const draft = collectEvent();
      const options = { editingId: editing.id, expectedEvent: editing.original, scope: editScope(), week: editing.week };
      await commit(next => M.upsert(next, draft, options), options.scope === "this" ? "本周安排已保存在手机" : "安排已保存在手机");
      selectedDay = draft.day; render(); closeSheet("eventSheet");
    } catch (error) { showError("eventError", error); $("eventError").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }
  async function deleteEvent() {
    if (saving || !editing || !editing.id) return;
    const id = editing.id, options = { expectedEvent: editing.original, scope: editScope(), week: editing.week };
    try { await commit(next => M.remove(next, id, options), options.scope === "this" ? "已删除本周的这条安排" : "已删除这条安排"); closeSheet("eventSheet"); }
    catch (error) { showError("eventError", error); }
  }
  async function completeEvent() {
    if (saving || !editing || !editing.id) return;
    const id = editing.id, week = editing.week;
    try { await commit(next => M.toggleCompleted(next, id, week), "本周完成状态已保存"); closeSheet("eventSheet"); }
    catch (error) { showError("eventError", error); }
  }
  function openSettings() {
    $("semesterStart").value = state.semesterStart;
    $("settingRangeStart").value = String(state.rangeStart);
    $("settingRangeEnd").value = String(state.rangeEnd);
    $("settingTheme").value = state.theme;
    $("settingsError").hidden = true; openSheet("settingsSheet");
  }
  async function saveSettings(eventObject) {
    eventObject.preventDefault(); if (saving) return;
    const patch = { semesterStart: $("semesterStart").value, rangeStart: Number($("settingRangeStart").value), rangeEnd: Number($("settingRangeEnd").value), theme: $("settingTheme").value };
    try { await commit(next => M.settings(next, patch), "日程设置已保存"); closeSheet("settingsSheet"); }
    catch (error) { showError("settingsError", error); }
  }
  function formatSyncTime(value) {
    if (!value) return "尚未同步";
    const date = new Date(value); if (Number.isNaN(date.getTime())) return "尚未同步";
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function acceptStatus(value) {
    if (!value || typeof value !== "object") return;
    const status = value.status && typeof value.status === "object" ? value.status : value;
    syncStatus = Object.assign({}, syncStatus, status);
    renderStatus();
  }
  function renderStatus() {
    const phase = syncStatus.phase || "unpaired", paired = syncStatus.paired === true;
    const pairing = !paired && phase === "pairing";
    const pending = Math.max(0, Number(syncStatus.pending) || 0);
    let title = "手机独立使用中", short = "本机保存", detail = "配对后，手机和电脑上的修改会自动同步。";
    if (pairing) { title = "等待电脑确认"; short = "等待配对"; detail = "核对下方数字，并在电脑端允许连接。"; }
    else if (paired && phase === "connected") { title = "已连接电脑"; short = pending ? "等待同步" : syncStatus.lastSync ? "已同步" : "已连接"; detail = pending ? "本机更改已保存，正在等待同步。" : syncStatus.lastSync ? "两端日程保持同步。更改会先保存在本机。" : "正在准备首次同步。更改会先保存在本机。"; }
    else if (paired && phase === "syncing") { title = "正在同步"; short = "同步中"; detail = "正在与电脑交换更改…"; }
    else if (paired && phase === "offline") { title = "电脑暂未连接"; short = "离线保存"; detail = "更改已保存在手机，电脑恢复连接后自动补同步。"; }
    else if (phase === "error") { title = paired ? "同步需要检查" : "连接未完成"; short = "本机保存"; detail = "手机日程仍然保留。检查电脑地址及 Wi-Fi 后重试。"; }
    else if (paired) { title = "已配对，等待连接"; short = "等待连接"; detail = "保持电脑端半刻运行，并连接同一个 Wi-Fi。"; }
    $("headerSyncText").textContent = short;
    $("headerStatusDot").className = "status-dot " + (paired || pairing ? phase : "");
    $("syncStatusTitle").textContent = title;
    $("syncStatusDetail").textContent = syncStatus.message || detail;
    $("pairedDetails").hidden = !paired;
    $("pairForm").hidden = paired || pairing;
    $("pairingVerification").hidden = !pairing;
    const sas = typeof syncStatus.sas === "string" ? syncStatus.sas.replace(/\s+/g, "") : String(syncStatus.sas || "");
    $("pairSas").textContent = /^\d{8}$/.test(sas) ? sas.slice(0, 4) + " " + sas.slice(4) : "等待校验码…";
    $("pairedComputer").textContent = syncStatus.deviceName || syncStatus.serverAddress || "已配对电脑";
    $("lastSynced").textContent = formatSyncTime(syncStatus.lastSync);
    $("pendingChanges").textContent = pending ? typeof syncStatus.pending === "number" ? pending + " 项" : "有本机更改" : "无";
    $("syncNow").disabled = statusOperation || phase === "syncing";
    $("pairButton").disabled = statusOperation || pairing;
    $("updateAddressButton").disabled = statusOperation;
    $("pairButton").textContent = statusOperation ? "正在连接…" : "连接电脑";
    $("scheduleFooter").textContent = paired ? pending ? "更改已保存在手机，连接电脑后自动同步。" : "先保存在本机，再与已配对电脑自动同步。" : "日程已保存在手机，配对电脑后即可自动同步。";
  }
  async function openSync() {
    $("syncError").hidden = true; $("unpairConfirm").hidden = true; openSheet("syncSheet");
    try { acceptStatus(await H.getSyncStatus()); $("updatedAddress").value = syncStatus.serverAddress || ""; }
    catch (error) { showError("syncError", error); }
  }
  async function pairComputer(eventObject) {
    eventObject.preventDefault(); if (statusOperation) return;
    const address = $("pairAddress").value.trim();
    if (!address) { showError("syncError", new Error("请填写电脑端显示的地址。")); return; }
    try {
      $("syncError").hidden = true; statusOperation = true; renderStatus();
      const result = await H.pair(address);
      if (!result || result.ok === false) throw new Error(result && (result.error || result.message) || "连接没有完成，请重试。");
      acceptStatus(result);
      acceptStatus(await H.getSyncStatus());
    } catch (error) { showError("syncError", error); }
    finally { statusOperation = false; renderStatus(); }
  }
  async function syncNow() {
    if (statusOperation) return;
    try {
      $("syncError").hidden = true; statusOperation = true; renderStatus();
      const result = await H.syncNow();
      if (result && result.ok === false) throw new Error(result.error || result.message || "电脑暂时无法连接，手机上的日程已保留。");
      if (result && result.state) { state = unwrapState(result); render(); }
      acceptStatus(await H.getSyncStatus());
    } catch (error) { showError("syncError", error); }
    finally { statusOperation = false; renderStatus(); }
  }
  async function updateAddress(eventObject) {
    eventObject.preventDefault(); if (statusOperation) return;
    const address = $("updatedAddress").value.trim();
    if (!address) { showError("syncError", new Error("请填写这台电脑目前显示的地址。")); return; }
    try {
      $("syncError").hidden = true; statusOperation = true; renderStatus();
      const result = await H.pair(address);
      if (!result || result.ok === false) throw new Error(result && (result.error || result.message) || "地址没有更新，请重试。");
      acceptStatus(await H.getSyncStatus());
      $("addressDetails").open = false; toast("电脑地址已更新，正在重新连接");
    } catch (error) { showError("syncError", error); }
    finally { statusOperation = false; renderStatus(); }
  }
  async function unpairComputer() {
    if (statusOperation) return;
    try {
      statusOperation = true;
      const result = await H.unpair();
      if (result && result.ok === false) throw new Error(result.error || result.message || "暂时无法断开配对，请重试。");
      syncStatus = { paired: false, phase: "unpaired", pending: 0 };
      acceptStatus(await H.getSyncStatus()); $("unpairConfirm").hidden = true;
      toast("已断开电脑，手机日程保留");
    } catch (error) { showError("syncError", error); }
    finally { statusOperation = false; renderStatus(); }
  }
  function onIncomingState(value) {
    try {
      const next = unwrapState(value);
      if (editing && editing.original) {
        const latest = next.events.find(event => event.id === editing.id);
        $("eventRemoteNotice").hidden = M.equalEvent(latest, editing.original);
      }
      state = next; render();
    } catch (error) { toast("同步日程没有通过校验，本机内容保留：" + error.message); }
  }
  function bindUI() {
    $('textImportButton').onclick=()=>textImport.open().catch(e=>toast(e.message));
    $('textPendingButton').onclick=()=>textImport.openPending().catch(e=>toast(e.message));
    for (let week = 1; week <= 24; week += 1) { const option = node("option", "", "第 " + week + " 周"); option.value = String(week); $("weekSelect").append(option); }
    dayNames.forEach((name, index) => { const option = node("option", "", name); option.value = String(index + 1); $("eventDay").append(option); });
    for (let minute = 0; minute <= 1440; minute += 30) {
      for (const id of ["settingRangeStart", "settingRangeEnd"]) {
        if (id === "settingRangeStart" && minute === 1440 || id === "settingRangeEnd" && minute === 0) continue;
        const option = node("option", "", C.formatTime(minute)); option.value = String(minute); $(id).append(option);
      }
    }
    $("prevWeek").onclick = () => setWeek(state.selectedWeek - 1);
    $("nextWeek").onclick = () => setWeek(state.selectedWeek + 1);
    $("weekSelect").onchange = () => setWeek(Number($("weekSelect").value));
    $("goToday").onclick = goToday;
    $("timelineTab").onclick = () => switchView("timeline");
    $("listTab").onclick = () => switchView("list");
    $("outsideRange").onclick = () => switchView("list");
    $("addEvent").onclick = () => openEvent(null);
    $("eventForm").onsubmit = saveEvent;
    $("eventForm").addEventListener("input", updateConflicts);
    $("eventScope").onchange = updateScope;
    $("completeEvent").onclick = completeEvent;
    $("deleteEvent").onclick = () => { $("deleteQuestion").textContent = editScope() === "this" ? "仅删除第 " + editing.week + " 周的这条安排？其他周次会保留。" : "删除这条安排的全部适用周次？"; $("deleteConfirm").hidden = false; $("deleteConfirm").scrollIntoView({ block: "nearest", behavior: "smooth" }); };
    $("cancelDelete").onclick = () => { $("deleteConfirm").hidden = true; };
    $("confirmDelete").onclick = deleteEvent;
    $("openSettings").onclick = openSettings;
    $("settingsForm").onsubmit = saveSettings;
    $("scheduleNav").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    $("openSync").onclick = openSync; $("syncNav").onclick = openSync;
    $("pairForm").onsubmit = pairComputer;
    $("updateAddressForm").onsubmit = updateAddress;
    $("syncNow").onclick = syncNow;
    $("unpair").onclick = () => { $("unpairConfirm").hidden = false; };
    $("cancelPairing").onclick = unpairComputer;
    $("cancelUnpair").onclick = () => { $("unpairConfirm").hidden = true; };
    $("confirmUnpair").onclick = unpairComputer;
    document.querySelectorAll("[data-close]").forEach(element => { element.onclick = () => closeSheet(element.dataset.close); });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && activeSheet) { event.preventDefault(); closeSheet(activeSheet); }
      if (event.key === "Tab" && activeSheet) {
        const focusable = Array.from($(activeSheet).querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex='0']")).filter(element => element.offsetParent !== null);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    $("retryLoad").onclick = boot;
  }
  async function boot() {
    $("fatalError").hidden = true;
    try {
      if (!H || typeof H.loadState !== "function") throw new Error("手机本地服务没有启动，请退出并重新打开半刻。");
      state = unwrapState(await H.loadState());
      const todayIndex = C.weekDates(state.semesterStart, state.selectedWeek).indexOf(todayIso());
      selectedDay = todayIndex >= 0 ? todayIndex + 1 : 1;
      if (!subscriptionsReady) {
        if (typeof H.onState === "function") H.onState(onIncomingState);
        if (typeof H.onStatus === "function") H.onStatus(acceptStatus);
        subscriptionsReady = true;
      }
      render(); setBusy(false);
      try { acceptStatus(await H.getSyncStatus()); } catch (_) { /* A sync failure does not prevent offline editing. */ }
    } catch (error) { $("fatalDetail").textContent = error.message || String(error); $("fatalError").hidden = false; }
  }
  window.BankeMobileUI = Object.freeze({ back: function () { if(textImport.isOpen()){textImport.close();return true;} if (activeSheet) { closeSheet(activeSheet); return true; } return false; } });
  bindUI(); boot();
  setInterval(() => { if (state && !document.hidden && !activeSheet) renderTimeline(dailyEvents(), C.weekDates(state.semesterStart, state.selectedWeek)[selectedDay - 1] === todayIso()); }, 60000);
})();
