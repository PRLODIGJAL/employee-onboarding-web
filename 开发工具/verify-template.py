"""校验导出文件是否真的「基于模板保持不变」

检查项：
  1. 工作表数量/名称/隐藏状态与原模板完全一致
  2. 数据验证条数与区域一致
  3. 第 1~5 行表头文字原样
  4. 第 6 行起是新数据，且落在正确的列
  5. dimension / 列宽
"""
import sys
from openpyxl import load_workbook

TPL = '/Users/langzi/Desktop/入职登记小程序/网页/assets/roster-template.xlsx'


def snapshot(path):
    wb = load_workbook(path)
    return wb


def dv_list(wb):
    ws = wb['导入花名册模板']
    out = []
    for dv in ws.data_validations.dataValidation:
        out.append((dv.type, str(dv.sqref), dv.formula1))
    return out


def main(path, expect_rows):
    tpl = load_workbook(TPL)
    out = load_workbook(path)

    ok = True

    def check(label, cond, extra=''):
        nonlocal ok
        print(('  OK  ' if cond else '  FAIL') + '  ' + label + (('  ' + extra) if extra else ''))
        if not cond:
            ok = False

    print('\n=== ' + path + ' ===')
    check('工作表 13 个', len(out.sheetnames) == len(tpl.sheetnames) == 13,
          str(len(out.sheetnames)) + ' vs ' + str(len(tpl.sheetnames)))
    check('工作表名称与顺序一致', out.sheetnames == tpl.sheetnames)
    hid_out = [out[s].sheet_state for s in out.sheetnames]
    hid_tpl = [tpl[s].sheet_state for s in tpl.sheetnames]
    check('隐藏状态一致', hid_out == hid_tpl, str(hid_out.count('hidden')) + ' 个隐藏')

    ws = out['导入花名册模板']
    tws = tpl['导入花名册模板']

    dv_out = dv_list(out)
    dv_tpl = dv_list(tpl)
    check('数据验证条数 ' + str(len(dv_tpl)), len(dv_out) == len(dv_tpl), str(len(dv_out)))
    check('数据验证规则完全一致', dv_out == dv_tpl)

    # 表头 5 行
    same_head = True
    diff = []
    for r in range(1, 6):
        for c in range(1, 120):
            a = tws.cell(row=r, column=c).value
            b = ws.cell(row=r, column=c).value
            if a != b:
                same_head = False
                diff.append((r, c, a, b))
    check('第 1~5 行表头逐格一致', same_head, str(diff[:3]) if diff else '')

    check('列宽一致', abs((ws.column_dimensions['A'].width or 0)
                          - (tws.column_dimensions['A'].width or 0)) < 0.01,
          str(ws.column_dimensions['A'].width) + ' vs ' + str(tws.column_dimensions['A'].width))

    check('dimension 跟着数据走', ws.dimensions.endswith(str(5 + expect_rows)),
          ws.dimensions)

    # 数据行
    print('  --- 第 6 行起的数据 ---')
    for r in range(6, 6 + expect_rows):
        vals = [(ws.cell(row=r, column=c).coordinate, ws.cell(row=r, column=c).value)
                for c in range(1, 120) if ws.cell(row=r, column=c).value not in (None, '')]
        print('   行%d: %s' % (r, vals))

    # 不该有多余行
    extra = [r for r in range(6 + expect_rows, 6 + expect_rows + 5)
             if any(ws.cell(row=r, column=c).value for c in range(1, 120))]
    check('第 %d 行之后没有残留数据' % (5 + expect_rows), not extra, str(extra))

    return ok


if __name__ == '__main__':
    a = main('/tmp/out_1row.xlsx', 1)
    b = main('/tmp/out_3row.xlsx', 3)
    print('\n结论：', '全部通过' if (a and b) else '有失败项')
    sys.exit(0 if (a and b) else 1)
