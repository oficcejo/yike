/* LLM 通道测试：node tools/test_llm.js
 * 用本地 mock 服务验证浏览器 fetch 流式解析、非流式、错误处理、推理模型 content:null、
 * 思维链分离、finish_reason=length 截断、usage 上报、token 参数 400 自动重试；
 * 并模拟安卓 NativeLLM 桥，验证 LLMBus 的 JSON 转义（中文/换行/引号）与新增事件。
 */
'use strict';
const http = require('http');
const path = require('path');
const J = path.join(__dirname, '..', 'web', 'js');
global.window = global;
require(path.join(J, 'jieqi_data.js'));
require(path.join(J, 'calendar.js'));
require(path.join(J, 'data.js'));
require(path.join(J, 'classics.js'));
const LLM = require(path.join(J, 'llm.js'));

let pass = 0, fail = 0;
function ok(n, c, e) { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (e ? ' → ' + e : '')); } }

const CHUNKS = ['依据 ', '[BSZZ-QJF-01] ', '日辰为主宰', '，用神旺相', '。'];

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer sk-test') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"invalid api key"}}');
      return;
    }
    let j = {};
    try { j = JSON.parse(raw); } catch (e) { }
    const model = j.model || '';

    // 模拟 OpenAI o 系列：拒绝 max_tokens，要求 max_completion_tokens
    if (model === 'badparam-model' && j.max_tokens !== undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"Unsupported parameter: max_tokens is not supported with this model. Use max_completion_tokens instead."}}');
      return;
    }

    if (!j.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (model === 'nonstream-null-model') {
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, reasoning_content: '思考内容兜底' }, finish_reason: 'stop' }] }));
      } else if (model === 'nonstream-empty-model') {
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }] }));
      } else {
        res.end(JSON.stringify({ choices: [{ message: { content: '可用' } }] }));
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
    const send = o => res.write('data: ' + JSON.stringify(o) + '\n\n');
    const chunk = t => ({ choices: [{ delta: { content: t }, finish_reason: null }] });

    // 部分中转服务的 SSE 只发单换行、没有空行分隔
    if (model === 'single-nl-model') {
      CHUNKS.forEach(t => res.write('data: ' + JSON.stringify(chunk(t)) + '\n'));
      res.write('data: [DONE]\n'); res.end(); return;
    }

    if (model === 'null-model' || model === 'trunc-model' || model === 'badparam-model') {
      // 推理模型典型流：首包 role + content:null；思考阶段只给 reasoning_content，content 恒为 null
      send({ choices: [{ delta: { role: 'assistant', content: null }, finish_reason: null }] });
      send({ choices: [{ delta: { content: null, reasoning_content: '先看用神，' }, finish_reason: null }] });
      send({ choices: [{ delta: { content: null, reasoning_content: '再审月建。' }, finish_reason: null }] });
      send({ choices: [{ delta: { content: null }, finish_reason: null }] });
      CHUNKS.forEach(t => send(chunk(t)));
      const fr = model === 'trunc-model' ? 'length' : 'stop';
      send({ choices: [{ delta: {}, finish_reason: fr }], usage: { prompt_tokens: 1200, completion_tokens: 800, completion_tokens_details: { reasoning_tokens: 500 } } });
      res.write('data: [DONE]\n\n'); res.end(); return;
    }

    CHUNKS.forEach((t, i) => setTimeout(() => {
      send(chunk(t));
      if (i === CHUNKS.length - 1) { res.write('data: [DONE]\n\n'); res.end(); }
    }, i * 4));
  });
});

function req(cfg, msgs) {
  return new Promise(resolve => {
    let text = '', thinking = '', meta = null, err = null;
    LLM.request(cfg, msgs, {
      onDelta: t => { text += t; },
      onReasoning: t => { thinking += t; },
      onDone: d => { meta = d || {}; resolve({ text, thinking, meta, err }); },
      onError: e => { err = e; resolve({ text, thinking, meta, err }); }
    });
  });
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/v1';
  const msgs = [{ role: 'system', content: 'test' }, { role: 'user', content: '请解读' }];
  const good = { baseUrl: base, apiKey: 'sk-test', model: 'mock-model', stream: true, temperature: 0.6, maxTokens: 4096, tokenParam: 'auto' };
  const C = m => Object.assign({}, good, { model: m });

  console.log('=== 浏览器通道（fetch / SSE） ===');
  let r1 = await req(good, msgs);
  ok('流式分块拼接', r1.text === CHUNKS.join('') && !r1.err, JSON.stringify(r1));
  ok('无错误回调', r1.err === null);

  let r2 = await req(Object.assign({}, good, { stream: false }), msgs);
  ok('非流式 JSON 解析', r2.text === '可用' && !r2.err, JSON.stringify(r2));

  let r3 = await req(Object.assign({}, good, { apiKey: 'bad' }), msgs);
  ok('HTTP 401 错误处理', !!r3.err && r3.err.indexOf('401') >= 0, r3.err);

  let r4 = await req(Object.assign({}, good, { apiKey: '' }), msgs);
  ok('未配置 Key 给出引导', !!r4.err && r4.err.indexOf('API Key') >= 0, r4.err);

  const tested = await new Promise(resolve => LLM.test(Object.assign({}, good, { stream: false }), (okFlag, msg) => resolve({ okFlag, msg })));
  ok('测试连接成功', tested.okFlag === true && tested.msg.indexOf('可用') >= 0, JSON.stringify(tested));

  const testedEmpty = await new Promise(resolve => LLM.test(Object.assign({}, C('nonstream-empty-model'), { stream: false }), (okFlag, msg) => resolve({ okFlag, msg })));
  ok('推理模型空正文时测试连接不误报', testedEmpty.okFlag === true && /连接正常/.test(testedEmpty.msg), JSON.stringify(testedEmpty));

  console.log('\n=== 推理模型 / content:null 回归 ===');
  let rn = await req(C('null-model'), msgs);
  ok('不再出现 nullnull 污染', rn.text.indexOf('null') < 0 && rn.text === CHUNKS.join(''), JSON.stringify(rn.text));
  ok('思维链走独立通道', rn.thinking === '先看用神，再审月建。', JSON.stringify(rn.thinking));
  ok('思维链不混入正文', rn.text.indexOf('先看用神') < 0);
  ok('usage 上报含思维链 token', /思维链 500/.test(rn.meta.usage || ''), JSON.stringify(rn.meta));
  ok('正常结束不误报截断', !rn.meta.truncated);

  let rs = await req(C('single-nl-model'), msgs);
  ok('单换行 SSE（无空行分隔）可解析', rs.text === CHUNKS.join('') && !rs.err, JSON.stringify(rs));

  let rt = await req(C('trunc-model'), msgs);
  ok('finish_reason=length 标记截断', rt.meta.truncated === true, JSON.stringify(rt.meta));

  let rb = await req(C('badparam-model'), msgs);
  ok('400 自动换 max_completion_tokens 重试', rb.text === CHUNKS.join('') && !rb.err, JSON.stringify(rb));

  let rn2 = await req(Object.assign({}, C('nonstream-null-model'), { stream: false }), msgs);
  ok('非流式 content:null 由思维链兜底', rn2.text === '思考内容兜底' && !rn2.err, JSON.stringify(rn2));
  let re = await req(Object.assign({}, C('nonstream-empty-model'), { stream: false }), msgs);
  ok('无正文时明确报错而非显示 null', !!re.err && re.err.indexOf('未返回正文') >= 0, String(re.err));

  console.log('\n=== 请求参数与配置迁移 ===');
  const b1 = LLM.body(Object.assign({}, good, { maxTokens: 4096 }), msgs, true);
  ok('默认使用 max_tokens', b1.max_tokens === 4096 && b1.max_completion_tokens === undefined, JSON.stringify(b1));
  ok('普通模型带 temperature', b1.temperature === 0.6);
  const b2 = LLM.body(Object.assign({}, good, { reasoning: true, maxTokens: 8192 }), msgs, true);
  ok('推理模型去掉 temperature', b2.temperature === undefined && b2.max_tokens === 8192);
  const b3 = LLM.body(Object.assign({}, good, { model: 'o3-mini', maxTokens: 8192 }), msgs, true);
  ok('o 系列自动识别 max_completion_tokens', b3.max_completion_tokens === 8192 && b3.max_tokens === undefined, JSON.stringify(b3));
  ok('Token 上限可到 32768', LLM.clampTokens(32768) === 32768 && LLM.clampTokens(999999) === 65536);
  ok('旧配置 2048 自动升到 4096', (() => {
    global.NativeLLM = { getPref: () => JSON.stringify({ maxTokens: 2048, preset: 'deepseek', baseUrl: 'x', model: 'y' }), setPref() { } };
    const c = LLM.loadCfg(); delete global.NativeLLM;
    return c.maxTokens === 4096 && c.tokenParam === 'auto';
  })());
  ok('parseChunkJS 严格判型', LLM.parseChunkJS({ choices: [{ delta: { content: null, reasoning_content: '思' }, finish_reason: null }] }).content === '');
  ok('altBody 换参数名', (() => {
    const a = LLM.altBody({ max_tokens: 4096, temperature: 0.6 }, 'max_tokens is not supported, use max_completion_tokens');
    return a && a.max_completion_tokens === 4096 && a.max_tokens === undefined && a.temperature === 0.6;
  })());

  console.log('\n=== 安卓原生桥（NativeLLM / LLMBus） ===');
  const weird = '中文\n换行 "双引号" \\ 反斜杠 <b>标签</b>';
  delete global.NativeLLM;
  global.NativeLLM = {
    requests: [],
    request(payload) {
      const o = JSON.parse(payload);
      this.requests.push(o);
      const emit = (type, data) => setTimeout(() => global.LLMBus.on(o.id, type, JSON.stringify(data)), 0);
      emit('reasoning', { text: '内部思考' });
      emit('delta', { text: weird });
      emit('delta', { text: '｜第二段' });
      emit('done', { truncated: true, usage: '输入 100 / 输出 200 tokens' });
    },
    cancel() { }
  };
  let r5 = await req(good, msgs);
  ok('桥回调文本完整（转义无损）', r5.text === weird + '｜第二段' && !r5.err, JSON.stringify(r5));
  ok('桥 reasoning 事件可用', r5.thinking === '内部思考', JSON.stringify(r5.thinking));
  ok('桥 done 元数据透传', r5.meta.truncated === true && /输出 200/.test(r5.meta.usage || ''), JSON.stringify(r5.meta));
  ok('桥请求带上端点与模型', global.NativeLLM.requests[0].url.endsWith('/chat/completions') &&
    JSON.parse(global.NativeLLM.requests[0].body).model === 'mock-model');
  ok('桥请求体含 system/user 与 4096 上限', (() => {
    const b = JSON.parse(global.NativeLLM.requests[0].body);
    return b.messages.length >= 2 && b.messages[0].role === 'system' && b.stream === true && b.max_tokens === 4096;
  })());

  global.NativeLLM.request = payload => {
    const o = JSON.parse(payload);
    setTimeout(() => global.LLMBus.on(o.id, 'error', JSON.stringify({ message: '网络不可用\n请检查' })), 0);
  };
  let r6 = await req(good, msgs);
  ok('桥错误回调可解析', !!r6.err && r6.err.indexOf('网络不可用') >= 0, r6.err);

  console.log('\n=== Prompt 端点规范化 ===');
  ok('末尾斜杠归一', LLM.endpoint({ baseUrl: 'https://api.deepseek.com/v1/' }) === 'https://api.deepseek.com/v1/chat/completions');
  ok('已含路径不重复', LLM.endpoint({ baseUrl: 'https://x.com/v1/chat/completions' }) === 'https://x.com/v1/chat/completions');
  ok('自动补 https', LLM.endpoint({ baseUrl: 'api.example.com/v1' }) === 'https://api.example.com/v1/chat/completions');

  server.close();
  console.log('\n============================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
