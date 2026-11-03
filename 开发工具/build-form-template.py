# -*- coding: utf-8 -*-
"""
把公司原始《员工信息登记表》.docx 变成「母版」——格子还是那些格子，只是空的地方
换成 {{占位符}}。前端导出时只做字符串替换，所以版式、字体、页边距、合并格、印章图片
一个字节都不动。

用法：
    python build-form-template.py <原始.docx> <输出/form-template.js>

生成物：window.FORM_TEMPLATE = { parts: {...}, media: {...} }
"""
import sys, os, re, json, zipfile, html

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def tc_spans(xml):
    """把 document.xml 里的 <w:tc> ... </w:tc> 按出现顺序切出来，返回 [(start,end)]"""
    out = []
    i = 0
    while True:
        s = xml.find('<w:tc>', i)
        if s < 0:
            break
        e = xml.find('</w:tc>', s)
        if e < 0:
            break
        out.append((s, e + len('</w:tc>')))
        i = e + len('</w:tc>')
    return out


def is_vmerge_continue(tc):
    m = re.search(r'<w:vMerge(?:\s+w:val="([^"]+)")?\s*/>', tc)
    if not m:
        return False
    return m.group(1) != 'restart'


def cell_text(tc):
    txt = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', tc))
    return html.unescape(txt)


def first_rpr(tc):
    """取单元格里第一个 run 的 rPr，保证填进去的字和模板同字体同字号"""
    m = re.search(r'<w:r>(<w:rPr>.*?</w:rPr>)', tc, re.S)
    if m:
        return m.group(1)
    m = re.search(r'<w:pPr>.*?(<w:rPr>.*?</w:rPr>).*?</w:pPr>', tc, re.S)
    if m:
        return m.group(1)
    return ('<w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:cs="宋体" w:hint="eastAsia"/>'
            '<w:b/><w:bCs/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>')


def fill_cell(tc, placeholder, sz=None):
    """保留第一段的 pPr，把段落内容换成 {{placeholder}}

    sz 不为空时，把这一格的字号改成 sz（半磅）。填进去的内容（地址、证书、
    学校、公司名）常常比标签长得多，用模板标签的字号会把行撑得很高；
    缩小一点既省高度，打印出来照样清楚。

    同时去掉加粗：模板里有些格子的字是粗体（标签、表头），借它的 rPr 填值就会
    跟着变粗。填进去的是"员工自己写的内容"，跟标签不一样——而且模板本身也不统一
    （公司名称那格不粗、姓名那格粗），统一成不加粗看起来才是一份手写的表。
    """
    rpr = first_rpr(tc)
    rpr = re.sub(r'<w:b\s*/>|<w:bCs\s*/>', '', rpr)
    if sz:
        rpr = re.sub(r'<w:sz w:val="\d+"/>', f'<w:sz w:val="{sz}"/>', rpr)
        rpr = re.sub(r'<w:szCs w:val="\d+"/>', f'<w:szCs w:val="{sz}"/>', rpr)
        if '<w:sz ' not in rpr:
            rpr = rpr.replace('</w:rPr>', f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/></w:rPr>')
    m = re.search(r'(<w:p(?:\s[^>]*)?>)(<w:pPr>.*?</w:pPr>)', tc, re.S)
    if m:
        head = m.group(1)
        ppr = m.group(2)
        newp = head + ppr + '<w:r>' + rpr + '<w:t xml:space="preserve">{{' + placeholder + '}}</w:t></w:r></w:p>'
    else:
        newp = ('<w:p><w:r>' + rpr + '<w:t xml:space="preserve">{{' + placeholder
                + '}}</w:t></w:r></w:p>')
    # 丢掉原来的所有段落，只留新的一段
    before = tc[:tc.find('<w:p')]
    # tcPr 之后的部分整体替换
    return before + newp + '</w:tc>'


# 填进去的内容用几号字（半磅）：模板标签是 16（8磅），填写值统一缩一号。
# 反正导出后是打印件、不是手写，7 磅印出来很清楚，却能明显降低行高。
VALUE_SZ = 14        # 7 磅
LONG_VALUE_SZ = 13   # 6.5 磅：地址、证书、公司名这类长文本，再缩半磅
LONG_KEYS = (
    'title', 'language', 'certificate', 'major', 'graduateSchool',
    'householdAddress', 'permanentAddress', 'liveAddress', 'emAddress',
)

# 表头文字替换：原始 .docx 里的措辞跟网页表单对不上时，在这里统一。
# 只改字，不动任何格式（run 的 rPr 原样保留）。
RELABEL = (
    ('本人工作经历（从近期开始填写）', '本人工作经历或实习经历（从近期开始填写）'),
)

# 空单元格按出现顺序编号（E1、E2…），这里是「编号 → 占位符」映射。
# skip 表示这个格子是纵向合并的续格（照片位、紧急联系人左边那一格），不能填字。
FILL = {
    1: 'realName', 2: 'gender', 3: 'birthday', 4: 'height', 5: 'weight',
    6: 'nativePlace', 7: 'skip', 8: 'nation', 9: 'skip',
    10: 'highestEducation', 11: 'skip',
    12: 'title', 13: 'language', 14: 'certificate', 15: 'skip',
    16: 'graduateDate', 17: 'graduateSchool', 18: 'major', 19: 'idcard',
    20: 'householdAddress', 21: 'phone', 22: 'permanentAddress', 23: 'liveAddress',
    24: 'emName', 25: 'emRelation', 26: 'emPhone', 27: 'skip',
    28: 'emAddress', 29: 'email',
}

# 教育只留「最高学历」一段（每段 6 格：开始 / 结束 / 学校 / 专业 / 学历 / 证明人）
# —— 纸质表原本 3 行，但实际只需填最高一次；删掉后两行，省出高度、也避免挤到第三页。
EDU_KEYS = ['dateFrom', 'dateTo', 'school', 'major', 'degree', 'witness']
for j, k in enumerate(EDU_KEYS):
    FILL[30 + j] = f'edu1.{k}'

# 工作两段（每段 5 格：开始 / 结束 / 公司 / 职务 / 离职原因）
# 模板已把工作经历从 3 行删到 2 行（最多写两段），空格编号 E36~E45。
WORK_KEYS = ['dateFrom', 'dateTo', 'company', 'duty', 'leave']
WORK_ROWS = 2
for i in range(WORK_ROWS):
    for j, k in enumerate(WORK_KEYS):
        FILL[36 + i * 5 + j] = f'work{i + 1}.{k}'


def blacken_red(xml):
    """把模板里标注必填项的红色文字全部转成黑色（000000）。

    红色是给「填表的人看哪些必填」用的，导出的成品（要签字盖章存档）不能有颜色。
    用户手工校准的模板里红色有 FF0000 和 EE0000 两种，这里把「一切非 000000 的颜色」
    统一归一成黑色，确保导出的纸干干净净只有黑白。
    返回 (新xml, 替换处数)。
    """
    n = 0
    # 任意 <w:color w:val="XXXXXX"/> → 000000（只保留本来就是 000000 的）
    out, cnt = re.subn(r'<w:color\s+w:val="(?!000000)([0-9A-Fa-f]{6})"\s*/>',
                       '<w:color w:val="000000"/>', xml)
    n += cnt
    return out, n


def drop_empty_p_after_table(xml):
    """删掉表格后面紧跟的空段落（可能不止一个）。

    原模板在表格和「特别说明」之间留了空段落，其中一段还带着显式的分页符。
    表格一旦被内容撑到第二页，这个分页符就会把「特别说明」再顶到第三页，
    于是中间白多出一整页——这正是「导出来变成三页」的主要来源。

    「特别说明」本身已经加了 pageBreakBefore，分页完全由它负责，
    所以表格后面这些既没字、也没图、也没有节属性的空段落全部可以删掉。
    返回 (新xml, 删了几个)。
    """
    removed = 0
    while True:
        i = xml.rfind('</w:tbl>')
        if i < 0:
            return xml, removed
        j = xml.find('<w:p ', i)
        j2 = xml.find('<w:p>', i)
        if j < 0 or (0 <= j2 < j):
            j = j2
        if j < 0:
            return xml, removed
        k = xml.find('</w:p>', j)
        if k < 0:
            return xml, removed
        k += len('</w:p>')
        p = xml[j:k]
        # 有字、有图、有节属性的一律不动
        if '<w:t' in p or '<w:drawing' in p or '<w:sectPr' in p:
            return xml, removed
        xml = xml[:j] + xml[k:]
        removed += 1


PHOTO_P = ('<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
           '<w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:cs="宋体" w:hint="eastAsia"/>'
           '<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>'
           '<w:t xml:space="preserve">{{photo}}</w:t></w:r></w:p>')


def add_photo_slot(xml):
    """给「照片」那一格补一段 {{photo}}。

    照片格是纵向合并的（第 1 行 restart，第 2~5 行续），原本只有一个「照片」
    两个字的段落。导出的 Word 要能把员工上传的证件照原样贴进去，所以在
    「照片」下面再给一个居中的空段落，导出时把这个占位换成图片。
    有照片时前端会把「照片」那两个字连同这一段一起换掉——一张照片已经说明
    了一切，再顶两个字反而占地方。
    """
    spans = tc_spans(xml)
    for (s, e) in spans:
        tc = xml[s:e]
        if '照片' not in cell_text(tc):
            continue
        if not re.search(r'<w:vMerge w:val="restart"\s*/>', tc):
            continue
        i = tc.rfind('</w:tc>')
        new = tc[:i] + PHOTO_P + tc[i:]
        return xml[:s] + new + xml[e:], True
    return xml, False


RUN_RE = re.compile(r'<w:r>(?:(?!</w:r>)[\s\S])*?</w:r>')
P_RE = re.compile(r'<w:p(?:\s[^>]*)?>[\s\S]*?</w:p>')


def rebuild_sign_line(xml):
    """把表格底部的「填表人签字：______ 日期：______」重排成一行规整的下划线。

    原模板这一行靠一长串前导空格把签字栏推到右边，空格本身也是字，一旦把
    手写签名（一张图）插进去，整行很容易被顶得折行、把表格撑高。
    这里直接按「标签 + 下划线 + 标签 + 下划线」重建这一段的 run，
    长度可控，签名想多宽就多宽。
    """
    i = xml.find('填表人签字：')
    if i < 0:
        return xml, False
    ps = [m for m in P_RE.finditer(xml) if m.start() <= i]
    if not ps:
        return xml, False
    m = ps[-1]
    if m.end() <= i:
        return xml, False

    p = m.group(0)
    open_tag = re.match(r'<w:p(?:\s[^>]*)?>', p).group(0)
    ppr = re.search(r'<w:pPr>[\s\S]*?</w:pPr>', p)
    ppr = ppr.group(0) if ppr else ''
    # 这一段里已经排好版，再去掉首行缩进，免得签名栏整体右移
    ppr = re.sub(r'<w:ind[^/]*/>', '', ppr)
    # 固定行距会把签名图裁掉半截，改成「至少」——这一行原本多高还是多高，
    # 图高一点就把行撑高一点，不会再被切
    ppr = ppr.replace('w:lineRule="exact"', 'w:lineRule="atLeast"')

    rpr = re.search(r'<w:r>(<w:rPr>[\s\S]*?</w:rPr>)', p)
    rpr = rpr.group(1) if rpr else (
        '<w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:cs="宋体" w:hint="eastAsia"/>'
        '<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>')
    rpr = rpr.replace('<w:u w:val="single"/>', '')
    rpr_u = rpr.replace('</w:rPr>', '<w:u w:val="single"/></w:rPr>')

    def run(r, t):
        return '<w:r>' + r + '<w:t xml:space="preserve">' + t + '</w:t></w:r>'

    body = (run(rpr, '　　　　填表人签字：') + run(rpr_u, '{{sig1}}')
            + run(rpr, '　　　　　日期：') + run(rpr_u, '{{date1}}'))
    new = open_tag + ppr + body + '</w:p>'
    return xml[:m.start()] + new + xml[m.end():], True


def relax_paragraph_spacing(xml, pos):
    """把包含 pos 的那一段的固定行距改成「最小值」。

    模板通篇是 18 磅固定行距（lineRule="exact"），固定行距会把比它高的东西
    **裁掉**——签名图插进去只剩半截。改成 atLeast 后，这一行至少还有原来那么高，
    图高一点就把行撑高一点，不会再被切。
    """
    s = xml.rfind('<w:p ', 0, pos)
    s2 = xml.rfind('<w:p>', 0, pos)
    if s2 > s:
        s = s2
    if s < 0:
        return xml
    e = xml.find('</w:p>', pos)
    if e < 0:
        return xml
    seg = xml[s:e].replace('w:lineRule="exact"', 'w:lineRule="atLeast"')
    return xml[:s] + seg + xml[e:]


def mark_blank_after(xml, label, marker, occurrence=1):
    """把某个标签后面那条「下划线空格」换成 {{marker}}。

    纸质表上「填表人签字：______  日期：______」的下划线，本质是一个带下划线
    属性的空格 run。这里定位到那条 run，把空格换成占位符：签字的占位符导出时
    会被换成手写签名的图片，日期的占位符直接填提交日期。
    找不到就原样返回——宁可少一个签名，也不能把模板改坏。
    """
    pos = -1
    for _ in range(occurrence):
        pos = xml.find(label, pos + 1)
        if pos < 0:
            return xml, False
    for m in RUN_RE.finditer(xml, pos):
        run = m.group(0)
        if '<w:u w:val="single"/>' not in run:
            continue
        newrun = re.sub(r'<w:t[^>]*>[^<]*</w:t>',
                        '<w:t xml:space="preserve">{{' + marker + '}}</w:t>', run, count=1)
        if newrun == run:
            return xml, False
        out = xml[:m.start()] + newrun + xml[m.end():]
        # 签名图会被固定行距裁掉，所以这一段改成「至少」行距
        out = relax_paragraph_spacing(out, out.find('{{' + marker + '}}'))
        return out, True
    return xml, False


def force_page_break_before(xml, title):
    """给标题段落加 pageBreakBefore，强制它另起一页。

    「特别说明」在原模板里是第二页，靠第一页表格自然占满；一旦第一页内容被撑高，
    它就会滑到第三页。显式加 pageBreakBefore 后，无论第一页多高，它都固定在新一页。
    """
    idx = xml.find(title)
    if idx < 0:
        return xml
    # 找到包含该文字的 <w:p> 起点
    p_start = xml.rfind('<w:p', 0, idx)
    if p_start < 0:
        return xml
    # 在该段 <w:pPr> 里（或段落开头）插入 pageBreakBefore
    p_end = xml.find('</w:p>', idx)
    if p_end < 0:
        return xml
    seg = xml[p_start:p_end]
    if '<w:pageBreakBefore' in seg:
        return xml
    if '<w:pPr>' in seg:
        # 在 pPr 内部末尾插入
        newseg = seg.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore/>', 1)
    else:
        # 没有 pPr，就在 <w:p ...> 之后补一个
        gt = seg.find('>')
        newseg = seg[:gt + 1] + '<w:pPr><w:pageBreakBefore/></w:pPr>' + seg[gt + 1:]
    return xml[:p_start] + newseg + xml[p_end:]


def build(src, out):
    z = zipfile.ZipFile(src)
    parts, media = {}, {}

    for name in z.namelist():
        if name.endswith('/'):
            continue
        data = z.read(name)
        if name.startswith('word/media/'):
            import base64
            media[name] = base64.b64encode(data).decode('ascii')
        else:
            parts[name] = data.decode('utf-8')

    doc = parts['word/document.xml']

    # ---- 0. 把红字（FF0000，标注必填项）全部转成黑色 ----
    # 导出物不能有任何颜色：盖章签字的纸必须是纯黑。红字只是用来标「哪些必填」。
    doc, nred = blacken_red(doc)
    if nred:
        print(f'已把 {nred} 处红色必填标注转成黑色')

    # ---- 0a. 改几个表头文字（跟着网页表单的措辞走） ----
    # 工作经历现在也接受实习经历，两边叫法必须一致，否则员工会以为实习不用写。
    for old, new in RELABEL:
        if old in doc:
            doc = doc.replace(old, new)
            print(f'表头改名: 「{old}」→「{new}」')

    # ---- 0b. 删掉表格后的空段落，再强制「特别说明」从第二页开始 ----
    # 空段落不删，表格占满第一页时它会被挤到第二页，白白多出一整页空白。
    doc, ndrop = drop_empty_p_after_table(doc)
    if ndrop:
        print(f'已删掉表格后的空段落 {ndrop} 个（防止多出一页空白）')
    doc = force_page_break_before(doc, '特别说明')

    # ---- 0c. 照片位 + 两处签字位 ----
    # 照片：合并格「照片」下面留一个 {{photo}}，导出时换成员工上传的证件照。
    # 签字：表格底部「填表人签字」和末页「申请人签字」各一处，都换成 {{sigN}}，
    #       导出时换成同一个手写签名；旁边的「日期」顺手换成提交日期。
    doc, ok_photo = add_photo_slot(doc)
    print('照片位:', '已加 {{photo}}' if ok_photo else '⚠️ 没找到「照片」合并格')

    doc, ok = rebuild_sign_line(doc)
    print('签字/日期位 sig1/date1:', '已重排' if ok else '⚠️ 没找到「填表人签字：」')
    for label, marker, occ in (
            ('申请人签字：', 'sig2', 1),
            ('日期：', 'date2', 2)):
        doc, ok = mark_blank_after(doc, label, marker, occ)
        print(f'签字/日期位 {marker}:', '已标记' if ok else f'⚠️ 没找到「{label}」后面的下划线')

    spans = tc_spans(doc)

    # ---- 1. 按顺序给空单元格编号，收集要替换的位置 ----
    # 编号口径必须和开发工具/inspect_tpl.py 一致：所有空格子都算，含纵向合并的续格。
    edits = []          # (start, end, newxml)
    empty_no = 0
    for (s, e) in spans:
        tc = doc[s:e]
        if cell_text(tc).strip():
            continue
        empty_no += 1
        key = FILL.get(empty_no)
        if not key or key == 'skip':
            continue
        if is_vmerge_continue(tc):      # 续格填了会和「照片」两个字叠在一起
            continue
        # 长文本（地址、证书、公司名、教育/工作经历）再缩半磅，省下的都是行高
        long_text = key in LONG_KEYS or key.startswith(('edu', 'work'))
        edits.append((s, e, fill_cell(tc, key, LONG_VALUE_SZ if long_text else VALUE_SZ)))

    # 期望空格数：1~29 基本信息 / 30~35 教育 1 行 / 36~45 工作 2 行
    EXPECT_EMPTY = 29 + 6 + WORK_ROWS * 5
    print(f'空单元格 {empty_no} 个，填充 {len(edits)} 个')
    if empty_no != EXPECT_EMPTY:
        print(f'⚠️ 空格数 {empty_no} 和模板预期 {EXPECT_EMPTY} 不一致，请先更新 FILL 映射表')

    # ---- 2. 带文字的格子：把 □ 选项换成占位符 ----
    def replace_cell_text(tc, new_text):
        # 同样去掉加粗：政治面貌 / 婚姻 / 户口性质这几格的勾选项在模板里是粗的，
        # 填出来的 ☑党员 □群众 跟着变粗，和旁边不加粗的内容对不上
        rpr = re.sub(r'<w:b\s*/>|<w:bCs\s*/>', '', first_rpr(tc))
        m = re.search(r'(<w:p(?:\s[^>]*)?>)(<w:pPr>.*?</w:pPr>)', tc, re.S)
        head = m.group(1) if m else '<w:p>'
        ppr = m.group(2) if m else ''
        return (tc[:tc.find('<w:p')] + head + ppr
                + '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(new_text) + '</w:t></w:r></w:p></w:tc>')

    # 按行定位更可靠：把每个 (row, col) 的格子挑出来
    def rows_of(xml):
        tbl_s = xml.find('<w:tbl>')
        tbl_e = xml.find('</w:tbl>')
        body = xml[tbl_s:tbl_e]
        rows = []
        i = 0
        while True:
            s = body.find('<w:tr', i)
            if s < 0:
                break
            e = body.find('</w:tr>', s)
            rows.append((tbl_s + s, tbl_s + e + len('</w:tr>')))
            i = e + len('</w:tr>')
        return rows

    row_spans = rows_of(doc)

    def cells_in(rs, re_):
        """第 r 行的所有单元格在 doc 里的绝对区间"""
        out = []
        cur = rs
        while cur < re_:
            s = doc.find('<w:tc>', cur)
            if s < 0 or s >= re_:
                break
            e = doc.find('</w:tc>', s)
            if e < 0:
                break
            out.append((s, e + len('</w:tc>')))
            cur = e + len('</w:tc>')
        return out

    # (行号, 列号) → 新文本
    # 注意：受教育情况已删到 1 行（原 3 行），工作经历已删到 2 行（原 3 行），
    # 所以「其他信息」区比原始模板少 3 行：Q1 落在第 19 行，往后依次 +1。
    GRID = {
        (3, 3): '{{POLITICAL}}',       # 政治面貌 党员/群众
        (3, 5): '{{MARRIAGE}}',        # 婚姻状况 未婚/已婚
        (4, 3): '{{HOUSEHOLD}}',       # 户口性质 农村/城镇
        (19, 0): '1、是否有个人贷款或因替他人做担保等行为，未按时履约还清账款   {{Q1}}',
        (19, 1): '（必填） {{CREDIT}}',
        (20, 1): '{{YN:q2}}',
        (20, 3): '{{YN:q3}}',
        (21, 1): '{{YN:q4}}',
        (21, 3): '{{YN:q5}}',
        (22, 1): '{{YN:q6}}',
        (23, 1): '{{YN:q7}}',
        (24, 1): '{{YN:q8}}',
        (25, 1): '{{YN:q9}}',
        (26, 1): '{{YN:q10}}',
        (27, 1): '{{YN:q11}}',
        (28, 1): '{{YN:q12}}',
        (28, 3): '{{YN:q13}}',
        (29, 0): '14、曾经有无入职过博迈医疗及其子公司               {{Q14}}',
        (30, 0): '从何渠道得知招聘信息：{{CHANNEL}}',
    }

    done = set()
    for row_idx, (rs, re_) in enumerate(row_spans):
        for ci, (cs, ce) in enumerate(cells_in(rs, re_)):
            if (row_idx, ci) not in GRID:
                continue
            tc = doc[cs:ce]
            edits.append((cs, ce, replace_cell_text(tc, GRID[(row_idx, ci)])))
            done.add((row_idx, ci))
    print('特殊格替换', len(done), '个', sorted(done))

    # ---- 3. 从后往前改，偏移量不会串 ----
    edits.sort(key=lambda x: x[0], reverse=True)
    for (s, e, new) in edits:
        doc = doc[:s] + new + doc[e:]

    parts['word/document.xml'] = doc

    payload = json.dumps({'parts': parts, 'media': media}, ensure_ascii=False)
    js = ('/**\n'
          ' * form-template.js —— 公司《员工信息登记表》母版（自动生成，勿手改）\n'
          ' *\n'
          ' * 由 开发工具/build-form-template.py 从原始 .docx 生成：\n'
          ' * 表格、合并格、行高、字体、页边距、印章图全部保持原样，\n'
          ' * 只有空着待填的格子里写上了 {{占位符}}。\n'
          ' *\n'
          ' * 导出时把 {{...}} 换成实际内容，再按原样打回 zip，就是一份原模板。\n'
          ' */\n'
          '(typeof window !== \'undefined\' ? window : globalThis).FORM_TEMPLATE = '
          + payload + ';\n')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(js)
    print('已生成', out, round(len(js) / 1024), 'KB')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
