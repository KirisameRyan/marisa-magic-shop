#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成 toy-build/baka 包用的透明背景立绘。

源图的背景不是纯色抠图能处理的：
  - cirno_logo.jpg  背景是纯黑（百分比 p50 最大通道 = 1）
  - cirno_lihui.webp 背景是近白（p50 最小通道 = 246），但角色翅膀本身也是白的
所以统一用「从画布边缘泛洪 + 紧阈值」的方式，只吃掉与边缘连通的背景，
保住角色内部的白（眼睛、裙子、翅膀）。

输出到 images/cast/。已在包内生成过，重跑会覆盖。
用法：python scripts/baka-toy-assets.py
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "toy-build", "baka", "images", "cirno")
OUT = os.path.join(ROOT, "toy-build", "baka", "images", "cast")

# 泛洪填充用的标记色。
# 必须同时离「黑底」和「白底」都足够远：Pillow 的 floodfill 在
# 「seed 与 value 的色差 <= thresh」时会认为起点已填充而直接返回，
# 标记色取成 (1,2,3) 会导致黑底图一个像素都填不到。
SENTINEL = (1, 253, 1)


def knockout(src, dst, seed, thresh, expect=None):
    """把与 seed 连通、且颜色接近阈值的区域变成透明。"""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    if im.getpixel(seed)[:3] == SENTINEL:
        raise SystemExit("%s 的取样点本身就是标记色，换个 seed" % src)
    # floodfill 是原地修改（不同 Pillow 版本返回值不一致），别接返回值
    ImageDraw.floodfill(im, seed, SENTINEL, thresh=thresh)

    rgba = im.convert("RGBA")
    px = rgba.load()
    hit = 0
    for y in range(h):
        for x in range(w):
            if px[x, y][:3] == SENTINEL:
                px[x, y] = (0, 0, 0, 0)
                hit += 1

    if expect is not None and not (0 < 100.0 * hit / (w * h) < expect):
        raise SystemExit("%s 抠除比例异常（%.1f%%），检查阈值" % (src, 100.0 * hit / (w * h)))
    if hit == 0:
        raise SystemExit("%s 一个像素都没抠掉，检查 seed / thresh" % src)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    rgba.save(dst, "PNG", optimize=True)
    print("%-22s -> %-28s %dx%d  抠除 %.1f%%  %d bytes"
          % (os.path.basename(src), os.path.relpath(dst, ROOT), w, h,
             100.0 * hit / (w * h), os.path.getsize(dst)))


def main():
    # 黑底：背景是纯黑，阈值紧一点（thresh 是三通道差平方和，200 ≈ 单通道 8）
    knockout(os.path.join(SRC, "cirno_logo.jpg"),
             os.path.join(OUT, "logo.png"),
             seed=(0, 0), thresh=200, expect=80)

    # 白底：背景近白但角色也有白，阈值必须收得很紧（单通道 ~7），
    # 靠「连通性」而不是靠「白度」来区分；超过 85% 说明把翅膀也吃掉了
    knockout(os.path.join(SRC, "cirno_lihui.webp"),
             os.path.join(OUT, "lihui.png"),
             seed=(0, 0), thresh=150, expect=85)


if __name__ == "__main__":
    main()
