/**
 * 首页（选身份）回归测试
 *
 *   node test-home.js
 *
 * 覆盖：
 *   1. 直接打开根地址 → 停在首页，不直接进填表
 *   2. 首页两张卡：我是员工 / 我是 HR
 *   3. 「我是员工」→ 进填表，第一屏渲染出来
 *   4. 点顶栏品牌 → 回首页
 *   5. 「我是 HR」未登录 → 先到登录页；登录后 → 后台
 *   6. 员工链接（二维码里的地址）末尾带 #form
 *   7. 带 #form 打开 → 直接是填表页，不经过首页
 *   8. 填了一半再回首页 → 卡片提示"有一份未提交的草稿，停在第 N 步"
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SINGLE = path.join(__dirname, '入职登记原型_单文件版.html');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
};

const vc = new VirtualConsole();
vc.on('jsdomError', e => console.error('[jsdomError]', String(e.message).split('\n')[0]));

function make(url) {
  const dom = new JSDOM(fs.readFileSync(SINGLE, 'utf8'), {
    url: url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.URL.createObjectURL = function () { return 'blob:x'; };
      window.URL.revokeObjectURL = function () {};
      window.Element.prototype.scrollIntoView = function () {};
    }
  });
  return dom;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const isHidden = el => !el || el.hidden === true;

(async () => {
  /* ---------------- 1. 根地址：停在首页 ---------------- */
  console.log('\n【1】打开根地址，先选身份');
  const dom = make('http://localhost/index.html');
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  await wait(60);
  const doc = window.document;

  ok(!isHidden(doc.querySelector('#viewHome')), '首页显示出来了');
  ok(isHidden(doc.querySelector('#viewForm')), '填表页没有直接展开');
  ok(doc.body.dataset.view === 'home', 'body 上标了 data-view=home（CSS 用这个藏掉顶栏 tab）');

  const cards = doc.querySelectorAll('#viewHome .home-card');
  ok(cards.length === 2, '两张卡，实际 ' + cards.length);
  ok(/我是员工/.test(cards[0].textContent), '第一张是「我是员工」');
  ok(/我是 HR/.test(cards[1].textContent), '第二张是「我是 HR」');
  ok(/员工信息登记/.test(doc.querySelector('.home-hero h1').textContent), '标题是员工信息登记');

  /* ---------------- 2. 员工入口 ---------------- */
  console.log('\n【2】点「我是员工」进填表');
  cards[0].click();
  await wait(60);
  ok(isHidden(doc.querySelector('#viewHome')), '首页收起');
  ok(!isHidden(doc.querySelector('#viewForm')), '填表页展开');
  ok(!!doc.querySelector('#formBody .notice'), '第一屏的「填写前须知」渲染出来了');
  ok(doc.body.dataset.view === 'form', 'body 标记切到 form');

  /* ---------------- 3. 品牌回首页 ---------------- */
  console.log('\n【3】点顶栏品牌回首页');
  doc.querySelector('#brandHome').click();
  await wait(60);
  ok(!isHidden(doc.querySelector('#viewHome')), '回到首页');

  /* ---------------- 4. HR 入口 + 登录 ---------------- */
  console.log('\n【4】点「我是 HR」，未登录先到登录页');
  doc.querySelectorAll('#viewHome .home-card')[1].click();
  await wait(60);
  ok(!isHidden(doc.querySelector('#viewLogin')), '先到登录页，不是直接进后台');
  ok(!!doc.querySelector('#hrNo'), '登录表单出来了');

  doc.querySelector('#hrNo').value = 'HR001';
  doc.querySelector('#hrPwd').value = 'bmai2026';
  doc.querySelector('#hrLogin').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(200);
  ok(!isHidden(doc.querySelector('#viewHr')), '登录成功进后台');

  /* ---------------- 5. 员工链接带 #form ---------------- */
  console.log('\n【5】二维码 / 复制链接指向填表页');
  const qrBtn = doc.querySelector('[data-act="qr"]');
  ok(!!qrBtn, '后台有「填写链接 / 二维码」');
  if (qrBtn) {
    qrBtn.click();
    await wait(80);
    const input = doc.querySelector('#fillUrlInput');
    ok(!!input, '弹层里拿到链接');
    ok(/#form$/.test(input ? input.value : ''), '链接末尾带 #form：' + (input ? input.value : '—'));
    const closeBtn = doc.querySelector('#sheetBox [data-close]');
    if (closeBtn) closeBtn.click();
  }

  /* ---------------- 6. 带 #form 直接进填表 ---------------- */
  console.log('\n【6】带 #form 打开（员工扫码的路径）');
  const dom2 = make('http://localhost/index.html#form');
  await new Promise(r => dom2.window.addEventListener('load', r, { once: true }));
  await wait(80);
  const doc2 = dom2.window.document;
  ok(!isHidden(doc2.querySelector('#viewForm')), '直接是填表页');
  ok(isHidden(doc2.querySelector('#viewHome')), '不显示选身份那一页');
  ok(!!doc2.querySelector('#formBody .notice'), '填表内容正常渲染');

  /* ---------------- 7. 有草稿时首页会提示 ---------------- */
  console.log('\n【7】填一半回首页，提示有草稿');
  const nameInput = doc2.querySelector('#f-realName [data-key="realName"]');
  ok(!!nameInput, '找到姓名输入框');
  if (nameInput) {
    nameInput.value = '张三';
    nameInput.dispatchEvent(new dom2.window.Event('input', { bubbles: true }));
    await wait(40);
    doc2.querySelector('#brandHome').click();
    await wait(60);
    const txt = doc2.querySelector('#viewHome').textContent;
    ok(/未提交的草稿/.test(txt), '卡片上写了「有未提交的草稿」');
    ok(/第 1 步/.test(txt), '并且说了停在第几步');
  }

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败' + (fail === 0 ? ' ✓' : ''));
  process.exit(fail ? 1 : 0);
})();
