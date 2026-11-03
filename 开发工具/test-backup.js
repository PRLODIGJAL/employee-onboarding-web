/**
 * 自动备份测试
 *
 *   node 开发工具/test-backup.js
 *
 * 备份从"按钮"改成"程序自己跑"，那就要能证明它真的会跑：
 *   1. backup.js 作为模块能被调用，产物是一个真实 zip
 *   2. 只留最近 N 份，旧的真的被删
 *   3. 空数据目录不生成无意义的 zip
 *   4. server.js 启动后会自动备一份（把启动延迟调短来测）
 *   5. 服务端日志里有 backup_auto 这条
 *
 * 全程在临时目录里跑，不碰真实 data/ 与 备份/。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'onboard-backup-test');
const PORT = 8921;

let fails = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); fails++; }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function zips(dir) {
  try { return fs.readdirSync(dir).filter(f => /^入职数据_.*\.zip$/.test(f)); } catch (e) { return []; }
}

function makeServerCopy() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.cpSync(path.join(ROOT, '服务器'), path.join(TMP, '服务器'), { recursive: true });
  fs.rmSync(path.join(TMP, '服务器', 'data'), { recursive: true, force: true });
  fs.rmSync(path.join(TMP, '服务器', 'logs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(TMP, '服务器', 'data', 'records'), { recursive: true });
  fs.mkdirSync(path.join(TMP, '服务器', 'data', 'photos'), { recursive: true });
  try { fs.symlinkSync(path.join(ROOT, '网页'), path.join(TMP, '网页')); } catch (e) { }
  return path.join(TMP, '服务器');
}

(async () => {
  console.log('\n【1】模块调用：真能打出 zip');
  const SRV = makeServerCopy();
  const backup = require(path.join(SRV, 'backup.js'));

  const empty = backup.run({ quiet: true });
  ok(!empty.ok && empty.reason === 'empty', '空数据目录 → 不生成 zip（reason=' + empty.reason + '）');

  fs.writeFileSync(path.join(SRV, 'data', 'records', 'DJ20261022-0001.json'),
    JSON.stringify({ formNo: 'DJ20261022-0001', values: { realName: '张明远' } }));
  fs.writeFileSync(path.join(SRV, 'data', 'photos', 'DJ20261022-0001_front.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xDB]));

  const r1 = backup.run({ quiet: true });
  ok(r1.ok, '有数据 → 备份成功');
  ok(r1.records === 1 && r1.photos === 1, '统计对得上：' + r1.records + ' 条记录 / ' + r1.photos + ' 张照片');
  const outDir = path.join(TMP, '备份');
  ok(zips(outDir).length === 1, '备份目录里有 1 个 zip：' + zips(outDir).join(','));

  const bin = fs.readFileSync(r1.path);
  ok(bin.slice(0, 2).toString() === 'PK', '是合法 zip（PK 头）');
  ok(bin.includes(Buffer.from('records/DJ20261022-0001.json')), 'zip 里含记录 JSON');
  ok(bin.includes(Buffer.from('data/records/DJ20261022-0001.json')), 'zip 内路径带 data/ 前缀（还原时直接盖回去）');

  console.log('\n【2】只留最近 N 份');
  // 同一分钟会重名，等一分钟太久：直接改 mtime 让它"看起来更旧"，再跑 --keep 1
  await wait(20);
  const second = backup.run({ keep: 2, quiet: true });
  ok(second.ok, '第二次备份成功');
  // 手造一个"更旧的第 3 份"，验证清理
  const oldName = '入职数据_2020-01-01_0000.zip';
  fs.writeFileSync(path.join(outDir, oldName), Buffer.from('PK'));
  const oldT = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(path.join(outDir, oldName), oldT, oldT);
  const third = backup.run({ keep: 2, quiet: true });
  ok(third.ok && third.pruned >= 1, '超出份数的旧备份被清掉（清理 ' + third.pruned + ' 份）');
  ok(zips(outDir).length <= 2, '最后只留 ' + zips(outDir).length + ' 份（keep=2）');
  ok(!fs.existsSync(path.join(outDir, oldName)), '最旧的那份确实删了');

  console.log('\n【3】服务启动后自动备份（不点任何按钮）');
  fs.rmSync(outDir, { recursive: true, force: true });
  // 先放一份 2020 年的旧备份：如果"最近一次备份"取错了（曾经就取错过），
  // 系统状态会一直显示这份 2020 的，自动备份也会以为该备了、每小时重复备
  fs.mkdirSync(outDir, { recursive: true });
  const staleName = '入职数据_2020-01-01_0000.zip';
  fs.writeFileSync(path.join(outDir, staleName), Buffer.from('PK'));
  const staleT = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(path.join(outDir, staleName), staleT, staleT);

  const child = spawn(process.execPath, [path.join(SRV, 'server.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), HOST: '127.0.0.1',
      AUTO_BACKUP_DELAY_MS: '200',   // 只为测试把 20 秒缩成 0.2 秒
      HR_PASSWORD: 'bmai2026'
    }),
    stdio: 'pipe'
  });
  let out = '';
  child.stdout.on('data', d => { out += d.toString(); });

  await wait(3500);
  ok(zips(outDir).length === 2, '服务自己存了 1 份（外加故意放的旧档，共 ' + zips(outDir).length + ' 份）');
  ok(/\[备份\]/.test(out), '启动输出里能看到备份那一行');

  const logDir = path.join(SRV, 'logs');
  const logs = fs.existsSync(logDir) ? fs.readdirSync(logDir).filter(f => /^app-/.test(f)) : [];
  const text = logs.map(f => fs.readFileSync(path.join(logDir, f), 'utf8')).join('\n');
  ok(/backup_auto/.test(text), '运行日志里有 backup_auto 事件');

  console.log('\n【4】系统状态报的是「最新那份」，不是最早那份');
  const login = await fetch('http://127.0.0.1:' + PORT + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empNo: 'HR001', password: 'bmai2026' })
  }).then(r => r.json());
  ok(!!login.token, '能登录后台');
  const stats = await fetch('http://127.0.0.1:' + PORT + '/api/admin/stats', {
    headers: { 'x-token': login.token || '' }
  }).then(r => r.json());
  const bkCheck = (stats.checks || []).find(c => c.name === '备份');
  const newest = zips(outDir)
    .map(f => ({ f: f, m: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0].f;
  ok(!!bkCheck && bkCheck.text.indexOf(newest) > -1,
    '「系统状态」显示最新那份：' + (bkCheck ? bkCheck.text : '无'));
  ok(!!bkCheck && bkCheck.text.indexOf('2020-01-01') === -1, '没有把 2020 年那份当成最近备份');

  // 再起一次：离上一份不到 24 小时，不应该重复备
  child.kill();
  await wait(400);
  const before = zips(outDir).length;
  const child2 = spawn(process.execPath, [path.join(SRV, 'server.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), HOST: '127.0.0.1', AUTO_BACKUP_DELAY_MS: '200'
    }),
    stdio: 'pipe'
  });
  await wait(2500);
  ok(zips(outDir).length === before, '重启不会重复备份（还是 ' + zips(outDir).length + ' 份）');
  child2.kill();
  await wait(300);

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails ? '\n有 ' + fails + ' 项没通过' : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
