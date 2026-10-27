/**
 * test-ocr-engine.js —— 服务端 Tesseract 识别 + 前端降级链路
 *
 * 和 test-ocr.js 的分工：
 *   test-ocr.js        测「浏览器本机那套模板匹配」自身的准确率
 *   test-ocr-engine.js 测「服务端 Tesseract」以及「前端优先服务端、失败退回本机」的规则
 *
 * 验四件事：
 *   1. 号码提取与校验位逻辑对不对（过不了 GB 11643 就不能当结果用）
 *   2. 真能认出号码 —— 用 gen-idcard-samples.py 造的 8 张退化样本
 *      （模糊/变暗/反光/旋转/压缩/小图），要求全对且**零误判**
 *   3. 前端优先走服务端；连不上 / 没装引擎 / 被限流时退回本机
 *   4. 服务端说"读不出"时不再跑本机（省几秒，直接让员工手输）
 *
 *   node test-ocr-engine.js
 *   node test-ocr-engine.js --quick    只跑 2 张样本，改代码时用
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '服务器', 'ocr.js');
const WEB = path.resolve(__dirname, '..', '网页');
const SAMPLES = '/tmp/idtest';
const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra == null ? '' : ('→ ' + extra)); }
}

/* ================= 1. 提取与校验 ================= */

console.log('=== 号码提取与校验 ===');
{
  const ocr = require(SRC);

  ok('校验位算得对（44030419900512123 → 7）',
    ocr._checkCode('44030419900512123') === '7', ocr._checkCode('44030419900512123'));

  ok('完整合法号码能过', ocr._validId('440304199005121237'));
  ok('校验位错一位要拒掉', !ocr._validId('440304199005121238'));
  ok('生日 13 月要拒掉', !ocr._validId('440304199013121231'));
  ok('2 月 30 日要拒掉', !ocr._validId('440304199002301236'));
  ok('位数不够要拒掉', !ocr._validId('44030419900512123'));

  // 排版千奇百怪，这几种最容易漏
  [
    ['裸号码', '440304199005121237'],
    ['带空格（tesseract 常见）', '公民身份号码\n440304 1990 0512 1237'],
    ['折成两行', '44030419900512\n1237'],
    ['混在整段文本里', '姓 名 张明远 性 别 男 公民身份号码 440304199005121237 签发机关'],
  ].forEach(function (c) {
    const r = ocr._pickId(c[1]);
    ok(c[0] + ' → 认得出', r.id === '440304199005121237' && r.verified, r.id || '(无)');
  });

  const bad = ocr._pickId('440304199005121238');
  ok('校验位错的号不标 verified', bad.id === '440304199005121238' && !bad.verified);

  ok('完全没有数字时返回空', ocr._pickId('姓 名 张明远 性别 男').id === '');

  const a = ocr._parseImage(TINY);
  ok('解析 dataURL 的扩展名', a.ext === 'png' && a.buf.length > 20);
  ok('纯 base64 也能解析', ocr._parseImage(TINY.split(',')[1]).buf.length === a.buf.length);
}

/* ================= 2 / 3 / 4 ================= */

(async function main() {
  const quick = process.argv.indexOf('--quick') > -1;
  const eng = await require(SRC).detect();

  if (!eng.available) {
    console.log('\n=== 真实识别：跳过（这台机器没装 Tesseract）===');
    console.log('  不影响线上：没有引擎时前端自动退回本机识别，只是成功率低一些');
  } else {
    console.log('\n=== 真实识别（退化样本）===');
    console.log('  引擎：' + eng.bin + (eng.chinese ? '（含中文包）' : '（⚠️ 缺中文包）'));

    const kinds = quick ? ['clean', 'rotate']
      : ['clean', 'jpeg', 'noise', 'blur', 'rotate', 'dark', 'glare', 'small'];

    let hit = 0, wrong = 0, total = 0, msSum = 0;
    for (const k of kinds) {
      const img = path.join(SAMPLES, k + '.png');
      if (!fs.existsSync(img)) { console.log('  (缺样本 ' + k + '，先跑 gen-idcard-samples.py)'); continue; }
      total++;
      const truth = fs.readFileSync(path.join(SAMPLES, k + '.txt'), 'utf8').trim();
      const b64 = fs.readFileSync(img).toString('base64');
      const t0 = Date.now();
      const r = await require(SRC).recognize('data:image/png;base64,' + b64);
      const ms = Date.now() - t0;
      msSum += ms;

      const good = r.ok && r.idcard === truth;
      if (good) hit++;
      else if (r.ok) wrong++;    // 给了个错号 —— 比认不出严重得多

      ok(k + '（' + ms + 'ms）', good, r.ok ? ('读成 ' + r.idcard) : r.message);
    }

    if (total) {
      console.log('\n  正确 ' + hit + '/' + total + '，误判 ' + wrong
        + '，平均 ' + Math.round(msSum / total) + 'ms');
      ok('全部认对', hit === total, hit + '/' + total);
      ok('零误判（错号比没识别更严重）', wrong === 0, wrong + ' 张给了错号');
    }
  }

  console.log('\n=== 前端：优先服务端 / 自动降级 ===');
  {
    global.window = global;
    delete require.cache[require.resolve(path.join(WEB, 'ocr-lite.js'))];
    require(path.join(WEB, 'ocr-lite.js'));
    const Ocr = global.OcrLite;

    // (a) 服务端成功 → 直接用
    global.Api = { ocr: () => Promise.resolve({ ok: true, idcard: '440304199005121237', provider: 'tesseract', confidence: 0.95, message: '已识别' }) };
    let r1 = await Ocr.recognize(TINY, { side: 'front' });
    ok('服务端成功时用服务端结果', r1.ok && r1.provider === 'tesseract' && r1.idcard === '440304199005121237');

    // (b) 连不上 → 退回本机
    global.Api = { ocr: () => Promise.resolve({ ok: false, offline: true, message: '连不上服务器' }) };
    let r2 = await Ocr.recognize(TINY, { side: 'front' });
    ok('连不上时退回本机识别', r2.provider === 'local', r2.provider);

    // (c) 服务器没装引擎 → 退回本机
    global.Api = { ocr: () => Promise.resolve({ ok: false, provider: 'none', message: '没装 Tesseract' }) };
    let r3 = await Ocr.recognize(TINY, { side: 'front' });
    ok('服务器没装引擎时退回本机', r3.provider === 'local', r3.provider);

    // (d) 被限流 → 退回本机（本机不占服务器资源）
    global.Api = { ocr: () => Promise.resolve({ ok: false, code: 'TOO_MANY', message: '太频繁' }) };
    let r4 = await Ocr.recognize(TINY, { side: 'front' });
    ok('被限流时退回本机', r4.provider === 'local', r4.provider);

    // (e) 服务端明确读不出 → 直接报失败，不再跑本机
    global.Api = { ocr: () => Promise.resolve({ ok: false, provider: 'tesseract', message: '读不出，手输' }) };
    let r5 = await Ocr.recognize(TINY, { side: 'front' });
    ok('服务端说读不出时不再跑本机', !r5.ok && r5.provider === 'tesseract' && /手输/.test(r5.message), r5.message);

    // (f) 完全没有 Api（双击 html 打开）→ 本机
    delete global.Api;
    let r6 = await Ocr.recognize(TINY, { side: 'front' });
    ok('没有 Api 时直接用本机', r6.provider === 'local', r6.provider);

    // (g) 国徽面 / 空照片：不该触发任何识别
    let called = false;
    global.Api = { ocr: () => { called = true; return Promise.resolve({ ok: true, idcard: 'x' }); } };
    let r7 = await Ocr.recognize(TINY, { side: 'back' });
    ok('国徽面不识别、也不打服务端', !r7.ok && !called);
    let r8 = await Ocr.recognize('');
    ok('空照片直接返回', !r8.ok && !called);

    // (h) remote:false 强制本机（调试用）
    called = false;
    let r9 = await Ocr.recognize(TINY, { side: 'front', remote: false });
    ok('remote:false 时不打服务端', !called && r9.provider === 'local');
  }

  console.log('\n=== 照片不留痕 ===');
  {
    const count = () => fs.readdirSync(os.tmpdir()).filter(f => f.indexOf('bmai-ocr-') === 0).length;
    const before = count();
    if (eng.available && fs.existsSync(path.join(SAMPLES, 'clean.png'))) {
      await require(SRC).recognize('data:image/png;base64,' + fs.readFileSync(path.join(SAMPLES, 'clean.png')).toString('base64'));
    }
    ok('识别完临时目录被删干净', count() === before, before + ' → ' + count());
  }

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 项通过，' + fail + ' 项失败');
  process.exit(fail ? 1 : 0);
})();
