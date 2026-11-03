/**
 * 生成 roster-template-b64.js
 *
 *   node build-template.js
 *
 * 做两件事：
 *   1. 把 assets/roster-template.xlsx 整个读成 base64（导出时当 zip 底板，12 个隐藏表原样带走）
 *   2. 把 sheet1.xml 拆成「表头骨架」和「表尾骨架」，中间留空给数据行
 *      —— 浏览器里没有 zlib，不能现场解压，所以第 1~5 行和第 6 行之后的
 *         258 条数据验证必须在构建阶段就抠出来，作为字符串内联。
 *
 * sheet1.xml 的行结构：
 *   1 注意事项 / 2 字段代号 / 3 列配置 / 4 动作标识 roster/update / 5 中文名 / 6 起数据
 * 所以骨架 = 第 1~5 行（HEAD） + 数据行（运行时填） + 数据验证等（TAIL）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WEB = path.resolve(__dirname, '..', '网页');
const XLSX = path.join(WEB, 'assets', 'roster-template.xlsx');
const OUT = path.join(WEB, 'roster-template-b64.js');

/* ---------- 极简 zip 读取：只需要拿到某个条目的解压后内容 ---------- */

function readZip(buf) {
  // 从尾部找 EOCD（0x06054b50），注释最长 65535，所以最多回退 65557 字节
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip：没找到 EOCD');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目录损坏 @' + p);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // 本地头的 name/extra 长度才是真实偏移
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataOff = localOff + 30 + lNameLen + lExtraLen;

    entries.push({ name, method, crc, compSize, uncompSize, dataOff, raw: buf.subarray(dataOff, dataOff + compSize) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(entry) {
  if (entry.method === 0) return entry.raw;
  if (entry.method === 8) return zlib.inflateRawSync(entry.raw);
  throw new Error('不支持的压缩方式 ' + entry.method);
}

/* ---------- 主流程 ---------- */

const buf = fs.readFileSync(XLSX);
const entries = readZip(buf);
const sheet1 = entries.find(e => e.name === 'xl/worksheets/sheet1.xml');
if (!sheet1) throw new Error('模板里没有 sheet1.xml');

const xml = readEntry(sheet1).toString('utf8');

const open = xml.indexOf('<sheetData>');
const close = xml.indexOf('</sheetData>');
if (open < 0 || close < 0) throw new Error('sheet1.xml 没有 sheetData');

const inner = xml.slice(open + '<sheetData>'.length, close);

// sheetData 里第 1~5 行属于表头，第 6 行是模板留的占位单元格（<c r="DO6"/>），丢掉
const row6 = inner.search(/<row r="6"/);
if (row6 < 0) throw new Error('sheetData 里没找到第 6 行起点');
if (inner.slice(row6).indexOf('<row r="7"') > -1) throw new Error('模板第 7 行不应有内容');

const HEAD = xml.slice(0, open + '<sheetData>'.length) + inner.slice(0, row6);
const TAIL = xml.slice(close);

// 自检：HEAD 里应当正好是第 1~5 行，没有第 6 行的占位 <c r="DO6"/>
const headRows = (HEAD.match(/<row /g) || []).length;
if (headRows !== 5) throw new Error('HEAD 里应有 5 行表头，实际 ' + headRows);
if (HEAD.indexOf('r="6"') > -1) throw new Error('HEAD 里混进了第 6 行');

const dvCount = (TAIL.match(/<dataValidation /g) || []).length;
if (dvCount !== 258) throw new Error('TAIL 里数据验证数量应为 258，实际 ' + dvCount);

const b64 = buf.toString('base64');

const lines = [
  '/* 自动生成，请勿手改 —— 生成脚本：node build-template.js */',
  '/* 底板：' + path.basename(XLSX) + '（' + (buf.length / 1024).toFixed(1) + ' KB，'
    + entries.length + ' 个 zip 条目，' + dvCount + ' 条下拉验证） */',
  '/* 用途：导出 xlsx 时以它为底板，只替换 sheetData，其余字节原样搬运。 */',
  '',
  'window.ROSTER_TEMPLATE_B64 = ' + JSON.stringify(b64) + ';',
  '',
  '/* sheet1.xml 的第 1~5 行骨架（注意事项/字段代号/列配置/动作标识/中文名 + <sheetData>） */',
  'window.ROSTER_SHEET_HEAD = ' + JSON.stringify(HEAD) + ';',
  '',
  '/* sheet1.xml 的数据行之后（</sheetData> + 258 条数据验证 + 页边距等） */',
  'window.ROSTER_SHEET_TAIL = ' + JSON.stringify(TAIL) + ';',
  ''
];

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

console.log('模板条目 ' + entries.length + ' 个');
console.log('HEAD ' + HEAD.length + ' 字符，TAIL ' + TAIL.length + ' 字符，验证 ' + dvCount + ' 条');
console.log('已写出 ' + OUT + '（' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB）');
