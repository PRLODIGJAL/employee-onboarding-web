/**
 * ocr-lite.js —— 身份证号码识别（本地版，真识别）
 *
 * 和旧版的区别：旧版是演示桩，返回写死的假号码，所以"每次结果都不一样"。
 * 这一版是真的在读图片：定位号码行 → 切出 18 个字符 → 逐个比对 → 校验位验证。
 *
 * 特点：
 *   - 全程在本机做，照片不上传任何服务器（身份证是敏感信息）
 *   - 确定性算法：同一张图识别几次，结果完全一样
 *   - 识别不出来会明说"没识别出"，绝不用假号码糊弄
 *   - 校验位（GB 11643）用来验证和纠错：识别错了会先试着修，修不好才报失败
 *
 * 识别不出来的常见原因：照片太糊、反光、角度太斜、号码被手指挡住。
 * 这时手动填一下就行，界面上本来就能改。
 */
(function (root) {
  'use strict';

  /* ================= 校验位（GB 11643-1999） ================= */

  var WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var CODES = '10X98765432';

  function checkCode(first17) {
    if (!/^\d{17}$/.test(first17)) return '';
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += Number(first17.charAt(i)) * WEIGHTS[i];
    return CODES.charAt(sum % 11);
  }

  /** 号码结构是否说得通：17 位数字 + 校验位，生日是合法日期 */
  function plausible(id) {
    if (!/^\d{17}[\dXx]$/.test(id)) return false;
    var y = +id.slice(6, 10), m = +id.slice(10, 12), d = +id.slice(12, 14);
    if (y < 1900 || y > 2100) return false;
    if (m < 1 || m > 12) return false;
    var dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d >= 1 && d <= dim[m - 1];
  }

  /* ================= 模板（11 个字符：0-9 + X） ================= */

  var CHARS = '0123456789X';
  var TW = 22, TH = 34;          // 模板归一化尺寸
  var templates = null;

  /**
   * 用 canvas 画出 0-9 / X 的标准字样，作为比对模板。
   * 字体和真实身份证的号码字体不完全一样，但数字骨架足够接近，
   * 而且后面用灰度互相关比对，对笔画粗细不敏感。
   */
  function buildTemplates() {
    if (templates) return templates;
    var out = {};
    for (var i = 0; i < CHARS.length; i++) {
      var ch = CHARS.charAt(i);
      out[ch] = drawGlyph(ch);
    }
    templates = out;
    return out;
  }

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      return cv;
    }
    var C = root.__canvasCtor || (typeof require === 'function' && require('canvas'));
    return C.createCanvas(w, h);
  }

  function drawGlyph(ch) {
    var cv = makeCanvas(80, 120);
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 80, 120);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 92px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 40, 62);
    var d = ctx.getImageData(0, 0, 80, 120).data;
    return normalizePatch(d, 80, 120, 0, 0, 80, 120);
  }

  /**
   * 把一块像素归一化成 TW×TH 的灰度向量（0~1，1=墨色）。
   * 自动裁掉四周空白，再拉伸到模板尺寸——这样字号大小不影响比对。
   */
  function normalizePatch(data, w, h, x0, y0, x1, y1, step) {
    step = step || 1;
    // 找墨迹包围盒
    var minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (var y = y0; y < y1; y += step) {
      for (var x = x0; x < x1; x += step) {
        var i = (y * w + x) * 4;
        var lum = 255 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        if (lum > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;

    var bw = maxX - minX + 1, bh = maxY - minY + 1;
    var out = new Float32Array(TW * TH);
    for (var ty = 0; ty < TH; ty++) {
      for (var tx = 0; tx < TW; tx++) {
        var sx = minX + Math.floor(tx * bw / TW);
        var sy = minY + Math.floor(ty * bh / TH);
        var j = (sy * w + sx) * 4;
        var lum2 = 255 - (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
        out[ty * TW + tx] = Math.max(0, Math.min(1, lum2 / 255));
      }
    }
    return out;
  }

  /** 两个等长灰度向量的相似度：1 = 完全一样，0 = 毫无关系 */
  function similarity(a, b) {
    if (!a || !b) return 0;
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / Math.sqrt(na * nb);
  }

  /* ================= 预处理：灰度 + 二值化 ================= */

  function toGray(data, w, h) {
    var g = new Uint8Array(w * h);
    for (var i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) | 0;
    }
    return g;
  }

  /**
   * 第二种灰度：取 R/G/B 里最亮的那个通道。
   *
   * 为什么要多这一路：身份证底纹是浅蓝的，蓝通道最亮、红通道偏暗。
   * 用亮度加权算，底纹和号码的差距被拉平；取最大通道等于"按最亮的那个颜色看"，
   * 底纹更白、号码照旧黑，对比反而更强。反光、浅印也更容易救回来。
   */
  function toGrayMax(data, w, h) {
    var g = new Uint8Array(w * h);
    for (var i = 0, p = 0; i < g.length; i++, p += 4) {
      var a = data[p], b = data[p + 1], c = data[p + 2];
      g[i] = a > b ? (a > c ? a : c) : (b > c ? b : c);
    }
    return g;
  }

  /** Otsu 自动阈值——找一个把前景和背景分得最开的灰度值 */
  function otsu(gray) {
    var hist = new Int32Array(256);
    for (var i = 0; i < gray.length; i++) hist[gray[i]]++;
    var total = gray.length, sum = 0;
    for (var t = 0; t < 256; t++) sum += t * hist[t];
    var sumB = 0, wB = 0, best = 0, thresh = 127;
    for (var u = 0; u < 256; u++) {
      wB += hist[u];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += u * hist[u];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thresh = u; }
    }
    return thresh;
  }

  function binarize(gray, w, h) {
    var th = otsu(gray);
    var bin = new Uint8Array(w * h);
    for (var i = 0; i < gray.length; i++) bin[i] = gray[i] < th ? 1 : 0;
    return bin;
  }

  /**
   * 局部自适应二值化（Sauvola）。
   *
   * 全局一个阈值对付不了"一半亮一半暗"的照片——反光斑、阴影、渐变底纹都会让
   * 某一片整块糊掉。这里按小窗口算局部均值和标准差，每个像素跟"附近多黑"比，
   * 而不是跟"整张图多黑"比。积分图实现，一趟扫完，复杂度 O(w·h)。
   */
  function sauvola(gray, w, h, k) {
    k = (typeof k === 'number') ? k : 0.32;
    var R = 128;
    var win = Math.max(15, Math.round(h * 0.055) | 1);
    var r = Math.floor(win / 2);

    var iw = w + 1;
    var sum = new Float64Array(iw * (h + 1));
    var sqs = new Float64Array(iw * (h + 1));

    for (var y = 0; y < h; y++) {
      var rowSum = 0, rowSq = 0;
      for (var x = 0; x < w; x++) {
        var v = gray[y * w + x];
        rowSum += v; rowSq += v * v;
        sum[(y + 1) * iw + (x + 1)] = sum[y * iw + (x + 1)] + rowSum;
        sqs[(y + 1) * iw + (x + 1)] = sqs[y * iw + (x + 1)] + rowSq;
      }
    }

    var bin = new Uint8Array(w * h);
    for (var yy = 0; yy < h; yy++) {
      var y0 = Math.max(0, yy - r), y1 = Math.min(h - 1, yy + r);
      for (var xx = 0; xx < w; xx++) {
        var x0 = Math.max(0, xx - r), x1 = Math.min(w - 1, xx + r);
        var cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
        var s1 = sum[(y1 + 1) * iw + (x1 + 1)] - sum[y0 * iw + (x1 + 1)]
               - sum[(y1 + 1) * iw + x0] + sum[y0 * iw + x0];
        var s2 = sqs[(y1 + 1) * iw + (x1 + 1)] - sqs[y0 * iw + (x1 + 1)]
               - sqs[(y1 + 1) * iw + x0] + sqs[y0 * iw + x0];
        var mean = s1 / cnt;
        var vari = Math.max(0, s2 / cnt - mean * mean);
        var sd = Math.sqrt(vari);
        var th = mean * (1 + k * (sd / R - 1));
        bin[yy * w + xx] = gray[yy * w + xx] < th ? 1 : 0;
      }
    }
    return bin;
  }

  /* ================= 定位号码行 ================= */

  /**
   * 身份证号码的特征：一整行等间距的数字，通常在卡片下半部分。
   * 关键判据是**间距恒定**——18 个字符按固定节拍排开。
   * 这一点很重要：号码行左边往往还有"公民身份号码"这种标签，
   * 汉字和数字混在同一行里，只有靠间距才能把数字从标签里摘出来。
   */
  function locateNumberRow(bin, gray, w, h) {
    // 每行的前景像素数
    var prof = new Int32Array(h);
    for (var y = 0; y < h; y++) {
      var s = 0, base = y * w;
      for (var x = 0; x < w; x++) s += bin[base + x];
      prof[y] = s;
    }

    var yStart = Math.floor(h * 0.42);   // 号码不会出现在上半张脸的区域
    var yEnd = h - 2;
    var minH = Math.max(8, Math.round(h * 0.022));
    var maxH = Math.round(h * 0.10);

    // 找连续的前景行带
    var bands = [], inBand = false, b0 = 0;
    for (var y2 = yStart; y2 < yEnd; y2++) {
      var hot = prof[y2] > w * 0.012;
      if (hot && !inBand) { inBand = true; b0 = y2; }
      else if (!hot && inBand) {
        inBand = false;
        if (y2 - b0 >= minH && y2 - b0 <= maxH * 1.8) bands.push([b0, y2]);
      }
    }
    if (inBand && yEnd - b0 >= minH) bands.push([b0, yEnd]);

    // 每个候选带里滑窗找"18 个等间距字符"
    var best = null, bestScore = -1;
    for (var i = 0; i < bands.length; i++) {
      for (var trim = 0; trim <= 2; trim++) {
        var y0 = bands[i][0] + trim, y1 = bands[i][1] - trim;
        if (y1 - y0 < minH) continue;
        var segs = colSegments(bin, w, y0, y1);
        if (!segs || segs.length < 12) continue;
        var win = findNumberWindow(segs);
        if (win && win.score > bestScore) {
          bestScore = win.score;
          best = { y0: y0, y1: y1, segs: win.segs, score: win.score };
        }
      }
    }
    return bestScore >= 0.42 ? best : null;
  }

  /**
   * 在一段列投影切出的块里，找出"最像身份证号码"的连续 15~20 块。
   * 评分以**间距节拍**为主：真号码的相邻字符起点间距几乎是常数，
   * 汉字、装饰线、别的文字的间距是乱的。
   */
  function findNumberWindow(segs) {
    var n = segs.length;
    if (n < 12) return null;
    var best = null, bestScore = -1;

    for (var size = 15; size <= 20 && size <= n; size++) {
      for (var start = 0; start + size <= n; start++) {
        var win = segs.slice(start, start + size);
        var score = scoreWindow(win);
        if (score > bestScore) { bestScore = score; best = { segs: win, score: score }; }
      }
    }
    // 段数本身就不够 20 以上时，整段一起评一次（防止号码被标签挤掉后没窗口可选）
    if (n >= 12 && n <= 20) {
      var whole = scoreWindow(segs);
      if (whole > bestScore) best = { segs: segs, score: whole };
    }
    return best;
  }

  function scoreWindow(win) {
    var n = win.length;
    if (n < 2) return 0;

    // 节拍：相邻字符起点间距
    var pit = [];
    for (var i = 1; i < n; i++) pit.push(win[i].x0 - win[i - 1].x0);
    var pm = pit.reduce(function (a, b) { return a + b; }, 0) / pit.length;
    var pv = pit.reduce(function (a, b) { return a + (b - pm) * (b - pm); }, 0) / pit.length;
    var pcv = pm > 0.5 ? Math.sqrt(pv) / pm : 1;
    var pitchScore = Math.max(0, 1 - pcv * 3.2);

    // 段数：18 满分
    var cntScore = Math.max(0, 1 - Math.abs(n - 18) / 8);

    // 墨迹宽度不必相等（"1"天生窄），只要别一会儿粗一会儿细
    var widths = win.map(function (s) { return s.x1 - s.x0; });
    var wm = widths.reduce(function (a, b) { return a + b; }, 0) / n;
    var wv = widths.reduce(function (a, b) { return a + (b - wm) * (b - wm); }, 0) / n;
    var wcv = wm > 0.5 ? Math.sqrt(wv) / wm : 1;
    var widthScore = Math.max(0, 1 - Math.max(0, wcv - 0.32) * 1.6);

    return pitchScore * 0.55 + cntScore * 0.30 + widthScore * 0.15;
  }

  /** 列投影切字符 */
  function colSegments(bin, w, y0, y1) {
    var p = new Int32Array(w);
    for (var x = 0; x < w; x++) {
      var s = 0;
      for (var y = y0; y < y1; y++) s += bin[y * w + x];
      p[x] = s;
    }
    var segs = [], inSeg = false, x0 = 0;
    for (var x2 = 0; x2 < w; x2++) {
      if (p[x2] > 0 && !inSeg) { inSeg = true; x0 = x2; }
      else if (p[x2] === 0 && inSeg) {
        inSeg = false;
        if (x2 - x0 >= 2) segs.push({ x0: x0, x1: x2 });
      }
    }
    if (inSeg && w - x0 >= 2) segs.push({ x0: x0, x1: w });

    // 太窄的是噪点，丢掉
    if (!segs.length) return null;
    var widths = segs.map(function (s) { return s.x1 - s.x0; }).sort(function (a, b) { return a - b; });
    var med = widths[Math.floor(widths.length / 2)];
    segs = segs.filter(function (s) { return s.x1 - s.x0 >= med * 0.35; });

    // 粘连处理：太宽的块（像两个字连在一起）从中间找最浅处切开
    var merged = [];
    for (var i = 0; i < segs.length; i++) {
      var wd = segs[i].x1 - segs[i].x0;
      if (wd > med * 1.7 && wd < med * 3.2) {
        var mid = Math.floor((segs[i].x0 + segs[i].x1) / 2);
        var cut = findValley(p, segs[i].x0 + 2, segs[i].x1 - 2, mid);
        merged.push({ x0: segs[i].x0, x1: cut });
        merged.push({ x0: cut, x1: segs[i].x1 });
      } else {
        merged.push(segs[i]);
      }
    }
    return merged;
  }

  /** 在 [a,b] 范围内、靠近 mid 的地方找前景最浅的列 */
  function findValley(p, a, b, mid) {
    var bestX = mid, bestV = 1e9;
    var lo = a + Math.floor((b - a) * 0.3), hi = a + Math.floor((b - a) * 0.7);
    for (var x = lo; x <= hi; x++) {
      if (p[x] < bestV) { bestV = p[x]; bestX = x; }
    }
    return bestX;
  }

  /* ================= 逐字比对 ================= */

  /** 对一个字符块给出所有候选（按相似度降序） */
  function rankChar(data, w, h, seg, y0, y1) {
    var patch = normalizePatch(data, w, h, seg.x0, y0, seg.x1, y1);
    if (!patch) return [{ ch: '?', score: 0 }];
    var tpls = buildTemplates();
    var list = [];
    for (var i = 0; i < CHARS.length; i++) {
      var ch = CHARS.charAt(i);
      list.push({ ch: ch, score: similarity(patch, tpls[ch]) });
    }
    list.sort(function (a, b) { return b.score - a.score; });
    return list;
  }

  /* ================= 校验 + 纠错 ================= */

  /**
   * 用校验位和生日把识别结果"修"一遍。
   * 识别总有一两位看错，但身份证自带校验位（第 18 位），
   * 配合生日合法性，能把绝大多数错位纠正回来。
   *
   * 搜索顺序：直接通过 → 换 1 位 → 换 2 位 → 换 3 位。
   * 每次都优先动"最没把握"的位置，代价小的先试。
   */
  function correct(cands) {
    var best = cands.map(function (c) { return c[0]; });
    var rawStr = best.map(function (c) { return c.ch; }).join('').toUpperCase();

    /**
     * 生日段（第 7–14 位）的"改动上限"。
     *
     * 为什么单独管这一段：生日错一位，社保、公积金、劳动合同全跟着错，
     * 而且校验位有时会"碰巧"对上（实测过：19760419 被读成 19780219，校验位居然也过）。
     * 所以这一段的改动最多 1 位，改多了宁可报失败让人手输——错号比没识别更麻烦。
     */
    function birthdayRisk(chars) {
      var s = chars.map(function (c) { return c.ch; }).join('');
      var diff = 0;
      for (var i = 6; i < 14; i++) if (s.charAt(i) !== rawStr.charAt(i)) diff++;
      return diff > 1;
    }

    function tryBuild(chars) {
      var s = chars.map(function (c) { return c.ch; }).join('').toUpperCase();
      if (birthdayRisk(chars)) return null;
      return plausible(s) && checkCode(s.slice(0, 17)) === s.charAt(17) ? s : null;
    }

    var hit = tryBuild(best);
    if (hit) return { id: hit, fixed: 0 };

    // 不确定性：第一名分数越低、第二名咬得越紧，越没看清。最没把握的排前面
    var unc = best.map(function (c, i) {
      var second = cands[i][1] ? cands[i][1].score : 0;
      var u = (1 - c.score) + 0.5 * Math.max(0, 1 - (c.score - second) * 2.5);
      return { i: i, u: u };
    }).sort(function (a, b) { return b.u - a.u; });

    function alt(i) {
      var out = [];
      for (var k = 1; k < Math.min(3, cands[i].length); k++) out.push(cands[i][k]);
      return out;
    }

    // 换 1 位：从最没把握的位置开始试
    for (var a = 0; a < unc.length; a++) {
      var i1 = unc[a].i;
      var alts = alt(i1);
      for (var x = 0; x < alts.length; x++) {
        var t1 = best.slice();
        t1[i1] = alts[x];
        hit = tryBuild(t1);
        if (hit) return { id: hit, fixed: 1 };
      }
    }

    // 换 2 位：在最没把握的 8 个位置里组合
    var pool = unc.slice(0, 8).map(function (o) { return o.i; });
    for (var p = 0; p < pool.length; p++) {
      for (var q = p + 1; q < pool.length; q++) {
        var A = alt(pool[p]), B = alt(pool[q]);
        for (var xi = 0; xi < A.length; xi++) {
          for (var yi = 0; yi < B.length; yi++) {
            var t2 = best.slice();
            t2[pool[p]] = A[xi];
            t2[pool[q]] = B[yi];
            hit = tryBuild(t2);
            if (hit) return { id: hit, fixed: 2 };
          }
        }
      }
    }
    // 换 3 位：只在最没把握的 5 个位置里组合（10 组 × 8 种替换 ≈ 80 次，代价可控）
    var tiny = unc.slice(0, 5).map(function (o) { return o.i; });
    for (var r1 = 0; r1 < tiny.length; r1++) {
      for (var r2 = r1 + 1; r2 < tiny.length; r2++) {
        for (var r3 = r2 + 1; r3 < tiny.length; r3++) {
          var A3 = alt(tiny[r1]), B3 = alt(tiny[r2]), C3 = alt(tiny[r3]);
          for (var ai = 0; ai < A3.length; ai++) {
            for (var bi = 0; bi < B3.length; bi++) {
              for (var ci = 0; ci < C3.length; ci++) {
                var t3 = best.slice();
                t3[tiny[r1]] = A3[ai];
                t3[tiny[r2]] = B3[bi];
                t3[tiny[r3]] = C3[ci];
                hit = tryBuild(t3);
                if (hit) return { id: hit, fixed: 3 };
              }
            }
          }
        }
      }
    }
    // 到这里还不对，多半是照片本身糊了——宁可让手输，也不硬猜
    return null;
  }

  /* ================= 主流程 ================= */

  /** 在给定二值图上跑完整流程（不依赖 canvas，方便测试） */
  function runPipeline(data, gray, w, h, opts, bin) {
    bin = bin || binarize(gray, w, h);
    var loc = locateNumberRow(bin, gray, w, h);
    if (!loc) {
      return { ok: false, provider: 'local', mock: false, stage: 'locate',
        message: '没找到号码那一行——照片太糊、太暗或角度太斜的话，手输更省事' };
    }

    var segs = loc.segs;
    // 切出 18 个是最好的；少了就按宽度补不了，直接按已有顺序比对再纠错
    if (segs.length < 14) {
      return { ok: false, provider: 'local', mock: false, stage: 'segment',
        message: '号码被拍糊了，切不出完整的字——手输或重拍一张' };
    }
    if (segs.length > 22) {
      return { ok: false, provider: 'local', mock: false, stage: 'segment',
        message: '画面里干扰太多，没锁定号码——重拍一张，让号码填满横向画面' };
    }

    // 超过 18 段时，优先丢掉最不像数字的段；不足 18 段时保留原样，交给纠错
    var ranked = segs.map(function (seg) {
      var r = rankChar(data, w, h, seg, loc.y0, loc.y1);
      return { seg: seg, list: r, top: r[0].score };
    });
    if (ranked.length > 18) {
      ranked.sort(function (a, b) { return b.top - a.top; });
      ranked = ranked.slice(0, 18);
      ranked.sort(function (a, b) { return a.seg.x0 - b.seg.x0; });
    }

    var cands = ranked.map(function (r) { return r.list; });
    var avg = ranked.reduce(function (a, r) { return a + r.top; }, 0) / (ranked.length || 1);

    // 少于 18 段时位置就对不齐了，只有恰好 18 段才敢纠错
    var result = null;
    if (ranked.length === 18) result = correct(cands);
    if (!result) {
      var raw = cands.map(function (c) { return c[0].ch; }).join('').toUpperCase();
      if (raw.length === 18 && plausible(raw) && checkCode(raw.slice(0, 17)) === raw.charAt(17)) {
        result = { id: raw, fixed: 0 };
      }
    }

    if (!result) {
      return {
        ok: false, provider: 'local', mock: false, stage: 'verify',
        message: '看清了几位，但号码对不上校验位——手输一下更稳（顺手核对下有没有拍反）'
      };
    }

    // 置信度：比对相似度 × 有没有修过
    var conf = Math.max(0.5, Math.min(0.99, avg * (result.fixed ? 0.88 : 1)));
    return {
      ok: true,
      idcard: result.id,
      provider: 'local',
      mock: false,
      confidence: conf,
      fixed: result.fixed,
      message: result.fixed
        ? '已识别 ' + result.id + '（有 ' + result.fixed + ' 位是推算出来的，麻烦核对下）'
        : '已识别 ' + result.id + '，可以直接改'
    };
  }

  /**
   * 多路读法 + 交叉验证。
   *
   * 同一张照片，用四种预处理各读一遍：
   *   亮度灰度 × 全局阈值    （最常规，清晰照最准）
   *   最大通道 × 全局阈值    （压浅蓝底纹）
   *   亮度灰度 × 局部阈值    （抗反光、抗明暗不均）
   *   最大通道 × 局部阈值    （两个优点叠加）
   *
   * 几路都读出同一个号，才算"看清了"；读出两个不同的号，说明这张照片本身不稳，
   * 这时候宁可不给结果——给一个错号比让员工手输麻烦得多。
   */
  function stageRank(stage) {
    return { conflict: 4, verify: 3, segment: 2, locate: 1 }[stage] || 0;
  }

  function readVariants(px, opts) {
    var w = px.w, h = px.h;
    var luma = toGray(px.data, w, h);
    var maxc = toGrayMax(px.data, w, h);

    var plans = [
      { tag: 'lum+otsu', gray: luma, bin: binarize(luma, w, h) },
      { tag: 'max+otsu', gray: maxc, bin: binarize(maxc, w, h) },
      { tag: 'lum+sauvola', gray: luma, bin: sauvola(luma, w, h) },
      { tag: 'max+sauvola', gray: maxc, bin: sauvola(maxc, w, h) }
    ];

    var oks = [], closest = null;
    for (var i = 0; i < plans.length; i++) {
      var r = runPipeline(px.data, plans[i].gray, w, h, opts, plans[i].bin);
      r.variant = plans[i].tag;
      if (r.ok) oks.push(r);
      else if (!closest || stageRank(r.stage) > stageRank(closest.stage)) closest = r;
    }

    if (!oks.length) return closest;

    // 按号码投票
    var votes = {};
    oks.forEach(function (r) { votes[r.idcard] = (votes[r.idcard] || 0) + 1; });
    var ids = Object.keys(votes);

    if (ids.length === 1) {
      var win = oks[0];
      win.votes = votes[ids[0]];
      win.confidence = Math.min(0.99, win.confidence + 0.04 * (win.votes - 1));
      return win;
    }

    // 几路读法打架：不猜，交给人
    return {
      ok: false, provider: 'local', mock: false, stage: 'conflict',
      message: '这张照片不同读法结果不一致（' + ids.join(' / ') + '），怕给错号——手输核对一下'
    };
  }

  /** 轻微旋转再试一次——手持拍照多少有点斜 */
  function rotatePixels(data, w, h, deg) {
    var rad = deg * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var out = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var sx = Math.round((x - w / 2) * cos + (y - h / 2) * sin + w / 2);
        var sy = Math.round(-(x - w / 2) * sin + (y - h / 2) * cos + h / 2);
        var di = (y * w + x) * 4;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
          out[di] = out[di + 1] = out[di + 2] = 255; out[di + 3] = 255;
        } else {
          var si = (sy * w + sx) * 4;
          out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = 255;
        }
      }
    }
    return out;
  }

  /**
   * 服务端识别（Tesseract）。
   *
   * 返回 null 表示「这条路走不通，交给本机那套」——比如双击 html 打开没后端、
   * 服务器没装 Tesseract、被限流。返回结果对象则表示服务端已经有明确结论，
   * 这时不再跑本机算法：它比服务端弱，重跑一遍只会让员工多等几秒。
   */
  function recognizeRemote(dataUrl, opts) {
    var api = root.Api;
    if (!api || typeof api.ocr !== 'function') return Promise.resolve(null);

    return api.ocr(dataUrl).then(function (r) {
      if (!r) return null;
      if (r.offline) return null;              // 连不上服务器
      if (r.provider === 'none') return null;  // 服务器没装引擎
      if (r.code === 'TOO_MANY') return null;  // 被限流，本机识别不消耗服务器资源
      if (r.code === 'BAD_BODY') return null;

      return {
        ok: !!r.ok,
        idcard: r.idcard || '',
        provider: 'tesseract',
        mock: false,
        confidence: r.confidence || 0,
        suspect: r.suspect || '',
        message: r.message || (r.ok ? '已识别 ' + r.idcard + '，可以直接改' : '没读出号码，手输一下更快')
      };
    }, function () {
      return null;
    });
  }

  /**
   * @param {string} dataUrl 图片 dataURL
   * @param {object} opts    { side: 'front'|'back', remote?: false 强制用本机识别 }
   * @returns {Promise<{ok:boolean, idcard?:string, provider:string, mock:boolean, message?:string}>}
   */
  function recognize(dataUrl, opts) {
    opts = opts || {};
    if (!dataUrl) {
      return Promise.resolve({ ok: false, provider: 'local', mock: false, message: '还没有照片' });
    }
    if (opts.side === 'back') {
      return Promise.resolve({ ok: false, provider: 'local', mock: false, message: '国徽面没有号码，已存档' });
    }
    if (opts.remote === false) return recognizeLocal(dataUrl, opts);

    return recognizeRemote(dataUrl, opts).then(function (r) {
      return r || recognizeLocal(dataUrl, opts);
    });
  }

  /** 本机识别（模板匹配）。服务端不可用时的兜底，也是没联网时的唯一办法 */
  function recognizeLocal(dataUrl, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!dataUrl) {
        resolve({ ok: false, provider: 'local', mock: false, message: '还没有照片' });
        return;
      }
      if (opts.side === 'back') {
        resolve({ ok: false, provider: 'local', mock: false, message: '国徽面没有号码，已存档' });
        return;
      }

      decode(dataUrl).then(function (px) {
        if (!px) {
          resolve({ ok: false, provider: 'local', mock: false, message: '这张图读不出来，换一张试试' });
          return;
        }
        // 图太小，数字糊成一团，识别不了
        if (px.w < 320 || px.h < 200) {
          resolve({ ok: false, provider: 'local', mock: false,
            message: '图片分辨率太低，号码认不清——用原图或重拍一张' });
          return;
        }

        var best = readVariants(px, opts);

        // 四种读法都没成，再轻微转几个角度重来（手持拍照常有小角度倾斜）
        if (!best.ok && opts.rotate !== false) {
          var angles = [-4, 4, -2, 2, -6, 6];
          for (var i = 0; i < angles.length; i++) {
            var rot = rotatePixels(px.data, px.w, px.h, angles[i]);
            var r = readVariants({ data: rot, w: px.w, h: px.h }, opts);
            if (r.ok) { best = r; break; }
            if (stageRank(r.stage) > stageRank(best.stage)) best = r;
          }
        }

        // 绝不返回假号码：识别不出就是识别不出
        resolve(best);
      }, function () {
        resolve({ ok: false, provider: 'local', mock: false, message: '这张图读不出来，换一张试试' });
      });
    });
  }

  /** dataURL → 像素。浏览器用 Image，Node 用 node-canvas */
  function decode(dataUrl) {
    return new Promise(function (resolve, reject) {
      if (typeof document !== 'undefined') {
        var img = new Image();
        img.onload = function () {
          try {
            var cv = document.createElement('canvas');
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            var ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0);
            var d = ctx.getImageData(0, 0, cv.width, cv.height);
            resolve({ data: d.data, w: cv.width, h: cv.height });
          } catch (e) { reject(e); }
        };
        img.onerror = reject;
        img.src = dataUrl;
      } else {
        var C = root.__canvasCtor || (typeof require === 'function' && require('canvas'));
        C.loadImage(dataUrl).then(function (img) {
          var cv = C.createCanvas(img.width, img.height);
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          var d = ctx.getImageData(0, 0, cv.width, cv.height);
          resolve({ data: d.data, w: cv.width, h: cv.height });
        }, reject);
      }
    });
  }

  root.OcrLite = {
    recognize: recognize,
    recognizeLocal: recognizeLocal,
    recognizeRemote: recognizeRemote,
    checkCode: checkCode,
    plausible: plausible,
    _runPipeline: runPipeline,
    _toGray: toGray,
    _toGrayMax: toGrayMax,
    _binarize: binarize,
    _sauvola: sauvola,
    _readVariants: readVariants,
    _locate: locateNumberRow,
    _rankChar: rankChar,
    _correct: correct,
    _buildTemplates: buildTemplates,
    CHARS: CHARS
  };
})(typeof window !== 'undefined' ? window : globalThis);
