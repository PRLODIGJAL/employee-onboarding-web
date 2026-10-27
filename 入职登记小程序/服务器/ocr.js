/**
 * ocr.js —— 服务端身份证识别（Tesseract）
 *
 * 为什么要有它：网页里那套模板匹配只能算「凑合」——它拿 canvas 画出来的
 * 数字当模板去比对，而身份证号码用的是专用字体（OCR-B 一类），骨架差得远，
 * 一模糊就崩。Tesseract 有真正的字符分类器和语言模型，同样的照片能稳定读出来。
 *
 * 三条硬规矩：
 *   1. 照片只落在临时目录，识别完立刻删，不进 data/、不留痕
 *   2. 不联任何外部接口——身份证照片不出这台机器
 *   3. 读不准就明说读不准，绝不返回猜出来的号（错号比没识别更麻烦）
 *
 * 没装 Tesseract 也不影响系统使用：detect() 报不可用，前端自动退回本地那套。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

/* 常见安装位置。也允许用 TESSERACT_BIN 指定 */
const SEARCH = [
  process.env.TESSERACT_BIN,
  '/usr/bin/tesseract',            // Debian / Ubuntu
  '/usr/local/bin/tesseract',      // 源码安装 / 部分云镜像
  '/opt/homebrew/bin/tesseract',   // macOS Apple Silicon
  '/usr/local/opt/tesseract/bin/tesseract'
].filter(Boolean);

const TIMEOUT = Number(process.env.OCR_TIMEOUT_MS || 20000);
const MAX_SIDE = Number(process.env.OCR_MAX_SIDE || 2400);   // 太大反而慢且不更准

/* ================= 校验位：判断读出来的是不是一个真号码 ================= */

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CODES = '10X98765432';

function checkCode(first17) {
  if (!/^\d{17}$/.test(first17)) return '';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * WEIGHTS[i];
  return CODES[sum % 11];
}

/** 号码是不是说得通：17 位 + 校验位，且生日是合法日期 */
function plausible(id) {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const y = +id.slice(6, 10), m = +id.slice(10, 12), d = +id.slice(12, 14);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

function validId(id) {
  const s = String(id || '').toUpperCase();
  return plausible(s) && checkCode(s.slice(0, 17)) === s[17];
}

/* ================= 调 tesseract ================= */

let cached = null;

function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, {
      cwd: cwd,
      timeout: TIMEOUT,
      maxBuffer: 8 * 1024 * 1024,
      // 不设 shell，参数不经解释器，图片名/语言名不会被当成命令拼进去
      encoding: 'buffer'
    }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr ? stderr.toString('utf8') : '';
        return reject(err);
      }
      // 必须自己解码：tesseract 的 stderr 里会混非 UTF-8 字节，
      // 交给 Node 按 utf8 转会抛错，表现成"什么都没识别出来"
      resolve(stdout.toString('utf8'));
    });
  });
}

/**
 * 探测本机有没有可用的 tesseract。结果缓存，一个进程只探一次。
 * @returns {Promise<{available:boolean, bin?:string, langs?:string[], chinese?:boolean,
 *                    label:string, hint?:string}>}
 */
async function detect() {
  if (cached) return cached;

  for (const bin of SEARCH) {
    let exists = false;
    try { exists = fs.existsSync(bin); } catch (e) { exists = false; }
    if (!exists) continue;

    try {
      const out = await run(bin, ['--list-langs'], path.dirname(bin));
      // 输出第一行是 "List of available languages in .../tessdata/ (163):"
      const langs = out.split(/\r?\n/).slice(1).map(s => s.trim()).filter(Boolean);
      const chinese = langs.indexOf('chi_sim') > -1;
      cached = {
        available: true,
        bin: bin,
        langs: langs,
        chinese: chinese,
        label: chinese ? 'Tesseract 服务端识别' : 'Tesseract（缺中文包）',
        hint: chinese ? '' : '只装了 tesseract-ocr，缺 tesseract-ocr-chi-sim，中文/号码识别会不准'
      };
      return cached;
    } catch (e) {
      // 这个位置跑不起来，试下一个
    }
  }

  cached = {
    available: false,
    label: '未安装 Tesseract',
    hint: '服务器上装 tesseract-ocr 和 tesseract-ocr-chi-sim 后重启即可启用（见部署文档）'
  };
  return cached;
}

/* ================= 从识别文本里挑号码 ================= */

/**
 * tesseract 把整张证件的字都吐出来，这一行很关键：号码可能被识别成
 * "440304 1990 0512 1237"（带空格）或者折成两行，所以先把空白全去掉再找。
 */
function pickId(text) {
  const flat = String(text || '').replace(/[\s\u3000]+/g, '');

  // 优先要能过校验位的
  const all = flat.match(/\d{17}[\dXx]/g) || [];
  const good = all.filter(validId);
  if (good.length) {
    // 同一张证件理论上只有一个号码；万一读出多个合法号，取最先出现的
    return { id: good[0].toUpperCase(), verified: true };
  }
  if (all.length) return { id: all[0].toUpperCase(), verified: false };

  // 位数不对但明显是号码：取最长的那串数字，交给调用方决定要不要提示核对
  const nums = flat.match(/\d{12,}/g) || [];
  if (nums.length) {
    const longest = nums.reduce((a, b) => (b.length > a.length ? b : a));
    return { id: longest, verified: false, partial: true };
  }
  return { id: '', verified: false };
}

/* ================= 识别 ================= */

/**
 * 预处理：把图片限制在 MAX_SIDE 以内。
 * 3000px 的原图丢给 tesseract 并不会更准，只会更慢、更容易在反光处出错。
 * 这里不引入图像库，靠 tesseract 自己处理缩放（它有内建的 OSD 与缩放），
 * 所以只做"尺寸检查 + 超大图提示"，真正的缩小在前端上传时已经做过。
 */

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tif'
};

/** dataURL 或纯 base64 -> { buf, ext } */
function parseImage(input) {
  const s = String(input || '');
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(s);
  if (m) {
    const ext = MIME_EXT[m[1].toLowerCase()] || 'jpg';
    return { buf: Buffer.from(m[2], 'base64'), ext: ext };
  }
  // 没带 data: 前缀就当纯 base64，默认 jpg
  return { buf: Buffer.from(s, 'base64'), ext: 'jpg' };
}

/* 并发闸门：tesseract 是 CPU 密集的，一次来 10 个人会把机器拖死。
   排成队列，同时最多 2 个。 */
const MAX_PARALLEL = Number(process.env.OCR_PARALLEL || 2);
let running = 0;
const waiting = [];

function acquire() {
  return new Promise(resolve => {
    if (running < MAX_PARALLEL) { running++; return resolve(); }
    waiting.push(resolve);
  });
}

function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

/**
 * 识别一张身份证正面。
 * @param {string} image dataURL 或 base64
 * @returns {Promise<{ok:boolean, idcard?:string, provider:string,
 *                    confidence?:number, message:string, raw?:string}>}
 */
async function recognize(image) {
  const eng = await detect();
  if (!eng.available) {
    return {
      ok: false, provider: 'none',
      message: '服务器上没有 OCR 引擎，' + (eng.hint || '请让 IT 安装 Tesseract')
    };
  }

  let parsed;
  try { parsed = parseImage(image); } catch (e) { parsed = null; }
  if (!parsed || !parsed.buf || parsed.buf.length < 1024) {
    return { ok: false, provider: 'tesseract', message: '照片是空的或者太小，重拍一张' };
  }
  if (parsed.buf.length > 12 * 1024 * 1024) {
    return { ok: false, provider: 'tesseract', message: '照片太大了（超过 12MB），换一张' };
  }

  await acquire();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmai-ocr-'));
  const name = 'in.' + parsed.ext;
  const file = path.join(dir, name);

  try {
    fs.writeFileSync(file, parsed.buf, { mode: 0o600 });

    /* 三次尝试，从最常规到最激进：
       psm 6 —— 当成一整块文本（证件就是这种版式），大多数情况一次就中
       psm 4 —— 当成多栏，用在版面被识别歪了的时候
       psm 11 —— 稀疏文本，专治号码跟标签粘在一起
       每次都把汉字白名单去掉，否则 tesseract 会把 0 认成"〇" */
    const plans = [
      { psm: '6', note: '整块' },
      { psm: '4', note: '分栏' },
      { psm: '11', note: '稀疏' },
      { psm: '6', note: '数字优先', wl: '0123456789Xx' }
    ];

    let best = null;
    let firstText = '';

    for (const plan of plans) {
      const args = [name, 'stdout', '--psm', plan.psm, '-l', 'chi_sim+eng'];
      if (plan.wl) args.push('-c', 'tessedit_char_whitelist=' + plan.wl);

      let text = '';
      try {
        text = await run(eng.bin, args, dir);
      } catch (e) {
        // 单次失败（超时、图坏了）不算致命，换下一个策略
        continue;
      }
      if (!firstText && text.trim()) firstText = text;

      const got = pickId(text);
      if (got.verified) {
        best = { got: got, text: text, plan: plan };
        break;                    // 过了校验位就没必要再试更激进的
      }
      if (got.id && !best) best = { got: got, text: text, plan: plan };
    }

    if (!best || !best.got.id) {
      return {
        ok: false, provider: 'tesseract',
        message: '这张照片没读出号码——可能太糊、反光或被挡住了，手输一下更快',
        raw: firstText.replace(/\s+/g, ' ').trim().slice(0, 200)
      };
    }

    const id = best.got.id;
    if (best.got.verified) {
      return {
        ok: true, idcard: id, provider: 'tesseract', confidence: 0.95,
        message: '已识别 ' + id + '，可以直接改',
        raw: best.text.replace(/\s+/g, ' ').trim().slice(0, 200)
      };
    }

    // 位数对但过不了校验位：只报位数不合，绝不把疑似号当结果填进去
    if (id.length !== 18) {
      return {
        ok: false, provider: 'tesseract',
        message: '号码只读出 ' + id.length + ' 位，不完整——手输一下更稳',
        raw: firstText.replace(/\s+/g, ' ').trim().slice(0, 200)
      };
    }
    return {
      ok: false, provider: 'tesseract',
      message: '读到的号码是 ' + id + '，但校验位对不上（可能拍反或太糊），请你核对',
      suspect: id,
      raw: firstText.replace(/\s+/g, ' ').trim().slice(0, 200)
    };
  } finally {
    // 不管成功失败，照片都从这里消失
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
    release();
  }
}

module.exports = {
  detect: detect,
  recognize: recognize,
  // 给测试用
  _pickId: pickId,
  _validId: validId,
  _checkCode: checkCode,
  _parseImage: parseImage,
  _reset: function () { cached = null; },
  MAX_SIDE: MAX_SIDE
};
