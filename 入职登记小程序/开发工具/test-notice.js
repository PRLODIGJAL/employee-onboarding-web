'use strict';
/* 验证：填写须知渲染 + 个人信息收集告知弹层可打开 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SINGLE = path.join('/Users/langzi/Desktop/入职登记小程序', '开发工具', '入职登记原型_单文件版.html');
const vc = new VirtualConsole();
vc.on('jsdomError', e => console.error('[jsdomError]', String(e.message || '').split('\n')[0]));

const dom = new JSDOM(fs.readFileSync(SINGLE, 'utf8'), {
  url: 'http://localhost/index.html#form',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.URL.createObjectURL = () => 'blob:x';
    w.URL.revokeObjectURL = () => {};
    // jsdom 没有 scrollIntoView，翻页时会抛错，这里补个空实现
    w.Element.prototype.scrollIntoView = function () {};
  }
});

const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

(async () => {
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  const doc = window.document;

  console.log('\n【1】第一屏出现填写须知');
  const notice = doc.querySelector('#formBody .notice');
  ok(!!notice, '须知区块存在');
  const lis = notice ? notice.querySelectorAll('.nt-list li') : [];
  ok(lis.length === 3, '三条要点，实际 ' + lis.length);
  ok(notice && /6–10 分钟/.test(notice.textContent), '包含耗时预期');
  ok(notice && /仅 HR 可见/.test(notice.textContent), '包含隐私提示');

  console.log('\n【2】点「个人信息收集告知」打开弹层');
  const link = doc.querySelector('[data-act="privacy"]');
  ok(!!link, '入口按钮存在');
  link.click();
  await wait(60);
  const sheet = doc.querySelector('#sheet');
  ok(sheet && !sheet.hidden, '弹层已打开');
  const pv = doc.querySelector('.pv-body');
  ok(!!pv, '告知正文渲染');
  const ps = pv ? pv.querySelectorAll('p') : [];
  ok(ps.length >= 7, '至少 7 段（谁在收/收什么/照片/保存期/权利/安全/联系方式），实际 ' + ps.length);
  ok(pv && /撤回同意/.test(pv.textContent), '写明撤回同意的权利');

  console.log('\n【3】关掉弹层 → 一键填案例 → 翻到第 2 步，不再重复须知');
  const closer = doc.querySelector('#sheetBox [data-close]');
  if (closer) closer.click();
  await wait(60);
  ok(sheet.hidden, '弹层已关闭');

  // 第 1 步必填项很多，用案例填满再翻页（真实路径）
  doc.querySelector('[data-act="demo"]').click();
  await wait(50);
  doc.querySelector('#demoNo').value = 'HR001';
  doc.querySelector('#demoPw').value = 'bmai2026';
  doc.querySelector('[data-sheet-act="demo-auth"]').click();
  await wait(60);
  doc.querySelectorAll('.demo-case')[0].click();
  await wait(60);
  doc.querySelector('#btnNext').click();
  await wait(80);

  ok(!doc.querySelector('#formBody .notice'), '第 2 步不重复显示须知');
  ok(/第 <b>2<\/b>/.test(doc.querySelector('#screenTop').innerHTML), '确实已进入第 2 步');

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
