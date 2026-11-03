/**
 * 验证「以模板为底板」的导出是否真的保住了模板结构
 *
 *   node test-template.js
 *
 * 产出 /tmp/out_1row.xlsx、/tmp/out_3row.xlsx，然后交给 verify.py 用 openpyxl 检查。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;

const WEB = path.resolve(__dirname, '..', '网页');
function load(f) {
  vm.runInThisContext(fs.readFileSync(path.join(WEB, f), 'utf8'), { filename: f });
}

load('roster-template-b64.js');
load('xlsx-lite.js');

// 造三行假数据：只填姓名/工号/手机/身份证这类关键列，其余留空，模拟真实稀疏行
const N = 119;
function blank() { return new Array(N).fill(''); }

// 从 COLUMNS 里找几列的真实下标，确保写到了对的位置
// 小程序那套 2026-10-21 已停用，源码整体挪进 开发工具/旧小程序/；
// 兼容两个位置，省得下次搬家又断一次
function loadCols() {
  const cands = [
    path.resolve(__dirname, '..', 'miniprogram', 'config', 'roster-template.js'),
    path.resolve(__dirname, '旧小程序', 'miniprogram', 'config', 'roster-template.js')
  ];
  for (const p of cands) if (fs.existsSync(p)) return require(p).COLUMNS;
  throw new Error('找不到 roster-template.js，找过：\n' + cands.join('\n'));
}
const COLS = loadCols();
function idx(k) {
  const i = COLS.findIndex(c => c.key === k);
  if (i < 0) throw new Error('模板里没有列 ' + k);
  return i;
}

const rowA = blank();
rowA[idx('realname')] = '张明远';
rowA[idx('employee_no')] = 'BM2026001';
rowA[idx('telephone')] = '13800138000';
rowA[idx('id_no_id_no')] = '330106199203071234';
rowA[idx('personal_email')] = 'zhangmy@example.com';
rowA[idx('department')] = '根部门/研发中心/平台组';
rowA[idx('duty')] = '后端工程师';
rowA[idx('event_type')] = '入职';

const rowB = blank();
rowB[idx('realname')] = '李思彤 & <测试> "引号"';
rowB[idx('employee_no')] = 'BM2026002';

const rowC = blank();
rowC[idx('realname')] = '王小虎';
rowC[idx('employee_no')] = 'BM2026003';

async function save(rows, file) {
  const blob = window.XLSXLite.fromTemplate(rows);
  const buf = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(file, buf);
  console.log(file, buf.length, 'bytes');
}

(async () => {
  await save([rowA], '/tmp/out_1row.xlsx');
  await save([rowA, rowB, rowC], '/tmp/out_3row.xlsx');
})().catch(e => { console.error(e); process.exit(1); });
