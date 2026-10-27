/**
 * test-ocr.js —— 身份证号码 OCR 准确率测试
 *
 * 用 node-canvas 画出号码已知的假身份证，再叠加真实拍摄会有的干扰
 * （小角度旋转 / 变暗 / 变亮 / 模糊 / 噪点），看识别能不能对上。
 *
 * 用法：node 开发工具/test-ocr.js
 */
'use strict';

const path = require('path');

/* node-canvas 不在项目里，装在运行环境的 node_modules 下。
   先按正常方式找，找不到再试本机那个固定位置——这样 `node test-ocr.js`
   直接能跑，不用每次手设 NODE_PATH。 */
let Canvas = null;
[
  'canvas',
  path.join(__dirname, 'node_modules', 'canvas'),
  '/Users/langzi/.workbuddy/binaries/node/workspace/node_modules/canvas'
].forEach(function (p) {
  if (Canvas) return;
  try { Canvas = require(p); } catch (e) { /* 试下一个 */ }
});
if (!Canvas) {
  console.error('找不到 node-canvas，这个测试需要它来合成图片。');
  console.error('装一个：npm i -g canvas   或者把它放进 开发工具/node_modules/');
  process.exit(2);
}

// 把 node-canvas 挂给 ocr-lite（它在 Node 侧用 require('canvas')）
globalThis.__canvasCtor = Canvas;
require(path.resolve(__dirname, '..', '网页', 'ocr-lite.js'));
const OcrLite = globalThis.OcrLite;

const W = 856, H = 540;

/** 造一个合法的身份证号（地址码 + 出生 + 顺序码 + 现算校验位） */
function makeId(addr, y, m, d, seq) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const head = addr + y + mm + dd + seq;
  return head + OcrLite.checkCode(head);
}

/** 画一张假身份证（布局对齐 app.js 里的 mockIdCard） */
function drawCard(idcard, tone) {
  tone = tone || { dark: '#2C3E55', bg: '#EAF1FB', bg2: '#D6E4F6' };
  const cv = Canvas.createCanvas(W, H);
  const c = cv.getContext('2d');

  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, tone.bg);
  g.addColorStop(1, tone.bg2);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#B9CCE6';
  c.lineWidth = 6;
  c.strokeRect(3, 3, W - 6, H - 6);

  c.fillStyle = '#8FA6C4';
  c.font = 'bold 30px sans-serif';
  c.fillText('中华人民共和国', 40, 62);
  c.font = 'bold 26px sans-serif';
  c.fillText('居民身份证', 40, 96);

  c.fillStyle = '#DDE7F4';
  c.fillRect(600, 150, 200, 250);

  c.fillStyle = tone.dark;
  const rows = [
    ['姓　名', '张明远'],
    ['性　别', '男　　　民　族 汉'],
    ['出　生', '1993 年 8 月 12 日'],
    ['住　址', '浙江省杭州市西湖区文三路 100 号'],
    ['', '3 幢 201 室']
  ];
  let y = 170;
  rows.forEach(function (r) {
    c.font = '22px sans-serif';
    if (r[0]) c.fillText(r[0], 40, y);
    c.fillText(r[1], 150, y);
    y += 52;
  });

  c.font = '22px sans-serif';
  c.fillText('公民身份号码', 40, 470);
  c.font = 'bold 28px sans-serif';
  c.fillText(idcard, 240, 470);
  return cv;
}

/** 给图像加干扰 */
function perturb(cv, kind) {
  const w = cv.width, h = cv.height;
  if (kind === 'clean') return cv;

  if (kind === 'rotate' || kind === 'rotateBlur') {
    const out = Canvas.createCanvas(w, h);
    const c = out.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    c.rotate(3.5 * Math.PI / 180);
    c.drawImage(cv, -w / 2, -h / 2);
    cv = out;
    if (kind === 'rotate') return cv;
  }

  const out = Canvas.createCanvas(w, h);
  const c = out.getContext('2d');
  if (kind === 'dark') c.filter = 'brightness(0.55)';
  if (kind === 'bright') c.filter = 'brightness(1.45)';
  if (kind === 'blur' || kind === 'rotateBlur') c.filter = (kind === 'rotateBlur' ? '' : '') + 'blur(1.6px)';
  if (kind === 'noise') c.filter = 'contrast(0.78) brightness(1.1)';
  c.drawImage(cv, 0, 0);

  if (kind === 'noise') {
    const d = c.getImageData(0, 0, w, h);
    let seed = 7;
    for (let i = 0; i < d.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = (seed % 55) - 27;
      d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
    }
    c.putImageData(d, 0, 0);
  }
  return out;
}

function toDataUrl(cv) {
  return cv.toDataURL('image/jpeg', 0.82);
}

async function one(idcard, kind, label) {
  const cv = perturb(drawCard(idcard), kind);
  const r = await OcrLite.recognize(toDataUrl(cv), { side: 'front' });
  const ok = r.ok && r.idcard === idcard;
  const mark = ok ? '✓' : '✗';
  const got = r.ok ? r.idcard : ('失败@' + (r.stage || '?') + '：' + (r.message || '').slice(0, 26));
  console.log(`  ${mark} ${label.padEnd(16)} 期望 ${idcard}  →  ${got}`);
  return ok;
}

(async function main() {
  console.log('');
  console.log('身份证号码 OCR 准确率测试');
  console.log('────────────────────────────────────────────');

  // 一批合法号码，覆盖不同地址 / 生日 / 性别位
  const cases = [
    makeId('330106', 1993, 8, 12, '453'),
    makeId('440305', 1995, 12, 20, '886'),
    makeId('510107', 1990, 7, 15, '244'),
    makeId('320102', 1988, 11, 3, '251'),
    makeId('110101', 2001, 1, 9, '001'),
    makeId('370202', 1997, 4, 28, '662'),
  ];

  const kinds = ['clean', 'rotate', 'dark', 'bright', 'blur', 'noise', 'rotateBlur'];

  let pass = 0, total = 0;
  for (const id of cases) {
    for (const kind of kinds) {
      total++;
      if (await one(id, kind, kind)) pass++;
    }
    console.log('');
  }

  console.log('────────────────────────────────────────────');
  console.log(`结果：${pass}/${total} 通过（${(pass / total * 100).toFixed(1)}%）`);
  console.log('');

  // 确定性：同一张图跑三次必须一模一样
  const id = cases[0];
  const cv = toDataUrl(perturb(drawCard(id), 'rotate'));
  const r1 = await OcrLite.recognize(cv, { side: 'front' });
  const r2 = await OcrLite.recognize(cv, { side: 'front' });
  const r3 = await OcrLite.recognize(cv, { side: 'front' });
  const same = r1.idcard === r2.idcard && r2.idcard === r3.idcard;
  console.log(same ? '✓ 确定性：同一张图识别 3 次结果一致'
    : `✗ 同一张图结果漂移：${r1.idcard} / ${r2.idcard} / ${r3.idcard}`);

  // 识别不出时不能编假号码
  const blank = Canvas.createCanvas(W, H);
  const bc = blank.getContext('2d');
  bc.fillStyle = '#fff'; bc.fillRect(0, 0, W, H);
  bc.fillStyle = '#ccc'; bc.font = '40px sans-serif';
  bc.fillText('这不是身份证', 300, 270);
  const rb = await OcrLite.recognize(blank.toDataURL('image/jpeg', 0.9), { side: 'front' });
  const honest = !rb.ok && !rb.idcard;
  console.log(honest ? '✓ 空白图：如实报失败，不编假号码' : `✗ 空白图居然返回了：${rb.idcard}`);

  console.log('');
  process.exit(pass === total && same && honest ? 0 : 1);
})();
