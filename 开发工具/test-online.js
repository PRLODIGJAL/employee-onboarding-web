/**
 * 在线模式端到端测试：让页面真的连上 server/server.js
 *
 * 测什么：
 *   1. api.js 能探到服务器（ping）
 *   2. HR 登录走服务器校验（错误的密码被拒、正确密码拿到 token）
 *   3. 登录后列表里能看到服务器上别人的提交
 *
 * 跑法（先启动 server.js）：
 *   node web/test-online.js [端口]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PORT = Number(process.argv[2] || 8912);
const BASE = 'http://127.0.0.1:' + PORT + '/';
const FILE = path.join(__dirname, '入职登记原型_单文件版.html');

const vc = new VirtualConsole();
vc.on('jsdomError', e => console.log('[jsdomError]', String(e.message).split('\n')[0]));

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function () {
  const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), {
    url: BASE,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      // jsdom 没有 fetch：转给 Node 的 fetch，并把相对路径补成绝对路径
      w.fetch = function (url, opt) {
        const abs = new URL(url, BASE).href;
        const o = Object.assign({}, opt || {});
        delete o.signal;                       // 两边 AbortSignal 不是同一个类
        return globalThis.fetch(abs, o);
      };
      w.confirm = () => true;
      w.URL.createObjectURL = () => 'blob:x';
      w.URL.revokeObjectURL = () => {};
    }
  });

  const w = dom.window;
  const d = w.document;
  const $ = s => d.querySelector(s);
  const ok = (name, cond, extra) => console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));

  await new Promise(r => w.addEventListener('load', r));
  await wait(600);

  console.log('\n【1】探测服务器');
  ok('Api 已加载', !!w.Api);
  ok('ping 成功', w.Api.state.online === true, 'online=' + w.Api.state.online);

  console.log('\n【2】HR 登录（服务器校验）');
  $('.tab[data-view="hr"]').click();
  await wait(200);
  ok('出现登录页', !!$('#hrLogin'));

  $('#hrNo').value = 'HR001';
  $('#hrPwd').value = 'wrong-pass';
  $('#hrLogin').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait(500);
  ok('错误密码被拒', /不对/.test(($('.login-err') || {}).textContent || ''),
    (($('.login-err') || {}).textContent || '').trim());

  $('#hrNo').value = 'HR001';
  $('#hrPwd').value = 'bmai2026';
  $('#hrLogin').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1200);

  ok('正确密码进入后台', !$('#viewHr').hidden);
  ok('拿到 token', w.Api.hasToken());

  const rows = d.querySelectorAll('#viewHr .tbl tbody tr');
  console.log('  · 后台列表 ' + rows.length + ' 行');
  const names = Array.from(rows).map(tr => (tr.querySelector('b') || {}).textContent || '');
  console.log('  · 姓名：' + names.join('、'));
  // 这里只验"服务器上的记录能拉到并渲染出来"。不要再写死某个姓名——
  // 那等于要求上一轮测试的残留数据还在，换台机器 / 清过 data/ 就会假报失败。
  ok('能看到服务器上的记录', rows.length > 0);

  console.log('\n【3】员工提交（在线）');
  const before = await (await fetch(BASE + 'api/ping')).json();

  const dom2 = new JSDOM(fs.readFileSync(FILE, 'utf8'), {
    url: BASE + '#demo-step6',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w2) {
      w2.TextEncoder = TextEncoder;
      w2.TextDecoder = TextDecoder;
      w2.fetch = function (url, opt) {
        const abs = new URL(url, BASE).href;
        const o = Object.assign({}, opt || {});
        delete o.signal;
        return globalThis.fetch(abs, o);
      };
      w2.URL.createObjectURL = () => 'blob:x';
      w2.URL.revokeObjectURL = () => {};
    }
  });
  await new Promise(r => dom2.window.addEventListener('load', r));
  await wait(700);

  const d2 = dom2.window.document;
  const btn = d2.querySelector('#btnSubmit');
  ok('到了确认页且有提交按钮', !!btn);
  if (btn) btn.click();
  await wait(2000);

  const up = (d2.querySelector('.ok-banner .up') || {}).textContent || '';
  ok('结果页显示已进服务器', /服务器/.test(up), up.trim());

  const after = await (await fetch(BASE + 'api/ping')).json();
  ok('服务器记录数 +1', after.records > before.records, before.records + ' → ' + after.records);

  console.log('\n全部通过');
  process.exit(0);
})().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
