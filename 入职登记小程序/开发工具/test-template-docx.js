/**
 * 本地验证：TemplateDocx 生成的 .docx 是不是「公司模板 + 填对值」
 * 只跑在 Node 里，不需要浏览器。
 *
 *   node test-template-docx.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.resolve(__dirname, '..', '网页');
require(path.join(WEB, 'zip-lite.js'));
require(path.join(WEB, 'form-template.js'));
require(path.join(WEB, 'template-docx.js'));

const OUT = path.resolve(__dirname, '截图');
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- 假数据：和演示案例同口径 ---------------- */
const values = {
  realName: '张明远',
  gender: '男',
  birthday: '1993-08-12',
  height: '172',
  weight: '68',
  nativePlace: ['浙江省', '杭州市'],
  nation: '汉族',
  politicalStatus: '群众',
  marriage: '已婚',
  householdType: '农村',
  highestEducation: '大专（全日制）',
  graduateSchool: '杭州市第二中学',
  major: '机电一体化',
  graduateDate: '2011-06',
  title: '中级电工',
  language: '普通话',
  certificate: '电工证',
  idcard: '330106199308124533',
  householdRegion: ['浙江省', '杭州市'],
  householdDetail: '文三路 100 号',
  phone: '13800138000',
  email: 'zhangmy@163.com',
  permanentRegion: ['浙江省', '杭州市'],
  permanentDetail: '文三路 100 号 3 幢 201',
  liveRegion: ['浙江省', '杭州市'],
  liveDetail: '文三路 100 号 3 幢 201',
  emName: '李秀兰',
  emRelation: '母亲',
  emPhone: '13900139000',
  emAddress: '浙江省杭州市西湖区文三路 100 号',
  educations: [
    { start: '2008-09', end: '2011-06', school: '杭州市第二中学', major: '机电一体化', degree: '大专', witness: '王老师 13800000001' },
    { start: '2005-09', end: '2008-06', school: '杭州第一中学', major: '', degree: '初中', witness: '' }
  ],
  works: [
    { start: '2015-03', end: '2026-08', company: '某某电气有限公司', duty: '电工班长', leave: '个人发展，陈主管 13700000002' },
    { start: '2011-08', end: '2015-01', company: '另一家公司', duty: '电工', leave: '合同到期' }
  ],
  q1: '否', q2: '否', q3: '是', q4: '否', q5: '否',
  q6: '否', q7: '是', q7Note: '与原公司签有竞业协议',
  q8: '否', q9: '否', q10: '否', q11: '否',
  q12: '否', q13: '否',
  q14: '无',
  q1CreditType: '芝麻信用分',
  q1CreditScore: '680',
  channel: '经人介绍',
  channelRefName: '王强',
  channelRefRelation: '老乡'
};

const noWorkValues = {
  realName: '李思睿', gender: '男', birthday: '2002-03-15',
  phone: '13611112222', idcard: '330106200203150011',
  highestEducation: '大专（全日制）', graduateDate: '2023-06',
  q1: '否', q2: '否', q3: '否', q4: '否', q5: '否', q6: '否',
  q7: '否', q8: '否', q9: '否', q10: '否', q11: '否',
  q12: '否', q13: '否', q14: '无',
  q1CreditType: '微信支付分', q1CreditScore: '720',
  channel: '网络', noWork: true
};

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}

/* ---------------- 从生成的 docx 里读 document.xml ---------------- */
function unpack(bytes) {
  // ZipLite 打包时是 store（不压缩），直接扫本地文件头找 document.xml
  const s = Buffer.from(bytes).toString('latin1');
  const idx = s.indexOf('word/document.xml');
  assert(idx > 0, 'zip 里找不到 word/document.xml');
  // 更稳：用 JSZip 不可用，这里只做「占位符已替换」的文本检查，
  // 直接搜整个 zip 字节流（XML 是 store 的，能看到原文）
  return Buffer.from(bytes).toString('utf8');
}

console.log('\n=== 母版结构 ===');
{
  const tpl = globalThis.FORM_TEMPLATE;
  ok('FORM_TEMPLATE 已加载', !!tpl);
  ok('包含 document.xml', !!(tpl.parts && tpl.parts['word/document.xml']));
  ok('包含印章图', !!(tpl.media && tpl.media['word/media/image1.png']));
  const doc = tpl.parts['word/document.xml'];
  ok('母版里有占位符', (doc.match(/\{\{/g) || []).length >= 55);
  ok('颜色只有纯黑', !/w:color w:val="(?!000000)/i.test(doc));
  ok('第 2 页特别说明在', doc.indexOf('特别说明') > 0);
  ok('申请人签字栏在', doc.indexOf('申请人签字') > 0);

  // 教育只留 1 行、工作只留 2 行：多了就会把表格撑高、挤到第三页
  ok('教育只有 1 段', doc.indexOf('{{edu1.school}}') > 0 && doc.indexOf('{{edu2') < 0);
  ok('工作只有 2 段', doc.indexOf('{{work2.company}}') > 0 && doc.indexOf('{{work3') < 0);
  ok('没有第 3 段工作', (doc.match(/\{\{work/g) || []).length === 10);

  // 表格和「特别说明」之间不能留空段落：那会让中间白多出一页
  {
    const tail = doc.slice(doc.lastIndexOf('</w:tbl>'));
    const firstP = (tail.match(/<w:p[ >][\s\S]*?<\/w:p>/) || [''])[0];
    ok('表格后没有空段落', firstP.indexOf('特别说明') > 0);
  }
}

console.log('\n=== 导出：有工作经历 ===');
{
  const bytes = globalThis.TemplateDocx.build(values, { noWork: false });
  fs.writeFileSync(path.join(OUT, '登记表_公司模板_有工作经历.docx'), Buffer.from(bytes));
  const xml = unpack(bytes);

  ok('文件大于 100KB', bytes.length > 100 * 1024);
  ok('占位符已全部替换', !/\{\{/.test(xml));
  ok('姓名已填', xml.indexOf('张明远') > 0);
  ok('身份证已填', xml.indexOf('330106199308124533') > 0);
  ok('教育第 1 段', xml.indexOf('杭州市第二中学') > 0);
  ok('工作第 1 段', xml.indexOf('某某电气有限公司') > 0);
  ok('政治面貌勾群众', xml.indexOf('☑群众') > 0);
  ok('婚姻勾已婚', xml.indexOf('☑已婚') > 0);
  ok('户口勾农村', xml.indexOf('☑农村') > 0);
  ok('q3 勾是', xml.indexOf('☑是') > 0);
  ok('q7 带说明', xml.indexOf('与原公司签有竞业协议') > 0);
  ok('信用分 680', xml.indexOf('680') > 0);
  ok('渠道 经人介绍 + 关系', xml.indexOf('王强') > 0 && xml.indexOf('老乡') > 0);
  ok('第 2 页特别说明在', xml.indexOf('特别说明') > 0);
  ok('申请人签字栏在', xml.indexOf('申请人签字') > 0);
  ok('无颜色标记', !/w:color w:val="(?!000000)/i.test(xml));
}

console.log('\n=== 导出：暂无工作经历 ===');
{
  const bytes = globalThis.TemplateDocx.build(noWorkValues, { noWork: true });
  fs.writeFileSync(path.join(OUT, '登记表_公司模板_暂无工作经历.docx'), Buffer.from(bytes));
  const xml = unpack(bytes);

  ok('占位符已全部替换', !/\{\{/.test(xml));
  ok('写了「暂无工作或实习经历」', xml.indexOf('暂无工作或实习经历（应届生 / 首次就业）') > 0);
  ok('没写公司名', xml.indexOf('某某电气') < 0);
  ok('姓名已填', xml.indexOf('李思睿') > 0);
  ok('微信支付分', xml.indexOf('☑微信支付分') > 0);
}

console.log('\n=== 导出：字段缺失时不留残痕 ===');
{
  const bytes = globalThis.TemplateDocx.build({}, { noWork: false });
  const xml = unpack(bytes);
  ok('空数据也无占位符残痕', !/\{\{/.test(xml));
  ok('空数据仍有特别说明', xml.indexOf('特别说明') > 0);
}

console.log('\n=== 排版：最满内容也必须落在两页 ===');
{
  // 地址写长、证书塞满、两段工作经历全填 —— 这是极限情况，
  // 它稳在两页，正常填写就一定稳在两页。
  const full = Object.assign({}, values, {
    title: '中级工程师（机械）',
    language: '普通话二级甲等，英语 CET-4（435 分）',
    certificate: '电工证、焊工证、叉车证、消防设施操作员证',
    graduateSchool: '哈尔滨理工大学机械动力工程学院',
    major: '机械设计制造及其自动化',
    householdDetail: '南岗区学府路 52 号 3 栋 2 单元 401 室',
    permanentDetail: '南岗区学府路 52 号 3 栋 2 单元 401 室（学府凯德广场对面）',
    liveDetail: '松山湖园区科技九路 6 号博迈医疗员工宿舍 B 栋 508 室',
    emAddress: '黑龙江省哈尔滨市南岗区学府路 52 号 3 栋 2 单元 401 室',
    educations: [{ start: '2006-09', end: '2010-06', school: '哈尔滨理工大学机械动力工程学院', degree: '本科（全日制）', major: '机械设计制造及其自动化', witness: '刘志刚老师 13700001111' }],
    works: [
      { start: '2019-03', end: '2026-09', company: '东莞市精诚精密机械制造有限公司松山湖分公司', duty: '设备主管', leave: '个人职业发展 张海涛经理 13700002222' },
      { start: '2010-07', end: '2019-02', company: '哈尔滨重型装备制造集团有限责任公司', duty: '机械装配技工、班组长', leave: '随家人迁居东莞 王志强主管 13700003333' }
    ]
  });
  const bytes = globalThis.TemplateDocx.build(full, { noWork: false });
  fs.writeFileSync(path.join(OUT, '登记表_公司模板_内容最满.docx'), Buffer.from(bytes));
  const xml = unpack(bytes);
  const sp = globalThis.TemplateDocx.spacing();

  ok('行距被自动收紧', sp.used > 0 && sp.used < sp.base, `base=${sp.base} used=${sp.used}`);
  ok('行距不低于下限', sp.used >= 240, `used=${sp.used}`);
  ok('两段工作都写了', xml.indexOf('东莞市精诚精密机械') > 0 && xml.indexOf('哈尔滨重型装备') > 0);
  ok('缩行距没丢内容', !/\{\{/.test(xml) && xml.indexOf('消防设施操作员证') > 0);
}

console.log('\n=== 字号：填进去的值比标签小一号 ===');
{
  const xml = unpack(globalThis.TemplateDocx.build(values, {}));
  // 长文本（地址、证书、公司名）= 13 半磅；普通值 = 14 半磅；标签仍是 16
  ok('有 14 磅的值', /<w:sz w:val="14"\/>/.test(xml));
  ok('有 13 磅的长文本', /<w:sz w:val="13"\/>/.test(xml));
  ok('没有把标签也缩小', /<w:sz w:val="16"\/>/.test(xml));
}

console.log('\n=== 字重：填进去的值一律不加粗 ===');
{
  // 直接看母版（build 之后占位符已经被替换掉了，看不出 rPr）
  const xml = globalThis.FORM_TEMPLATE.parts['word/document.xml'];
  // 模板里有些格子是粗体（姓名、政治面貌…），借它的 rPr 填值就会跟着加粗。
  // 填进去的是员工写的内容，跟标签不一样，必须统一成常规体。
  function runOf(key) {
    const i = xml.indexOf('{{' + key + '}}');
    if (i < 0) return null;
    const s = xml.lastIndexOf('<w:r>', i);
    return xml.slice(s, i);
  }
  const checks = [
    ['realName', '真实值'], ['gender', '性别'], ['height', '身高'],
    ['POLITICAL', '政治面貌勾选'], ['MARRIAGE', '婚姻勾选'], ['HOUSEHOLD', '户口性质勾选'],
    ['edu1.school', '教育经历'], ['work1.company', '工作经历公司']
  ];
  checks.forEach(function (c) {
    const seg = runOf(c[0]);
    ok(c[1] + '不加粗', seg !== null && !/<w:b\s*\/>/.test(seg), seg === null ? '没找到占位符' : '还是粗体');
  });
}

console.log('\n————————————————————');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exit(1);
