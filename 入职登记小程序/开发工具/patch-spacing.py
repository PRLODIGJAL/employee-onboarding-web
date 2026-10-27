# -*- coding: utf-8 -*-
"""把 docx 里所有固定行距改成指定值，用来实测「哪一档才真能压进两页」。

用法：python3 patch-spacing.py <in.docx> <out.docx> <line_值>
"""
import sys, re, zipfile, shutil


def main(src, out, line):
    zin = zipfile.ZipFile(src)
    items = [(i, zin.read(i.filename)) for i in zin.infolist()]
    zin.close()
    zout = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    n = 0
    for info, data in items:
        if info.filename == 'word/document.xml':
            xml = data.decode('utf-8')
            xml, n = re.subn(r'(w:line=")(\d+)(" w:lineRule="exact")',
                             r'\g<1>%s\g<3>' % line, xml)
            data = xml.encode('utf-8')
        zout.writestr(info, data)
    zout.close()
    print('改了 %d 处行距 → %s，输出 %s' % (n, line, out))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
