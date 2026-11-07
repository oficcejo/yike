/* UI 冒烟测试：node tools/test_ui.js（需 jsdom；可选 acorn 用于 ES5 语法校验） */
'use strict';
const path = require('path');

// 优先用项目本地依赖，兼容 clone 后直接 npm install 的场景
function loadDep(name) {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', name),
    path.join(process.cwd(), 'node_modules', name),
    '/tmp/yike_test/node_modules/' + name,
    name
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 换下一个候选 */ }
  }
  return null;
}

const jsdom = loadDep('jsdom');
if (!jsdom) {
  console.error('缺少依赖 jsdom，请先执行：npm install --no-save jsdom acorn');
  process.exit(1);
}
const { JSDOM, VirtualConsole } = jsdom;
const FILE = path.join(__dirname, '..', 'web', 'index.html');

let pass = 0, fail = 0, jsErrors = [];
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); } }

const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) jsErrors.push(e.message); });
vc.on('error', (...a) => jsErrors.push(a.join(' ')));

JSDOM.fromFile(FILE, {
  runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  url: 'file://' + FILE
}).then(dom => new Promise(res => {
  dom.window.addEventListener('load', () => setTimeout(() => res(dom), 250));
})).then(dom => {
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const click = id => $(id).click();

  console.log('=== 页面初始化 ===');
  ok('核心模块已加载', !!(w.Calendar && w.GuaData && w.Classics && w.LiuYao && w.LiuRen && w.LLM));
  ok('占题下拉 12 项', $('zhanti').options.length === 12, $('zhanti').options.length);
  ok('64 卦下拉', $('guaSelect').options.length === 64, $('guaSelect').options.length);
  ok('预设下拉与 PRESETS 一致', $('cfgPreset').options.length === w.LLM.PRESETS.length && w.LLM.PRESETS.length >= 10, $('cfgPreset').options.length);
  ok('本命下拉 12 支 + 空项', $('nianming').options.length === 13 && $('nianming').options[1].value === '子', $('nianming').options.length + '/' + ($('nianming').options[1] || {}).value);
  ok('历法预览已计算', $('kongPreview').textContent.length > 0, $('kongPreview').textContent);
  ok('默认模型为 deepseek-flash', w.LLM.DEFAULT_CFG.model === 'deepseek-flash', w.LLM.DEFAULT_CFG.model);
  ok('polyfill 补齐旧 WebView API', typeof w.Object.assign === 'function' &&
    typeof w.Array.prototype.find === 'function' && typeof w.NodeList.prototype.forEach === 'function');
  const links = Array.prototype.map.call(d.querySelectorAll('link[rel=stylesheet]'), l => l.getAttribute('href') || '').join('|');
  const scripts = Array.prototype.map.call(d.querySelectorAll('script[src]'), s => s.getAttribute('src') || '').join('|');
  ok('兼容 CSS 与 polyfill 已引入', /app-compat\.css/.test(links) && /polyfill\.js/.test(scripts), links);

  console.log('\n=== 六爻起课 ===');
  click('rollBtn');
  ok('摇出六爻', $('sixLines').querySelectorAll('.yaoline').length === 6);
  const before = $('sixLines').innerHTML;
  $('sixLines').querySelector('.yaoline').click();
  ok('点击爻行可切换动静', $('sixLines').innerHTML !== before);
  click('startBtn');
  ok('切到盘面页', $('view-pan').hidden === false && $('view-start').hidden === true);
  ok('盘面标题', $('panTitle').textContent === '六爻纳甲排盘', $('panTitle').textContent);
  ok('盘面表格 6 行', $('panBody').querySelectorAll('.pan-table tbody tr').length === 6);
  ok('要点卡含用神', $('panFacts').textContent.indexOf('用神') >= 0);
  ok('条文卡有内容', $('panEvidence').textContent.length > 30);
  ok('历史已记录', $('historyMini').querySelectorAll('.hitem').length >= 1);

  console.log('\n=== 离线解读 ===');
  d.querySelector('#tabbar button[data-view="read"]').click();
  click('localBtn');
  ok('离线断语生成', $('readBody').textContent.indexOf('离线规则解读') >= 0);
  ok('含经典依据编号', $('readBody').textContent.indexOf('[') >= 0);
  ok('含免责声明', $('readBody').textContent.indexOf('不构成决策依据') >= 0);

  console.log('\n=== 大六壬起课 ===');
  d.querySelector('#tabbar button[data-view="start"]').click();
  d.querySelector('#modeSeg button[data-mode="liuren"]').click();
  ok('切换六壬卡片', $('liurenCard').hidden === false && $('liuyaoCard').hidden === true);
  click('startBtn');
  ok('课盘标题', $('panTitle').textContent === '大六壬课盘', $('panTitle').textContent);
  ok('天地盘 12 宫', $('panBody').querySelectorAll('.ren-cell').length === 12);
  ok('四课 4 列', $('panBody').querySelectorAll('.sike').length === 4);
  ok('三传 3 列', $('panBody').querySelectorAll('.chuan').length === 3);
  ok('课体已定', $('panFacts').textContent.indexOf('课体') >= 0);

  console.log('\n=== 经典 / 设置 / 历史 ===');
  d.querySelector('#tabbar button[data-view="classic"]').click();
  ok('经典条文列表', $('classicList').querySelectorAll('.cls').length > 30, $('classicList').querySelectorAll('.cls').length);
  d.querySelectorAll('.chip')[2].click();
  ok('条文筛选生效', $('classicList').querySelectorAll('.cls').length > 0);
  d.querySelector('#tabbar button[data-view="setting"]').click();
  ok('配置项已填充', $('cfgBase').value.indexOf('http') >= 0, $('cfgBase').value);
  $('cfgKey').value = 'sk-test';
  click('saveCfg');
  ok('配置保存并更新状态', $('apiBadge').textContent === 'AI 已配置', $('apiBadge').textContent);
  d.querySelector('#tabbar button[data-view="start"]').click();
  ok('历史记录 2 条', $('historyMini').querySelectorAll('.hitem').length === 2, $('historyMini').querySelectorAll('.hitem').length);
  $('historyMini').querySelector('.hitem').click();
  ok('历史可载入', $('view-pan').hidden === false && $('panTitle').textContent.length > 0);

  console.log('\n=== JS 运行时错误 ===');
  ok('无未捕获 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

  console.log('\n=== Android 6 兼容静态检查 ===');
  const fs = require('fs'), ROOT = path.join(__dirname, '..');
  const appCss = fs.readFileSync(path.join(ROOT, 'web', 'css', 'app.css'), 'utf8');
  const compatCss = fs.readFileSync(path.join(ROOT, 'web', 'css', 'app-compat.css'), 'utf8');
  ok('兼容 CSS 已展开全部变量', compatCss.indexOf('var(--') < 0);
  ok('[hidden] 有显式兜底', /\[hidden\]\{display:none!important\}/.test(appCss));
  ok('minSdk 已降到 23', /minSdk\s+23/.test(fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8')));
  let acorn = null;
  acorn = loadDep('acorn');
  if (acorn) {
    const jsDir = path.join(ROOT, 'web', 'js'), bad = [];
    fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).forEach(f => {
      try { acorn.parse(fs.readFileSync(path.join(jsDir, f), 'utf8'), { ecmaVersion: 5, sourceType: 'script' }); }
      catch (e) { bad.push(f + ': ' + e.message); }
    });
    ok('全部前端脚本可按 ES5 解析', bad.length === 0, bad.join(' | '));
  } else {
    console.log('  (未安装 acorn，跳过 ES5 语法检查)');
  }
  console.log('\n============================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}).catch(e => { console.error('页面加载失败：', e); process.exit(1); });
