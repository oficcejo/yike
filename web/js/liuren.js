/* ============================================================
 * liuren.js — 大六壬起课引擎
 * 依据：《御定六壬直指·卷上·起例》月将加时、十干寄宫、九宗门；
 *       《大六壬指南》课体；《六壬断案》类神/年命；
 *       天乙贵人昼夜顺逆通行起例；毕法赋格局。
 * 口诀校验：贼克「取课先从下贼呼…初传之上名中次」、
 *          昴星「阳仰阴俯酉位中，刚日先辰而后日」、
 *          涉害「孟深仲浅季当休，复等柔辰刚日宜」、
 *          伏吟「迤逦刑之作中末」、返吟「无克别有井栏名」。
 * ============================================================ */
(function (root) {
  'use strict';
  var C = root.Calendar || (typeof require === 'function' ? require('./calendar.js') : null);
  var G = root.GuaData || (typeof require === 'function' ? require('./data.js') : null);
  var K = root.Classics || (typeof require === 'function' ? require('./classics.js') : null);

  var JIGONG = { 甲: 2, 乙: 4, 丙: 5, 丁: 7, 戊: 5, 己: 7, 庚: 8, 辛: 10, 壬: 11, 癸: 1 };
  var JIANG = ['贵人', '螣蛇', '朱雀', '六合', '勾陈', '青龙', '天空', '白虎', '太常', '玄武', '太阴', '天后'];
  // 昼贵（卯至申）/ 夜贵（酉至寅）：甲戊庚牛羊、乙己鼠猴、丙丁猪鸡、壬癸蛇兔、六辛逢马虎
  var GUI_DAY = { 甲: 1, 戊: 1, 庚: 1, 乙: 0, 己: 0, 丙: 11, 丁: 11, 壬: 5, 癸: 5, 辛: 6 };
  var GUI_NIGHT = { 甲: 7, 戊: 7, 庚: 7, 乙: 8, 己: 8, 丙: 9, 丁: 9, 壬: 3, 癸: 3, 辛: 2 };
  // 古法（阳贵歌「甲羊戊庚牛…」）可选，与通行起例相反
  var GUI_DAY_GU = { 甲: 7, 戊: 1, 庚: 1, 乙: 8, 己: 0, 丙: 9, 丁: 11, 壬: 3, 癸: 5, 辛: 2 };
  var GUI_NIGHT_GU = { 甲: 1, 戊: 7, 庚: 7, 乙: 0, 己: 8, 丙: 11, 丁: 9, 壬: 5, 癸: 3, 辛: 6 };
  var MENG = [2, 8, 5, 11], ZHONG = [0, 6, 3, 9], JI = [4, 10, 1, 7];
  var ZIXING = [4, 6, 9, 11]; // 辰午酉亥自刑
  var YIMA = { 申: 2, 子: 2, 辰: 2, 寅: 8, 午: 8, 戌: 8, 巳: 11, 酉: 11, 丑: 11, 亥: 5, 卯: 5, 未: 5 };
  var TAOHUA = { 申: 9, 子: 9, 辰: 9, 寅: 3, 午: 3, 戌: 3, 巳: 6, 酉: 6, 丑: 6, 亥: 0, 卯: 0, 未: 0 };
  var GAN_HE = { 甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊' };

  function zhantiOf(id) {
    for (var i = 0; i < G.ZHANTI.length; i++) if (G.ZHANTI[i].id === id) return G.ZHANTI[i];
    return G.ZHANTI[0];
  }

  function qike(opts) {
    var cal = opts.cal, zt = zhantiOf(opts.zhanti || 'general');
    var dayGan = cal.dayGan, dayZhi = cal.dayZhi, dayIdx = cal.dayIdx;
    var dg = C.gIdx(dayGan), db = C.bIdx(dayZhi);
    var dayYang = (dg % 2 === 0);
    var dayWx = C.GAN_WX[dg];
    var shi = cal.timeBranchIdx, jiang = cal.yueJiangIdx;
    var kong = cal.xunkong.branches, kongIdx = kong.map(C.bIdx);

    // ---- 天地盘：月将加时 ----
    var top = [], bottomOfTop = [];
    for (var d = 0; d < 12; d++) top[d] = C.mod(jiang + d - shi, 12);
    for (var s = 0; s < 12; s++) bottomOfTop[s] = C.mod(shi + s - jiang, 12);
    var isFuYin = (jiang === shi);
    var isFanYin = (C.mod(jiang + 6, 12) === shi);

    // ---- 四课 ----
    var jg = JIGONG[dayGan];
    function ke(no, upper, lowerZhi, lowerWx, lowerLabel) {
      return { no: no, upper: upper, upperZhi: C.ZHI[upper], lowerZhi: lowerZhi, lowerLabel: lowerLabel, lowerWx: lowerWx };
    }
    var k1 = ke(1, top[jg], jg, dayWx, dayGan);
    var k2 = ke(2, top[k1.upper], k1.upper, C.ZHI_WX[k1.upper], C.ZHI[k1.upper]);
    var k3 = ke(3, top[db], db, C.ZHI_WX[db], dayZhi);
    var k4 = ke(4, top[k3.upper], k3.upper, C.ZHI_WX[k3.upper], C.ZHI[k3.upper]);
    var sikes = [k1, k2, k3, k4];

    // 克贼：上克下曰克，下贼上曰贼
    var keList = [];
    sikes.forEach(function (kk) {
      var uw = C.ZHI_WX[kk.upper];
      if (C.WX_KE[uw] === kk.lowerWx) keList.push({ ke: kk, type: '克', upper: kk.upper });
      else if (C.WX_KE[kk.lowerWx] === uw) keList.push({ ke: kk, type: '贼', upper: kk.upper });
    });

    // 四课完备性
    var uniq = {};
    sikes.forEach(function (kk) { uniq[kk.upper + '/' + kk.lowerZhi] = 1; });
    var keCount = Object.keys(uniq).length;
    var isBaZhuan = (jg === db);         // 干支同宫（甲寅、丁未、己未、庚申、癸丑）
    var isBuBei = keCount === 3;

    // ---- 九宗门取初传 ----
    var first = null, keTi = '', ge = '', method = '', middle = null, last = null;
    function takeKe(list, tag) {
      var zei = list.filter(function (x) { return x.type === '贼'; });
      var use = zei.length ? zei : list.filter(function (x) { return x.type === '克'; });
      if (!use.length) return null;
      if (use.length === 1) {
        return { upper: use[0].upper, keti: zei.length ? '重审' : '元首', method: '贼克法' };
      }
      // 比用：阳日用阳、阴日用阴
      var bi = use.filter(function (x) { return C.ZHI_YANG[x.upper] === (dayYang ? 1 : 0); });
      if (bi.length === 1) return { upper: bi[0].upper, keti: '知一', method: '比用法（知一）', ge: '比用' };
      var pool = bi.length ? bi : use;
      // 涉害：行来本家止，路逢多克为用取
      var scored = pool.map(function (x) {
        var start = bottomOfTop[x.upper], cnt = 0, step = 0;
        while (step <= 12) {
          var dd = C.mod(start + step, 12);
          if (C.WX_KE[C.ZHI_WX[dd]] === C.ZHI_WX[x.upper]) cnt++;
          if (dd === x.upper) break;
          step++;
        }
        var pos = bottomOfTop[x.upper];
        return { x: x, cnt: cnt, rank: MENG.indexOf(pos) >= 0 ? 3 : ZHONG.indexOf(pos) >= 0 ? 2 : JI.indexOf(pos) >= 0 ? 1 : 0, pos: pos };
      });
      scored.sort(function (a, b) { return (b.cnt - a.cnt) || (b.rank - a.rank); });
      var topScore = scored[0], tied = scored.filter(function (z) { return z.cnt === topScore.cnt && z.rank === topScore.rank; });
      var chosen = topScore;
      var geName = topScore.rank === 3 && tied.length > 1 ? '缀瑕' : topScore.rank === 3 ? '见机' : topScore.rank === 2 ? '察微' : '缀瑕';
      if (tied.length > 1) {
        // 复等：阳日取干上神，阴日取辰上神
        var prefer = dayYang ? k1.upper : k3.upper;
        var hit = tied.filter(function (z) { return z.x.upper === prefer; });
        chosen = hit.length ? hit[0] : topScore;
        geName = '缀瑕（复等）';
      }
      return { upper: chosen.x.upper, keti: '涉害', method: '涉害法', ge: geName, shehai: scored.map(function (z) { return { zhi: C.ZHI[z.x.upper], count: z.cnt, rank: z.rank }; }) };
    }
    function chuanByXing(chu) {
      // 伏吟中末：初传所刑 → 中传所刑；自刑者颠倒日辰 / 取冲
      var mid, end;
      if (ZIXING.indexOf(chu) >= 0) mid = dayYang ? k3.upper : k1.upper;
      else mid = C.bIdx(C.XING[C.ZHI[chu]]);
      if (ZIXING.indexOf(mid) >= 0) end = C.mod(mid + 6, 12);
      else end = C.bIdx(C.XING[C.ZHI[mid]]);
      return [mid, end];
    }
    function yaoKe() {
      // 遥克：先蒿矢（上神遥克日干），后弹射（日干遥克上神）；不取干上神
      var cand = [k2, k3, k4].map(function (kk) { return kk.upper; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var hao = cand.filter(function (u) { return C.WX_KE[C.ZHI_WX[u]] === dayWx; });
      var tan = cand.filter(function (u) { return C.WX_KE[dayWx] === C.ZHI_WX[u]; });
      var use = hao.length ? hao : tan;
      if (!use.length) return null;
      var bi = use.filter(function (u) { return C.ZHI_YANG[u] === (dayYang ? 1 : 0); });
      if (bi.length) use = bi;
      return { upper: use[0], keti: '遥克', method: '遥克法', ge: hao.length ? '蒿矢' : '弹射' };
    }

    if (isFuYin || isFanYin) {
      var r = keList.length ? takeKe(keList) : null;
      if (isFuYin) {
        if (r) { first = r.upper; keTi = '伏吟'; method = r.method + '（伏吟有克还为用）'; }
        else { first = dayYang ? k1.upper : k3.upper; keTi = '伏吟'; method = '伏吟无克，刚干柔取辰'; ge = dayYang ? '自任' : '自信'; }
        var fm = chuanByXing(first); middle = fm[0]; last = fm[1];
        if (ZIXING.indexOf(first) >= 0) ge = '杜传';
      } else {
        if (r) { first = r.upper; keTi = '返吟'; method = r.method + '（返吟有克亦为用）'; ge = '无依'; middle = top[first]; last = top[middle]; }
        else {
          first = YIMA[dayZhi]; keTi = '返吟'; method = '返吟无克，驿马发用（井栏射）'; ge = '井栏射';
          middle = k3.upper; last = k1.upper;
        }
      }
      if (r && r.ge) ge = ge || r.ge;
      if (r && r.keti && !isFuYin) keTi = '返吟';
    } else if (isBaZhuan) {
      var rb = keList.length ? takeKe(keList) : null;
      if (rb) { first = rb.upper; method = rb.method + '（八专有克）'; keTi = '八专'; }
      else {
        first = dayYang ? C.mod(k1.upper + 2, 12) : C.mod(k4.upper + 10, 12);
        method = dayYang ? '八专无克：干上阳神顺行三神' : '八专无克：辰阴神逆行三位';
        keTi = '八专';
      }
      middle = k1.upper; last = k1.upper;
      if (first === middle && middle === last) ge = '独足';
    } else {
      var rk = keList.length ? takeKe(keList) : null;
      if (rk) {
        first = rk.upper; keTi = rk.keti; method = rk.method; ge = rk.ge || '';
        middle = top[first]; last = top[middle];
      } else {
        var yr = yaoKe();
        if (yr && !isBuBei) {
          first = yr.upper; keTi = yr.keti; method = yr.method; ge = yr.ge;
          middle = top[first]; last = top[middle];
        } else if (yr && isBuBei) {
          // 别责不备课若有遥克仍按常法（口诀「四课不全三课备，无遥无克别责例」）
          first = yr.upper; keTi = yr.keti; method = yr.method + '（不备课有遥克）'; ge = yr.ge;
          middle = top[first]; last = top[middle];
        } else if (isBuBei) {
          if (dayYang) first = top[JIGONG[GAN_HE[dayGan]]];
          else first = top[C.mod(db + 4, 12)];
          keTi = '别责'; method = dayYang ? '别责：刚日干合上头神' : '别责：柔日支前三合取'; ge = '芜淫不备';
          middle = k1.upper; last = k1.upper;
        } else {
          if (dayYang) { first = top[9]; middle = k3.upper; last = k1.upper; ge = '虎视转蓬'; }
          else { first = bottomOfTop[9]; middle = k1.upper; last = k3.upper; ge = '冬蛇掩目'; }
          keTi = '昴星'; method = dayYang ? '昴星：阳仰取地盘酉上神，中末先辰后日' : '昴星：阴俯取天盘酉下神，中末先日后辰';
        }
      }
    }

    // ---- 昼夜贵人 / 十二天将 ----
    var dayTime = (shi >= 3 && shi <= 8);
    var guMode = opts.guirenMode || 'tongxing';
    var guirenZhi = (guMode === 'gufa' ? (dayTime ? GUI_DAY_GU : GUI_NIGHT_GU) : (dayTime ? GUI_DAY : GUI_NIGHT))[dayGan];
    var gp = bottomOfTop[guirenZhi];
    var shun = (gp >= 11 || gp <= 4); // 亥子丑寅卯辰顺布，巳午未申酉戌逆布
    var jiangOf = {};
    for (var j = 0; j < 12; j++) {
      var dp = shun ? C.mod(gp + j, 12) : C.mod(gp - j, 12);
      jiangOf[top[dp]] = JIANG[j];
    }

    // ---- 遁干 / 六亲 / 神煞 ----
    var xunShou = Math.floor(C.mod(dayIdx, 60) / 10) * 10;
    var xunZhi = C.mod(xunShou, 12);
    function dunGan(z) {
      var off = C.mod(z - xunZhi, 12);
      return off < 10 ? C.GAN[off] : null; // 旬空之支不遁干
    }
    function liuqin(z) { return G.liuqinOf(C.ZHI_WX[z], dayWx); }
    var dingMa = C.mod(xunShou + 3, 12);

    var shensha = {
      xunkong: kong, rilu: G.LUSHEN[dayGan], ridemu: C.muBranch(dayWx),
      yima: C.ZHI[YIMA[dayZhi]], taohua: C.ZHI[TAOHUA[dayZhi]], dingma: C.ZHI[dingMa],
      tianyi: C.ZHI[guirenZhi], tianyiType: dayTime ? '昼贵（阳贵）' : '夜贵（阴贵）',
      guirenShun: shun
    };

    function chuan(z, name) {
      return {
        name: name, zhi: C.ZHI[z], idx: z, wx: C.ZHI_WX[z], dunGan: dunGan(z),
        liuqin: liuqin(z), tianjiang: jiangOf[z], jiangNature: (K.TIANJIANG.find(function (x) { return x.name === jiangOf[z]; }) || {}).nature,
        state: C.wangState(C.ZHI_WX[z], cal.yueJian), kong: kongIdx.indexOf(z) >= 0,
        diPanGong: C.ZHI[bottomOfTop[z]], xiang: (K.YUEJIANG_XIANG.find(function (x) { return x.zhi === C.ZHI[z]; }) || {}).xiang
      };
    }
    var sanchuan = [chuan(first, '初传（发用）'), chuan(middle, '中传'), chuan(last, '末传')];

    var sikesOut = sikes.map(function (kk) {
      return {
        no: kk.no, name: ['干上阳神', '干上阴神', '支上阳神', '支上阴神'][kk.no - 1],
        upper: C.ZHI[kk.upper], lowerLabel: kk.lowerLabel, lowerZhi: C.ZHI[kk.lowerZhi],
        upperWx: C.ZHI_WX[kk.upper], lowerWx: kk.lowerWx,
        tianjiang: jiangOf[kk.upper], liuqin: liuqin(kk.upper),
        kong: kongIdx.indexOf(kk.upper) >= 0,
        keZei: (keList.filter(function (x) { return x.ke.no === kk.no; })[0] || {}).type || ''
      };
    });

    // ---- 格局 / 类神 ----
    var sanhe = C.sanHeOf(sanchuan.map(function (c) { return c.zhi; }));
    var ketiInfo = K.KETI[keTi] || { tone: '平', gist: '' };
    var nianming = opts.nianming || null, xingnian = opts.xingnian || null;
    var nianmingInfo = null;
    if (nianming) {
      var nb = C.ZHI.indexOf(nianming);
      if (nb >= 0) nianmingInfo = {
        zhi: nianming, shangShen: C.ZHI[top[nb]], tianjiang: jiangOf[top[nb]],
        wx: C.ZHI_WX[nb], kong: kongIdx.indexOf(nb) >= 0,
        yuChu: C.heChong(nianming, sanchuan[0].zhi)
      };
    }
    var leishen = zt.renLeishen || [];

    var tags = ['课体', '九宗门', '类神', '三传', '起例', '天将', '贵人'];
    if (keTi === '伏吟') tags.push('伏吟', '刑冲');
    if (keTi === '返吟') tags.push('返吟', '刑冲');
    if (keTi === '涉害') tags.push('涉害', '孟仲季');
    if (keTi === '遥克') tags.push('遥克');
    if (keTi === '昴星') tags.push('昴星');
    if (keTi === '别责' || keTi === '八专') tags.push('别责', '八专', '不备');
    if (sanchuan.some(function (c) { return c.kong; })) tags.push('空亡', '毕法');
    if (sanchuan.some(function (c) { return c.tianjiang === '白虎'; })) tags.push('白虎', '毕法');
    if (nianming) tags.push('年命');
    tags = tags.concat(leishen);
    var evidence = K.byTags(tags, 'liuren').slice(0, 10);

    // ---- 离线兜底判断 ----
    var score = 0, points = [];
    if (ketiInfo.tone === '吉') { score += 2; points.push('课体「' + keTi + '」：' + ketiInfo.gist); }
    else if (ketiInfo.tone === '凶') { score -= 2; points.push('课体「' + keTi + '」：' + ketiInfo.gist); }
    else points.push('课体「' + keTi + '」：' + ketiInfo.gist);
    sanchuan.forEach(function (c) {
      if (c.kong) { score -= 1; points.push(c.name + c.zhi + '落旬空，' + c.name + '之事多虚'); }
      if (['吉', '半吉'].indexOf(c.jiangNature) >= 0) { score += 1; points.push(c.name + '乘' + c.tianjiang + '，有助力'); }
      if (c.jiangNature === '凶') { score -= 1; points.push(c.name + '乘' + c.tianjiang + '，须防' + (K.TIANJIANG.find(function (x) { return x.name === c.tianjiang; }) || {}).xiang.split('、')[0]); }
      if (c.state === '旺' || c.state === '相') points.push(c.name + '得时旺相');
    });
    if (sanhe) points.push('三传成' + sanhe.wx + '局（' + sanhe.branches.join('') + '），全局课：事有合力、牵连较广');
    if (shensha.tianyi === sanchuan[0].zhi) points.push('初传乘天乙贵人，得贵人扶助');
    if (nianmingInfo && nianmingInfo.yuChu === '冲') points.push('年命与初传相冲，事关切身且多变动');
    var verdict = score >= 3 ? '课势偏顺，多有可成之机' : score >= 1 ? '略有助力，仍须审类神' : score >= -1 ? '吉凶相杂，宜细辨类神旺衰' : '课体与神将偏逆，多主阻滞';

    var pan = {
      engine: 'liuren', version: '1.0',
      meta: {
        zhanti: zt.name, zhantiNote: zt.note, note: opts.note || '', time: cal.beijingTime, trueSolarTime: cal.trueSolarTime,
        yearGZ: cal.yearGZ, monthGZ: cal.monthGZ, dayGZ: cal.dayGZ, timeGZ: cal.timeGZ,
        yueJian: cal.yueJian, yueJiang: (cal.yueJiangName || '') + (cal.yueJiang || C.ZHI[jiang]), jieqi: cal.jieqi,
        xunkong: kong, xun: cal.xunkong.xun, dayNight: dayTime ? '昼占（卯至申）' : '夜占（酉至寅）',
        guirenMode: guMode === 'gufa' ? '古法阳贵歌' : '通行起例（甲戊庚牛羊·六辛逢马虎）',
        wangXiang: cal.wangXiang
      },
      pan: {
        diPan: C.ZHI.slice(), tianPan: top.map(function (z) { return C.ZHI[z]; }),
        shiZhi: C.ZHI[shi], yueJiangZhi: C.ZHI[jiang], fuYin: isFuYin, fanYin: isFanYin,
        jiGong: C.ZHI[jg], keCount: keCount, buBei: isBuBei, baZhuan: isBaZhuan
      },
      sikes: sikesOut,
      jiu: { keTi: keTi, ge: ge, method: method, ketiInfo: ketiInfo, keZeiCount: keList.length,
             keZei: keList.map(function (x) { return { no: x.ke.no, type: x.type, upper: C.ZHI[x.upper] }; }) },
      sanchuan: sanchuan, sanhe: sanhe,
      tianjiang: { guirenZhi: C.ZHI[guirenZhi], guirenGong: C.ZHI[gp], shun: shun, mapping: jiangOf },
      shensha: shensha, nianming: nianmingInfo, xingnian: xingnian, leishen: leishen,
      evidence: evidence,
      local: { score: score, verdict: verdict, points: points }
    };
    pan.textPan = renderText(pan);
    return pan;
  }

  function renderText(p) {
    var L = [];
    L.push('【大六壬课式】');
    L.push('占题：' + p.meta.zhanti + (p.meta.note ? '（' + p.meta.note + '）' : ''));
    L.push('时间：' + p.meta.time + '｜' + [p.meta.yearGZ, p.meta.monthGZ, p.meta.dayGZ, p.meta.timeGZ].join(' ') + '｜' + p.meta.dayNight);
    L.push('月将：' + p.meta.yueJiang + '（' + (p.meta.jieqi.prevZhong ? p.meta.jieqi.prevZhong.name + '后太阳过宫' : '中气过宫') + '）加占时' + p.pan.shiZhi + '｜月建：' + p.meta.yueJian + '｜旬空：' + p.meta.xunkong.join('、'));
    L.push('十干寄宫：' + p.pan.jiGong + '｜' + (p.pan.fuYin ? '伏吟盘' : p.pan.fanYin ? '返吟盘' : '常盘') + '｜四课' + p.pan.keCount + '课' + (p.pan.buBei ? '（不备）' : '') + (p.pan.baZhuan ? '（八专）' : ''));
    L.push('');
    L.push('地盘：' + p.pan.diPan.join(' '));
    L.push('天盘：' + p.pan.tianPan.join(' '));
    L.push('');
    L.push('四课（自第一课起）：');
    p.sikes.forEach(function (k) {
      L.push('  ' + k.no + '·' + k.name + '：上 ' + k.upper + '（' + k.upperWx + '·' + k.liuqin + '·' + k.tianjiang + (k.kong ? '·旬空' : '') + '）／下 ' + k.lowerLabel + (k.lowerZhi !== k.lowerLabel ? '(' + k.lowerZhi + ')' : '') + (k.keZei ? ' 〔' + k.keZei + '〕' : ''));
    });
    L.push('');
    L.push('三传（' + p.jiu.keTi + (p.jiu.ge ? '·' + p.jiu.ge : '') + '；' + p.jiu.method + '）：');
    p.sanchuan.forEach(function (c) {
      L.push('  ' + c.name + '：' + (c.dunGan || '○') + c.zhi + '（' + c.wx + '·' + c.liuqin + '）乘' + c.tianjiang + '｜' + c.state + (c.kong ? '｜旬空' : '') + '｜临' + c.diPanGong + '宫');
    });
    L.push('');
    L.push('天乙贵人：' + p.tianjiang.guirenZhi + '（' + p.meta.dayNight + '）临地盘' + p.tianjiang.guirenGong + '，十二天将' + (p.tianjiang.shun ? '顺布' : '逆布'));
    L.push('神煞：日禄' + p.shensha.rilu + '｜驿马' + p.shensha.yima + '｜桃花' + p.shensha.taohua + '｜旬丁' + p.shensha.dingma + '｜日墓' + p.shensha.ridemu + '｜旬空' + p.meta.xunkong.join(''));
    if (p.sanhe) L.push('三传成' + p.sanhe.wx + '局：' + p.sanhe.branches.join('、'));
    if (p.nianming) L.push('本命' + p.nianming.zhi + '：上神' + p.nianming.shangShen + '乘' + p.nianming.tianjiang + (p.nianming.yuChu ? '，与初传' + p.nianming.yuChu : ''));
    L.push('占题类神：' + p.leishen.join('、'));
    L.push('课体基调：' + p.jiu.ketiInfo.tone + '｜' + p.jiu.ketiInfo.gist);
    return L.join('\n');
  }

  var API = { qike: qike, renderText: renderText, JIGONG: JIGONG, JIANG: JIANG, zhantiOf: zhantiOf };
  root.LiuRen = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
