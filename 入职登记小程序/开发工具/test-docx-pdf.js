/**
 * 本地验证：docx-lite / pdf-lite / zip-lite 生成的产物是否真的能被 Word / 阅读器打开
 * 只跑在 Node 里（canvas 用 npm 的 canvas 包，仅为测试，不进产物）。
 */
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const WEB = path.resolve(__dirname, '..', '网页');
require(path.join(WEB, 'zip-lite.js'));
require(path.join(WEB, 'docx-lite.js'));
require(path.join(WEB, 'pdf-lite.js'));

const exporter = require(path.join(__dirname, '旧小程序', 'miniprogram', 'utils', 'exporter.js'));

const blocks = exporter.buildBlocks({
  realName: '张明远', idcard: '330106199308124533', gender: '男', birthday: '1993-08-12',
  nation: '汉族', nativePlace: ['浙江省', '杭州市'], marriage: '已婚', politicalStatus: '群众',
  highestEducation: '高中', graduateSchool: '杭州市第二中学', major: '机电一体化',
  graduateDate: '2011-06', title: '中级电工', language: '普通话', certificate: '电工证',
  height: '172', weight: '68', householdType: '农村',
  phone: '13800138000', email: 'zhangmy@163.com',
  permanentRegion: ['浙江省', '杭州市'], permanentDetail: '文三路 100 号 3 幢 201',
  liveRegion: ['浙江省', '杭州市'], liveDetail: '文三路 100 号 3 幢 201',
  householdRegion: ['浙江省', '杭州市'], householdDetail: '文三路 100 号',
  emName: '李秀兰', emRelation: '母亲', emPhone: '13900139000',
  emAddress: '浙江省杭州市西湖区文三路 100 号',
  q1: '否', q2: '否', q3: '否', q4: '否', q5: '否', q6: '否', q7: '否',
  q8: '否', q9: '否', q10: '否', q11: '否', q12: '否', q13: '否', q14: '无',
  channel: '经人介绍', channelRefName: '王强', channelRefRelation: '老乡',
  educations: [{ start: '2008-09', end: '2011-06', school: '杭州市第二中学', major: '理科', degree: '高中', witness: '王老师 13800001111' }],
  works: [{ start: '2011-07', end: '2026-09', company: '杭州精工机械有限公司', duty: '装配工', leave: '个人发展 李经理 13700002222' }]
});

const model = {
  title: '员工信息登记表',
  meta: ['登记编号：DJ20261019-9537', '提交时间：2026-10-19 16:20'],
  header: '应聘职位：________________　　部门：________________　　工号：____________',
  blocks: blocks,
  footer: '本表由员工本人填写；身份证原件已核验，正反面照片与本文件放在同一个文件夹内。'
};

// docx
const docx = globalThis.DocxLite.build(model);
fs.writeFileSync('/tmp/t.docx', docx);
console.log('docx', (docx.length / 1024).toFixed(1) + ' KB', ' blocks', blocks.length,
  ' rows', blocks.reduce((a, b) => a + b.rows.length, 0));

// pdf（用 node-canvas 顶替浏览器 canvas，并留一份首页 PNG 供人眼检查）
const canvases = [];
globalThis.PdfLite.setCanvasFactory(function (w, h) {
  const c = createCanvas(w, h);
  canvases.push(c);
  return c;
});
const pdf = globalThis.PdfLite.build(model);
fs.writeFileSync('/tmp/t.pdf', pdf);
console.log('pdf ', (pdf.length / 1024).toFixed(1) + ' KB', ' pages', canvases.length);
fs.writeFileSync('/tmp/pdfpage1.png', canvases[0].toBuffer('image/png'));
if (canvases[1]) fs.writeFileSync('/tmp/pdfpage2.png', canvases[1].toBuffer('image/png'));

// zip 结构
const z = globalThis.ZipLite.create();
z.dir('入职档案_2026-10-20/');
z.text('入职档案_2026-10-20/打包说明.txt', '中文目录测试');
z.add('入职档案_2026-10-20/张明远/张明远_员工信息登记表.docx', docx);
z.add('入职档案_2026-10-20/张明远/张明远_员工信息登记表.pdf', pdf);
fs.writeFileSync('/tmp/t.zip', z.bytes());
console.log('zip ', (z.bytes().length / 1024).toFixed(1) + ' KB');
