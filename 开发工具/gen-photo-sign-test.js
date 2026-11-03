/**
 * 造一份「最满 + 证件照 + 手写签名」的登记表，用来验证：
 *   1. 照片是不是刚好嵌在照片格里（不把行撑高、不变形）
 *   2. 两处签字栏是不是都出现了签名，日期是不是自动填上
 *   3. 仍然是两页
 * 输出 /tmp/full.docx（以及图片本身 /tmp/test-photo.jpg、/tmp/test-sign.png）
 */
const path = require('path');
const fs = require('fs');
const WEB = path.resolve(__dirname, '..', '网页');
require(path.join(WEB, 'zip-lite.js'));
require(path.join(WEB, 'form-template.js'));
require(path.join(WEB, 'template-docx.js'));

function b64(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'png' : 'jpeg';
  return 'data:image/' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
}

const photoData = process.argv[2] ? b64(process.argv[2]) : '';
const signData = process.argv[3] ? b64(process.argv[3]) : '';

const values = {
  realName: '欧阳建国', gender: '男', birthday: '1988-11-23', height: '178', weight: '82',
  nativePlace: ['黑龙江省', '哈尔滨市'], nation: '汉族',
  politicalStatus: '群众', householdType: '农村', marriage: '已婚',
  highestEducation: '本科（全日制）', title: '中级工程师（机械）',
  language: '普通话二级甲等，英语 CET-4（435 分）',
  certificate: '电工证、焊工证、叉车证、消防设施操作员证',
  graduateDate: '2010-06', graduateSchool: '哈尔滨理工大学机械动力工程学院',
  major: '机械设计制造及其自动化', idcard: '230103198811234512',
  phone: '13800138000', email: 'ouyangjianguo1988@163.com',
  householdRegion: ['黑龙江省', '哈尔滨市'], householdDetail: '南岗区学府路 52 号 3 栋 2 单元 401 室',
  permanentRegion: ['黑龙江省', '哈尔滨市'], permanentDetail: '南岗区学府路 52 号 3 栋 2 单元 401 室（学府凯德广场对面）',
  liveRegion: ['广东省', '东莞市'], liveDetail: '松山湖园区科技九路 6 号博迈医疗员工宿舍 B 栋 508 室',
  emName: '欧阳立春', emRelation: '父亲', emPhone: '13900139000',
  emAddress: '黑龙江省哈尔滨市南岗区学府路 52 号 3 栋 2 单元 401 室',
  educations: [{
    start: '2006-09', end: '2010-06', school: '哈尔滨理工大学机械动力工程学院',
    degree: '本科（全日制）', major: '机械设计制造及其自动化', witness: '刘志刚老师 13700001111'
  }],
  works: [
    {
      start: '2019-03', end: '2026-09', company: '东莞市精诚精密机械制造有限公司松山湖分公司',
      duty: '设备主管', leave: '个人职业发展 张海涛经理 13700002222'
    },
    {
      start: '2010-07', end: '2019-02', company: '哈尔滨重型装备制造集团有限责任公司',
      duty: '机械装配技工、班组长', leave: '随家人迁居东莞 王志强主管 13700003333'
    }
  ],
  q1: '否', q1CreditType: '芝麻信用分', q1CreditScore: '742',
  q2: '否', q3: '否', q4: '否', q5: '否', q6: '否', q7: '否', q8: '否',
  q9: '否', q10: '否', q11: '否', q12: '否', q13: '否', q14: '无',
  channel: '经人介绍', channelRefType: '内部推荐', channelRefName: '陈国强', channelRefRelation: '同乡',
  submittedAt: '2026-10-23T02:31:00.000Z',
  photoData: photoData,
  signData: signData,
  agree: true
};

const bytes = globalThis.TemplateDocx.build(values, { noWork: false });
const xml = Buffer.from(bytes).toString('utf8');
const left = (xml.match(/\{\{[^}]+\}\}/g) || []);

console.log('输出 /tmp/full.docx', (bytes.length / 1024).toFixed(0) + 'KB');
console.log('未替换占位符:', left.length, left.slice(0, 5));
console.log('照片 <w:drawing> 数:', (xml.match(/<w:drawing>/g) || []).length);
console.log('照片格还留着「照片」两字:', /<w:t>照片<\/w:t>/.test(xml));
console.log('签字日期:', (xml.match(/2026-10-23/g) || []).length, '处');
console.log('本次行距: base=%s used=%s', globalThis.TemplateDocx.spacing().base, globalThis.TemplateDocx.spacing().used);
fs.writeFileSync('/tmp/full.docx', Buffer.from(bytes));
