/**
 * 服务端接口测试：处理状态 / 备注的读写
 *
 *   node 开发工具/test-meta-api.js
 *
 * 在临时目录里起一个干净的服务端（不碰真实 data/），验证：
 *   1. 没登录不能改状态（401）
 *   2. 登录后能标"已入职" + 写备注，列表读得回来
 *   3. 状态只认 pending / hired / back，乱传被拒
 *   4. 员工重试提交同一份表，不会把 HR 标好的状态冲掉
 *   5. 备注长度被截到 200 字
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'onboard-meta-test');
const PORT = 8919;
const BASE = 'http://127.0.0.1:' + PORT;

let fails = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails++; }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function j(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-token'] = token;
  const r = await fetch(BASE + url, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await r.json(); } catch (e) { }
  return { status: r.status, data: data };
}

(async () => {
  // 搭一个干净的临时服务端：复制代码，清空 data，网页目录用符号链接指过去
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.cpSync(path.join(ROOT, '服务器'), path.join(TMP, 'server'), { recursive: true });
  fs.rmSync(path.join(TMP, 'server', 'data'), { recursive: true, force: true });
  fs.mkdirSync(path.join(TMP, 'server', 'data'), { recursive: true });
  fs.rmSync(path.join(TMP, 'server', 'logs'), { recursive: true, force: true });
  try { fs.symlinkSync(path.join(ROOT, '网页'), path.join(TMP, '网页')); } catch (e) { }

  const child = spawn(process.execPath, [path.join(TMP, 'server', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: '127.0.0.1' }),
    stdio: 'pipe'
  });
  child.stdout.on('data', () => { });
  child.stderr.on('data', d => process.stderr.write('[srv] ' + d));

  // 等服务起来
  let up = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await j('GET', '/api/ping');
      if (r.data && r.data.ok) { up = true; break; }
    } catch (e) { }
    await wait(100);
  }
  if (!up) { console.log('服务器没起来'); child.kill(); process.exit(1); }

  try {
    console.log('\n【1】没登录不能改状态');
    const noAuth = await j('POST', '/api/record/TEST0001/meta', { status: 'hired' });
    ok(noAuth.status === 401, '未登录被拒（' + noAuth.status + '）');

    console.log('\n【2】登录 + 提交一份表');
    const login = await j('POST', '/api/login', { empNo: 'HR001', password: 'bmai2026' });
    ok(login.data.ok === true, 'HR001 登录成功');
    const token = login.data.token;

    const formNo = 'DJ20261022-9001';
    const sub = await j('POST', '/api/submit', {
      formNo: formNo,
      submittedAt: new Date().toISOString(),
      values: { realName: '测试甲', phone: '13800000001', gender: '女' },
      tables: { works: [] },
      idPhotos: {}
    });
    ok(sub.data.ok === true, '提交成功');

    let list = await j('GET', '/api/records', undefined, token);
    let rec = (list.data.list || []).filter(x => x.formNo === formNo)[0];
    ok(!!rec, '列表里能查到这条');
    ok(rec.status === 'pending', '新记录默认 pending（实际 ' + rec.status + '）');
    ok(rec.remark === '', '备注默认空');

    console.log('\n【3】标"已入职" + 写备注');
    const m1 = await j('POST', '/api/record/' + formNo + '/meta',
      { status: 'hired', remark: '已确认 11 月 3 日到岗' }, token);
    ok(m1.data.ok === true, '标状态成功');

    list = await j('GET', '/api/records', undefined, token);
    rec = list.data.list.filter(x => x.formNo === formNo)[0];
    ok(rec.status === 'hired', '列表里读到 hired');
    ok(rec.remark === '已确认 11 月 3 日到岗', '备注读回来了：' + rec.remark);
    ok(!!rec.statusAt && !!rec.statusBy, '记下了改动时间和经办人（' + rec.statusBy + '）');

    console.log('\n【4】乱传状态 / 超长备注');
    const bad = await j('POST', '/api/record/' + formNo + '/meta', { status: 'delete' }, token);
    ok(bad.status === 400, '非法状态被拒（' + bad.status + '）');

    const longText = '备'.repeat(400);
    const m2 = await j('POST', '/api/record/' + formNo + '/meta', { status: 'back', remark: longText }, token);
    ok(m2.data.remark.length === 200, '备注被截到 200 字（实际 ' + m2.data.remark.length + '）');

    // 改回已入职，方便下一步验证
    await j('POST', '/api/record/' + formNo + '/meta', { status: 'hired', remark: '等入职' }, token);

    console.log('\n【5】员工重试提交，不冲掉 HR 的状态');
    const sub2 = await j('POST', '/api/submit', {
      formNo: formNo,
      submittedAt: new Date().toISOString(),
      values: { realName: '测试甲', phone: '13800000002', gender: '女' },
      tables: { works: [] },
      idPhotos: {}
    });
    ok(sub2.data.ok === true, '同一编号重试提交成功');
    list = await j('GET', '/api/records', undefined, token);
    rec = list.data.list.filter(x => x.formNo === formNo)[0];
    ok(rec.status === 'hired', '状态还在（' + rec.status + '）');
    ok(rec.remark === '等入职', '备注还在（' + rec.remark + '）');
    ok(rec.values.phone === '13800000002', '员工填的内容更新了（' + rec.values.phone + '）');

    console.log('\n【6】删掉记录');
    const del = await j('DELETE', '/api/record/' + formNo, undefined, token);
    ok(del.data.ok === true, '删除成功');
    list = await j('GET', '/api/records', undefined, token);
    ok(!(list.data.list || []).some(x => x.formNo === formNo), '列表里没有了');
  } finally {
    child.kill();
    await wait(120);
  }

  console.log('\n结果：' + (fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'));
  process.exit(fails === 0 ? 0 : 1);
})();
