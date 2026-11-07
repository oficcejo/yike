/* ============================================================
 * liuyao.js — 六爻纳甲排盘引擎
 * 起卦：铜钱六掷（少阳7/少阴8/老阳9/老阴6）；支持指定卦例复盘
 * 依据：《增删卜易》《卜筮正宗·黄金策》纳甲、八宫、飞伏、
 *       月建日辰、旬空月破、暗动、进退神、回头生克、两现取舍、应期
 * ============================================================ */
(function (root) {
  'use strict';
  var C = root.Calendar || (typeof require === 'function' ? require('./calendar.js') : null);
  var G = root.GuaData || (typeof require === 'function' ? require('./data.js') : null);
  var K = root.Classics || (typeof require === 'function' ? require('./classics.js') : null);
  var POS = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  var NUM = ['初', '二', '三', '四', '五', '上'];

  // 四象：6老阴(动) 7少阳(静) 8少阴(静) 9老阳(动)
  function fromSiXiang(arr) {
    var lines = [], dong = [];
    arr.forEach(function (v, i) {
      lines.push((v === 7 || v === 9) ? 1 : 0);
      if (v === 6 || v === 9) dong.push(i);
    });
    return { lines: lines, dong: dong, siXiang: arr.slice() };
  }
  function randomSiXiang(rnd) {
    var r = rnd || Math.random, out = [];
    // 每爻三枚铜钱：背数 0..3 → 老阳9 / 少阴8 / 少阳7 / 老阴6
    for (var i = 0; i < 6; i++) {
      var backs = 0;
      for (var j = 0; j < 3; j++) if (r() < 0.5) backs++;
      out.push([6, 7, 8, 9][backs]); // 三字(0背)=老阴6、一背=少阳7、二背=少阴8、三背=老阳9
    }
    return out;
  }
  function zhantiOf(id) {
    for (var i = 0; i < G.ZHANTI.length; i++) if (G.ZHANTI[i].id === id) return G.ZHANTI[i];
    return G.ZHANTI[0];
  }
  function yongshenTargets(zt, gender) {
    if (zt.id === 'marriage') return [gender === 'female' ? '官鬼' : '妻财'];
    return zt.yaoYongshen.slice();
  }

  function paipan(opts) {
    var cal = opts.cal, zt = zhantiOf(opts.zhanti || 'general');
    var lines = opts.lines, dong = opts.dong || [];
    if (opts.siXiang) { var sx = fromSiXiang(opts.siXiang); lines = sx.lines; dong = sx.dong; }
    if (!lines) throw new Error('缺少本卦六爻');
    if (opts.gua && !lines) { var hg = G.hexByName(opts.gua); lines = hg.lines.slice(); }
    var ben = G.hexByKey(G.keyOf(lines));
    if (!ben) throw new Error('本卦不存在');
    var bianLines = lines.map(function (v, i) { return dong.indexOf(i) >= 0 ? (v ? 0 : 1) : v; });
    var hasBian = dong.length > 0;
    var bian = hasBian ? G.hexByKey(G.keyOf(bianLines)) : null;

    var yueJian = cal.yueJian, dayZhi = cal.dayZhi, dayWx = C.ZHI_WX[C.bIdx(dayZhi)];
    var kong = cal.xunkong.branches;
    var ls = G.liushen(cal.dayGan);
    var targets = yongshenTargets(zt, opts.gender || 'male');

    var yao = [];
    for (var i = 0; i < 6; i++) {
      var b = ben.yao[i], isDong = dong.indexOf(i) >= 0;
      var flags = [], notes = [];
      var wx = b.wx, zhi = b.zhi;
      if (kong.indexOf(zhi) >= 0) flags.push('旬空');
      if (C.LIUCHONG[yueJian] === zhi) flags.push('月破');
      if (zhi === yueJian) flags.push('临月建');
      if (zhi === dayZhi) flags.push('临日建');
      if (i + 1 === ben.shi) flags.push('世爻');
      if (i + 1 === ben.ying) flags.push('应爻');
      var dayRel = '';
      if (C.WX_SHENG[dayWx] === wx) dayRel = '日辰生';
      else if (C.WX_KE[dayWx] === wx) dayRel = '日辰克';
      else if (dayWx === wx) dayRel = '日辰比和';
      if (C.LIUCHONG[dayZhi] === zhi) {
        flags.push('日冲');
        if (isDong) notes.push(kong.indexOf(zhi) >= 0 ? '动空逢冲为冲实' : '动爻逢冲为冲散/冲脱');
        else notes.push((C.wangState(wx, yueJian) === '旺' || C.wangState(wx, yueJian) === '相') ? '旺相静爻被日冲为暗动' : '休囚静爻被日冲为日破');
        if (!isDong && (C.wangState(wx, yueJian) === '旺' || C.wangState(wx, yueJian) === '相')) flags.push('暗动');
        if (!isDong && C.wangState(wx, yueJian) === '休') flags.push('日破');
      }
      if (C.LIUHE[dayZhi] === zhi) { flags.push('日合'); if (isDong) notes.push('动爻被日合绊住，待冲开'); }

      var bianYao = null, rels = [];
      if (isDong && bian) {
        var by = bian.yao[i];
        var bwx = by.wx, bzhi = by.zhi;
        var r = C.wxRelation(bwx, wx);
        if (r === '生') rels.push('回头生');
        else if (r === '克') rels.push('回头克');
        else if (r === '比和' || r === '被克') rels.push('化比和');
        else if (r === '被生') rels.push('化泄');
        var jt = G.JIN_TUI[zhi] && G.JIN_TUI[zhi][bzhi];
        if (jt) rels.push(jt + '神');
        if (bzhi === zhi) rels.push('爻伏吟');
        else if (C.LIUCHONG[zhi] === bzhi) rels.push('爻反吟');
        if (kong.indexOf(bzhi) >= 0) rels.push('化空');
        if (C.LIUCHONG[yueJian] === bzhi) rels.push('化破');
        if (bzhi === C.muBranch(wx)) rels.push('化墓');
        var csYang = (C.GAN.indexOf(b.gan) % 2 === 0); // 甲丙戊庚壬为阳干，长生顺行
        var cs = C.changSheng(wx, bzhi, csYang);
        if (cs.stage === '绝') rels.push('化绝');
        if (cs.stage === '长生') rels.push('化长生');
        if (cs.stage === '帝旺') rels.push('化帝旺');
        bianYao = {
          gan: by.gan, zhi: bzhi, wx: bwx, liuqin: G.liuqinOf(bwx, ben.palaceWx),
          state: C.wangState(bwx, yueJian), changsheng: cs.stage,
          kong: kong.indexOf(bzhi) >= 0, po: C.LIUCHONG[yueJian] === bzhi, relations: rels
        };
      }
      yao.push({
        pos: i, label: POS[i], yinYang: lines[i] ? '阳' : '阴',
        liushen: ls[i], shi: i + 1 === ben.shi, ying: i + 1 === ben.ying,
        dong: isDong, anDong: flags.indexOf('暗动') >= 0, siXiang: (opts.siXiang || [])[i] || null,
        ben: {
          gan: b.gan, zhi: zhi, wx: wx, liuqin: b.liuqin,
          state: C.wangState(wx, yueJian), changsheng: C.changSheng(wx, dayZhi, C.GAN.indexOf(b.gan) % 2 === 0).stage,
          dayRel: dayRel
        },
        flags: flags, notes: notes, bian: bianYao, relations: rels
      });
    }

    // ---- 用神 / 原忌仇神 ----
    var candidates = [], fushen = [];
    if (targets[0] === '世爻') {
      var shi = yao[ben.shi - 1];
      candidates = [{ pos: shi.pos, label: shi.label, liuqin: shi.ben.liuqin, score: 0, reasons: ['占题取世爻为主体'], yao: shi }];
    } else if (targets[0] === '应爻') {
      var yy = yao[ben.ying - 1];
      candidates = [{ pos: yy.pos, label: yy.label, liuqin: yy.ben.liuqin, score: 0, reasons: ['占题取应爻为他人'], yao: yy }];
    } else {
      yao.forEach(function (a) {
        if (targets.indexOf(a.ben.liuqin) >= 0) {
          var s = 0, why = [];
          if (a.dong) { s += 3; why.push('动爻'); }
          if (a.shi) { s += 3; why.push('持世'); }
          if (a.ying) { s += 1; why.push('临应'); }
          if (a.flags.indexOf('临月建') >= 0) { s += 2; why.push('临月建'); }
          if (a.flags.indexOf('临日建') >= 0) { s += 2; why.push('临日建'); }
          if (a.ben.state === '旺' || a.ben.state === '相') { s += 2; why.push('旺相'); }
          if (a.ben.state === '休' || a.ben.state === '囚' || a.ben.state === '死') { s -= 1; why.push('休囚'); }
          if (a.flags.indexOf('旬空') >= 0) { s -= 2; why.push('旬空'); }
          if (a.flags.indexOf('月破') >= 0) { s -= 2; why.push('月破'); }
          if (a.ben.dayRel === '日辰克') { s -= 1; why.push('日辰克'); }
          // 动爻来生 / 来克
          yao.forEach(function (d) {
            if (!d.dong || d.pos === a.pos) return;
            var rr = C.wxRelation(d.ben.wx, a.ben.wx);
            if (rr === '生') { s += 2; why.push(d.label + '动来生'); }
            if (rr === '克') { s -= 2; why.push(d.label + '动来克'); }
          });
          candidates.push({ pos: a.pos, label: a.label, liuqin: a.ben.liuqin, score: s, reasons: why, yao: a });
        }
      });
    }
    var chosen = candidates.length ? candidates.slice().sort(function (a, b) { return b.score - a.score; })[0] : null;
    var yongshen = null;
    if (chosen) {
      yongshen = {
        liuqin: chosen.liuqin, pos: chosen.pos, label: chosen.label, zhi: chosen.yao.ben.zhi, wx: chosen.yao.ben.wx,
        state: chosen.yao.ben.state, flags: chosen.yao.flags.slice(), type: '明现', dong: chosen.yao.dong,
        twoXian: candidates.length > 1, candidates: candidates.map(function (c) { return { pos: c.pos, label: c.label, score: c.score, reasons: c.reasons, flags: c.yao.flags }; })
      };
    } else {
      // 伏神：取本宫首卦（八纯）中同六亲之爻，伏于本卦同位
      var shou = null;
      for (var q = 0; q < G.HEX.list.length; q++) if (G.HEX.list[q].palace === ben.palace && G.HEX.list[q].gongIndex === 0) shou = G.HEX.list[q];
      for (var p = 0; p < 6; p++) {
        if (targets.indexOf(shou.yao[p].liuqin) < 0) continue;
        var f = shou.yao[p], fei = yao[p], can = 0, rs = [];
        if (C.wangState(f.wx, yueJian) === '旺' || C.wangState(f.wx, yueJian) === '相') { can += 2; rs.push('伏神旺相'); }
        if (f.zhi === dayZhi || f.zhi === yueJian) { can += 2; rs.push('伏神临日月'); }
        if (C.WX_SHENG[dayWx] === f.wx || C.WX_SHENG[C.ZHI_WX[C.bIdx(yueJian)]] === f.wx) { can += 2; rs.push('伏神得日月生扶'); }
        if (fei.flags.indexOf('旬空') >= 0 || fei.flags.indexOf('月破') >= 0) { can += 2; rs.push('飞神空破，易于引拔'); }
        if (C.WX_SHENG[fei.ben.wx] === f.wx) { can += 1; rs.push('飞神生伏'); }
        if (C.WX_KE[fei.ben.wx] === f.wx) { can -= 3; rs.push('飞神克伏，伏神受制'); }
        if (kong.indexOf(f.zhi) >= 0) { can -= 2; rs.push('伏神旬空'); }
        if (C.LIUCHONG[yueJian] === f.zhi) { can -= 2; rs.push('伏神月破'); }
        yao.forEach(function (d) {
          if (d.dong && C.WX_SHENG[d.ben.wx] === f.wx) { can += 2; rs.push(d.label + '动爻生伏'); }
        });
        fushen.push({
          liuqin: f.liuqin, gan: f.gan, zhi: f.zhi, wx: f.wx, pos: p, label: POS[p],
          feiZhi: fei.ben.zhi, feiWx: fei.ben.wx, feiFlags: fei.flags.slice(),
          keChu: can >= 1, score: can, reasons: rs
        });
      }
      var best = fushen.slice().sort(function (a, b) { return b.score - a.score; })[0];
      if (best) yongshen = {
        liuqin: best.liuqin, pos: best.pos, label: best.label + '（伏）', zhi: best.zhi, wx: best.wx,
        state: C.wangState(best.wx, yueJian), flags: [], type: '伏藏', dong: false, keChu: best.keChu,
        fei: best.feiZhi, reasons: best.reasons
      };
    }

    var yuanJi = null;
    if (yongshen) {
      var wu = yongshen.wx;
      var yuanWx = C.WX_BEISHENG[wu], jiWx = C.WX_BEIKE[wu], chouWx = C.WX_BEIKE[yuanWx];
      function findWx(w) { return yao.filter(function (a) { return a.ben.wx === w; }).map(function (a) { return { label: a.label, pos: a.pos, dong: a.dong, flags: a.flags }; }); }
      yuanJi = { 原神: { wx: yuanWx, yao: findWx(yuanWx) }, 忌神: { wx: jiWx, yao: findWx(jiWx) }, 仇神: { wx: chouWx, yao: findWx(chouWx) } };
    }

    // ---- 卦变 / 全局格局 ----
    var dongCount = dong.length, jingCount = 6 - dongCount;
    var fanYin = [], fuYin = [];
    if (bian) {
      for (var s = 0; s < 2; s++) {
        var allSame = true, allChong = true;
        for (var t = 0; t < 3; t++) {
          var a = ben.yao[s * 3 + t].zhi, b2 = bian.yao[s * 3 + t].zhi;
          if (a !== b2) allSame = false;
          if (C.LIUCHONG[a] !== b2) allChong = false;
        }
        if (allSame) fuYin.push(s === 0 ? '内卦伏吟' : '外卦伏吟');
        if (allChong) fanYin.push(s === 0 ? '内卦反吟' : '外卦反吟');
      }
    }
    var guaInfo = {
      benLiuChong: ben.liuChong, benLiuHe: ben.liuHe, youHun: ben.youHun, guiHun: ben.guiHun,
      bianLiuChong: bian ? bian.liuChong : null, bianLiuHe: bian ? bian.liuHe : null,
      bianYouHun: bian ? bian.youHun : null, bianGuiHun: bian ? bian.guiHun : null,
      chongBianHe: ben.liuChong && bian && bian.liuHe, heBianChong: ben.liuHe && bian && bian.liuChong,
      fanYin: fanYin, fuYin: fuYin,
      dongCount: dongCount, jingCount: jingCount,
      duFa: dongCount === 1, duJing: jingCount === 1, jinJing: dongCount === 0, jinFa: dongCount === 6
    };

    // ---- 应期（本地规则，供 LLM 与离线兜底）----
    var yingqi = buildYingqi(cal, yongshen, guaInfo, yao, dong);
    // ---- 经典条文命中 ----
    var tags = ['用神', '月建', '日辰'];
    yao.forEach(function (a) {
      a.flags.forEach(function (f) { if (['旬空', '月破', '暗动', '日破', '日合', '日冲'].indexOf(f) >= 0) tags.push(f); });
      a.relations.forEach(function (r) {
        if (r.indexOf('回头克') >= 0) tags.push('回头克');
        if (r.indexOf('神') >= 0 && (r === '进神' || r === '退神')) tags.push('进退神');
        if (r.indexOf('化空') >= 0 || r.indexOf('化破') >= 0 || r.indexOf('化墓') >= 0) tags.push('变爻');
      });
    });
    if (yongshen && yongshen.type === '伏藏') tags.push('伏神', '飞神');
    if (yongshen && yongshen.twoXian) tags.push('用神两现', '实空实破');
    if (guaInfo.duFa || guaInfo.duJing) tags.push('独发', '独静', '应期');
    if (ben.liuChong || ben.liuHe) tags.push('六冲', '六合');
    var evidence = K.byTags(tags, 'liuyao').slice(0, 10);

    // ---- 综合评分（离线兜底）----
    var score = 0, points = [];
    if (yongshen) {
      if (yongshen.state === '旺') { score += 2; points.push('用神旺相，得时得令'); }
      if (yongshen.state === '相') { score += 1; points.push('用神次旺，有机可成'); }
      if (['休', '囚', '死'].indexOf(yongshen.state) >= 0) { score -= 2; points.push('用神休囚失令，根气不足'); }
      if (yongshen.flags.indexOf('旬空') >= 0) { score -= 1; points.push('用神旬空，须待出旬实空'); }
      if (yongshen.flags.indexOf('月破') >= 0) { score -= 2; points.push('用神月破，须待实破'); }
      if (yongshen.type === '伏藏') { score += yongshen.keChu ? 0 : -2; points.push(yongshen.keChu ? '用神伏藏，尚有引拔之机' : '用神伏藏受制，事难显达'); }
      if (yongshen.flags.indexOf('临日建') >= 0 || yongshen.flags.indexOf('临月建') >= 0) { score += 1; points.push('用神临日月，有力'); }
      if (yuanJi) {
        yuanJi.原神.yao.forEach(function (o) { if (o.dong) { score += 1; points.push('原神发动生用，有助'); } });
        yuanJi.忌神.yao.forEach(function (o) { if (o.dong) { score -= 2; points.push('忌神发动克用，多阻'); } });
      }
      yao[yongshen.pos].relations.forEach(function (r) {
        if (r === '回头生' || r === '进神') { score += 1; points.push('动化' + r + '，后劲可期'); }
        if (r === '回头克' || r === '退神' || r === '化空' || r === '化破' || r === '化绝') { score -= 2; points.push('动化' + r + '，吉中藏损'); }
      });
    }
    if (ben.liuChong) { score -= 1; points.push('本卦六冲，主散、主反复'); }
    if (ben.liuHe) { score += 1; points.push('本卦六合，主成、主和合'); }
    if (guaInfo.chongBianHe) points.push('六冲变六合：先散后成');
    if (guaInfo.heBianChong) points.push('六合变六冲：先成后散');
    if (ben.youHun) points.push('游魂卦：心神不定、事多迁变');
    if (ben.guiHun) points.push('归魂卦：事有归着、宜守旧');
    if (fanYin.length) points.push('卦变反吟：反复颠簸');
    if (fuYin.length) points.push('卦变伏吟：郁结难伸');
    var verdict = score >= 3 ? '成多败少，倾向可成' : score >= 1 ? '略有可为，须待时机' : score >= -1 ? '吉凶参半，宜审慎' : '阻力偏重，多主难成';

    var pan = {
      engine: 'liuyao', version: '1.0',
      meta: {
        zhanti: zt.name, zhantiNote: zt.note, note: opts.note || '', gender: opts.gender || 'male',
        method: opts.method || '铜钱摇卦', time: cal.beijingTime, trueSolarTime: cal.trueSolarTime,
        yearGZ: cal.yearGZ, monthGZ: cal.monthGZ, dayGZ: cal.dayGZ, timeGZ: cal.timeGZ,
        yueJian: yueJian, dayZhi: dayZhi, xunkong: kong, yueJiang: cal.yueJiangName + cal.yueJiang,
        jieqi: cal.jieqi, wangXiang: cal.wangXiang
      },
      ben: { name: ben.name, palace: ben.palace, palaceWx: ben.palaceWx, gongName: ben.gongName, shi: ben.shi, ying: ben.ying, liuChong: ben.liuChong, liuHe: ben.liuHe },
      bian: bian ? { name: bian.name, palace: bian.palace, gongName: bian.gongName, shi: bian.shi, ying: bian.ying, liuChong: bian.liuChong, liuHe: bian.liuHe } : null,
      lines: lines, dong: dong, siXiang: opts.siXiang || null,
      yao: yao, fushen: fushen, yongshen: yongshen, yuanJi: yuanJi, guaInfo: guaInfo,
      yingqi: yingqi, evidence: evidence,
      local: { score: score, verdict: verdict, points: points }
    };
    pan.textPan = renderText(pan);
    return pan;
  }

  function buildYingqi(cal, ys, gi, yao, dong) {
    var out = [], kong = cal.xunkong.branches, yue = cal.yueJian;
    if (!ys) return out;
    var zhi = ys.zhi, wx = ys.wx;
    function daysWhere(pred, limit) {
      var r = [], base = cal.civilDay;
      var OFF = C.mod(cal.dayIdx - C.jdn(base.y, base.m, base.d), 60);
      for (var n = 0; n <= 120 && r.length < (limit || 4); n++) {
        var jd = C.jdn(base.y, base.m, base.d) + n;
        var idx = C.mod(jd + OFF, 60);
        var gz = C.gz(idx), b = C.ZHI[idx % 12];
        var c = C.civilFromJdn(jd);
        if (pred(b, gz, idx)) r.push({ date: c.y + '-' + C.pad(c.m) + '-' + C.pad(c.d), gz: gz, branch: b });
      }
      return r;
    }
    if (ys.flags.indexOf('旬空') >= 0) {
      out.push({ rule: '用神旬空（《千金赋直解》）', text: '出旬值日或冲空之日', days: daysWhere(function (b) { return b === zhi || C.LIUCHONG[zhi] === b; }) });
    }
    if (ys.flags.indexOf('月破') >= 0) {
      out.push({ rule: '用神月破', text: '实破（值月值日）或合破之期', days: daysWhere(function (b) { return b === zhi || C.LIUHE[zhi] === b; }) });
    }
    if (ys.flags.indexOf('日合') >= 0) {
      out.push({ rule: '如逢合住，须冲破以成功', text: '冲开合神之日', days: daysWhere(function (b) { return C.LIUCHONG[zhi] === b; }) });
    }
    if (['休', '囚', '死'].indexOf(ys.state) >= 0) {
      out.push({ rule: '若遇休囚，必生旺而成事', text: '用神临旺或得生之月日', days: daysWhere(function (b) { return C.ZHI_WX[C.bIdx(b)] === wx || C.WX_SHENG[C.ZHI_WX[C.bIdx(b)]] === wx; }) });
    }
    if (ys.state === '旺' && !ys.dong) {
      out.push({ rule: '用神旺相安静，以冲动日月断', text: '冲动用神之日', days: daysWhere(function (b) { return C.LIUCHONG[zhi] === b; }) });
    }
    if (gi.duFa || gi.duJing) {
      var solo = gi.duFa ? yao[dong[0]] : yao.find(function (a) { return !a.dong; });
      if (solo) out.push({
        rule: gi.duFa ? '独发：以值以合' : '独静：以值以冲',
        text: gi.duFa ? '独发之爻值日或相合之日' : '独静之爻值日或相冲之日',
        days: daysWhere(function (b) { return b === solo.ben.zhi || (gi.duFa ? C.LIUHE[solo.ben.zhi] === b : C.LIUCHONG[solo.ben.zhi] === b); })
      });
    }
    if (!out.length) out.push({ rule: '常法', text: '用神值日、值月或生合之日', days: daysWhere(function (b) { return b === zhi || C.LIUHE[zhi] === b; }) });
    return out;
  }

  function renderText(p) {
    var L = [];
    L.push('【六爻纳甲排盘】');
    L.push('占题：' + p.meta.zhanti + (p.meta.note ? '（' + p.meta.note + '）' : ''));
    L.push('时间：' + p.meta.time + '｜' + [p.meta.yearGZ, p.meta.monthGZ, p.meta.dayGZ, p.meta.timeGZ].join(' ') + '｜起卦：' + p.meta.method);
    L.push('月建：' + p.meta.yueJian + '｜日辰：' + p.meta.dayGZ + '｜旬空：' + p.meta.xunkong.join('、') + '｜节气：' + (p.meta.jieqi.prevJie ? p.meta.jieqi.prevJie.name + '后' : ''));
    L.push('本卦：' + p.ben.name + '（' + p.ben.palace + '宫·' + p.ben.gongName + '，' + p.ben.palaceWx + '）｜世' + p.ben.shi + ' 应' + p.ben.ying + (p.ben.liuChong ? '｜六冲卦' : '') + (p.ben.liuHe ? '｜六合卦' : ''));
    L.push('变卦：' + (p.bian ? p.bian.name + '（' + p.bian.palace + '宫·' + p.bian.gongName + '）' + (p.bian.liuChong ? '｜六冲' : '') + (p.bian.liuHe ? '｜六合' : '') : '无（六爻皆静）'));
    L.push('');
    L.push('六神｜爻位｜本卦(纳甲·六亲·五行)｜世应｜状态｜动变');
    for (var i = 5; i >= 0; i--) {
      var a = p.yao[i], b = a.ben;
      var s = a.liushen + '｜' + a.label + '｜' + b.gan + b.zhi + b.wx + '·' + b.liuqin + '｜' + (a.shi ? '世' : a.ying ? '应' : '　') + '｜' +
        b.state + '·' + b.changsheng + (a.flags.length ? '·' + a.flags.join('/') : '');
      if (a.bian) s += '｜动→ ' + a.bian.gan + a.bian.zhi + a.bian.wx + '·' + a.bian.liuqin + (a.bian.relations.length ? '（' + a.bian.relations.join('、') + '）' : '');
      L.push(s);
    }
    L.push('');
    if (p.yongshen) {
      L.push('用神：' + p.yongshen.liuqin + '（' + p.yongshen.label + '，' + p.yongshen.zhi + p.yongshen.wx + '，' + p.yongshen.state + '）' + (p.yongshen.type === '伏藏' ? '，伏于' + p.yongshen.fei + '之下，' + (p.yongshen.keChu ? '有引拔之机' : '受制难出') : ''));
      if (p.yongshen.twoXian) L.push('※ 用神两现（' + p.yongshen.candidates.length + '处），古法取旺相动爻不空不破；《增删卜易·两现章》另记「舍不空而用旬空」，验在实空实破，宜灵活参详。');
    }
    if (p.yuanJi) L.push('原神：' + p.yuanJi.原神.wx + '｜忌神：' + p.yuanJi.忌神.wx + '｜仇神：' + p.yuanJi.仇神.wx);
    L.push('全局：动爻' + p.guaInfo.dongCount + '、静爻' + p.guaInfo.jingCount + (p.guaInfo.duFa ? '（独发）' : '') + (p.guaInfo.duJing ? '（独静）' : '') +
      (p.guaInfo.fanYin.length ? '｜' + p.guaInfo.fanYin.join('、') : '') + (p.guaInfo.fuYin.length ? '｜' + p.guaInfo.fuYin.join('、') : '') +
      (p.guaInfo.chongBianHe ? '｜六冲变六合' : '') + (p.guaInfo.heBianChong ? '｜六合变六冲' : ''));
    if (p.yingqi.length) L.push('应期线索：' + p.yingqi.map(function (y) { return y.rule + '→' + y.text + (y.days.length ? '（如 ' + y.days.slice(0, 3).map(function (d) { return d.gz + ' ' + d.date; }).join('、') + '）' : ''); }).join('；'));
    return L.join('\n');
  }

  var API = { paipan: paipan, fromSiXiang: fromSiXiang, randomSiXiang: randomSiXiang, renderText: renderText, POS: POS, NUM: NUM, zhantiOf: zhantiOf };
  root.LiuYao = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
