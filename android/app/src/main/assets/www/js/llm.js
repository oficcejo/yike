/* ============================================================
 * llm.js — LLM 预测解读层
 * 原则：排盘由本地引擎精算，模型只负责「依经典义理作解读」。
 * 通道：安卓端走原生桥（避免 file:// 跨域与 CORS），浏览器预览走 fetch。
 * 注意：推理模型流式 chunk 的 delta.content 常为 JSON null，必须严格判型，
 *       不得用 org.json.optString / 字符串拼接，否则正文会被拼成 "nullnull..."。
 * ============================================================ */
(function (root) {
  'use strict';
  var K = root.Classics;
  var G = root.GuaData;

  var PRESETS = [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', maxTokens: 4096, tip: '默认模型 deepseek-flash。新版默认开启 thinking，思维链走 reasoning_content；若开启思考模式请勾选「推理模型」。若报「模型不存在」请核对控制台型号' },
    { id: 'deepseek-r1', name: 'DeepSeek 推理 R1', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner', reasoning: true, maxTokens: 8192, tokenParam: 'max_tokens', tip: '思维链单独展示；思考 token 计入上限，建议 8192–16384' },
    { id: 'openai-o', name: 'OpenAI o 系列 / GPT-5', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', reasoning: true, maxTokens: 8192, tokenParam: 'max_completion_tokens', tip: '此类模型不接受 temperature，且须用 max_completion_tokens' },
    { id: 'hunyuan', name: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbo', maxTokens: 4096, tip: '模型名可在控制台按实际可用型号修改' },
    { id: 'qwen', name: '通义千问（兼容模式）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', maxTokens: 4096, tip: '使用百炼 OpenAI 兼容端点；thinking 模型请加勾「推理模型」' },
    { id: 'doubao', name: '豆包 / 火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '', maxTokens: 4096, tip: '模型处填方舟接入点 ID（ep-xxxxxxxx）或模型名' },
    { id: 'kimi', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', maxTokens: 4096, tip: '' },
    { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', maxTokens: 4096, tip: '' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', maxTokens: 4096, tip: '' },
    { id: 'custom', name: '自定义 / 中转服务', baseUrl: '', model: '', maxTokens: 4096, tip: '填任意 OpenAI 兼容端点，如 one-api / new-api / 本地 Ollama' }
  ];

  // 七段式断语约需 2500–4000 tokens；推理模型的思维链同样占用上限，故默认 4096、可到 32768。
  var DEFAULT_CFG = {
    preset: 'deepseek', baseUrl: PRESETS[0].baseUrl, apiKey: '', model: PRESETS[0].model,
    temperature: 0.6, maxTokens: 4096, tokenParam: 'auto', reasoning: false, stream: true
  };

  var Storage = {
    get: function (k, def) {
      if (root.NativeLLM && root.NativeLLM.getPref) { var v = root.NativeLLM.getPref(k); return (v === null || v === undefined || v === '') ? def : v; }
      try { var s = localStorage.getItem(k); return s === null ? def : s; } catch (e) { return def; }
    },
    set: function (k, v) {
      if (root.NativeLLM && root.NativeLLM.setPref) { root.NativeLLM.setPref(k, String(v)); return; }
      try { localStorage.setItem(k, String(v)); } catch (e) { }
    }
  };
  function loadCfg() {
    try {
      var s = Storage.get('llm_cfg', null);
      if (!s) return Object.assign({}, DEFAULT_CFG);
      var raw = JSON.parse(s) || {};
      var c = Object.assign({}, DEFAULT_CFG, raw);
      // v1.0 旧配置迁移：判断原始对象（合并后的 DEFAULT_CFG 已带 tokenParam）
      if (!raw.tokenParam) {
        c.tokenParam = 'auto';
        if (!raw.maxTokens || Number(raw.maxTokens) <= 2048) c.maxTokens = 4096;
      }
      if (c.reasoning === undefined) c.reasoning = false;
      c.maxTokens = Math.min(65536, Math.max(256, Number(c.maxTokens) || 4096));
      return c;
    } catch (e) { return Object.assign({}, DEFAULT_CFG); }
  }
  function saveCfg(c) { Storage.set('llm_cfg', JSON.stringify(c)); }
  function presetOf(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return PRESETS[0]; }

  // ---------- Prompt 构造 ----------
  function slim(pan) {
    if (pan.engine === 'liuyao') return {
      engine: 'liuyao', meta: pan.meta, ben: pan.ben, bian: pan.bian,
      lines: pan.lines, dong: pan.dong,
      yao: pan.yao.map(function (a) {
        return {
          pos: a.label, liushen: a.liushen, shi: a.shi, ying: a.ying, dong: a.dong, anDong: a.anDong,
          ben: a.ben, flags: a.flags, notes: a.notes,
          bian: a.bian ? { gan: a.bian.gan, zhi: a.bian.zhi, wx: a.bian.wx, liuqin: a.bian.liuqin, relations: a.bian.relations } : null
        };
      }),
      fushen: pan.fushen, yongshen: pan.yongshen, yuanJi: pan.yuanJi, guaInfo: pan.guaInfo, yingqi: pan.yingqi
    };
    return {
      engine: 'liuren', meta: pan.meta, pan: pan.pan, sikes: pan.sikes, jiu: pan.jiu,
      sanchuan: pan.sanchuan, sanhe: pan.sanhe,
      tianjiang: { guirenZhi: pan.tianjiang.guirenZhi, guirenGong: pan.tianjiang.guirenGong, shun: pan.tianjiang.shun },
      shensha: pan.shensha, nianming: pan.nianming, xingnian: pan.xingnian, leishen: pan.leishen
    };
  }
  function buildSystem(pan) {
    var s = K.SYSTEM_BASE + '\n\n';
    s += '【本课适用的经典条文】（引用时务必写出方括号内的编号）\n' + K.format(pan.evidence || []) + '\n\n';
    if (pan.engine === 'liuyao') {
      s += '【六亲类象】\n' + Object.keys(G.LIUQIN_LEIXIANG).map(function (k) { return k + '：' + G.LIUQIN_LEIXIANG[k]; }).join('\n') + '\n\n';
      s += '【六神类象】\n' + Object.keys(G.LIUSHEN_LEIXIANG).map(function (k) { return k + '：' + G.LIUSHEN_LEIXIANG[k]; }).join('\n') + '\n\n';
      s += '【六爻断法次第】定用神（两现依《增删卜易·两现章》权衡，兼顾「实空实破」之变）→ 审月建日辰旺衰 → 辨生克冲合刑害墓空破 → 看动变（回头生克、进退神、伏吟反吟）→ 参世应、独发独静、六冲六合、游魂归魂 → 断吉凶与应期。\n';
      s += '【应期十法】静空出旬冲、动空出旬值、合待冲、冲待合、休囚待生旺、旺静待冲动、旺动待墓库、入墓待冲开、受制待制神日月、绝处逢生待生扶。\n';
    } else {
      s += '【十二天将吉凶与类象】\n' + K.TIANJIANG.map(function (t) { return t.name + '（' + t.nature + '）：' + t.xiang; }).join('\n') + '\n\n';
      s += '【十二月将类象】\n' + K.YUEJIANG_XIANG.map(function (t) { return t.name + t.zhi + '：' + t.xiang; }).join('\n') + '\n\n';
      s += '【六壬断法次第】先定课体基调（九宗门）→ 依占题立类神（《六壬断案》：课体结构只是象，类神才定结局）→ 审干支、四课、三传的生克旺衰空破 → 看天将顺逆、贵人昼夜、神煞与年命 → 参毕法赋条目 → 断吉凶、应期与人事。\n';
      s += '【八煞】德、合、鬼、墓、破、害、刑、冲；德合为解，鬼墓为缠，破害刑冲为变动损伤。\n';
    }
    s += '\n【硬性约束】不得改动或重算盘面数值；不得杜撰古籍原文；每条依据须能对应到具体爻位/课传；结论用或然表述；结尾附一句「以上为传统术数义理研习，不构成决策依据」。';
    return s;
  }
  var OUTPUT_FORMAT = [
    '请按以下 Markdown 结构输出（每节 2-5 句，务必具体、不要空话）：',
    '## 一、定用神／类神', '说明本课取何者为用，两现或伏藏时写出取舍理由，并标注依据编号。',
    '## 二、旺衰与生克链', '逐项写明月建、日辰、动爻／三传对用神的作用，指出最关键的一处生或克。',
    '## 三、格局与动变', '六爻看动变、世应、六冲六合、独发独静；六壬看课体、三传递生克、天将顺逆、年命。',
    '## 四、吉凶倾向', '给出「倾向／多主／宜防」的判断，并说明成立条件与可能被推翻的条件。',
    '## 五、应期与关键节点', '结合盘面给出的应期线索，说明应在何时、以何为验。',
    '## 六、经典依据', '列出本课用到的条目编号及一句话对应（格式：`[编号] 书name · 如何落到本课`）。',
    '## 七、提醒', '一句务实提醒 + 免责声明。',
    '直接输出上述七节，不要在正文里复述思考过程或盘面 JSON。'
  ].join('\n');
  function buildUser(pan, question, history, withFormat) {
    var u = '【占题】' + pan.meta.zhanti + '（' + pan.meta.zhantiNote + '）\n';
    u += '【所问】' + (pan.meta.note || question || '未填写具体事由，按占题常法断') + '\n';
    u += '【起课时间】' + pan.meta.time + '｜' + [pan.meta.yearGZ, pan.meta.monthGZ, pan.meta.dayGZ, pan.meta.timeGZ].join(' ') + '\n\n';
    u += '【排盘盘面（本地引擎精算，不得改动）】\n' + pan.textPan + '\n\n';
    u += '【结构化盘面 JSON】\n```json\n' + JSON.stringify(slim(pan), null, 1) + '\n```\n\n';
    if (history && history.length) u += '【此前问答】\n' + history.slice(-4).map(function (h) { return (h.role === 'user' ? '问：' : '答：') + h.content; }).join('\n') + '\n\n';
    u += '【本次任务】' + (question || '依经典义理完整解读此盘') + '\n';
    if (withFormat !== false) u += '\n' + OUTPUT_FORMAT;
    return u;
  }
  function buildMessages(pan, question, history) {
    var h = (history || []).slice(-6).map(function (x) { return { role: x.role, content: x.content }; });
    var msgs = [
      { role: 'system', content: buildSystem(pan) },
      { role: 'user', content: buildUser(pan, h.length ? '' : (question || ''), [], h.length ? false : true) }
    ];
    if (h.length) {
      msgs = msgs.concat(h);
      msgs.push({ role: 'user', content: (question || '请继续补充') + '\n\n（请针对此追问作答，不要重复整盘；术语须准确，依据须标注条目编号，结论用或然表述。）' });
    }
    return msgs;
  }

  // ---------- 请求参数 ----------
  /** OpenAI o 系列 / GPT-5 只认 max_completion_tokens，其余厂商用 max_tokens */
  function tokenParamOf(cfg) {
    var p = cfg.tokenParam || 'auto';
    if (p === 'max_tokens' || p === 'max_completion_tokens') return p;
    return /^(o\d|gpt-5|gpt5)/i.test((cfg.model || '').trim()) ? 'max_completion_tokens' : 'max_tokens';
  }
  function isReasoning(cfg) {
    return !!cfg.reasoning || tokenParamOf(cfg) === 'max_completion_tokens';
  }
  function clampTokens(v) { return Math.min(65536, Math.max(256, Number(v) || 4096)); }
  function body(cfg, messages, stream) {
    var b = { model: cfg.model, messages: messages, stream: !!stream };
    if (!isReasoning(cfg)) {
      var t = Number(cfg.temperature);
      b.temperature = isFinite(t) ? t : 0.6;
    }
    b[tokenParamOf(cfg)] = clampTokens(cfg.maxTokens);
    return b;
  }
  /** 400 且错误指向 token 参数 / temperature 时，换一套参数重试一次 */
  function altBody(b, err) {
    var e = String(err).toLowerCase(), n = Object.assign({}, b), changed = false;
    var reject = /not supported|unsupported|deprecated/.test(e);
    if (n.max_tokens !== undefined && (e.indexOf('max_completion_tokens') >= 0 || (e.indexOf('max_tokens') >= 0 && reject))) {
      n.max_completion_tokens = n.max_tokens; delete n.max_tokens; changed = true;
    } else if (n.max_completion_tokens !== undefined && e.indexOf('max_tokens') >= 0 && e.indexOf('max_completion_tokens') < 0) {
      n.max_tokens = n.max_completion_tokens; delete n.max_completion_tokens; changed = true;
    }
    if (e.indexOf('temperature') >= 0 && /not supported|unsupported|only/.test(e) && n.temperature !== undefined) {
      delete n.temperature; changed = true;
    }
    return changed ? n : null;
  }

  /** 严格判型：content 为 null 时必须返回空串，绝不能变成 "null" */
  function parseChunkJS(o) {
    var c0 = (o && o.choices && o.choices[0]) || {};
    var d = c0.delta || c0.message || {};
    function s(v) { return typeof v === 'string' ? v : ''; }
    function arr(v) {
      if (!Array.isArray(v)) return '';
      return v.map(function (x) { return typeof x === 'string' ? x : s(x && x.text); }).join('');
    }
    function pick(keys) {
      for (var i = 0; i < keys.length; i++) { var v = s(d[keys[i]]); if (v) return v; }
      return '';
    }
    var usage = '';
    var u = o && o.usage;
    if (u) {
      var rt = 0, det = u.completion_tokens_details || u.output_tokens_details;
      if (det) rt = det.reasoning_tokens || 0;
      usage = '输入 ' + (u.prompt_tokens || 0) + ' / 输出 ' + (u.completion_tokens || 0) +
        (rt ? '（思维链 ' + rt + '）' : '') + ' tokens';
    }
    return {
      content: pick(['content', 'text', 'output_text']) || arr(d.content),
      reasoning: pick(['reasoning_content', 'reasoning', 'thinking', 'thought', 'reasoning_content_delta']) || arr(d.reasoning_content),
      finishReason: s(c0.finish_reason), usage: usage
    };
  }

  // ---------- 调用通道 ----------
  var seq = 0;
  var BUS = {
    map: {},
    on: function (id, type, payload) {
      var h = BUS.map[id];
      if (!h) return;
      try {
        var d = JSON.parse(payload || '{}');
        if (type === 'delta') h.onDelta(d.text || '');
        else if (type === 'reasoning') { if (h.onReasoning) h.onReasoning(d.text || ''); }
        else if (type === 'done') { if (h.onDone) h.onDone(d); delete BUS.map[id]; }
        else if (type === 'error') { if (h.onError) h.onError(d.message || '未知错误'); delete BUS.map[id]; }
      } catch (e) { if (h.onError) h.onError('回调解析失败：' + e.message); delete BUS.map[id]; }
    }
  };
  root.LLMBus = BUS;

  function normalizeBase(b) {
    b = (b || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
    return b;
  }
  function endpoint(cfg) {
    var b = normalizeBase(cfg.baseUrl);
    return b.replace(/\/chat\/completions$/, '') + '/chat/completions';
  }
  function headers(cfg, stream) {
    var h = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg.apiKey || '') };
    if (stream) h['Accept'] = 'text/event-stream';
    return h;
  }

  function request(cfg, messages, handlers, opts) {
    opts = opts || {};
    var stream = !!cfg.stream && !opts.forceNonStream;
    var abortFn = function () { };
    if (!cfg.apiKey && !opts.allowEmptyKey) { handlers.onError('尚未填写 API Key，请在「设置」中配置；也可先用「本地规则解读」离线查看。'); return abortFn; }
    if (!cfg.baseUrl || !cfg.model) { handlers.onError('请填写接口地址与模型名称。'); return abortFn; }

    // ---------- 安卓原生桥 ----------
    if (root.NativeLLM && root.NativeLLM.request) {
      var id = 'r' + (++seq) + '_' + Date.now();
      BUS.map[id] = handlers;
      try {
        root.NativeLLM.request(JSON.stringify({
          id: id, url: endpoint(cfg), apiKey: cfg.apiKey, model: cfg.model,
          stream: stream, allowEmpty: !!opts.allowEmpty,
          body: JSON.stringify(body(cfg, messages, stream))
        }));
      } catch (e) { delete BUS.map[id]; handlers.onError('原生请求启动失败：' + e.message); }
      return function () { if (root.NativeLLM.cancel) root.NativeLLM.cancel(id); delete BUS.map[id]; };
    }

    // ---------- 浏览器预览通道 ----------
    var aborted = false;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var acc = '', thinking = '', truncated = false, usage = '';
    function take(c) {
      if (c.reasoning) { thinking += c.reasoning; if (handlers.onReasoning) handlers.onReasoning(c.reasoning); }
      if (c.content) { acc += c.content; handlers.onDelta(c.content); }
      if (c.finishReason === 'length') truncated = true;
      if (c.usage) usage = c.usage;
    }
    function finish() {
      // 只给 reasoning_content、正文恒为 null 的非标准中转：思维链兜底为正文
      if (!acc && thinking) { acc = thinking; handlers.onDelta(thinking); }
      if (!acc) {
        if (opts.allowEmpty) { if (handlers.onDone) handlers.onDone({ text: '', truncated: truncated, usage: usage }); return; }
        handlers.onError('接口未返回正文（content 为 null）。若为推理模型，请在「设置」勾选「推理模型」并调高 Token 上限。');
        return;
      }
      if (handlers.onDone) handlers.onDone({ text: acc, truncated: truncated, usage: usage });
    }
    // 全 ES5 语法：Android 6 的旧版 WebView 不支持 async/await，
    // 一旦脚本里出现该语法，整个 llm.js 会解析失败（即使安卓端走原生桥、不执行此分支）。
    (function () {
      function fetchOpts(b) {
        var o = { method: 'POST', headers: headers(cfg, !!b.stream), body: JSON.stringify(b) };
        if (ctrl) o.signal = ctrl.signal;
        return o;
      }
      function send(b, retried) {
        return fetch(endpoint(cfg), fetchOpts(b)).then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              if (res.status === 400 && !retried) {
                var alt = altBody(b, t);
                if (alt) return send(alt, true);
              }
              throw new Error('HTTP ' + res.status + '：' + t.slice(0, 400));
            });
          }
          if (!b.stream || !res.body) {
            return res.json().then(function (j) { take(parseChunkJS(j)); finish(); });
          }
          var reader = res.body.getReader();
          var dec = (typeof TextDecoder !== 'undefined') ? new TextDecoder() : null;
          var buf = '', stopped = false, pending = [];
          function decode(v) {
            if (dec) return dec.decode(v, { stream: true });
            var s = '', a = new Uint8Array(v);
            for (var k = 0; k < a.length; k++) s += String.fromCharCode(a[k]);
            try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
          }
          function flush() {
            if (!pending.length) return;
            try { take(parseChunkJS(JSON.parse(pending.join('\n')))); } catch (e) { }
            pending = [];
          }
          function handleLines() {
            var lines = buf.split(/\r?\n/);
            buf = lines.pop();
            for (var i = 0; i < lines.length && !stopped; i++) {
              var ln = lines[i].trim();
              if (ln.indexOf('data:') !== 0) {
                if (!ln) flush();   // 空行 = 事件边界，尝试合并跨行 JSON
                continue;
              }
              var d = ln.slice(5).trim();
              if (d.indexOf('[DONE]') >= 0) { stopped = true; break; }
              if (!d) continue;
              try {
                take(parseChunkJS(JSON.parse(d)));   // 逐行优先，兼容无空行分隔的服务
                pending = [];
              } catch (e) { pending.push(d); }
            }
          }
          function pump() {
            if (stopped) return Promise.resolve();
            return reader.read().then(function (r) {
              if (r.done) { stopped = true; return; }
              buf += decode(r.value);
              handleLines();
            }).then(function () { return stopped ? null : pump(); });
          }
          return pump().then(function () {
            if (buf.trim()) {
              var tail = buf.trim().replace(/^data:\s*/, '');
              if (tail.indexOf('[DONE]') < 0) { try { take(parseChunkJS(JSON.parse(tail))); } catch (e) { } }
            }
            flush();
            finish();
          });
        });
      }
      var p;
      try {
        p = send(body(cfg, messages, stream), false);
      } catch (e) {
        handlers.onError('当前 WebView 不支持 fetch：' + e.message);
        return;
      }
      p.catch(function (e) {
        if (aborted) return;
        if (/Failed to fetch|NetworkError|CORS/i.test(e.message)) {
          handlers.onError('浏览器预览受跨域限制：' + e.message + '。安卓端由原生层发请求，无此问题；也可改用支持 CORS 的中转端点。');
        } else handlers.onError(e.message);
      });
    })();
    return function () { aborted = true; if (ctrl) { try { ctrl.abort(); } catch (e) { } } };
  }

  function test(cfg, done) {
    var msgs = [{ role: 'system', content: '你是连通性测试助手。' }, { role: 'user', content: '请只回复两个字：可用' }];
    var acc = '';
    return request(Object.assign({}, cfg, { maxTokens: 96, stream: false }), msgs, {
      onDelta: function (t) { acc += t; },
      onDone: function () {
        done(true, acc.trim()
          ? '连接正常，模型回复：' + acc.trim().slice(0, 40)
          : '连接正常（推理模型本次额度用于思考、未返回正文，可正常使用）');
      },
      onError: function (e) { done(false, e); }
    }, { allowEmpty: true });
  }

  function localFallback(pan) {
    var L = [];
    L.push('> **离线规则解读**（未调用大模型）。以下由本地引擎按经典规则推演，供研习参考，非完整断语。\n');
    L.push('## 一、定用神／类神');
    if (pan.engine === 'liuyao') {
      if (pan.yongshen) L.push('取 **' + pan.yongshen.liuqin + '** 为用神（' + pan.yongshen.label + '，' + pan.yongshen.zhi + pan.yongshen.wx + '，' + pan.yongshen.state + '）。' +
        (pan.yongshen.twoXian ? '用神两现，按《增删卜易·两现章》古法取旺相动爻不空不破；野鹤另有「舍不空而用旬空」，验在实空实破，宜并存参详。' : '') +
        (pan.yongshen.type === '伏藏' ? '用神伏藏，' + (pan.yongshen.keChu ? '有引拔之机' : '受制难出') + '。' : ''));
      if (pan.yuanJi) L.push('原神' + pan.yuanJi.原神.wx + '、忌神' + pan.yuanJi.忌神.wx + '、仇神' + pan.yuanJi.仇神.wx + '。');
    } else {
      L.push('课体 **' + pan.jiu.keTi + '**（' + pan.jiu.method + '），占题类神：' + pan.leishen.join('、') + '。');
    }
    L.push('\n## 二、要点');
    pan.local.points.forEach(function (p) { L.push('- ' + p); });
    L.push('\n## 三、倾向');
    L.push('**' + pan.local.verdict + '**（规则评分 ' + pan.local.score + '）。');
    L.push('\n## 四、经典依据');
    (pan.evidence || []).slice(0, 6).forEach(function (t) { L.push('- `[' + t.id + ']` ' + t.book + '：' + t.gist); });
    L.push('\n## 五、应期线索');
    if (pan.engine === 'liuyao') pan.yingqi.forEach(function (y) { L.push('- ' + y.rule + ' → ' + y.text + (y.days.length ? '（' + y.days.slice(0, 3).map(function (d) { return d.gz + ' ' + d.date; }).join('、') + '）' : '')); });
    else L.push('- 参初传旺衰空亡、类神值日与冲合之期；' + (pan.sanchuan[0].kong ? '初传旬空，多应出旬、实空之期。' : '初传不空，多应值日或合日。'));
    L.push('\n> 配置 API Key 后点「AI 解读」，可获得依《增删卜易》《卜筮正宗》《大六壬指南》《御定六壬直指》《六壬断案》义理展开的完整断语。');
    L.push('\n以上为传统术数义理研习，不构成决策依据。');
    return L.join('\n');
  }

  var API = {
    PRESETS: PRESETS, DEFAULT_CFG: DEFAULT_CFG, Storage: Storage,
    loadCfg: loadCfg, saveCfg: saveCfg, presetOf: presetOf,
    buildMessages: buildMessages, buildSystem: buildSystem, buildUser: buildUser, slim: slim,
    tokenParamOf: tokenParamOf, isReasoning: isReasoning, body: body, altBody: altBody,
    parseChunkJS: parseChunkJS, clampTokens: clampTokens,
    request: request, test: test, localFallback: localFallback, endpoint: endpoint
  };
  root.LLM = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
