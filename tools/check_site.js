/* 离线跑一遍 site.js 的渲染逻辑：没有浏览器，就用最小 DOM 桩子把
 * ota.json -> innerHTML 这条链走通，确保关键函数不抛异常、卡片真被渲染出来。
 * 只在本地用，不进站点。
 */
const fs = require('fs');
const path = require('path');

// 默认校验仓库里的 docs；发布目录在别处时用 SITE_ROOT 指过去
const ROOT = process.env.SITE_ROOT
  ? path.resolve(process.env.SITE_ROOT)
  : path.resolve(__dirname, '..', 'docs');
const store = {};
function el(id) {
  if (!store[id]) store[id] = { id, innerHTML: '', textContent: '', className: '', style: {} };
  return store[id];
}

global.window = {};
global.navigator = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 5,
};
global.location = { origin: 'https://example.com', pathname: '/', search: '', href: 'https://example.com/' };
global.document = {
  readyState: 'complete',
  baseURI: 'https://example.com/',
  getElementById: el,
  addEventListener() {},
  createElement() { return { style: {}, select() {} }; },
  body: { appendChild() {}, removeChild() {} },
};

const read = (p) => {
  // 清单由出包流程生成，新克隆的仓库里可能还没有 —— 缺了就当作「离线」，
  // 正好顺带验证内联兜底那条路径。
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  } catch (e) {
    return null;
  }
};
const data = {};
for (const k of ['bigorder-rokid/ota.json', 'bigorder-ios/ota.json']) {
  const v = read(k);
  if (v) data[k] = v;
}
global.fetch = async (url) => {
  const key = Object.keys(data).find((k) => String(url).startsWith('https://example.com/' + k));
  if (!key) return { ok: false, status: 404 };
  return { ok: true, json: async () => JSON.parse(JSON.stringify(data[key])) };
};

// 极简 qrcode 替身：只要 createSvgTag 返回字符串即可
global.qrcode = () => ({ addData() {}, make() {}, createSvgTag: () => '<svg data-qr="1"></svg>' });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cfgSrc = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
eval(cfgSrc); // 定义 FB_ROKID / FB_IOS / window.OTA_CFG

require(path.join(ROOT, 'site.js'));

setTimeout(() => {
  const cards = store['app-cards'] ? store['app-cards'].innerHTML : '';
  const agent = store['agent-card'] ? store['agent-card'].innerHTML : '';
  const hist = store['history'] ? store['history'].innerHTML : '';
  const out = [
    ['状态条', store['st-sync'] && store['st-sync'].textContent],
    ['包数量', store['st-count'] && store['st-count'].textContent],
    ['卡片字节', cards.length],
    ['含安装按钮', /itms-services:\/\/\?action=download-manifest/.test(cards)],
    ['含 sha', /SHA-256<\/span><code>[0-9a-f]{64}<\/code>/.test(cards)],
    ['智能体卡', agent.length > 0],
    ['历史条数', (hist.match(/<li class=/g) || []).length],
    ['二维码', store['qr'] && /data-qr/.test(store['qr'].innerHTML)],
    ['清单地址', store['mf-url'] && store['mf-url'].textContent],
  ];
  for (const [k, v] of out) console.log(k + ':', v);
  if (!cards.length || !/itms-services/.test(cards)) process.exitCode = 1;
}, 300);
