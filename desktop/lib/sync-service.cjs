"use strict";

/* BANKE LAN PROTOCOL 1 (UTF-8; standard padded Base64 everywhere)
 * GET /banke/v1/info -> {ok,protocol:1,serverId,name}; no personal data.
 * Pairing is open only after beginPairing(), for two minutes.
 * POST /banke/v1/pair/request {deviceName,publicKey,clientNonce}
 * publicKey = P-256 raw, 65-byte uncompressed point; clientNonce = 16 random bytes.
 * Response {ok,deviceId,serverId,publicKey,serverNonce,expiresAt}.
 * transcript = ["banke-pair-v1",serverId,deviceId,clientNonce,serverNonce,
 *               clientPublicKeyBase64,serverPublicKeyBase64].join("\n").
 * shared = P-256 ECDH (32 bytes); salt = SHA-256(UTF8(transcript)).
 * key = HKDF-SHA256(shared,salt,UTF8("banke-device-key-v1"),32 bytes).
 * SAS = unsigned big-endian first 4 bytes of HMAC-SHA256(key,
 *       UTF8("banke-pair-sas-v1\n"+transcript)) modulo 100000000, padded to 8 digits.
 * Both screens compute SAS independently; the response NEVER supplies SAS.
 * The desktop user approves only when both displayed numbers match.
 * POST /banke/v1/message {version:1,deviceId,requestId,nonce,ciphertext}
 * requestId = UUID or another 16-120 character random ASCII identifier.
 * nonce = 12 random bytes. ciphertext = AES-256-GCM ciphertext || 16-byte tag.
 * AAD = ["banke-sync-v1",direction,serverId,deviceId,requestId].join("\n"),
 * direction = "request" or "response" (response has a fresh random nonce).
 * Plaintext {action:"status"} works before desktop approval; response contains
 * {ok,status:"pending"|"approved"|"denied"|"expired",serverId,nextSequence?}.
 * Approved plaintext {action:"pull"} returns {ok,snapshot,revision,conflicts:[],nextSequence}.
 * Approved plaintext {action:"sync",sequence,baseline,local}; sequence is a
 * persisted, strictly increasing per-device integer, starting at 1. Client
 * persists one outstanding request (sequence, requestId, baseline, local) before
 * transmission and resends it unchanged after failures. Success returns
 * {ok,snapshot,revision,conflicts,nextSequence,replayed?}. Exact retry of the last
 * committed request returns the CURRENT snapshot without applying it again.
 * Earlier sequence numbers are rejected, even after restart; no bounded replay
 * cache can resurrect an old deletion. baseline/local/snapshot contain exactly
 * {semesterStart,events,completed}; display preferences never cross devices.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { atomicWriteFileSync } = require("./state-store.cjs");
const crypto = require("node:crypto");
const os = require("node:os");
const net = require("node:net");
const { TextDecoder } = require("node:util");
const { createSyncStore, DEVICE_ID, REQUEST_ID } = require("./sync-store.cjs");

const DEFAULT_PORT = 47831;
const PAIRING_MS = 120000;
const MAX_BODY_BYTES = 40 * 1024 * 1024;
const MAX_CIPHER_BYTES = 28 * 1024 * 1024;
const clone = value => JSON.parse(JSON.stringify(value));
function base64(value, bytes, maximum = bytes) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4 || value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("无效的加密编码。");
  const buffer = Buffer.from(value, "base64");
  if ((bytes !== null && buffer.length !== bytes) || buffer.length > maximum || buffer.toString("base64") !== value) throw new Error("无效的加密长度。");
  return buffer;
}
function isPrivateAddress(address) {
  if (typeof address !== "string") return false;
  let host = address.toLowerCase().split("%")[0];
  if (host.startsWith("::ffff:")) host = host.slice(7);
  if (net.isIP(host) === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254);
  }
  return net.isIP(host) === 6 && (host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host));
}
function aad(direction, serverId, deviceId, requestId) {
  return Buffer.from(["banke-sync-v1", direction, serverId, deviceId, requestId].join("\n"), "utf8");
}
function sealEnvelope(key, direction, serverId, deviceId, requestId, payload) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad(direction, serverId, deviceId, requestId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { version: 1, deviceId, requestId, nonce: nonce.toString("base64"), ciphertext: ciphertext.toString("base64") };
}
function openEnvelope(key, direction, serverId, envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
    Object.keys(envelope).length !== 5 || Object.keys(envelope).some(key => !["version", "deviceId", "requestId", "nonce", "ciphertext"].includes(key)) ||
    envelope.version !== 1 || !DEVICE_ID.test(envelope.deviceId) || !REQUEST_ID.test(envelope.requestId)) throw new Error("加密请求无效。");
  const nonce = base64(envelope.nonce, 12);
  const ciphertext = base64(envelope.ciphertext, null, MAX_CIPHER_BYTES);
  if (ciphertext.length < 17) throw new Error("加密请求无效。");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  decipher.setAAD(aad(direction, serverId, envelope.deviceId, envelope.requestId));
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const bytes = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("同步内容无效。");
  return value;
}
function derivePairing(clientPublicKey, clientNonce, serverId, deviceId, ecdh, serverNonce) {
  const serverPublicKey = ecdh.getPublicKey(null, "uncompressed").toString("base64");
  const transcript = ["banke-pair-v1", serverId, deviceId, clientNonce, serverNonce, clientPublicKey, serverPublicKey].join("\n");
  const shared = ecdh.computeSecret(base64(clientPublicKey, 65));
  const salt = crypto.createHash("sha256").update(transcript, "utf8").digest();
  const key = Buffer.from(crypto.hkdfSync("sha256", shared, salt, Buffer.from("banke-device-key-v1", "utf8"), 32));
  const sasBytes = crypto.createHmac("sha256", key).update("banke-pair-sas-v1\n" + transcript, "utf8").digest();
  const sas = String(sasBytes.readUInt32BE(0) % 100000000).padStart(8, "0");
  return { key, sas, publicKey: serverPublicKey };
}

function createSyncService(options) {
  if (!options || !options.directory || !options.store) throw new TypeError("缺少同步服务保存组件。");
  const storage = options.syncStore || createSyncStore({ directory: options.directory, store: options.store, fs: options.fs, now: options.now });
  const now = options.now || (() => Date.now());
  const interfaces = options.networkInterfaces || os.networkInterfaces;
  const onState = typeof options.onState === "function" ? options.onState : () => {};
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const requestedPort = options.port === undefined ? DEFAULT_PORT : options.port;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new TypeError("同步端口无效。");
  const host = options.host || "0.0.0.0";
  if (!["0.0.0.0", "127.0.0.1", "::1"].includes(host)) throw new TypeError("同步服务只支持本机或局域网监听。");
  const pending = new Map(), rates = new Map(), sockets = new Set();
  let server = null, starting = false, cancelStart = null, boundPort = requestedPort, pairingUntil = 0, lastError = "", disposed = false, generation = 0, activeRequests = 0;
  let operation = Promise.resolve(), networkWarning = '';
  const portFile = path.join(options.directory, 'sync-network.json');
  let rememberedPort = null;
  try { const old = JSON.parse(fs.readFileSync(portFile, 'utf8')); if(old.version===1 && Number.isInteger(old.port) && old.port>=1024 && old.port<=65535) rememberedPort=old.port; } catch (_) {}
  function serial(fn) { const run=operation.then(fn,fn); operation=run.then(()=>{},()=>{}); return run; }

  function getAddresses() {
    const addresses = [];
    try {
      for (const [name, values] of Object.entries(interfaces())) for (const item of values || []) {
        if ((item.family === "IPv4" || item.family === 4) && !item.internal && isPrivateAddress(item.address)) {
          addresses.push({ name, address: item.address, url: "http://" + item.address + ":" + boundPort });
        }
      }
    } catch (_) { /* A network transition can temporarily hide interfaces. */ }
    if (host !== "0.0.0.0") addresses.unshift({ name: "本机", address: host, url: "http://" + (host === "::1" ? "[::1]" : host) + ":" + boundPort });
    return addresses;
  }
  function getStatus() {
    const state = storage.status(), current = now();
    return { ...state, running: !!(server && server.listening), port: boundPort, addresses: getAddresses(),
      starting, ...(networkWarning ? { networkWarning } : {}), pairingUntil: pairingUntil > current ? pairingUntil : 0,
      pendingPairings: Array.from(pending.values()).filter(item => item.expiresAt + 60000 > current).map(item => ({
        deviceId: item.deviceId, deviceName: item.deviceName, sas: item.sas, expiresAt: item.expiresAt,
        remoteAddress: item.remoteAddress, status: item.status === "pending" && item.expiresAt <= current ? "expired" : item.status
      })), ...(lastError ? { error: lastError } : {}) };
  }
  function publish() { if (!disposed) { try { onStatus(getStatus()); } catch (_) {} } }
  function publishState(result, source) {
    if (result.ok && result.state && result.changed && !result.replayed) {
      try { onState({ ...clone(result), source }); } catch (_) { /* The committed state still belongs to storage. */ }
    }
  }
  function rateAllowed(address, kind, limit) {
    const current = now();
    for (const [key, item] of rates) if (item.until <= current) rates.delete(key);
    for (const [key, item] of pending) if (item.expiresAt + 60000 <= current) pending.delete(key);
    const key = address + "|" + kind;
    let item = rates.get(key);
    if (!item) {
      if (rates.size >= 256) return false;
      item = { count: 0, until: current + 60000 }; rates.set(key, item);
    }
    item.count++;
    return item.count <= limit;
  }
  function writeJson(response, status, value) {
    if (response.headersSent || response.destroyed) return;
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Connection": "close" });
    response.end(JSON.stringify(value));
  }
  async function readJson(request) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw Object.assign(new Error("需要 JSON 请求。"), { status: 415 });
    const declared = Number(request.headers["content-length"] || 0);
    if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BODY_BYTES) throw Object.assign(new Error("同步请求过大。"), { status: 413 });
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error("同步请求过大。"), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch (_) { throw Object.assign(new Error("请求不是有效 JSON。"), { status: 400 }); }
  }
  function peerStatus(deviceId) {
    const device = storage.getDevice(deviceId);
    if (device) return { ok: true, status: "approved", serverId: storage.status().serverId, nextSequence: device.sequence + 1 };
    const candidate = pending.get(deviceId);
    if (!candidate) return { ok: false, status: "expired", error: "配对已失效，请在电脑端重新开始配对。" };
    return { ok: true, status: candidate.status === "pending" && candidate.expiresAt <= now() ? "expired" : candidate.status, serverId: storage.status().serverId };
  }
  function snapshotResponse(value) {
    if (!value.ok) return value;
    const output = { ok: true, snapshot: value.snapshot, revision: value.revision, conflicts: value.conflicts || [] };
    for (const key of ["nextSequence", "replayed", "warning"]) if (value[key] !== undefined) output[key] = value[key];
    return output;
  }
  async function handle(request, response) {
    const remoteAddress = request.socket.remoteAddress || "";
    if (disposed || !isPrivateAddress(remoteAddress)) { writeJson(response, 403, { ok: false, error: "仅允许本机或局域网连接。" }); request.resume(); return; }
    // The packaged mobile app uses its native HTTP bridge. Browser-originated
    // traffic is deliberately unsupported, including Origin:null and CORS.
    if (request.headers.origin !== undefined) { writeJson(response, 403, { ok: false, error: "请使用半刻手机软件连接。" }); request.resume(); return; }
    if (activeRequests >= 4 || !rateAllowed(remoteAddress, "all", 240)) { writeJson(response, 429, { ok: false, error: "请求过于频繁，请稍后重试。" }); request.resume(); return; }
    activeRequests++;
    try {
      if (request.method === "GET" && request.url === "/banke/v1/info") {
        writeJson(response, 200, { ok: true, protocol: 1, serverId: storage.status().serverId, name: "半刻周计划" }); return;
      }
      if (request.method !== "POST" || !["/banke/v1/pair/request", "/banke/v1/message"].includes(request.url)) {
        writeJson(response, 404, { ok: false, error: "接口不存在。" }); request.resume(); return;
      }
      if (request.url === "/banke/v1/pair/request") {
        if (pairingUntil <= now()) { writeJson(response, 403, { ok: false, error: "请先在电脑端点击“配对手机”。" }); request.resume(); return; }
        if (!rateAllowed(remoteAddress, "pair", 5) || Array.from(pending.values()).filter(item => item.status === "pending" && item.expiresAt > now()).length >= 5) {
          writeJson(response, 429, { ok: false, error: "配对请求过多，请先处理电脑上的请求。" }); request.resume(); return;
        }
        const requestData = await readJson(request);
        if (!requestData || typeof requestData !== "object" || Array.isArray(requestData) ||
          Object.keys(requestData).length !== 3 || Object.keys(requestData).some(key => !["deviceName", "publicKey", "clientNonce"].includes(key)) ||
          typeof requestData.deviceName !== "string" || !requestData.deviceName.trim() || requestData.deviceName.length > 80 || /[\u0000-\u001f\u007f]/.test(requestData.deviceName)) throw Object.assign(new Error("设备名称无效。"), { status: 400 });
        base64(requestData.clientNonce, 16); const publicBytes = base64(requestData.publicKey, 65);
        if (publicBytes[0] !== 4) throw Object.assign(new Error("配对公钥无效。"), { status: 400 });
        const deviceId = "d-" + crypto.randomBytes(16).toString("hex"), serverId = storage.status().serverId;
        const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
        const serverNonce = crypto.randomBytes(16).toString("base64");
        const pairing = derivePairing(requestData.publicKey, requestData.clientNonce, serverId, deviceId, ecdh, serverNonce);
        const expiresAt = Math.min(pairingUntil, now() + PAIRING_MS);
        pending.set(deviceId, { ...pairing, deviceId, deviceName: requestData.deviceName.trim(), remoteAddress, expiresAt, status: "pending" });
        writeJson(response, 200, { ok: true, deviceId, serverId, publicKey: pairing.publicKey, serverNonce, expiresAt }); publish(); return;
      }
      const envelope = await readJson(request);
      if (!envelope || !DEVICE_ID.test(envelope.deviceId)) { writeJson(response, 401, { ok: false, error: "设备未配对或加密验证失败。" }); return; }
      const device = storage.getDevice(envelope.deviceId), candidate = pending.get(envelope.deviceId);
      const key = device ? Buffer.from(device.key, "base64") : candidate && candidate.key;
      if (!key) { writeJson(response, 401, { ok: false, error: "设备未配对或加密验证失败。" }); return; }
      const serverId = storage.status().serverId;
      let payload;
      try { payload = openEnvelope(key, "request", serverId, envelope); }
      catch (_) { writeJson(response, 401, { ok: false, error: "设备未配对或加密验证失败。" }); return; }
      let output;
      if (payload.action === "status") output = peerStatus(envelope.deviceId);
      else if (!device) output = { ok: false, code: "PAIRING_REQUIRED", error: "请先在电脑上核对配对码并允许连接。" };
      else if (payload.action === "pull") {
        const value = storage.loadDesktopState();
        output = value.ok && value.state ? snapshotResponse({ ...value, nextSequence: device.sequence + 1 }) : { ok: false, code: "NOT_READY", error: value.error || "请先在电脑上打开日程。" };
      } else if (payload.action === "sync") {
        if (Object.keys(payload).length !== 4 || Object.keys(payload).some(key => !["action", "sequence", "baseline", "local"].includes(key))) output = { ok: false, code: "INVALID_REQUEST", error: "同步内容包含不支持的字段。" };
        else {
          const saved = storage.syncDevice(envelope.deviceId, envelope.requestId, payload);
          output = snapshotResponse(saved); publishState(saved, "device"); if (saved.ok && !saved.replayed) publish();
        }
      } else output = { ok: false, code: "INVALID_ACTION", error: "不支持这项同步操作。" };
      writeJson(response, 200, sealEnvelope(key, "response", serverId, envelope.deviceId, envelope.requestId, output));
    } catch (error) {
      writeJson(response, error.status || 400, { ok: false, error: error.status ? error.message : "请求内容无法处理，请重新配对或重试。" });
      request.resume();
    } finally { activeRequests--; }
  }
  function closeServer() {
    generation++;
    if (cancelStart) { cancelStart(); cancelStart = null; }
    const current = server; server = null;
    for (const socket of sockets) socket.destroy(); sockets.clear();
    if (current) { try { current.close(); } catch (_) {} }
  }
  function portCandidates() {
    if(requestedPort===0 || options.portFallback===false)return [requestedPort];
    return Array.from(new Set([
      rememberedPort, requestedPort,
      ...Array.from({length:20},(_,i)=>DEFAULT_PORT+1+i), 0
    ].filter(p=>Number.isInteger(p)&&p>=0&&p<=65535)));
  }
  function listenOnce(port, token) {
    return new Promise(resolve=>{
      let finished=false, timer;
      const candidate=http.createServer({maxHeaderSize:8192,requestTimeout:20000,headersTimeout:10000,keepAliveTimeout:1000},(req,res)=>{handle(req,res).catch(()=>writeJson(res,500,{ok:false,error:'同步服务暂时无法处理请求。'}));});
      server=candidate;candidate.maxConnections=8;
      candidate.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setTimeout(20000,()=>socket.destroy());});
      const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);cancelStart=null;resolve(result);};
      candidate.on('error',e=>{
        if(!finished){if(server===candidate)server=null;finish({ok:false,code:e.code||'LISTEN_ERROR'});}
        else if(server===candidate){lastError='同步监听异常：'+(e.code||'UNKNOWN')+'。请重新开启同步。';publish();}
      });
      candidate.once('listening',()=>{
        if(disposed || token!==generation){try{candidate.close();}catch{};finish({ok:false,code:'CANCELED'});return;}
        finish({ok:true,port:candidate.address().port});
      });
      cancelStart=()=>{try{candidate.close();}catch{};finish({ok:false,code:'CANCELED'});};
      timer=setTimeout(()=>{if(server===candidate)server=null;try{candidate.close();}catch{};finish({ok:false,code:'LISTEN_TIMEOUT'});},4000);timer.unref?.();
      try{candidate.listen({port,host,exclusive:true});}catch(e){if(server===candidate)server=null;finish({ok:false,code:e.code||'LISTEN_ERROR'});}
    });
  }
  async function doStart() {
    if(disposed)return {ok:false,error:'同步服务已经关闭。'};
    if(server && server.listening)return getStatus();
    const state=storage.status();if(!state.ok)return state;
    const token=++generation;starting=true;lastError='';networkWarning='';publish();
    let failure;
    try {
      for(const port of portCandidates()) {
        if(disposed || token!==generation)return {ok:false,error:'同步启动已取消。'};
        const result=await listenOnce(port,token);
        if(result.ok) {
          boundPort=result.port;
          const saved=storage.setEnabled(true);if(!saved.ok){closeServer();return saved;}
          if(boundPort!==requestedPort && requestedPort!==0)networkWarning='原端口不可用，已使用 '+boundPort+'。请在手机填写下方当前完整地址。';
          rememberedPort=boundPort;
          try{atomicWriteFileSync(portFile,JSON.stringify({version:1,port:boundPort})+'\n');}catch{networkWarning+=' 本次端口未能保存，请下次核对地址。';}
          starting=false;publish();return getStatus();
        }
        failure=result;
        if(!['EADDRINUSE','EACCES','EPERM'].includes(result.code))break;
      }
      lastError=failure?.code==='CANCELED'?'同步启动已取消。':'未能建立局域网监听（'+(failure?.code||'UNKNOWN')+'）。日程仍保存在本机；未更改防火墙设置。';
      return {ok:false,error:lastError};
    } finally { starting=false;publish(); }
  }
  function start(){return serial(doStart);}
  function stop(){return serial(()=>{
    closeServer();pairingUntil=0;pending.clear();lastError='';networkWarning='';
    const saved=storage.setEnabled(false);publish();return saved.ok?getStatus():saved;
  });}
  function beginPairing(){return serial(async()=>{
    const started=await doStart();if(!started.ok)return started;
    pairingUntil=now()+PAIRING_MS;
    for(const [deviceId,item] of pending)if(item.status!=='approved')pending.delete(deviceId);
    publish();return getStatus();
  });}
  function approvePairing(deviceId, approved = true) {
    if (typeof approved !== "boolean" || !DEVICE_ID.test(deviceId)) return { ok: false, error: "配对操作无效。" };
    const item = pending.get(deviceId);
    if (!item || item.expiresAt <= now() || item.status !== "pending") return { ok: false, error: "配对请求已失效，请重新开始。" };
    if (!approved) { item.status = "denied"; publish(); return getStatus(); }
    const saved = storage.addDevice({ deviceId, deviceName: item.deviceName, key: item.key.toString("base64") });
    if (!saved.ok) return saved;
    item.status = "approved"; publish(); return getStatus();
  }
  function revoke(deviceId) {
    const saved = storage.revoke(deviceId);
    if (saved.ok) pending.delete(deviceId);
    publish(); return saved.ok ? getStatus() : saved;
  }
  function saveDesktopState(state, baseline) {
    const saved = storage.saveDesktopState(state, baseline);
    // The invoking renderer receives this canonical state in its synchronous
    // IPC response. Remote commits alone emit onState, avoiding a self-save loop.
    if (saved.ok) publish();
    return saved;
  }
  function dispose() { disposed = true; closeServer(); pairingUntil = 0; pending.clear(); rates.clear(); }
  return Object.freeze({ getStatus, start, stop, beginPairing, approvePairing, revoke, dispose, saveDesktopState,
    replaceDesktopState: (state, revision) => storage.replaceDesktopState(state, revision),
    loadDesktopState: () => storage.loadDesktopState() });
}

module.exports = { createSyncService, DEFAULT_PORT, PAIRING_MS, isPrivateAddress, sealEnvelope, openEnvelope, derivePairing };
