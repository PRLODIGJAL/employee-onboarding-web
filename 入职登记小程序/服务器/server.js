#!/usr/bin/env node
/**
 * 员工信息登记 —— 服务端（零依赖，只用 Node 内置模块）
 *
 * 作用：
 *   1. 把 web/ 目录当成网站发布出去（员工用手机打开网址就能填）
 *   2. 收表单：把每个人填的内容 + 身份证照片存到 server/data/ 下面
 *   3. 给 HR 用：登录、列表、取单条、删除
 *
 * 不做的事：
 *   - 不生成 Word / PDF / Excel —— 这些由员工和 HR 的浏览器现场生成
 *     （服务端没装 canvas 就跑不了 PDF，放在浏览器反而更省服务器）
 *   - 不碰公司的花名册总表
 *
 * 启动：
 *   node server.js                 默认 8080 端口
 *   PORT=9000 node server.js       换端口
 *   HR_PASSWORD=你的密码 node server.js
 *   PUBLIC_URL=https://xxx.com node server.js   网站对外的正式地址（生成二维码用）
 *   TRUST_PROXY=1 node server.js   前面挂了 Caddy / nginx 反向代理时加这个
 *   SUBMIT_CODE=bmai2026 node server.js         要求员工输入填写口令（可选，防乱填）
 *
 * 改 HR 密码：
 *   node server.js --password 新密码      （在服务器上执行）
 *   或者登录 HR 后台 →「系统状态」→「改密码」（不用登服务器）
 *
 * 监控（这一版新增）：
 *   GET /api/health        给外部监控用的健康检查，2xx 就算活着
 *   GET /api/admin/stats   HR 后台「系统状态」的数据源：运行时长、磁盘、错误、备份
 *   日志：服务器/logs/app-YYYY-MM-DD.log，一天一个文件，只留 30 天
 *   每个请求都有 requestId，出错时页面上会显示，查日志就按这个号搜
 *
 * 数据都在 server/data/，备份这个目录就等于备份全部数据。
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

// 只在真的挂了反向代理时才信 X-Forwarded-For。
// 否则公网上任何人都能自己伪造这个头，把"连错锁定"和"提交限流"绕过去。
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const SUBMIT_CODE = String(process.env.SUBMIT_CODE || '').trim();

// 防刷：同一个人 10 分钟内最多交 3 份（正常情况 1 份就够）；整个站一天最多 300 份
const SUBMIT_PER_IP = 3;
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
const SUBMIT_DAILY_MAX = Number(process.env.SUBMIT_DAILY_MAX || 300);


const WEB = path.resolve(__dirname, '..', '网页');
const DATA = path.join(__dirname, 'data');
const RECS = path.join(DATA, 'records');
const PICS = path.join(DATA, 'photos');
const LOGS = path.join(__dirname, 'logs');
const BACKUP = path.resolve(__dirname, '..', '备份');
[RECS, PICS, LOGS].forEach(function (d) { fs.mkdirSync(d, { recursive: true }); });

/* ---------------- 身份证识别（Tesseract） ----------------
 *
 * 网页里那套模板匹配只是兜底，真正认字靠这里。没装 Tesseract 时
 * ocr.detect() 报不可用，前端自动退回浏览器那套，功能不受影响。
 */
const ocr = require(path.join(__dirname, 'ocr.js'));

/* 识别限流：同一个人连着拍十几张，或者有人拿它当免费 OCR 刷，都要挡住。
   滑动窗口，一分钟 20 次，够正常人用（一次提交最多拍两下）。 */
const OCR_WINDOW_MS = 60 * 1000;
const OCR_PER_IP = Number(process.env.OCR_PER_IP || 20);
const ocrHits = new Map();      // ip -> [时间戳...]

function takeOcrBudget(ip) {
  const now = Date.now();
  const arr = (ocrHits.get(ip) || []).filter(function (t) { return now - t < OCR_WINDOW_MS; });
  if (arr.length >= OCR_PER_IP) { ocrHits.set(ip, arr); return false; }
  arr.push(now);
  ocrHits.set(ip, arr);
  // 顺手清一遍，别让这个 Map 随着来访 IP 无限长
  if (ocrHits.size > 800) {
    ocrHits.forEach(function (v, k) {
      if (!v.length || now - v[v.length - 1] > OCR_WINDOW_MS * 5) ocrHits.delete(k);
    });
  }
  return true;
}

/* ---------------- 自动备份 ---------------- */

const backupMod = require(path.join(__dirname, 'backup.js'));
const AUTO_BACKUP_HOURS = Math.max(1, Number(process.env.AUTO_BACKUP_HOURS || 24));
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 30));

/* ---------------- Word → PDF ---------------- */

// 说明：网页端不再导出 PDF。PDF 只有让 Word 自己转才准，浏览器重画一定对不上；
// 需要归档时 HR 用批量转换工具转一次即可。所以服务端也不再提供转换接口。

/* ---------------- 密钥 & HR 账号 ---------------- */

const SECRET_FILE = path.join(DATA, 'secret.txt');
let SECRET = '';
if (fs.existsSync(SECRET_FILE)) {
  SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
}
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
}

const HR_FILE = path.join(DATA, 'hr.json');

function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString('hex');
}

function saveHr(empNo, pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const obj = { empNo: empNo, salt: salt, hash: hashPw(pw, salt), updatedAt: new Date().toISOString() };
  fs.writeFileSync(HR_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
  return obj;
}

// 命令行改密码：node server.js --password 新密码
const pwIdx = process.argv.indexOf('--password');
if (pwIdx > -1 && process.argv[pwIdx + 1]) {
  const empNo = process.env.HR_EMP_NO || 'HR001';
  saveHr(empNo, process.argv[pwIdx + 1]);
  console.log('✅ HR 密码已更新（工号 ' + empNo + '）');
  process.exit(0);
}

let HR = null;
if (fs.existsSync(HR_FILE)) {
  HR = JSON.parse(fs.readFileSync(HR_FILE, 'utf8'));
} else {
  HR = saveHr(process.env.HR_EMP_NO || 'HR001', process.env.HR_PASSWORD || 'bmai2026');
  console.log('⚠️  首次启动，已创建 HR 账号：' + HR.empNo + ' / ' + (process.env.HR_PASSWORD || 'bmai2026'));
  console.log('   正式使用前请改密码：node server.js --password 你的新密码');
}

/* ---------------- 提交之后的「下一站」 ----------------

   员工填完，后面还有一步：等审核、收通知、加群、关注公众号。
   这些内容会变（换群、换 HR、换话术），所以不能写死在页面里，
   存成 data/guide.json，HR 在后台改，员工下次打开就是新的。

   注意：这段内容是公开的（员工不登录也要看），所以只放"去哪里看通知"，
   不放任何员工数据，也不放 HR 的工号。 */

const GUIDE_FILE = path.join(DATA, 'guide.json');
const GUIDE_MAX_LINKS = 3;
const GUIDE_MAX_STEPS = 5;

function cleanText(v, max) {
  // 去掉控制字符：这份内容会直接拼进页面，宁可少一个字也不要带不可见的内容
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function defaultGuide() {
  return {
    enabled: true,
    title: '信息已提交，接下来这样走',
    intro: '你的登记已经到 HR 手上。有写错的地方，点上面的「填错了，重新填一份」重填一遍；没有的话，审核结果从下面的入口通知你。',
    steps: [
      'HR 核对信息，一般 1–2 个工作日',
      '收到入职通知，按通知准备材料',
      '按约定的时间到公司报到'
    ],
    links: [
      { kind: 'link', label: '关注公众号，接收入职通知', value: '' },
      { kind: 'text', label: 'HR 微信（加好友请备注姓名）', value: '' }
    ],
    note: '',
    updatedAt: ''
  };
}

/** 只认白名单字段，长度和数量都限死，避免后台存进来一份奇怪的东西 */
function normalizeGuide(raw) {
  const g = defaultGuide();
  if (!raw || typeof raw !== 'object') return g;

  g.enabled = raw.enabled !== false;
  g.title = cleanText(raw.title, 60) || g.title;
  g.intro = cleanText(raw.intro, 300);
  g.note = cleanText(raw.note, 200);

  if (Array.isArray(raw.steps)) {
    g.steps = raw.steps.slice(0, GUIDE_MAX_STEPS)
      .map(function (x) { return cleanText(x, 120); })
      .filter(Boolean);
  }

  if (Array.isArray(raw.links)) {
    g.links = raw.links.slice(0, GUIDE_MAX_LINKS).map(function (l) {
      if (!l || typeof l !== 'object') return null;
      const kind = ['link', 'qr', 'text'].indexOf(l.kind) > -1 ? l.kind : 'link';
      const label = cleanText(l.label, 60);
      const value = cleanText(l.value, 400);
      if (!label && !value) return null;
      // 要跳转、要画二维码的，必须是 http(s)；填了「博迈医疗」这种纯文字就降级成可复制文本
      if (kind !== 'text' && !/^https?:\/\//i.test(value)) {
        return { kind: 'text', label: label || value, value: value };
      }
      return { kind: kind, label: label || value, value: value };
    }).filter(Boolean);
  }

  return g;
}

function readGuide() {
  try {
    if (fs.existsSync(GUIDE_FILE)) {
      return normalizeGuide(JSON.parse(fs.readFileSync(GUIDE_FILE, 'utf8')));
    }
  } catch (e) {
    // 文件坏了不该让页面打不开，退回默认内容
    logEvent('warn', 'guide_read_fail', { message: e.message });
  }
  return defaultGuide();
}

/* ---------------- 登录 token ---------------- */

const TOKEN_HOURS = 8;

function makeToken() {
  const payload = Buffer.from(JSON.stringify({
    e: HR.empNo,
    exp: Date.now() + TOKEN_HOURS * 3600 * 1000
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function checkToken(t) {
  if (!t || typeof t !== 'string') return false;
  const parts = t.split('.');
  if (parts.length !== 2) return false;
  const sig = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('base64url');
  if (sig !== parts[1]) return false;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return p.exp > Date.now();
  } catch (e) {
    return false;
  }
}

/* ---------------- 小工具 ---------------- */

function json(res, code, obj) {
  // 每个响应都带上这次请求的编号：用户在页面上看到报错时，让 HR 报这个号，
  // 直接去 logs/ 里搜就能定位到那一次请求（他那套接口里也带 request_id，这点值得学）。
  const payload = Object.assign({}, obj || {});
  if (res._rid && !payload.requestId) payload.requestId = res._rid;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limitBytes) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function safeId(s) {
  return /^[A-Za-z0-9_-]{4,64}$/.test(String(s || ''));
}

/**
 * 拿访问者 IP。
 * 只有 TRUST_PROXY=1（说明前面确实有反向代理）才看 X-Forwarded-For，
 * 不然这个头是可以随便写的，限流就形同虚设。
 */
function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '');
    if (xf) return xf.split(',')[0].trim();
    const real = String(req.headers['x-real-ip'] || '');
    if (real) return real.trim();
  }
  return req.socket.remoteAddress || '';
}

/** 当前请求实际用的地址（HR 用它生成二维码，所以在哪个域名打开就是哪个域名） */
function originOf(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = TRUST_PROXY && req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || ('127.0.0.1:' + PORT);
  return proto + '://' + String(host).split(',')[0].trim();
}

/* ---------------- 运行日志 & 监控 ---------------- */

const LOG_KEEP_DAYS = Number(process.env.LOG_KEEP_DAYS || 30);

const STATS = {
  startedAt: Date.now(),
  submitOk: 0,
  submitRejected: 0,
  loginOk: 0,
  loginFail: 0,
  errors: []          // 最近 20 条，给「系统状态」面板看
};

/**
 * 一行一个 JSON 的日志。为什么不写人类可读的那种？
 * 因为出问题时要能 grep：搜 requestId、搜 "level":"error"、搜某个人提交失败的原因，
 * 结构化日志一行就是一条完整事件，不用去对上下文。
 */
function logEvent(level, event, fields) {
  const now = new Date();
  const obj = Object.assign({ t: now.toISOString(), level: level, event: event }, fields || {});
  try {
    fs.appendFileSync(
      path.join(LOGS, 'app-' + now.toISOString().slice(0, 10) + '.log'),
      JSON.stringify(obj) + '\n'
    );
  } catch (e) { /* 磁盘满 / 没权限：日志写不进去不能让主流程崩 */ }
  if (level === 'error') console.error('[' + event + ']', obj.message || '');
}

/** 启动时清一次：只留最近 N 天，免得日志把磁盘吃满（这正是不做监控最容易踩的坑） */
function pruneLogs() {
  try {
    const cutoff = Date.now() - LOG_KEEP_DAYS * 86400000;
    fs.readdirSync(LOGS).forEach(function (f) {
      if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(f)) return;
      const p = path.join(LOGS, f);
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch (e) { }
    });
  } catch (e) { }
}

function noteError(evt, err, rid) {
  STATS.errors.push({
    t: new Date().toISOString(),
    event: evt,
    message: String((err && err.message) || err || '').slice(0, 300),
    requestId: rid || ''
  });
  if (STATS.errors.length > 20) STATS.errors.shift();
}

function humanBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(n) || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)) + u[i];
}

/** 目录里所有文件的总字节数（递归，但只到三层，够用且不会被软链接绕进去） */
function dirBytes(dir, depth) {
  let total = 0, files = 0;
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
      const p = path.join(dir, d.name);
      try {
        if (d.isDirectory()) {
          if ((depth || 0) < 3) { const sub = dirBytes(p, (depth || 0) + 1); total += sub.bytes; files += sub.files; }
        } else {
          total += fs.statSync(p).size; files += 1;
        }
      } catch (e) { }
    });
  } catch (e) { }
  return { bytes: total, files: files };
}

/** 磁盘剩余。statfs 在 Node 18.15+ 才有，取不到就返回 null，面板显示"—"而不是报错 */
function diskInfo() {
  try {
    const s = fs.statfsSync(DATA);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    return { totalBytes: total, freeBytes: free, usedPercent: total ? Math.round((1 - free / total) * 100) : 0 };
  } catch (e) { return null; }
}

/** 最近一次备份（备份脚本会把 zip 丢进 备份/ 目录） */
function lastBackup() {
  try {
    let newest = null;
    fs.readdirSync(BACKUP).forEach(function (f) {
      if (!/\.zip$/i.test(f)) return;
      const st = fs.statSync(path.join(BACKUP, f));
      // 注意：存进去的字段名和比较用的字段名必须是同一个。
      // 这里曾经写成「存 mtime、比 mtimeMs」，于是永远认为第一份就是最新的——
      // 结果「系统状态」永远显示最旧的那次备份，自动备份也每小时重复备一次。
      if (!newest || st.mtimeMs > newest.mtimeMs) newest = { file: f, mtimeMs: st.mtimeMs, size: st.size };
    });
    return newest ? { file: newest.file, at: new Date(newest.mtimeMs).toISOString(), size: humanBytes(newest.size) } : null;
  } catch (e) { return null; }
}

/**
 * 自动备份：这件事交给程序做，不要再指望有人记得点按钮。
 *
 * 规则（简单到不会出意外）：
 *   - 库里没有记录就不备（空目录备份只是刷一堆无意义的 zip）
 *   - 距离上一份不到 AUTOBACKUP_HOURS（默认 24）小时就跳过 —— 所以重启多少次都不会重复备
 *   - 只留最近 BACKUP_KEEP（默认 30）份，由 backup.run 负责清理
 *   - 出错只记日志，不影响服务（备份失败不该让员工填不了表）
 */
function autoBackup() {
  if (process.env.AUTO_BACKUP === '0') return;
  try {
    const recs = fs.readdirSync(RECS).filter(function (f) { return /\.json$/.test(f); }).length;
    if (!recs) return;

    const bk = lastBackup();
    if (bk && Date.now() - Date.parse(bk.at) < AUTO_BACKUP_HOURS * 3600000) return;

    const r = backupMod.run({ keep: BACKUP_KEEP, quiet: true });
    if (r.ok) {
      console.log('  [备份] 已存 ' + r.file + '（' + r.files + ' 个文件 / ' + r.records + ' 条记录）');
      logEvent('info', 'backup_auto', {
        file: r.file, files: r.files, records: r.records,
        photos: r.photos, bytes: r.zipBytes, pruned: r.pruned
      });
    }
  } catch (e) {
    logEvent('error', 'backup_failed', { message: e.message });
  }
}

/* 提交限流：同 IP 十分钟内 3 次 + 全站每天上限，防止被公网上的脚本刷爆硬盘 */
const submitHits = new Map();   // ip -> { n, reset }
let dailyDate = '';
let dailyCount = 0;

function noteSubmit(ip) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDate) { dailyDate = today; dailyCount = 0; }

  if (dailyCount >= SUBMIT_DAILY_MAX) return { ok: false, reason: 'day' };

  const w = submitHits.get(ip);
  if (!w || now > w.reset) {
    submitHits.set(ip, { n: 1, reset: now + SUBMIT_WINDOW_MS });
  } else {
    if (w.n >= SUBMIT_PER_IP) return { ok: false, reason: 'ip', wait: Math.ceil((w.reset - now) / 60000) };
    w.n += 1;
  }
  dailyCount += 1;
  return { ok: true };
}


function saveDataUrl(dataUrl, id, side) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return '';
  const ext = m[1].toLowerCase() === 'png' ? 'png' : (m[1].toLowerCase() === 'webp' ? 'webp' : 'jpg');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) return '';
  const file = id + '_' + (side === 'back' ? 'back' : 'front') + '.' + ext;
  fs.writeFileSync(path.join(PICS, file), buf);
  return file;
}

function loadPic(file) {
  if (!file) return '';
  const p = path.join(PICS, path.basename(file));
  if (!fs.existsSync(p)) return '';
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  return 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* ---------------- 静态文件 ---------------- */

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  const full = path.resolve(WEB, '.' + rel);
  if (!full.startsWith(WEB + path.sep) && full !== WEB) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(full, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('没有这个文件：' + rel);
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // 页面和脚本不缓存，免得改了以后员工手机上还是旧版
    const cache = (ext === '.html' || ext === '.js' || ext === '.css')
      ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': cache
    });
    fs.createReadStream(full).pipe(res);
  });
}

/* ---------------- 接口 ---------------- */

const loginFails = new Map();   // ip -> {n, until}

function lockedFor(ip) {
  const r = loginFails.get(ip);
  if (!r) return 0;
  if (r.until && r.until > Date.now()) return Math.ceil((r.until - Date.now()) / 1000);
  return 0;
}

function noteFail(ip) {
  const r = loginFails.get(ip) || { n: 0, until: 0 };
  r.n += 1;
  if (r.n >= 5) { r.until = Date.now() + 60 * 1000; r.n = 0; }
  loginFails.set(ip, r);
  return r;
}

function listRecords() {
  return fs.readdirSync(RECS)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) {
      try { return JSON.parse(fs.readFileSync(path.join(RECS, f), 'utf8')); }
      catch (e) { return null; }
    })
    .filter(Boolean)
    .sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
}

function brief(r) {
  return {
    id: r.id,
    formNo: r.formNo,
    submittedAt: r.submittedAt,
    hasFront: !!r.photos.front,
    hasBack: !!r.photos.back,
    values: r.values || {},
    tables: r.tables || {},
    // 处理状态：HR 在后台上标的，跟员工填的内容分开存
    status: r.status || 'pending',
    remark: r.remark || '',
    statusAt: r.statusAt || '',
    statusBy: r.statusBy || ''
  };
}

async function handleApi(req, res, urlPath) {
  const ip = clientIp(req);

  /* 服务状态 —— 前端用它判断"有没有后端" */
  if (urlPath === '/api/ping' && req.method === 'GET') {
    const n = listRecords().length;
    return json(res, 200, { ok: true, server: '入职登记', version: 2, records: n });
  }

  /* 前端启动时读一次：填写链接（生成二维码用）、要不要口令、在线人数、
     以及「提交之后去哪儿」的引导内容（这段是给员工看的，不需要登录） */
  if (urlPath === '/api/config' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      origin: originOf(req),
      requireCode: !!SUBMIT_CODE,
      records: listRecords().length,
      guide: readGuide(),
      serverTime: new Date().toISOString()
    });
  }

  /* 健康检查 —— 给外部监控（UptimeRobot 之类）定时敲。
     只要返回 200 就算活着；返回内容故意很少，不泄露任何业务信息。 */
  if (urlPath === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      status: 'ok',
      uptimeSec: Math.floor((Date.now() - STATS.startedAt) / 1000),
      serverTime: new Date().toISOString()
    });
  }

  /* HR 登录 */
  if (urlPath === '/api/login' && req.method === 'POST') {
    const left = lockedFor(ip);
    if (left) return json(res, 429, { ok: false, code: 'LOCKED', message: '试错太多次，' + left + ' 秒后再试' });

    let body;
    try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')); }
    catch (e) { return json(res, 400, { ok: false, message: '请求格式不对' }); }

    const empNo = String(body.empNo || '').trim();
    const pw = String(body.password || '');

    if (empNo !== HR.empNo || hashPw(pw, HR.salt) !== HR.hash) {
      const r = noteFail(ip);
      const remain = Math.max(0, 5 - r.n);
      STATS.loginFail += 1;
      logEvent('warn', 'login_fail', { ip: ip, empNo: empNo, remain: remain, requestId: res._rid });
      return json(res, 401, {
        ok: false, code: 'BAD_LOGIN',
        message: '工号或密码不对' + (remain ? '，还可以试 ' + remain + ' 次' : '，先等 1 分钟')
      });
    }

    loginFails.delete(ip);
    STATS.loginOk += 1;
    logEvent('info', 'login_ok', { ip: ip, empNo: empNo, requestId: res._rid });
    return json(res, 200, { ok: true, token: makeToken(), empNo: HR.empNo, hours: TOKEN_HOURS });
  }

  /* 员工提交 */
  if (urlPath === '/api/submit' && req.method === 'POST') {
    let body;
    try { body = JSON.parse((await readBody(req, 24 * 1024 * 1024)).toString('utf8')); }
    catch (e) {
      if (e.message === 'TOO_LARGE') return json(res, 413, { ok: false, message: '照片太大，请重拍或换一张' });
      return json(res, 400, { ok: false, message: '提交的数据格式不对' });
    }

    if (SUBMIT_CODE && String(body.code || '').trim() !== SUBMIT_CODE) {
      return json(res, 403, { ok: false, code: 'BAD_CODE', message: '填写口令不对，请找 HR 要一下' });
    }

    const formNo = String(body.formNo || '').trim();
    if (!safeId(formNo)) return json(res, 400, { ok: false, message: '登记编号不合法' });
    if (!body.values || !body.values.realName) {
      return json(res, 400, { ok: false, message: '缺少姓名' });
    }

    // 同一个编号已经有记录了，只允许原来的那台设备覆盖（网络重试），不让别人改
    const existed = path.join(RECS, formNo + '.json');
    let prevMeta = null;
    if (fs.existsSync(existed)) {
      let prevIp = '';
      try {
        const prev = JSON.parse(fs.readFileSync(existed, 'utf8'));
        prevIp = prev.ip || '';
        // 重试提交是"同一份表再传一次"，别把 HR 已经标好的状态和备注冲掉
        prevMeta = {
          status: prev.status, remark: prev.remark,
          statusAt: prev.statusAt, statusBy: prev.statusBy
        };
      } catch (e) { }
      if (prevIp && prevIp !== ip) {
        return json(res, 409, { ok: false, code: 'DUP', message: '这个登记编号已经提交过了，不用重复提交' });
      }
    }

    const limit = noteSubmit(ip);
    if (!limit.ok) {
      STATS.submitRejected += 1;
      logEvent('warn', 'submit_rejected', { ip: ip, reason: limit.reason, requestId: res._rid });
      if (limit.reason === 'day') {
        return json(res, 429, { ok: false, code: 'DAY_LIMIT', message: '今天收到的登记太多了，请联系 HR' });
      }
      return json(res, 429, {
        ok: false, code: 'TOO_MANY',
        message: '短时间提交太多次了，' + limit.wait + ' 分钟后再试'
      });
    }

    const id = formNo;
    const photos = body.idPhotos || {};
    const rec = {
      id: id,
      formNo: formNo,
      submittedAt: body.submittedAt || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      ip: ip,
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
      values: body.values,
      tables: body.tables || {},
      photos: {
        front: saveDataUrl(photos.front, id, 'front'),
        back: saveDataUrl(photos.back, id, 'back')
      }
    };
    if (prevMeta) {
      rec.status = prevMeta.status;
      rec.remark = prevMeta.remark;
      rec.statusAt = prevMeta.statusAt;
      rec.statusBy = prevMeta.statusBy;
    }

    const tmp = path.join(RECS, id + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, path.join(RECS, id + '.json'));

    STATS.submitOk += 1;
    logEvent('info', 'submit_ok', {
      formNo: formNo,
      ip: ip,
      front: rec.photos.front || '',
      back: rec.photos.back || '',
      photosBytes: (rec.photos.front ? fs.statSync(path.join(PICS, rec.photos.front)).size : 0)
        + (rec.photos.back ? fs.statSync(path.join(PICS, rec.photos.back)).size : 0),
      requestId: res._rid
    });
    console.log('📥 收到提交 ' + rec.formNo + ' ' + rec.values.realName);
    return json(res, 200, { ok: true, id: id, formNo: formNo });
  }

  /* ---------------- 身份证识别 ----------------
   *
   * 放在鉴权之前：填表的是员工，他没有账号，但拍身份证这一下必须能用。
   * 所以这里只靠"每 IP 每分钟 20 次"的限流挡滥用，不要求登录。
   * 照片不进 data/，识别完临时文件立刻删掉（见 ocr.js）。
   */
  if (urlPath === '/api/ocr/status' && req.method === 'GET') {
    const eng = await ocr.detect();
    // 只暴露"能不能用"，不返回完整语言列表（那是这台机器的内部信息）
    return json(res, 200, {
      ok: true,
      available: !!eng.available,
      chinese: !!eng.chinese,
      label: eng.label,
      hint: eng.hint || ''
    });
  }

  if (urlPath === '/api/ocr' && req.method === 'POST') {
    if (!takeOcrBudget(ip)) {
      return json(res, 429, {
        ok: false, code: 'TOO_MANY',
        message: '识别次数太频繁，等一分钟再试，或者直接手输'
      });
    }

    let body;
    try {
      // 手机原图 base64 会到 8MB 上下，给到 16MB 富余
      body = JSON.parse((await readBody(req, 16 * 1024 * 1024)).toString('utf8'));
    } catch (e) {
      return json(res, 400, { ok: false, code: 'BAD_BODY', message: '照片数据读不出来，重拍一张' });
    }

    const image = body.image || body.dataUrl || '';
    const t0 = Date.now();
    const r = await ocr.recognize(image);
    const ms = Date.now() - t0;

    logEvent(r.ok ? 'info' : 'warn', 'ocr', {
      ok: r.ok, provider: r.provider, ms: ms,
      // 日志里绝不记识别出来的号码——日志会留 30 天，号码不该躺在那里
      ip: ip, requestId: res._rid
    });

    return json(res, 200, r);
  }

  /* 以下都需要 HR 身份 */
  const token = req.headers['x-token'] || '';
  if (urlPath.indexOf('/api/') === 0 && !checkToken(token)) {
    return json(res, 401, { ok: false, code: 'NO_AUTH', message: '登录已过期，请重新登录' });
  }

  /* 系统状态 —— HR 后台「系统」面板的数据源。只有登录后才能看 */
  if (urlPath === '/api/admin/stats' && req.method === 'GET') {
    const list = listRecords();
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = list.filter(function (r) {
      return String(r.receivedAt || r.submittedAt || '').slice(0, 10) === today;
    }).length;

    const photos = dirBytes(PICS);
    const dataSize = dirBytes(DATA);
    const disk = diskInfo();
    const bk = lastBackup();
    const mem = process.memoryUsage();
    const upSec = Math.floor((Date.now() - STATS.startedAt) / 1000);

    const checks = [];
    function chk(name, level, text) { checks.push({ name: name, level: level, text: text }); }

    // 磁盘：这个系统唯一真正会"用着用着坏掉"的地方就是照片把盘写满
    if (!disk) chk('磁盘', 'warn', '读不到磁盘信息，登服务器执行 df -h 看一眼');
    else if (disk.freeBytes < 1024 * 1024 * 1024) chk('磁盘', 'bad', '只剩 ' + humanBytes(disk.freeBytes) + '，照片马上就写不进去了');
    else if (disk.freeBytes < 5 * 1024 * 1024 * 1024) chk('磁盘', 'warn', '只剩 ' + humanBytes(disk.freeBytes) + '，建议清理或扩容');
    else chk('磁盘', 'ok', '剩余 ' + humanBytes(disk.freeBytes) + '，已用 ' + disk.usedPercent + '%');

    /* 身份证识别：装了 Tesseract 才是服务端认字。没装也不会坏，只是员工那边
       退回浏览器本机那套模板匹配，糊一点的照片就读不出来了。 */
    const eng = await ocr.detect();
    if (!eng.available) {
      chk('身份证识别', 'warn', '没装 Tesseract，员工拍照只能靠浏览器本机识别，成功率低。'
        + '让 IT 装 tesseract-ocr 和 tesseract-ocr-chi-sim 后重启');
    } else if (!eng.chinese) {
      chk('身份证识别', 'warn', '装了 Tesseract 但缺中文包（tesseract-ocr-chi-sim），号码识别会不准');
    } else {
      chk('身份证识别', 'ok', 'Tesseract 就绪，服务端识别');
    }

    // 备份：没有备份的系统等于没有系统。现在由服务每小时自检、每 24 小时自己存一份
    if (!bk) {
      chk('备份', 'warn', '还没备份过（服务每小时会自检，有记录后自动存一份）');
    } else {
      const days = Math.floor((Date.now() - Date.parse(bk.at)) / 86400000);
      chk('备份', days > 7 ? 'warn' : 'ok',
        days > 7
          ? ('上次备份是 ' + days + ' 天前：' + bk.file + '（自动备份可能停了，看日志）')
          : ('上次备份 ' + bk.at.slice(0, 10) + '：' + bk.file + '（自动，每 ' + AUTO_BACKUP_HOURS + ' 小时一次）'));
    }

    // 错误：近一小时超过 5 次就值得看一眼日志
    const recentErr = STATS.errors.filter(function (e) {
      return Date.now() - Date.parse(e.t) < 3600000;
    }).length;
    chk('错误', recentErr >= 5 ? 'warn' : 'ok',
      recentErr ? ('最近 1 小时 ' + recentErr + ' 次报错，见下方列表') : '最近 1 小时没有报错');

    // 照片：有没有哪份记录漏了身份证照片
    const noPic = list.filter(function (r) {
      return !r.photos || (!r.photos.front && !r.photos.back);
    }).length;
    if (list.length) {
      chk('照片', noPic ? 'warn' : 'ok',
        noPic ? ('有 ' + noPic + ' 份没存到身份证照片，导出时会缺图') : '每份都带照片');
    }

    const level = checks.some(function (c) { return c.level === 'bad'; }) ? 'bad'
      : (checks.some(function (c) { return c.level === 'warn'; }) ? 'warn' : 'ok');

    return json(res, 200, {
      ok: true,
      level: level,
      uptimeSec: upSec,
      startedAt: new Date(STATS.startedAt).toISOString(),
      node: process.version,
      memory: { rss: humanBytes(mem.rss), heap: humanBytes(mem.heapUsed) },
      counts: {
        total: list.length, today: todayCount,
        submitOk: STATS.submitOk, submitRejected: STATS.submitRejected,
        loginOk: STATS.loginOk, loginFail: STATS.loginFail
      },
      storage: {
        dataBytes: humanBytes(dataSize.bytes), dataFiles: dataSize.files,
        photosBytes: humanBytes(photos.bytes), photos: photos.files,
        freeBytes: disk ? humanBytes(disk.freeBytes) : '—',
        usedPercent: disk ? disk.usedPercent : null
      },
      logs: { dir: LOGS, keepDays: LOG_KEEP_DAYS },
      backup: bk,
      checks: checks,
      errors: STATS.errors.slice(-8).reverse()
    });
  }

  /* HR 改密码 —— 不用登服务器，页面里就能改。改完所有旧登录立刻失效 */
  if (urlPath === '/api/hr/password' && req.method === 'POST') {
    let body;
    try { body = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8')); }
    catch (e) { return json(res, 400, { ok: false, message: '请求格式不对' }); }

    const oldPw = String(body.old || '');
    const next = String(body.next || '');
    if (hashPw(oldPw, HR.salt) !== HR.hash) {
      logEvent('warn', 'password_change_fail', { ip: ip, requestId: res._rid });
      return json(res, 403, { ok: false, message: '原密码不对' });
    }
    if (next.length < 8) return json(res, 400, { ok: false, message: '新密码至少 8 位' });
    if (next === oldPw) return json(res, 400, { ok: false, message: '新密码不能和原密码一样' });

    HR = saveHr(HR.empNo, next);
    // 换掉签名密钥，等于把所有人的旧登录态一次性踢掉
    SECRET = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
    logEvent('info', 'password_changed', { ip: ip, requestId: res._rid });
    return json(res, 200, { ok: true, message: '密码已改，请用新密码重新登录' });
  }

  /* 提交之后的引导内容 —— HR 在后台改。员工那边是公开读的（走 /api/config），
     写必须登录，否则谁都能把员工引导到别的链接去 */
  if (urlPath === '/api/hr/guide') {
    if (req.method === 'GET') return json(res, 200, { ok: true, guide: readGuide() });
    if (req.method === 'POST') {
      let body;
      try { body = JSON.parse((await readBody(req, 32 * 1024)).toString('utf8')); }
      catch (e) { return json(res, 400, { ok: false, message: '请求格式不对' }); }

      const g = normalizeGuide(body);
      g.updatedAt = new Date().toISOString();
      fs.writeFileSync(GUIDE_FILE, JSON.stringify(g, null, 2));
      logEvent('info', 'guide_saved', {
        ip: ip, enabled: g.enabled, steps: g.steps.length, links: g.links.length, requestId: res._rid
      });
      return json(res, 200, { ok: true, guide: g });
    }
  }

  /* 改处理状态 / 备注 —— HR 在后台点「状态」时调的
     跟员工提交的档案分开存：员工那份是"当时说了什么"，这份是"后来办了没" */
  const metaM = /^\/api\/record\/([A-Za-z0-9_-]{4,64})\/meta$/.exec(urlPath);
  if (metaM && req.method === 'POST') {
    const p = path.join(RECS, metaM[1] + '.json');
    if (!fs.existsSync(p)) return json(res, 404, { ok: false, message: '没有这条记录' });

    let body;
    try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')); }
    catch (e) { return json(res, 400, { ok: false, message: '请求格式不对' }); }

    const ALLOWED = ['pending', 'hired', 'rejected'];
    let st = String(body.status || '').trim();
    // 兼容旧客户端 / 旧数据里的 'back'（旧名"退回补充"，现已改名"已驳回"）
    if (st === 'back') st = 'rejected';
    if (ALLOWED.indexOf(st) < 0) return json(res, 400, { ok: false, message: '状态只能是 pending / hired / rejected' });
    const remark = String(body.remark || '').trim().slice(0, 200);

    let r;
    try { r = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { return json(res, 500, { ok: false, message: '这条记录读不出来' }); }

    r.status = st;
    r.remark = remark;
    r.statusAt = new Date().toISOString();
    r.statusBy = HR.empNo;

    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(r, null, 2));
    fs.renameSync(tmp, p);

    logEvent('info', 'record_meta', {
      formNo: metaM[1], status: st, ip: ip, requestId: res._rid
    });
    return json(res, 200, { ok: true, status: st, remark: remark, statusAt: r.statusAt });
  }

  /* 列表（不含照片正文，避免一次拉几十兆） */
  if (urlPath === '/api/records' && req.method === 'GET') {
    const list = listRecords().map(brief);
    return json(res, 200, { ok: true, total: list.length, list: list });
  }

  /* 单条（含照片，给导出用） */
  let m = /^\/api\/record\/([A-Za-z0-9_-]{4,64})$/.exec(urlPath);
  if (m && req.method === 'GET') {
    const p = path.join(RECS, m[1] + '.json');
    if (!fs.existsSync(p)) return json(res, 404, { ok: false, message: '没有这条记录' });
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    return json(res, 200, {
      ok: true,
      record: {
        id: r.id, formNo: r.formNo, submittedAt: r.submittedAt,
        values: r.values, tables: r.tables,
        idPhotos: { front: loadPic(r.photos.front), back: loadPic(r.photos.back) }
      }
    });
  }

  /* 删除 */
  if (m && req.method === 'DELETE') {
    const p = path.join(RECS, m[1] + '.json');
    if (!fs.existsSync(p)) return json(res, 404, { ok: false, message: '没有这条记录' });
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    [r.photos.front, r.photos.back].forEach(function (f) {
      if (f) { const q = path.join(PICS, path.basename(f)); if (fs.existsSync(q)) fs.unlinkSync(q); }
    });
    fs.unlinkSync(p);
    console.log('🗑  删除 ' + m[1]);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { ok: false, message: '没有这个接口' });
}

/* ---------------- 服务器 ---------------- */

const server = http.createServer(function (req, res) {
  const urlPath = (req.url || '/').split('?')[0];

  // 给每次请求一个号，响应头、响应体、日志里都用它，出问题能对上
  const rid = crypto.randomBytes(8).toString('hex');
  res._rid = rid;
  res.setHeader('X-Request-Id', rid);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // 拍身份证要用摄像头，只允许本站用；定位之类的一律不给
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  // 挂在 HTTPS 后面时告诉浏览器以后都走 HTTPS，省得被降级
  if (req.socket.encrypted || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }

  if (urlPath.indexOf('/api/') === 0) {
    const t0 = Date.now();
    res.on('finish', function () {
      // 访问日志只记接口，不记静态文件，否则一天几千行全是 css / png
      logEvent(res.statusCode >= 500 ? 'error' : 'info', 'api', {
        method: req.method,
        path: urlPath,
        status: res.statusCode,
        ms: Date.now() - t0,
        ip: clientIp(req),
        requestId: rid
      });
    });
    handleApi(req, res, urlPath).catch(function (err) {
      noteError('api', err, rid);
      logEvent('error', 'api_error', { path: urlPath, message: err.message, requestId: rid });
      json(res, 500, { ok: false, message: '服务器出错了：' + err.message });
    });
    return;
  }

  if (req.method !== 'GET') { res.writeHead(405); res.end('Method Not Allowed'); return; }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, HOST, async function () {
  pruneLogs();
  // 先把 OCR 引擎探一遍，横幅里要报它的状态（没装也不影响启动）
  let ocrEng = { available: false, label: '探测失败' };
  try { ocrEng = await ocr.detect(); } catch (e) { /* 探测失败按不可用处理 */ }
  logEvent('info', 'server_start', {
    port: PORT, pid: process.pid, node: process.version,
    publicUrl: PUBLIC_URL || null, trustProxy: TRUST_PROXY, requireCode: !!SUBMIT_CODE
  });

  // 启动 20 秒后先自检一次（不跟启动抢 IO），之后每小时问一次"够 24 小时没有"
  // 延迟可以用 AUTO_BACKUP_DELAY_MS 改，自动化测试拿它把等待缩短
  setTimeout(autoBackup, Math.max(0, Number(process.env.AUTO_BACKUP_DELAY_MS || 20000)));
  setInterval(autoBackup, 60 * 60 * 1000);

  const nets = os.networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach(function (k) {
    (nets[k] || []).forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    });
  });

  console.log('');
  console.log('  员工信息登记 · 服务已启动');
  console.log('  ─────────────────────────────────────');
  if (PUBLIC_URL) {
    console.log('  员工填写：  ' + PUBLIC_URL + '/');
    console.log('  HR 后台：   ' + PUBLIC_URL + '/#hr');
    console.log('  本机自检：  http://127.0.0.1:' + PORT + '/');
  } else {
    console.log('  本机访问：  http://127.0.0.1:' + PORT + '/');
    ips.forEach(function (ip) {
      console.log('  内网访问：  http://' + ip + ':' + PORT + '/   （只在同一 WiFi 下有用）');
    });
    console.log('');
    console.log('  ⚠️  员工在家里填的话，这个地址是打不开的。');
    console.log('     要让公网能访问，请按「部署与运维.md」第二节配域名 + HTTPS，');
    console.log('     然后把 PUBLIC_URL=https://你的域名 加到启动命令里。');
  }
  console.log('  ─────────────────────────────────────');
  console.log('  HR 工号：   ' + HR.empNo);
  console.log('  填写口令：  ' + (SUBMIT_CODE ? '已开启' : '未开启（谁拿到链接都能填）'));
  console.log('  反代模式：  ' + (TRUST_PROXY ? '开（信 X-Forwarded-For）' : '关（直接用 TCP 来源 IP）'));
  console.log('  数据目录：  ' + DATA);
  console.log('  身份证识别：' + (ocrEng.available
    ? (ocrEng.chinese ? 'Tesseract（服务端）' : 'Tesseract（缺中文包，建议补 tesseract-ocr-chi-sim）')
    : '未装 Tesseract，退回浏览器本机识别'));
  console.log('  自动备份：  每 ' + AUTO_BACKUP_HOURS + ' 小时一次 → ' + BACKUP + '（留 ' + BACKUP_KEEP + ' 份）');
  console.log('  运行日志：  ' + LOGS + '（一天一个文件，留 ' + LOG_KEEP_DAYS + ' 天）');
  console.log('  健康检查：  http://127.0.0.1:' + PORT + '/api/health');
  console.log('  ─────────────────────────────────────');
  console.log('  按 Ctrl+C 停止');
  console.log('');
});

/* 出了没接住的错，别直接死掉：记进日志和「系统状态」，服务继续跑 */
process.on('uncaughtException', function (err) {
  noteError('uncaught', err, '');
  logEvent('error', 'uncaught_exception', { message: err && err.message, stack: String(err && err.stack || '').slice(0, 800) });
});

process.on('unhandledRejection', function (err) {
  noteError('promise', err, '');
  logEvent('error', 'unhandled_rejection', { message: String((err && err.message) || err).slice(0, 300) });
});

process.on('SIGINT', function () {
  console.log('\n已停止。数据都在 ' + DATA);
  process.exit(0);
});
