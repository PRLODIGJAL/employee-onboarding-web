# -*- coding: utf-8 -*-
"""
从 form-template.js（已注入 {{占位符}} 的母版）抽出 PDF 绘制用的网格数据，
生成 网页/form-grid.js。

这样 PDF 和 Word 用的是同一份内容、同一套列宽行高，打印出来是一个样子。

    python build-form-grid.py <form-template.js> <输出/form-grid.js>
"""
import sys, re, json, html

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def unesc(s):
    return html.unescape(s)


def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s)


def p_text(p_xml):
    out = []
    for m in re.finditer(r'<w:t[^>]*>([^<]*)</w:t>|<w:sym[^>]*w:char="([0-9A-Fa-f]+)"[^>]*/>|<w:br[^>]*/>', p_xml):
        if m.group(1) is not None:
            out.append(unesc(m.group(1)))
        elif m.group(2) is not None:
            # Wingdings 2 的复选框：00A3 空框，0052 打勾
            out.append('■' if m.group(2).upper() == '0052' else '□')
        else:
            out.append('\n')
    return ''.join(out)


def para_props(p_xml):
    ppr = re.search(r'<w:pPr>(.*?)</w:pPr>', p_xml, re.S)
    body = ppr.group(1) if ppr else ''
    jc = re.search(r'<w:jc w:val="(\w+)"', body)
    sz = re.search(r'<w:sz w:val="(\d+)"', p_xml)
    bold = '<w:b/>' in p_xml
    line = re.search(r'<w:spacing[^>]*w:line="(\d+)"', body)
    return {
        'align': {'left': 'left', 'center': 'center', 'right': 'right', 'both': 'justify'}.get(jc.group(1), 'left') if jc else 'left',
        'sz': int(sz.group(1)) if sz else 16,
        'bold': bold,
        'line': int(line.group(1)) if line else 240
    }


def split_blocks(xml):
    body = xml[xml.find('<w:body>') + len('<w:body>'):xml.find('</w:body>')]
    blocks = []
    i = 0
    n = len(body)
    while i < n:
        if body.startswith('<w:tbl>', i):
            e = body.find('</w:tbl>', i)
            if e < 0:
                break
            blocks.append(('tbl', body[i:e + len('</w:tbl>')]))
            i = e + len('</w:tbl>')
        elif body.startswith('<w:p>', i) or body.startswith('<w:p ', i):
            e = body.find('</w:p>', i)
            if e < 0:
                break
            blocks.append(('p', body[i:e + len('</w:p>')]))
            i = e + len('</w:p>')
        else:
            i += 1
    return blocks


def parse_table(tbl_xml):
    cols = [int(x) for x in re.findall(r'<w:gridCol w:w="(\d+)"', tbl_xml)]
    rows_xml = re.findall(r'<w:tr(?:\s[^>]*)?>(.*?)</w:tr>', tbl_xml, re.S)
    rows = []
    for rx in rows_xml:
        trpr = re.search(r'<w:trPr>(.*?)</w:trPr>', rx, re.S)
        h = 0
        if trpr:
            hm = re.search(r'<w:trHeight w:val="(\d+)"', trpr.group(1))
            if hm:
                h = int(hm.group(1))
        cells = []
        for cm in re.finditer(r'<w:tc>(.*?)</w:tc>', rx, re.S):
            tc = cm.group(1)
            tcpr = re.search(r'<w:tcPr>(.*?)</w:tcPr>', tc, re.S)
            props = tcpr.group(1) if tcpr else ''
            span = 1
            gm = re.search(r'<w:gridSpan w:val="(\d+)"', props)
            if gm:
                span = int(gm.group(1))
            vm = 'none'
            vmr = re.search(r'<w:vMerge(?:\s+w:val="(\w+)")?\s*/>', props)
            if vmr:
                vm = 'restart' if vmr.group(1) == 'restart' else 'cont'
            paras = re.findall(r'<w:p(?:\s[^>]*)?>(.*?)</w:p>', tc, re.S)
            texts = [p_text(p) for p in paras]
            pinfo = [para_props(p) for p in paras]
            cell = {
                'span': span,
                'vm': vm,
                'lines': [{'t': t, **pinfo[j]} for j, t in enumerate(texts)]
            }
            cells.append(cell)
        rows.append({'h': h, 'cells': cells})
    return cols, rows


def main(src, out):
    js = open(src, encoding='utf-8').read()
    key = "FORM_TEMPLATE = "
    i = js.find(key) + len(key)
    payload = json.loads(js[i:].rstrip().rstrip(';'))
    doc = payload['parts']['word/document.xml']

    blocks = split_blocks(doc)
    grid = {'cols': None, 'rows': [], 'extra': [], 'meta': {}}

    for kind, xml in blocks:
        if kind == 'tbl':
            cols, rows = parse_table(xml)
            grid['cols'] = cols
            grid['rows'] = rows
        else:
            texts = [p_text(p) for p in re.findall(r'<w:p(?:\s[^>]*)?>(.*?)</w:p>', xml, re.S)]
            infos = [para_props(p) for p in re.findall(r'<w:p(?:\s[^>]*)?>(.*?)</w:p>', xml, re.S)]
            for t, info in zip(texts, infos):
                grid['extra'].append({'t': t, **info})

    # 页面参数取自母版 sectPr
    mar = re.search(r'<w:pgMar([^/]*)/>', doc)
    if mar:
        for k in ['top', 'right', 'bottom', 'left']:
            mm = re.search(r'w:%s="(\d+)"' % k, mar.group(1))
            if mm:
                grid['meta'][k] = int(mm.group(1))
    grid['meta']['pageW'] = 11906
    grid['meta']['pageH'] = 16838

    js_out = ('/**\n'
              ' * form-grid.js —— 登记表 PDF 绘制用的网格（自动生成，勿手改）\n'
              ' * 由 开发工具/build-form-grid.py 从 form-template.js 抽出，\n'
              ' * 列宽、行高、合并格、文字都和公司模板一致。\n'
              ' */\n'
              '(typeof window !== \'undefined\' ? window : globalThis).FORM_GRID = '
              + json.dumps(grid, ensure_ascii=False) + ';\n')
    open(out, 'w', encoding='utf-8').write(js_out)

    ncell = sum(len(r['cells']) for r in grid['rows'])
    nph = sum(1 for r in grid['rows'] for c in r['cells']
              for ln in c['lines'] if '{{' in ln['t'])
    print(f'列 {len(grid["cols"])} 行 {len(grid["rows"])} 单元格 {ncell} 带占位符 {nph} '
          f'表外段落 {len(grid["extra"])}')
    print('已生成', out, round(len(js_out) / 1024), 'KB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
