#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ocr-bench.py —— 对比 Tesseract 与网页现有模板匹配的身份证号码识别率

两种 Tesseract 策略：
  A. 整图识别中文+英文，再从文本里正则提取 18 位号码
  B. 整图识别（数字白名单），把汉字当噪声滤掉
两者哪个能出正确答案就算对；都对但答案不同算冲突（按失败计，因为不敢用）。

用法：
  python3 ocr-bench.py            # 只测 Tesseract
  python3 ocr-bench.py --with-web # 同时跑 ocr-lite.js（需要 node + canvas）
"""
import glob
import os
import re
import shutil
import subprocess
import sys

# Homebrew 装的 tesseract 不在脚本继承的 PATH 里，必须查绝对路径
TESS = shutil.which('tesseract') or '/opt/homebrew/bin/tesseract'

OUT = '/tmp/idtest'
WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
CODES = '10X98765432'


def check_code(first17):
    return CODES[sum(int(first17[i]) * WEIGHTS[i] for i in range(17)) % 11]


def valid(idno):
    if not re.fullmatch(r'\d{17}[\dXx]', idno):
        return False
    s = idno.upper()
    return check_code(s[:17]) == s[17]


def tesseract(path, psm, extra=None, lang='chi_sim+eng'):
    # 用「切到图片所在目录 + 传文件名」的方式调用。
    # 直接传 /tmp 下的绝对路径时，Leptonica 的 fopen 会被运行环境拒绝
    # （Error in fopenReadStream: failed to open locally with tail ...），
    # 切到该目录后用相对名就能正常打开。
    folder = os.path.dirname(os.path.abspath(path))
    name = os.path.basename(path)
    cmd = [TESS, name, 'stdout', '--psm', str(psm), '-l', lang]
    if extra:
        cmd += extra
    try:
        # 不能加 text=True：tesseract 会往 stderr 写非 UTF-8 字节（图像相关的
        # 内部信息），Python 强行按 UTF-8 解码会抛 UnicodeDecodeError，
        # 异常被吞掉就表现成"识别结果全空"。这里自己解码并容错。
        r = subprocess.run(cmd, capture_output=True, timeout=60, cwd=folder)
        return r.stdout.decode('utf-8', 'replace')
    except Exception:
        return ''


def pick_id(text):
    """从识别文本里捞 18 位号码：先直接找，再容忍空格/换行插在中间"""
    flat = re.sub(r'[\s\u3000]+', '', text)
    cands = re.findall(r'\d{17}[\dXx]', flat)
    good = [c for c in cands if valid(c)]
    if good:
        return good[0].upper(), 'verified'
    if cands:
        return cands[0].upper(), 'unverified'
    # 号码被拆成几段的情况：找最长的数字串
    nums = re.findall(r'\d{10,}', flat)
    if nums:
        return max(nums, key=len), 'partial'
    return '', 'none'


def run_tess(path):
    """两条路都试，返回 (答案, 策略, 是否通过)"""
    tries = []
    for tag, psm, extra in [
        ('A/psm6', 6, None),
        ('A/psm4', 4, None),
        ('B/psm6白名单', 6, ['-c', 'tessedit_char_whitelist=0123456789X']),
        ('B/psm11白名单', 11, ['-c', 'tessedit_char_whitelist=0123456789X']),
    ]:
        txt = tesseract(path, psm, extra)
        got, how = pick_id(txt)
        tries.append((tag, got, how, txt))
    return tries


def run_web(path):
    """调网页那套 ocr-lite.js"""
    js = r'''
const path=require('path');
const fs=require('fs');
const WEB='/Users/langzi/Desktop/入职登记小程序/网页';
global.window=global;
global.__canvasCtor=require('canvas');
require(path.join(WEB,'ocr-lite.js'));
const b64=fs.readFileSync(process.argv[2]).toString('base64');
window.OcrLite.recognize('data:image/png;base64,'+b64,{side:'front'})
  .then(r=>{ console.log(JSON.stringify({ok:r.ok,id:r.idcard||'',msg:r.message||'',stage:r.stage||''})); })
  .catch(e=>{ console.log(JSON.stringify({ok:false,id:'',msg:String(e.message)})); });
'''
    p = '/tmp/_ocrweb.js'
    with open(p, 'w') as fp:
        fp.write(js)
    env = dict(os.environ, NODE_PATH='/Users/langzi/.workbuddy/binaries/node/workspace/node_modules')
    try:
        r = subprocess.run(['node', p, path], capture_output=True, text=True,
                           timeout=180, env=env)
        import json
        line = [l for l in r.stdout.splitlines() if l.strip().startswith('{')]
        return json.loads(line[-1]) if line else {'ok': False, 'id': '', 'msg': r.stderr[:80]}
    except Exception as e:
        return {'ok': False, 'id': '', 'msg': str(e)}


def main():
    with_web = '--with-web' in sys.argv
    samples = sorted(glob.glob(os.path.join(OUT, '*.png')))
    samples = [s for s in samples if not os.path.basename(s).startswith('_')]

    rows = []
    for s in samples:
        kind = os.path.basename(s)[:-4]
        truth = open(s[:-4] + '.txt').read().strip()
        tries = run_tess(s)

        # 只要有一个策略给出正确号码，就算成功
        hit = None
        conflict = False
        answers = set()
        for tag, got, how, _ in tries:
            if got and len(got) == 18:
                answers.add(got)
            if got == truth:
                hit = tag
                break
        if not hit and len({a for a in answers}) > 1:
            conflict = True

        web = run_web(s) if with_web else None
        rows.append({
            'kind': kind, 'truth': truth, 'tess': hit, 'conflict': conflict,
            'best': (answers.pop() if len(answers) == 1 else ''), 'web': web,
            'tries': tries,
        })

    # 明细
    print('%-8s %-20s %-6s %-20s %s' % ('样本', '正确答案', 'Tess', 'Tess 给出', '网页版'))
    print('-' * 92)
    for r in rows:
        web = r['web']
        wtxt = ('✓ ' + web['id']) if (web and web.get('ok') and web.get('id') == r['truth']) else \
               (('误判 ' + web['id']) if (web and web.get('ok')) else '✗ ' + (web.get('msg', '')[:18] if web else '-'))
        print('%-8s %-20s %-6s %-20s %s' % (
            r['kind'], r['truth'],
            ('✓' if r['tess'] else ('冲突' if r['conflict'] else '✗')),
            r['best'] or '-', wtxt))

    n = len(rows)
    tess_ok = sum(1 for r in rows if r['tess'])
    print('-' * 92)
    print('Tesseract 成功率: %d/%d = %.0f%%' % (tess_ok, n, 100.0 * tess_ok / n))
    if with_web:
        web_ok = sum(1 for r in rows if r['web'] and r['web'].get('ok') and r['web'].get('id') == r['truth'])
        web_wrong = sum(1 for r in rows if r['web'] and r['web'].get('ok') and r['web'].get('id') != r['truth'])
        print('网页版成功率:     %d/%d = %.0f%%（误判 %d）' % (web_ok, n, 100.0 * web_ok / n, web_wrong))

    # 失败的细节
    bad = [r for r in rows if not r['tess']]
    if bad:
        print('\n=== 未通过样本的原始识别文本（截 200 字）===')
        for r in bad:
            print('\n[%s] 期望 %s' % (r['kind'], r['truth']))
            for tag, got, how, txt in r['tries']:
                flat = re.sub(r'\s+', ' ', txt).strip()
                print('  %-14s -> %-20s %s' % (tag, got or '(无)', flat[:180]))


if __name__ == '__main__':
    main()
