package cn.ws9.liuyao;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * 易课 Android 壳。
 * - 排盘与界面全部在 assets/www 内，纯本地、不依赖网络；
 * - 仅 LLM 解读由原生层发起 OpenAI 兼容请求（避免 WebView file:// 的 CORS 限制），
 *   以 SSE 逐块回传 JS；
 * - 配置与历史存 SharedPreferences，API Key 不出本机。
 */
public class MainActivity extends Activity {

    private static final String TAG = "YikeWeb";
    private WebView web;
    private SharedPreferences prefs;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, HttpURLConnection> running = new ConcurrentHashMap<>();
    // ConcurrentHashMap.newKeySet() 是 API 24+；API 23 需改用 newSetFromMap
    private final Set<String> cancelled =
            Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("yike", MODE_PRIVATE);
        enableTls12IfNeeded();

        Window w = getWindow();
        w.setStatusBarColor(0xFFF4F6F9);
        w.setNavigationBarColor(0xFFFFFFFF);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = w.getDecorView();
            int f = decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) f |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            decor.setSystemUiVisibility(f);
        }

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setDefaultTextEncodingName("UTF-8");
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            private boolean handleUrl(String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception e) {
                    Log.w(TAG, "无法打开外部链接", e);
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d(TAG, "[" + cm.lineNumber() + "] " + cm.message());
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "NativeLLM");
        web.loadUrl("file:///android_asset/www/index.html");
    }

    // ---------------- Android 6 (API 23) TLS 兼容 ----------------
    /**
     * 部分 Android 5/6 ROM 的 HttpsURLConnection 默认不启用 TLSv1.1/1.2，
     * 而各家大模型 API 已强制 TLS 1.2，会直接 SSLHandshakeException。
     * 仅在 API <= 23 时显式启用，高版本沿用系统默认。
     */
    private void enableTls12IfNeeded() {
        if (Build.VERSION.SDK_INT > 23) return;
        try {
            SSLContext sc = SSLContext.getInstance("TLSv1.2");
            sc.init(null, null, null);
            HttpsURLConnection.setDefaultSSLSocketFactory(new Tls12Factory(sc.getSocketFactory()));
        } catch (Exception e) {
            Log.w(TAG, "TLSv1.2 显式启用失败，沿用系统默认", e);
        }
    }

    private static class Tls12Factory extends SSLSocketFactory {
        private static final List<String> WANTED = Arrays.asList("TLSv1.2", "TLSv1.1", "TLSv1");
        private final SSLSocketFactory base;

        Tls12Factory(SSLSocketFactory base) { this.base = base; }

        private Socket patch(Socket s) {
            if (s instanceof SSLSocket) {
                SSLSocket t = (SSLSocket) s;
                List<String> enabled = new ArrayList<>();
                for (String p : t.getSupportedProtocols()) if (WANTED.contains(p)) enabled.add(p);
                if (!enabled.isEmpty()) t.setEnabledProtocols(enabled.toArray(new String[enabled.size()]));
            }
            return s;
        }

        @Override public String[] getDefaultCipherSuites() { return base.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return base.getSupportedCipherSuites(); }

        @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose) throws IOException {
            return patch(base.createSocket(s, host, port, autoClose));
        }
        @Override public Socket createSocket(String host, int port) throws IOException, UnknownHostException {
            return patch(base.createSocket(host, port));
        }
        @Override public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException, UnknownHostException {
            return patch(base.createSocket(host, port, localHost, localPort));
        }
        @Override public Socket createSocket(InetAddress host, int port) throws IOException {
            return patch(base.createSocket(host, port));
        }
        @Override public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
            return patch(base.createSocket(address, port, localAddress, localPort));
        }
    }

    // ---------------- JS 桥 ----------------
    private class Bridge {
        @JavascriptInterface
        public String getPref(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void setPref(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public String getVersion() {
            return "v1.1";
        }

        @JavascriptInterface
        public void copy(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("易课", text));
                Toast.makeText(MainActivity.this, "已复制到剪贴板", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(Intent.createChooser(i, "分享断语"));
                } catch (Exception e) {
                    Log.w(TAG, "分享失败", e);
                }
            });
        }

        @JavascriptInterface
        public void request(String payload) {
            startRequest(payload);
        }

        @JavascriptInterface
        public void cancel(String id) {
            cancelled.add(id);
            HttpURLConnection c = running.remove(id);
            if (c != null) c.disconnect();
        }
    }

    // ---------------- LLM 请求 ----------------
    private void startRequest(String payload) {
        try {
            JSONObject p = new JSONObject(payload);
            final String id = p.optString("id");
            final String url = p.optString("url");
            final String key = p.optString("apiKey");
            final boolean stream = p.optBoolean("stream", true);
            final String body = p.optString("body");
            final boolean allowEmpty = p.optBoolean("allowEmpty", false);
            pool.execute(() -> doRequest(id, url, key, stream, body, allowEmpty));
        } catch (Exception e) {
            Log.e(TAG, "请求参数解析失败", e);
        }
    }

    private void doRequest(String id, String urlStr, String apiKey, boolean stream,
                           String body, boolean allowEmpty) {
        doRequest(id, urlStr, apiKey, stream, body, allowEmpty, false);
    }

    private void doRequest(String id, String urlStr, String apiKey, boolean stream,
                           String body, boolean allowEmpty, boolean retried) {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(urlStr);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(180000);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setRequestProperty("Accept", stream ? "text/event-stream" : "application/json");
            conn.setRequestProperty("User-Agent", "Yike/1.0 Android");
            running.put(id, conn);

            OutputStream os = conn.getOutputStream();
            os.write(body.getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                String err = readAll(conn.getErrorStream());
                if (err.length() > 500) err = err.substring(0, 500);
                // 参数不兼容（max_tokens / max_completion_tokens / temperature）自动换一套重试一次
                if (code == 400 && !retried) {
                    String alt = alternativeBody(body, err);
                    if (alt != null) {
                        conn.disconnect();
                        running.remove(id);
                        doRequest(id, urlStr, apiKey, stream, alt, allowEmpty, true);
                        return;
                    }
                }
                emit(id, "error", payloadOf("message", "HTTP " + code + "：" + err));
                return;
            }

            Resp r = stream ? streamResponse(id, conn) : wholeResponse(id, conn);
            if (!cancelled.contains(id)) {
                if (allowEmpty) {
                    emitDone(id, r);   // 连通性测试：推理模型可能把额度全用于思考而正文为空
                } else if (!r.error.isEmpty()) {
                    emit(id, "error", payloadOf("message", r.error));
                } else if (!r.gotContent) {
                    emit(id, "error", payloadOf("message",
                            "接口未返回正文（流式响应中 content 均为 null）。请检查模型名与 Token 上限，或在「设置」勾选「推理模型」；若走中转服务，请确认其返回 OpenAI 兼容格式。"));
                } else {
                    emitDone(id, r);
                }
            }
        } catch (Exception e) {
            if (!cancelled.contains(id)) {
                String msg = e.getClass().getSimpleName() + "：" + (e.getMessage() == null ? "" : e.getMessage());
                emit(id, "error", payloadOf("message", msg));
            }
        } finally {
            running.remove(id);
            cancelled.remove(id);
            if (conn != null) conn.disconnect();
        }
    }

    // ---------------- 响应解析 ----------------
    private static class Chunk {
        String content = "", reasoning = "", finishReason = "", usage = "";
    }

    private static class Resp {
        boolean gotContent = false, truncated = false;
        String usage = "", error = "";
        StringBuilder thinking = new StringBuilder();
    }

    private static final String[] CONTENT_KEYS = {"content", "text", "output_text"};
    private static final String[] REASON_KEYS = {
            "reasoning_content", "reasoning", "thinking", "thought", "reasoning_content_delta"
    };

    /**
     * org.json 的 optString(key, fallback) 在字段值为 JSON null 时返回的是字符串 "null"，
     * 而不是 fallback。推理模型思考阶段的 delta.content 恒为 null，若用 optString 就会
     * 每个 chunk 拼一个 "null"。此处严格只接受 String 类型。
     */
    private static String textOf(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return "";
        Object v = o.opt(key);
        if (v instanceof String) return (String) v;
        return "";
    }

    private static String firstText(JSONObject o, String[] keys) {
        for (String k : keys) {
            String t = textOf(o, k);
            if (!t.isEmpty()) return t;
        }
        return "";
    }

    /** 兼容 content 为 [{"type":"text","text":"..."}] 的形态 */
    private static String textOfArray(JSONArray a) {
        if (a == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < a.length(); i++) {
            JSONObject p = a.optJSONObject(i);
            if (p != null) sb.append(textOf(p, "text"));
            else {
                Object v = a.opt(i);
                if (v instanceof String) sb.append((String) v);
            }
        }
        return sb.toString();
    }

    private Chunk parseChunk(String data) {
        try {
            JSONObject o = new JSONObject(data);
            Chunk c = new Chunk();
            JSONObject usage = o.optJSONObject("usage");
            if (usage != null) {
                int pt = usage.optInt("prompt_tokens", 0);
                int ct = usage.optInt("completion_tokens", 0);
                int rt = 0;
                JSONObject d = usage.optJSONObject("completion_tokens_details");
                if (d == null) d = usage.optJSONObject("output_tokens_details");
                if (d != null) rt = d.optInt("reasoning_tokens", 0);
                c.usage = "输入 " + pt + " / 输出 " + ct + (rt > 0 ? "（思维链 " + rt + "）" : "") + " tokens";
            }
            JSONArray ch = o.optJSONArray("choices");
            if (ch != null && ch.length() > 0) {
                JSONObject c0 = ch.getJSONObject(0);
                c.finishReason = textOf(c0, "finish_reason");
                JSONObject d = c0.optJSONObject("delta");
                if (d == null) d = c0.optJSONObject("message");
                if (d != null) {
                    c.content = firstText(d, CONTENT_KEYS);
                    if (c.content.isEmpty()) c.content = textOfArray(d.optJSONArray("content"));
                    c.reasoning = firstText(d, REASON_KEYS);
                    if (c.reasoning.isEmpty()) c.reasoning = textOfArray(d.optJSONArray("reasoning_content"));
                }
            }
            return c;
        } catch (Exception ignored) {
            return null;   // 心跳 / 非 JSON 行
        }
    }

    private void consume(String id, String data, Resp r) {
        Chunk c = parseChunk(data);
        if (c == null) return;
        if (!c.reasoning.isEmpty()) {
            emit(id, "reasoning", payloadOf("text", c.reasoning));
            r.thinking.append(c.reasoning);
        }
        emitContent(id, c.content, r);
        if ("length".equals(c.finishReason)) r.truncated = true;
        if (!c.usage.isEmpty()) r.usage = c.usage;
    }

    private void emitContent(String id, String text, Resp r) {
        if (text == null || text.isEmpty()) return;
        emit(id, "delta", payloadOf("text", text));
        r.gotContent = true;
    }

    /** SSE 流式：按空行切事件，兼容多行 data、思维链字段、finish_reason 与 usage */
    private Resp streamResponse(String id, HttpURLConnection conn) throws Exception {
        Resp r = new Resp();
        BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder dataBuf = new StringBuilder();
        StringBuilder rawJson = new StringBuilder();
        String line;
        while (!cancelled.contains(id) && (line = br.readLine()) != null) {
            String t = line.trim();
            if (t.startsWith("data:")) {
                String d = t.substring(5).trim();
                if ("[DONE]".equals(d)) break;
                if (d.isEmpty()) continue;
                // 逐行优先解析：兼容只发单换行、不发空行分隔的中转服务
                if (parseChunk(d) != null) {
                    consume(id, d, r);
                    continue;
                }
                if (dataBuf.length() > 0) dataBuf.append('\n');
                dataBuf.append(d);
            } else if (t.isEmpty()) {
                if (dataBuf.length() > 0) {
                    consume(id, dataBuf.toString(), r);
                    dataBuf.setLength(0);
                }
            } else if (t.startsWith("{")) {
                rawJson.append(t);   // 中转忽略 stream 参数，直接吐完整 JSON
            }
        }
        if (dataBuf.length() > 0) consume(id, dataBuf.toString(), r);
        br.close();

        if (!r.gotContent && rawJson.length() > 0) {
            Chunk c = parseChunk(rawJson.toString());
            if (c != null) {
                if (!c.reasoning.isEmpty()) { emit(id, "reasoning", payloadOf("text", c.reasoning)); r.thinking.append(c.reasoning); }
                emitContent(id, c.content, r);
                if ("length".equals(c.finishReason)) r.truncated = true;
                if (!c.usage.isEmpty()) r.usage = c.usage;
            }
        }
        // 只给 reasoning_content、正文恒为 null 的非标准中转：思维链兜底为正文
        if (!r.gotContent && r.thinking.length() > 0) emitContent(id, r.thinking.toString(), r);
        return r;
    }

    /** 非流式完整 JSON */
    private Resp wholeResponse(String id, HttpURLConnection conn) throws Exception {
        Resp r = new Resp();
        String res = readAll(conn.getInputStream());
        Chunk c = parseChunk(res);
        if (c == null) {
            r.error = "响应不是合法 JSON：" + res.substring(0, Math.min(240, res.length()));
            return r;
        }
        if (!c.reasoning.isEmpty()) { emit(id, "reasoning", payloadOf("text", c.reasoning)); r.thinking.append(c.reasoning); }
        emitContent(id, c.content, r);
        if (!r.gotContent && r.thinking.length() > 0) emitContent(id, r.thinking.toString(), r);
        if (!r.gotContent) {
            r.error = "接口未返回正文（content 为 null）。若为推理模型，请在「设置」勾选「推理模型」并调高 Token 上限。响应片段：" + res.substring(0, Math.min(240, res.length()));
        }
        if ("length".equals(c.finishReason)) r.truncated = true;
        if (!c.usage.isEmpty()) r.usage = c.usage;
        return r;
    }

    /** 400 且错误文案指向 token 参数 / temperature 时，换一套参数重试 */
    private String alternativeBody(String body, String err) {
        try {
            JSONObject b = new JSONObject(body);
            String e = err.toLowerCase();
            boolean changed = false;
            boolean askCompletion = e.contains("max_completion_tokens");
            boolean rejectTokens = e.contains("max_tokens") && (e.contains("not supported") || e.contains("unsupported") || e.contains("deprecated"));
            if (b.has("max_tokens") && (askCompletion || rejectTokens)) {
                Object v = b.remove("max_tokens");
                b.put("max_completion_tokens", v);
                changed = true;
            } else if (b.has("max_completion_tokens") && e.contains("max_tokens") && !askCompletion) {
                Object v = b.remove("max_completion_tokens");
                b.put("max_tokens", v);
                changed = true;
            }
            if (e.contains("temperature") && (e.contains("not supported") || e.contains("unsupported") || e.contains("only"))) {
                b.remove("temperature");
                changed = true;
            }
            return changed ? b.toString() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void emitDone(String id, Resp r) {
        try {
            JSONObject d = new JSONObject();
            if (r.truncated) d.put("truncated", true);
            if (!r.usage.isEmpty()) d.put("usage", r.usage);
            emit(id, "done", d.toString());
        } catch (Exception e) {
            emit(id, "done", "{}");
        }
    }

    private String readAll(InputStream in) {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String l;
            int n = 0;
            while ((l = br.readLine()) != null && n++ < 2000) sb.append(l).append('\n');
        } catch (Exception e) {
            Log.w(TAG, "读取响应失败", e);
        }
        return sb.toString();
    }

    private String payloadOf(String key, String value) {
        return "{\"" + key + "\":" + JSONObject.quote(value == null ? "" : value) + "}";
    }

    private void emit(String id, String type, String payload) {
        final String js = "window.LLMBus&&window.LLMBus.on(" +
                JSONObject.quote(id) + "," + JSONObject.quote(type) + "," + JSONObject.quote(payload) + ")";
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Exception e) {
                Log.w(TAG, "回调失败", e);
            }
        });
    }

    // ---------------- 返回键 ----------------
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.AppBack&&window.AppBack())||'start'", value -> {
            String v = value == null ? "\"start\"" : value;
            if (v.contains("start") || v.contains("\"start\"")) {
                finish();
            } else {
                web.evaluateJavascript("window.goStart&&window.goStart()", null);
            }
        });
    }

    @Override
    protected void onDestroy() {
        for (HttpURLConnection c : running.values()) c.disconnect();
        running.clear();
        pool.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
