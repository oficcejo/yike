/* ============================================================
 * polyfill.js — Android 6 / 旧版 WebView 的 ES5 兼容层
 * 必须最先加载：app.js 用到 Object.assign、Array.find、
 * NodeList.forEach，Chrome 49 以下的 WebView 会缺这些 API。
 * 用 var + function，不引入任何 ES6 语法，保证脚本本身能解析。
 * ============================================================ */
(function (w) {
  'use strict';
  var hasOwn = Object.prototype.hasOwnProperty;

  if (!Object.assign) {
    Object.assign = function (target) {
      if (target === null || target === undefined) throw new TypeError('Object.assign: target is null');
      var to = Object(target), i, k, src;
      for (i = 1; i < arguments.length; i++) {
        src = arguments[i];
        if (src === null || src === undefined) continue;
        for (k in src) if (hasOwn.call(src, k)) to[k] = src[k];
      }
      return to;
    };
  }

  if (!Array.prototype.find) {
    Object.defineProperty(Array.prototype, 'find', {
      value: function (pred) {
        if (this === null || this === undefined) throw new TypeError('Array.prototype.find');
        if (typeof pred !== 'function') throw new TypeError('predicate must be a function');
        var t = Object(this), len = t.length >>> 0, i, v;
        for (i = 0; i < len; i++) {
          v = t[i];
          if (pred.call(arguments[1], v, i, t)) return v;
        }
        return undefined;
      }, configurable: true, writable: true
    });
  }

  if (!Array.prototype.includes) {
    Object.defineProperty(Array.prototype, 'includes', {
      value: function (item) {
        var t = Object(this), len = t.length >>> 0, i, from = Number(arguments[1]) || 0;
        if (from < 0) from = Math.max(len + from, 0);
        for (i = from; i < len; i++) {
          if (t[i] === item || (t[i] !== t[i] && item !== item)) return true;
        }
        return false;
      }, configurable: true, writable: true
    });
  }

  if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (s, pos) {
      var p = pos ? Math.max(0, Math.min(pos | 0, this.length)) : 0;
      return this.slice(p, p + String(s).length) === String(s);
    };
  }
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (s, pos) {
      var str = String(this), e = (pos === undefined) ? str.length : Math.max(0, Math.min(pos | 0, str.length));
      return str.slice(e - String(s).length, e) === String(s);
    };
  }
  if (!String.prototype.includes) {
    String.prototype.includes = function (s, pos) { return this.indexOf(s, pos || 0) !== -1; };
  }

  // querySelectorAll(...) 返回 NodeList，老 WebView 没有 forEach
  if (w.NodeList && !w.NodeList.prototype.forEach) w.NodeList.prototype.forEach = Array.prototype.forEach;
  if (w.HTMLCollection && !w.HTMLCollection.prototype.forEach) w.HTMLCollection.prototype.forEach = Array.prototype.forEach;

  // <details> 在极旧 WebView 上不折叠：补一个点击切换，避免思维链整段撑开页面
  if (w.document && w.document.addEventListener) {
    w.document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'SUMMARY') return;
      var d = t.parentNode;
      if (!d || d.tagName !== 'DETAILS') return;
      if (typeof d.open === 'boolean') return;   // 原生支持则交给浏览器
      var body = d.querySelector('.think-body');
      if (body) body.style.display = (body.style.display === 'none') ? '' : 'none';
    }, false);
  }
})(typeof window !== 'undefined' ? window : this);
