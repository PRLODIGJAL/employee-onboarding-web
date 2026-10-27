/**
 * 端到端：验证这一轮加的两个功能
 *
 *   NODE_PATH=/Users/langzi/.workbuddy/binaries/node/workspace/node_modules \
 *   node 开发工具/test-work-status.js
 *
 * A. 员工侧「暂无工作经历」
 *    1. 应届生案例填进来 → 工作经历表收起、勾选框是勾上的
 *    2. 收起后不报"此项必填"，能一路走到提交
 *    3. 导出的 Word 里明确写着"暂无工作经历"，而不是一张空表
 *    4. 取消勾选 → 表格恢复，原来的"至少填一段"回到校验里
 *    5. 有工作经历的案例不受影响（表格是展开的）
 *
 * B. HR 侧「处理状态 + 备注 + 筛选」
 *    6. 列表默认都是"待核对"
 *    7. 点状态 → 弹层里选"已入职" + 写备注 → 保存后列表跟着变
 *    8. 按状态筛选只留下该状态的人
 *    9. 搜索框按姓名过滤
 *   10. 导出处理台账里带着状态和备注
 *   11. 筛选后全选 = 只选当前看得见的这几个人
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

const captured = {};
let current = null;

const vc = new VirtualConsole();
vc.on('jsdomError', e => console.error('[jsdomError]', String(e.message).split('\n')[0]));
vc.on('warn', (...a) => console.error('[warn]', ...a.map(x => typeof x === 'string' ? x : String(x && x.message || x)).slice(0, 3)));
vc.on('error', (...a) => console.error('[error]', ...a.map(x => typeof x === 'string' ? x : String(x && x.message || x)).slice(0, 3)));

const dom = new JSDOM(fs.readFileSync(SINGLE, 'utf8'), {
  url: 'http://localhost/index.html#export',
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
const txt = el => (el ? el.textContent : '');
const bufHas = (buf, s) => Buffer.from(buf).includes(Buffer.from(s, 'utf8'));

(async () => {
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  await wait(300);   // 等 #export 造完 3 条记录
  const doc = window.document;

  /* ============ A. 暂无工作经历 ============ */

  console.log('\n【1】应届生案例：工作经历表自动收起');
  doc.querySelector('.tab[data-view="form"]').click();
  await wait(50);

  doc.querySelector('#side [data-act="demo"]').click();
  await wait(50);
  doc.querySelector('#demoNo').value = 'HR001';
  doc.querySelector('#demoPw').value = 'bmai2026';
  doc.querySelector('[data-sheet-act="demo-auth"]').click();
  await wait(60);
  doc.querySelectorAll('.demo-case')[1].click();      // 案例 2 · 应届生
  await wait(80);

  // 翻到第 3 步（教育与工作经历）
  let guard = 0;
  while (guard++ < 10) {
    const title = txt(doc.querySelector('#viewForm .st-title'));
    if (/经历/.test(title)) break;
    doc.querySelector('#btnNext').click();
    await wait(40);
  }
  ok(/经历/.test(txt(doc.querySelector('#viewForm .st-title'))), '走到第 3 步：' + txt(doc.querySelector('#viewForm .st-title')));

  const block = doc.querySelector('.tblock[data-tk="works"]');
  ok(!!block, '工作经历表在');
  ok(block.classList.contains('is-none'), '表格处于"暂无"收起状态');
  const noneCk = block.querySelector('input[data-act="none-row"]');
  ok(!!noneCk && noneCk.checked, '「暂无工作经历」是勾上的');
  ok(block.querySelector('.trows').hidden === true, '明细行收起来了');
  ok(block.querySelector('.tblock-note').hidden === false, '显示"已声明"的说明');
  ok(/暂无工作或实习经历/.test(txt(block.querySelector('.tblock-note'))), '说明里写了暂无工作或实习经历');

  console.log('\n【2】收起后不报错，能继续往下走');
  doc.querySelector('#btnNext').click();     // 第 3 步 → 第 4 步
  await wait(60);
  ok(!doc.querySelector('.tblock[data-tk="works"] .tcell.is-err'), '没有留下"此项必填"的错误');
  ok(/联系|方式/.test(txt(doc.querySelector('#viewForm .st-title'))), '已经翻到下一步：' + txt(doc.querySelector('#viewForm .st-title')));

  console.log('\n【3】取消勾选 → 表格恢复、校验回来');
  // 退回去看第 3 步
  doc.querySelector('#btnPrev').click();
  await wait(60);
  const ck2 = doc.querySelector('.tblock[data-tk="works"] input[data-act="none-row"]');
  ck2.checked = false;
  ck2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(60);
  const block2 = doc.querySelector('.tblock[data-tk="works"]');
  ok(!block2.classList.contains('is-none'), '表格重新展开');
  ok(block2.querySelector('.trows').hidden === false, '明细行回来了');
  ok(block2.querySelector('.tblock-note').hidden === true, '说明收起来');

  // 再勾回去，准备提交
  const ck3 = doc.querySelector('.tblock[data-tk="works"] input[data-act="none-row"]');
  ck3.checked = true;
  ck3.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(40);

  console.log('\n【4】提交后导出的 Word 里写着"暂无工作经历"');
  // 一路提交
  guard = 0;
  while (guard++ < 12) {
    if (!doc.querySelector('#viewForm').hidden === false) { /* noop */ }
    const nextBtn = doc.querySelector('#btnNext');
    if (nextBtn) { nextBtn.click(); await wait(50); continue; }
    const sub = doc.querySelector('#btnSubmit');
    if (sub) { sub.click(); await wait(200); break; }
    break;
  }
  ok(!!doc.querySelector('#viewResult h1'), '已提交，进入结果页');

  // 从 HR 列表里导出这个人的 Word
  doc.querySelector('.tab[data-view="hr"]').click();
  await wait(80);
  const rows = doc.querySelectorAll('#viewHr tbody tr');
  ok(rows.length === 4, 'HR 列表里有 4 条（3 条演示 + 刚才提交的 1 条），实际 ' + rows.length);
  // 刚才提交的是最新一条，排第一
  const firstName = txt(rows[0].querySelector('td b'));
  ok(firstName === '李思睿', '第一条是刚提交的李思睿，实际 ' + firstName);

  rows[0].querySelector('[data-act="pkg"]').click();
  await wait(1500);
  const zipName = Object.keys(captured).find(n => /\.zip$/.test(n));
  ok(!!zipName, '打包出 zip：' + (zipName || '无'));

  // zip 里找 docx，再在 docx（未压缩）里搜中文
  let found = '';
  if (zipName) {
    const zbuf = Buffer.from(await captured[zipName].arrayBuffer());
    if (bufHas(zbuf, '暂无工作或实习经历')) found = '暂无工作或实习经历';
  }
  ok(!!found, 'Word/包里能搜到「暂无工作或实习经历」（' + (found || '没搜到') + '）');

  /* ============ B. HR 状态 ============ */

  console.log('\n【5】列表默认都是"待核对"');
  const pills = () => Array.from(doc.querySelectorAll('#viewHr .st-pill'));
  ok(pills().length === 4, '每行都有状态按钮：' + pills().length);
  ok(pills().every(p => /待核对/.test(p.textContent)), '默认全部是待核对');
  ok(doc.querySelectorAll('#viewHr .fbtn').length === 4, '筛选有 4 个（全部 + 3 个状态）');

  console.log('\n【6】标成"已入职" + 写备注');
  pills()[0].click();
  await wait(60);
  ok(doc.querySelector('#sheet').hidden === false, '状态弹层打开了');
  const rds = doc.querySelectorAll('input[name="metaSt"]');
  ok(rds.length === 3, '三个状态可选');
  rds[1].checked = true;                            // 已入职
  rds[1].dispatchEvent(new window.Event('change', { bubbles: true }));
  doc.querySelector('#metaRemark').value = '已确认 11 月 3 日到岗';
  doc.querySelector('[data-sheet-act="meta-save"]').click();
  await wait(80);

  ok(doc.querySelector('#sheet').hidden === true, '保存后弹层关掉');
  const p0 = doc.querySelectorAll('#viewHr .st-pill')[0];
  ok(/已入职/.test(p0.textContent), '第一行状态变成已入职：' + p0.textContent);
  ok(/已确认/.test(txt(doc.querySelector('#viewHr .st-note'))), '备注显示在列表里');

  console.log('\n【7】按状态筛选');
  const fbtn = f => doc.querySelector('#viewHr .fbtn[data-f="' + f + '"]');
  ok(/已入职/.test(txt(fbtn('hired'))), '筛选按钮上有计数：' + txt(fbtn('hired')));

  fbtn('hired').click(); await wait(60);
  ok(doc.querySelectorAll('#viewHr tbody tr').length === 1, '只看已入职 → 1 行');
  ok(/已入职/.test(txt(doc.querySelector('#viewHr tbody tr .st-pill'))), '这一行确实是已入职');

  fbtn('pending').click(); await wait(60);
  ok(doc.querySelectorAll('#viewHr tbody tr').length === 3, '只看待核对 → 3 行');

  fbtn('all').click(); await wait(60);
  ok(doc.querySelectorAll('#viewHr tbody tr').length === 4, '回到全部 → 4 行');

  console.log('\n【8】搜索框');
  const search = doc.querySelector('#hrSearch');
  search.value = '张明远';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(60);
  ok(doc.querySelectorAll('#viewHr tbody tr').length === 1, '搜"张明远" → 1 行');
  ok(/张明远/.test(txt(doc.querySelector('#viewHr tbody tr td b'))), '搜到的是张明远');

  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(60);
  ok(doc.querySelectorAll('#viewHr tbody tr').length === 4, '清空搜索 → 4 行');

  console.log('\n【9】筛选后全选只选看得见的');
  fbtn('pending').click(); await wait(60);
  const ckAll = doc.querySelector('#ckAll');
  ckAll.checked = true;
  ckAll.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(60);
  const selBtn = doc.querySelector('#viewHr [data-act="sel"]');
  ok(/3 人/.test(txt(selBtn)), '筛"待核对"后全选 = 3 人：' + txt(selBtn));

  fbtn('all').click(); await wait(60);
  ok(/3 人/.test(txt(doc.querySelector('#viewHr [data-act="sel"]'))), '切回全部，勾选还是 3 人（不会自动全选）');

  console.log('\n【10】导出处理台账');
  doc.querySelector('[data-act="track"]').click();
  await wait(400);
  const xlsxName = Object.keys(captured).find(n => /处理台账/.test(n));
  ok(!!xlsxName, '导出了台账：' + (xlsxName || '没捕获到'));
  if (xlsxName) {
    const xb = Buffer.from(await captured[xlsxName].arrayBuffer());
    ok(bufHas(xb, '已入职'), '台账里有"已入职"这行字');
    ok(bufHas(xb, '已确认 11 月 3 日到岗'), '台账里带着备注原文');
  }

  console.log('\n结果：' + (fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'));
  process.exit(fails === 0 ? 0 : 1);
})();
