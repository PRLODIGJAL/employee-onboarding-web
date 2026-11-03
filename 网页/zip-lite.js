/**
 * zip-lite.js —— 极简 zip 打包器（只存不压，STORE 模式）
 *
 * 为什么自己写：浏览器里没有内置的 zip API，而原型不能联网、不能引 CDN。
 * STORE 模式不压缩，所以不需要 deflate 实现，代码只有一百来行，任何解压工具都能开。
 *
 * 唯一需要小心的是中文文件名：必须置「通用位标记」第 11 位（0x0800），
 * 否则 macOS 的「归档实用工具」和 Windows 资源管理器都会显示乱码。
 *
 * 用法：
 *   var z = ZipLite.create();
 *   z.dir('张三/');
 *   z.text('张三/张三_登记表.docx', someStringOrBytes);
 *   z.bytes();   // Uint8Array
 *   z.blob();    // Blob，交给 a[download] 下载
 */
(function (root) {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(buf) {
    var c = -1;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0xD800 || c >= 0xE000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return new Uint8Array(out);
  }

  function toBytes(v) {
    if (v == null) return new Uint8Array(0);
    if (typeof v === 'string') return utf8(v);
    // 不用 instanceof：跨 iframe / 跨 realm 时构造器不是同一个，会误判
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (Object.prototype.toString.call(v) === '[object ArrayBuffer]') return new Uint8Array(v);
    if (Array.isArray(v)) return new Uint8Array(v);
    throw new Error('ZipLite: 不支持的数据类型 ' + Object.prototype.toString.call(v));
  }

  function dosTime(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  function hasNonAscii(s) {
    for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return true;
    return false;
  }

  function Writer() {
    this.files = [];
    this._names = {};
  }

  /** 加一个目录条目（结尾必须是 /），只是为了让解压后目录树更规整 */
  Writer.prototype.dir = function (name) {
    var n = name.replace(/\/+$/, '') + '/';
    if (this._names[n]) return this;
    this._names[n] = 1;
    this.files.push({ name: n, data: new Uint8Array(0) });
    return this;
  };

  Writer.prototype.add = function (name, data) {
    var n = String(name).replace(/^\/+/, '');
    if (!n || /\/$/.test(n)) return this.dir(n);
    if (this._names[n]) throw new Error('ZipLite: 重名 ' + n);
    this._names[n] = 1;
    this.files.push({ name: n, data: toBytes(data) });
    return this;
  };

  Writer.prototype.text = function (name, str) { return this.add(name, utf8(String(str))); };

  Writer.prototype.bytes = function () {
    var now = dosTime(new Date());
    var chunks = [];
    var central = [];
    var offset = 0;

    this.files.forEach(function (f) {
      var nameBytes = utf8(f.name);
      var isDir = /\/$/.test(f.name);
      var flags = 0;
      if (hasNonAscii(f.name)) flags |= 0x0800;   // UTF-8 文件名

      var crc = isDir ? 0 : crc32(f.data);
      var data = f.data || new Uint8Array(0);
      var size = data.length;

      var lh = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);            // version needed
      dv.setUint16(6, flags, true);
      dv.setUint16(8, 0, true);             // method = STORE
      dv.setUint16(10, now.time, true);
      dv.setUint16(12, now.date, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);         // compressed
      dv.setUint32(22, size, true);         // uncompressed
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);            // extra len
      lh.set(nameBytes, 30);

      var cd = new Uint8Array(46 + nameBytes.length);
      var cddv = new DataView(cd.buffer);
      cddv.setUint32(0, 0x02014b50, true);
      cddv.setUint16(4, 20, true);          // version made by
      cddv.setUint16(6, 20, true);          // version needed
      cddv.setUint16(8, flags, true);
      cddv.setUint16(10, 0, true);
      cddv.setUint16(12, now.time, true);
      cddv.setUint16(14, now.date, true);
      cddv.setUint32(16, crc, true);
      cddv.setUint32(20, size, true);
      cddv.setUint32(24, size, true);
      cddv.setUint16(28, nameBytes.length, true);
      cddv.setUint16(30, 0, true);          // extra
      cddv.setUint16(32, 0, true);          // comment
      cddv.setUint16(34, 0, true);          // disk
      cddv.setUint16(36, 0, true);          // internal attr
      cddv.setUint32(38, isDir ? 0x10 : 0x20, true);  // external attr
      cddv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);

      chunks.push(lh, data);
      central.push(cd);
      offset += lh.length + size;
    });

    var cdStart = offset;
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);

    var end = new Uint8Array(22);
    var edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, this.files.length, true);
    edv.setUint16(10, this.files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, cdStart, true);

    var all = chunks.concat(central, [end]);
    var total = all.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total);
    var p = 0;
    all.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  };

  Writer.prototype.blob = function () {
    return new Blob([this.bytes()], { type: 'application/zip' });
  };

  root.ZipLite = {
    create: function () { return new Writer(); },
    crc32: crc32,
    utf8: utf8
  };
})(typeof window !== 'undefined' ? window : globalThis);
