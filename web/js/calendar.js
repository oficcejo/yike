/* ============================================================
 * calendar.js — 历法与干支基础层
 * 依据：寿星天文历节气表（构建期由 lunar-python 精确生成）、
 *       《御定六壬直指·卷上·起例》月将过宫、五虎遁/五鼠遁、
 *       京房纳甲体系通用的旺相休囚死与十二长生。
 * 全部计算使用「北京时间线性分钟数」，不依赖设备本地时区。
 * ============================================================ */
(function (root) {
  'use strict';

  var DATA = root.JIEQI_DATA || (typeof require === 'function' ? require('./jieqi_data.js') : {});
  var NAMES = root.JIEQI_NAMES || DATA.JIEQI_NAMES;
  var DAY_OFFSET = (root.JIEQI_DAY_OFFSET != null) ? root.JIEQI_DAY_OFFSET : DATA.JIEQI_DAY_OFFSET;
  var TABLE = DATA.JIEQI_DATA || DATA;

  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var GAN_WX = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
  var ZHI_WX = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
  var ZHI_YANG = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  var WX = ['木', '火', '土', '金', '水'];
  var WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  var WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  var WX_BEISHENG = { 火: '木', 土: '火', 金: '土', 水: '金', 木: '水' };
  var WX_BEIKE = { 土: '木', 水: '土', 火: '水', 金: '火', 木: '金' };

  var LIUHE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
  var LIUHE_WX = { 子: '土', 丑: '土', 寅: '木', 亥: '木', 卯: '火', 戌: '火', 辰: '金', 酉: '金', 巳: '水', 申: '水', 午: '土', 未: '土' };
  var LIUCHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
  var LIUHAI = { 子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅', 卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉' };
  var SANHE = [
    { branches: ['申', '子', '辰'], wx: '水' },
    { branches: ['亥', '卯', '未'], wx: '木' },
    { branches: ['寅', '午', '戌'], wx: '火' },
    { branches: ['巳', '酉', '丑'], wx: '金' }
  ];
  var XING = { 子: '卯', 卯: '子', 寅: '巳', 巳: '申', 申: '寅', 丑: '戌', 戌: '未', 未: '丑', 辰: '辰', 午: '午', 酉: '酉', 亥: '亥' };
  var CHANGSHENG_START = { 木: 11, 火: 2, 金: 5, 水: 8, 土: 8 }; // 水土同宫，长生在申
  var CHANGSHENG_NAMES = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];

  // 月建：以「节」换月（《御定六壬直指·起例》、通行干支历）
  var JIE_BRANCH = { 小寒: 1, 立春: 2, 惊蛰: 3, 清明: 4, 立夏: 5, 芒种: 6, 小暑: 7, 立秋: 8, 白露: 9, 寒露: 10, 立冬: 11, 大雪: 0 };
  // 月将：以「中气」太阳过宫（《梦溪笔谈》「当从太阳过宫」；大六壬通行起例）
  var ZHONG_JIANG = { 雨水: 11, 春分: 10, 谷雨: 9, 小满: 8, 夏至: 7, 大暑: 6, 处暑: 5, 秋分: 4, 霜降: 3, 小雪: 2, 冬至: 1, 大寒: 0 };
  var JIANG_NAME = ['神后', '大吉', '功曹', '太冲', '天罡', '太乙', '胜光', '小吉', '传送', '从魁', '河魁', '登明'];
  var JIE_NAMES = Object.keys(JIE_BRANCH);
  var ZHONG_NAMES = Object.keys(ZHONG_JIANG);

  function mod(n, m) { return ((n % m) + m) % m; }
  function bIdx(b) { return typeof b === 'number' ? b : ZHI.indexOf(b); }
  function gIdx(g) { return typeof g === 'number' ? g : GAN.indexOf(g); }

  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12), y2 = y + 4800 - a, m2 = m + 12 * a - 3;
    return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
  }
  function civilFromJdn(jd) {
    var a = jd + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
    var d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4);
    var m = Math.floor((5 * e + 2) / 153);
    return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
  }
  function mins(y, m, d, h, mi) { return jdn(y, m, d) * 1440 + h * 60 + mi; }
  function parts(ts) {
    var jd = Math.floor(ts / 1440), md = mod(ts, 1440), c = civilFromJdn(jd);
    return { y: c.y, m: c.m, d: c.d, h: Math.floor(md / 60), mi: md % 60, jd: jd, md: md };
  }
  function fmtTime(ts) {
    var p = parts(ts);
    return p.y + '-' + pad(p.m) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(p.mi);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 取某年 24 节气（分钟数）
  function jieqiYear(y) {
    var s = TABLE[String(y)];
    if (!s) return [];
    var out = [];
    for (var i = 0; i < 24; i++) {
      var p = s.substr(i * 8, 8);
      out.push({
        name: NAMES[i], ts: mins(y, +p.slice(0, 2), +p.slice(2, 4), +p.slice(4, 6), +p.slice(6, 8)),
        y: y, month: +p.slice(0, 2), day: +p.slice(2, 4), hour: +p.slice(4, 6), minute: +p.slice(6, 8)
      });
    }
    return out;
  }
  function timeline(y) {
    var all = [];
    for (var k = y - 1; k <= y + 1; k++) all = all.concat(jieqiYear(k));
    return all.sort(function (a, b) { return a.ts - b.ts; });
  }
  function prevOf(list, ts, names) {
    var r = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].ts <= ts && (!names || names.indexOf(list[i].name) >= 0)) r = list[i];
      else if (list[i].ts > ts) break;
    }
    return r;
  }
  function nextOf(list, ts, names) {
    for (var i = 0; i < list.length; i++)
      if (list[i].ts > ts && (!names || names.indexOf(list[i].name) >= 0)) return list[i];
    return null;
  }

  function gz(idx) { return GAN[mod(idx, 10)] + ZHI[mod(idx, 12)]; }
  function gzIndex(gan, zhi) {
    var g = gIdx(gan), z = bIdx(zhi);
    for (var i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) return i;
    return -1;
  }
  function xunkong(dayIdx) {
    var xunShou = Math.floor(mod(dayIdx, 60) / 10) * 10;
    var b = mod(xunShou, 12);
    return { xun: gz(xunShou), branches: [ZHI[mod(b + 10, 12)], ZHI[mod(b + 11, 12)]] };
  }
  function wangXiang(yueBranch) {
    var w = ZHI_WX[bIdx(yueBranch)];
    return {
      旺: w, 相: WX_SHENG[w], 休: WX_BEISHENG[w], 囚: WX_BEIKE[w], 死: WX_KE[w]
    };
  }
  function wangState(element, yueBranch) {
    var m = wangXiang(yueBranch);
    for (var k in m) if (m[k] === element) return k;
    return '';
  }
  function wxRelation(a, b) { // a 相对 b 的关系：a 对 b 做什么
    if (a === b) return '比和';
    if (WX_SHENG[a] === b) return '生';       // a 生 b
    if (WX_KE[a] === b) return '克';          // a 克 b
    if (WX_SHENG[b] === a) return '被生';
    if (WX_KE[b] === a) return '被克';
    return '';
  }
  function relation(a, b) { // a 受 b 的作用
    if (a === b) return '比和';
    if (WX_SHENG[b] === a) return '得生';
    if (WX_KE[b] === a) return '受克';
    if (WX_SHENG[a] === b) return '泄气';
    if (WX_KE[a] === b) return '克制';
    return '';
  }
  function changSheng(element, branch, yang) {
    var start = CHANGSHENG_START[element], b = bIdx(branch);
    var i = yang ? mod(b - start, 12) : mod(start - b, 12);
    return { stage: CHANGSHENG_NAMES[i], index: i, name: CHANGSHENG_NAMES[i] };
  }
  function muBranch(element) {
    var start = CHANGSHENG_START[element];
    return ZHI[mod(start + 8, 12)]; // 阳顺行第八位为墓；墓支对阴阳一致
  }
  function heChong(a, b) {
    var A = typeof a === 'number' ? ZHI[a] : a, B = typeof b === 'number' ? ZHI[b] : b;
    if (LIUCHONG[A] === B) return '冲';
    if (LIUHE[A] === B) return '合';
    if (XING[A] === B) return '刑';
    if (LIUHAI[A] === B) return '害';
    return '';
  }
  function sanHeOf(branches) {
    for (var i = 0; i < SANHE.length; i++) {
      var g = SANHE[i], n = 0;
      for (var j = 0; j < branches.length; j++) if (g.branches.indexOf(typeof branches[j] === 'number' ? ZHI[branches[j]] : branches[j]) >= 0) n++;
      if (n === 3) return g;
    }
    return null;
  }

  /**
   * 主计算：返回完整历法上下文
   * opts: { longitude, trueSolarTime, lateZiNextDay }
   */
  function compute(y, m, d, h, mi, opts) {
    opts = opts || {};
    var lon = opts.longitude == null ? 120 : +opts.longitude;
    var tst = !!opts.trueSolarTime;
    var lateZiNext = opts.lateZiNextDay !== false;
    var bj = mins(y, m, d, h, mi);
    var tl = timeline(y);

    var prevJie = prevOf(tl, bj, JIE_NAMES), nextJie = nextOf(tl, bj, JIE_NAMES);
    var prevZhong = prevOf(tl, bj, ZHONG_NAMES), nextZhong = nextOf(tl, bj, ZHONG_NAMES);
    var lichun = null;
    for (var i = 0; i < tl.length; i++) if (tl[i].name === '立春' && tl[i].y === y) lichun = tl[i];
    var yearUsed = (lichun && bj < lichun.ts) ? y - 1 : y;
    var yearIdx = mod(yearUsed - 4, 60);
    var yearGZ = gz(yearIdx);
    var yearGan = mod(yearIdx, 10), yearZhi = mod(yearIdx, 12);

    // 月建 / 月干（五虎遁）
    var monthZhi = prevJie ? JIE_BRANCH[prevJie.name] : 2;
    var yinGan = [2, 4, 6, 8, 0][mod(yearGan, 5)]; // 五虎遁：甲己丙、乙庚戊、丙辛庚、丁壬壬、戊癸甲
    var monthGan = mod(yinGan + mod(monthZhi - 2, 12), 10);
    var monthGZ = GAN[monthGan] + ZHI[monthZhi];

    // 月将（中气过宫）
    var jiangZhi = prevZhong ? ZHONG_JIANG[prevZhong.name] : 0;

    // 真太阳时：只用于定时辰与换日；节气比较仍用历书北京时间
    var solar = bj + (tst ? Math.round((lon - 120) * 4) : 0);
    var dayJd = Math.floor(solar / 1440), minOfDay = mod(solar, 1440);
    var timeZhi = mod(Math.floor((minOfDay + 60) / 120), 12);
    var lateZi = minOfDay >= 1380;
    var finalJd = dayJd + ((lateZi && lateZiNext) ? 1 : 0);
    var dayIdx = mod(finalJd + DAY_OFFSET, 60);
    var dayGZ = gz(dayIdx), dayGan = mod(dayIdx, 10), dayZhi = mod(dayIdx, 12);
    var timeGan = mod(mod(dayGan, 5) * 2 + timeZhi, 10);
    var timeGZ = GAN[timeGan] + ZHI[timeZhi];

    var cp = civilFromJdn(finalJd);
    return {
      input: { y: y, m: m, d: d, h: h, mi: mi, longitude: lon, trueSolarTime: tst, lateZiNextDay: lateZiNext },
      beijingTime: fmtTime(bj), trueSolarTime: fmtTime(solar), dayShifted: finalJd !== jdn(y, m, d),
      yearGZ: yearGZ, yearGan: GAN[yearGan], yearZhi: ZHI[yearZhi], yearIdx: yearIdx,
      monthGZ: monthGZ, monthGan: GAN[monthGan], monthZhi: ZHI[monthZhi], yueJian: ZHI[monthZhi],
      dayGZ: dayGZ, dayGan: GAN[dayGan], dayZhi: ZHI[dayZhi], dayIdx: dayIdx,
      timeGZ: timeGZ, timeGan: GAN[timeGan], timeZhi: ZHI[timeZhi], timeBranchIdx: timeZhi,
      lateZi: lateZi,
      jieqi: { prevJie: prevJie && { name: prevJie.name, time: fmtTime(prevJie.ts) }, nextJie: nextJie && { name: nextJie.name, time: fmtTime(nextJie.ts) },
               prevZhong: prevZhong && { name: prevZhong.name, time: fmtTime(prevZhong.ts) }, nextZhong: nextZhong && { name: nextZhong.name, time: fmtTime(nextZhong.ts) } },
      yueJiang: ZHI[jiangZhi], yueJiangName: JIANG_NAME[jiangZhi], yueJiangIdx: jiangZhi,
      xunkong: xunkong(dayIdx), wangXiang: wangXiang(monthZhi),
      season: (function () { var z = monthZhi; return (z >= 2 && z <= 4) ? '春' : (z >= 5 && z <= 7) ? '夏' : (z >= 8 && z <= 10) ? '秋' : '冬'; })(),
      civilDay: cp
    };
  }

  var API = {
    GAN: GAN, ZHI: ZHI, GAN_WX: GAN_WX, ZHI_WX: ZHI_WX, ZHI_YANG: ZHI_YANG, WX: WX,
    WX_SHENG: WX_SHENG, WX_KE: WX_KE, WX_BEISHENG: WX_BEISHENG, WX_BEIKE: WX_BEIKE,
    LIUHE: LIUHE, LIUHE_WX: LIUHE_WX, LIUCHONG: LIUCHONG, LIUHAI: LIUHAI, XING: XING, SANHE: SANHE,
    CHANGSHENG_START: CHANGSHENG_START, CHANGSHENG_NAMES: CHANGSHENG_NAMES,
    JIE_BRANCH: JIE_BRANCH, ZHONG_JIANG: ZHONG_JIANG, JIANG_NAME: JIANG_NAME,
    YUEJIANG_TABLE: { 雨水: '亥·登明', 春分: '戌·河魁', 谷雨: '酉·从魁', 小满: '申·传送', 夏至: '未·小吉', 大暑: '午·胜光', 处暑: '巳·太乙', 秋分: '辰·天罡', 霜降: '卯·太冲', 小雪: '寅·功曹', 冬至: '丑·大吉', 大寒: '子·神后' },
    mod: mod, bIdx: bIdx, gIdx: gIdx, jdn: jdn, civilFromJdn: civilFromJdn, mins: mins, parts: parts, fmtTime: fmtTime, pad: pad,
    gz: gz, gzIndex: gzIndex, xunkong: xunkong, wangXiang: wangXiang, wangState: wangState,
    wxRelation: wxRelation, relation: relation, changSheng: changSheng, muBranch: muBranch,
    heChong: heChong, sanHeOf: sanHeOf, jieqiYear: jieqiYear, timeline: timeline, compute: compute
  };
  root.Calendar = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
