/* 核心引擎回归测试：node tools/test_core.js */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', 'web', 'js');
const D = require(path.join(ROOT, 'jieqi_data.js'));
const C = require(path.join(ROOT, 'calendar.js'));
const G = require(path.join(ROOT, 'data.js'));
const K = require(path.join(ROOT, 'classics.js'));
const LY = require(path.join(ROOT, 'liuyao.js'));
const LR = require(path.join(ROOT, 'liuren.js'));
const LLM = require(path.join(ROOT, 'llm.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function section(s) { console.log('\n=== ' + s + ' ==='); }

// ---------- 1. 历法 ----------
section('历法与干支基准（对照 lunar-python 精确节气历）');
D.GANZHI_SAMPLES.forEach(s => {
  const [date, time] = s.t.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const c = C.compute(y, m, d, h, mi, {});
  const got = [c.yearGZ, c.monthGZ, c.dayGZ, c.timeGZ].join(' ');
  const exp = [s.year, s.month, s.day, s.time].join(' ');
  ok(s.t + ' ' + exp, got === exp, got);
});
const jd = C.jdn(2026, 11, 7);
ok('JDN 往返', JSON.stringify(C.civilFromJdn(jd)) === JSON.stringify({ y: 2026, m: 11, d: 7 }));
const cur = C.compute(2026, 11, 7, 9, 34, {});
ok('当前月建（寒露后立冬前）', cur.yueJian === '戌', cur.yueJian);
ok('当前月将（霜降中气后）', cur.yueJiangName === '太冲' && cur.yueJiang === '卯', cur.yueJiangName + cur.yueJiang);
ok('旬空', cur.xunkong.branches.join('') === '午未', cur.xunkong.branches.join(''));
ok('真太阳时修正（东经 90 比北京时间回退 2 小时，巳时→辰时）',
  C.compute(2026, 11, 7, 10, 30, { longitude: 90, trueSolarTime: true }).timeZhi === '辰',
  C.compute(2026, 11, 7, 10, 30, { longitude: 90, trueSolarTime: true }).timeZhi);

// ---------- 2. 六十四卦 ----------
section('京房八宫 / 纳甲 / 世应');
ok('64 卦且卦名唯一', G.HEX.list.length === 64 && new Set(G.HEX.list.map(g => g.name)).size === 64);
const qian = G.hexByName('乾为天');
ok('乾宫八卦序', G.HEX.list.filter(g => g.palace === '乾').map(g => g.name).join(',') ===
  '乾为天,天风姤,天山遁,天地否,风地观,山地剥,火地晋,火天大有');
ok('乾为天纳甲六亲', qian.yao.map(y => y.gan + y.zhi + y.liuqin).join(' ') ===
  '甲子子孙 甲寅妻财 甲辰父母 壬午官鬼 壬申兄弟 壬戌父母');
ok('乾为天六冲/世应', qian.liuChong && qian.shi === 6 && qian.ying === 3);
ok('地天泰六合', G.hexByName('地天泰').liuHe);
ok('游魂火地晋、归魂火天大有', G.hexByName('火地晋').youHun && G.hexByName('火天大有').guiHun);
ok('六神起例（乙日初爻青龙、壬日初爻玄武）', G.liushen('乙')[0] === '青龙' && G.liushen('壬')[0] === '玄武');

// ---------- 3. 六爻排盘 ----------
section('六爻排盘与《增删卜易》卦例');
function fakeCal(dayGZ, yueJian, kong, prevJie) {
  const di = C.gzIndex(dayGZ[0], dayGZ[1]);
  return {
    dayGan: dayGZ[0], dayZhi: dayGZ[1], dayIdx: di, dayGZ, yearGZ: '—', monthGZ: '—', timeGZ: '—',
    yueJian, yueJiang: '', yueJiangName: '', timeBranchIdx: 6,
    beijingTime: '古籍课例', trueSolarTime: '古籍课例', xunkong: { branches: kong, xun: '' },
    jieqi: { prevJie: { name: prevJie || '小暑' } }, wangXiang: C.wangXiang(yueJian),
    civilDay: { y: 2026, m: 11, d: 7 }, lateZi: false
  };
}
// 《增删卜易·两现章》未月庚子日占求财得风天小畜：妻财两现，辰土旬空、未土临月建
const xiaochu = G.hexByName('风天小畜');
const pXC = LY.paipan({ cal: fakeCal('庚子', '未', ['辰', '巳']), lines: xiaochu.lines, dong: [], zhanti: 'wealth', method: '古籍卦例' });
ok('小畜纳甲（初父母子水·世）', pXC.yao[0].ben.liuqin === '父母' && pXC.yao[0].shi, pXC.yao[0].ben.liuqin);
ok('妻财两现', pXC.yongshen && pXC.yongshen.twoXian && pXC.yongshen.candidates.length === 2,
  pXC.yongshen && JSON.stringify(pXC.yongshen.candidates.map(c => c.pos)));
ok('四爻未财临月建、三爻辰财旬空',
  pXC.yao[3].flags.indexOf('临月建') >= 0 && pXC.yao[2].flags.indexOf('旬空') >= 0,
  JSON.stringify([pXC.yao[3].flags, pXC.yao[2].flags]));
ok('两现章条文命中', pXC.evidence.some(t => t.id === 'ZSBY-LX-01') && pXC.evidence.some(t => t.id === 'ZSBY-LX-02'));
// 动变：老阳化回头克、进退神
const pD = LY.paipan({ cal: cur, siXiang: [9, 7, 7, 7, 7, 7], zhanti: 'wealth', method: '测试' });
ok('动爻识别与变卦生成', pD.dong.length === 1 && !!pD.bian && pD.yao[0].bian !== null);
ok('文本盘无未定义值', pD.textPan.indexOf('undefined') < 0 && pD.textPan.indexOf('NaN') < 0);
ok('应期候选含具体干支日', pD.yingqi.some(y => y.days.length > 0));
ok('离线规则结论', !!pD.local.verdict && pD.local.points.length > 0);
// 伏神：妻财不见之卦
let fuFound = false;
for (const g of G.HEX.list) {
  if (!g.yao.some(y => y.liuqin === '妻财')) {
    const p = LY.paipan({ cal: cur, lines: g.lines, dong: [], zhanti: 'wealth', method: '测试' });
    if (p.yongshen && p.yongshen.type === '伏藏' && p.fushen.length) { fuFound = true; break; }
  }
}
ok('用神不上卦可取本宫伏神', fuFound);

// ---------- 4. 大六壬 ----------
section('大六壬九宗门课例');
function fakeRen(dayGZ, shi, jiang, yueJian) {
  const di = C.gzIndex(dayGZ[0], dayGZ[1]);
  return {
    dayGan: dayGZ[0], dayZhi: dayGZ[1], dayIdx: di, dayGZ, timeBranchIdx: shi, yueJiangIdx: jiang,
    yueJian, yueJiang: C.ZHI[jiang], yueJiangName: C.JIANG_NAME[jiang],
    yearGZ: '乙巳', monthGZ: '戊子', timeGZ: '乙巳', beijingTime: '课例', trueSolarTime: '课例',
    xunkong: C.xunkong(di), jieqi: { prevZhong: { name: '小雪' } }, wangXiang: C.wangXiang(yueJian),
    civilDay: { y: 2026, m: 11, d: 7 }
  };
}
// 课例一（大六壬起例通行例）：壬戌日巳时，寅将加巳 → 元首课，三传 巳寅亥
const r1 = LR.qike({ cal: fakeRen('壬戌', 5, 2, '子'), zhanti: 'general' });
ok('元首课三传 巳寅亥', r1.jiu.keTi === '元首' && r1.sanchuan.map(c => c.zhi).join('') === '巳寅亥',
  r1.jiu.keTi + ':' + r1.sanchuan.map(c => c.zhi).join(''));
ok('天盘寅将加巳', r1.pan.tianPan[11] === '申' && r1.pan.tianPan[8] === '巳');
ok('壬戌日昼贵巳、逆布', r1.tianjiang.guirenZhi === '巳' && r1.tianjiang.shun === false);
// 课例二：伏吟丁丑日，无克柔日取支上神，三传 丑戌未
const r2 = LR.qike({ cal: fakeRen('丁丑', 3, 3, '丑'), zhanti: 'health' });
ok('伏吟三传 丑戌未（刑递）', r2.jiu.keTi === '伏吟' && r2.sanchuan.map(c => c.zhi).join('') === '丑戌未',
  r2.sanchuan.map(c => c.zhi).join(''));
// 课例三：返吟辛丑日无克，井栏射 亥未辰
const r3 = LR.qike({ cal: fakeRen('辛丑', 3, 9, '丑'), zhanti: 'travel' });
ok('返吟井栏射 亥未辰', r3.jiu.keTi === '返吟' && r3.jiu.ge === '井栏射' && r3.sanchuan.map(c => c.zhi).join('') === '亥未辰',
  r3.jiu.ge + ':' + r3.sanchuan.map(c => c.zhi).join(''));
// 课例四：八专己未日酉时亥将 → 独足格 酉酉酉
const r4 = LR.qike({ cal: fakeRen('己未', 9, 11, '未'), zhanti: 'general' });
ok('八专独足格 酉酉酉', r4.pan.baZhuan && r4.sanchuan.map(c => c.zhi).join('') === '酉酉酉',
  r4.sanchuan.map(c => c.zhi).join(''));
// 全课遍历
let total = 0, bad = 0, dist = {};
for (let di = 0; di < 60; di++) for (let sh = 0; sh < 12; sh++) for (let jg = 0; jg < 12; jg++) {
  const gz = C.gz(di);
  const cal = fakeRen(gz, sh, jg, '子');
  try {
    const p = LR.qike({ cal, zhanti: 'general' });
    if (!K.KETI[p.jiu.keTi] || p.sanchuan.some(c => !c.zhi || !c.tianjiang) ||
        p.textPan.indexOf('undefined') >= 0 || p.textPan.indexOf('NaN') >= 0) bad++;
    else { dist[p.jiu.keTi] = (dist[p.jiu.keTi] || 0) + 1; total++; }
  } catch (e) { bad++; }
}
ok('8640 课全遍历无异常', total === 8640 && bad === 0, '成功' + total + ' 异常' + bad);
console.log('  课体分布：' + JSON.stringify(dist));

// ---------- 5. LLM Prompt ----------
section('LLM 注入构造（离线校验，不发起请求）');
const pReal = LY.paipan({ cal: cur, siXiang: [9, 8, 7, 7, 8, 6], zhanti: 'career', method: '测试' });
const msgs = LLM.buildMessages(pReal, '', []);
ok('system + user 两段', msgs.length === 2 && msgs[0].role === 'system' && msgs[1].role === 'user');
ok('注入经典条目编号', msgs[0].content.indexOf('BSZZ-') >= 0 || msgs[0].content.indexOf('ZSBY-') >= 0);
ok('注入完整盘面文本', msgs[1].content.indexOf(pReal.textPan) >= 0);
ok('注入结构化 JSON', msgs[1].content.indexOf('结构化盘面 JSON') >= 0);
ok('要求不改盘面 / 或然表述 / 免责', msgs[0].content.indexOf('不得改动') >= 0 && msgs[0].content.indexOf('或然') >= 0);
const chat = LLM.buildMessages(pReal, '应期能否再具体些？', [{ role: 'user', content: '解读此盘' }, { role: 'assistant', content: '已解读' }]);
ok('多轮追问结构', chat.length === 5 && chat[4].content.indexOf('应期能否再具体些') >= 0);
ok('本地兜底断语', LLM.localFallback(pReal).indexOf('离线规则解读') >= 0);
ok('预设端点', LLM.PRESETS.length >= 7 && LLM.endpoint({ baseUrl: 'https://api.deepseek.com/v1' }).endsWith('/chat/completions'));

console.log('\n============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
