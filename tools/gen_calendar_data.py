#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""构建期生成精确节气表与干支校验样例（lunar-python / 寿星天文历算法）。

产出: web/js/jieqi_data.js
  - JIEQI_NAMES : 24 节气固定顺序（小寒起）
  - JIEQI_DATA  : { 年份: 192 字符 }，每 8 字符为一个节气的 MMDDHHMM（北京时间）
  - GANZHI_SAMPLES : 用于 JS 端自检的干支基准样例
"""
import json
import os
import sys
from lunar_python import Solar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "js", "jieqi_data.js")

NAMES = [
    "小寒", "大寒", "立春", "雨水", "惊蛰", "春分",
    "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
    "小暑", "大暑", "立秋", "处暑", "白露", "秋分",
    "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
]
NAME_SET = set(NAMES)
# lunar-python 对「下一轮」节气使用拼音 key，需归一为中文名
PINYIN_MAP = {
    "XIAO_HAN": "小寒", "DA_HAN": "大寒", "LI_CHUN": "立春", "YU_SHUI": "雨水",
    "JING_ZHE": "惊蛰", "CHUN_FEN": "春分", "QING_MING": "清明", "GU_YU": "谷雨",
    "LI_XIA": "立夏", "XIAO_MAN": "小满", "MANG_ZHONG": "芒种", "XIA_ZHI": "夏至",
    "XIAO_SHU": "小暑", "DA_SHU": "大暑", "LI_QIU": "立秋", "CHU_SHU": "处暑",
    "BAI_LU": "白露", "QIU_FEN": "秋分", "HAN_LU": "寒露", "SHUANG_JIANG": "霜降",
    "LI_DONG": "立冬", "XIAO_XUE": "小雪", "DA_XUE": "大雪", "DONG_ZHI": "冬至",
}
# 前后各留 10 年缓冲，保证 1900-01 / 2060-12 的跨年节气查询不越界
YEAR_FROM, YEAR_TO = 1890, 2070


def jdn(y, m, d):
    a = (14 - m) // 12
    y2 = y + 4800 - a
    m2 = m + 12 * a - 3
    return (d + (153 * m2 + 2) // 5 + 365 * y2 + y2 // 4
            - y2 // 100 + y2 // 400 - 32045)


def collect_year(y):
    found = {}
    for md in ((1, 1), (7, 1), (12, 25)):
        solar = Solar.fromYmd(y, md[0], md[1])
        for name, s in solar.getLunar().getJieQiTable().items():
            name = PINYIN_MAP.get(name, name)
            if name not in NAME_SET:
                continue
            if s.getYear() != y:
                continue
            key = "%02d%02d%02d%02d" % (s.getMonth(), s.getDay(), s.getHour(), s.getMinute())
            found[name] = key
    missing = [n for n in NAMES if n not in found]
    if missing:
        raise RuntimeError("年份 %d 缺失节气: %s" % (y, missing))
    return "".join(found[n] for n in NAMES)


def main():
    data = {}
    for y in range(YEAR_FROM, YEAR_TO + 1):
        data[str(y)] = collect_year(y)

    # ---- 推导日干支锚点（甲子=0）----
    GAN = "甲乙丙丁戊己庚辛壬癸"
    ZHI = "子丑寅卯辰巳午未申酉戌亥"

    def gz_index(gz):
        g, z = GAN.index(gz[0]), ZHI.index(gz[1])
        for i in range(60):
            if i % 10 == g and i % 12 == z:
                return i
        raise ValueError(gz)

    checks = []
    offsets = set()
    for y in range(1900, 2061, 7):
        for m, d in ((1, 15), (3, 22), (6, 8), (9, 30), (12, 12)):
            solar = Solar.fromYmdHms(y, m, d, 10, 0, 0)
            gz = solar.getLunar().getDayInGanZhi()
            offsets.add((gz_index(gz) - jdn(y, m, d)) % 60)
    if len(offsets) != 1:
        raise RuntimeError("日干支锚点不一致: %s" % offsets)
    K = offsets.pop()
    print("日干支锚点 K = %d  (index = (JDN + K) %% 60, 甲子=0)" % K)

    # ---- 干支基准样例（含节气前后临界点）----
    samples = []
    for y, m, d, h, mi in [
        (1900, 1, 1, 10, 0), (1949, 10, 1, 12, 0), (1984, 2, 4, 9, 0),
        (2000, 1, 1, 12, 0), (2024, 2, 4, 17, 0), (2026, 2, 4, 3, 0),
        (2026, 2, 4, 5, 0), (2026, 11, 7, 9, 34), (2026, 12, 22, 14, 0),
        (2033, 6, 21, 23, 30), (2060, 12, 31, 22, 0),
    ]:
        s = Solar.fromYmdHms(y, m, d, h, mi, 0)
        l = s.getLunar()
        # Exact 系列以节气时刻分界，且晚子时(23:00起)日干支归次日，与本 App 规则一致
        samples.append({
            "t": "%04d-%02d-%02d %02d:%02d" % (y, m, d, h, mi),
            "year": l.getYearInGanZhiExact(), "month": l.getMonthInGanZhiExact(),
            "day": l.getDayInGanZhiExact(), "time": l.getTimeInGanZhi(),
            "lateZi": h >= 23,
        })

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 精确节气表 1900-2060，北京时间 MMDDHHMM。\n")
        f.write("   由 tools/gen_calendar_data.py 基于 lunar-python(寿星天文历) 生成，请勿手工修改。 */\n")
        f.write("(function(root){\n")
        f.write("root.JIEQI_NAMES = %s;\n" % json.dumps(NAMES, ensure_ascii=False))
        f.write("root.JIEQI_DAY_OFFSET = %d;\n" % K)
        f.write("root.JIEQI_DATA = %s;\n" % json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        f.write("root.GANZHI_SAMPLES = %s;\n" % json.dumps(samples, ensure_ascii=False))
        f.write("if (typeof module !== 'undefined' && module.exports) { module.exports = {\n")
        f.write("  JIEQI_NAMES: root.JIEQI_NAMES, JIEQI_DATA: root.JIEQI_DATA,\n")
        f.write("  JIEQI_DAY_OFFSET: root.JIEQI_DAY_OFFSET, GANZHI_SAMPLES: root.GANZHI_SAMPLES };\n")
        f.write("}\n})(typeof window !== 'undefined' ? window : globalThis);\n")
    print("已写出 %s (%d 字节, %d 年)" % (OUT, os.path.getsize(OUT), len(data)))
    for s in samples:
        print("  %s -> %s年 %s月 %s日 %s时" % (s["t"], s["year"], s["month"], s["day"], s["time"]))
    # 输出 2026 年节气供人工抽查
    s = data["2026"]
    print("2026 节气抽样:", ", ".join("%s=%s" % (NAMES[i], s[i * 8:i * 8 + 8]) for i in (0, 3, 5, 11, 23)))


if __name__ == "__main__":
    main()
