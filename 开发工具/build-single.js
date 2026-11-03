/**
 * 把 网页/ 下的源文件压成 1 个自包含 HTML
 *
 * 用途：发给别人时只发一个文件，不会出现"少了 js 打不开"的情况。
 * 用法：node 开发工具/build-single.js
 * 产物：开发工具/入职登记原型_单文件版.html
 */
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', '网页');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

// 内联进 <script> 前必须确认脚本里没有 </script> 字面量，否则标签会被提前闭合
// 不再内联 form-grid.js / pdf-lite.js：导出只做 Word，PDF 那套网格重画已经下掉了
const scripts = [
  'regions.js', 'roster-template-b64.js', 'form-template.js',
  'zip-lite.js', 'xlsx-lite.js', 'docx-lite.js', 'template-docx.js',
  'ocr-lite.js',
  'qr-lite.js', 'api.js', 'bundle.js', 'pack.js', 'app.js'
];
scripts.forEach(f => {
  const src = read(f);
  if (/<\/script/i.test(src)) {
    throw new Error(`${f} 里含有 "</script" 字面量，需要先转义，已中止`);
  }
});

const css = read('style.css').replace(/<\/style/gi, '<\\/style');
let html = read('index.html');

html = html.replace(
  /<link rel="stylesheet" href="style\.css">/,
  () => `<style>\n${css}\n</style>`
);

const tags = scripts.map(
  f => `<script src="${f}"></script>`
);
const inline = scripts.map(
  f => `<script>\n/* ===== ${f} ===== */\n${read(f)}\n</script>`
);

const missing = tags.filter(t => !html.includes(t));
if (missing.length) throw new Error('index.html 结构变了，没找到：' + missing.join(', '));

// 必须用函数形式：字符串替换会把 JS 里的 $1 / $2 当成反向引用
tags.forEach((t, i) => { html = html.replace(t, () => inline[i]); });

html = html.replace(
  '<title>员工信息登记 · 可点击原型</title>',
  '<title>员工信息登记 · 可点击原型（单文件版）</title>'
);

const out = path.join(__dirname, '入职登记原型_单文件版.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成 ' + out + '  (' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB)');

