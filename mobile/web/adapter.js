/* Native-only host: offline data, paired LAN transport, and durable sync retry. */
(function () {
  'use strict';
  const N = window.BankeNative, C = window.PlannerCore, S = window.BankeSyncCore;
  const clone = value => JSON.parse(JSON.stringify(value));
  const bytes = text => new TextEncoder().encode(text);
  const base64 = value => { let text = ''; for (const byte of new Uint8Array(value)) text += String.fromCharCode(byte); return btoa(text); };
  const unbase64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
  const random = length => crypto.getRandomValues(new Uint8Array(length));
  const requestId = () => Array.from(random(20), n => n.toString(16).padStart(2, '0')).join('');
  const stateListeners = new Set(), statusListeners = new Set(), requests = new Map();
  let bundle, loadError = '', status = {}, flight = false, generation = 0, queuedTimer;
  function notify() { for (const listener of statusListeners) { try { listener(clone(status)); } catch (_) {} } }
  function setStatus(phase, message, extra = {}) {
    const profile = bundle && bundle.sync;
    let pending = false;
    try { pending = !!profile && (!!profile.pending || !S.equal(bundle.baseline, S.extractSnapshot(bundle.state))); } catch (_) {}
    status = { paired: !!(profile && profile.paired), phase, message,
      serverAddress: profile ? profile.address : '', lastSync: profile ? profile.lastSync || null : null,
      sas: profile && !profile.paired ? profile.sas || '' : '', pending, ...extra };
    notify(); return clone(status);
  }
  function emitState() {
    for (const listener of stateListeners) { try { listener(clone(bundle.state)); } catch (_) {} }
  }
  function validateBundle(value) {
    if (!value || value.version !== 1 || C.validateState(value.state).length || S.validateSnapshot(value.baseline).length) throw new Error('手机日程文件格式不正确，原文件已保留。');
    if (value.sync !== null) {
      const p = value.sync;
      if (!p || typeof p.paired !== 'boolean' || typeof p.address !== 'string' || typeof p.serverId !== 'string' ||
        typeof p.deviceId !== 'string' || typeof p.key !== 'string' || unbase64(p.key).length !== 32 ||
        !Number.isSafeInteger(p.nextSequence) || p.nextSequence < 1) throw new Error('手机配对记录无法读取，原文件已保留。');
      normalizeAddress(p.address);
      if (p.pending && (!p.pending.requestId || !p.pending.body || p.pending.body.action !== 'sync' ||
        !Number.isSafeInteger(p.pending.body.sequence) || S.validateSnapshot(p.pending.body.baseline).length ||
        S.validateSnapshot(p.pending.body.local).length)) throw new Error('待同步记录无法读取，原文件已保留。');
    }
    return value;
  }
  function write(next) {
    if (loadError) return { ok: false, error: loadError };
    try {
      validateBundle(next);
      const result = JSON.parse(N.saveBundle(JSON.stringify(next)));
      if (!result || !result.ok) return { ok: false, error: result && result.error || '手机暂时无法保存日程。' };
      bundle = clone(next); return { ok: true, state: clone(bundle.state) };
    } catch (_) { return { ok: false, error: '手机暂时无法保存日程，原文件已保留。' }; }
  }
  function normalizeAddress(input) {
    let value = String(input || '').trim();
    if (!/^https?:\/\//i.test(value)) value = 'http://' + value;
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('请填写电脑显示的局域网地址，例如 http://192.168.1.5:47831。');
    const parts = url.hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255) ||
      !(parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)) throw new Error('只接受同一 Wi-Fi 内的私有 IPv4 地址。');
    return 'http://' + parts.join('.') + ':' + (url.port || '47831');
  }
  window.__bankeNativeResult = (id, resultText) => {
    const pending = requests.get(id); if (!pending) return;
    requests.delete(id); clearTimeout(pending.timer);
    try {
      const result = JSON.parse(resultText);
      if (!result.ok) throw new Error(result.error || (result.status === 401 ? '配对已失效，请在电脑与手机上重新配对。' : '电脑暂时无法连接，请检查两端是否连接同一 Wi-Fi。'));
      pending.resolve(JSON.parse(result.body));
    } catch (error) { pending.reject(error); }
  };
  function http(address, path, data) {
    return new Promise((resolve, reject) => {
      const id = requestId();
      const timer = setTimeout(() => { requests.delete(id); reject(new Error('暂时无法连接电脑，本机编辑已保留；恢复连接后会自动重试。')); }, 10000);
      requests.set(id, { resolve, reject, timer });
      try { N.request(id, JSON.stringify({ url: address + path, method: data === undefined ? 'GET' : 'POST', body: data === undefined ? '' : JSON.stringify(data) })); }
      catch (_) { requests.delete(id); clearTimeout(timer); reject(new Error('手机网络组件暂时不可用。')); }
    });
  }
  async function encrypt(profile, id, body) {
    const key = await crypto.subtle.importKey('raw', unbase64(profile.key), 'AES-GCM', false, ['encrypt']);
    const nonce = random(12);
    const aad = bytes(['banke-sync-v1', 'request', profile.serverId, profile.deviceId, id].join('\n'));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, bytes(JSON.stringify(body)));
    return { version: 1, deviceId: profile.deviceId, requestId: id, nonce: base64(nonce), ciphertext: base64(ciphertext) };
  }
  async function message(profile, body, id = requestId()) {
    const envelope = await encrypt(profile, id, body);
    const reply = await http(profile.address, '/banke/v1/message', envelope);
    if (reply.version !== 1 || reply.deviceId !== profile.deviceId || reply.requestId !== id || unbase64(reply.nonce).length !== 12) throw new Error('收到的同步响应无效，本机日程已保留。');
    const key = await crypto.subtle.importKey('raw', unbase64(profile.key), 'AES-GCM', false, ['decrypt']);
    const aad = bytes(['banke-sync-v1', 'response', profile.serverId, profile.deviceId, id].join('\n'));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(reply.nonce), additionalData: aad, tagLength: 128 }, key, unbase64(reply.ciphertext));
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    if (!result.ok) throw new Error(result.error || '同步未完成，本机编辑已保留。');
    return result;
  }
  function queueSync(delay = 350) {
    clearTimeout(queuedTimer); queuedTimer = setTimeout(() => syncNow(), delay);
  }
  async function syncNow() {
    if (loadError) return { ok: false, error: loadError };
    if (!bundle.sync) return { ok: false, error: '请先与电脑配对。' };
    if (flight) return { ok: true, pending: true };
    flight = true; const round = generation;
    try {
      let profile = clone(bundle.sync);
      if (!profile.paired) {
        const approval = await message(profile, { action: 'status' });
        if (round !== generation) return { ok: false, canceled: true };
        if (approval.status === 'pending') {
          setStatus('pairing', '请核对电脑与手机上 8 位数字一致，然后在电脑上允许连接。'); return { ok: true, pending: true };
        }
        if (approval.status !== 'approved') throw new Error('配对申请已过期或被拒绝。请取消本次配对后重新连接。');
        const next = clone(bundle); next.sync.paired = true; next.sync.sas = '';
        next.sync.nextSequence = approval.nextSequence || 1;
        const saved = write(next); if (!saved.ok) throw new Error(saved.error);
        profile = clone(bundle.sync);
      }
      setStatus('syncing', '正在与电脑自动同步…');
      let sent, result;
      if (!profile.pending && !S.equal(bundle.baseline, S.extractSnapshot(bundle.state))) {
        const next = clone(bundle);
        next.sync.pending = { requestId: requestId(), body: { action: 'sync', sequence: profile.nextSequence,
          baseline: clone(bundle.baseline), local: S.extractSnapshot(bundle.state) } };
        const saved = write(next); if (!saved.ok) throw new Error(saved.error);
        profile = clone(bundle.sync);
      }
      if (profile.pending) {
        sent = clone(profile.pending.body.local);
        result = await message(profile, profile.pending.body, profile.pending.requestId);
      } else {
        sent = S.extractSnapshot(bundle.state);
        result = await message(profile, { action: 'pull' });
      }
      if (round !== generation) return { ok: false, canceled: true };
      if (S.validateSnapshot(result.snapshot).length || !Number.isSafeInteger(result.nextSequence) || result.nextSequence < 1) throw new Error('电脑返回的日程无效，未覆盖手机数据。');
      const merged = S.mergeSnapshots(sent, S.extractSnapshot(bundle.state), result.snapshot);
      const next = clone(bundle);
      next.state = S.applySnapshot(bundle.state, merged.snapshot); next.baseline = clone(result.snapshot);
      next.sync.pending = null; next.sync.nextSequence = result.nextSequence;
      const changed = !S.equal(next.state, bundle.state);
      const mustSave = !S.equal(next, bundle);
      next.sync.lastSync = Date.now();
      if (mustSave) { const saved = write(next); if (!saved.ok) throw new Error(saved.error); }
      else bundle.sync.lastSync = next.sync.lastSync;
      if (changed) emitState();
      const conflicts = (result.conflicts || []).concat(merged.conflicts || []);
      setStatus('connected', conflicts.length ? '已同步；同时修改的安排已保留副本，请核对。' : '已自动同步 · 日程已保存在手机和电脑', { conflicts });
      if (!S.equal(bundle.baseline, S.extractSnapshot(bundle.state))) queueSync();
      return { ok: true, state: clone(bundle.state), ...clone(status) };
    } catch (error) {
      if (round === generation) setStatus(bundle.sync && !bundle.sync.paired ? 'pairing' : 'offline', error.message || '暂时无法同步，本机编辑已保留。');
      return { ok: false, error: error.message || '暂时无法同步。' };
    } finally { flight = false; }
  }
  async function pair(connection) {
    if (loadError) return { ok: false, error: loadError };
    if (!crypto.subtle) return { ok: false, error: '手机系统的网页组件暂不支持加密配对，请更新系统网页组件后重试。' };
    if (flight) return { ok: false, error: '正在连接电脑，请稍候。' };
    let address;
    try { address = normalizeAddress(typeof connection === 'string' ? connection : connection.address); }
    catch (error) { return { ok: false, error: error.message }; }
    flight = true; const round = ++generation;
    try {
      const info = await http(address, '/banke/v1/info');
      if (!info.ok || info.protocol !== 1 || typeof info.serverId !== 'string') throw new Error('这不是兼容的半刻同步服务，请先升级电脑端。');
      if (bundle.sync && bundle.sync.paired) {
        if (bundle.sync.serverId !== info.serverId) throw new Error('这是另一台电脑。请先取消现有配对，再连接新电脑；手机日程会保留。');
        const next = clone(bundle); next.sync.address = address;
        const saved = write(next); if (!saved.ok) throw new Error(saved.error);
        setStatus('offline', '电脑地址已更新，正在重新连接。'); queueSync(); return { ok: true };
      }
      const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const publicKey = base64(await crypto.subtle.exportKey('raw', keys.publicKey));
      const clientNonce = base64(random(16));
      const response = await http(address, '/banke/v1/pair/request', { deviceName: String(N.getDeviceName ? N.getDeviceName() : '我的手机').slice(0, 80), publicKey, clientNonce });
      if (!response.ok || response.serverId !== info.serverId || typeof response.deviceId !== 'string' || unbase64(response.publicKey).length !== 65 || unbase64(response.serverNonce).length !== 16) throw new Error('配对响应无效，请重新开始。');
      const transcript = ['banke-pair-v1', response.serverId, response.deviceId, clientNonce, response.serverNonce, publicKey, response.publicKey].join('\n');
      const peer = await crypto.subtle.importKey('raw', unbase64(response.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, keys.privateKey, 256);
      const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
      const salt = await crypto.subtle.digest('SHA-256', bytes(transcript));
      const key = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: bytes('banke-device-key-v1') }, material, 256);
      const hmacKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sasBytes = await crypto.subtle.sign('HMAC', hmacKey, bytes('banke-pair-sas-v1\n' + transcript));
      const sas = String(new DataView(sasBytes).getUint32(0, false) % 100000000).padStart(8, '0');
      if (round !== generation) return { ok: false, canceled: true };
      const next = clone(bundle); next.sync = { address, serverId: response.serverId, deviceId: response.deviceId, key: base64(key),
        paired: false, nextSequence: 1, pending: null, sas, expiresAt: response.expiresAt, lastSync: null };
      const saved = write(next); if (!saved.ok) throw new Error(saved.error);
      setStatus('pairing', '请核对电脑与手机上 8 位数字一致，然后在电脑上允许连接。');
      queueSync(900); return { ok: true, ...clone(status) };
    } catch (error) { setStatus('error', error.message); return { ok: false, error: error.message }; }
    finally { flight = false; }
  }
  function unpair() {
    if (loadError) return { ok: false, error: loadError };
    generation++; clearTimeout(queuedTimer);
    const next = clone(bundle); next.sync = null;
    const saved = write(next); if (!saved.ok) return saved;
    setStatus('unpaired', '已取消手机配对，本机日程和离线编辑仍然保留。'); return saved;
  }
  try {
    if (!N || !C || !S) throw new Error('手机组件未能加载，请重新打开半刻。');
    const raw = N.loadBundle();
    if (raw) {
      const value = JSON.parse(raw);
      if (value && value.ok === false) throw new Error(value.error || '原日程文件无法读取。');
      bundle = validateBundle(value);
    } else {
      const initial = clone(window.BANKE_SEED.state);
      bundle = { version: 1, state: initial, baseline: S.extractSnapshot(initial), sync: null };
      const saved = write(bundle); if (!saved.ok) throw new Error(saved.error);
    }
    setStatus(bundle.sync ? bundle.sync.paired ? 'offline' : 'pairing' : 'unpaired', bundle.sync ? '正在寻找已配对的电脑…' : '与电脑配对后，在同一 Wi-Fi 下自动同步。');
  } catch (error) { loadError = error.message || '原日程数据无法读取，未修改原文件。'; setStatus('error', loadError); }
  window.BankeHost = Object.freeze({
    loadState: () => loadError ? { ok: false, error: loadError } : { ok: true, state: clone(bundle.state) },
    saveState(state) {
      if (loadError) return { ok: false, error: loadError };
      const errors = C.validateState(state); if (errors.length) return { ok: false, error: errors[0] };
      const next = clone(bundle); next.state = clone(state);
      const saved = write(next);
      if (saved.ok) { setStatus(status.phase, status.message); if (bundle.sync) queueSync(); }
      return saved;
    },
    getSyncStatus: async () => clone(status), pair, syncNow, unpair,
    onState(callback) { stateListeners.add(callback); return () => stateListeners.delete(callback); },
    onStatus(callback) { statusListeners.add(callback); return () => statusListeners.delete(callback); }
  });
  setInterval(() => { if (!document.hidden && !loadError && bundle.sync) syncNow(); }, 3000);
  window.addEventListener('banke:active', () => { if (!loadError && bundle.sync) queueSync(80); });
  window.addEventListener('online', () => { if (!loadError && bundle.sync) queueSync(80); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !loadError && bundle.sync) queueSync(80); });
  if (!loadError && bundle.sync) queueSync(700);
})();
