/**
 * 验证：必填/选填调整、工作经历改名、经人介绍的分支填写、Word 里的渠道文字与签名大小
 *
 *   node test-channel-ui.js
 *
 * 分两段：
 *   1) 纯 node：schema / 表格校验 / Word 母版文字
 *   2) 浏览器：条件字段真的会跟着选，且隐藏的旧值会被清掉
 */
const path = require('path');
const fs = require('fs');

const PW = '/Users/langzi/.workbuddy/binaries/node/workspace/node_modules/playwright-core';
const { chromium } = require(PW);
const CHROME = '/Users/langzi/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PAGE = path.resolve(__dirname, '入职登记原型_单文件版.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra == null ? '' : ('→ ' + extra)); }
}

/* ---------- 1. 纯 node 部分 ---------- */
global.window = global;
require(path.resolve(__dirname, '..', '网页', 'zip-lite.js'));
require(path.resolve(__dirname, '..', '网页', 'form-template.js'));
require(path.resolve(__dirname, '..', '网页', 'template-docx.js'));
require(path.resolve(__dirname, '..', '网页', 'bundle.js'));

const A = global.APP;
const schema = A.schema;

function findField(key) {
  let hit = null;
  schema.steps.forEach(s => (s.fields || []).forEach(f => { if (f.key === key) hit = f; }));
  return hit;
}
function findBlock(key) {
  let hit = null;
  schema.steps.forEach(s => (s.tables || []).forEach(b => { if (b.key === key) hit = b; }));
  return hit;
}

console.log('=== 必填 / 选填 ===');
{
  const edu = findBlock('educations');
  const w = edu.columns.filter(c => c.key === 'witness')[0];
  const m = edu.columns.filter(c => c.key === 'major')[0];
  ok('证明人及电话是选填', w && w.optional === true);
  ok('专业是选填', m && m.optional === true);

  // 只填了学校/学历、没填证明人，也应该算这段填完了
  const rows = [{ start: '2016-09', end: '2019-06', school: '深圳中学', major: '', degree: '高中', witness: '' }];
  const r = A.validators.validateTable(edu, rows, {});
  ok('不填证明人不报错', Object.keys(r.errors).length === 0, JSON.stringify(r.errors));
  ok('不填证明人不计入错误数', r.count === 0, r.count);

  // 但学校空着必须报
  const bad = [{ start: '2016-09', end: '2019-06', school: '', major: '', degree: '高中', witness: '' }];
  const rb = A.validators.validateTable(edu, bad, {});
  ok('学校空着还是要报必填', Object.keys(rb.errors).indexOf('educations.0.school') > -1, JSON.stringify(rb.errors));
}

console.log('\n=== 工作经历改名 ===');
{
  const works = findBlock('works');
  ok('标题含「实习」', works.title.indexOf('实习') > -1, works.title);
  ok('提示里说明工作或实习都算', works.hint.indexOf('实习') > -1, works.hint);
  ok('教育提示说明从高中填起', findBlock('educations').hint.indexOf('高中') > -1);
  ok('教育提示提到初中', findBlock('educations').hint.indexOf('初中') > -1);
}

console.log('\n=== 经人介绍的分支字段 ===');
{
  const t = findField('channelRefType');
  const n = findField('channelRefName');
  const rel = findField('channelRefRelation');
  const ag = findField('channelAgency');
  ok('有「介绍方式」字段且必填', !!t && t.required === true, t && t.required);
  ok('介绍方式两个选项', t && t.options.join('/') === '内部推荐/中介推荐', t && t.options.join('/'));
  ok('介绍方式只在经人介绍时出现', t && t.showWhen && t.showWhen.value === '经人介绍');
  ok('内推人姓名必填', n && n.required === true);
  ok('内推人姓名跟随内部推荐', n && n.showWhen && n.showWhen.value === '内部推荐');
  ok('关系是选填', rel && !rel.required);
  ok('中介公司必填', ag && ag.required === true);
  ok('中介公司三选一', ag && ag.options.join('/') === '沃盛/协和/大赢', ag && ag.options.join('/'));
  ok('中介公司跟随中介推荐', ag && ag.showWhen && ag.showWhen.value === '中介推荐');
}

/* ---------- Word 文字 ---------- */
function channelText(v) {
  const vals = Object.assign({
    realName: '张明远', gender: '男', birthday: '1990-05-12',
    nation: '汉', politicalStatus: '群众', householdType: '城镇',
    phone: '13800001111', idcard: '440304199005121237',
    channel: '经人介绍', channelRefType: '', channelRefName: '',
    channelRefRelation: '', channelAgency: ''
  }, v);
  return global.TemplateDocx.buildMap(vals, {}).CHANNEL;
}

console.log('\n=== Word 里的渠道那一栏 ===');
{
  const a = channelText({ channelRefType: '内部推荐', channelRefName: '李伟', channelRefRelation: '老乡' });
  ok('内推：勾中经人介绍', a.indexOf('☑ 经人介绍') > -1, a);
  ok('内推：写内推人姓名', a.indexOf('李伟') > -1, a);
  ok('内推：标注内部推荐', a.indexOf('内部推荐') > -1, a);
  ok('内推：带上关系', a.indexOf('老乡') > -1, a);

  const b = channelText({ channelRefType: '中介推荐', channelAgency: '沃盛' });
  ok('中介：写公司名', b.indexOf('沃盛') > -1, b);
  ok('中介：标注中介推荐', b.indexOf('中介推荐') > -1, b);
  ok('中介：不写介绍人字段名', b.indexOf('介绍人') < 0, b);

  const c = channelText({ channelRefType: '内部推荐', channelRefName: '李伟', channelAgency: '沃盛' });
  ok('切回内推后中介公司不出现', c.indexOf('沃盛') < 0, c);

  const d = channelText({ channel: '网络', channelRefType: '中介推荐', channelAgency: '沃盛' });
  ok('渠道不是经人介绍时不写介绍信息', d.indexOf('沃盛') < 0 && d.indexOf('中介') < 0, d);
}

/* ---------- 签名大小 ---------- */
console.log('\n=== 申请人签字放大 ===');
{
  const FILE = '/tmp/test-sign.png';
  if (!fs.existsSync(FILE)) {
    ok('测试签名图存在（跳过）', false, FILE + ' 不存在，先跑 gen-photo-sign-test.js');
  } else {
    const b64 = fs.readFileSync(FILE).toString('base64');
    const dataUrl = 'data:image/png;base64,' + b64;
    const vals = {
      realName: '张明远', gender: '男', birthday: '1990-05-12', nation: '汉',
      politicalStatus: '群众', householdType: '城镇', phone: '13800001111',
      idcard: '440304199005121237', channel: '网络',
      signData: dataUrl
    };
    const bytes = global.TemplateDocx.build(vals, {});
    const xml = new TextDecoder('utf-8').decode(bytes);
    const ext = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)]
      .map(m => ({ cx: +m[1], cy: +m[2] }))
      .filter(e => e.cx < 4000000);   // 排除印章（印章是另一个尺寸）
    const maxCy = Math.max.apply(null, ext.map(e => e.cy));
    // 1cm = 360000 EMU；460 twips = 0.81cm ≈ 292100 EMU
    ok('签名高度超过原来的 0.6cm', maxCy > 216000, 'maxCy=' + maxCy);
    ok('签名高度不超过 0.85cm（别把行撑开）', maxCy <= 306000, 'maxCy=' + maxCy);
    ok('签名图片宽度也被放大', ext.some(e => e.cx > 900000), JSON.stringify(ext));
  }
}

/* ---------- 2. 浏览器：条件字段 ---------- */
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 } });
  await page.goto('file://' + PAGE + '#form');
  await page.waitForTimeout(700);

  // 一键填案例，翻到最后一页（渠道就在这一页）
  await page.locator('button', { hasText: '一键填案例' }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.fill('#demoNo', 'HR001');
  await page.fill('#demoPw', 'bmai2026');
  await page.click('[data-sheet-act="demo-auth"]');
  await page.waitForTimeout(500);
  await page.click('[data-sheet-act="demo-pick"][data-key="zhang"]');
  await page.waitForTimeout(800);

  for (let i = 0; i < 7; i++) {
    if (await page.locator('#f-channel').count()) break;
    await page.locator('button', { hasText: '下一步' }).last().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(350);
  }

  console.log('\n=== 界面：条件字段跟着走 ===');
  ok('渠道那一题在页面上', await page.locator('#f-channel').count() === 1);
  ok('没选经人介绍时，没有介绍方式', await page.locator('#f-channelRefType').count() === 0);

  await page.locator('#f-channel input[value="经人介绍"]').click({ force: true });
  await page.waitForTimeout(500);
  ok('选了经人介绍后出现「介绍方式」', await page.locator('#f-channelRefType').count() === 1);
  ok('还没选内外推时，不显示姓名/中介', await page.locator('#f-channelRefName').count() === 0
    && await page.locator('#f-channelAgency').count() === 0);

  await page.locator('#f-channelRefType input[value="中介推荐"]').click({ force: true });
  await page.waitForTimeout(500);
  ok('选中介推荐后出现「中介公司」下拉', await page.locator('#i-channelAgency').count() === 1);
  const opts = await page.locator('#i-channelAgency option').allTextContents();
  ok('中介公司三选一', opts.join('/').indexOf('沃盛') > -1 && opts.join('/').indexOf('协和') > -1
    && opts.join('/').indexOf('大赢') > -1, opts.join('/'));
  ok('中介推荐时不显示内推人姓名', await page.locator('#f-channelRefName').count() === 0);

  await page.selectOption('#i-channelAgency', '沃盛');
  await page.waitForTimeout(300);

  await page.locator('#f-channelRefType input[value="内部推荐"]').click({ force: true });
  await page.waitForTimeout(500);
  ok('切回内部推荐后出现姓名输入框', await page.locator('#i-channelRefName').count() === 1);
  ok('切回内部推荐后中介下拉消失', await page.locator('#f-channelAgency').count() === 0);

  // app.js 没把 state 暴露到 window，从草稿里读——saveDraft 存的就是 values
  const readDraft = () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('onboard_demo_draft_v1') || 'null'); }
    catch (e) { return null; }
  });
  const vals = await readDraft();
  ok('切走后中介公司被清空', !vals || !vals.values.channelAgency,
    vals && JSON.stringify({ agency: vals.values.channelAgency, type: vals.values.channelRefType }));

  await page.locator('#f-channel input[value="网络"]').click({ force: true });
  await page.waitForTimeout(500);
  ok('改成网络后整个介绍方式消失', await page.locator('#f-channelRefType').count() === 0);
  const v2 = await readDraft();
  ok('改成网络后介绍方式的值被清空', !v2 || !v2.values.channelRefType, v2 && v2.values.channelRefType);

  await browser.close();
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 项通过，' + fail + ' 项失败');
  process.exit(fail ? 1 : 0);
})();
