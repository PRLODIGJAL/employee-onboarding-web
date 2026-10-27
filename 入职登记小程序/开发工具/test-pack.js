/**
 * 端到端：打包一个人（Word + 花名册）
 *
 * 重点验这几件事：
 *   1. 只出 Word，不出 PDF（PDF 那套浏览器重画已经下掉了）
 *   2. 受教育情况 / 工作经历真的写进 Word 了
 *      —— 这两块存在 rec.tables 里，打包时必须和 rec.values 合并，
 *         只用 values 的话那两栏永远是空的（就是"Word 里经历没填上"那个 bug）
 *   3. 身份证照片原样进包，zip 里 Word / 花名册 / 说明都在
 *
 *   node test-pack.js
 */
const path = require('path');
const PW = '/Users/langzi/.workbuddy/binaries/node/workspace/node_modules/playwright-core';
const { chromium } = require(PW);

const CHROME = '/Users/langzi/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PAGE = path.resolve(__dirname, '入职登记原型_单文件版.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra == null ? '' : ('→ ' + extra)); }
}

/* 一张 1x1 的透明 PNG，够当"照片"占位 */
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const REC = {
  formNo: 'DJ20261023-0001',
  submittedAt: '2026-10-23T02:00:00.000Z',
  values: {
    realName: '张明远', gender: '男', birthday: '1993-08-12', height: '172', weight: '68',
    nativePlace: ['浙江省', '杭州市'], nation: '汉族',
    politicalStatus: '群众', householdType: '农村',
    highestEducation: '高中', graduateSchool: '杭州市第二中学', graduateDate: '2011-06',
    idcard: '330106199308124533', phone: '13800138000',
    permanentRegion: ['浙江省', '杭州市'], permanentDetail: '文三路 100 号 3 幢 201',
    emName: '李秀兰', emRelation: '母亲', emPhone: '13900139000',
    emAddress: '浙江省杭州市西湖区文三路 100 号',
    q1: '否', q2: '否', q3: '否', q4: '否', q5: '否', q6: '否', q7: '否', q8: '否',
    q9: '否', q10: '否', q11: '否', q12: '否', q13: '否', q14: '无',
    q1CreditType: '芝麻信用分', q1CreditScore: '688', agree: true
  },
  // 真实提交时这两块是分开存的 —— 这里也照实模拟
  tables: {
    educations: [{ start: '2008-09', end: '2011-06', school: '杭州市第二中学', degree: '高中', witness: '王老师 13800001111' }],
    works: [{ start: '2011-07', end: '2026-09', company: '杭州精工机械有限公司', duty: '装配工', leave: '个人发展 李经理 13700002222' }]
  },
  idPhotos: { front: TINY_PNG, back: TINY_PNG }
};

(async function () {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.goto('file://' + PAGE);
  await page.waitForTimeout(800);

  async function runPack() {
    return page.evaluate(async function (rec) {
      window.Api = undefined;              // 纯本机模式
      var r = await window.Pack.build([rec], {});
      // ZipLite 用 store 不压缩，文件名和 docx 正文在字节里都是明文 UTF-8
      var s = new TextDecoder('utf-8').decode(r.bytes);
      return { name: r.name, size: r.bytes.length, report: r.report, text: s };
    }, REC);
  }

  console.log('\n=== 打包（纯本机，没有服务器）===');
  const r = await runPack();
  ok('打包成功', !!r.name, JSON.stringify(r.report));
  ok('包里有 1 份 Word', r.report.word === 1, r.report.word);
  ok('Word 没有失败', r.report.wordFail.length === 0, JSON.stringify(r.report.wordFail));
  ok('身份证两面都进包了', r.report.photos === 2, r.report.photos);
  ok('包不算小（Word 母版就有 180KB）', r.size > 150 * 1024, r.size);

  console.log('\n=== 只出 Word，不出 PDF ===');
  ok('zip 里没有 .pdf 文件', r.text.indexOf('_员工信息登记表.pdf') < 0);
  ok('report 里没有 pdf 计数', r.report.pdf === undefined, JSON.stringify(Object.keys(r.report)));

  console.log('\n=== 教育 / 工作经历真的填进去了 ===');
  ok('受教育情况的学校写进了 Word', r.text.indexOf('杭州市第二中学') > -1);
  ok('受教育情况的证明人写进了 Word', r.text.indexOf('王老师 13800001111') > -1);
  ok('工作经历的公司写进了 Word', r.text.indexOf('杭州精工机械有限公司') > -1);
  ok('工作经历的离职原因写进了 Word', r.text.indexOf('个人经历发展') > -1 || r.text.indexOf('个人发展 李经理') > -1);
  ok('docx 里没有残留占位符', r.text.indexOf('{{edu1.') < 0 && r.text.indexOf('{{work1.') < 0);

  console.log('\n=== zip 里该有的都在 ===');
  ['.docx', '_花名册单行.xlsx', '花名册导入_', '打包说明.txt', '身份证正面', '身份证反面']
    .forEach(function (w) { ok('zip 里有 ' + w, r.text.indexOf(w) > -1); });

  await browser.close();
  console.log('\n————————————————————');
  console.log(fail === 0 ? ('全部通过（' + pass + ' 项）') : ('通过 ' + pass + ' 项，失败 ' + fail + ' 项'));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('跑挂了:', e && e.message);
  process.exit(3);
});
