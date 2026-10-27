/**
 * verify-qr-decode.js —— 用 jsQR 真"扫"一遍自己生成的二维码
 *
 * verify-qr.py 比的是矩阵（结构对不对），这个脚本比的是"能不能扫出来"，
 * 两个都过才算放心。
 *
 * 依赖（只在跑测试时需要，网页本身零依赖）：
 *   npm i jsqr
 *
 * 跑法：
 *   NODE_PATH=/Users/langzi/.workbuddy/binaries/node/workspace/node_modules \
 *   node 开发工具/verify-qr-decode.js
 */
'use strict';

const jsQR = require('jsqr');
const QrLite = require('../网页/qr-lite.js');

/** 把矩阵画成 RGBA 像素，交给 jsQR 解 */
function render(qr, scale, quiet) {
  const dim = (qr.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y * qr.size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * dim + ((x + quiet) * scale + dx);
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, dim };
}

const cases = [
  'https://onboard.bmai.com/',
  'https://onboard.bmai.com/fill?src=zhaopin',
  'http://192.168.13.101:8080/',
  'https://onboard.bmai.com/fill?utm_source=zhaopin&utm_medium=poster&d=2026',
  '入职登记 https://onboard.bmai.com/fill',
  'https://a.cn/' + 'x'.repeat(180)
];

let bad = 0;
cases.forEach(function (text) {
  const qr = QrLite.encode(text);
  const r = render(qr, 8, 4);
  const res = jsQR(r.data, r.dim, r.dim);
  const got = res && res.data;
  if (got === text) {
    console.log('✓ v' + qr.version + '-EC' + qr.ec + '  ' + r.dim + 'px  ' + text.slice(0, 44));
  } else {
    bad++;
    console.log('✗ 扫不出来 / 扫错：' + text.slice(0, 60) + '  得到 ' + got);
  }
});

console.log('');
console.log(bad ? '有 ' + bad + ' 个扫不出来' : '全部可扫');
process.exit(bad ? 1 : 0);
