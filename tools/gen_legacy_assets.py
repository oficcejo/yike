#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 Android 6 (API 23) 兼容资源（构建期调用）：
1) app-compat.css —— 把 CSS 自定义属性 var(--x) 展开为字面值。
   Chrome 49 以下的 WebView 不认 CSS Variables，含 var() 的声明会被整条丢弃，
   界面会退化成白底黑字。两份 CSS 同时加载，新浏览器两者等价，老浏览器用展开版。
2) mipmap-*/ic_launcher.png —— 老设备的 Launcher 对 vector 图标支持不稳，
   补一套位图，按密度优先于无密度的 mipmap/ic_launcher.xml 被选中。
纯标准库实现，不依赖 Pillow。
"""
import os
import re
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS_DIR = os.path.join(ROOT, "web", "css")
RES_DIR = os.path.join(ROOT, "android", "app", "src", "main", "res")


def build_compat_css():
    src_path = os.path.join(CSS_DIR, "app.css")
    with open(src_path, encoding="utf-8") as f:
        css = f.read()

    root = re.search(r":root\s*\{([^}]*)\}", css, re.S)
    if not root:
        raise RuntimeError("app.css 中未找到 :root 变量定义")
    variables = dict(re.findall(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);", root.group(1)))
    if not variables:
        raise RuntimeError("app.css 中未解析到任何 CSS 变量")

    def expand(text):
        def repl(m):
            name, fallback = m.group(1), m.group(2)
            val = variables.get(name)
            if val is None:
                val = fallback.strip() if fallback else ""
            return val.strip()
        return re.sub(r"var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^()]*))?\)", repl, text)

    out = expand(expand(css))  # 两轮，兼容变量值里再引用变量的情况
    left = re.findall(r"var\(\s*(--[A-Za-z0-9_-]+)", out)
    header = (
        "/* 自动生成，请勿手改：CSS 变量展开版，供 Android 6 等不支持 CSS Custom\n"
        "   Properties 的 WebView 使用。源文件 app.css，生成脚本 tools/gen_legacy_assets.py */\n"
    )
    dst = os.path.join(CSS_DIR, "app-compat.css")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(header + out)
    print("  app-compat.css: %d 个变量已展开，残留 %d 处" % (len(variables), len(left)))


def png_chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def make_png(size):
    """纯色底 + 三条白杠，与 vector 版 ic_launcher 视觉一致"""
    bg = (0xB2, 0x3B, 0x32)   # var(--red)
    fg = (0xFF, 0xFF, 0xFF)
    bars = [(15, 18.5), (22, 25.5), (29, 32.5)]  # 以 48dp 为基准的 y 区间
    x0, x1 = 11 / 48.0, 37 / 48.0
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter type 0
        unit = (y + 0.5) / size * 48
        in_bar = any(a <= unit < b for a, b in bars)
        for x in range(size):
            xu = (x + 0.5) / size * 48
            c = fg if (in_bar and x0 <= xu < x1) else bg
            raw.extend((c[0], c[1], c[2], 255))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA8
    return (b"\x89PNG\r\n\x1a\n" +
            png_chunk(b"IHDR", ihdr) +
            png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
            png_chunk(b"IEND", b""))


def build_icons():
    for folder, size in (("mipmap-mdpi", 48), ("mipmap-hdpi", 72),
                         ("mipmap-xhdpi", 96), ("mipmap-xxhdpi", 144),
                         ("mipmap-xxxhdpi", 192)):
        d = os.path.join(RES_DIR, folder)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "ic_launcher.png"), "wb") as f:
            f.write(make_png(size))
    print("  launcher PNG: 5 个密度已生成")


if __name__ == "__main__":
    build_compat_css()
    build_icons()
