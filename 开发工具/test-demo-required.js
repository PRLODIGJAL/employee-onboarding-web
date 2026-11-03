/**
 * 预设案例 = 只能填必填项
 *
 *   node 开发工具/test-demo-required.js
 *
 * 为什么要盯着这件事：
 *   三份「一键填案例」是拿给 HR / 领导演示用的。它必须是**一份能直接提交的合法表**——
 *   凡是必填的都得有值，凡是选填的都得空着。以前招聘渠道还是选填，案例里就空着；
 *   2026-10-26 渠道改成必填，案例没跟上，点「下一步」会卡在"此项必填"，
 *   演示第一屏就翻车。这个测试就是防这种"schema 改了、案例没跟着改"。
 *
 * 检查项（三份案例各跑一遍）：
 *   1. 每一页里，所有 required 字段都有值
 *   2. 每一页里，所有选填字段都是空的（照片/签名这类演示附件除外）
 *   3. 教育经历那一段除「专业」「证明人及电话」外都填了
 *   4. 一路点「下一步」不出现红字，能走到提交
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SINGLE = path.join(__dirname, '入职登记原型_单文件版.html');

let fails = 0;
let pass = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); pass++; }
  else { console.log('  ✗ ' + msg); fails++; }
}

const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  const m = String(e.message || '').split('\n')[0];
  // jsdom 没有 canvas / fetch，演示数据里那几张示意图本来就画不出来，不算失败
  if (/Not implemented|canvas/i.test(m)) return;
  console.error('[jsdomError]', m);
});

const dom = new JSDOM(fs.readFileSync(SINGLE, 'utf8'), {
  url: 'http://localhost/index.html#form',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = () => 'blob:fake';
    window.URL.revokeObjectURL = () => {};
  }
});

const wait = ms => new Promise(r => setTimeout(r, ms));

/** 读一个字段在页面上实际呈现的值；字段不在本页 → null */
function fieldValue(doc, key) {
  const wrap = doc.getElementById('f-' + key);
  if (!wrap) return null;
  const ctrl = wrap.querySelector('.f-ctrl');
  if (!ctrl) return null;

  const radios = ctrl.querySelectorAll('input[type="radio"],input[type="checkbox"]');
  if (radios.length) {
    const checked = Array.prototype.filter.call(radios, x => x.checked).map(x => x.value);
    return checked.join(',');
  }
  const parts = Array.prototype.map.call(
    ctrl.querySelectorAll('input,select,textarea'),
    x => String(x.value == null ? '' : x.value).trim()
  ).filter(Boolean);
  return parts.join(' ');
}

/** 页面上这张表的第一行各列值 */
function tableRow(doc, tk, ri) {
  const row = doc.querySelector('.trow[data-ri="' + ri + '"]');
  const box = doc.querySelector('.tblock[data-tk="' + tk + '"]');
  if (!box) return null;
  const cells = box.querySelectorAll('.trow[data-ri="' + ri + '"] .tcell');
  if (!cells.length) return null;
  const out = {};
  Array.prototype.forEach.call(cells, c => {
    out[c.dataset.ck] = String((c.querySelector('input,select') || {}).value || '').trim();
  });
  return out;
}

(async () => {
  const { window } = dom;
  await new Promise(r => window.addEventListener('load', r, { once: true }));
  await wait(300);
  const doc = window.document;
  const STEPS = window.APP.schema.steps;

  /* ---- 先把字段表摊平，方便按 key 查 required ---- */
  const META = {};
  STEPS.forEach(s => {
    (s.fields || []).forEach(f => {
      META[f.key] = { required: !!f.required && !f.optional, label: f.label, type: f.type };
    });
    (s.tables || []).forEach(t => {
      (t.columns || []).forEach(c => {
        META[t.key + '.' + c.key] = { required: !c.optional, label: c.label, column: true };
      });
    });
  });

  ok(META.channel && META.channel.required, '招聘渠道在 schema 里是必填（channel.required）');

  /* ---- 走「一键填案例」，把三份案例挨个填进去 ---- */
  async function pickCase(i) {
    doc.querySelector('#side [data-act="demo"]').click();
    await wait(60);
    doc.querySelector('#demoNo').value = 'HR001';
    doc.querySelector('#demoPw').value = 'bmai2026';
    doc.querySelector('[data-sheet-act="demo-auth"]').click();
    await wait(80);
    const cases = doc.querySelectorAll('.demo-case');
    if (!cases[i]) throw new Error('没找到第 ' + (i + 1) + ' 份案例');
    cases[i].click();
    await wait(120);
  }

  async function walk(i) {
    const title = (doc.querySelector('#viewForm .st-title') || {}).textContent || '';
    const step = STEPS[i];
    const bad = [];

    (step.fields || []).forEach(f => {
      const v = fieldValue(doc, f.key);
      if (v === null) return;            // 本页不显示（被 showWhen 藏掉了）
      const req = META[f.key].required;
      if (req && !v) bad.push('必填没填：' + f.label + '（' + f.key + '）');
      if (!req && v && f.type !== 'photo') {
        // 选填的留着值 → 案例就不"干净"了，演示时看不出哪些是可选的
        if (['marriage', 'major', 'title', 'language', 'certificate', 'email',
          'liveRegion', 'liveDetail', 'householdRegion', 'householdDetail',
          'channelRefRelation'].indexOf(f.key) > -1) {
          bad.push('选填却填了：' + f.label + '（' + f.key + '=' + v + '）');
        }
      }
    });

    // 表格块：教育经历 / 工作经历
    if (step.tables) {
      step.tables.forEach(t => {
        const box = doc.querySelector('.tblock[data-tk="' + t.key + '"]');
        if (!box) return;
        const none = t.noneKey && (doc.querySelector('input[data-act="none-row"][data-nk="' + t.noneKey + '"]') || {}).checked;
        if (none) return;                // 勾了"暂无"，整块不用填
        const row = tableRow(doc, t.key, 0);
        if (!row) { bad.push(t.title + '：一行都没有'); return; }
        t.columns.forEach(c => {
          const v = String(row[c.key] || '').trim();
          if (c.optional) {
            if (v) bad.push(t.title + '：选填列却填了 ' + c.label + '=' + v);
          } else if (!v) {
            bad.push(t.title + '：必填列没填 ' + c.label);
          }
        });
      });
    }

    return { title, bad };
  }

  async function runCase(i, name) {
    await pickCase(i);
    console.log('\n【案例 ' + (i + 1) + '】' + name);
    let step = 0;
    let guard = 0;
    const allBad = [];
    let channelSeen = null;

    while (guard++ < 12) {
      const { title, bad } = await walk(step);
      if (bad.length) allBad.push('第 ' + (step + 1) + ' 页「' + title + '」：' + bad.join('；'));
      // 渠道只在「其他信息」那页存在，翻过去就读不到了，先记下来
      const chNow = fieldValue(doc, 'channel');
      if (chNow) channelSeen = chNow;

      const next = doc.querySelector('#btnNext');
      if (!next) {
        // 最后一页：确认页，点提交
        const sub = doc.querySelector('#btnSubmit');
        ok(!!sub, '走到最后一页「' + title + '」');
        break;
      }
      next.click();
      await wait(60);
      // 被校验挡住时页面根本翻不动，标题不会变 —— 这一步必须查，
      // 否则 step 一直自增，最后会在错误的页面上"假通过"
      const after = (doc.querySelector('#viewForm .st-title') || {}).textContent || '';
      if (after === title && doc.querySelector('#btnNext')) {
        allBad.push('「' + title + '」点下一步没反应：有必填项被拦住了');
        break;
      }
      step++;
    }

    ok(allBad.length === 0, '必填全填、选填全空' + (allBad.length ? ' → ' + allBad.join(' ｜ ') : ''));

    // 渠道值本身要能对上选项，否则 Word 里那排 ☑ 一个都不打勾
    ok(['宣传单', '网络', '厂门口', '经人介绍', '其他途径'].indexOf(channelSeen) > -1,
      '渠道填的是合法选项：' + channelSeen);

    // 退回去把整份表单重走一遍（回到第 1 步，供下一份案例使用）
    let back = 0;
    while (doc.querySelector('#btnPrev') && back++ < 10) {
      doc.querySelector('#btnPrev').click();
      await wait(30);
    }
  }

  await runCase(0, '普工 · 高中');
  await runCase(1, '应届生 · 大专');
  await runCase(2, '转岗 · 本科');

  /* ---- 反向验证：必填是真的会拦，不只是 schema 里标了个 true ---- */
  console.log('\n【反向】渠道空着会被校验拦下');
  const V = window.APP.validators;
  const chField = STEPS.reduce((a, s) => a || (s.fields || []).find(f => f.key === 'channel'), null);
  ok(!!chField && chField.required === true, '渠道字段标着 required');

  // 回到有渠道那一页，确认页面上有必填星号（用户看得见的那个红点）
  let jump = 0;
  while (jump++ < 8 && !doc.getElementById('f-channel')) {
    const b = doc.querySelector('#btnNext');
    if (!b) break;
    b.click();
    await wait(50);
  }
  const chWrap = doc.getElementById('f-channel');
  ok(!!chWrap && !!chWrap.querySelector('.f-label .req'), '页面上渠道那一题带必填星号');

  ok(!!V.validateField(chField, '', {}), '空值 → 报「必填」：' + V.validateField(chField, '', {}));
  ok(!V.validateField(chField, '厂门口', {}), '选了「厂门口」→ 校验通过');

  const refType = STEPS.reduce((a, s) => a || (s.fields || []).find(f => f.key === 'channelRefType'), null);
  ok(!!V.validateField(refType, '', { channel: '经人介绍' }), '选了经人介绍却没选介绍方式 → 也拦得住');

  console.log('\n————————————————————');
  console.log(fails === 0 ? ('全部通过（' + pass + ' 项）') : ('通过 ' + pass + ' 项，失败 ' + fails + ' 项'));
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => {
  console.error('测试崩了：', e && e.stack || e);
  process.exit(1);
});
