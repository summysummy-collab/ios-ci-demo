/* 大单监控 · 安装页脚本
 *
 * 页面本身是静态的，版本信息全部来自每个包自己的 ota.json（由出包流程覆盖写入）：
 *   bigorder-rokid/ota.json  乐奇版（含眼镜副屏）
 *   bigorder-ios/ota.json    标准版
 * 所以发新版本不用改 html，重新出包 → json 更新 → 页面自动变。
 *
 * 三段兜底，保证任何一个环节挂了页面也不白屏：
 *   1) 正常情况：同源相对路径取 ota.json
 *   2) 相对路径 404（例如站点被搬到别的主机、只带了页面没带 json）：留空并明确提示
 *   3) 都没取到：用 html 里内联的 FALLBACK 渲染，状态条标「清单离线」
 */
(function () {
  'use strict';

  var CFG = window.OTA_CFG || { apps: [] };

  /* ---------- 图标 ---------- */
  var ICON_APP =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 20h18"/><rect x="5" y="12" width="3" height="5" rx=".8"/>' +
    '<rect x="10.5" y="8" width="3" height="9" rx=".8"/>' +
    '<rect x="16" y="4.5" width="3" height="12.5" rx=".8"/></svg>';

  var ICON_APP_DIM =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#8fa3ad" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 20h18"/><rect x="5" y="12" width="3" height="5" rx=".8"/>' +
    '<rect x="10.5" y="8" width="3" height="9" rx=".8"/>' +
    '<rect x="16" y="4.5" width="3" height="12.5" rx=".8"/></svg>';

  var ICON_AGENT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#00e676" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2.5 13.2h19"/><path d="M2.5 13.2c0-2.3 1.2-3.6 3-3.6h1.9c1 0 1.6.6 1.9 1.4l.7 2.2"/>' +
    '<path d="M21.5 13.2c0-2.3-1.2-3.6-3-3.6h-1.9c-1 0-1.6.6-1.9 1.4l-.7 2.2"/></svg>';

  var ICON_PHONE_DL =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M12 8.5v6"/>' +
    '<path d="m9.5 12 2.5 2.5 2.5-2.5"/></svg>';

  var DL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M4 21h16"/></svg>';

  var WARN_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#ffc85c" stroke-width="1.9" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/></svg>';

  var RISK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#ff8a8a" stroke-width="1.9" stroke-linecap="round">' +
    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/></svg>';

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmtSize(b) {
    if (!b) return '—';
    if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
    return Math.round(b / 1024) + ' KB';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 站点被托管在需要 sharecode 的地址时（URL 带 ?sharecode=xxx），
  // 同源静态资源也得带上它，否则 json / plist / ipa 一律 403。
  var SHARECODE = (function () {
    try { return new URLSearchParams(location.search).get('sharecode'); }
    catch (e) { return null; }
  })();

  // 相对路径按 json 所在目录解析；绝对地址原样返回
  function resolve(rel, dataURL) {
    if (!rel) return '';
    if (/^(https?:|itms-services:|data:)/i.test(rel)) return rel;
    var url;
    try { url = new URL(rel, new URL(dataURL, document.baseURI)).href; }
    catch (e) { return rel; }
    if (SHARECODE && url.indexOf('sharecode=') < 0) {
      try {
        if (new URL(url).origin === location.origin) {
          url += (url.indexOf('?') >= 0 ? '&' : '?') + 'sharecode=' + encodeURIComponent(SHARECODE);
        }
      } catch (e2) { /* file:// 之类没有 origin，跳过 */ }
    }
    return url;
  }

  function itms(manifestURL) {
    return 'itms-services://?action=download-manifest&url=' + encodeURIComponent(manifestURL);
  }

  /* ---------- 复制 / toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }
  window.copyText = function (text, msg) {
    var done = function () { toast(msg || '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* 老浏览器就算了 */ }
      document.body.removeChild(ta);
    }
  };

  /* ---------- 运行环境判断 ---------- */
  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // iOS 上所有浏览器都是 WebKit，但只有 Safari 认 itms-services
  var isSafari = isIOS && /Safari\//.test(ua) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger|QQ\/|UCBrowser|baiduboxapp|Weibo|DuckDuckGo)/.test(ua);

  function iosHint() {
    if (!isIOS) return '用 <b>iPhone 的 Safari</b> 打开本页再点这个按钮 —— iOS 的 OTA 安装只认 Safari，别在微信里点。';
    if (isSafari) return '点上方按钮 → 弹窗点「安装」→ 回桌面等图标出现。';
    return '<b>当前不是 Safari</b>，iOS 会拦掉安装。把页面链接粘到 Safari 再打开。';
  }

  /* ---------- 渲染：包卡片 ---------- */
  function appCard(ota, primary) {
    var app = ota.app || {};
    var L = ota.latest || {};
    var s = L.signing || {};
    var dataURL = ota.__dataURL;
    var rel = ota.install || {};

    var manifestURL = '';
    if (rel.manifest) {
      manifestURL = resolve(rel.manifest, dataURL);
      // 带版本号查 plist，避免被上一次的缓存回放成旧包
      if (L.versionName) {
        manifestURL += (manifestURL.indexOf('?') >= 0 ? '&' : '?') +
          'v=' + encodeURIComponent(L.versionName + '-' + L.versionCode);
      }
    }

    var hasPkg = !!L.url;
    var installBtn;
    if (!hasPkg) {
      installBtn = '<a class="btn off">还没有出过包</a>';
    } else if (!isSafari && manifestURL) {
      // 桌面/微信里照样给出 itms 链接，点不动时下面的提示会说明原因
      installBtn = '<a class="btn" href="' + esc(itms(manifestURL)) + '">' +
        ICON_PHONE_DL + '在 iPhone 上安装</a>';
    } else if (manifestURL) {
      installBtn = '<a class="btn" href="' + esc(itms(manifestURL)) + '">' +
        ICON_PHONE_DL + '在 iPhone 上安装</a>';
    } else {
      installBtn = '<a class="btn" href="' + esc(resolve(L.url, dataURL)) + '" download>' +
        DL_ICON + '下载 .ipa</a>';
    }

    var notes = (L.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    return '' +
      '<div class="app">' +
        '<div class="icon' + (primary ? '' : ' dim') + '">' + (primary ? ICON_APP : ICON_APP_DIM) + '</div>' +
        '<div>' +
          '<h2>' + esc(app.name) + '</h2>' +
          '<div class="pkg">' + esc(app.bundleId) + '</div>' +
        '</div>' +
        '<div class="ver' + (primary ? '' : ' dim') + '">v' + esc(L.versionName || '—') + '</div>' +
      '</div>' +

      '<div class="chips">' +
        '<span class="chip">系统 <b>iOS ' + esc(app.minOs || '16.0') + '+</b></span>' +
        '<span class="chip">体积 <b>' + fmtSize(L.size) + '</b></span>' +
        '<span class="chip">构建 <b>b' + esc(L.versionCode || '—') + '</b></span>' +
        '<span class="chip">签名 <b>开发证书</b></span>' +
        '<span class="chip">设备 <b>' + (s.devices || 1) + ' 台已登记</b></span>' +
      '</div>' +

      (notes ? '<ul class="notes">' + notes + '</ul>' : '') +

      installBtn +
      '<p class="hintline">' + iosHint() + '</p>' +
      (hasPkg ? '<a class="btn ghost" href="' + esc(resolve(L.url, dataURL)) + '" download>' +
        '下载 .ipa（电脑用）</a>' : '') +

      (L.sha256 ? '<div class="hash"><span>SHA-256</span><code>' + esc(L.sha256) + '</code>' +
        '<button class="copy" data-copy="' + esc(L.sha256) + '" data-msg="校验和已复制">复制</button></div>' : '') +
      (s.profileName ?
        '<div class="hash"><span>描述文件</span><code>' + esc(s.profileName) +
        (s.expiresAt ? ' · ' + esc(s.expiresAt) + ' 到期' : '') + '</code></div>' : '') +

      (L.releasedAt ? '<p class="publine">发布 <b>' + fmtDate(L.releasedAt) + '</b>' +
        ' · 与已装版本同签名，<b>可直接覆盖安装</b>，不丢数据</p>' : '');
  }

  /* ---------- 渲染：智能体卡片 ---------- */
  function agentCard(agent, dataURL) {
    if (!agent || !agent.file) return '';
    var url = agent.url ? resolve(agent.url, dataURL) : '';
    var btn;
    if (agent.local) {
      btn = '<a class="btn" href="' + esc(url) + '" download>' + DL_ICON + '下载 .aix</a>';
    } else if (url) {
      btn = '<a class="btn ghost" href="' + esc(url) + '" target="_blank" rel="noopener">' +
        '去私有仓库取 .aix（需 GitHub 授权）</a>';
    } else {
      btn = '<a class="btn off">.aix 在私有仓库 Release</a>';
    }

    var notes = (agent.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');

    return '' +
      '<h3>AIUI 智能体（眼镜上的界面）</h3>' +
      '<section class="card">' +
        '<div class="app">' +
          '<div class="icon dim">' + ICON_AGENT + '</div>' +
          '<div>' +
            '<h2>' + esc(agent.name || 'AIUI 智能体') + '</h2>' +
            '<div class="pkg">' + esc(agent.file) + '</div>' +
          '</div>' +
          '<div class="ver">v' + esc(agent.version || '—') + '</div>' +
        '</div>' +
        '<div class="chips">' +
          '<span class="chip">体积 <b>' + fmtSize(agent.size) + '</b></span>' +
          '<span class="chip">引擎 <b>AIUI</b></span>' +
          (agent.page ? '<span class="chip">入口 <b>' + esc(agent.page) + '</b></span>' : '') +
        '</div>' +
        (notes ? '<ul class="notes">' + notes + '</ul>' : '') +
        btn +
      '</section>';
  }

  /* ---------- 渲染：版本历史 ---------- */
  function historySection(list) {
    var items = [];
    list.forEach(function (ota) {
      var label = (ota.app && ota.app.label) || (ota.app && ota.app.name) || '';
      (ota.history || []).forEach(function (h) { items.push({ label: label, h: h, ota: ota }); });
    });
    items.sort(function (a, b) { return new Date(b.h.releasedAt || 0) - new Date(a.h.releasedAt || 0); });
    if (!items.length) {
      return '<p class="publine" style="margin:0">清单里还没有历史记录，第一次出包后自动累积。</p>';
    }
    return '<ul class="tl">' + items.slice(0, 14).map(function (it, idx) {
      var h = it.h;
      return '<li class="' + (idx === 0 ? 'latest' : '') + '">' +
        '<div class="row">' +
          '<span class="v">v' + esc(h.versionName) + (h.versionCode ? ' <span class="who">b' + esc(h.versionCode) + '</span>' : '') + '</span>' +
          (idx === 0 ? '<span class="tag">最新</span>' : '') +
          '<span class="when">' + fmtDate(h.releasedAt) + '</span>' +
        '</div>' +
        '<p class="who">' + esc(it.label) + ' · ' + fmtSize(h.size) + ' · ' +
          (h.url ? '<a class="dl" href="' + esc(resolve(h.url, it.ota.__dataURL)) + '" download>下载</a>' : '无包') +
        '</p>' +
        (h.notes && h.notes.length ? '<p>' + h.notes.map(esc).join('；') + '</p>' : '') +
      '</li>';
    }).join('') + '</ul>';
  }

  /* ---------- 清单区 ---------- */
  function manifestSection(list) {
    var first = list[0] || {};
    var mf = first.__dataURL ? resolve((first.install || {}).manifest || '', first.__dataURL) : '';
    var dl = $('mf-url');
    if (dl) dl.textContent = mf || '—';
    var curl = $('mf-curl');
    if (curl) curl.textContent = mf || './ota.json';
    var t = $('mf-time');
    if (t) t.textContent = fmtDate(first.generatedAt);
    // 每本清单单独一行，两个包各有一份
    var box = $('mf-list');
    if (box) {
      box.innerHTML = list.map(function (ota) {
        return '<div class="kv stack"><dt>' + esc((ota.app || {}).label || ota.app.id) +
          ' · manifest.plist</dt><dd>' +
          esc(resolve((ota.install || {}).manifest || '', ota.__dataURL) || '—') + '</dd></div>';
      }).join('');
    }
  }

  /* ---------- 状态条 ---------- */
  function setStatus(text, cls) {
    var el = $('st-sync');
    if (!el) return;
    el.textContent = text;
    el.className = 'right ' + (cls || '');
  }

  /* ---------- 二维码 ---------- */
  function drawQr() {
    var box = $('qr');
    var urlEl = $('qr-url');
    if (!box) return;
    var url = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname + location.search
      : location.href;
    if (urlEl) urlEl.textContent = url;
    if (typeof qrcode !== 'function') {
      box.innerHTML = '<span class="qr-fail">二维码组件未加载<br>请直接复制右侧链接</span>';
      return;
    }
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      box.innerHTML = '<span class="qr-fail">链接过长，<br>请复制右侧地址</span>';
    }
  }

  /* ---------- 主流程 ---------- */
  function render(list) {
    var cards = $('app-cards');
    if (cards) {
      cards.innerHTML = list.map(function (ota, idx) {
        return '<section class="card' + (idx === 0 ? ' primary' : '') + '">' + appCard(ota, idx === 0) + '</section>';
      }).join('');
    }

    // 智能体只跟乐奇版走，挂在第一张卡后面
    var agentHost = $('agent-card');
    if (agentHost) {
      var withAgent = list.filter(function (o) { return o.agent && o.agent.file; })[0];
      agentHost.innerHTML = withAgent ? agentCard(withAgent.agent, withAgent.__dataURL) : '';
    }

    var hs = $('history');
    if (hs) hs.innerHTML = historySection(list);
    manifestSection(list);

    if ($('st-count')) $('st-count').textContent = list.length;
    if ($('st-schema')) $('st-schema').textContent = 'v' + ((list[0] || {}).schema || 1);

    // 复制按钮统一走事件委托，避免内联 onclick 里的引号转义问题
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.copy') : null;
      if (!b) return;
      copyText(b.getAttribute('data-copy') || '', b.getAttribute('data-msg') || '已复制');
    });
  }

  function fetchOne(item) {
    var dataURL = resolve(item.data, document.baseURI);
    var bust = dataURL + (dataURL.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    return fetch(bust, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d.app) throw new Error('bad json');
        d.__dataURL = dataURL;
        return d;
      })
      .catch(function () {
        // 单个包失败就用内联兜底，不影响另一个
        var fb = item.fallback ? JSON.parse(JSON.stringify(item.fallback)) : null;
        if (!fb) return null;
        fb.__dataURL = dataURL;
        fb.__offline = true;
        return fb;
      });
  }

  function boot() {
    drawQr();
    var list = CFG.apps || [];
    Promise.all(list.map(fetchOne)).then(function (res) {
      var ok = res.filter(Boolean);
      if (!ok.length) {
        setStatus('清单离线', 'off');
        var cards = $('app-cards');
        if (cards) {
          cards.innerHTML = '<section class="card"><p class="publine" style="margin:0">' +
            '没有读到任何包的清单，说明这两个包还没跑过出包流程。</p></section>';
        }
        return;
      }
      render(ok);
      if (ok.some(function (o) { return o.__offline; })) {
        setStatus('清单离线 · 内置缓存', 'off');
      } else {
        setStatus('清单在线 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }), 'live');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
