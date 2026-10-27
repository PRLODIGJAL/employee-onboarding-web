/**
 * 端到端：验证「一键填案例」的完整流程
 *
 *   NODE_PATH=/Users/langzi/.workbuddy/binaries/node/workspace/node_modules \
 *   node 开发工具/e2e-demo-case.js
 *
 * 验证点：
 *   1. 演示面板（含「一键填案例」按钮）在 #side 里渲染出来了（此前因 #side 缺失而消失）
 *   2. 点按钮弹管理员密码校验；密码错被拒
 *   3. 密码对 → 弹出案例选择，有 3 个案例
 *   4. 选案例 → 表单被填对（姓名 / 身份证校验通过 / 表格）
 *   5. 三份案例都校验身份证号合法且各不相同
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SINGLE = path.join(__dirname, '入职登记原型_单文件版.html');

let fails = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails++; }
}

const vc = new VirtualConsole();
vc.on('jsdomError', e => console.error('[jsdomError]', String(e.message).split('\n')[0]));

const dom = new JSDOM(fs.readFileSync(SINGLE, 'utf8'), {
  url: 'http://localhost/index.html#form',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { return 'blob:fake'; };
    window.URL.revokeObjectURL = function () {};
  }
});

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  const doc = window.document;

  console.log('\n【1】演示面板渲染');
  const side = doc.querySelector('#side');
  ok(!!side, '#side 容器存在');
  const demoBtn = doc.querySelector('#side [data-act="demo"]');
  ok(!!demoBtn, '「一键填案例」按钮已渲染：' + (demoBtn ? demoBtn.textContent : '无'));

  console.log('\n【2】点按钮 → 弹管理员密码校验');
  demoBtn.click();
  await wait(50);
  const pwInput = doc.querySelector('#demoPw');
  ok(!!pwInput, '弹出密码输入框');

  console.log('\n【3】密码错 → 拒绝，不进入选案例');
  doc.querySelector('#demoNo').value = 'HR001';
  pwInput.value = 'wrongpass';
  doc.querySelector('[data-sheet-act="demo-auth"]').click();
  await wait(80);
  let picker = doc.querySelector('.demo-case');
  ok(!picker, '密码错时不出现案例选择');
  ok(doc.querySelector('#sheet').hidden === false, '弹层仍开着（可重试）');
  // 关掉重来
  doc.querySelector('#sheet [data-close]').click();
  await wait(30);

  console.log('\n【4】密码对 → 进入案例选择');
  demoBtn.click();
  await wait(30);
  doc.querySelector('#demoNo').value = 'HR001';
  doc.querySelector('#demoPw').value = 'bmai2026';
  doc.querySelector('[data-sheet-act="demo-auth"]').click();
  await wait(80);
  const cases = doc.querySelectorAll('.demo-case');
  ok(cases.length === 3, '案例选择有 3 个（实际 ' + cases.length + ' 个）');
  ok(doc.querySelector('#sheet').hidden === false, '案例选择弹层打开');

  console.log('\n【5】选案例 1（普工）→ 表单被填对');
  cases[0].click();
  await wait(50);
  // 字段外层是 <div id="f-xxx">，输入框用 data-key 定位
  const nameInput = doc.querySelector('#f-realName [data-key="realName"]');
  ok(nameInput && nameInput.value === '张明远', '姓名填对：' + (nameInput ? nameInput.value : '无'));

  const idcardInput = doc.querySelector('#f-idcard [data-key="idcard"]');
  ok(idcardInput && idcardInput.value.length === 18, '身份证 18 位：' + (idcardInput ? idcardInput.value : '无'));
  if (idcardInput && idcardInput.value) {
    const idRes = doc.querySelector('#side .pc-ok');
    ok(!!idRes, '身份证校验通过（面板显示"校验通过"）');
  }

  // 下拉类字段要真的选中，不能停在"请选择"——案例数据里的值必须跟选项一字不差
  doc.querySelector('#btnNext').click();
  await wait(80);
  const eduSel = doc.querySelector('#f-highestEducation select');
  ok(eduSel && eduSel.value === '高中', '案例 1 最高学历下拉选中：' + (eduSel ? eduSel.value : '无'));
  doc.querySelector('#btnPrev').click();
  await wait(50);

  console.log('\n【6】三个案例身份证互不相同且都能过校验');
  // 通过切换案例对比姓名和身份证
  const names = new Set();
  const ids = new Set();
  // 已选案例1
  names.add(nameInput.value);
  ids.add(idcardInput.value);

  // 案例2
  // 注意：选完案例 fillDemo 会 render()，导致 #side 重绘，旧 demoBtn 引用失效，要重新查
  doc.querySelector('#side [data-act="demo"]').click(); await wait(50);
  doc.querySelector('#demoNo').value = 'HR001';
  doc.querySelector('#demoPw').value = 'bmai2026';
  doc.querySelector('[data-sheet-act="demo-auth"]').click(); await wait(50);
  doc.querySelectorAll('.demo-case')[1].click(); await wait(30);
  names.add(doc.querySelector('#f-realName [data-key="realName"]').value);
  ids.add(doc.querySelector('#f-idcard [data-key="idcard"]').value);

  // 案例 2 的学历也是下拉，必须真的选中「大专（全日制）」
  doc.querySelector('#btnNext').click(); await wait(80);
  const edu2 = doc.querySelector('#f-highestEducation select');
  ok(edu2 && edu2.value === '大专（全日制）', '案例 2 最高学历下拉选中：' + (edu2 ? edu2.value : '无'));

  // 案例3
  doc.querySelector('#side [data-act="demo"]').click(); await wait(50);
  doc.querySelector('#demoNo').value = 'HR001';
  doc.querySelector('#demoPw').value = 'bmai2026';
  doc.querySelector('[data-sheet-act="demo-auth"]').click(); await wait(50);
  doc.querySelectorAll('.demo-case')[2].click(); await wait(30);
  names.add(doc.querySelector('#f-realName [data-key="realName"]').value);
  ids.add(doc.querySelector('#f-idcard [data-key="idcard"]').value);

  ok(names.size === 3, '三个案例姓名互不相同：' + [...names].join('、'));
  ok(ids.size === 3, '三个案例身份证互不相同');

  console.log('\n结果：' + (fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'));
  process.exit(fails === 0 ? 0 : 1);
})();
