#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用 Python 的 qrcode 库当"标准答案"，逐模块校验 web/qr-lite.js 生成的二维码。

检验点覆盖：bit 流填充、分块、RS 纠错、交织、模块摆放、格式信息、掩码。
只要同一个 (版本, 纠错级别, 掩码) 下矩阵完全一致，说明这几步都没错。

用法：
    python3 web/verify-qr.py
"""
import json
import os
import subprocess
import sys

try:
    import qrcode
    from qrcode.util import QRData, MODE_8BIT_BYTE
except ImportError:
    print("缺 qrcode 库：pip install qrcode")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))

EC = {
    "L": qrcode.constants.ERROR_CORRECT_L,
    "M": qrcode.constants.ERROR_CORRECT_M,
    "Q": qrcode.constants.ERROR_CORRECT_Q,
    "H": qrcode.constants.ERROR_CORRECT_H,
}

# (内容, 纠错级别, 掩码, 版本)
# 版本一律写死：python-qrcode 的自动选版有时会保守地跳大，不利于逐模块比对；
# 这里用的版本都是"刚好装得下"的最小版本，等于同时校验了容量表。
CASES = [
    ("https://bmai.example.com/", "M", 0, 2),
    ("https://bmai.example.com/", "M", 3, 2),
    ("https://bmai.example.com/", "M", 7, 2),
    ("http://192.168.13.101:8080/fill", "M", 2, 3),
    ("https://onboard.bmai.com/hr/fill?src=zhaopin", "M", 5, 4),
    ("https://onboard.bmai.com/fill?from=gongzhonghao&id=2026", "M", 1, 4),
    ("https://onboard.bmai.com/fill", "L", 6, 2),
    ("A" * 120, "M", 4, 7),
    ("https://onboard.bmai.com/fill?utm_source=zhaopin&utm_medium=poster&d=2026", "M", 0, 5),
    ("B" * 200, "L", 2, 9),
    ("入职登记：" + "https://onboard.bmai.com/fill", "M", 3, 4),
]


def matrix_for(text, version, ec, mask):
    qr = qrcode.QRCode(
        version=version,          # None = 自动挑最小版本
        error_correction=EC[ec],
        box_size=1,
        border=0,
        mask_pattern=mask,
    )
    qr.add_data(QRData(text.encode("utf-8"), mode=MODE_8BIT_BYTE))
    qr.make(fit=False)
    return qr.version, [[1 if c else 0 for c in row] for row in qr.modules]


def main():
    payload = []
    for text, ec, mask, ver in CASES:
        used, mat = matrix_for(text, ver, ec, mask)
        payload.append({
            "text": text,
            "version": used,
            "autoVersion": ver is None,
            "ec": ec,
            "mask": mask,
            "matrix": mat,
        })

    tmp = os.path.join(HERE, ".qr-cases.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    script = os.path.join(HERE, "verify-qr.js")
    r = subprocess.run(
        ["node", script, tmp],
        capture_output=True,
        text=True,
        cwd=HERE,
        env=dict(os.environ, PATH=os.environ.get("PATH", "")),
    )
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    os.remove(tmp)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
