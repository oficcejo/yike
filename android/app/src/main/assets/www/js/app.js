/* ============================================================
 * app.js — 易课 UI 与交互（安卓 WebView / 浏览器预览共用）
 * ============================================================ */
(function () {
  'use strict';
  var C = window.Calendar, G = window.GuaData, K = window.Classics,
      LY = window.LiuYao, LR = window.LiuRen, LLM = window.LLM;
  var $ = function (id) { return document.getElementById(id); };
  var S = {
    view: 'start', mode: 'liuyao', gender: 'male',
    siXiang: null, lines: null, dong: [], source: '',
    pan: null, readText: '', reasonText: '', chatHistory: [], cancelFn: null, streaming: false,
    history: [], prefs: null, cfg: null, classicFilter: '全部', curHid: null
  };
  var DEF_PREFS = { lon: 120, tst: false, lateZi: true, guiren: 'tongxing', huoshi: '' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fmtDt(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function parseDt() {
    var v = $('dt').value, m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
  }
  function loadPrefs() { try { return Object.assign({}, DEF_PREFS, JSON.parse(LLM.Storage.get('app_prefs', '{}') || '{}')); } catch (e) { return Object.assign({}, DEF_PREFS); } }
  function loadHistory() { try { return JSON.parse(LLM.Storage.get('app_history', '[]') || '[]'); } catch (e) { return []; } }
  function saveHistory() { try { LLM.Storage.set('app_history', JSON.stringify(S.history.slice(0, 20))); } catch (e) { } }

  function currentCal() {
    var t = parseDt();
    if (!t) throw new Error('请选择有效的起课时间');
    if (t.y < 1900 || t.y > 2060) throw new Error('内置精确节气表覆盖 1900–2060 年，请选择该范围内的时间');
    var p = S.prefs;
    var cal = C.compute(t.y, t.m, t.d, t.h, t.mi, { longitude: p.lon, trueSolarTime: p.tst, lateZiNextDay: p.lateZi });
    if (S.mode === 'liuren' && p.huoshi) {
      var b = C.bIdx(p.huoshi);
      cal.timeBranchIdx = b; cal.timeZhi = C.ZHI[b];
      cal.timeGan = C.GAN[C.mod(C.mod(C.gIdx(cal.dayGan), 5) * 2 + b, 10)];
      cal.timeGZ = cal.timeGan + C.ZHI[b];
    }
    return cal;
  }

  // ---------- 视图 ----------
  function switchView(v) {
    S.view = v;
    ['start', 'pan', 'read', 'classic', 'setting'].forEach(function (x) { $('view-' + x).hidden = (x !== v); });
    document.querySelectorAll('#tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    $('main').scrollTop = 0; window.scrollTo(0, 0);
    if (v === 'classic') renderClassics();
    if (v === 'setting') fillCfg();
  }
  window.AppBack = function () { return S.view; };
  window.goStart = function () { switchView('start'); };

  // ---------- 初始化下拉 ----------
  function fillSelect(el, items, valKey, labelKey, emptyLabel) {
    var h = emptyLabel ? '<option value="">' + esc(emptyLabel) + '</option>' : '';
    items.forEach(function (it) {
      var v = typeof it === 'string' ? it : it[valKey];
      var l = typeof it === 'string' ? (labelKey || it) : it[labelKey];
      h += '<option value="' + esc(v) + '">' + esc(l) + '</option>';
    });
    el.innerHTML = h;
  }
  function initSelects() {
    fillSelect($('zhanti'), G.ZHANTI, 'id', 'name');
    fillSelect($('guaSelect'), G.HEX.list, 'key', 'name');
    fillSelect($('nianming'), C.ZHI, null, null, '不填');
    fillSelect($('xingnian'), C.ZHI, null, null, '不填');
    var hs = [{ v: '', l: '正时（按起课时间）' }].concat(C.ZHI.map(function (z) { return { v: z, l: z + '时（活时）' }; }));
    fillSelect($('huoshi'), hs, 'v', 'l');
    fillSelect($('cfgPreset'), LLM.PRESETS, 'id', 'name');
    $('zhanti').value = 'general';
    $('guaSelect').value = G.hexByName('乾为天').key;
  }

  // ---------- 起卦 ----------
  function syncFromSiXiang() {
    var f = LY.fromSiXiang(S.siXiang);
    S.lines = f.lines; S.dong = f.dong;
  }
  function renderSixLines() {
    var box = $('sixLines');
    if (!S.lines) { box.innerHTML = '<div class="empty" style="padding:18px">点「一键摇卦」，或在下方指定卦例</div>'; $('guaTag').textContent = '尚未起卦'; return; }
    var NAMES = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' };
    var h = '';
    for (var i = 5; i >= 0; i--) {
      var sx = S.siXiang ? S.siXiang[i] : (S.lines[i] ? 7 : 8);
      var dong = S.dong.indexOf(i) >= 0;
      var sym = S.lines[i] ? '━━━━━' : '━━ ━━';
      h += '<div class="yaoline" data-i="' + i + '">' +
        '<span class="p">' + ['初', '二', '三', '四', '五', '上'][i] + '</span>' +
        '<span class="sym">' + sym + '</span>' +
        '<span class="nm">' + NAMES[sx] + ' <span class="muted">·</span> ' + (S.lines[i] ? '阳' : '阴') + '</span>' +
        '<span class="pill ' + (dong ? 'dong' : '') + '">' + (dong ? '动爻' : '静爻') + '</span></div>';
    }
    box.innerHTML = h;
    box.querySelectorAll('.yaoline').forEach(function (el) { el.onclick = function () { toggleDong(+el.dataset.i); }; });
    var b = G.hexByKey(G.keyOf(S.lines));
    $('guaTag').textContent = b ? b.name + ' · ' + b.palace + '宫' : '自定义';
  }
  function toggleDong(i) {
    if (!S.lines) return;
    if (!S.siXiang) S.siXiang = S.lines.map(function (x) { return x ? 7 : 8; });
    var v = S.siXiang[i];
    var map = { 7: 9, 9: 7, 8: 6, 6: 8 }; // 静↔动，阴阳不变
    S.siXiang[i] = map[v];
    syncFromSiXiang(); renderSixLines(); S.source = '手动调整';
  }
  function roll() {
    S.siXiang = LY.randomSiXiang(); syncFromSiXiang(); S.source = '铜钱摇卦';
    renderSixLines(); toast('已摇卦：' + G.hexByKey(G.keyOf(S.lines)).name + '，动爻 ' + S.dong.length + ' 位');
  }
  function setManualGua() {
    var g = G.hexByKey($('guaSelect').value);
    if (!g) return;
    S.siXiang = null; S.lines = g.lines.slice(); S.dong = []; S.source = '指定卦例';
    renderSixLines();
  }

  // ---------- 预览 ----------
  function renderPreview() {
    try {
      var cal = currentCal();
      $('jiangTag').textContent = cal.yueJiangName + cal.yueJiang + ' 加 ' + cal.timeZhi + '时';
      $('jiangPreview').textContent = cal.yueJiangName + '（' + cal.yueJiang + '）';
      $('shiPreview').textContent = cal.timeGZ + ' · ' + cal.timeZhi + '时';
      $('dayNightPreview').textContent = (cal.timeBranchIdx >= 3 && cal.timeBranchIdx <= 8) ? '昼占' : '夜占';
      $('kongPreview').textContent = cal.xunkong.branches.join('、');
    } catch (e) { $('jiangTag').textContent = e.message; }
  }

  // ---------- 起课 ----------
  function doStart() {
    try {
      var cal = currentCal(), p;
      var zt = $('zhanti').value, note = $('note').value.trim();
      if (S.mode === 'liuyao') {
        if (!S.lines) { toast('请先摇卦或指定卦例'); return; }
        p = LY.paipan({ cal: cal, siXiang: S.siXiang, lines: S.lines, dong: S.dong, zhanti: zt, gender: S.gender, note: note, method: S.source || '铜钱摇卦' });
      } else {
        p = LR.qike({ cal: cal, zhanti: zt, note: note, nianming: $('nianming').value || null,
          xingnian: $('xingnian').value || null, guirenMode: S.prefs.guiren });
      }
      S.pan = p; S.readText = ''; S.reasonText = ''; S.chatHistory = [];
      renderPan(p); renderRead('<div class="empty">起课后点「AI 解读」，将按《增删卜易》《卜筮正宗》《大六壬指南》《御定六壬直指》《六壬断案》义理生成断语。</div>', true);
      $('readState').textContent = '未生成';
      addHistory(p);
      switchView('pan');
      toast('排盘完成：' + (p.engine === 'liuyao' ? p.ben.name : p.jiu.keTi + '课'));
    } catch (e) { console.error('[易课] 起课失败', e); toast('起课失败：' + e.message); }
  }
  function addHistory(p) {
    var title = p.engine === 'liuyao' ? (p.ben.name + (p.bian ? ' 之 ' + p.bian.name : '')) : (p.jiu.keTi + '课 · ' + p.sanchuan.map(function (c) { return c.zhi; }).join(''));
    var id = Date.now();
    S.history.unshift({ id: id, engine: p.engine, title: title, zhanti: p.meta.zhanti, time: p.meta.time, pan: p, readText: '' });
    S.history = S.history.slice(0, 20); S.curHid = id; saveHistory(); renderHistoryMini();
  }
  function syncHistoryRead() {
    if (!S.curHid || !S.readText) return;
    var h = S.history.find(function (x) { return x.id === S.curHid; });
    if (h) { h.readText = S.readText; saveHistory(); }
  }
  function renderHistoryMini() {
    var box = $('historyMini');
    if (!S.history.length) { box.innerHTML = '<div class="empty" style="padding:14px">暂无记录</div>'; return; }
    box.innerHTML = S.history.slice(0, 6).map(function (h) {
      return '<div class="hitem" data-id="' + h.id + '"><div class="hb">' + (h.engine === 'liuyao' ? '爻' : '壬') + '</div>' +
        '<div class="ht"><b>' + esc(h.title) + '</b><span>' + esc(h.zhanti) + ' · ' + esc(h.time) + '</span></div><div class="ha">›</div></div>';
    }).join('');
    box.querySelectorAll('.hitem').forEach(function (el) { el.onclick = function () { openHistory(+el.dataset.id); }; });
  }
  function openHistory(id) {
    var h = S.history.find(function (x) { return x.id === id; });
    if (!h || !h.pan) return;
    S.pan = h.pan; S.readText = h.readText || ''; S.reasonText = ''; S.chatHistory = []; S.curHid = h.id;
    S.mode = h.engine; setMode(h.engine, true);
    renderPan(S.pan);
    renderRead(S.readText ? mdHtml(S.readText) : '<div class="empty">此课尚未生成断语。</div>', true);
    $('readState').textContent = S.readText ? '已生成' : '未生成';
    switchView('pan'); toast('已载入：' + h.title);
  }

  // ---------- 盘面渲染 ----------
  function flagsHtml(flags) {
    return (flags || []).map(function (f) {
      var cls = ['旬空', '月破', '日破', '回头克', '化空', '化破', '化绝', '退神'].indexOf(f) >= 0 ? 'warn' :
        ['暗动', '临日建', '临月建', '世爻', '进神', '回头生'].indexOf(f) >= 0 ? 'good' : '';
      return '<span class="flag ' + cls + '">' + esc(f) + '</span>';
    }).join('');
  }
  function renderPan(p) {
    $('panTitle').textContent = p.engine === 'liuyao' ? '六爻纳甲排盘' : '大六壬课盘';
    var meta = p.meta, h = '';
    h += '<div class="card"><div class="card-head"><h2>' + esc(meta.zhanti) + (meta.note ? ' · ' + esc(meta.note) : '') + '</h2><span class="tag">' + esc(meta.time) + '</span></div>' +
      '<div class="kv-grid">' +
      '<div class="kv"><span>四柱</span><b>' + [meta.yearGZ, meta.monthGZ, meta.dayGZ, meta.timeGZ].join(' ') + '</b></div>' +
      '<div class="kv"><span>月建 / 旬空</span><b>' + esc(meta.yueJian) + ' · ' + esc(meta.xunkong.join('')) + '</b></div>' +
      '<div class="kv"><span>' + (p.engine === 'liuren' ? '月将' : '节气') + '</span><b>' + esc(p.engine === 'liuren' ? meta.yueJiang : (meta.jieqi.prevJie ? meta.jieqi.prevJie.name + '后' : '—')) + '</b></div>' +
      '<div class="kv"><span>旺相休囚死</span><b>' + esc(meta.wangXiang.旺) + '旺 ' + esc(meta.wangXiang.相) + '相</b></div>' +
      '</div></div>';
    h += p.engine === 'liuyao' ? renderLiuyaoPan(p) : renderLiurenPan(p);
    $('panBody').innerHTML = h;

    // 事实卡
    var f = '';
    f += '<div class="sec-title">要点</div>';
    if (p.engine === 'liuyao') {
      if (p.yongshen) f += '<p class="small"><b>用神</b>：' + esc(p.yongshen.liuqin) + '（' + esc(p.yongshen.label) + '，' + esc(p.yongshen.zhi + p.yongshen.wx) + '，' + esc(p.yongshen.state) + '）' +
        (p.yongshen.type === '伏藏' ? '　伏于 ' + esc(p.yongshen.fei) + ' 之下，' + (p.yongshen.keChu ? '有引拔之机' : '受制难出') : '') + '</p>' +
        (p.yongshen.twoXian ? '<p class="small muted">※ 用神两现（' + p.yongshen.candidates.length + ' 处），见《增删卜易·两现章》：古法取旺相动爻不空不破，野鹤另有「舍不空而用旬空」之验。</p>' : '');
      if (p.yuanJi) f += '<p class="small"><b>原神</b> ' + esc(p.yuanJi.原神.wx) + '　<b>忌神</b> ' + esc(p.yuanJi.忌神.wx) + '　<b>仇神</b> ' + esc(p.yuanJi.仇神.wx) + '</p>';
      if (p.fushen.length) f += '<p class="small muted">伏神：' + p.fushen.map(function (v) { return esc(v.liuqin + v.zhi + '伏' + v.label + '（飞' + v.feiZhi + '）' + (v.keChu ? '可出' : '难出')); }).join('；') + '</p>';
      var gi = p.guaInfo;
      f += '<p class="small"><b>全局</b>：动 ' + gi.dongCount + ' 静 ' + gi.jingCount + (gi.duFa ? ' · 独发' : '') + (gi.duJing ? ' · 独静' : '') +
        (p.ben.liuChong ? ' · 六冲' : '') + (p.ben.liuHe ? ' · 六合' : '') + (gi.chongBianHe ? ' · 冲变合' : '') + (gi.heBianChong ? ' · 合变冲' : '') +
        (p.ben.youHun ? ' · 游魂' : '') + (p.ben.guiHun ? ' · 归魂' : '') +
        (gi.fanYin.length ? ' · ' + gi.fanYin.join('/') : '') + (gi.fuYin.length ? ' · ' + gi.fuYin.join('/') : '') + '</p>';
      f += '<div class="sec-title">应期线索</div>' + p.yingqi.map(function (y) {
        return '<p class="small">· ' + esc(y.rule) + ' → ' + esc(y.text) + (y.days.length ? '<br><span class="muted">　如 ' + y.days.slice(0, 3).map(function (d) { return esc(d.gz + ' ' + d.date); }).join('、') + '</span>' : '') + '</p>';
      }).join('');
    } else {
      f += '<p class="small"><b>课体</b>：' + esc(p.jiu.keTi) + (p.jiu.ge ? ' · ' + esc(p.jiu.ge) : '') + '（' + esc(p.jiu.method) + '）</p>';
      f += '<p class="small">' + esc(p.jiu.ketiInfo.tone) + '　' + esc(p.jiu.ketiInfo.gist) + '</p>';
      f += '<p class="small"><b>神煞</b>：日禄' + esc(p.shensha.rilu) + ' · 驿马' + esc(p.shensha.yima) + ' · 桃花' + esc(p.shensha.taohua) + ' · 旬丁' + esc(p.shensha.dingma) + ' · 日墓' + esc(p.shensha.ridemu) + '</p>';
      f += '<p class="small"><b>贵人</b>：' + esc(p.shensha.tianyi) + '（' + esc(p.shensha.tianyiType) + '），临地盘' + esc(p.tianjiang.guirenGong) + '，天将' + (p.tianjiang.shun ? '顺布' : '逆布') + '</p>';
      if (p.nianming) f += '<p class="small"><b>本命</b> ' + esc(p.nianming.zhi) + '：上神 ' + esc(p.nianming.shangShen) + ' 乘 ' + esc(p.nianming.tianjiang) + (p.nianming.yuChu ? '，与初传' + esc(p.nianming.yuChu) : '') + '</p>';
      f += '<p class="small"><b>占题类神</b>：' + esc(p.leishen.join('、')) + '</p>';
    }
    f += '<p class="small muted" style="margin-top:10px">离线规则倾向：<b>' + esc(p.local.verdict) + '</b>（评分 ' + p.local.score + '）。完整断语见「解读」页。</p>';
    $('panFacts').innerHTML = f;

    $('panEvidence').innerHTML = '<div class="sec-title">本课适用的经典条文</div>' + (p.evidence || []).map(function (t) {
      return '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="small" style="color:var(--gold);font-weight:600">' + esc(t.book) + '</span> ' +
        '<code class="small muted">[' + esc(t.id) + ']</code><div class="small" style="margin-top:3px">' + esc(t.gist) + '</div></div>';
    }).join('');
  }
  function renderLiuyaoPan(p) {
    var h = '<div class="card"><div class="card-head"><h2>' + esc(p.ben.name) + '</h2><span class="tag">' + esc(p.ben.palace + '宫 · ' + p.ben.gongName + ' · ' + p.ben.palaceWx) + '</span></div>';
    h += '<p class="small muted" style="margin:0 0 8px">变卦：' + esc(p.bian ? p.bian.name + '（' + p.bian.palace + '宫·' + p.bian.gongName + '）' : '无（六爻皆静）') + '　世' + p.ben.shi + ' 应' + p.ben.ying + '</p>';
    h += '<table class="pan-table"><thead><tr><th>六神</th><th>爻</th><th>本卦</th><th>状态</th><th>动变</th></tr></thead><tbody>';
    for (var i = 5; i >= 0; i--) {
      var a = p.yao[i], b = a.ben;
      h += '<tr class="' + (a.dong ? 'dong' : a.shi ? 'shi' : '') + '">' +
        '<td class="small">' + esc(a.liushen) + '</td>' +
        '<td class="small">' + esc(a.label) + (a.shi ? '<span class="pill shi">世</span>' : a.ying ? '<span class="pill">应</span>' : '') + '</td>' +
        '<td><span class="zhi">' + esc(b.gan + b.zhi) + '</span> <span class="small">' + esc(b.wx + '·' + b.liuqin) + '</span></td>' +
        '<td class="small">' + esc(b.state + '·' + b.changsheng) + '<br>' + flagsHtml(a.flags) + '</td>' +
        '<td class="small">' + (a.bian ? '<span class="zhi">' + esc(a.bian.gan + a.bian.zhi) + '</span> ' + esc(a.bian.wx + '·' + a.bian.liuqin) + '<br>' + a.bian.relations.map(function (r) { return '<span class="flag ' + (['回头克', '化空', '化破', '化绝', '退神', '爻反吟'].indexOf(r) >= 0 ? 'warn' : ['回头生', '进神', '化长生'].indexOf(r) >= 0 ? 'good' : '') + '">' + esc(r) + '</span>'; }).join('') : '<span class="muted">静</span>') + '</td></tr>';
    }
    h += '</tbody></table></div>';
    return h;
  }
  function renderLiurenPan(p) {
    var h = '<div class="card"><div class="card-head"><h2>天地盘 · ' + esc(p.jiu.keTi) + (p.jiu.ge ? '·' + esc(p.jiu.ge) : '') + '</h2><span class="tag">' + esc(p.pan.fuYin ? '伏吟' : p.pan.fanYin ? '返吟' : '常盘') + '</span></div>';
    h += '<div class="small muted">' + esc(p.meta.yueJiang) + ' 加 ' + esc(p.pan.shiZhi) + '时　干寄 ' + esc(p.pan.jiGong) + '　四课 ' + p.pan.keCount + ' 课' + (p.pan.buBei ? '（不备）' : '') + (p.pan.baZhuan ? '（八专）' : '') + '</div>';
    h += '<div class="ren-grid">';
    for (var i = 0; i < 12; i++) {
      var gz = p.pan.diPan[i], tz = p.pan.tianPan[i];
      var j = p.tianjiang.mapping[C.bIdx(tz)] || '';
      var hl = p.sanchuan.some(function (c) { return c.zhi === tz; });
      var gu = tz === p.tianjiang.guirenZhi;
      h += '<div class="ren-cell ' + (hl ? 'hl' : '') + ' ' + (gu ? 'gu' : '') + '"><div class="g">' + esc(gz) + '</div><div class="t">' + esc(tz) + '</div><div class="j">' + esc(j) + '</div></div>';
    }
    h += '</div><div class="small muted">上排天盘、下排地盘；' +
      '<span style="color:var(--red)">朱框为三传</span>，<span style="color:var(--gold)">金框为贵人</span>。</div></div>';

    h += '<div class="card"><div class="card-head"><h2>四课</h2><span class="tag">克贼 ' + p.jiu.keZeiCount + ' 处</span></div><div class="sike-row">';
    [3, 2, 1, 0].forEach(function (idx) {
      var k = p.sikes[idx];
      h += '<div class="sike"><span class="l">' + esc(k.name) + '</span><span class="u">' + esc(k.upper) + '</span>' +
        (k.keZei ? '<span class="flag warn">' + esc(k.keZei) + '</span>' : '') +
        '<span class="d">' + esc(k.lowerLabel) + '</span><span class="j">' + esc(k.tianjiang) + (k.kong ? '·空' : '') + '</span></div>';
    });
    h += '</div><div class="small muted" style="margin-top:8px">自左至右：四课、三课、二课、一课（传统由右向左读）</div></div>';

    h += '<div class="card"><div class="card-head"><h2>三传</h2><span class="tag">' + esc(p.jiu.method) + '</span></div><div class="chuan-row">';
    p.sanchuan.forEach(function (c) {
      h += '<div class="chuan ' + (c.kong ? 'kong' : '') + '"><div class="n">' + esc(c.name) + '</div>' +
        '<div class="z">' + esc(c.zhi) + '</div><div class="j">' + esc(c.tianjiang) + '</div>' +
        '<div class="d">' + esc((c.dunGan || '○') + c.zhi + ' · ' + c.liuqin + ' · ' + c.wx) + '<br>' + esc(c.state) + (c.kong ? ' · 旬空' : '') + '</div></div>';
    });
    h += '</div>';
    if (p.sanhe) h += '<p class="small muted">三传成 <b>' + esc(p.sanhe.wx) + '</b> 局（' + esc(p.sanhe.branches.join('、')) + '）。</p>';
    h += '</div>';
    return h;
  }

  // ---------- 解读 ----------
  function mdHtml(src) {
    var lines = String(src).replace(/\r/g, '').split('\n'), out = [], inUl = false, inQuote = false;
    function close() { if (inUl) { out.push('</ul>'); inUl = false; } if (inQuote) { out.push('</blockquote>'); inQuote = false; } }
    function inline(t) {
      return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }
    lines.forEach(function (ln) {
      var s = ln.trim();
      if (/^##\s+/.test(s)) { close(); out.push('<h2>' + inline(s.replace(/^##\s+/, '')) + '</h2>'); return; }
      if (/^###\s+/.test(s)) { close(); out.push('<h2>' + inline(s.replace(/^###\s+/, '')) + '</h2>'); return; }
      if (/^>\s?/.test(s)) { if (inUl) { out.push('</ul>'); inUl = false; } if (!inQuote) { out.push('<blockquote>'); inQuote = true; } out.push(inline(s.replace(/^>\s?/, ''))); return; }
      if (/^[-*]\s+/.test(s)) { if (inQuote) { out.push('</blockquote>'); inQuote = false; } if (!inUl) { out.push('<ul>'); inUl = true; } out.push('<li>' + inline(s.replace(/^[-*]\s+/, '')) + '</li>'); return; }
      if (!s) { close(); return; }
      close(); out.push('<p>' + inline(s) + '</p>');
    });
    close();
    return out.join('');
  }
  function renderRead(html, raw) {
    var el = $('readBody');
    var prev = el.querySelector('.think');
    var wasOpen = prev ? prev.open : false;
    var head = '';
    if (S.reasonText) {
      head = '<details class="think fold"' + (wasOpen ? ' open' : '') + '>' +
        '<summary>模型思考过程 · ' + S.reasonText.length + ' 字（不计入断语与追问）</summary>' +
        '<div class="think-body">' + esc(S.reasonText) + '</div></details>';
    }
    el.innerHTML = head + (raw ? html : mdHtml(html));
  }
  function setReadState(s) { $('readState').textContent = s; }
  function runAI(question) {
    if (!S.pan) { toast('请先起课排盘'); return; }
    if (S.streaming) { toast('正在生成中，请先停止'); return; }
    var cfg = S.cfg;
    var msgs = LLM.buildMessages(S.pan, question, S.chatHistory);
    S.streaming = true; S.readText = ''; S.reasonText = '';
    renderRead('<span class="cursor"></span>', true);
    setReadState('生成中…'); $('stopBtn').hidden = false; $('aiBtn').disabled = true;
    S.cancelFn = LLM.request(cfg, msgs, {
      onDelta: function (t) {
        S.readText += t;
        renderRead(mdHtml(S.readText) + '<span class="cursor"></span>', true);
      },
      onReasoning: function (t) {
        S.reasonText += t;
        var box = $('readBody').querySelector('.think-body');
        if (box) box.textContent = S.reasonText;
        else renderRead(mdHtml(S.readText) + '<span class="cursor"></span>', true);
      },
      onDone: function (d) {
        d = d || {};
        S.streaming = false; $('stopBtn').hidden = true; $('aiBtn').disabled = false;
        var tail = '';
        if (d.truncated) tail += '<blockquote>⚠ 输出被 Token 上限截断（finish_reason=length）。请到「设置」把上限调至 8192 或 16384 后重新解读；推理模型还需为思维链留出额度。</blockquote>';
        if (d.usage) tail += '<p class="usage">本次用量：' + esc(d.usage) + '｜上限 ' + S.cfg.maxTokens + '</p>';
        renderRead(mdHtml(S.readText) + tail, true);
        setReadState(d.truncated ? '已生成（有截断）' : '已生成');
        S.chatHistory.push({ role: 'user', content: question || '请依经典义理完整解读此盘' });
        S.chatHistory.push({ role: 'assistant', content: S.readText });
        syncHistoryRead(); toast(d.truncated ? '解读完成，但输出被截断' : '解读完成');
      },
      onError: function (e) {
        S.streaming = false; $('stopBtn').hidden = true; $('aiBtn').disabled = false;
        setReadState('失败');
        renderRead('<blockquote>' + esc(e) + '</blockquote><p>可点「本地规则」查看离线推演，或到「设置」检查接口配置。</p>', true);
        toast('调用失败：' + e);
      }
    });
  }
  function runLocal() {
    if (!S.pan) { toast('请先起课排盘'); return; }
    S.readText = LLM.localFallback(S.pan); S.reasonText = '';
    renderRead(mdHtml(S.readText), true); setReadState('离线规则');
    syncHistoryRead(); toast('已生成离线规则解读');
  }

  // ---------- 经典 ----------
  function renderClassics() {
    var groups = ['全部', '卜筮正宗', '增删卜易', '大六壬指南', '御定六壬直指', '六壬断案', '九宗门', '毕法赋', '起例'];
    $('classicChips').innerHTML = groups.map(function (g) { return '<button class="chip ' + (S.classicFilter === g ? 'active' : '') + '" data-g="' + g + '">' + g + '</button>'; }).join('');
    $('classicChips').querySelectorAll('.chip').forEach(function (b) {
      b.onclick = function () { S.classicFilter = b.dataset.g; renderClassics(); };
    });
    var list = K.TEXTS.filter(function (t) {
      return S.classicFilter === '全部' || t.book.indexOf(S.classicFilter) >= 0 ||
        (S.classicFilter === '起例' && (t.id.indexOf('GRJQ') === 0 || t.id.indexOf('YZLZZ-QL') === 0));
    });
    $('classicCount').textContent = list.length + ' 条';
    $('classicList').innerHTML = list.map(function (t) {
      return '<div class="cls"><div><span class="src">' + esc(t.book) + '</span><span class="id">' + esc(t.id) + '</span></div>' +
        (t.quote ? '<div class="q">' + esc(t.quote) + '</div>' : '') +
        '<div class="g">' + esc(t.gist) + '</div><div class="tags">' + t.tags.map(function (g) { return '<span class="pill">' + esc(g) + '</span>'; }).join('') + '</div></div>';
    }).join('');
  }

  // ---------- 设置 ----------
  function fillCfg() {
    var c = S.cfg, p = S.prefs;
    $('cfgPreset').value = c.preset; $('cfgBase').value = c.baseUrl; $('cfgKey').value = c.apiKey;
    $('cfgModel').value = c.model; $('cfgTemp').value = c.temperature; $('cfgMax').value = c.maxTokens;
    $('cfgTokenParam').value = c.tokenParam || 'auto'; $('cfgReasoning').checked = !!c.reasoning;
    $('cfgTemp').disabled = !!c.reasoning;
    $('cfgStream').checked = !!c.stream; $('presetTip').textContent = LLM.presetOf(c.preset).tip || '';
    $('cfgLon').value = p.lon; $('cfgTST').checked = !!p.tst; $('cfgLateZi').checked = !!p.lateZi;
    $('cfgGuiren').value = p.guiren; $('huoshi').value = p.huoshi || '';
  }
  function updateBadge() {
    var b = $('apiBadge');
    if (S.cfg && S.cfg.apiKey) { b.textContent = 'AI 已配置'; b.classList.add('on'); }
    else { b.textContent = '离线排盘'; b.classList.remove('on'); }
  }
  function saveCfg() {
    var tp = parseFloat($('cfgTemp').value); if (!isFinite(tp)) tp = 0.6;
    var c = {
      preset: $('cfgPreset').value, baseUrl: $('cfgBase').value.trim(), apiKey: $('cfgKey').value.trim(),
      model: $('cfgModel').value.trim(), temperature: tp,
      maxTokens: LLM.clampTokens(parseInt($('cfgMax').value, 10)),
      tokenParam: $('cfgTokenParam').value, reasoning: $('cfgReasoning').checked,
      stream: $('cfgStream').checked
    };
    $('cfgMax').value = c.maxTokens;
    LLM.saveCfg(c); S.cfg = c; updateBadge(); toast('配置已保存（仅存本机）');
  }
  function savePrefs() {
    S.prefs = {
      lon: parseFloat($('cfgLon').value) || 120, tst: $('cfgTST').checked,
      lateZi: $('cfgLateZi').checked, guiren: $('cfgGuiren').value, huoshi: $('huoshi').value
    };
    LLM.Storage.set('app_prefs', JSON.stringify(S.prefs)); renderPreview(); toast('历法设置已保存');
  }
  function testCfg() {
    saveCfg();
    $('testResult').textContent = '正在测试…';
    LLM.test(S.cfg, function (ok, msg) { $('testResult').textContent = (ok ? '✓ ' : '✗ ') + msg; toast(ok ? '连接正常' : '连接失败'); });
  }
  function copyText(t) {
    if (window.NativeLLM && window.NativeLLM.copy) { window.NativeLLM.copy(t); toast('已复制到剪贴板'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制'); }, function () { legacyCopy(t); });
    } else legacyCopy(t);
  }
  function legacyCopy(t) {
    var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请长按选择文本'); }
    document.body.removeChild(a);
  }

  // ---------- 模式 ----------
  function setMode(m, silent) {
    S.mode = m;
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
    $('liuyaoCard').hidden = (m !== 'liuyao'); $('liurenCard').hidden = (m !== 'liuren');
    $('genderRow').hidden = ($('zhanti').value !== 'marriage' || m !== 'liuyao');
    if (!silent) renderPreview();
  }

  // ---------- 绑定 ----------
  function bind() {
    document.querySelectorAll('#tabbar button').forEach(function (b) { b.onclick = function () { switchView(b.dataset.view); }; });
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });
    document.querySelectorAll('#genderSeg button').forEach(function (b) {
      b.onclick = function () { S.gender = b.dataset.v; document.querySelectorAll('#genderSeg button').forEach(function (x) { x.classList.toggle('active', x === b); }); };
    });
    $('zhanti').onchange = function () {
      $('ztNote').textContent = G.ZHANTI.find(function (z) { return z.id === $('zhanti').value; }).note;
      $('genderRow').hidden = ($('zhanti').value !== 'marriage' || S.mode !== 'liuyao');
    };
    $('nowBtn').onclick = function () { $('dt').value = fmtDt(new Date()); renderPreview(); };
    $('dt').onchange = renderPreview;
    $('rollBtn').onclick = roll;
    $('clearBtn').onclick = function () { S.siXiang = null; S.lines = null; S.dong = []; S.source = ''; renderSixLines(); };
    $('guaSelect').onchange = setManualGua;
    $('huoshi').onchange = function () { S.prefs.huoshi = $('huoshi').value; renderPreview(); };
    $('nianming').onchange = renderPreview;
    $('startBtn').onclick = doStart;
    $('copyPan').onclick = function () { if (S.pan) copyText(S.pan.textPan); else toast('尚未起课'); };
    $('aiBtn').onclick = function () { runAI(''); };
    $('localBtn').onclick = runLocal;
    $('stopBtn').onclick = function () { if (S.cancelFn) S.cancelFn(); S.streaming = false; $('stopBtn').hidden = true; $('aiBtn').disabled = false; setReadState('已停止'); };
    $('askBtn').onclick = function () { var q = $('askInput').value.trim(); if (!q) { toast('请输入追问内容'); return; } $('askInput').value = ''; runAI(q); };
    $('askInput').onkeydown = function (e) { if (e.key === 'Enter') $('askBtn').click(); };
    $('copyRead').onclick = function () { if (S.readText) copyText(S.readText); else toast('尚无断语'); };
    $('shareRead').onclick = function () {
      if (!S.readText) { toast('尚无断语'); return; }
      if (window.NativeLLM && window.NativeLLM.share) window.NativeLLM.share(S.readText);
      else copyText(S.readText);
    };
    $('cfgPreset').onchange = function () {
      var p = LLM.presetOf($('cfgPreset').value);
      $('cfgBase').value = p.baseUrl; $('cfgModel').value = p.model; $('presetTip').textContent = p.tip || '';
      if (p.maxTokens) $('cfgMax').value = p.maxTokens;
      $('cfgReasoning').checked = !!p.reasoning;
      $('cfgTokenParam').value = p.tokenParam || 'auto';
      $('cfgTemp').disabled = !!p.reasoning;
    };
    $('cfgReasoning').onchange = function () {
      $('cfgTemp').disabled = this.checked;
      if (this.checked && (parseInt($('cfgMax').value, 10) || 0) < 8192) {
        $('cfgMax').value = 8192;
        toast('推理模型的思维链同样计入上限，已调至 8192');
      }
    };
    $('saveCfg').onclick = saveCfg; $('testCfg').onclick = testCfg; $('savePrefs').onclick = savePrefs;
    $('clearHistory').onclick = function () { S.history = []; saveHistory(); renderHistoryMini(); toast('已清空历史'); };
  }

  function init() {
    S.prefs = loadPrefs() || DEF_PREFS;
    S.cfg = LLM.loadCfg() || LLM.DEFAULT_CFG;
    S.history = loadHistory();
    if (!Array.isArray(S.history)) S.history = [];
    initSelects(); bind();
    $('dt').value = fmtDt(new Date());
    $('ztNote').textContent = G.ZHANTI[0].note;
    $('huoshi').value = S.prefs.huoshi || '';
    renderSixLines(); renderPreview(); renderHistoryMini(); updateBadge(); renderClassics();
    setMode('liuyao', true);
    if (window.NativeLLM && window.NativeLLM.getVersion) document.title = '易课 ' + window.NativeLLM.getVersion();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
