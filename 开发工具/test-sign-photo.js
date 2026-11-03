/**
 * 界面验证：证件照 + 手写签名
 *
 * 验四件事：
 *   1. 确认提交那一屏有手写签名板
 *   2. 在画布上划两下，签名就存进了草稿（state.values.signData）
 *   3. 「重签」把签名清掉
 *   4. 导出的 Word 里，照片和签名都是真图片（word/media/bmai_photo.*），
 *      而且没有照片 / 没有签名时也不会报错、不会留占位符
 *
 *   node test-sign-photo.js            只跑测试
 *   node test-sign-photo.js --shot     顺便截图
 */
const path = require('path');

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

  // 一键填案例（案例里自带画好的证件照和签名）
  await page.locator('button', { hasText: '一键填案例' }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.fill('#demoNo', 'HR001');
  await page.fill('#demoPw', 'bmai2026');
  await page.click('[data-sheet-act="demo-auth"]');
  await page.waitForTimeout(500);
  await page.click('[data-sheet-act="demo-pick"][data-key="zhang"]');
  await page.waitForTimeout(700);

  // 翻到最后一步（确认提交）
  for (let i = 0; i < 6; i++) {
    if (await page.locator('#spCanvas').count()) break;
    await page.locator('button', { hasText: '下一步' }).last().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(350);
  }

  console.log('\n=== 签名板 ===');
  const hasPad = await page.locator('#spCanvas').count();
  ok('确认页有手写签名板', hasPad > 0, String(hasPad));
  if (!hasPad) { await browser.close(); process.exit(1); }

  const box = await page.locator('#spCanvas').boundingBox();
  ok('画布有实际尺寸', box && box.width > 200 && box.height > 80,
    box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'null');

  ok('案例自带签名已经画上了', await page.evaluate(() => {
    var d = JSON.parse(localStorage.getItem('onboard_demo_draft_v1') || '{}');
    return !!(d.values && String(d.values.signData || '').length > 500);
  }));

  console.log('\n=== 手写 ===');
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + 30 + i * 18, box.y + box.height / 2 + (i % 2 ? -22 : 22));
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const signLen = await page.evaluate(() => {
    var d = JSON.parse(localStorage.getItem('onboard_demo_draft_v1') || '{}');
    return String((d.values || {}).signData || '').length;
  });
  ok('签名已存进草稿', signLen > 500, '长度 ' + signLen);
  ok('提示文字变成"已签上"', (await page.locator('#spNote').innerText()).indexOf('已签上') > -1);

  if (wantShot) {
    await page.screenshot({ path: path.join(SHOT, 'sign-pad.png') });
  }

  console.log('\n=== 重签 ===');
  await page.click('[data-act="sign-clear"]');
  await page.waitForTimeout(400);
  ok('签名被清掉', await page.evaluate(() => {
    var d = JSON.parse(localStorage.getItem('onboard_demo_draft_v1') || '{}');
    return !String((d.values || {}).signData || '').length;
  }));

  console.log('\n=== 提交一份，导出的 Word 里照片 / 签名都是真图片 ===');
  // 重新签一次（上一段刚点了"重签"，DOM 重建过，坐标要重新取）
  const box2 = await page.locator('#spCanvas').boundingBox();
  await page.mouse.move(box2.x + 40, box2.y + box2.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(box2.x + 40 + i * 16, box2.y + box2.height / 2 + (i % 2 ? -26 : 26));
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.click('#btnSubmit');
  await page.waitForTimeout(900);

  const r1 = await page.evaluate(() => {
    var recs = JSON.parse(localStorage.getItem('onboard_demo_records_v1') || '[]');
    if (!recs.length) return { err: '没有记录' };
    var rec = recs[recs.length - 1];
    var vals = Object.assign({}, rec.values, rec.tables);
    var bytes = window.TemplateDocx.build(vals, { noWork: !!vals.noWork });
    var s = new TextDecoder('utf-8').decode(bytes);
    return {
      err: '',
      name: vals.realName,
      hasPhotoData: !!(vals.photoData || '').length,
      hasSignData: !!(vals.signData || '').length,
      photoMedia: s.indexOf('word/media/bmai_photo.jpeg') > -1,
      signMedia: s.indexOf('word/media/bmai_sign.png') > -1,
      photoRel: s.indexOf('rId900') > -1,
      leftPlaceholder: (s.match(/\{\{(photo|sig1|sig2|date1|date2)\}\}/g) || []).length,
      drawings: (s.match(/<w:drawing>/g) || []).length,
      edu: s.indexOf('{{edu1.') < 0 && s.indexOf('{{work1.') < 0
    };
  });

  ok('提交后记录里带着证件照', r1.hasPhotoData, r1.err || '');
  ok('提交后记录里带着签名', r1.hasSignData);
  ok('Word 里有照片文件', r1.photoMedia);
  ok('Word 里有签名文件', r1.signMedia);
  ok('照片被 document.xml 引用了', r1.photoRel);
  ok('没有残留 {{photo}}/{{sig}} 占位符', r1.leftPlaceholder === 0, r1.leftPlaceholder);
  ok('图一共 4 张（印章 + 照片 + 两处签名）', r1.drawings === 4, r1.drawings);
  ok('受教育 / 工作经历也都填了', r1.edu);

  console.log('\n=== 没照片、没签名时也不出错 ===');
  const r2 = await page.evaluate(() => {
    var recs = JSON.parse(localStorage.getItem('onboard_demo_records_v1') || '[]');
    var rec = recs[recs.length - 1];
    var vals = Object.assign({}, rec.values, rec.tables);
    delete vals.photoData; delete vals.signData;
    var bytes = window.TemplateDocx.build(vals, {});
    var s = new TextDecoder('utf-8').decode(bytes);
    return {
      ok: bytes.length > 1000,
      noPhoto: s.indexOf('bmai_photo') < 0 && s.indexOf('bmai_sign') < 0,
      left: (s.match(/\{\{(photo|sig1|sig2)\}\}/g) || []).length,
      // 没照片时「照片」两个字还在，格子不能空着
      label: s.indexOf('<w:t>照片</w:t>') > -1,
      drawings: (s.match(/<w:drawing>/g) || []).length
    };
  });
  ok('照样能生成 Word', r2.ok);
  ok('没塞图片文件', r2.noPhoto);
  ok('没有残留占位符', r2.left === 0, r2.left);
  ok('「照片」两个字保留着', r2.label);
  ok('只剩印章一张图', r2.drawings === 1, r2.drawings);

  await browser.close();
  console.log('\n————————————————————');
  console.log(fail === 0 ? ('全部通过（' + pass + ' 项）') : ('通过 ' + pass + ' 项，失败 ' + fail + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('跑挂了:', e && e.message);
  process.exit(3);
});
