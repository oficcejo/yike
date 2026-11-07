#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 web/ 同步到 android/app/src/main/assets/www/（APK 内置离线资源）"""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web")
DST = os.path.join(ROOT, "android", "app", "src", "main", "assets", "www")


def main():
    os.makedirs(DST, exist_ok=True)
    # 先移除目标目录内的旧文件，避免残留被打包进 APK
    for base, dirs, files in os.walk(DST, topdown=False):
        for f in files:
            os.remove(os.path.join(base, f))
        for d in dirs:
            os.rmdir(os.path.join(base, d))
    shutil.copytree(SRC, DST, dirs_exist_ok=True)
    n, total = 0, 0
    for base, _, files in os.walk(DST):
        for f in files:
            n += 1
            total += os.path.getsize(os.path.join(base, f))
    print("已同步 %d 个文件，合计 %.1f KB -> %s" % (n, total / 1024, DST))


if __name__ == "__main__":
    main()
