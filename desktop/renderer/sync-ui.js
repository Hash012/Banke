(function () {
  'use strict';
  const D = window.BankeDesktop, $ = id => document.getElementById(id);
  if (!D || typeof D.getSyncStatus !== 'function') { $('syncButton').hidden = true; return; }
  let current = {}, busy = false;
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; return node;
  }
  function error(message) { $('syncError').textContent = message || ''; $('syncError').hidden = !message; }
  async function act(callback) {
    if (busy) return; busy = true; error('');
    try {
      const result = await callback();
      if (result && result.ok === false) error(result.error || '同步操作未完成，请重试。');
      render(await D.getSyncStatus());
    } catch (_) { error('暂时无法读取同步服务，请稍后重试。'); }
    finally { busy = false; }
  }
  function render(status) {
    if (!status || typeof status !== 'object') return;
    current = status;
    $('syncEnable').textContent = status.running ? '关闭局域网同步' : '开启局域网同步';
    $('syncConnection').hidden = !status.running;
    $('syncSummary').textContent = status.running
      ? '已开启 · 端口 '+status.port+'。'+(status.networkWarning || '配对后自动同步，日程只在你的设备之间传输。')
      : '同步未开启 · 现有日程仍正常保存在本机。';
    $('syncButton').classList.toggle('sync-running', !!status.running);
    if (status.error) error(status.error); else if (status.running) error('');
    $('syncAddresses').replaceChildren();
    for (const address of status.addresses || []) {
      const label = element('label', address.name || '局域网地址', 'sync-address');
      const input = document.createElement('input'); input.readOnly = true; input.value = address.url;
      input.setAttribute('aria-label', '电脑同步地址'); input.onclick = () => input.select();
      label.append(input); $('syncAddresses').append(label);
    }
    if (!(status.addresses || []).length) $('syncAddresses').append(element('p', '暂未发现局域网地址，请连接与手机相同的 Wi-Fi。', 'caption'));
    const remaining = Math.max(0, Math.ceil((Number(status.pairingUntil) - Date.now()) / 1000));
    $('syncPairWindow').textContent = remaining ? '新手机可在 ' + remaining + ' 秒内发起连接。' : '只有点击上面的配对按钮后，新手机才能申请连接。';
    $('syncPending').replaceChildren();
    for (const item of status.pendingPairings || []) {
      if (item.status && item.status !== 'pending') continue;
      const card = element('section', undefined, 'sync-pair-card');
      card.append(element('strong', item.deviceName || '手机'), element('p', '请确认手机上也显示同一组数字：'));
      card.append(element('div', (item.sas || '').replace(/(.{4})/, '$1 '), 'sync-sas'));
      const allow = element('button', '数字一致 · 允许连接', 'button primary');
      const deny = element('button', '拒绝', 'button');
      allow.onclick = () => act(() => D.approvePairing(item.deviceId, true));
      deny.onclick = () => act(() => D.approvePairing(item.deviceId, false));
      card.append(allow, deny); $('syncPending').append(card);
    }
    $('syncDevices').replaceChildren();
    for (const item of status.devices || []) {
      const row = element('div', undefined, 'sync-device');
      row.append(element('span', item.deviceName || '手机'));
      const revoke = element('button', '取消配对', 'text-button danger-text');
      revoke.onclick = () => act(() => D.revokeDevice(item.deviceId)); row.append(revoke);
      $('syncDevices').append(row);
    }
    if (!(status.devices || []).length) $('syncDevices').append(element('p', '还没有配对的手机。', 'caption'));
  }
  $('syncButton').onclick = () => {
    if (typeof $('syncDialog').showModal === 'function') $('syncDialog').showModal();
    else $('syncDialog').setAttribute('open', '');
    act(() => D.getSyncStatus());
  };
  // app.js installed generic close listeners before this dialog becomes visible.
  $('syncEnable').onclick = () => act(() => D.setSyncEnabled(!current.running));
  $('syncPair').onclick = () => act(() => D.beginPairing());
  if (typeof D.onSyncStatus === 'function') D.onSyncStatus(render);
  D.getSyncStatus().then(render).catch(() => {});
  setInterval(() => { if ($('syncDialog').open && !busy) D.getSyncStatus().then(render).catch(() => {}); }, 2500);
})();
