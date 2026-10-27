# -*- coding: utf-8 -*-
"""估算 docx 里表格的实际高度（Word 不缩放表格，按 tcW 排版，行高随内容增长）。

用途：判断「填满内容」的登记表会不会超出第一页，从而定位是哪几行把页面撑高。
参数按 Word 实测反推：8pt 宋体、单倍行距、单元格左右各 108 twips 内边距。
用法：python3 measure-height.py <docx>
"""
import sys, re, zipfile, math, unicodedata


def cjk_units(s):
    """东亚字符记 1，ASCII 记 0.55（宋体里西文窄一些）"""
    n = 0.0
    for ch in s:
        n += 1.0 if unicodedata.east_asian_width(ch) in ('W', 'F') else 0.55
    return n


def main(path):
    z = zipfile.ZipFile(path)
    xml = z.read('word/document.xml').decode('utf-8')

    pg = re.search(r'<w:pgSz w:w="(\d+)" w:h="(\d+)"', xml)
    mar = re.search(r'<w:pgMar w:top="(\d+)"[^/]*w:bottom="(\d+)"', xml)
    pgw, pgh = int(pg.group(1)), int(pg.group(2))
    top, bottom = int(mar.group(1)), int(mar.group(2))
    usable_h = pgh - top - bottom
    print('页面 %d x %d twips，上下边距 %d/%d，可用高 %d twips (%.1f cm)'
          % (pgw, pgh, top, bottom, usable_h, usable_h / 567.0))

    trs = list(re.finditer(r'<w:tr[ >].*?</w:tr>', xml, re.S))
    total = 0
    print('\n行  行高min  行高实测  行高cm  行距           首格内容')
    for i, m in enumerate(trs):
        tr = m.group(0)
        h = re.search(r'<w:trHeight w:val="(\d+)"', tr)
        hmin = int(h.group(1)) if h else 0
        tcs = re.findall(r'<w:tc>.*?</w:tc>', tr, re.S)
        row_h = hmin
        fixed_lh = None
        for tc in tcs:
            w = re.search(r'<w:tcW w:w="(\d+)"', tc)
            if not w:
                continue
            wid = int(w.group(1))
            szs = re.findall(r'<w:sz w:val="(\d+)"', tc)
            sz = int(szs[0]) if szs else 16
            pt = sz / 2.0
            txt = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', tc))
            txt = txt.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
            usable_w = wid - 216
            if usable_w <= 100 or not txt.strip():
                continue
            # 行距：模板里是 w:line="360" lineRule="exact"（=18pt 固定），比 8pt 字高得多
            ex = re.search(r'<w:spacing[^/]*w:line="(\d+)"[^/]*w:lineRule="exact"', tc)
            if ex:
                lh = float(ex.group(1))
                fixed_lh = lh
            else:
                lh = pt * 20.0 * 1.34
            per_line = max(1.0, usable_w / (pt * 20.0))
            lines = max(1, math.ceil(cjk_units(txt) / per_line))
            row_h = max(row_h, lines * lh)
        total += row_h
        head = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', tcs[0]))[:26] if tcs else ''
        print('%2d  %6d  %8.0f  %5.2f  %-13s %s'
              % (i, hmin, row_h, row_h / 567.0, ('%d twips' % fixed_lh) if fixed_lh else 'auto', head))

    print('\n表格总高 %.0f twips = %.1f cm' % (total, total / 567.0))
    print('第一页可用 %.1f cm，占比 %.0f%%' % (usable_h / 567.0, total * 100.0 / usable_h))
    if total > usable_h:
        print('❌ 表格超出第一页 %.1f cm —— 会另起一页，总页数必然 >2' % ((total - usable_h) / 567.0))
    else:
        print('✅ 表格装得下第一页，剩 %.1f cm' % ((usable_h - total) / 567.0))


if __name__ == '__main__':
    main(sys.argv[1])
