/**
 * qr-lite.js —— 零依赖二维码生成（只做「网址」这一种用途，不追求全功能）
 *
 * 为什么自己写：整个项目到现在没有一行第三方依赖，扫码是 HR 发链接的主要方式，
 * 为了一张二维码去引一个几百 KB 的库不划算。
 *
 * 支持：
 *   - byte 模式（中文自动转 UTF-8）
 *   - 版本 1~10（M 级最多 213 字节，链接够用），超长自动降到 L 级
 *   - 输出矩阵 / SVG 字符串
 *
 * 用法：
 *   var q = QrLite.encode('https://example.com/');
 *   QrLite.toSvg(q, { scale: 8 })      → '<svg ...>'
 *   QrLite.toCanvas(q, canvasEl)       → 画到 canvas 上
 *
 * 校验方式：与 Python qrcode 库逐模块比对（web/verify-qr.py），
 * 同一 version/EC/mask 下矩阵必须完全一致。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QrLite = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- 常量表 ---------------- */

  // 格式信息里 EC 级别的编码
  var EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  // 每个版本的总码字数（数据 + 纠错）
  var TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

  // 纠错块结构：[每块纠错码字数, 组1块数, 组1每块数据码字, 组2块数, 组2每块数据码字]
  var BLOCKS = {
    1: { L: [7, 1, 19, 0, 0], M: [10, 1, 16, 0, 0], Q: [13, 1, 13, 0, 0], H: [17, 1, 9, 0, 0] },
    2: { L: [10, 1, 34, 0, 0], M: [16, 1, 28, 0, 0], Q: [22, 1, 22, 0, 0], H: [28, 1, 16, 0, 0] },
    3: { L: [15, 1, 55, 0, 0], M: [26, 1, 44, 0, 0], Q: [18, 2, 17, 0, 0], H: [22, 2, 13, 0, 0] },
    4: { L: [20, 1, 80, 0, 0], M: [18, 2, 32, 0, 0], Q: [26, 2, 24, 0, 0], H: [16, 4, 9, 0, 0] },
    5: { L: [26, 1, 108, 0, 0], M: [24, 2, 43, 0, 0], Q: [18, 2, 15, 2, 16], H: [22, 2, 11, 2, 12] },
    6: { L: [18, 2, 68, 0, 0], M: [16, 4, 27, 0, 0], Q: [24, 4, 19, 0, 0], H: [28, 4, 15, 0, 0] },
    7: { L: [20, 2, 78, 0, 0], M: [18, 4, 31, 0, 0], Q: [18, 2, 14, 4, 15], H: [26, 4, 13, 1, 14] },
    8: { L: [24, 2, 97, 0, 0], M: [22, 2, 38, 2, 39], Q: [22, 4, 18, 2, 19], H: [26, 4, 14, 2, 15] },
    9: { L: [30, 2, 116, 0, 0], M: [22, 3, 36, 2, 37], Q: [20, 4, 16, 4, 17], H: [24, 4, 12, 4, 13] },
    10: { L: [18, 2, 68, 2, 69], M: [26, 4, 43, 1, 44], Q: [24, 6, 19, 2, 20], H: [28, 6, 15, 2, 16] }
  };

  // 校正图形中心坐标
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  /* ---------------- GF(256) ---------------- */

  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /** 生成多项式 g(x)=∏(x-α^i)，返回长度 ecLen+1 的系数数组（[0]=最高次，恒为 1） */
  function genPoly(ecLen) {
    var g = [1];
    for (var i = 0; i < ecLen; i++) {
      var next = new Array(g.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gfMul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  /** 多项式长除法，返回 ecLen 个纠错码字 */
  function rsEncode(data, ecLen) {
    var g = genPoly(ecLen);
    var buf = new Array(data.length + ecLen);
    var i;
    for (i = 0; i < data.length; i++) buf[i] = data[i];
    for (i = 0; i < ecLen; i++) buf[data.length + i] = 0;

    for (i = 0; i < data.length; i++) {
      var coef = buf[i];
      if (coef !== 0) {
        for (var j = 0; j < g.length; j++) buf[i + j] ^= gfMul(g[j], coef);
      }
    }
    return buf.slice(data.length);
  }

  /* ---------------- 数据编码 ---------------- */

  /** 字符串 → UTF-8 字节。老手机上 TextEncoder 不一定有，自己转一份 */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i++;
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return out;
  }

  function dataCapacity(ver, ec) {
    var b = BLOCKS[ver][ec];
    return b[1] * b[2] + b[3] * b[4];
  }

  function countBits(ver) { return ver <= 9 ? 8 : 16; }

  function pickVersion(byteLen, ec) {
    for (var v = 1; v <= 10; v++) {
      var capBits = dataCapacity(v, ec) * 8;
      var need = 4 + countBits(v) + byteLen * 8;
      if (need <= capBits) return v;
    }
    return 0;
  }

  function buildCodewords(bytes, ver, ec) {
    var bits = [];
    function put(val, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    }

    put(4, 4);                              // byte 模式
    put(bytes.length, countBits(ver));      // 字符数
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);

    var capBits = dataCapacity(ver, ec) * 8;
    // 终止符
    for (var t = 0; t < 4 && bits.length < capBits; t++) bits.push(0);
    // 补齐到字节
    while (bits.length % 8 !== 0) bits.push(0);

    var words = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      words.push(byte);
    }
    // 填充字节 EC 11 交替
    var pad = [0xec, 0x11];
    var p = 0;
    while (words.length < dataCapacity(ver, ec)) words.push(pad[p++ % 2]);
    return words;
  }

  /** 分块 + 纠错 + 交织 */
  function addEcc(words, ver, ec) {
    var b = BLOCKS[ver][ec];
    var ecLen = b[0], g1 = b[1], g1d = b[2], g2 = b[3], g2d = b[4];
    var blocks = [];
    var pos = 0;
    var i;
    for (i = 0; i < g1; i++) { blocks.push(words.slice(pos, pos + g1d)); pos += g1d; }
    for (i = 0; i < g2; i++) { blocks.push(words.slice(pos, pos + g2d)); pos += g2d; }

    var eccs = blocks.map(function (d) { return rsEncode(d, ecLen); });

    var out = [];
    // 交织要按"最长的那种块"来走，组 2 的块比组 1 多一个数据码字，
    // 少了这一步，组 2 每块会丢掉最后一个码字（v8-M 就会少 2 个）。
    var maxLen = Math.max(g1d, g2d);
    for (i = 0; i < maxLen; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i < blocks[j].length) out.push(blocks[j][i]);
      }
    }
    for (i = 0; i < ecLen; i++) {
      for (var k = 0; k < eccs.length; k++) out.push(eccs[k][i]);
    }
    return out;
  }

  /* ---------------- 矩阵 ---------------- */

  function Matrix(ver) {
    this.ver = ver;
    this.size = 17 + ver * 4;
    this.dark = new Uint8Array(this.size * this.size);
    this.fixed = new Uint8Array(this.size * this.size);   // 1 = 功能图形，不参与掩码
  }

  Matrix.prototype.set = function (x, y, v) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.dark[y * this.size + x] = v ? 1 : 0;
  };
  Matrix.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return 0;
    return this.dark[y * this.size + x];
  };
  Matrix.prototype.setFixed = function (x, y, v) {
    this.set(x, y, v);
    if (x >= 0 && y >= 0 && x < this.size && y < this.size) this.fixed[y * this.size + x] = 1;
  };

  function drawFinder(m, cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        m.setFixed(cx + dx, cy + dy, d !== 2 && d !== 4 ? 1 : 0);
      }
    }
  }

  function drawAlign(m, cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy));
        m.setFixed(cx + dx, cy + dy, d !== 1 ? 1 : 0);
      }
    }
  }

  function drawFormat(m, ec, mask) {
    var data = (EC_BITS[ec] << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    function bit(i) { return (bits >>> i) & 1; }

    var n = m.size;
    // 左上角那一份
    for (i = 0; i <= 5; i++) m.setFixed(8, i, bit(i));
    m.setFixed(8, 7, bit(6));
    m.setFixed(8, 8, bit(7));
    m.setFixed(7, 8, bit(8));
    for (i = 9; i <= 14; i++) m.setFixed(14 - i, 8, bit(i));
    // 右上 + 左下那一份
    for (i = 0; i <= 7; i++) m.setFixed(n - 1 - i, 8, bit(i));
    for (i = 8; i <= 14; i++) m.setFixed(8, n - 15 + i, bit(i));
    // 固定的深色模块
    m.setFixed(8, n - 8, 1);
  }

  function drawVersion(m) {
    if (m.ver < 7) return;
    var rem = m.ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (m.ver << 12) | rem;
    for (i = 0; i < 18; i++) {
      var v = (bits >>> i) & 1;
      var a = m.size - 11 + (i % 3);
      var b = Math.floor(i / 3);
      m.setFixed(a, b, v);
      m.setFixed(b, a, v);
    }
  }

  function drawFunctionPatterns(m, ec, mask) {
    var n = m.size;
    var i, j;

    // 定位图形
    drawFinder(m, 3, 3);
    drawFinder(m, n - 4, 3);
    drawFinder(m, 3, n - 4);

    // 定时图形
    for (i = 8; i < n - 8; i++) {
      m.setFixed(i, 6, i % 2 === 0 ? 1 : 0);
      m.setFixed(6, i, i % 2 === 0 ? 1 : 0);
    }

    // 校正图形（跳过和定位图形重叠的位置）
    var pos = ALIGN[m.ver];
    for (i = 0; i < pos.length; i++) {
      for (j = 0; j < pos.length; j++) {
        var cx = pos[i], cy = pos[j];
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === n - 7) || (cx === n - 7 && cy === 6)) continue;
        drawAlign(m, cx, cy);
      }
    }

    drawFormat(m, ec, mask);
    drawVersion(m);
  }

  var MASK_FN = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; },
    function (x, y) { return (x * y) % 2 + (x * y) % 3 === 0; },
    function (x, y) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + (x * y) % 3) % 2 === 0; }
  ];

  function drawCodewords(m, codewords) {
    var n = m.size;
    var i = 0;   // 位下标
    var total = codewords.length * 8;

    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;                 // 跳过定时列
      for (var vert = 0; vert < n; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? n - 1 - vert : vert;
          if (!m.fixed[y * n + x]) {
            var bit = 0;
            if (i < total) bit = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
            m.dark[y * n + x] = bit;
            i++;
          }
        }
      }
    }
  }

  function applyMask(m, mask) {
    var fn = MASK_FN[mask];
    var n = m.size;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!m.fixed[y * n + x] && fn(x, y)) m.dark[y * n + x] ^= 1;
      }
    }
  }

  /** 掩码评分（按标准四条规则，用来挑视觉上最干净的那个掩码） */
  function penalty(m) {
    var n = m.size;
    var score = 0;
    var x, y, i;

    // 规则1：连续同色 5 个以上
    for (y = 0; y < n; y++) {
      var runColor = -1, runLen = 0;
      for (x = 0; x < n; x++) {
        var c = m.get(x, y);
        if (c === runColor) { runLen++; }
        else { if (runLen >= 5) score += 3 + (runLen - 5); runColor = c; runLen = 1; }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    for (x = 0; x < n; x++) {
      var rc = -1, rl = 0;
      for (y = 0; y < n; y++) {
        var c2 = m.get(x, y);
        if (c2 === rc) { rl++; }
        else { if (rl >= 5) score += 3 + (rl - 5); rc = c2; rl = 1; }
      }
      if (rl >= 5) score += 3 + (rl - 5);
    }

    // 规则2：2x2 同色块
    for (y = 0; y < n - 1; y++) {
      for (x = 0; x < n - 1; x++) {
        var a = m.get(x, y);
        if (a === m.get(x + 1, y) && a === m.get(x, y + 1) && a === m.get(x + 1, y + 1)) score += 3;
      }
    }

    // 规则3：形似定位图形 1011101 且一侧有 4 个空白
    var PAT = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    function looksFinder(arr) {
      for (var k = 0; k < 11; k++) if (arr[k] !== PAT[k]) return false;
      return true;
    }
    function reversed(arr) { return arr.slice().reverse(); }
    for (y = 0; y < n; y++) {
      for (x = 0; x <= n - 11; x++) {
        var row = [];
        for (i = 0; i < 11; i++) row.push(m.get(x + i, y));
        if (looksFinder(row) || looksFinder(reversed(row))) score += 40;
      }
    }
    for (x = 0; x < n; x++) {
      for (y = 0; y <= n - 11; y++) {
        var col = [];
        for (i = 0; i < 11; i++) col.push(m.get(x, y + i));
        if (looksFinder(col) || looksFinder(reversed(col))) score += 40;
      }
    }

    // 规则4：深色比例偏离 50%
    var dark = 0;
    for (i = 0; i < m.dark.length; i++) dark += m.dark[i];
    var ratio = dark * 100 / (n * n);
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return score;
  }

  /* ---------------- 对外接口 ---------------- */

  /**
   * 生成二维码
   * @param {string} text  要编码的内容
   * @param {object} [opt] { ec: 'M'|'L'|'Q'|'H', mask: 0-7 强制掩码, version: 强制版本 }
   * @returns {{size:number, modules:Uint8Array, version:number, ec:string, mask:number}}
   */
  function encode(text, opt) {
    opt = opt || {};
    var ec = opt.ec || 'M';
    var bytes = utf8Bytes(String(text));

    var ver = opt.version || pickVersion(bytes.length, ec);
    if (!ver) {
      // M 级放不下就退到 L 级再试一次
      if (ec === 'M' && !opt.version) { ec = 'L'; ver = pickVersion(bytes.length, ec); }
      if (!ver) throw new Error('内容太长，二维码放不下（' + bytes.length + ' 字节）');
    }

    var words = buildCodewords(bytes, ver, ec);
    var codewords = addEcc(words, ver, ec);

    var best = null;
    var bestScore = Infinity;
    var bestMask = 0;
    var masks = (typeof opt.mask === 'number') ? [opt.mask] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (var k = 0; k < masks.length; k++) {
      var m = new Matrix(ver);
      drawFunctionPatterns(m, ec, masks[k]);
      drawCodewords(m, codewords);
      applyMask(m, masks[k]);
      // 掩码会改数据区，格式信息得重画（applyMask 不碰 fixed，所以不用重画，这里保险起见再描一次）
      var s = penalty(m);
      if (!best || s < bestScore) { best = m; bestScore = s; bestMask = masks[k]; }
    }

    return {
      size: best.size,
      modules: best.dark,
      version: ver,
      ec: ec,
      mask: bestMask
    };
  }

  /** 输出 SVG 字符串。quiet = 静区模块数（标准要求 4） */
  function toSvg(qr, opt) {
    opt = opt || {};
    var scale = opt.scale || 8;
    var quiet = opt.quiet === undefined ? 4 : opt.quiet;
    var dim = (qr.size + quiet * 2) * scale;
    var dark = opt.dark || '#000000';
    var light = opt.light || '#ffffff';
    var parts = [];

    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + dim + '" height="' + dim
      + '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges">');
    parts.push('<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>');
    // 一行一行的连续段，比一个小方块一个 <rect> 短很多
    for (var y = 0; y < qr.size; y++) {
      var x = 0;
      while (x < qr.size) {
        if (qr.modules[y * qr.size + x]) {
          var start = x;
          while (x < qr.size && qr.modules[y * qr.size + x]) x++;
          parts.push('<rect x="' + ((start + quiet) * scale) + '" y="' + ((y + quiet) * scale)
            + '" width="' + ((x - start) * scale) + '" height="' + scale + '" fill="' + dark + '"/>');
        } else {
          x++;
        }
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  /** 画到 canvas 上（比 SVG 更容易直接存成图片） */
  function toCanvas(qr, canvas, opt) {
    opt = opt || {};
    var quiet = opt.quiet === undefined ? 4 : opt.quiet;
    var modules = qr.size + quiet * 2;
    var px = opt.pixelSize || 640;
    var scale = Math.max(1, Math.floor(px / modules));
    var dim = modules * scale;

    canvas.width = dim;
    canvas.height = dim;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opt.light || '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opt.dark || '#000000';
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y * qr.size + x]) {
          ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
        }
      }
    }
    return canvas;
  }

  return {
    encode: encode,
    toSvg: toSvg,
    toCanvas: toCanvas,
    _internals: {
      utf8Bytes: utf8Bytes,
      rsEncode: rsEncode,
      buildCodewords: buildCodewords,
      addEcc: addEcc,
      BLOCKS: BLOCKS,
      dataCapacity: dataCapacity
    }
  };
});
