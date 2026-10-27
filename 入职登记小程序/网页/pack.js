/**
 * pack.js —— 把「一个人的资料」打成文件夹，再把所有人的文件夹打成一个 zip
 *
 * 目录结构（HR 解压后看到的，就是需求里说的十个文件夹）：
 *
 *   入职档案_2026-10-20/
 *   ├── 花名册导入_10人_2026-10-20.xlsx     ← 融合版花名册，在所有人文件夹之外
 *   ├── 打包说明.txt
 *   ├── 张明远/
 *   │   ├── 张明远_员工信息登记表.docx
 *   │   ├── 张明远_身份证正面.jpg
 *   │   └── 张明远_身份证反面.jpg
 *   ├── 李思睿/
 *   └── …
 *
 * 浏览器不给网页直接建本地文件夹的权限，所以「按名字分文件夹」只能靠 zip 实现：
 * 解压出来就是真文件夹，Windows / macOS 双击都行，不需要装任何东西。
 *
 * 只出 Word，不出 PDF。PDF 只有让 Word 自己转才准；在浏览器里按网格重画一遍，
 * 字距、行高、分页一定对不上，交出去是一份"看着像、其实不一样"的文件。
 * HR 手上有批量转 PDF 的工具，要归档时拿 Word 转一次就行，所以这里干脆不画。
 */
(function (root) {
  'use strict';

  function safe(name, fallback) {
    var s = String(name == null ? '' : name).trim()
      .replace(/[\\/:*?"<>|\r\n\t]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) s = fallback || '未命名';
    return s.slice(0, 40);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmt(iso) {
    var d = new Date(iso || Date.now());
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function day(iso) {
    var d = new Date(iso || Date.now());
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /**
   * rec.values 里只有基本字段，受教育情况 / 工作经历在 rec.tables 里。
   * 打印、花名册、Word 都要用合并后的这一份，否则那两栏永远是空的。
   */
  function fullValues(rec) {
    return Object.assign({}, (rec && rec.values) || {}, (rec && rec.tables) || {});
  }

  /** 记录 -> DocxLite 共用的模型 */
  function model(rec, opts) {
    opts = opts || {};
    return {
      title: opts.title || '员工信息登记表',
      meta: ['登记编号：' + (rec.formNo || '—'), '提交时间：' + fmt(rec.submittedAt)],
      header: '应聘职位：________________　　部门：________________　　工号：____________',
      blocks: root.APP.exporter.buildBlocks(fullValues(rec)),
      footer: '本表由员工本人填写；身份证原件已核验，正反面照片与本文件放在同一个文件夹内。'
    };
  }

  /** dataURL -> { ext, bytes } */
  function photoFile(dataUrl) {
    var m = /^data:image\/([a-z0-9.+-]+);base64,/i.exec(String(dataUrl || ''));
    if (!m) return null;
    var type = m[1].toLowerCase();
    var ext = type === 'jpeg' ? 'jpg' : (type === 'png' ? 'png' : type);
    var bin = root.atob(String(dataUrl).split(',')[1] || '');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xFF;
    return { ext: ext, bytes: bytes };
  }

  function blobBytes(blob) {
    return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  /**
   * @param {Array} records 提交记录数组
   * @param {object} opts   { withWord:boolean, withSingleXlsx:boolean }
   * @returns {Promise<{bytes:Uint8Array, name:string, report:object}>}
   */
  function build(records, opts) {
    opts = opts || {};
    var list = (records || []).filter(Boolean);
    if (!list.length) return Promise.reject(new Error('没有可导出的记录'));

    var withWord = opts.withWord !== false;
    var withSingle = opts.withSingleXlsx !== false;

    var batchDay = day(list[0].submittedAt);
    var rootDir = '入职档案_' + batchDay + '/';
    var zip = root.ZipLite.create();
    var used = {};
    var report = { persons: 0, word: 0, photos: 0, missingPhoto: [], wordFail: [] };
    var rosterName = '花名册导入_' + list.length + '人_' + batchDay + '.xlsx';

    zip.dir(rootDir);

    // 1. 融合版花名册（在所有人的文件夹之外）
    var rosterRows = list.map(function (r) { return root.APP.exporter.buildRosterRow(fullValues(r)); });

    var chain = blobBytes(root.XLSXLite.fromTemplate(rosterRows)).then(function (bytes) {
      zip.add(rootDir + rosterName, bytes);
    });

    // 2. 一个人一个文件夹（串行；每个人之间让出一个 tick，页面才画得动进度）
    list.forEach(function (rec, idx) {
      chain = chain.then(function () {
        return new Promise(function (r) { setTimeout(r, 0); });
      }).then(function () {
        var name = safe(rec.values && rec.values.realName, '未命名' + (idx + 1));
        var folder = name;
        if (used[folder]) {
          used[folder] += 1;
          folder = name + '(' + used[folder] + ')';
        } else {
          used[folder] = 1;
        }
        var dir = rootDir + folder + '/';
        zip.dir(dir);
        report.persons += 1;

        var base = folder + '_员工信息登记表';

        if (withWord) {
          try {
            // 走公司模板母版：版式和纸质表一模一样，黑白、可签字盖章
            zip.add(dir + base + '.docx', root.TemplateDocx.build(fullValues(rec), {
              noWork: !!(rec.values && rec.values.noWork)
            }));
            report.word += 1;
          } catch (e) {
            console.warn('[pack] Word 生成失败', folder, e);
            report.wordFail.push(folder);
          }
        }

        // 3. 身份证正反面（员工自己拍的图，原样放进去）
        var photos = (rec.idPhotos || {});
        [['front', '身份证正面'], ['back', '身份证反面']].forEach(function (p) {
          var f = photoFile(photos[p[0]]);
          if (!f) { report.missingPhoto.push(folder + ' · ' + p[1]); return; }
          zip.add(dir + folder + '_' + p[1] + '.' + f.ext, f.bytes);
          report.photos += 1;
        });

        // 4. 这个人的花名册单行，方便 HR 只补一个人
        if (!withSingle) return;
        return blobBytes(root.XLSXLite.fromTemplate([root.APP.exporter.buildRosterRow(fullValues(rec))]))
          .then(function (b) { zip.add(dir + folder + '_花名册单行.xlsx', b); })
          .catch(function (e) { console.warn('[pack] 单行花名册失败', folder, e); });
      });
    });

    return chain.then(function () {
      zip.text(rootDir + '打包说明.txt', readme(list.length, rosterName, report));
      return {
        bytes: zip.bytes(),
        name: rootDir.replace(/\/$/, '') + '.zip',
        report: report
      };
    });
  }

  function readme(n, rosterName, report) {
    var lines = [
      '员工入职资料包',
      '══════════════════════════',
      '',
      '一共 ' + n + ' 人，每人一个文件夹，文件夹名就是员工姓名。',
      '每个文件夹里有：',
      '  · 姓名_员工信息登记表.docx   —— 公司《员工信息登记表》原模板，',
      '                                 字已经填好、照片和手写签名都嵌在里面，',
      '                                 黑白可直接打印签字盖章',
      '  · 姓名_身份证正面.jpg / 身份证反面.jpg —— 员工本人拍照上传的原图',
      '  · 姓名_花名册单行.xlsx       —— 只需要补一个人时用这个',
      '',
      '文件夹外面那个 Excel：',
      '  ' + rosterName,
      '  这就是「融合版花名册」——拿公司模板当底板，一人一行，',
      '  12 个隐藏工作表、258 条下拉验证都在，可以直接导入摩卡。',
      '  导入前记得补工号（模板里只有姓名、工号两个必填列）。',
      '',
      '关于 PDF：',
      '  这个包里只放 Word，不放 PDF。网页里画出来的 PDF 和 Word 排版对不上，',
      '  与其给人一份"看着像、其实不一样"的文件，不如不给。需要归档时用',
      '  Word 打开另存为 PDF，或者用批量转换工具转一次，出来的就是标准版式。',
      '',
      '为什么不是在网页里直接建文件夹：',
      '  浏览器没有写本地目录的权限。zip 解压出来就是真文件夹，',
      '  Windows / macOS 双击都能开，不用装任何软件。',
      ''
    ];

    if (report.missingPhoto.length) {
      lines.push('缺少身份证照片 ' + report.missingPhoto.length + ' 张：');
      report.missingPhoto.forEach(function (x) { lines.push('  · ' + x); });
      lines.push('');
    }
    if (report.wordFail.length) {
      lines.push('Word 生成失败 ' + report.wordFail.length + ' 人：' + report.wordFail.join('、'));
      lines.push('');
    }
    lines.push('提示：包里是全体新员工的身份证照片，属于个人敏感信息，请勿外发。');
    return lines.join('\n');
  }

  root.Pack = { build: build, model: model, safe: safe, fullValues: fullValues };
})(typeof window !== 'undefined' ? window : globalThis);
