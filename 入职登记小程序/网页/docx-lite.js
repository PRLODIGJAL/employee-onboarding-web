/**
 * docx-lite.js —— 极简 .docx 生成器（Word 2007+ 的 OOXML 格式）
 *
 * .docx 本质就是一个 zip，里面装几份 xml。要“一份能在 Word / WPS 里正常打开、
 * 能直接打印”的登记表，只需要这几样：
 *   [Content_Types].xml        声明每种部件的内容类型
 *   _rels/.rels                指向主文档
 *   word/document.xml          正文（段落 + 表格）
 *   word/styles.xml            默认字体与字号
 *   word/_rels/document.xml.rels、docProps/*   （Word 更放心的配料）
 *
 * 不含图片：身份证照片按需求单独放在文件夹里，不塞进 Word，
 * 这样 Word 不依赖任何 rels，任何版本的 Word / WPS 都能打开。
 *
 * 用法：
 *   var bytes = DocxLite.build({
 *     title: '员工信息登记表',
 *     meta:  ['登记编号：DJ20261019-9537', '提交时间：2026-10-19 16:20'],
 *     blocks: [{ title: '基本信息', rows: [{ label: '姓名', value: '张明远' }] }],
 *     footer: '本表由员工本人填写，HR 已核对身份证原件。'
 *   });
 */
(function (root) {
  'use strict';

  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  // A4 = 11906 × 16838 twips（1 twip = 1/20 磅）
  var PAGE_W = 11906;
  var PAGE_H = 16838;
  var MARGIN_LR = 1134;   // 2 cm
  var MARGIN_TB = 1418;   // 2.5 cm
  var CONTENT_W = PAGE_W - MARGIN_LR * 2;
  var COL_LABEL = 2600;
  var COL_VALUE = CONTENT_W - COL_LABEL;

  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // XML 1.0 不允许的控制字符，直接抹掉，否则 Word 会报文件损坏
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  /** 一个 run：字体、字号（半磅）、粗体、颜色 */
  function run(text, o) {
    o = o || {};
    var rpr = '<w:rPr>'
      + '<w:rFonts w:ascii="' + (o.ascii || 'Times New Roman') + '" w:hAnsi="' + (o.ascii || 'Times New Roman')
      + '" w:eastAsia="' + (o.font || '宋体') + '"/>'
      + (o.bold ? '<w:b/><w:bCs/>' : '')
      + (o.color ? '<w:color w:val="' + o.color + '"/>' : '')
      + '<w:sz w:val="' + (o.size || 21) + '"/><w:szCs w:val="' + (o.size || 21) + '"/>'
      + '</w:rPr>';
    return '<w:r>' + rpr + '<w:t xml:space="preserve">' + xmlEscape(text) + '</w:t></w:r>';
  }

  /** 段落。align: left|center|right */
  function para(text, o) {
    o = o || {};
    var ppr = '<w:pPr>'
      + '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 60 : o.after)
      + '" w:line="' + (o.line || 300) + '" w:lineRule="auto"/>'
      + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '')
      + (o.indent ? '<w:ind w:firstLine="' + o.indent + '"/>' : '')
      + '</w:pPr>';
    return '<w:p>' + ppr + (text === '' ? '' : run(text, o)) + '</w:p>';
  }

  function cell(text, o) {
    o = o || {};
    return '<w:tc><w:tcPr>'
      + '<w:tcW w:w="' + o.w + '" w:type="dxa"/>'
      + (o.span ? '<w:gridSpan w:val="' + o.span + '"/>' : '')
      + (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '')
      + '<w:vAlign w:val="center"/>'
      + '</w:tcPr>'
      + para(text, { size: o.size || 20, bold: o.bold, font: o.font, align: o.align, after: 0, line: 260 })
      + '</w:tc>';
  }

  function tableOpen() {
    var border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) {
      return '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>';
    }).join('');
    return '<w:tbl><w:tblPr>'
      + '<w:tblW w:w="' + CONTENT_W + '" w:type="dxa"/>'
      + '<w:jc w:val="center"/>'
      + '<w:tblBorders>' + border + '</w:tblBorders>'
      + '<w:tblLayout w:type="fixed"/>'
      + '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>'
      + '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>'
      + '</w:tblPr>'
      + '<w:tblGrid><w:gridCol w:w="' + COL_LABEL + '"/><w:gridCol w:w="' + COL_VALUE + '"/></w:tblGrid>';
  }

  function buildDocument(model) {
    var body = '';

    // 标题
    body += para(model.title || '员工信息登记表', {
      align: 'center', bold: true, size: 34, font: '黑体', ascii: 'Arial', after: 80, line: 320
    });

    // 标题下的编号 / 时间
    (model.meta || []).forEach(function (line, i) {
      body += para(line, {
        align: 'center', size: 18, color: '595959',
        after: i === (model.meta.length - 1) ? 200 : 40, line: 260
      });
    });

    // 应聘职位 / 部门 / 工号（纸质表头那三格，由 HR 手填）
    if (model.header) {
      body += para(model.header, { size: 20, color: '404040', before: 40, after: 180, line: 300 });
    }

    // 每个区块一张表：一行合并的表头 + 若干「项目 / 内容」两列行
    (model.blocks || []).forEach(function (blk, bi) {
      body += para(blk.title, {
        bold: true, size: 22, font: '黑体', ascii: 'Arial',
        before: bi === 0 ? 0 : 160, after: 60, line: 280
      });
      body += tableOpen();
      (blk.rows || []).forEach(function (r) {
        body += '<w:tr>'
          + cell(r.label, { w: COL_LABEL, fill: 'F4F6FA', size: 20, color: '404040' })
          + cell(r.value, { w: COL_VALUE, size: 20 })
          + '</w:tr>';
      });
      body += '</w:tbl>';
    });

    // 结尾说明 + 签字栏
    if (model.footer) {
      body += para(model.footer, { size: 18, color: '808080', before: 200, after: 120, line: 260 });
    }
    body += para('员工签字：________________　　　　　HR 核对：________________　　　　　日期：____________', {
      size: 20, before: 260, after: 0, line: 320
    });

    var sect = '<w:sectPr>'
      + '<w:pgSz w:w="' + PAGE_W + '" w:h="' + PAGE_H + '"/>'
      + '<w:pgMar w:top="' + MARGIN_TB + '" w:right="' + MARGIN_LR + '" w:bottom="' + MARGIN_TB
      + '" w:left="' + MARGIN_LR + '" w:header="851" w:footer="992" w:gutter="0"/>'
      + '<w:cols w:space="425"/>'
      + '<w:docGrid w:type="lines" w:linePitch="312"/>'
      + '</w:sectPr>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="' + W_NS + '" xmlns:r="' + R_NS + '"><w:body>'
      + body + sect + '</w:body></w:document>';
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="' + W_NS + '">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    + '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体" w:cs="Times New Roman"/>'
    + '<w:sz w:val="21"/><w:szCs w:val="21"/>'
    + '</w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
    + '</w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
    + '<w:qFormat/></w:style>'
    + '</w:styles>';

  var CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    + '</Types>';

  var ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    + '</Relationships>';

  var DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  var APP_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"'
    + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    + '<Application>员工信息登记系统</Application><Company>博迈医疗</Company></Properties>';

  function coreXml(model) {
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
      + ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"'
      + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + '<dc:title>' + xmlEscape(model.title || '员工信息登记表') + '</dc:title>'
      + '<dc:creator>员工信息登记系统</dc:creator>'
      + '<cp:lastModifiedBy>员工信息登记系统</cp:lastModifiedBy>'
      + '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>'
      + '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>'
      + '</cp:coreProperties>';
  }

  /** model -> Uint8Array（一个完整的 .docx） */
  function build(model) {
    var z = root.ZipLite.create();
    z.text('[Content_Types].xml', CONTENT_TYPES);
    z.text('_rels/.rels', ROOT_RELS);
    z.text('docProps/core.xml', coreXml(model || {}));
    z.text('docProps/app.xml', APP_XML);
    z.text('word/document.xml', buildDocument(model || {}));
    z.text('word/styles.xml', STYLES);
    z.text('word/_rels/document.xml.rels', DOC_RELS);
    return z.bytes();
  }

  root.DocxLite = { build: build, buildDocument: buildDocument, escape: xmlEscape };
})(typeof window !== 'undefined' ? window : globalThis);
