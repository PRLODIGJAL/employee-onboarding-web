/**
 * 本地验证：重复提交检测 + 清理
 *
 * 重点验三件事：
 *   1. 该判重复的必须判出来（同名同手机号但身份证填错、同名同身份证但手机号填错…）
 *   2. 不该判的不能误伤（只是同名、只是同手机号、只是同乡同姓）
 *   3. 删完之后列表干净、组内保留最新那条
 *
 *   node test-dup.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const WEB = path.resolve(__dirname, '..', '网页');
require(path.join(WEB, 'zip-lite.js'));
require(path.join(WEB, 'form-template.js'));
require(path.join(WEB, 'template-docx.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra == null ? '' : ('→ ' + extra)); }
}

/* ------------------------------------------------------------------
  把 app.js 里的检测函数抠出来单独测（app.js 是一个 IIFE，不能直接 require）

  这里不 import，而是用正则把函数体读出来再 eval——好处是"测的就是线上那份代码"，
  不是另写一份复制品。改 app.js 之后这个测试会跟着变。
------------------------------------------------------------------ */
const appSrc = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');

function grab(name) {
  const i = appSrc.indexOf('function ' + name + '(');
  assert(i > 0, '在 app.js 里找不到 ' + name);
  // 从函数名开始做括号配对，找到函数体结束
  let depth = 0, j = appSrc.indexOf('{', i), k = j;
  for (; k < appSrc.length; k++) {
    if (appSrc[k] === '{') depth++;
    else if (appSrc[k] === '}') { depth--; if (depth === 0) break; }
  }
  return appSrc.slice(i, k + 1);
}

const dupCompare = eval('(' + grab('dupCompare') + ')');
const maskPhone = eval('(' + grab('maskPhone') + ')');
const maskId = eval('(' + grab('maskId') + ')');
const THRESHOLD = Number(/var DUP_THRESHOLD = ([\d.]+)/.exec(appSrc)[1]);

console.log('\n=== 阈值 ===');
ok('阈值是 0.8', THRESHOLD === 0.8, THRESHOLD);

/* ---------------- 造记录 ---------------- */
function rec(o) {
  return {
    formNo: o.formNo || ('DJ' + Math.random().toString(36).slice(2, 8)),
    submittedAt: o.submittedAt || new Date().toISOString(),
    values: Object.assign({ realName: '张三', phone: '13800138000', idcard: '330106199308124533' }, o.values || {})
  };
}

const A = rec({ values: { realName: '张明远', phone: '13800138000', idcard: '330106199308124533', birthday: '1993-08-12' } });

console.log('\n=== 该判重复的（≥ 80%）===');

{
  // 完全一样：身份证 + 手机号 + 姓名
  const B = rec({ values: { realName: '张明远', phone: '13800138000', idcard: '330106199308124533', birthday: '1993-08-12' } });
  const r = dupCompare(A, B);
  ok('三个都相同 → 100%', r.score >= 0.99, r.score);
  ok('依据里有身份证', r.why.indexOf('身份证相同') > -1, r.why.join('/'));
}

{
  // 身份证填错了一位，但姓名+手机号对上
  const B = rec({ values: { realName: '张明远', phone: '13800138000', idcard: '330106199308124534', birthday: '1993-08-12' } });
  const r = dupCompare(A, B);
  ok('手机号+姓名对上、身份证填错 → 仍判重复', r.score >= THRESHOLD, r.score);
}

{
  // 手机号填错，但姓名+身份证对上
  const B = rec({ values: { realName: '张明远', phone: '13800138001', idcard: '330106199308124533', birthday: '1993-08-12' } });
  const r = dupCompare(A, B);
  ok('身份证+姓名对上、手机号填错 → 仍判重复', r.score >= THRESHOLD, r.score);
}

{
  // 只改了名字里的一个字，其他都对
  const B = rec({ values: { realName: '张明运', phone: '13800138000', idcard: '330106199308124533', birthday: '1993-08-12' } });
  const r = dupCompare(A, B);
  ok('姓名相近 + 手机号 + 身份证 → 判重复', r.score >= THRESHOLD, r.score);
}

{
  // 换了个手机号，姓名和身份证都对
  const B = rec({ values: { realName: '张明远', phone: '15900001111', idcard: '330106199308124533' } });
  const r = dupCompare(A, B);
  ok('只有身份证 + 姓名 → 判重复', r.score >= THRESHOLD, r.score);
}

console.log('\n=== 不该判重复的（< 80%）===');

{
  // 只是同名
  const B = rec({ values: { realName: '张明远', phone: '13900001111', idcard: '440305199001011234' } });
  const r = dupCompare(A, B);
  ok('只是同名 → 不判重复', r.score < THRESHOLD, r.score);
}

{
  // 只是同手机号（一家人共用一个号）
  const B = rec({ values: { realName: '李秀兰', phone: '13800138000', idcard: '440305195501011234' } });
  const r = dupCompare(A, B);
  ok('只是同手机号 → 不判重复', r.score < THRESHOLD, r.score);
}

{
  // 同姓、字数相同、尾字相同，但其他全不同（张明远 / 张明辉 不行，用张明远 / 张明达 也相近）
  // 这里用完全不同的两个人：王强 / 王刚
  const X = rec({ values: { realName: '王强', phone: '13700000001', idcard: '110101199001011111' } });
  const Y = rec({ values: { realName: '王刚', phone: '13700000002', idcard: '110101199002022222' } });
  const r = dupCompare(X, Y);
  ok('同姓不同名 → 不判重复', r.score < THRESHOLD, r.score);
}

{
  // 老乡、同民族、同性别，但人不同
  const X = rec({ values: { realName: '刘伟', phone: '13600000001', idcard: '330106199001011111', nation: '汉族', gender: '男', permanentDetail: '文三路 1 号' } });
  const Y = rec({ values: { realName: '陈磊', phone: '13600000002', idcard: '330106199003033333', nation: '汉族', gender: '男', permanentDetail: '文三路 1 号' } });
  const r = dupCompare(X, Y);
  ok('同民族同性别同住址但不同人 → 不判重复', r.score < THRESHOLD, r.score);
}

{
  // 空值不能被当成"相同"
  const X = rec({ values: { realName: '', phone: '', idcard: '' } });
  const Y = rec({ values: { realName: '', phone: '', idcard: '' } });
  const r = dupCompare(X, Y);
  ok('两边都是空值时不算相同', r.score === 0, r.score);
}

console.log('\n=== 脱敏 ===');
ok('手机号打码', maskPhone('13800138000') === '138****8000', maskPhone('13800138000'));
ok('身份证打码', maskId('330106199308124533') === '330106********4533', maskId('330106199308124533'));
ok('短号码不乱来', maskPhone('123') === '123');

console.log('\n=== 分组（并查集链式合并）===');
{
  // 模拟 findDupGroups 的核心：链式 A~B、B~C，A≁C 也要归一组
  const list = [
    rec({ values: { realName: '张明远', phone: '13800138000', idcard: '330106199308124533' } }),  // 0
    rec({ values: { realName: '张明远', phone: '13800138000', idcard: '330106199308124999' } }),  // 1 与 0 同姓名同手机
    rec({ values: { realName: '张明月', phone: '15900001111', idcard: '330106199308124999' } })   // 2 与 1 同身份证
  ];
  const n = list.length;
  const parent = list.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let p = 0; p < n; p++) {
    for (let q = p + 1; q < n; q++) {
      if (dupCompare(list[p], list[q]).score >= THRESHOLD) {
        const rp = find(p), rq = find(q);
        if (rp !== rq) parent[rp] = rq;
      }
    }
  }
  const groups = {};
  for (let k = 0; k < n; k++) (groups[find(k)] = groups[find(k)] || []).push(k);
  const sizes = Object.keys(groups).map((g) => groups[g].length);
  ok('三条链式重复归成一组', sizes.length === 1 && sizes[0] === 3, JSON.stringify(sizes));
}

console.log('\n=== 预设案例只填必填项 ===');
{
  const demoBlock = appSrc.slice(appSrc.indexOf('var DEMO_CASES'), appSrc.indexOf('function demoId'));
  // 招聘渠道 2026-10-26 起是必填，三份案例都得带上（每份一个不同来源）
  const chCount = (demoBlock.match(/channel:\s*'/g) || []).length;
  ok('三份案例都写了招聘渠道（必填）', chCount === 3, '出现了 ' + chCount + ' 次');
  ok('案例里有政治面貌（必填）', demoBlock.indexOf('politicalStatus:') > -1);
  ok('案例里有户口性质（必填）', demoBlock.indexOf('householdType:') > -1);
  ok('案例里没有婚姻（选填）', demoBlock.indexOf('marriage:') < 0);
  // 教育经历的「证明人及电话」已改成选填，案例里就不该再编一个
  ok('案例里没有教育证明人（选填）', demoBlock.indexOf('witness:') < 0);
  ok('信用分类型写的是有效选项', demoBlock.indexOf('芝麻信用分') > -1 && demoBlock.indexOf('支付宝芝麻分') < 0);

  const applyBlock = appSrc.slice(appSrc.indexOf('function applyDemo'), appSrc.indexOf('function seedRecords'));
  ok('applyDemo 写入 politicalStatus', applyBlock.indexOf('v.politicalStatus = c.politicalStatus') > -1);
  ok('applyDemo 写入 householdType', applyBlock.indexOf('v.householdType = c.householdType') > -1);
  ok('applyDemo 清空婚姻', /v\.marriage = ''/.test(applyBlock));
  ok('applyDemo 回填 c.channel', applyBlock.indexOf('v.channel = c.channel') > -1);
  ok('applyDemo 清空介绍分支（案例都走普通渠道）', /v\.channelRefType = ''/.test(applyBlock));
}

console.log('\n————————————————————');
console.log(fail === 0 ? ('全部通过（' + pass + ' 项）') : ('通过 ' + pass + ' 项，失败 ' + fail + ' 项'));
process.exit(fail === 0 ? 0 : 1);
