#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成 toy-build/baka 的封面 poster.png（1200×900，4:3 横图）。

Toy 平台的封面会被塞进列表卡片和详情头图，竖图会被裁，所以固定出 4:3。
素材复用 images/cast/ 下已经抠好的透明立绘（先跑 baka-toy-assets.py）。

用法：python scripts/baka-toy-poster.py
"""

import os
import math
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "toy-build", "baka")
CAST = os.path.join(PKG, "images", "cast")
OUT = os.path.join(PKG, "poster.png")

W, H = 1200, 900

BG_TOP = (42, 35, 64)
BG_BOT = (19, 15, 24)
GOLD = (240, 192, 96)
GOLD_HI = (255, 232, 176)
GOLD_LO = (160, 128, 80)
SKY = (143, 216, 255)
RED = (239, 68, 68)

FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"


def font(path, size):
    return ImageFont.truetype(path, size)


def vgrad(size, top, bot):
    """竖直渐变底。"""
    w, h = size
    g = Image.new("RGB", (1, h))
    px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return g.resize((w, h), Image.BILINEAR)


def radial_glow(size, cx, cy, r, color, strength=1.0):
    """径向光晕（返回 RGBA，可直接 alpha 合成）。"""
    w, h = size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 26
    for i in range(steps, 0, -1):
        t = i / steps
        rr = r * t
        a = int(strength * 78 * (1 - t) ** 2)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    return layer.filter(ImageFilter.GaussianBlur(14))


def snow(base, n=150, seed=7):
    """飘雪氛围。"""
    rnd = random.Random(seed)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        x = rnd.uniform(0, W)
        y = rnd.uniform(0, H)
        r = rnd.uniform(1.2, 5.0)
        a = int(rnd.uniform(40, 150))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(205, 233, 255, a))
    return Image.alpha_composite(base, layer)


def ring(draw, cx, cy, r, color, width=3, alpha=110):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color + (alpha,), width=width)


def main():
    img = vgrad((W, H), BG_TOP, BG_BOT).convert("RGBA")
    img = Image.alpha_composite(img, radial_glow((W, H), 600, 430, 520, (240, 192, 96), .55))
    img = Image.alpha_composite(img, radial_glow((W, H), 980, 180, 340, (143, 216, 255), .30))
    img = snow(img)

    d = ImageDraw.Draw(img, "RGBA")

    # ── 背景装饰：几个半透明等级圆环，暗示「合成」 ──
    for cx, cy, r, a in ((196, 690, 92, 46), (196, 690, 60, 34),
                         (1010, 700, 108, 40), (1010, 700, 70, 28)):
        ring(d, cx, cy, r, GOLD, 3, a)

    # ── 立绘：抠好透明底的琪露诺 ──
    logo = Image.open(os.path.join(CAST, "logo.png")).convert("RGBA")
    target_h = 560
    logo = logo.resize((int(logo.width * target_h / logo.height), target_h), Image.LANCZOS)
    shadow = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 190), (0, 0), logo.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    lx, ly = 600 - logo.width // 2, 300
    img.alpha_composite(shadow, (lx, ly + 14))
    img.alpha_composite(logo, (lx, ly))

    d = ImageDraw.Draw(img, "RGBA")

    # ── 标题 ──
    # 位置算两遍很容易错位：x0/y0 是字形实际左上角，tx/ty 是 PIL text() 需要的
    # 偏移量（text() 默认按字形的 ascent 起笔，不等于 bbox 原点）
    ftitle = font(FONT_BOLD, 122)
    title = "合成大BAKA"
    tb = d.textbbox((0, 0), title, font=ftitle)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    x0, y0 = 600 - tw // 2, 62
    tx, ty = x0 - tb[0], y0 - tb[1]

    # 描边：深色外描边，保证任何底色上都读得清
    for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
        d.text((tx + dx, ty + dy), title, font=ftitle, fill=(12, 9, 18, 255))

    # 金色渐变填充：mask 与渐变同尺寸、同一绘制原点，再整体贴到 (x0, y0)
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).text((-tb[0], -tb[1]), title, font=ftitle, fill=255)
    grad = vgrad((tw, th), GOLD_HI, (196, 146, 58)).convert("RGBA")
    grad.putalpha(mask)
    img.alpha_composite(grad, (x0, y0))
    d = ImageDraw.Draw(img, "RGBA")

    # ── 副标题 ──
    fsub = font(FONT_REG, 33)
    sub = "霧雨魔法店  ·  SUIKA  BAKA"
    sb = d.textbbox((0, 0), sub, font=fsub)
    d.text((600 - (sb[2] - sb[0]) // 2 - sb[0], 196 - sb[1]), sub, font=fsub, fill=SKY + (215,))

    # ── ⑨ 角标（放右上，避开标题） ──
    f9 = font(FONT_BOLD, 104)
    d.text((1076, 26), "⑨", font=f9, fill=GOLD + (90,))

    # ── 顶部色条 ──
    d.rectangle([0, 0, W, 8], fill=GOLD + (255,))
    d.rectangle([0, 8, W, 12], fill=SKY + (170,))

    # ── 底部信息条 ──
    bar_h = 96
    d.rectangle([0, H - bar_h, W, H], fill=(14, 11, 20, 225))
    d.line([(0, H - bar_h), (W, H - bar_h)], fill=GOLD + (120,), width=2)
    ftag = font(FONT_BOLD, 30)
    d.text((56, H - bar_h + 32), "合成大 BAKA  ·  合成小 BAKA", font=ftag, fill=GOLD + (240,))
    fsm = font(FONT_REG, 25)
    d.text((W - 56 - d.textbbox((0, 0), "B站 Toy 版", font=fsm)[2], H - bar_h + 36),
           "B站 Toy 版", font=fsm, fill=(200, 190, 215, 220))

    img.convert("RGB").save(OUT, "PNG", optimize=True)
    print("poster -> %s  %dx%d  %d bytes" % (os.path.relpath(OUT, ROOT), W, H, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
