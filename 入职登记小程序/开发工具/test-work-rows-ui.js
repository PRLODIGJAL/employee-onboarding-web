/**
 * 界面验证：工作经历最多两段
 *
 * 纸质表已把工作经历从 3 行删到 2 行，网页这边必须跟着收口——
 * 多给一段，员工填了却打不出来；少给一段，等于白丢一段经历。
 *
 *   node test-work-rows-ui.js            只跑测试
 *   node test-work-rows-ui.js --shot     顺便截图
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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 } });
  await page.goto('file://' + PAGE + '#form');
  await page.waitForTimeout(700);

  // 先一键填案例：第一步有必填校验，不填就翻不到经历页
  await page.locator('button', { hasText: '一键填案例' }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.fill('#demoNo', 'HR001');
  await page.fill('#demoPw', 'bmai2026');
  await page.click('[data-sheet-act="demo-auth"]');
  await page.waitForTimeout(500);
  await page.click('[data-sheet-act="demo-pick"][data-key="zhang"]');
  await page.waitForTimeout(700);

  // 一路「下一步」直到「教育与工作经历」这一屏
  for (let i = 0; i < 4; i++) {
    if (await page.locator('[data-tk="works"]').count()) break;
    await page.locator('button', { hasText: '下一步' }).last().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  const hasWorks = await page.locator('[data-tk="works"]').count();
  ok('翻到了教育与工作经历这一屏', hasWorks > 0, 'works 块 ' + hasWorks);
  if (!hasWorks) { await browser.close(); process.exit(1); }

  const tbl = page.locator('[data-tk="works"]').first();
  await tbl.scrollIntoViewIfNeeded().catch(() => {});

  const workRows = page.locator('[data-tk="works"] .trow');
  const r0 = await workRows.count();
  ok('工作经历就是 2 段（模板只有 2 行）', r0 === 2, '实际 ' + r0);

  const workAdd = page.locator('[data-act="add-row"][data-tk="works"]');
  const addN = await workAdd.count();
  ok('一开始就满两段，不给「增加一段」', addN === 0, '实际 ' + addN);

  // 第 1 段带出案例里的公司，第 2 段是空的
  const c1 = await page.locator('[data-tk="works"] .trow').first().locator('input[data-ck="company"]').inputValue();
  const c2 = await page.locator('[data-tk="works"] .trow').last().locator('input[data-ck="company"]').inputValue();
  ok('第 1 段是案例内容', !!c1, c1);
  ok('第 2 段是空的', !c2, c2);

  // 每段 5 个可填格
  const cols = await page.locator('[data-tk="works"] .trow').first().locator('input, select').count();
  ok('每段 5 个可填格', cols === 5, '实际 ' + cols);

  // 第 2 段能真正输入
  const company = page.locator('[data-tk="works"] .trow').nth(1).locator('input[data-ck="company"]');
  await company.fill('某某电气有限公司');
  ok('第 2 段能输入', (await company.inputValue()) === '某某电气有限公司');

  // 教育只给 1 段，且不给「增加」
  const eduRows = await page.locator('[data-tk="educations"] .trow').count();
  ok('教育经历只有 1 段', eduRows === 1, '实际 ' + eduRows);
  const eduAdd = await page.locator('[data-act="add-row"][data-tk="educations"]').count();
  ok('教育不能再加', eduAdd === 0, '实际 ' + eduAdd);

  if (wantShot) {
    fs.mkdirSync(SHOT, { recursive: true });
    await tbl.screenshot({ path: path.join(SHOT, '工作经历_最多两段.png') }).catch(() => {});
    console.log('  截图已存 截图/工作经历_最多两段.png');
  }

  await browser.close();
  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
