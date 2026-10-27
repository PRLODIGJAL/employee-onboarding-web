/**
 * 界面验证：HR 后台「清理重复提交」面板
 *
 * 用真正的 Chrome 打开单文件版，往 localStorage 里塞 6 条记录
 * （3 个人 × 每人重复填 2 次），看：
 *   1. 底部有没有出现「清理重复提交（3 条）」
 *   2. 点开面板是不是 3 组、每组 2 条、默认保留最新那条
 *   3. 取消勾选后按钮上的数字跟着变
 *   4. 点删除之后列表真的少了 3 条
 *
 *   node test-dup-ui.js           只跑测试
 *   node test-dup-ui.js --shot    顺便存截图到 截图/ 目录
 */
const path = require('path');
const fs = require('fs');

const PW = '/Users/langzi/.workbuddy/binaries/node/workspace/node_modules/playwright-core';
const { chromium } = require(PW);

const CHROME = '/Users/langzi/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PAGE = path.resolve(__dirname, '入职登记原型_单文件版.html');
const SHOT = path.resolve(__dirname, '截图');
const wantShot = process.argv.indexOf('--shot') > -1;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra == null ? '' : ('→ ' + extra)); }
}

/* 6 条记录：3 组重复。第 2 条都是"后提交的"，应该被保留 */
function mkRecords() {
  const base = (name, phone, idcard, t) => ({
    id: 'seed' + name,
    formNo: 'DJ20261023-' + Math.random().toString().slice(2, 6),
    submittedAt: t,
    values: { realName: name, phone, idcard, birthday: '1993-08-12', gender: '男', nation: '汉族' },
    tables: {}, idPhotos: null
  });
  return [
    // 张明远：第一次身份证填错，第二次改对了
    base('张明远', '13800138000', '330106199308124531', '2026-10-23T01:00:00.000Z'),
    base('张明远', '13800138000', '330106199308124533', '2026-10-23T02:00:00.000Z'),
    // 李思睿：手机号填错
    base('李思睿', '13712345678', '440305200203158866', '2026-10-23T03:00:00.000Z'),
    base('李思睿', '13712345679', '440305200203158866', '2026-10-23T04:00:00.000Z'),
    // 王雪梅：完全一样，填了两遍
    base('王雪梅', '15900001111', '510107199007152445', '2026-10-23T05:00:00.000Z'),
    base('王雪梅', '15900001111', '510107199007152445', '2026-10-23T06:00:00.000Z')
  ];
}

(async function () {
  if (!fs.existsSync(CHROME)) {
    console.log('找不到 Chrome for Testing:', CHROME);
    process.exit(2);
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const recs = mkRecords();

  // 先落到页面上（file:// 下 localStorage 归这个文件所有，必须在同一次导航里写）
  await page.goto('file://' + PAGE);
  await page.evaluate(function (data) {
    localStorage.setItem('onboard_demo_records_v1', JSON.stringify(data));
    sessionStorage.setItem('onboard_demo_hr_session_v1',
      JSON.stringify({ no: 'HR001', at: Date.now() }));
  }, recs);

  await page.goto('file://' + PAGE + '#hr');
  await page.reload();
  await page.waitForTimeout(1200);

  console.log('\n=== 列表 ===');
  const rowCount = await page.locator('#viewHr .hr-table tbody tr').count();
  ok('6 条记录都在', rowCount === 6, rowCount);

  const dupBtn = page.locator('#viewHr [data-act="dup"]');
  ok('底部出现「清理重复提交」按钮', await dupBtn.count() === 1);
  const btnText = await dupBtn.textContent();
  ok('按钮写着 3 条', /3\s*条/.test(btnText || ''), btnText);

  console.log('\n=== 面板 ===');
  await dupBtn.click();
  await page.waitForTimeout(300);

  const groups = await page.locator('#sheetBox .dup-group').count();
  ok('分成 3 组', groups === 3, groups);

  const firstHead = await page.locator('#sheetBox .dup-group').first().locator('.dup-ghead').textContent();
  ok('组头显示人名和判定依据', /张明远/.test(firstHead) && /相同|相近/.test(firstHead), firstHead);

  const checkboxes = page.locator('#sheetBox .dupck');
  const total = await checkboxes.count();
  ok('一共 6 行', total === 6, total);

  const checked = await page.locator('#sheetBox .dupck:checked').count();
  ok('默认勾选 3 条（每组留最新那条不勾）', checked === 3, checked);

  const keepCount = await page.locator('#sheetBox .dup-keep').count();
  ok('每组标了「保留」', keepCount === 3, keepCount);

  // 保留的应该是较晚提交的那条
  const keptFirst = await page.locator('#sheetBox .dup-group').first().locator('tr.is-keep td').nth(4).textContent();
  ok('保留的是最新提交（02:00 那次的本地时间）', /0[89]:00|1[0-9]:00/.test(keptFirst || ''), keptFirst);

  const nLabel = await page.locator('#dupN').textContent();
  ok('按钮上写着 3', nLabel === '3', nLabel);

  console.log('\n=== 取消勾选后计数跟着变 ===');
  await page.locator('#sheetBox .dupck:checked').first().uncheck();
  await page.waitForTimeout(150);
  const nLabel2 = await page.locator('#dupN').textContent();
  ok('取消一条后变成 2', nLabel2 === '2', nLabel2);
  await page.locator('#sheetBox .dupck').first().check();   // 恢复
  await page.waitForTimeout(120);

  if (wantShot) {
    fs.mkdirSync(SHOT, { recursive: true });
    await page.screenshot({ path: path.join(SHOT, 'HR-清理重复提交.png'), fullPage: false });
    console.log('  已存截图 截图/HR-清理重复提交.png');
  }

  console.log('\n=== 确认删除 ===');
  page.on('dialog', function (d) { d.accept(); });
  await page.locator('#sheetBox [data-sheet-act="dup-del"]').click();
  await page.waitForTimeout(700);

  const after = await page.locator('#viewHr .hr-table tbody tr').count();
  ok('删完剩 3 条', after === 3, after);

  // 每组保留的那条应该还在
  const names = await page.locator('#viewHr .hr-table tbody tr td:nth-child(2)').allTextContents();
  ok('三个人的名字都还在', ['张明远', '李思睿', '王雪梅'].every(function (n) {
    return names.some(function (x) { return String(x).indexOf(n) > -1; });
  }), names.join(','));

  const dupGone = await page.locator('#viewHr [data-act="dup"]').count();
  ok('重复清理干净后按钮消失', dupGone === 0, dupGone);

  console.log('\n=== 确认后列表数据也少了 ===');
  const stored = await page.evaluate(function () {
    return JSON.parse(localStorage.getItem('onboard_demo_records_v1') || '[]').length;
  });
  ok('localStorage 里只剩 3 条', stored === 3, stored);

  await browser.close();
  console.log('\n————————————————————');
  console.log(fail === 0 ? ('全部通过（' + pass + ' 项）') : ('通过 ' + pass + ' 项，失败 ' + fail + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('跑挂了:', e && e.message);
  process.exit(3);
});
