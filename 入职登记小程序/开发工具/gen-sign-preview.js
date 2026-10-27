/**
 * 只看签字：把母版裁成「只剩最后两行表格」和「只剩特别说明」两个版本，
 * 再走一遍真正的 build()，签字图才会真的插进去。裁完签字栏直接落在第一页顶部，
 * 打开 Word 一眼就能看见，不用滚动。
 *
 * 只为看效果，不是产物。输出 /tmp/sig1.docx、/tmp/sig2.docx
 */
const path = require('path');
const fs = require('fs');
const WEB = path.resolve(__dirname, '..', '网页');
require(path.join(WEB, 'zip-lite.js'));
require(path.join(WEB, 'form-template.js'));
require(path.join(WEB, 'template-docx.js'));

function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return 'data:image/' + (ext === 'png' ? 'png' : 'jpeg') + ';base64,'
    + fs.readFileSync(file).toString('base64');
}

const values = {
  realName: '欧阳建国', gender: '男', birthday: '1988-11-23', height: '178', weight: '82',
  nativePlace: ['黑龙江省', '哈尔滨市'], nation: '汉族', politicalStatus: '群众',
  householdType: '农村', highestEducation: '本科', idcard: '230103198811234512',
  phone: '13800138000', submittedAt: '2026-10-23T02:31:00.000Z',
  photoData: dataUrl('/tmp/test-photo.jpg'),
  signData: dataUrl('/tmp/test-sign.png'),
  q1: '否', q2: '否', q3: '否', q4: '否', q5: '否', q6: '否', q7: '否', q8: '否',
  q9: '否', q10: '否', q11: '否', q12: '否', q13: '否', q14: '无', channel: '网络'
};

const tpl = globalThis.FORM_TEMPLATE;
const ORIGINAL = tpl.parts['word/document.xml'];

function variant(name, mutate) {
  tpl.parts['word/document.xml'] = mutate(ORIGINAL);
  const bytes = globalThis.TemplateDocx.build(values, {});
  fs.writeFileSync('/tmp/' + name, Buffer.from(bytes));
  console.log('写出 /tmp/' + name, (bytes.length / 1024).toFixed(0) + 'KB');
}

// 一：只留表格最后两行（渠道 + 声明/签字）
variant('sig1.docx', function (doc) {
  const rows = doc.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
  const keep = rows.slice(-2);
  rows.forEach(function (r, i) {
    if (i < rows.length - 2) doc = doc.replace(r, '');
  });
  return doc;
});

// 三：只留「申请人签字 / 日期」那两段，直接落在第一页顶部
variant('sig3.docx', function (doc) {
  const bodyS = doc.indexOf('<w:body>') + '<w:body>'.length;
  const bodyE = doc.indexOf('</w:body>');
  const body = doc.slice(bodyS, bodyE);
  const ps = body.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
  const keep = ps.filter(function (p) {
    return p.indexOf('申请人签字') > -1 || (p.indexOf('日期：') > -1 && p.indexOf('{{date2}}') > -1);
  });
  const sect = body.slice(body.lastIndexOf('<w:sectPr'));
  return doc.slice(0, bodyS) + keep.join('') + sect + doc.slice(bodyE);
});
