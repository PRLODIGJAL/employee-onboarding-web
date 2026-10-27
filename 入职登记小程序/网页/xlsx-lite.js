/**
 * xlsx-lite —— 零依赖的真 .xlsx 生成器（浏览器端）
 *
 * 为什么不用 SheetJS：网页原型要能双击直接打开，不想引 CDN、也不想联网。
 * xlsx 本质是 zip 包，zip 允许"只存储不压缩"（method=0），
 * 所以纯 JS 拼字节就能生成 Excel 能正常打开的 .xlsx，不需要压缩库。
 *
 * 用法：
 *   const blob = XLSXLite.build([
 *     { name: 'Sheet1', cols: [26, 60], merges: ['A1:B1'], rows: [[{v:'标题', s:2}]] }
 *   ]);
 *   下载：XLSXLite.download(blob, '文件名.xlsx')
 *
 * 样式索引（s）：
 *   0 普通   1 表头(粗体+浅底+居中)   2 大标题   3 正文(细边框+自动换行)
 *   4 标签(粗体+边框)   5 灰色小字
 */
window.XLSXLite = (function () {
  'use strict';

  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(i) {
    var s = '';
    i = i + 1;
    while (i > 0) {
      var r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* ---------------- zip（STORE 模式） ---------------- */

  function zip(files) {
    var chunks = [];
    var central = [];
    var offset = 0;
    var d = new Date();
    var dosTime = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var dosDate = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);

    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

    files.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var crc = crc32(data);

      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);

      central.push({
        name: nameBytes, crc: crc, size: data.length, offset: offset
      });
      offset += local.length + nameBytes.length + data.length;
    });

    var cdStart = offset;
    var cdChunks = [];
    central.forEach(function (c) {
      var head = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(c.offset)
      );
      cdChunks.push(new Uint8Array(head), c.name);
      offset += head.length + c.name.length;
    });

    var eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(central.length), u16(central.length),
      u32(offset - cdStart), u32(cdStart), u16(0)
    ));

    var all = chunks.concat(cdChunks, [eocd]);
    var total = 0;
    all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total);
    var pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ---------------- OOXML ---------------- */

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="4">'
    + '<font><sz val="11"/><name val="等线"/><family val="2"/></font>'
    + '<font><b/><sz val="11"/><name val="等线"/><family val="2"/></font>'
    + '<font><b/><sz val="16"/><name val="等线"/><family val="2"/></font>'
    + '<font><sz val="10"/><color rgb="FF6B7688"/><name val="等线"/><family val="2"/></font>'
    + '</fonts>'
    + '<fills count="3">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF3F9"/><bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FFD3DAE6"/></left><right style="thin"><color rgb="FFD3DAE6"/></right>'
    + '<top style="thin"><color rgb="FFD3DAE6"/></top><bottom style="thin"><color rgb="FFD3DAE6"/></bottom><diagonal/></border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="6">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';

  function cellXml(ref, cell) {
    if (!cell) return '';
    var s = cell.s || 0;
    var v = cell.v;
    if (v === null || v === undefined || v === '') return '<c r="' + ref + '" s="' + s + '"/>';
    if (typeof v === 'number' && !cell.asText) return '<c r="' + ref + '" s="' + s + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var rows = [];
    (sheet.rows || []).forEach(function (row, ri) {
      var cells = [];
      (row || []).forEach(function (cell, ci) {
        if (cell === undefined) return;
        cells.push(cellXml(colName(ci) + (ri + 1), cell));
      });
      var h = row && row.__h;
      rows.push('<row r="' + (ri + 1) + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>' + cells.join('') + '</row>');
    });

    var cols = '';
    if (sheet.cols && sheet.cols.length) {
      cols = '<cols>' + sheet.cols.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }

    var merges = '';
    if (sheet.merges && sheet.merges.length) {
      merges = '<mergeCells count="' + sheet.merges.length + '">'
        + sheet.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('')
        + '</mergeCells>';
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="18"/>'
      + cols
      + '<sheetData>' + rows.join('') + '</sheetData>'
      + merges
      + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
      + '</worksheet>';
  }

  function safeName(name, idx) {
    var n = String(name || '').replace(/[\[\]\*\?\/\\:]/g, '').trim().slice(0, 31);
    return n || ('Sheet' + (idx + 1));
  }

  function build(sheets) {
    var files = [];
    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';

    var sheetTags = '';
    var relTags = '';

    sheets.forEach(function (s, i) {
      contentTypes += '<Override PartName="/xl/worksheets/sheet' + (i + 1)
        + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      sheetTags += '<sheet name="' + esc(safeName(s.name, i)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      relTags += '<Relationship Id="rId' + (i + 1)
        + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'
        + (i + 1) + '.xml"/>';
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) });
    });

    contentTypes += '</Types>';

    files.push({
      name: '[Content_Types].xml',
      data: contentTypes
    });
    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>'
    });
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets>' + sheetTags + '</sheets></workbook>'
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + relTags
        + '<Relationship Id="rId' + (sheets.length + 1)
        + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>'
    });
    files.push({ name: 'xl/styles.xml', data: STYLES });

    return new Blob([zip(files)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ---------------- 以真实模板为底板（字节级拼接） ----------------

     为什么不用 build()：摩卡的「导入花名册模板」不只是几行文字，
     它带着 12 个隐藏工作表（下拉选项源）、258 条数据验证、列宽、字体、批注。
     这些都在 zip 里的各个 xml 中，自己从头拼一份是不可能一致的。

     所以做法是：把模板 zip 的字节整份带进来，只把
     xl/worksheets/sheet1.xml 这一个条目换成「新表头 + 数据行」，
     其余条目（连压缩后的字节）原样搬运，偏移量重算。

     浏览器没有 zlib，解不了 deflate，所以表头 5 行和数据行之后的
     258 条验证规则在构建阶段（build-template.js）就抠成字符串内联好了。

     注意：新写的 sheet1.xml 用 STORE(0) 存，不压缩，方便计算 CRC 和长度；
     zip 允许不同条目用不同压缩方式，Excel 正常打开。
  */

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function rdU16(b, p) { return b[p] | (b[p + 1] << 8); }
  function rdU32(b, p) {
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
  }
  function wrU16(b, p, n) { b[p] = n & 0xFF; b[p + 1] = (n >>> 8) & 0xFF; }
  function wrU32(b, p, n) {
    b[p] = n & 0xFF; b[p + 1] = (n >>> 8) & 0xFF;
    b[p + 2] = (n >>> 16) & 0xFF; b[p + 3] = (n >>> 24) & 0xFF;
  }

  function findEOCD(b) {
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (rdU32(b, i) === 0x06054b50) return i;
    }
    throw new Error('模板不是有效的 zip：找不到 EOCD');
  }

  /** 把一个条目的内容换掉，其余字节原样保留 */
  function zipSplice(src, target, newData) {
    var eocd = findEOCD(src);
    var total = rdU16(src, eocd + 10);
    var cdOff = rdU32(src, eocd + 16);

    var localParts = [];       // 本地文件记录（数据区之前的头部 + 数据）
    var records = [];          // 与中央目录一一对应，记录新的偏移
    var pos = 0;
    var p = cdOff;

    for (var i = 0; i < total; i++) {
      if (rdU32(src, p) !== 0x02014b50) throw new Error('模板中央目录损坏');
      var method = rdU16(src, p + 10);
      var crc = rdU32(src, p + 16);
      var compSize = rdU32(src, p + 20);
      var uncompSize = rdU32(src, p + 24);
      var nameLen = rdU16(src, p + 28);
      var extraLen = rdU16(src, p + 30);
      var cmtLen = rdU16(src, p + 32);
      var localOff = rdU32(src, p + 42);
      var name = '';
      for (var k = 0; k < nameLen; k++) name += String.fromCharCode(src[p + 46 + k]);

      var cdRecLen = 46 + nameLen + extraLen + cmtLen;
      var cdRec = src.subarray(p, p + cdRecLen);   // 中央目录记录原样复制，稍后只改偏移/大小

      if (name === target) {
        // 新条目：30 字节本地头 + 文件名 + 数据（STORE）
        var lh = new Uint8Array(30 + nameLen);
        wrU32(lh, 0, 0x04034b50);
        wrU16(lh, 4, 20);            // version needed
        wrU16(lh, 6, 0x0800);        // flags: UTF-8 文件名
        wrU16(lh, 8, 0);             // method: store
        wrU16(lh, 10, rdU16(src, localOff + 10));   // 时间
        wrU16(lh, 12, rdU16(src, localOff + 12));   // 日期
        var newCrc = crc32(newData);
        wrU32(lh, 14, newCrc);
        wrU32(lh, 18, newData.length);
        wrU32(lh, 22, newData.length);
        wrU16(lh, 26, nameLen);
        wrU16(lh, 28, 0);
        for (var m = 0; m < nameLen; m++) lh[30 + m] = src[p + 46 + m];

        localParts.push(lh, newData);
        records.push({ cd: cdRec, off: pos, method: 0, crc: newCrc, comp: newData.length, uncomp: newData.length });
        pos += lh.length + newData.length;
      } else {
        // 原条目：本地头 + 压缩数据整段搬走，大小/CRC 都不变
        var lNameLen = rdU16(src, localOff + 26);
        var lExtraLen = rdU16(src, localOff + 28);
        var dataOff = localOff + 30 + lNameLen + lExtraLen;
        var seg = src.subarray(localOff, dataOff + compSize);

        localParts.push(seg);
        records.push({ cd: cdRec, off: pos, method: method, crc: crc, comp: compSize, uncomp: uncompSize });
        pos += seg.length;
      }

      p += cdRecLen;
    }

    var cdStart = pos;
    var cdParts = [];
    var cdLen = 0;
    records.forEach(function (r) {
      var buf = new Uint8Array(r.cd);          // 拷贝，别改到源数组
      wrU16(buf, 10, r.method);
      wrU32(buf, 16, r.crc);
      wrU32(buf, 20, r.comp);
      wrU32(buf, 24, r.uncomp);
      wrU32(buf, 42, r.off);
      cdParts.push(buf);
      cdLen += buf.length;
    });

    var eocdNew = new Uint8Array(22);
    wrU32(eocdNew, 0, 0x06054b50);
    wrU16(eocdNew, 8, total);
    wrU16(eocdNew, 10, total);
    wrU32(eocdNew, 12, cdLen);
    wrU32(eocdNew, 16, cdStart);
    wrU16(eocdNew, 20, 0);

    var all = localParts.concat(cdParts, [eocdNew]);
    var total2 = 0;
    all.forEach(function (x) { total2 += x.length; });
    var out = new Uint8Array(total2);
    var q = 0;
    all.forEach(function (x) { out.set(x, q); q += x.length; });
    return out;
  }

  function templateRowXml(r, values, span) {
    var cells = '';
    for (var c = 0; c < values.length; c++) {
      var v = values[c];
      if (v === null || v === undefined) continue;
      var s = String(v);
      if (!s) continue;                       // 空值不写单元格，保持稀疏
      cells += '<c r="' + colName(c) + r + '" t="inlineStr"><is><t xml:space="preserve">'
        + esc(s) + '</t></is></c>';
    }
    return '<row r="' + r + '" spans="1:' + span + '">' + cells + '</row>';
  }

  /**
   * 以模板为底板生成 xlsx
   * @param {string[][]} rows 每个元素是长度 119 的字符串数组，从第 6 行开始写
   * @param {string} b64 模板 base64（默认用全局的 ROSTER_TEMPLATE_B64）
   */
  function fromTemplate(rows, b64) {
    var B64 = b64 || window.ROSTER_TEMPLATE_B64;
    var head = window.ROSTER_SHEET_HEAD;
    var tail = window.ROSTER_SHEET_TAIL;
    if (!B64 || !head || !tail) throw new Error('缺少模板底座：请先加载 roster-template-b64.js');

    var span = (window.ROSTER_COLUMN_COUNT || 119);
    var lastRow = 5 + rows.length;

    // dimension 要跟着数据行数走，否则 Excel 认为整张表只有一列
    head = head.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="'
      + colName(span - 1) + lastRow + '"/>');

    var body = '';
    for (var i = 0; i < rows.length; i++) {
      body += templateRowXml(6 + i, rows[i] || [], span);
    }

    var xml = head + body + tail;
    var bytes = zipSplice(b64ToBytes(B64), 'xl/worksheets/sheet1.xml', enc.encode(xml));
    return new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  /* ---------------- 下载 ---------------- */

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }

  return { build: build, fromTemplate: fromTemplate, download: download, colName: colName };
})();
