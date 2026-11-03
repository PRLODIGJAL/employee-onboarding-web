/**
 * 以摩卡「导入花名册模板」为底板生成 xlsx（云函数版）
 *
 * 为什么不能自己从头拼一份：
 *   模板里有 12 个隐藏工作表（下拉选项的数据源）、258 条数据验证、列宽、批注。
 *   这些散落在 zip 内多个 xml 里，手写永远拼不出一致的东西。
 *
 * 做法：
 *   1. 读模板 zip（assets/roster-template.xlsx）
 *   2. 只解压 xl/worksheets/sheet1.xml，把 <sheetData> 换成「原表头 5 行 + 新数据行」
 *   3. 其余条目连同压缩后的字节原样搬走，只重算中央目录里的偏移量
 *
 * 与网页版（web/xlsx-lite.js 的 fromTemplate）是同一套算法，
 * 区别只是这里有 zlib，可以直接 inflate/deflate，不用预先把骨架抠成字符串。
 */
const fs = require('fs');
const zlib = require('zlib');

const SHEET = 'xl/worksheets/sheet1.xml';
const COL_COUNT = 119;

/* 自己算 CRC32：zlib.crc32 是 Node 22.2+ 才有的，
   微信云函数可能跑在更低的版本上，不能依赖它 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

let templateCache = null;

function loadTemplate(templatePath) {
  if (!templateCache) templateCache = fs.readFileSync(templatePath);
  return templateCache;
}

/* ---------------- zip 读写 ---------------- */

function findEOCD(b) {
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('模板不是有效的 zip：找不到 EOCD');
}

function parseEntries(b) {
  const eocd = findEOCD(b);
  const total = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const list = [];

  for (let i = 0; i < total; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('模板中央目录损坏');
    const method = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const compSize = b.readUInt32LE(p + 20);
    const uncompSize = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28);
    const extraLen = b.readUInt16LE(p + 30);
    const cmtLen = b.readUInt16LE(p + 32);
    const localOff = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    const cdRec = b.subarray(p, p + 46 + nameLen + extraLen + cmtLen);

    list.push({ name, method, crc, compSize, uncompSize, localOff, cdRec, cdPos: p });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return list;
}

function readLocalData(b, entry) {
  const nameLen = b.readUInt16LE(entry.localOff + 26);
  const extraLen = b.readUInt16LE(entry.localOff + 28);
  const start = entry.localOff + 30 + nameLen + extraLen;
  return b.subarray(start, start + entry.compSize);
}

/** 只把 target 这个条目换掉，其余字节原样搬运 */
function spliceEntry(b, target, newData) {
  const entries = parseEntries(b);
  const localParts = [];
  const offsets = [];
  let pos = 0;

  for (const e of entries) {
    const nameLen = b.readUInt16LE(e.localOff + 26);

    if (e.name === target) {
      // 新条目：重写本地头，STORE 存储
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x0800, 6);
      lh.writeUInt16LE(0, 8);                       // method = 0
      b.copy(lh, 10, e.localOff + 10, e.localOff + 14);  // 时间/日期照抄
      const crc = crc32(newData);
      lh.writeUInt32LE(crc >>> 0, 14);
      lh.writeUInt32LE(newData.length, 18);
      lh.writeUInt32LE(newData.length, 22);
      lh.writeUInt16LE(nameLen, 26);
      lh.writeUInt16LE(0, 28);
      const nameBuf = b.subarray(e.localOff + 30, e.localOff + 30 + nameLen);

      localParts.push(lh, nameBuf, newData);
      offsets.push({ entry: e, off: pos, crc, comp: newData.length, uncomp: newData.length, method: 0 });
      pos += lh.length + nameBuf.length + newData.length;
    } else {
      const raw = readLocalData(b, e);
      const seg = b.subarray(e.localOff, e.localOff + 30 + nameLen
        + b.readUInt16LE(e.localOff + 28) + e.compSize);
      localParts.push(seg);
      offsets.push({ entry: e, off: pos });
      pos += seg.length;
    }
  }

  const cdStart = pos;
  const cdParts = [];
  let cdLen = 0;

  for (const o of offsets) {
    const rec = Buffer.from(o.entry.cdRec);         // 拷贝，别改到源
    if (o.method !== undefined) {
      rec.writeUInt16LE(o.method, 10);
      rec.writeUInt32LE(o.crc >>> 0, 16);
      rec.writeUInt32LE(o.comp, 20);
      rec.writeUInt32LE(o.uncomp, 24);
    }
    rec.writeUInt32LE(o.off, 42);
    cdParts.push(rec);
    cdLen += rec.length;
  }

  const eocdNew = Buffer.alloc(22);
  eocdNew.writeUInt32LE(0x06054b50, 0);
  eocdNew.writeUInt16LE(entries.length, 8);
  eocdNew.writeUInt16LE(entries.length, 10);
  eocdNew.writeUInt32LE(cdLen, 12);
  eocdNew.writeUInt32LE(cdStart, 16);

  return Buffer.concat(localParts.concat(cdParts, [eocdNew]));
}

/* ---------------- xml ---------------- */

function colName(i) {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function rowXml(r, values) {
  let cells = '';
  for (let c = 0; c < values.length; c++) {
    const v = values[c];
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (!s) continue;
    cells += '<c r="' + colName(c) + r + '" t="inlineStr"><is><t xml:space="preserve">'
      + esc(s) + '</t></is></c>';
  }
  return '<row r="' + r + '" spans="1:' + COL_COUNT + '">' + cells + '</row>';
}

/**
 * @param {string} templatePath assets/roster-template.xlsx 的绝对路径
 * @param {string[][]} rows 每行长度 119 的字符串数组
 * @returns {Buffer} xlsx 内容
 */
function buildRosterXlsx(templatePath, rows) {
  const tpl = loadTemplate(templatePath);
  const entry = parseEntries(tpl).find(e => e.name === SHEET);
  if (!entry) throw new Error('模板里没有 ' + SHEET);

  const raw = readLocalData(tpl, entry);
  const xml = (entry.method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');

  const open = xml.indexOf('<sheetData>');
  const close = xml.indexOf('</sheetData>');
  if (open < 0 || close < 0) throw new Error('模板 sheet1.xml 结构变了');

  const inner = xml.slice(open + '<sheetData>'.length, close);
  const row6 = inner.search(/<row r="6"/);
  if (row6 < 0) throw new Error('模板 sheet1.xml 里没找到第 6 行起点');

  let head = xml.slice(0, open + '<sheetData>'.length) + inner.slice(0, row6);
  const tail = xml.slice(close);

  // dimension 跟着数据行数走
  head = head.replace(/<dimension ref="[^"]*"\/>/,
    '<dimension ref="' + colName(COL_COUNT - 1) + (5 + rows.length) + '"/>');

  let body = '';
  for (let i = 0; i < rows.length; i++) body += rowXml(6 + i, rows[i] || []);

  return spliceEntry(tpl, SHEET, Buffer.from(head + body + tail, 'utf8'));
}

module.exports = { buildRosterXlsx, COL_COUNT };
