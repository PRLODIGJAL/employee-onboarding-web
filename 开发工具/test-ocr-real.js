'use strict';
/**
 * 真实拍摄场景的 OCR 压力测试
 *
 * 之前的 test-ocr.js 用的是"程序画的标准卡片"，太干净。
 * 真实身份证有：浅蓝底纹、彩色渐变、红色印章、反光、手持倾斜、JPEG 压缩。
 * 这个脚本专门造这些干扰，用来量化改进前后的差别。
 *
 * 用法：node 开发工具/test-ocr-real.js [--verbose]
 */
const path = require('path');
const Canvas = require('canvas');
globalThis.__canvasCtor = Canvas;

const ROOT = '/Users/langzi/Desktop/入职登记小程序';
require(path.resolve(ROOT, '网页', 'ocr-lite.js'));
const O = globalThis.OcrLite;

const W = 856, H = 540;
const ADDRS = ['330106', '440305', '510107', '320102', '110101', '370202', '430104', '500103'];

function makeId(addr, y, m, d, seq) {
  const head = addr + y + String(m).padStart(2, '0') + String(d).padStart(2, '0') + seq;
  return head + O.checkCode(head);
}

/* ---------- 画一张"像真的"身份证 ---------- */

function drawCard(idcard, opts = {}) {
  const cv = Canvas.createCanvas(W, H);
  const c = cv.getContext('2d');

  // 1) 底纹：浅蓝到白的斜向渐变（真实证件就是这个调子）
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, opts.dark ? '#C9D9EF' : '#DCE7F6');
  g.addColorStop(0.45, '#EDF3FB');
  g.addColorStop(1, opts.dark ? '#D5E2F2' : '#F7FAFE');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // 2) 淡格纹（仿防伪底纹）
  c.strokeStyle = 'rgba(150, 175, 210, 0.18)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 12) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x - 40, H); c.stroke();
  }

  // 3) 头像占位
  c.fillStyle = 'rgba(160, 180, 205, 0.55)';
  c.fillRect(W - 210, 130, 160, 200);

  // 4) 左侧文字
  c.fillStyle = opts.faint ? '#5A6A80' : '#243247';
  c.font = 'bold 26px sans-serif';
  c.fillText('中华人民共和国', 40, 62);
  c.font = 'bold 22px sans-serif';
  c.fillText('居民身份证', 40, 96);

  const rows = [
    ['姓　名', '张明远'],
    ['性　别', '男　　　民　族 汉'],
    ['出　生', '1993 年 8 月 12 日'],
    ['住　址', '浙江省杭州市西湖区文三路 100 号'],
    ['', '3 幢 201 室']
  ];
  let y = 168;
  c.font = '21px sans-serif';
  rows.forEach(r => {
    if (r[0]) c.fillText(r[0], 40, y);
    c.fillText(r[1], 148, y);
    y += 50;
  });

  // 5) 号码行（真实证件：标签在左，号码在右）
  c.font = '20px sans-serif';
  c.fillText('公民身份号码', 40, 468);
  c.fillStyle = '#101820';
  c.font = 'bold 28px sans-serif';
  c.fillText(idcard, 232, 470);

  return cv;
}

/* ---------- 干扰 ---------- */

function perturb(cv, kind, rng) {
  const w = cv.width, h = cv.height;
  let out = Canvas.createCanvas(w, h);
  let c = out.getContext('2d');

  switch (kind) {
    case 'clean':
      return cv;

    case 'seal': {
      // 红色公章盖在号码上（真实场景：骑缝章会压到号码）
      c.drawImage(cv, 0, 0);
      c.save();
      c.globalAlpha = 0.34;
      c.strokeStyle = '#C0392B';
      c.lineWidth = 9;
      c.beginPath();
      c.arc(560, 430, 132, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 3;
      c.beginPath();
      c.arc(560, 430, 112, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 0.42;
      c.fillStyle = '#C0392B';
      c.font = 'bold 30px sans-serif';
      c.fillText('博迈医疗', 505, 442);
      c.restore();
      return out;
    }

    case 'glare': {
      // 顶部斜向反光，把号码下半截冲淡
      c.drawImage(cv, 0, 0);
      const g = c.createLinearGradient(0, h * 0.6, w, h * 0.95);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.72)');
      g.addColorStop(1, 'rgba(255,255,255,0.1)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      return out;
    }

    case 'skew': {
      // 手持倾斜 3~7 度
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.translate(w / 2, h / 2);
      c.rotate(((rng() * 4 + 3) * (rng() > 0.5 ? 1 : -1)) * Math.PI / 180);
      c.drawImage(cv, -w / 2, -h / 2);
      return out;
    }

    case 'persp': {
      // 模拟俯拍：右边比左边窄一点（透视）
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      const k = 0.06 + rng() * 0.05;
      // 用三条竖条近似横向压缩，避免依赖 projective 变换
      for (let x = 0; x < w; x += 4) {
        const t = x / w;
        const squeeze = 1 - k * t;
        const src = cv.getContext('2d').getImageData(x, 0, 4, h);
        const dw = Math.max(1, Math.round(4 * squeeze));
        const tmp = Canvas.createCanvas(4, h);
        tmp.getContext('2d').putImageData(src, 0, 0);
        c.drawImage(tmp, x, 0, 4, h, x + (w - x) * 0 + t * 0, 0, dw, h);
      }
      return out;
    }

    case 'jpeg': {
      // 手机上传常见：先缩小再 JPEG 压缩
      const scale = 0.62 + rng() * 0.18;
      const sw = Math.round(w * scale), sh = Math.round(h * scale);
      const small = Canvas.createCanvas(sw, sh);
      const sc = small.getContext('2d');
      sc.drawImage(cv, 0, 0, sw, sh);
      return small;
    }

    case 'noisy': {
      c.filter = 'contrast(0.9) brightness(1.06) blur(1.1px)';
      c.drawImage(cv, 0, 0);
      c.filter = 'none';
      const d = c.getImageData(0, 0, w, h);
      let seed = (rng() * 1e9) | 0;
      for (let i = 0; i < d.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const n = ((seed % 60) - 30) | 0;
        d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
      }
      c.putImageData(d, 0, 0);
      return out;
    }

    case 'dark': {
      c.filter = 'brightness(0.62)';
      c.drawImage(cv, 0, 0);
      return out;
    }

    case 'faint': {
      // 字迹浅（复印件/多次转存）
      c.globalAlpha = 0.55;
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
      c.drawImage(cv, 0, 0);
      c.filter = 'contrast(0.7)';
      c.drawImage(out, 0, 0);
      return out;
    }

    default:
      return cv;
  }
}

/* ---------- 跑分 ---------- */

const KINDS = ['clean', 'seal', 'glare', 'skew', 'persp', 'jpeg', 'noisy', 'dark', 'faint'];
const verbose = process.argv.includes('--verbose');

(async () => {
  let seed = 20261022;
  const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const stat = {};
  let pass = 0, total = 0;
  const t0 = Date.now();

  for (const kind of KINDS) {
    stat[kind] = { pass: 0, total: 0, ms: 0, fails: [] };
    for (let k = 0; k < 4; k++) {
      const addr = ADDRS[Math.floor(rng() * ADDRS.length)];
      const year = 1965 + Math.floor(rng() * 40);
      const month = 1 + Math.floor(rng() * 12);
      const day = 1 + Math.floor(rng() * 28);
      const seq = String(Math.floor(rng() * 999)).padStart(3, '0');
      const id = makeId(addr, year, month, day, seq);

      const card = drawCard(id, { faint: kind === 'faint', dark: kind === 'dark' });
      const img = perturb(card, kind, rng);
      const dataUrl = img.toDataURL('image/jpeg', kind === 'jpeg' ? 0.55 : 0.82);

      const started = Date.now();
      const r = await O.recognize(dataUrl, { side: 'front' });
      const cost = Date.now() - started;

      total++; stat[kind].total++; stat[kind].ms += cost;
      if (r.ok && r.idcard === id) {
        pass++; stat[kind].pass++;
      } else {
        stat[kind].fails.push({ want: id, got: r.idcard || ('fail@' + r.stage), stage: r.stage });
      }
      if (verbose) {
        console.log(`  [${kind}] ${id} → ${r.ok ? r.idcard : 'fail@' + r.stage}  (${cost}ms)`);
      }
    }
  }

  console.log('');
  console.log('真实场景 OCR 测试（每类 4 张，共 ' + total + ' 张）');
  console.log('─'.repeat(52));
  console.log('干扰类型        通过      单张耗时');
  for (const kind of KINDS) {
    const s = stat[kind];
    const label = {
      clean: '干净原图', seal: '红章压号码', glare: '反光冲淡',
      skew: '手持倾斜', persp: '俯拍透视', jpeg: '缩小+高压缩',
      noisy: '噪点+模糊', dark: '偏暗', faint: '字迹发浅'
    }[kind] || kind;
    const pad = (str, n) => str + ' '.repeat(Math.max(0, n - [...str].length * 2));
    console.log(pad(label, 16) + (s.pass + '/' + s.total).padEnd(9, ' ') + Math.round(s.ms / s.total) + 'ms');
  }
  console.log('─'.repeat(52));
  console.log('合计 ' + pass + '/' + total + ' = ' + (pass / total * 100).toFixed(1) + '%   总耗时 ' + (Date.now() - t0) + 'ms');

  const anyFail = Object.keys(stat).some(k => stat[k].fails.length);
  if (anyFail) {
    console.log('');
    console.log('失败明细：');
    for (const kind of KINDS) {
      stat[kind].fails.forEach(f => console.log('  [' + kind + '] 期望 ' + f.want + ' → ' + f.got));
    }
  }

  /* ---------- 安全性质：宁可失败，不可给错号 ---------- */
  console.log('');
  console.log('安全性质（遮挡号码后必须"读对或报失败"，不许给错号）：');
  let safe = 0, safeTotal = 0, wrong = [];
  for (let k = 0; k < 8; k++) {
    const id = makeId(ADDRS[k % ADDRS.length], 1970 + k * 4, 1 + (k % 12), 2 + k, String(100 + k));
    const card = drawCard(id);
    const c = card.getContext('2d');
    // 用一个白块盖住生日段的 2 位（模拟污损/被遮挡）
    const startX = 232 + Math.floor((8 + (k % 3)) * 15.6);
    c.fillStyle = '#F4F8FD';
    c.fillRect(startX - 2, 440, 34, 44);

    const r = await O.recognize(card.toDataURL('image/jpeg', 0.85), { side: 'front' });
    safeTotal++;
    if (!r.ok || r.idcard === id) safe++;
    else wrong.push({ want: id, got: r.idcard });
  }
  console.log('  ' + safe + '/' + safeTotal + (wrong.length ? '' : '  全部安全'));
  wrong.forEach(w => console.log('  ✗ 给出了错号：期望 ' + w.want + ' 实际 ' + w.got));

  const allSafe = wrong.length === 0;
  process.exit(allSafe && pass === total ? 0 : 1);
})();
