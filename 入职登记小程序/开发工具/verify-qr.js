/**
 * verify-qr.js —— 配合 verify-qr.py 用，比对 qr-lite 和 Python qrcode 的矩阵
 * 用法：python3 开发工具/verify-qr.py
 */
'use strict';

const fs = require('fs');
const QrLite = require('../网页/qr-lite.js');

const file = process.argv[2];
const cases = JSON.parse(fs.readFileSync(file, 'utf8'));

let pass = 0;
let fail = 0;

cases.forEach(function (c) {
  const label = 'v' + c.version + '-' + c.ec + '-mask' + c.mask
    + '  ' + (c.text.length > 28 ? c.text.slice(0, 28) + '…' : c.text);

  let qr;
  try {
    qr = QrLite.encode(c.text, { version: c.version, ec: c.ec, mask: c.mask });
  } catch (e) {
    console.log('✗ ' + label + '  抛异常：' + e.message);
    fail++;
    return;
  }

  if (qr.size !== c.matrix.length) {
    console.log('✗ ' + label + '  尺寸不对：本地 ' + qr.size + ' vs 标准 ' + c.matrix.length);
    fail++;
    return;
  }

  let diff = 0;
  let firstAt = null;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      const mine = qr.modules[y * qr.size + x] ? 1 : 0;
      if (mine !== c.matrix[y][x]) {
        diff++;
        if (!firstAt) firstAt = '(' + x + ',' + y + ')';
      }
    }
  }

  if (diff === 0) {
    console.log('✓ ' + label + '  ' + qr.size + '×' + qr.size + ' 全对');
    pass++;
  } else {
    console.log('✗ ' + label + '  有 ' + diff + ' 个模块不一致，第一个在 ' + firstAt);
    fail++;
  }
});

console.log('');
console.log('通过 ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
