/**
 * 端到端：在 jsdom 里真开一遍网页（单文件版），把 zip / docx / pdf 都点出来落盘
 *
 *   NODE_PATH=/Users/langzi/.workbuddy/binaries/node/workspace/node_modules \
 *   node e2e-web.js
 *
 * 用单文件版跑（它就是 index.html + 所有 js 内联的产物），
 * 这样 jsdom 不用去 file:// 抓 script，localStorage / sessionStorage 也能用。
 *
 * 产物：/tmp/e2e_pkg.zip、/tmp/e2e_word.docx、/tmp/e2e_pdf.pdf、/tmp/e2e_bulk.zip
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createCanvas } = require('canvas');

const SINGLE = path.join(__dirname, '入职登记原型_单文件版.html');

const captured = {};
let current = null;
let fails = 0;

function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails++; }
}

const vc = new VirtualConsole();
vc.on('jsdomError', e => console.error('[jsdomError]', String(e.message).split('\n')[0]));

const dom = new JSDOM(fs.readFileSync(SINGLE, 'utf8'), {
  url: 'http://localhost/index.html#export',   // 非 opaque origin，存储才可用
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function (blob) { current = blob; return 'blob:fake'; };
    window.URL.revokeObjectURL = function () {};

    window.HTMLAnchorElement.prototype.click = function () {
      if (current) captured[this.download] = current;
    };
  }
});

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  const doc = window.document;

  // jsdom 没有 canvas，用 node-canvas 顶上（只有 PDF 需要）
  window.PdfLite.setCanvasFactory((w, h) => createCanvas(w, h));

  console.log('\n【1】导出结果页');
  const title = doc.querySelector('#viewResult h1');
  ok(!!title, '#export 锚点进入结果页：' + (title ? title.textContent : '无'));
  ok(doc.querySelectorAll('#viewResult .sheet-tab').length === 4, '4 个 tab');

  // 切到「文件夹结构」
  doc.querySelector('[data-sheet="3"]').click();
  const treeRows = doc.querySelectorAll('#viewResult .tree .tree-row');
  ok(treeRows.length >= 5, '文件夹结构渲染出 ' + treeRows.length + ' 行');
  const treeText = Array.from(treeRows).map(r => r.textContent.replace(/^[^\u4e00-\u9fa5A-Za-z]+/, ''));
  ok(treeText.some(t => /\.docx/.test(t)), '树里有 .docx');
  ok(treeText.some(t => /\.pdf/.test(t)), '树里有 .pdf');
  ok(treeText.some(t => /身份证正面/.test(t)), '树里有身份证正面');
  ok(doc.querySelectorAll('#viewResult .idpreview img').length >= 1,
    '身份证缩略图 ' + doc.querySelectorAll('#viewResult .idpreview img').length + ' 张');

  console.log('\n【2】单个打包（zip）');
  doc.querySelector('[data-act="pkg"]').click();
  await wait(1200);
  let name = Object.keys(captured).find(n => /\.zip$/.test(n));
  if (!name) throw new Error('没捕获到 zip');
  fs.writeFileSync('/tmp/e2e_pkg.zip', Buffer.from(await captured[name].arrayBuffer()));
  console.log('  · ' + name + '  ->  /tmp/e2e_pkg.zip');

  console.log('\n【3】单独下 Word / PDF');
  doc.querySelector('[data-act="word"]').click();
  await wait(300);
  doc.querySelector('[data-act="pdf"]').click();
  await wait(1500);
  const wName = Object.keys(captured).find(n => /\.docx$/.test(n));
  const pName = Object.keys(captured).find(n => /\.pdf$/.test(n));
  ok(!!wName, 'Word: ' + wName);
  ok(!!pName, 'PDF: ' + pName);
  if (wName) fs.writeFileSync('/tmp/e2e_word.docx', Buffer.from(await captured[wName].arrayBuffer()));
  if (pName) fs.writeFileSync('/tmp/e2e_pdf.pdf', Buffer.from(await captured[pName].arrayBuffer()));

  console.log('\n【4】HR 登录');
  doc.querySelector('.tab[data-view="hr"]').click();
  await wait(150);
  ok(!!doc.querySelector('#viewHr [data-act="logout"]'), '#export 场景已登录，直接进 HR 后台');

  doc.querySelector('#viewHr [data-act="logout"]').click();
  await wait(100);
  doc.querySelector('.tab[data-view="hr"]').click();
  await wait(150);
  ok(!doc.querySelector('#viewLogin').hidden, '退出后点 HR 页 → 出现登录页');
  ok(!!doc.querySelector('#hrNo') && !!doc.querySelector('#hrPwd'), '有工号 / 密码输入框');

  // 先输错
  doc.querySelector('#hrNo').value = 'HR001';
  doc.querySelector('#hrPwd').value = 'wrong';
  doc.querySelector('#hrLogin').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(120);
  const err = doc.querySelector('.login-err');
  ok(!!err && /不对/.test(err.textContent), '密码错 → ' + (err ? err.textContent : '无提示'));

  // 再输对
  doc.querySelector('#hrNo').value = 'HR001';
  doc.querySelector('#hrPwd').value = 'bmai2026';
  doc.querySelector('#hrLogin').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(200);
  ok(!doc.querySelector('#viewHr').hidden, '密码对 → 进入 HR 后台');
  ok(doc.querySelectorAll('#viewHr tbody tr').length === 3, '列表 ' + doc.querySelectorAll('#viewHr tbody tr').length + ' 行');

  console.log('\n【5】勾选 2 个人导出');
  const boxes = doc.querySelectorAll('#viewHr .rowck');
  ok(boxes.length === 3, '每行都有勾选框：' + boxes.length);

  boxes[0].checked = true;
  boxes[0].dispatchEvent(new window.Event('change', { bubbles: true }));
  boxes[1].checked = true;
  boxes[1].dispatchEvent(new window.Event('change', { bubbles: true }));

  const selBtn = doc.querySelector('#viewHr [data-act="sel"]');
  ok(/2 人/.test(selBtn.textContent) && !selBtn.disabled,
    '按钮跟着变：' + selBtn.textContent.trim());
  ok(doc.querySelectorAll('#viewHr tr.is-sel').length === 2, '选中行有高亮');

  current = null;
  selBtn.click();
  await wait(3500);
  const selName = Object.keys(captured).find(n => /\.zip$/.test(n));
  ok(!!selName, '选中导出 zip：' + selName);
  if (selName) fs.writeFileSync('/tmp/e2e_sel2.zip', Buffer.from(await captured[selName].arrayBuffer()));

  // 全选 → 再取消，按钮计数要跟着归零
  const ckAll = doc.querySelector('#ckAll');
  ckAll.checked = true;
  ckAll.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(/3 人/.test(selBtn.textContent), '全选后：' + selBtn.textContent.trim());
  ckAll.checked = false;
  ckAll.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok(selBtn.disabled && /0 人/.test(selBtn.textContent), '取消全选后按钮禁用');

  console.log('\n【6】填写链接 / 二维码');
  doc.querySelector('#viewHr [data-act="qr"]').click();
  await wait(200);
  ok(!doc.getElementById('sheet').hidden, '弹层打开了');
  ok(!!doc.querySelector('#sheetBox svg'), '二维码渲染成 SVG');
  const urlInput = doc.getElementById('fillUrlInput');
  ok(!!urlInput && /^https?:\/\/.+/.test(urlInput.value), '链接：' + (urlInput ? urlInput.value : '无'));
  doc.querySelector('#sheetBox [data-close]').click();
  await wait(100);
  ok(doc.getElementById('sheet').hidden, '能关掉');

  console.log('\n【7】全部打包');
  current = null;
  doc.querySelector('#viewHr [data-act="all"]').click();
  await wait(3500);
  name = Object.keys(captured).find(n => /\.zip$/.test(n) && !/张明远/.test(n));
  ok(!!name, '批量 zip: ' + name);
  if (name) {
    fs.writeFileSync('/tmp/e2e_bulk.zip', Buffer.from(await captured[name].arrayBuffer()));
    console.log('  · ' + name + '  ->  /tmp/e2e_bulk.zip');
  }

  console.log('\ntoast：' + doc.getElementById('toast').textContent);
  console.log(fails ? '\n有 ' + fails + ' 项没通过' : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
