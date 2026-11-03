/**
 * 员工交完表看到的那一屏（结果页）
 *
 *   NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules \
 *   node 开发工具/test-employee-result.js
 *
 * 守住一条边界：**员工只该看到"自己填的对不对"，导出物是 HR 的事。**
 * 打包下载、花名册、字段对照、文件夹结构出现在员工页上就算失败。
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
  url: 'http://localhost/index.html#demo',   // #demo：一键填好案例 1
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc
});

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  const doc = window.document;

  console.log('\n【1】员工：一路点到最后一步并提交');
  for (let i = 0; i < 6; i++) {
    const next = doc.querySelector('#btnNext');
    if (!next) break;
    next.click();
    await wait(60);
  }
  const submitBtn = doc.querySelector('#btnSubmit');
  ok(!!submitBtn, '到了最后一步，有「提交并生成表格」');
  submitBtn.click();
  await wait(250);

  const result = doc.querySelector('#viewResult');
  ok(!result.hidden, '提交后进入结果页');
  ok(/登记表已提交/.test(result.querySelector('h1').textContent),
    '标题是「登记表已提交」：' + result.querySelector('h1').textContent);
  ok(/登记编号/.test(result.textContent), '给了登记编号');
  ok(/已提交|只存在这台设备|正在上传/.test(result.textContent), '说清了提交去了哪儿');

  console.log('\n【2】员工页上不该有的东西');
  ok(result.querySelectorAll('.sheet-tab').length === 0, '没有 4 个导出 tab');
  ok(!/打包/.test(result.textContent), '没有「打包下载」');
  ok(!/花名册/.test(result.textContent), '没有「花名册」');
  ok(!/文件夹结构/.test(result.textContent), '没有「文件夹结构」');
  ok(!/字段对照/.test(result.textContent), '没有「字段对照」');
  ok(!result.querySelector('[data-act="pkg"]'), '没有任何打包按钮');
  ok(!result.querySelector('.tree'), '没有文件夹树');

  console.log('\n【3】员工页上该有的东西：整份登记表');
  const rows = result.querySelectorAll('.tbl.doc tr');
  const groups = Array.from(result.querySelectorAll('.doc-group')).map(x => x.textContent);
  ok(rows.length > 40, '登记表逐行展开：' + rows.length + ' 行');
  ok(groups.length >= 4, '按段分组：' + groups.join(' / '));
  ok(/张明远/.test(result.textContent), '姓名在表里');
  ok(/基本信息/.test(result.textContent) && /联系方式/.test(result.textContent), '关键分组都在');
  ok(!!result.querySelector('[data-act="again"]'), '有「重新填一份」按钮');

  console.log('\n【4】点「重新填一份」：回到第 1 步，且是一张空表');
  result.querySelector('[data-act="again"]').click();
  await wait(120);
  ok(!doc.querySelector('#viewForm').hidden, '回到填写页');
  const nameInput = doc.querySelector('#f-realName [data-key="realName"]');
  ok(nameInput && nameInput.value === '', '姓名已清空：' + (nameInput ? '「' + nameInput.value + '」' : '无'));
  ok(/第 1 步|1\s*\/\s*6/.test(doc.querySelector('#screenTop').textContent) ||
    !!doc.querySelector('#btnPrev[disabled]'), '停在第 1 步（上一步是禁用的）');

  console.log('\n【5】同一台机器上，HR 点「查看」还是要看到完整版');
  doc.querySelector('.tab[data-view="hr"]').click();
  await wait(200);
  doc.querySelector('#hrNo').value = 'HR001';
  doc.querySelector('#hrPwd').value = 'bmai2026';
  doc.querySelector('#hrLogin').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(300);
  const viewBtn = doc.querySelector('#viewHr [data-act="view"]');
  ok(!!viewBtn, 'HR 后台列表里有「查看」');
  viewBtn.click();
  await wait(200);
  const hrResult = doc.querySelector('#viewResult');
  ok(hrResult.querySelectorAll('.sheet-tab').length === 4, 'HR 版仍是 4 个 tab');
  ok(!!hrResult.querySelector('[data-act="pkg"]'), 'HR 版有「打包下载」');
  ok(!!hrResult.querySelector('.tree'), 'HR 版有文件夹结构');
  ok(!!hrResult.querySelector('[data-act="back"]'), 'HR 版能「返回列表」');

  console.log(fails ? '\n有 ' + fails + ' 项没通过' : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
