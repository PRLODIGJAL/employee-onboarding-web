/**
 * pdf-lite.js —— 把同一份登记表模型画成 PDF
 *
 * 为什么不手写文字型 PDF：中文要嵌字体（还得分片、算 cmap），一套下来比这个文件本身大十倍，
 * 而且很容易在某些阅读器里变方块。这里走的是 jsPDF / html2canvas 同款思路：
 * 用 Canvas 把版面画出来（浏览器自带中文字体），再把整页压成 JPEG 塞进 PDF 的图片对象。
 * 好处是任何阅读器、任何系统、打印店都打得开；代价是文字不能选中（对归档件无所谓）。
 *
 * 版面参数按 150 dpi 的 A4 算：1240 × 1754 像素，导出后仍是标准 A4 尺寸。
 *
 * 用法：
 *   var bytes = PdfLite.build(model);   // model 与 DocxLite 完全一致
 */
(function (root) {
  'use strict';

  var W = 1240;            // 150dpi A4 宽
  var H = 1754;            // 150dpi A4 高
  var M = 88;              // 页边距（≈1.5cm）
  var CONTENT_W = W - M * 2;
  var CONTENT_H = H - M * 2 - 46;   // 底部留出页码区
  var LABEL_W = 250;        // 左列宽
  var VALUE_W = CONTENT_W - LABEL_W;
  var PAD = 10;

  var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Heiti SC",sans-serif';

  var canvasFactory = function (w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  function setCanvasFactory(fn) { canvasFactory = fn; }

  function dataUrlToBytes(url) {
    var b64 = String(url).split(',')[1] || '';
    var bin = root.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
    return out;
  }

  /** 按字符折行（中文没有空格，只能逐字量宽度） */
  function wrap(ctx, text, maxW) {
    var s = String(text == null ? '' : text);
    if (!s) return [''];
    var lines = [];
    var line = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      var test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
    return lines;
  }

  function build(model) {
    var pages = [];
    var page, ctx, y;

    function newPage() {
      var cv = canvasFactory(W, H);
      var c2 = cv.getContext('2d');
      if (!c2) throw new Error('PdfLite: 当前环境没有 Canvas 2D');
      c2.fillStyle = '#FFFFFF';
      c2.fillRect(0, 0, W, H);
      c2.textBaseline = 'top';
      page = { canvas: cv, ctx: c2 };
      pages.push(page);
      ctx = c2;
      y = M;
      return page;
    }

    // 续页页眉：只有第 2 页起才画，避免和首页大标题重复
    function continuationHeader() {
      ctx.textAlign = 'left';
      ctx.font = '19px ' + FONT;
      ctx.fillStyle = '#8A94A6';
      ctx.fillText((model.title || '员工信息登记表') + '（续）', M, y);
      ctx.textAlign = 'right';
      ctx.fillText((model.meta && model.meta[0]) || '', M + CONTENT_W, y);
      ctx.textAlign = 'left';
      y += 26;
      ctx.strokeStyle = '#E4E9F2';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M, y);
      ctx.lineTo(M + CONTENT_W, y);
      ctx.stroke();
      y += 18;
    }

    function need(h) {
      if (y + h > M + CONTENT_H) {
        newPage();
        continuationHeader();
      }
    }

    newPage();

    /* 标题 */
    ctx.fillStyle = '#16202E';
    ctx.font = 'bold 40px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(model.title || '员工信息登记表', W / 2, y);
    y += 58;

    (model.meta || []).forEach(function (line) {
      ctx.font = '20px ' + FONT;
      ctx.fillStyle = '#6A7382';
      ctx.fillText(line, W / 2, y);
      y += 28;
    });
    y += 14;

    if (model.header) {
      ctx.textAlign = 'left';
      ctx.font = '21px ' + FONT;
      ctx.fillStyle = '#404A5C';
      ctx.fillText(model.header, M, y);
      y += 34;
      ctx.strokeStyle = '#D9E0EC';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M, y);
      ctx.lineTo(M + CONTENT_W, y);
      ctx.stroke();
      y += 22;
    }
    ctx.textAlign = 'left';

    /* 区块标题条（跨页时会重画一次，纸面上看得出这是同一节的延续） */
    function blockBar(title) {
      need(34);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#EDF2FB';
      ctx.fillRect(M, y, CONTENT_W, 34);
      ctx.fillStyle = '#2B4B86';
      ctx.font = 'bold 21px ' + FONT;
      ctx.fillText(title, M + PAD, y + 7);
      y += 34;
    }

    /* 区块 */
    (model.blocks || []).forEach(function (blk) {
      blockBar(blk.title);

      (blk.rows || []).forEach(function (r) {
        ctx.font = '21px ' + FONT;
        var vLines = wrap(ctx, r.value, VALUE_W - PAD * 2 - 8);
        var lLines = wrap(ctx, r.label, LABEL_W - PAD * 2);
        var rowH = Math.max(vLines.length, lLines.length) * 30 + 16;

        var before = pages.length;
        need(rowH);
        if (pages.length !== before) {
          blockBar(blk.title);     // 换页了，把区块标题补上
          need(rowH);
        }

        // 左列底色
        ctx.fillStyle = '#F7F9FC';
        ctx.fillRect(M, y, LABEL_W, rowH);
        // 边框
        ctx.strokeStyle = '#D9E0EC';
        ctx.lineWidth = 1;
        ctx.strokeRect(M + 0.5, y + 0.5, CONTENT_W - 1, rowH - 1);
        ctx.beginPath();
        ctx.moveTo(M + LABEL_W + 0.5, y);
        ctx.lineTo(M + LABEL_W + 0.5, y + rowH);
        ctx.stroke();

        ctx.fillStyle = '#6A7382';
        ctx.font = '20px ' + FONT;
        lLines.forEach(function (ln, i) {
          ctx.fillText(ln, M + PAD, y + 9 + i * 30);
        });

        ctx.fillStyle = '#16202E';
        ctx.font = '21px ' + FONT;
        vLines.forEach(function (ln, i) {
          ctx.fillText(ln, M + LABEL_W + PAD, y + 8 + i * 30);
        });

        y += rowH;
      });
      y += 20;
    });

    /* 结尾 */
    if (model.footer) {
      ctx.font = '19px ' + FONT;
      ctx.fillStyle = '#7A8391';
      wrap(ctx, model.footer, CONTENT_W).forEach(function (ln) {
        need(28);
        ctx.fillText(ln, M, y);
        y += 26;
      });
      y += 10;
    }
    need(50);
    ctx.font = '20px ' + FONT;
    ctx.fillStyle = '#404A5C';
    ctx.fillText('员工签字：__________________', M, y);
    ctx.fillText('HR 核对：__________________', M + CONTENT_W / 2, y);

    /* 页码（等全部页数确定后再画） */
    pages.forEach(function (p, i) {
      var c2 = p.ctx;
      c2.textAlign = 'center';
      c2.font = '18px ' + FONT;
      c2.fillStyle = '#98A1AF';
      c2.fillText('第 ' + (i + 1) + ' 页 / 共 ' + pages.length + ' 页', W / 2, H - M + 6);
    });

    return assemble(pages.map(function (p) {
      return {
        width: W,
        height: H,
        jpeg: dataUrlToBytes(p.canvas.toDataURL('image/jpeg', 0.88))
      };
    }));
  }

  /* ---------------- 公司模板网格：按 form-grid.js 画，和 Word 打出来一样 ---------------- */

  // 母版用 twips（1/20 磅），Canvas 用 150dpi 像素：1 twip = 1/9.6 px
  var T2P = 1 / 9.6;
  // 页边距（取自母版 sectPr 的 pgMar）
  var GM = { top: 1077, right: 1134, bottom: 510, left: 1134 };
  var GFONT = '"Songti SC","SimSun","Times New Roman",serif';

  function gridX(tw) { return (GM.left + tw) * T2P; }
  function gridY(tw) { return GM.top * T2P + tw * T2P; }

  /**
   * @param {object} grid  form-grid.js 的 FORM_GRID
   * @param {object} map   占位符 → 文本（TemplateDocx.buildMap 的结果）
   * @returns {Uint8Array}
   */
  function buildFromGrid(grid, map) {
    if (!grid || !grid.cols) throw new Error('PdfLite: 找不到登记表网格（form-grid.js 没加载）');
    map = map || {};
    var pages = [];
    var page, ctx, y;

    // 母版的表格宽度（10923 twips）比版心（9638）宽一点，Word 会自动压到版心内，
    // 这里同样等比缩放列宽，保证右边框不被纸边裁掉。行高不缩放，只保证内容放得下。
    var tableTw = 0;
    grid.cols.forEach(function (c) { tableTw += c; });
    var contentTw = 11906 - GM.left - GM.right;
    var scale = contentTw / tableTw;

    function newPage() {
      var cv = canvasFactory(W, H);
      var c2 = cv.getContext('2d');
      if (!c2) throw new Error('PdfLite: 当前环境没有 Canvas 2D');
      c2.fillStyle = '#FFFFFF';
      c2.fillRect(0, 0, W, H);
      c2.textBaseline = 'top';
      page = { canvas: cv, ctx: c2 };
      pages.push(page);
      ctx = c2;
      y = GM.top * T2P;
    }

    function need(h) {
      if (y + h > H - GM.bottom * T2P - 20) newPage();
    }

    /** 按字符折行（中文没有空格，只能逐字量） */
    function wrap(text, maxW) {
      var s = String(text == null ? '' : text);
      if (!s) return [''];
      var lines = [], line = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s[i];
        if (ch === '\n') { lines.push(line); line = ''; continue; }
        var test = line + ch;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      lines.push(line);
      return lines;
    }

    function fill(t) {
      return String(t || '').replace(/\{\{([^}]+)\}\}/g, function (all, k) {
        var v = map[k];
        return v === undefined || v === null ? '' : v;
      });
    }

    newPage();

    /* ---- 标题两行：信息登记表 / 应聘职位 部门 工号 ---- */
    var extra = grid.extra || [];
    var lead = extra.slice(0, 2);
    var tail = extra.slice(2);

    lead.forEach(function (p) {
      var t = fill(p.t);
      if (!t.trim()) { y += 6; return; }
      ctx.font = (p.bold ? 'bold ' : '') + (p.sz * 150 / 144).toFixed(1) + 'px ' + GFONT;
      ctx.fillStyle = '#000';
      ctx.textAlign = p.align === 'center' ? 'center' : (p.align === 'right' ? 'right' : 'left');
      var maxW = W - (GM.left + GM.right) * T2P;
      var ox = p.align === 'center' ? W / 2 : (p.align === 'right' ? W - GM.right * T2P : GM.left * T2P);
      var lines = wrap(t, maxW);
      lines.forEach(function (ln) {
        ctx.fillText(ln, ox, y);
        y += (p.sz * 150 / 144) * 1.45;
      });
      y += 6;
    });
    ctx.textAlign = 'left';

    /* ---- 主表 ---- */
    var cols = grid.cols;
    var colX = [0];
    for (var ci = 0; ci < cols.length; ci++) colX.push(colX[ci] + cols[ci] * scale);

    // 纵向合并：把 vmerge=cont 的行高算到 restart 的头上
    var rows = grid.rows;
    var merged = rows.map(function (r) { return r.cells.map(function () { return 1; }); });

    var gridPos;   // 每行各 cell 的起始列
    rows.forEach(function (r, ri) {
      var c = 0;
      gridPos = [];
      // 先找出本行每个 cell 的起始列
      var pos = [];
      var ci2 = 0;
      r.cells.forEach(function (cell) {
        pos.push(ci2);
        ci2 += cell.span;
      });
      merged[ri] = pos;
    });

    function cellAt(ri, col) {
      var r = rows[ri];
      var acc = 0;
      for (var i = 0; i < r.cells.length; i++) {
        var span = r.cells[i].span;
        if (acc === col) return r.cells[i];
        if (acc > col) return null;
        acc += span;
      }
      return null;
    }

    rows.forEach(function (r, ri) {
      // 本行最低高度（twips）
      var h = r.h || 90;

      // 各单元格内容折行后的真实高度，行高取 max
      var items = [];
      var acc = 0;
      r.cells.forEach(function (cell) {
        var wTw = 0;
        for (var k = 0; k < cell.span; k++) wTw += cols[acc + k];
        acc += cell.span;
        items.push({ cell: cell, wTw: wTw });
      });

      // 计算需要的高度
      var needH = h;
      items.forEach(function (it) {
        if (it.cell.vm === 'cont') return;
        it.cell.lines.forEach(function (ln) {
          var t = fill(ln.t);
          if (!t.trim()) return;
          ctx.font = (ln.bold ? 'bold ' : '') + (ln.sz * 150 / 144).toFixed(1) + 'px ' + GFONT;
          var pad = 10;
          var ls = wrap(t, it.wTw * scale * T2P - pad * 2);
          var lh = (ln.sz * 150 / 144) * 1.35;
          needH = Math.max(needH, ls.length * lh * 9.6 / 1 + 16);
        });
      });

      var rowH = needH * T2P;
      need(rowH + 2);

      // 画格子
      var x0 = GM.left * T2P;
      acc = 0;
      items.forEach(function (it) {
        var cell = it.cell;
        var x = x0 + colX[acc] * T2P;
        var w = it.wTw * scale * T2P;

        if (cell.vm !== 'cont') {
          // 边框
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, rowH - 1);

          // 文字
          var ly = y + 6;
          cell.lines.forEach(function (ln) {
            var t = fill(ln.t);
            if (!t.trim()) return;
            ctx.font = (ln.bold ? 'bold ' : '') + (ln.sz * 150 / 144).toFixed(1) + 'px ' + GFONT;
            ctx.fillStyle = '#000';
            ctx.textAlign = ln.align === 'center' ? 'center' : (ln.align === 'right' ? 'right' : 'left');
            var pad = 10;
            var ox = ln.align === 'center' ? x + w / 2
              : (ln.align === 'right' ? x + w - pad : x + pad);
            wrap(t, w - pad * 2).forEach(function (ln2) {
              ctx.fillText(ln2, ox, ly);
              ly += (ln.sz * 150 / 144) * 1.35;
            });
          });
          ctx.textAlign = 'left';
        }
        acc += cell.span;
      });

      y += rowH;
    });

    /* ---- 第 2 页起：特别说明 12 条 + 签字（原模板就是翻页后另起）---- */
    newPage();
    tail.forEach(function (p) {
      var t = fill(p.t);
      if (!t.trim()) { y += 8; return; }
      ctx.font = (p.bold ? 'bold ' : '') + (p.sz * 150 / 144).toFixed(1) + 'px ' + GFONT;
      ctx.fillStyle = '#000';
      ctx.textAlign = p.align === 'center' ? 'center' : (p.align === 'right' ? 'right' : 'left');
      var maxW = W - (GM.left + GM.right) * T2P;
      var ox = p.align === 'center' ? W / 2 : (p.align === 'right' ? W - GM.right * T2P : GM.left * T2P);
      var lh = (p.sz * 150 / 144) * 1.5;
      wrap(t, maxW).forEach(function (ln) {
        need(lh + 4);
        ctx.fillText(ln, ox, y);
        y += lh;
      });
      y += 4;
    });
    ctx.textAlign = 'left';

    /* 页码 */
    pages.forEach(function (p, i) {
      var c2 = p.ctx;
      c2.textAlign = 'center';
      c2.font = '14px ' + GFONT;
      c2.fillStyle = '#000';
      c2.fillText('- ' + (i + 1) + ' -', W / 2, H - GM.bottom * T2P + 8);
    });

    return assemble(pages.map(function (p) {
      return {
        width: W,
        height: H,
        jpeg: dataUrlToBytes(p.canvas.toDataURL('image/jpeg', 0.9))
      };
    }));
  }

  /* ---------------- PDF 文件结构 ---------------- */

  function pdfText(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function assemble(images) {
    // A4：595.28 × 841.89 pt
    var PW = 595.28, PH = 841.89;
    var objs = [];   // 每项是 Uint8Array（不含 "N 0 obj" 头，头另外拼）

    function obj(body) { objs.push(typeof body === 'string' ? pdfText(body) : body); return objs.length; }

    var kidsId = 1;                 // 先占位，最后回填
    objs.push(null);                // 1 = Pages（占位）

    var pageIds = [];
    images.forEach(function (img) {
      var content = 'q ' + PW.toFixed(2) + ' 0 0 ' + PH.toFixed(2) + ' 0 0 cm /Im0 Do Q';
      var contentId = obj('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      var imgHead = '<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height
        + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.jpeg.length + ' >>\nstream\n';
      var imgBody = new Uint8Array(imgHead.length + img.jpeg.length + 12);
      imgBody.set(pdfText(imgHead), 0);
      imgBody.set(img.jpeg, imgHead.length);
      imgBody.set(pdfText('\nendstream'), imgHead.length + img.jpeg.length);
      var imgId = obj(imgBody);

      var pageId = obj('<< /Type /Page /Parent ' + kidsId + ' 0 R /MediaBox [0 0 ' + PW.toFixed(2) + ' ' + PH.toFixed(2)
        + '] /Resources << /XObject << /Im0 ' + imgId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
      pageIds.push(pageId);
    });

    objs[kidsId - 1] = pdfText('<< /Type /Pages /Count ' + pageIds.length + ' /Kids ['
      + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] >>');

    var catalogId = obj('<< /Type /Catalog /Pages ' + kidsId + ' 0 R >>');

    var chunks = [pdfText('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    var offsets = [];
    var pos = chunks[0].length;

    objs.forEach(function (body, i) {
      var head = pdfText((i + 1) + ' 0 obj\n');
      var tail = pdfText('\nendobj\n');
      offsets.push(pos);
      chunks.push(head, body, tail);
      pos += head.length + body.length + tail.length;
    });

    var xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
      + offsets.map(function (o) { return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('');
    var tail = xref + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n'
      + pos + '\n%%EOF\n';
    chunks.push(pdfText(tail));

    var total = chunks.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total);
    var p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  root.PdfLite = {
    build: build,
    buildFromGrid: buildFromGrid,
    setCanvasFactory: setCanvasFactory,
    pageSize: { width: W, height: H }
  };
})(typeof window !== 'undefined' ? window : globalThis);
