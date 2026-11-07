/* ============================================================
 * data.js — 京房八宫 / 纳甲 / 六亲 / 六神 / 类象基础数据
 * 依据：《卜筮正宗·八宫章》《增删卜易·纳甲歌》《黄金策》体系
 * ============================================================ */
(function (root) {
  'use strict';
  var C = root.Calendar || (typeof require === 'function' ? require('./calendar.js') : null);

  var TRI = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] };
  var TRI_ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
  var PALACES = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑']; // 京房八宫序
  var PALACE_WX = { 乾: '金', 兑: '金', 坤: '土', 艮: '土', 震: '木', 巽: '木', 坎: '水', 离: '火' };
  var PALACE_YINYANG = { 乾: 1, 坎: 1, 艮: 1, 震: 1, 巽: 0, 离: 0, 坤: 0, 兑: 0 };

  // 纳甲歌：乾金甲子外壬午、坎水戊寅外戊申……内卦自初爻起，外卦自四爻起
  var NAJIA = {
    乾: { gi: '甲', go: '壬', zi: ['子', '寅', '辰'], zo: ['午', '申', '戌'] },
    坤: { gi: '乙', go: '癸', zi: ['未', '巳', '卯'], zo: ['丑', '亥', '酉'] },
    震: { gi: '庚', go: '庚', zi: ['子', '寅', '辰'], zo: ['午', '申', '戌'] },
    巽: { gi: '辛', go: '辛', zi: ['丑', '亥', '酉'], zo: ['未', '巳', '卯'] },
    坎: { gi: '戊', go: '戊', zi: ['寅', '辰', '午'], zo: ['申', '戌', '子'] },
    离: { gi: '己', go: '己', zi: ['卯', '丑', '亥'], zo: ['酉', '未', '巳'] },
    艮: { gi: '丙', go: '丙', zi: ['辰', '午', '申'], zo: ['戌', '子', '寅'] },
    兑: { gi: '丁', go: '丁', zi: ['巳', '卯', '丑'], zo: ['亥', '酉', '未'] }
  };

  // 六十四卦名矩阵：行=上卦，列=下卦，顺序同 TRI_ORDER
  var GUA_NAMES = {
    乾: ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
    兑: ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
    离: ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
    震: ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
    巽: ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
    坎: ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
    艮: ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
    坤: ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地']
  };
  var GONG_NAME = ['本宫（八纯）', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'];
  var SHI = [6, 1, 2, 3, 4, 5, 4, 3];
  var YING = [3, 4, 5, 6, 1, 2, 1, 6];

  var LIUSHEN = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
  var LIUSHEN_START = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 };
  var LIUQIN_ORDER = ['父母', '兄弟', '子孙', '妻财', '官鬼'];

  function liuqinOf(yaoWx, gongWx) {
    if (yaoWx === gongWx) return '兄弟';
    if (C.WX_SHENG[yaoWx] === gongWx) return '父母';   // 生我者父母
    if (C.WX_SHENG[gongWx] === yaoWx) return '子孙';   // 我生者子孙
    if (C.WX_KE[gongWx] === yaoWx) return '妻财';      // 我克者妻财
    if (C.WX_KE[yaoWx] === gongWx) return '官鬼';      // 克我者官鬼
    return '兄弟';
  }
  function triName(a) {
    var k = a.join('');
    for (var i = 0; i < TRI_ORDER.length; i++) if (TRI[TRI_ORDER[i]].join('') === k) return TRI_ORDER[i];
    return null;
  }
  function keyOf(lines) { return lines.map(function (x) { return x ? '1' : '0'; }).join(''); }
  function flip(a, i) { var b = a.slice(); b[i] = b[i] ? 0 : 1; return b; }

  function najia(lines, gongWx) {
    var lo = triName(lines.slice(0, 3)), up = triName(lines.slice(3, 6));
    var out = [];
    for (var i = 0; i < 6; i++) {
      var inner = i < 3, t = inner ? lo : up, nj = NAJIA[t];
      var gan = inner ? nj.gi : nj.go;
      var zhi = inner ? nj.zi[i] : nj.zo[i - 3];
      var wx = C.ZHI_WX[C.bIdx(zhi)];
      out.push({ gan: gan, zhi: zhi, wx: wx, liuqin: liuqinOf(wx, gongWx), yang: C.ZHI_YANG[C.bIdx(zhi)], tri: t });
    }
    return { lo: lo, up: up, yao: out };
  }
  function chongHe(yao) {
    var ch = true, he = true;
    for (var i = 0; i < 3; i++) {
      var a = yao[i].zhi, b = yao[i + 3].zhi;
      if (C.LIUCHONG[a] !== b) ch = false;
      if (C.LIUHE[a] !== b) he = false;
    }
    return { liuChong: ch, liuHe: he };
  }

  function build() {
    var list = [], byKey = {}, byName = {};
    PALACES.forEach(function (p) {
      var base = TRI[p].concat(TRI[p]);
      var variants = [];
      variants.push(base.slice());                                   // 0 本宫
      variants.push(flip(variants[0], 0));                            // 1 一世
      variants.push(flip(variants[1], 1));                            // 2 二世
      variants.push(flip(variants[2], 2));                            // 3 三世
      variants.push(flip(variants[3], 3));                            // 4 四世
      variants.push(flip(variants[4], 4));                            // 5 五世
      variants.push(flip(variants[5], 3));                            // 6 游魂（四爻回本宫）
      variants.push(TRI[p].concat(variants[6].slice(3)));            // 7 归魂（下卦归本宫）
      variants.forEach(function (lines, gi) {
        var nj = najia(lines, PALACE_WX[p]);
        var name = GUA_NAMES[nj.up][TRI_ORDER.indexOf(nj.lo)];
        var ch = chongHe(nj.yao);
        var g = {
          key: keyOf(lines), name: name, lines: lines.slice(), lower: nj.lo, upper: nj.up,
          palace: p, palaceWx: PALACE_WX[p], palaceYang: PALACE_YINYANG[p],
          gongIndex: gi, gongName: GONG_NAME[gi], shi: SHI[gi], ying: YING[gi],
          yao: nj.yao, liuChong: ch.liuChong, liuHe: ch.liuHe,
          youHun: gi === 6, guiHun: gi === 7
        };
        list.push(g); byKey[g.key] = g; byName[g.name] = g;
      });
    });
    return { list: list, byKey: byKey, byName: byName };
  }
  var HEX = build();

  // 六神：按日干起，自初爻顺布至上爻
  function liushen(dayGan) {
    var s = LIUSHEN_START[dayGan] || 0, out = [];
    for (var i = 0; i < 6; i++) out.push(LIUSHEN[(s + i) % 6]);
    return out;
  }
  // 六爻贵人（《增删卜易·星煞章》：甲戊兼牛羊，庚辛逢马虎）
  var LIUYAO_GUIREN = {
    甲: ['丑', '未'], 戊: ['丑', '未'], 乙: ['子', '申'], 己: ['子', '申'],
    丙: ['亥', '酉'], 丁: ['亥', '酉'], 壬: ['卯', '巳'], 癸: ['卯', '巳'],
    庚: ['寅', '午'], 辛: ['寅', '午']
  };
  var LUSHEN = { 甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳', 丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };

  // 进退神：动爻化出同五行之支，顺进为进神、逆退为退神
  var JIN_TUI = {
    亥: { 子: '进' }, 子: { 亥: '退', 丑: '进' }, 丑: { 子: '退', 辰: '进' }, 辰: { 丑: '退', 未: '进' }, 未: { 辰: '退', 戌: '进' }, 戌: { 未: '退' },
    寅: { 卯: '进' }, 卯: { 寅: '退' }, 巳: { 午: '进' }, 午: { 巳: '退' }, 申: { 酉: '进' }, 酉: { 申: '退' }
  };

  var LIUQIN_LEIXIANG = {
    父母: '长辈、文书、契约、房屋、车船、消息、庇护、辛劳',
    兄弟: '同辈、朋友、竞争者、劫财、 helpers、分夺、阻隔',
    子孙: '子嗣、下属、医药、福神、快乐、解忧、制鬼、六畜',
    妻财: '钱财、货物、妻室、员工、实利、可支配之物',
    官鬼: '功名、官职、官司、疾病、灾祸、盗贼、约束、丈夫'
  };
  var LIUSHEN_LEIXIANG = {
    青龙: '吉庆、喜庆、酒色、财禄、尊贵、生机',
    朱雀: '口舌、文书、信息、争讼、言语、火光',
    勾陈: '迟滞、田土、牵连、牢狱、稳重、旧事',
    螣蛇: '虚惊、缠绕、怪异、梦魇、虚诈、忧疑',
    白虎: '凶伤、疾病、丧事、刚猛、兵戈、道路',
    玄武: '盗贼、暗昧、隐私、逃逸、水患、欺骗'
  };

  // 占题 → 用神（六爻）/ 类神（六壬）
  var ZHANTI = [
    { id: 'general', name: '一般谋事 / 自身', yaoYongshen: ['世爻'], renLeishen: ['干上神', '日干', '初传'], note: '以世爻为主，兼看应爻与用神生克' },
    { id: 'wealth', name: '求财 / 交易 / 投资', yaoYongshen: ['妻财'], renLeishen: ['青龙', '财爻', '干上神'], note: '财爻为用，子孙为原神，兄弟为忌神' },
    { id: 'career', name: '功名 / 职位 / 升迁', yaoYongshen: ['官鬼'], renLeishen: ['官鬼', '贵人', '驿马', '催官使者'], note: '官鬼为用，父母为文书印绶' },
    { id: 'exam', name: '考试 / 文书 / 证书', yaoYongshen: ['父母'], renLeishen: ['朱雀', '父母', '文书'], note: '父母为文书，官鬼为功名，二者并看' },
    { id: 'lawsuit', name: '官司 / 诉讼 / 纠纷', yaoYongshen: ['官鬼'], renLeishen: ['官鬼', '朱雀', '勾陈'], note: '世应胜负，官鬼为官府，父母为状词' },
    { id: 'marriage', name: '婚姻 / 感情', yaoYongshen: ['妻财', '官鬼'], renLeishen: ['六合', '天后', '青龙', '财官'], note: '男占取妻财、女占取官鬼，兼看世应' },
    { id: 'health', name: '疾病 / 安康', yaoYongshen: ['子孙', '世爻'], renLeishen: ['白虎', '官鬼', '墓神', '子孙'], note: '官鬼为病，子孙为医药福神，世爻为身' },
    { id: 'travel', name: '出行 / 行人归期', yaoYongshen: ['世爻', '用神'], renLeishen: ['驿马', '天马', '白虎', '初传'], note: '驿马定动，日辰定期，世爻定安危' },
    { id: 'lost', name: '失物 / 寻人', yaoYongshen: ['妻财', '官鬼'], renLeishen: ['玄武', '勾陈', '财爻'], note: '玄武为盗，勾陈为捕，财爻为物' },
    { id: 'house', name: '家宅 / 风水', yaoYongshen: ['父母', '世爻'], renLeishen: ['支上神', '宅神', '父母'], note: '《御定六壬直指》：占宅看支上神' },
    { id: 'children', name: '子嗣 / 孕育 / 下属', yaoYongshen: ['子孙'], renLeishen: ['子孙', '胎爻', '六合'], note: '《六壬断案》法：占孕专看胎爻，不泛取子孙' },
    { id: 'partner', name: '合作 / 应爻 / 他人', yaoYongshen: ['应爻'], renLeishen: ['支上神', '应爻类神'], note: '世为己、应为人，宜相生相合' }
  ];

  var API = {
    TRI: TRI, TRI_ORDER: TRI_ORDER, PALACES: PALACES, PALACE_WX: PALACE_WX, NAJIA: NAJIA,
    GUA_NAMES: GUA_NAMES, GONG_NAME: GONG_NAME, SHI: SHI, YING: YING,
    LIUSHEN: LIUSHEN, LIUSHEN_START: LIUSHEN_START, LIUQIN_ORDER: LIUQIN_ORDER,
    LIUYAO_GUIREN: LIUYAO_GUIREN, LUSHEN: LUSHEN, JIN_TUI: JIN_TUI,
    LIUQIN_LEIXIANG: LIUQIN_LEIXIANG, LIUSHEN_LEIXIANG: LIUSHEN_LEIXIANG, ZHANTI: ZHANTI,
    HEX: HEX, hexByKey: function (k) { return HEX.byKey[k]; }, hexByName: function (n) { return HEX.byName[n]; },
    keyOf: keyOf, triName: triName, najia: najia, liuqinOf: liuqinOf, liushen: liushen, chongHe: chongHe
  };
  root.GuaData = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
