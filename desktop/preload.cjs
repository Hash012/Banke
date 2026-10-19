"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const actions = new Set(["add", "backup", "import", "print", "undo", "help"]);
let lastSnapshot;
let lastRevision = -1;
function remember(result) {
  if (!result || !result.ok || !result.state) return result;
  if (Number.isSafeInteger(result.revision)) {
    if (result.revision < lastRevision) return null;
    lastRevision = result.revision;
  }
  const state = result.state;
  lastSnapshot = JSON.parse(JSON.stringify({ semesterStart: state.semesterStart, events: state.events, completed: state.completed }));
  return result;
}
function subscribe(channel, callback, filter) {
  if (typeof callback !== "function") throw new TypeError("状态处理器必须为函数。");
  const listener = (_event, value) => { const accepted = filter(value); if (accepted) callback(accepted); };
  ipcRenderer.on(channel, listener);
  let active = true;
  return () => { if (active) { active = false; ipcRenderer.removeListener(channel, listener); } };
}

function sendSync(channel, value) {
  try {
    const result = value === undefined ? ipcRenderer.sendSync(channel) : ipcRenderer.sendSync(channel, value);
    return result && typeof result.ok === "boolean" ? result : { ok: false, error: "桌面保存服务暂时没有响应，请先导出备份后重新打开半刻。" };
  } catch (_) { return { ok: false, error: "无法连接桌面保存服务，请先保留当前页面并重试。" }; }
}

async function invoke(channel, value) {
  try { return value === undefined ? await ipcRenderer.invoke(channel) : await ipcRenderer.invoke(channel, value); }
  catch (_) { return { ok: false, error: "这项操作暂时未能完成，请重试。" }; }
}

if (process.isMainFrame !== false) {
  contextBridge.exposeInMainWorld("BankeDesktop", Object.freeze({
    version: "1.3.2",
    loadState: () => remember(sendSync("banke:load-state")),
    saveState: (state, baseline = lastSnapshot) => remember(sendSync("banke:save-state", { state, baseline })),
    rendererReady: () => invoke("banke:renderer-ready"),
    openBackup: () => invoke("banke:open-backup"),
    importBackup: token => invoke("banke:import-backup", token).then(result => remember(result)),
    printSchedule: () => invoke("banke:print-schedule"),
    getSyncStatus: () => invoke("banke:sync-status"),
    setSyncEnabled: enabled => typeof enabled === "boolean" ? invoke("banke:sync-enable", enabled) : Promise.resolve({ ok: false, error: "同步参数无效。" }),
    beginPairing: () => invoke("banke:sync-pair"),
    approvePairing: (deviceId, approved) => invoke("banke:sync-approve", { deviceId, approved }),
    revokeDevice: deviceId => invoke("banke:sync-revoke", deviceId),
    onState: callback => subscribe("banke:state-changed", callback, result => result && result.ok && result.state ? remember(result) : null),
    onSyncStatus: callback => subscribe("banke:sync-status-changed", callback, result => result && typeof result === "object" ? result : null),
    saveFile: request => invoke("banke:save-file", request),
    openDataFolder: () => invoke("banke:open-data-folder"),
    getInfo: () => invoke("banke:get-info"),
    getDesktopStatus: () => invoke("banke:desktop-status"),
    setDesktopMode: enabled => invoke("banke:set-desktop-mode", enabled),
    nextDesktopDisplay: () => invoke("banke:desktop-next-display"),
    setStartAtLogin: enabled => invoke("banke:set-start-at-login", enabled),
    windowAction: action => ["minimize", "maximize", "close"].includes(action)
      ? invoke("banke:window-action", action) : Promise.resolve({ ok: false, error: "窗口操作无效。" }),
    onDesktopStatus(callback) {
      if (typeof callback !== "function") throw new TypeError("窗口状态处理器必须为函数。");
      const listener = (_event, status) => {
        if (status && status.ok === true && ["window", "desktop"].includes(status.mode)) callback(status);
      };
      ipcRenderer.on("banke:desktop-status-changed", listener);
      let subscribed = true;
      return () => { if (subscribed) { subscribed = false; ipcRenderer.removeListener("banke:desktop-status-changed", listener); } };
    },
    onMenuAction(callback) {
      if (typeof callback !== "function") throw new TypeError("菜单处理器必须为函数。");
      const listener = (_event, action) => { if (actions.has(action)) callback(action); };
      ipcRenderer.on("banke:menu-action", listener);
      let subscribed = true;
      return () => { if (subscribed) { subscribed = false; ipcRenderer.removeListener("banke:menu-action", listener); } };
    }
  }));
}
