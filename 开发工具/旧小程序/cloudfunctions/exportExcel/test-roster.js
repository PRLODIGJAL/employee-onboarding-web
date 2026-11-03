/**
 * 本地跑一遍云函数的模板导出，不依赖 wx-server-sdk
 *
 *   node cloudfunctions/exportExcel/test-roster.js
 *
 * 产物：/tmp/cf_1row.xlsx、/tmp/cf_3row.xlsx
 */
const fs = require('fs');
const path = require('path');
const { buildRosterXlsx, COL_COUNT } = require('./roster');

const TPL = path.join(__dirname, 'assets', 'roster-template.xlsx');
const { COLUMNS } = require('../../miniprogram/config/roster-template');

function blank() { return new Array(COL_COUNT).fill(''); }
function idx(k) {
  const i = COLUMNS.findIndex(c => c.key === k);
  if (i < 0) throw new Error('没有列 ' + k);
  return i;
}

const a = blank();
a[idx('realname')] = '张明远';
a[idx('employee_no')] = 'BM2026001';
a[idx('event_type')] = '入职';
a[idx('telephone')] = '13800138000';
a[idx('id_no_id_no')] = '330106199203071234';

const b = blank();
b[idx('realname')] = '李思彤 & <测试>';
b[idx('event_type')] = '入职';

const c = blank();
c[idx('realname')] = '王小虎';
c[idx('event_type')] = '入职';

fs.writeFileSync('/tmp/cf_1row.xlsx', buildRosterXlsx(TPL, [a]));
fs.writeFileSync('/tmp/cf_3row.xlsx', buildRosterXlsx(TPL, [a, b, c]));
console.log('ok');
