#!/usr/bin/env node
/**
 * 备份 —— 把 服务器/data/ 整个目录打成一个 zip
 *
 * 这个系统里唯一不可再生的东西就是 data/（人填的资料 + 身份证照片），
 * 网页、程序、模板全都能重装，只有这些数据丢了就真没了。
 *
 * 两种用法：
 *   1）服务自己跑 —— server.js 每 24 小时自动调一次 run()，不需要人工点任何按钮
 *   2）救急手跑   —— node 服务器/backup.js（比如刚恢复完数据，想立刻存一份）
 *
 * 产物：备份/入职数据_2026-10-21_1047.zip，只留最近 30 份，旧的自动删。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 复用网页那套自己写的 zip（STORE 模式，任何解压工具都能开，中文名不乱码）
require(path.resolve(__dirname, '..', '网页', 'zip-lite.js'));
const ZipLite = globalThis.ZipLite;

const DATA = path.join(__dirname, 'data');
const OUT = path.resolve(__dirname, '..', '备份');

function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + '_' + pad(d.getHours()) + pad(d.getMinutes());
}

function walk(dir, prefix, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    const full = path.join(dir, d.name);
    const rel = prefix ? prefix + '/' + d.name : d.name;
    if (d.isDirectory()) walk(full, rel, out);
    else if (d.isFile() && !/\.tmp$/.test(d.name)) out.push({ full: full, rel: rel });
  });
  return out;
}

/**
 * 跑一次备份。
 * @param {{keep?: number, quiet?: boolean}} opts
 * @returns {{ok: boolean, reason?: string, file?: string, path?: string,
 *            files?: number, rawBytes?: number, zipBytes?: number,
 *            records?: number, photos?: number, pruned?: number}}
 */
function run(opts) {
  opts = opts || {};
  const keep = Math.max(1, Number(opts.keep) || 30);
  const say = opts.quiet ? function () { } : function (s) { console.log(s); };

  if (!fs.existsSync(DATA)) return { ok: false, reason: 'no-data-dir' };

  const files = walk(DATA, '', []);
  if (!files.length) return { ok: false, reason: 'empty' };

  fs.mkdirSync(OUT, { recursive: true });

  const z = ZipLite.create();
  let rawBytes = 0;
  files.forEach(function (f) {
    const buf = fs.readFileSync(f.full);
    rawBytes += buf.length;
    z.add('data/' + f.rel, buf);
  });

  const zip = z.bytes();
  // 同一分钟连备两次会撞名：撞了就加 _2、_3，绝不覆盖上一份
  const base = '入职数据_' + stamp(new Date());
  let name = base + '.zip';
  for (let i = 2; fs.existsSync(path.join(OUT, name)); i++) name = base + '_' + i + '.zip';
  const outPath = path.join(OUT, name);
  fs.writeFileSync(outPath, Buffer.from(zip));

  const records = files.filter(function (f) { return /^records\//.test(f.rel); }).length;
  const photos = files.filter(function (f) { return /^photos\//.test(f.rel); }).length;

  say('');
  say('  备份完成');
  say('  ─────────────────────────────────────');
  say('  文件：' + outPath);
  say('  包含：' + files.length + ' 个文件（原始 ' + (rawBytes / 1048576).toFixed(1) + ' MB → 打包后 '
    + (zip.length / 1048576).toFixed(1) + ' MB）');
  say('  其中：登记记录 ' + records + ' 份，身份证照片 ' + photos + ' 张');
  say('  ─────────────────────────────────────');

  // 只留最近 N 份，免得备份本身把磁盘吃满
  const olds = fs.readdirSync(OUT)
    .filter(function (f) { return /^入职数据_.*\.zip$/.test(f); })
    .map(function (f) { return { f: f, m: fs.statSync(path.join(OUT, f)).mtimeMs }; })
    .sort(function (a, b) { return b.m - a.m; });

  let pruned = 0;
  if (olds.length > keep) {
    olds.slice(keep).forEach(function (o) {
      try { fs.unlinkSync(path.join(OUT, o.f)); pruned++; } catch (e) { }
    });
    say('  已清理旧备份 ' + pruned + ' 份，只留最近 ' + keep + ' 份');
  }
  const totalSize = olds.slice(0, keep).reduce(function (a, o) {
    try { return a + fs.statSync(path.join(OUT, o.f)).size; } catch (e) { return a; }
  }, 0);
  say('  备份目录现在共 ' + Math.min(olds.length, keep) + ' 份，占用 ' + (totalSize / 1048576).toFixed(1) + ' MB');
  say('');
  say('  重要：备份不要只留在同一台机器上。拷一份到网盘 / 移动硬盘，');
  say('        机器坏了、被误删了，才算真的还有一份。');
  say('');

  return {
    ok: true, file: name, path: outPath, files: files.length,
    rawBytes: rawBytes, zipBytes: zip.length,
    records: records, photos: photos, pruned: pruned
  };
}

module.exports = { run: run };

if (require.main === module) {
  const keepIdx = process.argv.indexOf('--keep');
  if (keepIdx > -1 && !process.argv[keepIdx + 1]) {
    console.error('用法：node 服务器/backup.js [--keep 30]');
    process.exit(1);
  }
  const r = run({ keep: keepIdx > -1 ? Number(process.argv[keepIdx + 1]) : 30 });
  if (!r.ok) {
    if (r.reason === 'empty') console.log('数据目录是空的，没什么可备份的。');
    else console.error('找不到数据目录：' + DATA);
    process.exit(r.reason === 'empty' ? 0 : 1);
  }
}
