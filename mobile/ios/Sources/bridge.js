/* WKWebView native host; injected into the packaged main frame only. */
(function () {
  'use strict';
  function call(operation, value) {
    const result = window.prompt('__banke_community_native_v1__', JSON.stringify({operation, value}));
    if (result === null) throw new Error('原生手机组件未响应，原日程未修改。');
    return result;
  }
  Object.defineProperty(window, 'BankeNative', {value: Object.freeze({
    loadBundle: () => call('load'),
    saveBundle: text => call('save', text),
    getDeviceName: () => call('device'),
    request: (id, text) => window.webkit.messageHandlers.banke.postMessage({id, text})
  }), writable: false, configurable: false});
})();
