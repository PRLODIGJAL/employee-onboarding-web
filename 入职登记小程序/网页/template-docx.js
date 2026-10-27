/**
 * template-docx.js —— 把员工数据填进公司《员工信息登记表》母版，导出 .docx
 *
 * 母版在 form-template.js 里（由 开发工具/build-form-template.py 从公司原始 .docx 生成），
 * 表格、合并格、行高、字体、页边距、印章图全部是原件，这里只做「{{占位符}} → 实际内容」的替换，
 * 然后原样打回 zip。所以打出来的纸就是公司那张要签字盖章的表，黑白、无彩色。
 *
 * 用法：
 *   var bytes = TemplateDocx.build(values, { noWork: true });
 */
(function (root) {
  'use strict';

  /** 模板里工作经历有几行（母版已从 3 行删到 2 行）—— 改模板时这里要跟着改 */
  var WORK_ROWS = 2;

  /** 值 → 显示文本。数组（如籍贯）用空格连起来 */
  function txt(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.filter(Boolean).join(' ');
    return String(v);
  }

  /** 选择题：☑ 打勾表示选中，□ 保持空框，黑白打印一样看得清 */
  function pick(options, value) {
    return options.map(function (o) {
      return (o === value ? '☑' : '□') + o;
    }).join('  ');
  }

  /** 是 / 否 题。note 是「选是时补充的说明」，模板里没有专门的格子，就写在方框后面 */
  function yn(value, yesLabel, note) {
    var yesBox = yesLabel ? '是（' + yesLabel + '）' : '是';
    var out = (value === '是' ? '☑' : '□') + yesBox
      + '    '
      + (value === '是' ? '□' : '☑') + '否';
    if (value === '是' && note) out += '  说明：' + note;
    return out;
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** 日期统一成 2026-10-23（签字旁边的「日期」用） */
  function fmtDate(v) {
    var d = v ? new Date(v) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 把 values 收成 { 占位符: 文本 } */
  function buildMap(values, opts) {
    var v = values || {};
    var m = {};
    var NO = '暂无工作或实习经历（应届生 / 首次就业）';

    /* ---- 基本信息 ---- */
    m.realName = txt(v.realName);
    m.gender = txt(v.gender);
    m.birthday = txt(v.birthday);
    m.height = txt(v.height);
    m.weight = txt(v.weight);
    m.nativePlace = txt(v.nativePlace);
    m.nation = txt(v.nation);
    m.highestEducation = txt(v.highestEducation);
    m.title = txt(v.title);
    m.language = txt(v.language);
    m.certificate = txt(v.certificate);
    m.graduateDate = txt(v.graduateDate);
    m.graduateSchool = txt(v.graduateSchool);
    m.major = txt(v.major);
    m.idcard = txt(v.idcard);
    m.householdAddress = [txt(v.householdRegion), txt(v.householdDetail)].filter(Boolean).join(' ');
    m.phone = txt(v.phone);

    /* 地址：省市区 + 详细地址合成一行，和纸质表的「永久通讯地址」对应 */
    function addr(regionKey, detailKey) {
      return [txt(v[regionKey]), txt(v[detailKey])].filter(Boolean).join(' ');
    }
    m.permanentAddress = addr('permanentRegion', 'permanentDetail');
    m.liveAddress = addr('liveRegion', 'liveDetail');

    /* ---- 紧急联系人 ---- */
    m.emName = txt(v.emName);
    m.emRelation = txt(v.emRelation);
    m.emPhone = txt(v.emPhone);
    m.emAddress = txt(v.emAddress);
    m.email = txt(v.email);

    /* ---- 选择题 ---- */
    m.POLITICAL = pick(['党员', '群众'], (txt(v.politicalStatus) || '').indexOf('党员') >= 0 ? '党员' : '群众');
    m.MARRIAGE = pick(['未婚', '已婚'], txt(v.marriage) === '已婚' ? '已婚' : '未婚');
    m.HOUSEHOLD = pick(['农村', '城镇'], txt(v.householdType) === '城镇' ? '城镇' : '农村');

    /* ---- 受教育情况（只填最高学历一段，模板已删到 1 行）---- */
    var edus = (v.educations || []).filter(function (r) { return r && (r.school || r.dateFrom || r.major); });
    var e = edus[0] || {};
    m['edu1.dateFrom'] = txt(e.start || e.dateFrom);
    m['edu1.dateTo'] = txt(e.end || e.dateTo);
    m['edu1.school'] = txt(e.school);
    m['edu1.major'] = txt(e.major);
    m['edu1.degree'] = txt(e.degree);
    m['edu1.witness'] = txt(e.witness);

    /* ---- 工作经历（模板只有 2 行，最多写两段；勾了「暂无」时只写一行说明）---- */
    var WK = ['dateFrom', 'dateTo', 'company', 'duty', 'leave'];
    if (opts && opts.noWork) {
      WK.forEach(function (k, i) { m['work1.' + k] = i === 0 ? NO : ''; });
      WK.forEach(function (k) { m['work2.' + k] = ''; });
    } else {
      var works = (v.works || []).filter(function (r) { return r && (r.company || r.dateFrom || r.duty); });
      for (var j = 0; j < WORK_ROWS; j++) {
        var w = works[j] || {};
        m['work' + (j + 1) + '.dateFrom'] = txt(w.start || w.dateFrom);
        m['work' + (j + 1) + '.dateTo'] = txt(w.end || w.dateTo);
        m['work' + (j + 1) + '.company'] = txt(w.company);
        m['work' + (j + 1) + '.duty'] = txt(w.duty);
        m['work' + (j + 1) + '.leave'] = txt(w.leave);
      }
    }

    /* ---- 其他信息 14 问 ---- */
    m.Q1 = yn(v.q1, null);
    var credType = txt(v.q1CreditType) === '微信支付分' ? '微信支付分' : '芝麻信用分';
    m.CREDIT = (credType === '芝麻信用分'
      ? '☑芝麻信用分  □微信支付分：'
      : '□芝麻信用分  ☑微信支付分：') + txt(v.q1CreditScore);

    var NOTE_Q = { q6: '提供书面说明', q7: '提供书面说明', q8: '提供书面说明', q9: '提供书面说明', q10: '提供书面说明', q11: '提供书面说明', q13: '提供证明' };
    Object.keys(NOTE_Q).forEach(function (k) {
      m['YN:' + k] = yn(v[k], NOTE_Q[k], txt(v[k + 'Note']));
    });
    ['q2', 'q3', 'q4', 'q5', 'q12'].forEach(function (k) {
      m['YN:' + k] = yn(v[k], null);
    });

    m.Q14 = pick(['有', '无'], txt(v.q14) === '有' ? '有' : '无');

    /* ---- 渠道 ---- */
    var CHANNELS = ['宣传单', '网络', '厂门口', '经人介绍', '其他途径'];
    var ch = txt(v.channel);
    var chText = CHANNELS.map(function (o) {
      return (o === ch ? '☑' : '□') + ' ' + o;
    }).join('  ');
    if (ch === '经人介绍') {
      /* 经人介绍还要分两种：同事内推（写姓名）／中介送来（写中介公司名）。
         两行都只落在同一个「介绍人」位置——纸质表就这么一格，不另起一行。 */
      var refType = txt(v.channelRefType);
      var tag = refType === '中介推荐' ? '中介推荐'
        : (refType === '内部推荐' ? '内部推荐' : '');
      chText += (tag ? '  （' + tag + '）' : '') + '：'
        + (refType === '中介推荐' ? txt(v.channelAgency) : txt(v.channelRefName));
      if (refType !== '中介推荐') {
        var rel = txt(v.channelRefRelation);
        if (rel) chText += '  关系：' + rel;
      }
    } else if (ch === '其他途径') {
      chText += '：' + txt(v.channelOther || '');
    }
    m.CHANNEL = chText;

    /* 签字旁边的日期：签的就是提交那一天 */
    var signDate = fmtDate(v.submittedAt || (opts && opts.date));
    m.date1 = signDate;
    m.date2 = signDate;

    return m;
  }

  /* 这三个不是文字，是图片（照片 / 两处手写签名）。render 时原样留下，
     等行距定下来、知道格子有多高了，再换成 <w:drawing>。 */
  var DRAW_KEYS = { photo: 1, sig1: 1, sig2: 1 };

  /** 把 document.xml 里的 {{key}} 换成实际内容；缺值的留空，不留下 {{}} 痕迹 */
  function render(xml, map) {
    return xml.replace(/\{\{([^}]+)\}\}/g, function (all, key) {
      var val = map[key];
      if (val === undefined || val === null) return DRAW_KEYS[key] ? all : '';
      return val;
    });
  }

  /* ---------------- 行距自适应 ----------------
   * 模板用的是 18 磅固定行距（w:line="360" lineRule="exact"），字只有 8 磅，
   * 于是每行白占 0.63cm。空表刚好铺满一页，一旦填上内容（证书、地址、两段
   * 工作经历）表格就会长出第一页，把「特别说明」顶到第三页去。
   *
   * 所以导出时按实际内容量一遍：装得下就一个字节都不动；装不下就把行距按
   * 超出比例收紧（最低 12 磅），保证整份登记表稳定落在两页。
   */
  var PAGE_SAFETY = 0.85;    // 估算按 Word 实测校准过：留 15% 余量才真能压进两页
  var SP_MIN = 240;          // 行距下限 12 磅（7 磅字配 12 磅行距，打印仍清楚）

  /** 东亚字符算 1，西文算 0.55（宋体里西文窄） */
  function wideUnits(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i) >= 0x2E80 ? 1 : 0.55;
    return n;
  }

  function cellText(tc) {
    var out = '', re = /<w:t[^>]*>([^<]*)<\/w:t>/g, m;
    while ((m = re.exec(tc))) out += m[1];
    return out;
  }

  /** 一个格子会排成几行 */
  function cellLines(tc) {
    var w = /<w:tcW w:w="(\d+)"/.exec(tc);
    if (!w) return 0;
    var txt = cellText(tc);
    if (!txt.replace(/\s/g, '')) return 0;
    var szm = /<w:sz w:val="(\d+)"/.exec(tc);
    var pt = (szm ? +szm[1] : 16) / 2;
    var usable = (+w[1]) - 216;              // 单元格左右内边距各 108 twips
    if (usable < 100) return 0;
    return Math.max(1, Math.ceil(wideUnits(txt) / (usable / (pt * 20))));
  }

  function pageWidth(xml) {
    var pg = /<w:pgSz w:w="(\d+)"/.exec(xml);
    var mar = /<w:pgMar w:left="(\d+)"[^/]*w:right="(\d+)"/.exec(xml);
    if (!pg || !mar) return 9638;
    return (+pg[1]) - (+mar[1]) - (+mar[2]);
  }

  /** 表格总高（行高取 trHeight 与内容行高的较大值） */
  function tableHeight(xml, base) {
    var s = xml.indexOf('<w:tbl>'), e = xml.lastIndexOf('</w:tbl>');
    if (s < 0 || e < 0) return 0;
    var tbl = xml.slice(s, e);
    var rowRe = /<w:tr[ >][\s\S]*?<\/w:tr>/g, m, total = 0;
    while ((m = rowRe.exec(tbl))) {
      var tr = m[0];
      var h = /<w:trHeight w:val="(\d+)"/.exec(tr);
      var rowH = h ? +h[1] : 0;
      var tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g, tm;
      while ((tm = tcRe.exec(tr))) rowH = Math.max(rowH, cellLines(tm[0]) * base);
      total += rowH;
    }
    return total;
  }

  /** 表格之后（特别说明 + 签字）的总高 */
  function tailHeight(xml, base) {
    var i = xml.lastIndexOf('</w:tbl>');
    if (i < 0) return 0;
    var tail = xml.slice(i), w = pageWidth(xml);
    var pRe = /<w:p[ >][\s\S]*?<\/w:p>/g, m, total = 0;
    while ((m = pRe.exec(tail))) {
      var p = m[0];
      var szm = /<w:sz w:val="(\d+)"/.exec(p);
      var pt = (szm ? +szm[1] : 16) / 2;
      var txt = cellText(p);
      var lh = /<w:spacing[^/]*w:lineRule="exact"/.test(p) ? base : pt * 20 * 1.34;
      var lines = txt.replace(/\s/g, '')
        ? Math.max(1, Math.ceil(wideUnits(txt) / (w / (pt * 20))))
        : 1;
      total += lines * lh;
    }
    return total;
  }

  /**
   * 按内容把行距收到「刚好装下两页」。装得下原样返回，不破坏模板观感。
   * @returns {{xml:string, base:number, used:number}}
   */
  function fitSpacing(xml) {
    var bm = /<w:spacing w:line="(\d+)" w:lineRule="exact"\/>/.exec(xml);
    var base = bm ? +bm[1] : 0;
    if (!base) return { xml: xml, base: 0, used: 0 };

    var pg = /<w:pgSz w:w="(\d+)" w:h="(\d+)"/.exec(xml);
    var mar = /<w:pgMar w:top="(\d+)"[^/]*w:bottom="(\d+)"/.exec(xml);
    var budget = (pg && mar) ? ((+pg[2]) - (+mar[1]) - (+mar[2])) : 15251;
    budget *= PAGE_SAFETY;

    var t = tableHeight(xml, base);
    var tl = tailHeight(xml, base);
    var s = base;
    if (t > 0) s = Math.min(s, base * budget / t);
    if (tl > 0) s = Math.min(s, base * budget / tl);
    s = Math.floor(s);

    if (s >= base) return { xml: xml, base: base, used: base };   // 装得下，不动
    if (s < SP_MIN) s = SP_MIN;                                   // 不能再小了
    return {
      xml: xml.split('w:line="' + base + '" w:lineRule="exact"')
             .join('w:line="' + s + '" w:lineRule="exact"'),
      base: base,
      used: s
    };
  }

  /** 把行距换成 used（base 是模板原值，used 是这次算出来的）；装得下就原样返回 */
  function applySpacing(xml, base, used) {
    if (!base || !used || used >= base) return xml;
    return xml.split('w:line="' + base + '" w:lineRule="exact"')
      .join('w:line="' + used + '" w:lineRule="exact"');
  }

  /* ---------------- 照片 / 签名：往 docx 里塞图片 ----------------
   * 一张照片、一个手写签名，都要变成真正的 <w:drawing> 才算数。
   * 需要同时改三处：word/media 里的图片正文、document.xml.rels 里的关系、
   * [Content_Types].xml 里的扩展名声明——少一处 Word 就打不开（说"文件已损坏"）。
   */
  var EMU_PER_TWIP = 635;

  /** dataURL → { ext, bytes, w, h }；宽高从图片头里读，不依赖调用方传 */
  function imgInfo(dataUrl) {
    var m = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/i.exec(String(dataUrl || ''));
    if (!m) return null;
    var type = m[1].toLowerCase();
    var ext = (type === 'jpeg' || type === 'jpg') ? 'jpeg' : type;
    var bin = root.atob(m[2].replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xFF;

    var w = 0, h = 0;
    if (ext === 'png' && bytes.length > 24) {
      // PNG：IHDR 从第 16 字节开始，宽高各 4 字节大端
      w = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
      h = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
    } else if (ext === 'jpeg') {
      // JPEG：找 SOF0/1/2 段，里面 height(2) width(2)
      var p = 2;
      while (p + 9 < bytes.length) {
        if (bytes[p] !== 0xFF) { p++; continue; }
        var mk = bytes[p + 1];
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
          h = bytes[p + 5] << 8 | bytes[p + 6];
          w = bytes[p + 7] << 8 | bytes[p + 8];
          break;
        }
        p += 2 + (bytes[p + 2] << 8 | bytes[p + 3]);
      }
    }
    if (!w || !h) return null;
    return { ext: ext, bytes: bytes, w: w, h: h };
  }

  function drawingXml(rid, cx, cy, id, name) {
    var A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
      + '<wp:extent cx="' + cx + '" cy="' + cy + '"/>'
      + '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
      + '<wp:docPr id="' + id + '" name="' + name + '"/>'
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks ' + A + ' noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic ' + A + '><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '"/>'
      + '<pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
      + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>';
  }

  /** 按比例缩放，两个方向都不许超 */
  function fitBox(img, maxW, maxH) {
    var k = Math.min(maxW / img.w, maxH / img.h);
    return {
      cx: Math.round(img.w * k * EMU_PER_TWIP),
      cy: Math.round(img.h * k * EMU_PER_TWIP)
    };
  }

  /** {@photo}：整个照片格换掉——有照片就只放照片，没照片就只留「照片」两个字 */
  function putPhoto(xml, img, used, addImage) {
    var key = '{{photo}}';
    var i = xml.indexOf(key);
    if (i < 0) return xml;
    var cs = xml.lastIndexOf('<w:tc>', i), ce = xml.indexOf('</w:tc>', i);
    if (cs < 0 || ce < 0) return xml;

    var tc = xml.slice(cs, ce + 7);
    var head = tc.slice(0, tc.indexOf('<w:p'));          // <w:tc> + tcPr
    if (!img) {
      // 没照片：把 {{photo}} 那一段删掉，还原成模板原本的样子
      var ps = tc.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
      var kept = ps.filter(function (p) { return p.indexOf(key) < 0; }).join('');
      return xml.slice(0, cs) + head + kept + '</w:tc>' + xml.slice(ce + 7);
    }

    // 照片格横跨表格前 5 行：可用高 = 5 行行距，标签让位给照片
    var maxH = Math.max(600, 5 * used - 60);
    var tcw = /<w:tcW w:w="(\d+)"/.exec(tc);
    var maxW = Math.min(1531, (tcw ? +tcw[1] : 1747) - 216);
    var sz = fitBox(img, maxW, maxH);

    var rid = addImage(img, 'photo');
    var p = '<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>'
      + '<w:r>' + drawingXml(rid, sz.cx, sz.cy, 1001, '照片') + '</w:r></w:p>';
    return xml.slice(0, cs) + head + p + '</w:tc>' + xml.slice(ce + 7);
  }

  /**
   * {@sigN}：把「____」那条下划线换成手写签名图。
   *
   * 签字那两段的行距在母版里已经改成「至少 18 磅」（lineRule=atLeast），
   * 所以图只要不超过一行的高度就不会被裁、也不会把行撑起来。
   * 460 twips（约 0.81cm）：手写签名在纸质表上大概就是这个高度，
   * 原来 340（0.6cm）打印出来偏小，签在格子里像个小 Mark。
   */
  function putSign(xml, key, img, used, blank, addImage) {
    var marker = '\\{\\{' + key + '\\}\\}';
    var re = new RegExp('<w:r>((?:<w:rPr>[\\s\\S]*?<\\/w:rPr>)?)<w:t[^>]*>' + marker + '<\\/w:t><\\/w:r>');
    if (!re.test(xml)) return xml;

    var rid = '', sz = null;
    if (img) {
      rid = addImage(img, 'sign');
      var maxH = Math.min(460, Math.max(used, 520) - 20);
      sz = fitBox(img, 2800, maxH);
    }
    return xml.replace(re, function (all, rpr) {
      // 下划线属性留着会画一道线压在签名底下，去掉
      var plain = rpr.replace(/<w:u [^>]*\/>/g, '');
      if (!sz) return '<w:r>' + plain + '<w:t xml:space="preserve">' + blank + '</w:t></w:r>';
      return '<w:r>' + plain + drawingXml(rid, sz.cx, sz.cy, 1002, '签名') + '</w:r>';
    });
  }

  /** 量高度时把照片占位段落去掉——它最后会变成图片，不该按一行字算 */
  function stripPhotoP(xml) {
    return xml.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?\{\{photo\}\}(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '');
  }

  function b64ToBytes(b64) {
    var bin = root.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
    return out;
  }

  /**
   * @param {object} values 表单数据
   * @param {object} opts   { noWork: 勾了「暂无工作经历」 }
   * @returns {Uint8Array} 一份完整的 .docx
   */
  function build(values, opts) {
    var tpl = root.FORM_TEMPLATE;
    if (!tpl) throw new Error('找不到登记表母版（form-template.js 没加载）');
    var v = values || {};

    var map = buildMap(v, opts || {});
    var z = root.ZipLite.create();
    var spacing = { base: 0, used: 0 };

    var parts = {};
    Object.keys(tpl.parts).forEach(function (k) { parts[k] = tpl.parts[k]; });

    var doc = render(parts['word/document.xml'], map);

    /* 行距先定：照片和签名要按「格子实际还有多高」来缩放，
       顺序反了就会出现「照片把行撑高 → 行距再收紧 → 照片又撑高」的死循环。 */
    var probe = fitSpacing(stripPhotoP(doc));
    doc = applySpacing(doc, probe.base, probe.used);
    spacing = { base: probe.base, used: probe.used };
    var used = probe.used || probe.base || 360;

    /* 图片：照片格 + 两处签字 */
    var rels = parts['word/_rels/document.xml.rels'];
    var ctypes = parts['[Content_Types].xml'];
    var ridSeq = 900;
    var mediaAdded = {};

    function addImage(img, name) {
      if (mediaAdded[name]) return mediaAdded[name];
      var file = 'media/bmai_' + name + '.' + img.ext;
      var rid = 'rId' + (ridSeq++);
      mediaAdded[name] = rid;
      parts['word/' + file] = null;                   // 标记：下面按二进制写
      z.add('word/' + file, img.bytes);
      rels = rels.replace('</Relationships>',
        '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'
        + ' Target="' + file + '"/></Relationships>');
      if (ctypes.indexOf('Extension="' + img.ext + '"') < 0) {
        var ct = img.ext === 'jpeg' ? 'image/jpeg' : 'image/' + img.ext;
        ctypes = ctypes.replace('<Default Extension="png"',
          '<Default Extension="' + img.ext + '" ContentType="' + ct + '"/><Default Extension="png"');
      }
      return rid;
    }

    var photo = imgInfo(v.photoData || (v.photo && /^data:/.test(v.photo) ? v.photo : ''));
    var sign = imgInfo(v.signData);

    doc = putPhoto(doc, photo, used, addImage);
    doc = putSign(doc, 'sig1', sign, used, '                 ', addImage);
    doc = putSign(doc, 'sig2', sign, used, '              ', addImage);

    parts['word/document.xml'] = doc;
    parts['word/_rels/document.xml.rels'] = rels;
    parts['[Content_Types].xml'] = ctypes;

    Object.keys(parts).forEach(function (name) {
      if (parts[name] === null) return;               // 图片已单独写进 zip
      z.text(name, parts[name]);
    });

    Object.keys(tpl.media || {}).forEach(function (name) {
      z.add(name, b64ToBytes(tpl.media[name]));
    });

    var bytes = z.bytes();
    lastSpacing = spacing;
    return bytes;
  }

  /** 上一次导出用的行距：{ base: 模板原值, used: 实际用的值 } */
  var lastSpacing = { base: 0, used: 0 };

  root.TemplateDocx = {
    build: build, buildMap: buildMap, render: render, fitSpacing: fitSpacing,
    applySpacing: applySpacing, imgInfo: imgInfo,
    /** 上次导出实际用的行距（twips）：装得下 = 模板原值，被压缩了 < 原值 */
    spacing: function () { return lastSpacing; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
