#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-idcard-samples.py —— 造仿身份证样本，给 OCR 做对照实验

为什么不用真身份证：真实证件不能进测试代码。这里按真实版式画一张
（85.6×54mm @300dpi = 1012×638），号码用 Courier New（等宽，笔画接近
证件上的 OCR-B），再套上手机拍照常见的几种退化，用来量准确率。

输出到 /tmp/idtest/，每个样本配一个 .txt 存正确答案。
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = '/tmp/idtest'
W, H = 1012, 638

HEI = '/System/Library/Fonts/STHeiti Medium.ttc'
SONG = '/System/Library/Fonts/Supplemental/Songti.ttc'
MONO = '/System/Library/Fonts/Supplemental/Courier New Bold.ttf'


def f(path, size):
    return ImageFont.truetype(path, size)


def id_check(first17):
    """GB 11643 校验位，跟网页里那套一致"""
    w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    return '10X98765432'[sum(int(first17[i]) * w[i] for i in range(17)) % 11]


def draw_card(name, sex, nation, birth, addr, id17):
    """按真实证件版式画一张正面"""
    img = Image.new('RGB', (W, H), (238, 243, 250))
    d = ImageDraw.Draw(img)

    # 底纹：浅蓝斜向渐变 + 细网格，模拟证件防伪纹
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(236 - 10 * k), int(242 - 6 * k), int(252 - 2 * k)))
    for x in range(0, W, 26):
        d.line([(x, 0), (x, H)], fill=(226, 234, 246))

    # 左侧人像区
    d.rectangle([56, 150, 300, 470], outline=(200, 212, 228))
    d.ellipse([130, 185, 226, 281], fill=(226, 220, 212))
    d.pieslice([92, 300, 264, 500], 180, 360, fill=(226, 220, 212))

    fn = f(HEI, 30)
    fv = f(HEI, 34)
    lab = (52, 52, 58)

    # 姓名 / 性别 / 民族
    d.text((340, 152), '姓  名', font=fn, fill=lab)
    d.text((480, 146), name, font=fv, fill=(24, 24, 28))

    d.text((340, 216), '性  别', font=fn, fill=lab)
    d.text((480, 210), sex, font=fv, fill=(24, 24, 28))
    d.text((620, 216), '民  族', font=fn, fill=lab)
    d.text((730, 210), nation, font=fv, fill=(24, 24, 28))

    d.text((340, 280), '出  生', font=fn, fill=lab)
    d.text((480, 274), birth, font=fv, fill=(24, 24, 28))

    d.text((340, 344), '住  址', font=fn, fill=lab)
    # 住址折成两行（证件就是这样排的）
    if len(addr) > 11:
        d.text((480, 338), addr[:11], font=fv, fill=(24, 24, 28))
        d.text((480, 386), addr[11:], font=fv, fill=(24, 24, 28))
    else:
        d.text((480, 338), addr, font=fv, fill=(24, 24, 28))

    # 号码行
    idno = id17 + id_check(id17)
    d.text((340, 520), '公民身份号码', font=fn, fill=lab)
    d.text((340, 562), idno, font=f(HEI, 44), fill=(20, 20, 24))
    return img, idno


SAMPLE = {
    'name': '张明远',
    'sex': '男',
    'nation': '汉',
    'birth': '1990 年 5 月 12 日',
    'addr': '广东省深圳市南山区科技园南路 18 号',
    'id17': '44030419900512123',
}


def degrade(img, kind):
    """模拟手机拍照的各种情况"""
    if kind == 'clean':
        return img
    if kind == 'jpeg':
        p = os.path.join(OUT, '_t.jpg')
        img.save(p, quality=45)
        return Image.open(p).convert('RGB')
    if kind == 'noise':
        px = img.load()
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                n = random.randint(-26, 26)
                r, g, b = px[x, y]
                px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
        return img
    if kind == 'blur':
        return img.filter(ImageFilter.GaussianBlur(2.2))
    if kind == 'rotate':
        return img.rotate(-3.5, resample=Image.BICUBIC, expand=True,
                          fillcolor=(236, 242, 250))
    if kind == 'dark':
        px = img.load()
        for y in range(H):
            for x in range(W):
                r, g, b = px[x, y]
                px[x, y] = (int(r * 0.58), int(g * 0.58), int(b * 0.58))
        return img
    if kind == 'glare':          # 右上角一片反光
        ov = Image.new('RGB', (W, H), (0, 0, 0))
        od = ImageDraw.Draw(ov)
        od.ellipse([620, -120, 1180, 300], fill=(96, 96, 96))
        ov = ov.filter(ImageFilter.GaussianBlur(60))
        from PIL import ImageChops
        return ImageChops.add(img, ov)
    if kind == 'small':          # 微信压缩后传过来的小图
        return img.resize((520, 328), Image.LANCZOS)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    random.seed(7)
    base, idno = draw_card(**SAMPLE)
    kinds = ['clean', 'jpeg', 'noise', 'blur', 'rotate', 'dark', 'glare', 'small']
    for k in kinds:
        im = degrade(base.copy(), k)
        path = os.path.join(OUT, k + '.png')
        im.save(path)
        with open(os.path.join(OUT, k + '.txt'), 'w') as fp:
            fp.write(idno)
        print('%-8s %-18s %s' % (k, im.size, idno))


if __name__ == '__main__':
    main()
