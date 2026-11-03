/**
 * 员工信息登记 —— 网页可点击原型
 *
 * 逻辑来源：miniprogram/config/form-schema.js + utils/*.js（由 build-bundle.js 打包）
 * 所以这里看到的校验、提示、导出结构和最终小程序完全一致。
 */
(function () {
  'use strict';

  var A = window.APP;
  var schema = A.schema;
  var checkIdCard = A.idcard.checkIdCard;
  var computeCheckCode = A.idcard.computeCheckCode;
  var validateField = A.validators.validateField;
  var validateTable = A.validators.validateTable;
  var isEmpty = A.validators.isEmpty;
  var buildBlocks = A.exporter.buildBlocks;
  var buildRoster = A.exporter.buildRoster;
  var buildRosterRow = A.exporter.buildRosterRow;
  var missingRequired = A.exporter.missingRequired;
  var ROSTER = A.exporter.ROSTER;

  var REGIONS = window.REGIONS || {};
  var PROVINCES = Object.keys(REGIONS);
  var STEPS = schema.steps;
  var LAST = STEPS.length - 1;

  var DRAFT_KEY = 'onboard_demo_draft_v1';
  var DB_KEY = 'onboard_demo_records_v1';
  var HR_SESSION_KEY = 'onboard_demo_hr_session_v1';

  // 演示账号。正式版绝对不能这样：账号密码要在云函数里查库、比对加盐哈希、
  // 只下发一个短期 token，前端不保存明文（见文档「HR 登录」一节）。
  var HR_ACCOUNT = { no: 'HR001', pwd: 'bmai2026', name: '人事行政部' };
  var HR_MAX_TRY = 3;
  var HR_LOCK_MS = 30000;

  /**
   * 处理状态：员工提交之后，HR 在自己这一侧推进的三个状态。
   *
   * 为什么三个就够：HR 实际只有三种处境——还没看的、已经确认入职的、
   * 资料有问题打回去让人补的。再多就是给自己找事。
   * 存的是 key 不是中文，以后改文案不会影响已经存下来的数据。
   */
  var HR_STATUS = [
    { k: 'pending', label: '待核对', cls: 'wait' },
    { k: 'hired', label: '已入职', cls: 'ok' },
    { k: 'rejected', label: '已驳回', cls: 'bad' }
  ];

  function statusOf(rec) {
    var k = rec && rec.status;
    // 兼容旧数据里的 'back'（早期叫"退回补充"，现已改名"已驳回"）
    if (k === 'back') k = 'rejected';
    return HR_STATUS.some(function (s) { return s.k === k; }) ? k : 'pending';
  }

  function statusMeta(k) {
    return HR_STATUS.filter(function (s) { return s.k === k; })[0] || HR_STATUS[0];
  }

  var FIELD_MAP = {};
  STEPS.forEach(function (s) {
    (s.fields || []).forEach(function (f) { FIELD_MAP[f.key] = f; });
  });
  var TABLE_MAP = {};
  STEPS.forEach(function (s) {
    (s.tables || []).forEach(function (b) { TABLE_MAP[b.key] = b; });
  });

  var state = {
    step: 0,
    values: {},
    tables: {},
    errors: {},
    tableErrors: {},
    photo: '',
    // 手写签名（PNG dataURL，透明底）。签一次，Word 里两处签字栏都用它
    sign: '',
    // home（选身份）/ form / result / hr / login
    view: 'home',
    currentRecord: null,
    // 结果页给谁看：employee = 刚提交完的员工（只看自己填的对不对）；
    // hr = 后台点「查看」进来的（要看导出包、花名册、文件夹结构）
    resultAs: 'employee',
    // 身份证正反面照片（dataURL，已压到 1000px 以内）
    idPhotos: { front: '', back: '' },
    // 识别状态：idle | busy | done | fail
    ocr: { front: { status: 'idle', msg: '' }, back: { status: 'idle', msg: '' } },
    // 提交去向：'' | ing | ok（已进服务器）| fail | local（没连服务器，只存本机）
    uploadState: '',
    uploadError: '',
    hr: {
      authed: false, empNo: '', tries: 0, lockedUntil: 0, error: '', busy: false, sel: {},
      // 列表筛选：'all' | 'pending' | 'hired' | 'rejected'，以及搜索关键词
      filter: 'all', q: '',
      stats: null    // 系统状态面板的数据
    },
    // 服务端要求填写口令时，员工输一次记在这里
    code: '',
    // 提交之后去哪儿（公众号 / 微信 / 群）—— 服务器读到的存在 Api.state.guide，
    // 本机演示模式改的内容放这里
    guide: null
  };

  /* ================= 工具 ================= */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast is-show' + (type ? ' toast-' + type : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = 'toast'; }, 2200);
  }

  /* ================= 弹层（页面内的，不用系统弹窗） ================= */

  var sheetOnClose = null;
  var pendingCodeCb = null;

  function openSheet(html, onClose) {
    var el = $('#sheet');
    if (!el) return;
    // 重置临时类，免得上一个面板留下的 is-wide 带到下一个面板上
    $('#sheetBox').className = 'sheet-box';
    $('#sheetBox').innerHTML = html;
    el.hidden = false;
    el.classList.add('is-on');
    document.body.classList.add('no-scroll');
    sheetOnClose = onClose || null;
    // 有输入框就聚焦输入框；没有就别抢焦点，免得按钮上出现一圈蓝框
    var input = $('#sheetBox input');
    if (input) setTimeout(function () { try { input.focus(); } catch (e) { } }, 80);
  }

  function closeSheet() {
    var el = $('#sheet');
    if (!el) return;
    el.hidden = true;
    el.classList.remove('is-on');
    document.body.classList.remove('no-scroll');
    $('#sheetBox').innerHTML = '';
    var cb = sheetOnClose;
    sheetOnClose = null;
    if (cb) cb();
  }

  /** 问一次填写口令，输完回调；取消就什么都不做 */
  function askCode(done) {
    pendingCodeCb = done || null;
    openSheet(
      '<div class="sheet-head"><b>填写口令</b><button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">HR 发链接的时候会一起给一个口令，填进来才能提交。</p>'
      + '<input class="field-input" id="codeInput" placeholder="例如 bmai2026" autocomplete="off" enterkeyhint="done">'
      + '<div class="sheet-foot"><button class="btn ghost" data-sheet-act="code-cancel">取消</button>'
      + '<button class="btn primary" data-sheet-act="code-ok">确定</button></div>',
      function () { pendingCodeCb = null; }
    );
  }

  function bindSheet() {
    var el = $('#sheet');
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeSheet(); return; }
      var btn = e.target.closest('[data-sheet-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-sheet-act');
      if (act === 'copy') { copyFillUrl(); return; }
      if (act === 'poster') { openPoster(); return; }
      if (act === 'code-cancel') { closeSheet(); return; }
      if (act === 'sys-refresh') { closeSheet(); fillSysbar(); openSysPanel(); return; }
      if (act === 'chpass') { openPasswordSheet(); return; }
      if (act === 'guide') { openGuideSheet(); return; }
      if (act === 'guide-save') { saveGuideFromSheet(); return; }
      if (act === 'demo-cancel') { closeSheet(); return; }
      if (act === 'meta-save') { saveMetaFromSheet(btn); return; }
      if (act === 'dup-del') { deleteDupFromSheet(btn); return; }
      if (act === 'demo-auth') { tryAuthDemo(); return; }
      if (act === 'demo-pick') { pickDemo(btn.getAttribute('data-key')); return; }
      if (act === 'chpass-cancel') { closeSheet(); return; }
      if (act === 'chpass-ok') {
        var oldPw = ($('#pwOld') || {}).value || '';
        var newPw = ($('#pwNew') || {}).value || '';
        var newPw2 = ($('#pwNew2') || {}).value || '';
        if (!oldPw) { toast('先填原密码', 'bad'); return; }
        if (newPw.length < 8) { toast('新密码至少 8 位', 'bad'); return; }
        if (newPw !== newPw2) { toast('两次输的新密码不一样', 'bad'); return; }
        btn.disabled = true;
        btn.textContent = '正在改…';
        window.Api.changePassword(oldPw, newPw).then(function (r) {
          if (r && r.ok) {
            closeSheet();
            window.Api.clearToken();
            state.hr.authed = false;
            state.hr.empNo = '';
            try { sessionStorage.removeItem(HR_SESSION_KEY); } catch (e) { }
            toast('密码已改，请用新密码重新登录', 'ok');
            switchView('login');
          } else {
            btn.disabled = false;
            btn.textContent = '确定改';
            toast((r && r.message) || '改不了，等下再试', 'bad');
          }
        });
        return;
      }
      if (act === 'code-ok') {
        var input = $('#codeInput');
        var v = input ? String(input.value || '').trim() : '';
        if (!v) { toast('请先填一下口令', 'bad'); return; }
        state.code = v;
        var cb = pendingCodeCb;
        pendingCodeCb = null;
        closeSheet();
        if (cb) cb();
      }
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id === 'codeInput') {
        var btn = el.querySelector('[data-sheet-act="code-ok"]');
        if (btn) btn.click();
      }
      if (e.key === 'Enter' && e.target.id === 'demoPw') {
        var b = el.querySelector('[data-sheet-act="demo-auth"]');
        if (b) b.click();
      }
    });

    // 处理状态弹层里选一个，把选中样式跟过去
    el.addEventListener('change', function (e) {
      if (e.target.classList && e.target.classList.contains('dupck')) {
        syncDupSheet();
        return;
      }
      if (e.target.name !== 'metaSt') return;
      $$('.st-opt', el).forEach(function (o) {
        o.classList.toggle('is-on', !!$('input', o) && $('input', o).checked);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.hidden) closeSheet();
    });
  }

  function emptyRow(block) {
    var row = {};
    block.columns.forEach(function (c) { row[c.key] = ''; });
    return row;
  }

  function visible(field) {
    if (!field.showWhen) return true;
    return state.values[field.showWhen.key] === field.showWhen.value;
  }

  /**
   * 把「因为条件不成立而看不见了」的字段值清掉。
   *
   * 比如先选了「经人介绍 → 中介推荐 → 沃盛」，又改回「内部推荐」，
   * 沃盛这个名字还留在 values 里，导出 Word 时就会被带到表格上。
   * 按 schema 顺序遍历，父字段先被清空，子字段下一轮也就跟着清掉了。
   */
  function pruneHidden() {
    STEPS.forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        if (f.showWhen && !visible(f)) state.values[f.key] = '';
      });
    });
  }

  function pctFilled() {
    var total = 0, filled = 0;
    STEPS.forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        if (!f.required || !visible(f)) return;
        total++;
        if (!isEmpty(state.values[f.key])) filled++;
      });
      (s.tables || []).forEach(function (b) {
        total++;
        if (blockDone(b)) filled++;
      });
    });
    return { total: total, filled: filled, percent: total ? Math.round(filled / total * 100) : 0 };
  }

  /**
   * 这张表算不算"填好了"。
   * 勾了「暂无工作经历」也算填好——它是一句明确声明，不是空着。
   */
  function blockDone(b) {
    if (b.noneKey && state.values[b.noneKey] === true) return true;
    var rows = state.tables[b.key] || [];
    // 选填列（专业、证明人及电话）不参与「这一段算不算填完」的判断，
    // 否则员工把学校/学历填齐了、就是没写证明人，右上角进度也不会打勾。
    var cols = (b.columns || []).filter(function (c) { return !c.optional; });
    return rows.some(function (r) {
      return cols.every(function (c) { return !isEmpty(r[c.key]); });
    });
  }

  function stepFilled(i) {
    var step = STEPS[i];
    var ok = true;
    (step.fields || []).forEach(function (f) {
      if (f.required && visible(f) && isEmpty(state.values[f.key])) ok = false;
    });
    (step.tables || []).forEach(function (b) {
      if (!blockDone(b)) ok = false;
    });
    return ok;
  }

  /* ================= 初始化 ================= */

  function initState() {
    STEPS.forEach(function (step) {
      (step.fields || []).forEach(function (f) {
        state.values[f.key] = f.type === 'region' ? [] : (f.type === 'agree' ? false : '');
        if (f.type === 'yn' && f.allowNote) state.values[f.key + 'Note'] = '';
      });
      (step.tables || []).forEach(function (b) {
        state.tables[b.key] = Array.from({ length: b.rows || 1 }, function () { return emptyRow(b); });
        // 「暂无工作经历」这类开关跟表格绑在一起，也放在 values 里：
        // 这样草稿、提交、Word 导出全都自动带上，不用另外记
        if (b.noneKey) state.values[b.noneKey] = false;
      });
    });
  }

  /** 清空整张表（含身份证照片与识别状态） */
  function resetForm() {
    initState();
    state.photo = '';
    state.sign = '';
    state.idPhotos = { front: '', back: '' };
    state.ocr = { front: { status: 'idle', msg: '' }, back: { status: 'idle', msg: '' } };
    state.errors = {};
    state.tableErrors = {};
    state.step = 0;
  }

  /**
   * 存草稿：只存"填过的文字"，**不存身份证照片**。
   *
   * 照片是敏感信息，写进浏览器 localStorage 就等于留在了员工那台设备上——
   * 公司公用电脑、店里共用的手机尤其不合适。刷新后重新拍一张的代价很小
   * （号码已经自动填好了），隐私上的收益大得多。
   */
  function saveDraft() {
    try {
      // 证件照不进草稿：一张几百 KB，写进 localStorage 既容易爆配额，
      // 也等于把照片留在了这台设备上（跟身份证照片同一个道理）。
      // 手写签名只有十几 KB，留着，免得刷新一次就要重签。
      var vals = {};
      Object.keys(state.values).forEach(function (k) {
        if (k === 'photoData' || k === 'photo') return;
        vals[k] = state.values[k];
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        step: state.step, values: vals, tables: state.tables
      }));
    } catch (e) { /* 无痕模式 / 配额满：忽略，不影响填写 */ }
  }

  /** 抹掉草稿：提交成功、或者「清空重填」之后必须调，否则下次打开会看到一份早就交过的表 */
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 忽略 */ }
  }

  /** 草稿里到底有没有真填过东西。全空的草稿不算，免得首页对着一个空表说"你有草稿"。 */
  function peekDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.values) return null;

      var has = Object.keys(d.values).some(function (k) {
        var v = d.values[k];
        if (v === true) return true;
        if (Array.isArray(v)) return v.some(Boolean);
        return String(v == null ? '' : v).trim() !== '';
      });
      if (!has && d.tables) {
        has = Object.keys(d.tables).some(function (k) {
          return (d.tables[k] || []).some(function (row) {
            return Object.keys(row || {}).some(function (c) {
              return String(row[c] == null ? '' : row[c]).trim() !== '';
            });
          });
        });
      }
      if (!has) return null;

      return { step: Math.min(Math.max(Number(d.step) || 0, 0), LAST) };
    } catch (e) { return null; }
  }

  function loadDraft() {
    // 全空的草稿（用户把字删光了 / 刚点过"清空重填"）不算恢复
    if (!peekDraft()) return false;
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !d.values) return false;
      Object.keys(state.values).forEach(function (k) {
        if (d.values[k] !== undefined) state.values[k] = d.values[k];
      });
      Object.keys(state.tables).forEach(function (k) {
        if (Array.isArray(d.tables && d.tables[k])) state.tables[k] = d.tables[k];
      });
      // 签名图存在 values.signData 里，草稿会把画布内容一起带回来
      state.sign = state.values.signData || '';
      // 旧版本草稿里可能存过照片：读到就顺手重写一遍，把照片从存储里清掉
      if (d.idPhotos) saveDraft();
      state.step = Math.min(Math.max(d.step || 0, 0), LAST);
      return true;
    } catch (e) { return false; }
  }

  /* ================= 渲染：字段 ================= */

  function optList(list, cur, placeholder) {
    var html = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
    (list || []).forEach(function (o) {
      html += '<option value="' + esc(o) + '"' + (o === cur ? ' selected' : '') + '>' + esc(o) + '</option>';
    });
    return html;
  }

  function pills(key, options, cur, cls) {
    return '<div class="pills ' + (cls || '') + '">' + options.map(function (o) {
      return '<label class="pill"><input type="radio" name="' + key + '" value="' + esc(o) + '" data-key="' + key + '"'
        + (o === cur ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('') + '</div>';
  }

  function regionCtrl(f) {
    var v = state.values[f.key] || [];
    var prov = v[0] || '';
    var city = v[1] || '';
    var cities = prov && REGIONS[prov] ? REGIONS[prov] : [];
    var provHtml = '<option value="">省份</option>' + PROVINCES.map(function (p) {
      return '<option value="' + esc(p) + '"' + (p === prov ? ' selected' : '') + '>' + esc(p) + '</option>';
    }).join('');
    var cityHtml = '<option value="">' + (prov ? '城市 / 区' : '请先选省份') + '</option>' + cities.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === city ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    return '<div class="region">'
      + '<select class="in sel" data-key="' + f.key + '" data-level="0"' + (prov ? '' : '') + '>' + provHtml + '</select>'
      + '<select class="in sel" data-key="' + f.key + '" data-level="1"' + (prov ? '' : ' disabled') + '>' + cityHtml + '</select>'
      + '</div>';
  }

  function control(f) {
    var v = state.values[f.key];
    var id = 'i-' + f.key;

    switch (f.type) {
      case 'textarea':
        return '<textarea class="in ta" id="' + id + '" data-key="' + f.key + '" rows="3" placeholder="'
          + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';

      case 'select':
        return '<select class="in sel" id="' + id + '" data-key="' + f.key + '">'
          + optList(f.options, v, f.placeholder || '请选择') + '</select>';

      case 'radio':
        return pills(f.key, f.options || [], v);

      case 'yn':
        return pills(f.key, ['是', '否'], v, 'pills-yn');

      case 'region':
        return regionCtrl(f);

      case 'date':
        return '<input class="in" id="' + id + '" type="date" data-key="' + f.key + '" value="' + esc(v || '') + '">';

      case 'month':
        return '<input class="in" id="' + id + '" type="month" data-key="' + f.key + '" value="' + esc(v || '') + '">';

      case 'number':
        return '<div class="with-suffix"><input class="in" id="' + id + '" type="number" inputmode="decimal" data-key="'
          + f.key + '" value="' + esc(v || '') + '" placeholder="' + esc(f.placeholder || '') + '">'
          + (f.suffix ? '<span class="suffix">' + esc(f.suffix) + '</span>' : '') + '</div>';

      case 'idcard':
        return '<input class="in mono" id="' + id + '" data-key="' + f.key + '" maxlength="18" inputmode="numeric" '
          + 'autocomplete="off" value="' + esc(v || '') + '" placeholder="' + esc(f.placeholder || '') + '">';

      case 'phone':
        return '<input class="in mono" id="' + id + '" type="tel" data-key="' + f.key + '" maxlength="11" inputmode="numeric" '
          + 'value="' + esc(v || '') + '" placeholder="' + esc(f.placeholder || '') + '">';

      case 'image':
        return '<label class="upload"><input type="file" accept="image/*" data-act="photo">'
          + '<span class="upload-box" id="photoBox">' + (state.photo
            ? '<img src="' + state.photo + '" alt="">'
            : '<b>+</b><i>拍照或选图</i>') + '</span></label>';

      case 'agree':
        return '<div class="agree"><div class="agree-text">' + esc(f.statement) + '</div>'
          + '<label class="check"><input type="checkbox" data-key="' + f.key + '"' + (v ? ' checked' : '')
          + '><span class="box"></span><span>我已阅读并同意上述声明</span></label></div>';

      default:
        // 姓名/邮箱放开浏览器自动填充（手机上一键带出，少打几个字）；其余关掉，免得填错行
        var ac = f.key === 'realName' ? 'name'
          : (f.key === 'email' ? 'email' : (f.key === 'emName' ? 'name' : 'off'));
        return '<input class="in" id="' + id + '" data-key="' + f.key + '" value="' + esc(v || '') + '" placeholder="'
          + esc(f.placeholder || '') + '" autocomplete="' + ac + '"'
          + (f.maxLength ? ' maxlength="' + f.maxLength + '"' : '') + '>';
    }
  }

  /* ---------- 身份证拍照 / 识别 ---------- */

  function idCapTile(side, label, dataUrl) {
    var st = state.ocr[side];
    var html = '<div class="idcap-item' + (dataUrl ? ' has' : '') + '" data-side="' + side + '">';

    html += '<div class="idcap-photo">';
    if (dataUrl) {
      html += '<img src="' + dataUrl + '" alt="' + esc(label) + '">';
    } else {
      html += '<div class="idcap-ph"><b>' + (side === 'front' ? '人像面' : '国徽面') + '</b><i>拍照 / 选图</i></div>';
    }
    if (st.status === 'busy') {
      html += '<div class="idcap-mask"><span class="spin"></span>识别中…</div>';
    }
    html += '</div>';

    html += '<div class="idcap-label">' + esc(label)
      + (dataUrl ? '<i class="idcap-ok">已上传</i>' : '') + '</div>';

    html += '<div class="idcap-btns">'
      + '<label class="mini-btn">' + (dataUrl ? '重拍' : '拍照')
      + '<input type="file" accept="image/*" capture="environment" data-act="idcap" data-side="' + side + '" hidden></label>'
      + '<label class="mini-btn ghost">选图'
      + '<input type="file" accept="image/*" data-act="idcap" data-side="' + side + '" hidden></label>'
      + (dataUrl ? '<button type="button" class="link-btn danger" data-act="idcap-del" data-side="' + side + '">删除</button>' : '')
      + '</div>';

    if (st.msg) {
      html += '<div class="idcap-msg' + (st.status === 'fail' ? ' is-bad' : '') + '">'
        + (st.status === 'ok' ? '<span class="tag-demo">演示</span> ' : '') + esc(st.msg) + '</div>';
    }

    html += '</div>';
    return html;
  }

  function idCapBlock() {
    return '<div class="idcap" id="idcapHolder">'
      + '<div class="idcap-title">拍身份证，自动填号码'
      + '<span class="tag-demo">演示识别</span>'
      + '<em>可选</em></div>'
      + '<div class="idcap-grid">'
      + idCapTile('front', '身份证人像面', state.idPhotos.front)
      + idCapTile('back', '身份证国徽面', state.idPhotos.back)
      + '</div>'
      + '<div class="idcap-note">人像面会识别号码并回填，同时带出性别、出生日期和籍贯；识别错了直接改上面的输入框。照片随档案一起导出。</div>'
      + '</div>';
  }

  /* ---------- 手写签名 ---------- */

  /**
   * 签名板。签一次，导出 Word 时同一张图会印到两处签字栏
   * （表格底部「填表人签字」和第二页「申请人签字」），日期自动填提交那天。
   * 这样 HR 拿到的就是一份已经签好字的表，打印出来直接盖章归档。
   */
  function signPadHtml() {
    var has = !!state.sign;
    return '<div class="signpad" id="signPad">'
      + '<div class="sp-head"><b>手写签名</b><em>'
      + '签一次，导出 Word 时自动印到「填表人签字」和「申请人签字」两处</em></div>'
      + '<div class="sp-box' + (has ? ' has' : '') + '" id="spBox">'
      + '<canvas id="spCanvas"></canvas>'
      + '<span class="sp-ph" id="spPh"' + (has ? ' hidden' : '') + '>用鼠标或手指在这里签名</span>'
      + '</div>'
      + '<div class="sp-foot">'
      + '<button type="button" class="mini-btn ghost" data-act="sign-clear">重签</button>'
      + '<span class="sp-note" id="spNote">' + (has ? '已签上，导出时会印在 Word 的两处签字栏'
        : '签完自动保存；不签也能提交，Word 上那两栏就空着手写') + '</span>'
      + '</div></div>';
  }

  /** 挂上画布：设原始分辨率（跟 dpr 走，不然手机上签出来是糊的） */
  function initSignPad() {
    var cv = $('#spCanvas');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    if (!ctx || !ctx.setTransform) return;   // jsdom / 老浏览器：没有 2D 上下文就跳过
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = Math.max(240, cv.parentNode.clientWidth || 600);
    var cssH = 132;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = '100%';
    cv.style.height = cssH + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14181f';

    var drew = !!state.sign;
    if (drew) {
      var im = new Image();
      im.onload = function () { ctx.drawImage(im, 0, 0, cssW, cssH); };
      im.src = state.sign;
    }

    var down = false, last = null;

    function pt(e) {
      var r = cv.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (cssW / r.width),
        y: (e.clientY - r.top) * (cssH / r.height)
      };
    }

    function begin(e) {
      e.preventDefault();
      down = true;
      last = pt(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#14181f';
      ctx.fill();
      var ph = $('#spPh');
      if (ph) ph.hidden = true;
      var box = $('#spBox');
      if (box) box.classList.add('has');
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 老浏览器没有，忽略 */ }
    }

    function move(e) {
      if (!down) return;
      e.preventDefault();
      var p = pt(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }

    function end() {
      if (!down) return;
      down = false;
      saveSign(cv);
    }

    cv.addEventListener('pointerdown', begin);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', end);

    // 触摸屏上别让页面跟着滚
    cv.style.touchAction = 'none';
  }

  function saveSign(cv) {
    var data = '';
    try { data = cv.toDataURL('image/png'); } catch (e) { data = ''; }
    if (!data || data.length < 200) return;      // 只点了一下，不算签名
    state.sign = data;
    state.values.signData = data;
    saveDraft();
    var note = $('#spNote');
    if (note) note.textContent = '已签上，导出时会印在 Word 的两处签字栏';
  }

  function clearSign() {
    state.sign = '';
    state.values.signData = '';
    saveDraft();
    render();
    toast('已清掉签名，可以重签');
  }


  /** 把手机拍的几兆大图压到 max 像素、JPEG，避免 localStorage 存爆 */
  function shrinkImage(file, cb, max) {
    max = max || 1000;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var w = Math.max(1, Math.round(img.width * scale));
      var h = Math.max(1, Math.round(img.height * scale));
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cb(cv.toDataURL('image/jpeg', 0.78), w, h);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(''); };
    img.src = url;
  }

  function handleIdPhoto(side, file) {
    if (!file) return;
    state.ocr[side] = { status: 'busy', msg: '' };
    paintIdCap();

    shrinkImage(file, function (dataUrl) {
      if (!dataUrl) {
        state.ocr[side] = { status: 'fail', msg: '这张图读不出来，换一张试试' };
        paintIdCap();
        return;
      }
      state.idPhotos[side] = dataUrl;
      state.ocr[side] = { status: 'busy', msg: '' };
      paintIdCap();
      saveDraft();

      if (side === 'back') {
        state.ocr.back = { status: 'ok', msg: '国徽面已存档，这一面没有号码' };
        paintIdCap();
        return;
      }

      window.OcrLite.recognize(dataUrl, { side: side }).then(function (r) {
        if (!r.ok) {
          state.ocr.front = { status: 'fail', msg: r.message || '没识别出号码，手动填一下' };
          paintIdCap();
          return;
        }
        state.values.idcard = r.idcard;
        state.values.idcardSource = 'ocr';
        patchDom('idcard');
        onIdCard(r.idcard);
        state.errors.idcard = '';
        // 用识别器自己的说明：推算过的号码会提示"麻烦核对下"，别糊成一句"可以直接改"
        state.ocr.front = { status: 'ok', msg: r.message || ('已识别 ' + r.idcard + '，可以直接改') };
        paintIdCap();
        var wrap = document.getElementById('f-idcard');
        if (wrap) { wrap.classList.remove('is-err'); var n = $('.f-err', wrap); if (n) n.textContent = ''; }
        saveDraft();
        renderSide();
        toast(r.fixed ? '身份证号已回填，有几位是推算的，请核对' : '身份证号已回填，请核对后继续', 'ok');
      });
    });
  }

  /** 只重画身份证拍照那块，不整页重绘（否则正在输入的焦点会丢） */
  function paintIdCap() {
    var old = document.getElementById('idcapHolder');
    if (!old) { render(); return; }
    var div = document.createElement('div');
    div.innerHTML = idCapBlock();
    old.parentNode.replaceChild(div.firstChild, old);
  }

  function renderField(f) {
    var err = state.errors[f.key] || '';
    var noteOn = f.type === 'yn' && f.allowNote && state.values[f.key] === '是';
    var html = '<div class="field' + (err ? ' is-err' : '') + '" id="f-' + f.key + '">';

    // 只标必填的星号，选填不加标签（否则每行右侧都挂一个"选填"，很吵）
    html += '<div class="f-head"><span class="f-label">' + esc(f.label)
      + (f.required ? '<i class="req">*</i>' : '') + '</span></div>';

    html += '<div class="f-ctrl">' + control(f) + '</div>';

    // 身份证号下面挂拍照识别（只在网页原型里加，小程序那边是原生 chooseMedia + 云函数 OCR）
    if (f.key === 'idcard') html += idCapBlock();

    // 身份证那块的说明已经写在拍照模块里了，别在下面再挂一行重复的灰字
    if (f.tip && f.key !== 'idcard') html += '<div class="f-tip">' + esc(f.tip) + '</div>';

    if (f.type === 'yn' && f.allowNote) {
      html += '<div class="f-note"' + (noteOn ? '' : ' hidden') + '>'
        + '<input class="in" data-key="' + f.key + 'Note" value="' + esc(state.values[f.key + 'Note'] || '')
        + '" placeholder="' + esc(f.noteTip || '请补充说明') + '"></div>';
    }

    html += '<div class="f-err">' + esc(err) + '</div></div>';
    return html;
  }

  function renderTableBlock(b) {
    var rows = state.tables[b.key] || [];
    // 有的表只允许一段（比如受教育情况只填最高那一段），就不给"增加一段"
    var maxRows = b.maxRows || 0;
    var hint = b.hint || ('至少填 ' + (b.requiredRows || 1) + ' 段');
    // 「暂无工作经历」：勾上以后表格收起来，但数据不清——取消勾选还能拿回来
    var none = !!b.noneKey && state.values[b.noneKey] === true;

    var html = '<div class="tblock' + (none ? ' is-none' : '') + '" data-tk="' + b.key + '">';
    html += '<div class="tblock-head"><div><b>' + esc(b.title) + '</b>'
      + '<span>' + esc(hint) + '</span></div>'
      + '<div class="tblock-acts">'
      + (b.noneKey
        ? '<label class="tcheck"><input type="checkbox" data-act="none-row" data-nk="' + b.noneKey + '"'
          + (none ? ' checked' : '') + '><span>' + esc(b.noneBtn || '暂无') + '</span></label>'
        : '')
      + (maxRows && rows.length >= maxRows ? ''
        : '<button class="mini-btn" data-act="add-row" data-tk="' + b.key + '"'
          + (none ? ' hidden' : '') + '>+ 增加一段</button>')
      + '</div>'
      + '</div>';

    html += '<div class="trows"' + (none ? ' hidden' : '') + '>';
    rows.forEach(function (row, ri) {
      var canDel = rows.length > (b.requiredRows || 1);
      html += '<div class="trow" data-ri="' + ri + '">';
      html += '<div class="trow-head"><span>第 ' + (ri + 1) + ' 段</span>'
        + (canDel ? '<button class="link-btn danger" data-act="del-row" data-tk="' + b.key + '" data-ri="' + ri + '">删除</button>' : '')
        + '</div>';

      b.columns.forEach(function (c) {
        var ek = b.key + '.' + ri + '.' + c.key;
        var err = state.tableErrors[ek] || '';
        var val = row[c.key] || '';
        var input;

        if (c.type === 'select') {
          input = '<select class="in sel" data-tk="' + b.key + '" data-ri="' + ri + '" data-ck="' + c.key + '">'
            + optList(c.options, val, '请选择') + '</select>';
        } else if (c.type === 'month') {
          input = '<input class="in" type="month" data-tk="' + b.key + '" data-ri="' + ri + '" data-ck="' + c.key
            + '" value="' + esc(val) + '">';
        } else {
          input = '<input class="in" data-tk="' + b.key + '" data-ri="' + ri + '" data-ck="' + c.key
            + '" value="' + esc(val) + '" placeholder="' + esc(c.placeholder || '') + '">';
        }

        html += '<div class="tcell' + (err ? ' is-err' : '') + '" data-tk="' + b.key + '" data-ri="' + ri
          + '" data-ck="' + c.key + '"><label>' + esc(c.label) + '</label>' + input
          + '<div class="f-err">' + esc(err) + '</div></div>';
      });

      html += '</div>';
    });
    html += '</div>';

    if (b.noneKey) {
      html += '<div class="tblock-note"' + (none ? '' : ' hidden') + '>'
        + '已声明「' + esc(b.noneLabel || '暂无') + '」，这一段不用填。'
        + '导出 Word 时会写明这句，作为本人声明留档。</div>';
    }

    html += '</div>';
    return html;
  }

  /* ================= 渲染：框架 ================= */

  /**
   * 第一屏的「填写前须知」。
   * 为什么要放在最前面：填表的人最怕两件事——不知道要花多久、不知道要准备什么。
   * 这两件事说清楚，中途放弃和反复问 HR 的情况会少很多。
   */
  function noticeHtml() {
    return '<div class="notice">'
      + '<ul class="nt-list">'
      + '<li>全部填完大约 <b>6–10 分钟</b>，中途关掉页面不要紧，下次打开会接着填。</li>'
      + '<li>手边放好<b>身份证</b>：拍一下能自动识别号码，不用一个一个字敲。</li>'
      + '<li>资料只用于入职建档，身份证照片<b>仅 HR 可见</b>。</li>'
      + '</ul>'
      + '<div class="nt-foot"><button class="link-btn" data-act="privacy">个人信息收集告知</button>'
      + '<span>点开看：收什么、干什么用、存多久、你有什么权利</span></div>'
      + '</div>';
  }

  function openPrivacySheet() {
    openSheet(
      '<div class="sheet-head"><b>个人信息收集告知</b><button class="x" data-close>×</button></div>'
      + '<div class="pv-body">'
      + '<p><b>1. 谁在收集</b>公司人力资源部。本表单只用于入职办理，不做其他用途。</p>'
      + '<p><b>2. 收集哪些、用来干什么</b>姓名、身份证号、联系方式、教育与工作经历、紧急联系人等，'
      + '用于建立员工档案、办理社保与公积金、发放工资，以及入职当天的对接联系。</p>'
      + '<p><b>3. 身份证照片</b>仅用于核对身份和存档，只有 HR 和经授权的审批人员能查看。</p>'
      + '<p><b>4. 保存多久</b>劳动关系存续期间保存；劳动关系结束且法定保存期限届满后，按规定删除或作匿名化处理。</p>'
      + '<p><b>5. 你的权利</b>可以要求查阅、复制、更正、补充或删除你填写的信息；'
      + '也可以撤回同意，撤回不影响此前已经进行的处理。</p>'
      + '<p><b>6. 安全措施</b>数据存放在公司指定的服务器上，访问需要 HR 账号登录，不提供给无关第三方。</p>'
      + '<p><b>7. 怎么找我们</b>直接联系对接你的 HR；提交后也可以凭登记编号查询或更正。</p>'
      + '<p class="pv-note">继续填写并提交，表示你已阅读并知悉以上内容。</p>'
      + '</div>'
      + '<div class="sheet-foot"><button class="btn primary" data-close>我知道了</button></div>'
    );
  }

  function renderTop(step) {
    var p = pctFilled();
    var html = '<div class="st-head">'
      + '<div class="st-title">' + esc(step.title) + '</div>'
      + (step.desc ? '<div class="st-desc">' + esc(step.desc) + '</div>' : '')
      + '</div>';

    // 一条分段进度，代替原来的「进度条 + 6 个圆点 + 一段文字」
    html += '<div class="prog">' + STEPS.map(function (s, i) {
      var cls = 'prog-seg';
      if (i === state.step) cls += ' is-on';
      else if (i < state.step) cls += ' is-done';
      return '<span class="' + cls + '"></span>';
    }).join('') + '</div>';

    html += '<div class="prog-meta">'
      + '<span>第 <b>' + (state.step + 1) + '</b> / ' + STEPS.length + ' 步</span>'
      + '<span>必填 <b>' + p.filled + '</b> / ' + p.total + '</span>'
      + '</div>';

    return html;
  }

  function renderBody(step) {
    var html = '';
    if (step.key === 'basic') html += noticeHtml();
    var fields = (step.fields || []).filter(visible);
    if (fields.length) {
      html += '<div class="fields">' + fields.map(renderField).join('') + '</div>';
    }
    (step.tables || []).forEach(function (b) { html += renderTableBlock(b); });

    if (step.key === 'confirm') {
      html += '<div class="review">' + buildBlocks(payload()).map(function (blk) {
        return '<div class="rv-block"><div class="rv-title">' + esc(blk.title) + '</div>'
          + blk.rows.map(function (r) {
            return '<div class="rv-row"><span>' + esc(r.label) + '</span><b>' + esc(r.value) + '</b></div>';
          }).join('') + '</div>';
      }).join('') + '</div>';

      // 签在最后：跟纸质表一样，先看完整张表，再在最下面签字
      html += signPadHtml();

      html += '<div class="rv-reset"><button class="link-btn danger" data-act="reset">全部清空，从头再填</button></div>';
    }
    return html;
  }

  function renderFoot(step) {
    var foot = $('#screenFoot');
    foot.innerHTML = '<button class="btn ghost" id="btnPrev"' + (state.step === 0 ? ' disabled' : '') + '>上一步</button>'
      + (state.step === LAST
        ? '<button class="btn primary" id="btnSubmit">提交并生成表格</button>'
        : '<button class="btn primary" id="btnNext">下一步</button>');
  }

  function render() {
    var step = STEPS[state.step];
    $('#screenTop').innerHTML = renderTop(step);
    $('#formBody').innerHTML = renderBody(step);
    // 画布必须在 DOM 里之后才能设尺寸、画已有签名
    if (step.key === 'confirm') initSignPad();
    $('#formBody').scrollTop = 0;
    renderFoot(step);
    renderSide();
  }

  /* ================= 渲染：右侧面板 ================= */

  function renderSide() {
    var holder = $('#side');
    if (!holder) return;   // 页面已经没有侧栏了，这里保留是为了兼容旧结构

    var html = '';

    // 身份证解析结果：一行摘要，不再单独占一整块
    var idRes = state.values.idcard ? checkIdCard(state.values.idcard) : null;
    if (idRes) {
      html += '<div class="panel-card"><div class="pc-title">身份证解析</div>';
      if (idRes.valid) {
        // 籍贯提示跟着实际值走：只填到省才叫人补，填到市了别再催
        var npLv = (state.values.nativePlace || []).filter(Boolean).length;
        html += '<div class="pc-ok">校验通过</div>'
          + '<div class="pc-line"><b>' + esc(idRes.data.gender) + '</b> · <b>' + esc(idRes.data.birthday)
          + '</b> · ' + idRes.data.age + ' 岁<br>' + esc(idRes.data.province || '—')
          + '</div><div class="pc-note">性别与出生日期已自动填入'
          + (npLv >= 2 ? '，籍贯已填到市。' : '，籍贯请补选到市。') + '</div>';
      } else {
        html += '<div class="pc-bad">' + esc(idRes.message) + '</div>';
      }
      html += '</div>';
    }

    var errs = Object.keys(state.errors).filter(function (k) { return state.errors[k]; });
    if (errs.length) {
      html += '<div class="panel-card"><div class="pc-title">待修正 ' + errs.length + ' 项</div>'
        + '<ul class="err-list">' + errs.slice(0, 5).map(function (k) {
          return '<li data-jump="' + k + '">' + esc(FIELD_MAP[k] ? FIELD_MAP[k].label : k)
            + '：' + esc(state.errors[k]) + '</li>';
        }).join('') + '</ul></div>';
    }

    // 演示工具：不占视觉重量，缩成右上角一行小字（上线后对真实员工就是噪音）
    html += '<div class="tools">'
      + '<button class="tool-btn" data-act="demo">一键填案例</button>'
      + '<button class="tool-btn" data-act="reset">清空重填</button>'
      + '</div>';

    holder.innerHTML = html;
  }

  /* ================= 校验 ================= */

  function validateStep(i) {
    var step = STEPS[i];
    var first = '';

    (step.fields || []).forEach(function (f) {
      if (!visible(f)) { state.errors[f.key] = ''; return; }
      var e = validateField(f, state.values[f.key], state.values);
      state.errors[f.key] = e;
      if (e && !first) first = f.key;
    });

    (step.tables || []).forEach(function (b) {
      var r = validateTable(b, state.tables[b.key], state.values);
      Object.keys(state.tableErrors).forEach(function (k) {
        if (k.indexOf(b.key + '.') === 0) delete state.tableErrors[k];
      });
      Object.assign(state.tableErrors, r.errors);
      if (r.count && !first) first = 'TABLE:' + b.key;
    });

    paintStep();
    return first;
  }

  function paintStep() {
    $$('#formBody .field').forEach(function (el) {
      var key = el.id.slice(2);
      var err = state.errors[key] || '';
      el.classList.toggle('is-err', !!err);
      var n = $('.f-err', el);
      if (n) n.textContent = err;
    });

    $$('#formBody .tcell').forEach(function (el) {
      var k = el.dataset.tk + '.' + el.dataset.ri + '.' + el.dataset.ck;
      var err = state.tableErrors[k] || '';
      el.classList.toggle('is-err', !!err);
      var n = $('.f-err', el);
      if (n) n.textContent = err;
    });
  }

  function scrollTo(key) {
    if (!key) return;
    var el;
    if (key.indexOf('TABLE:') === 0) {
      el = $('.tblock[data-tk="' + key.slice(6) + '"]');
    } else {
      el = document.getElementById('f-' + key);
    }
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ================= 身份证联动 ================= */

  function onIdCard(raw) {
    var r = checkIdCard(raw);
    if (!r.valid) { renderSide(); return; }
    var d = r.data;
    var filled = [];

    // 号码是生日 / 性别的唯一真源：只要号码合法就跟着它走，
    // 不管之前有没有值——不然改了号码、底下还挂着旧生日，会填错。
    if (state.values.birthday !== d.birthday) {
      state.values.birthday = d.birthday;
      patchDom('birthday');
      filled.push('出生日期');
    }
    if (state.values.gender !== d.gender) {
      state.values.gender = d.gender;
      patchDom('gender');
      filled.push('性别');
    }
    if (d.province && REGIONS[d.province] && !(state.values.nativePlace || [])[0]) {
      state.values.nativePlace = [d.province, ''];
      patchDom('nativePlace');
      filled.push('籍贯（已选到省）');
    }

    if (filled.length) {
      toast('已自动填充：' + filled.join('、'), 'ok');
      ['birthday', 'gender', 'nativePlace'].forEach(flash);
    }
    renderSide();
    saveDraft();
  }

  function flash(key) {
    var el = document.getElementById('f-' + key);
    if (!el) return;
    el.classList.add('is-flash');
    setTimeout(function () { el.classList.remove('is-flash'); }, 1200);
  }

  /** 不重建 DOM，只把某个字段的控件值同步成 state 里的值 */
  function patchDom(key) {
    var f = FIELD_MAP[key];
    if (!f) return;
    var v = state.values[key];

    if (f.type === 'radio' || f.type === 'yn') {
      $$('input[name="' + key + '"]').forEach(function (inp) { inp.checked = (inp.value === v); });
      return;
    }
    if (f.type === 'region') {
      var sel0 = $('select[data-key="' + key + '"][data-level="0"]');
      var sel1 = $('select[data-key="' + key + '"][data-level="1"]');
      if (sel0) sel0.value = (v && v[0]) || '';
      if (sel1) {
        var cities = (v && v[0] && REGIONS[v[0]]) || [];
        sel1.innerHTML = '<option value="">' + (v && v[0] ? '城市 / 区' : '请先选省份') + '</option>'
          + cities.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
        sel1.disabled = !(v && v[0]);
        sel1.value = (v && v[1]) || '';
      }
      return;
    }
    var el = document.getElementById('i-' + key);
    if (el) el.value = v == null ? '' : v;
  }

  /* ================= 事件 ================= */

  function bind() {
    var body = $('#formBody');
    bindSheet();
    bindHr();

    body.addEventListener('input', function (e) {
      var t = e.target;

      if (t.dataset.tk) {
        var tk = t.dataset.tk, ri = Number(t.dataset.ri), ck = t.dataset.ck;
        state.tables[tk][ri][ck] = t.value;
        var ek = tk + '.' + ri + '.' + ck;
        if (state.tableErrors[ek]) {
          state.tableErrors[ek] = '';
          t.closest('.tcell').classList.remove('is-err');
          t.closest('.tcell').querySelector('.f-err').textContent = '';
        }
        saveDraft();
        renderSide();
        return;
      }

      var key = t.dataset.key;
      if (!key) return;

      if (t.type === 'checkbox') {
        state.values[key] = t.checked;
      } else {
        state.values[key] = t.value;
      }

      if (state.errors[key]) {
        state.errors[key] = '';
        var wrap = document.getElementById('f-' + key);
        if (wrap) {
          wrap.classList.remove('is-err');
          var n = $('.f-err', wrap);
          if (n) n.textContent = '';
        }
      }

      if (key === 'idcard') onIdCard(t.value);
      if (key === 'photo') return;

      saveDraft();
      renderSide();
    });

    body.addEventListener('change', function (e) {
      var t = e.target;

      // 「暂无工作经历」：只折叠/展开，不碰已填的内容，也不重建 DOM（免得滚动位置乱跳）
      if (t.dataset.act === 'none-row') {
        var nk = t.dataset.nk;
        state.values[nk] = !!t.checked;
        var tb = t.closest('.tblock');
        if (tb) {
          tb.classList.toggle('is-none', t.checked);
          var rowsEl = $('.trows', tb);
          if (rowsEl) rowsEl.hidden = t.checked;
          var noteEl = $('.tblock-note', tb);
          if (noteEl) noteEl.hidden = !t.checked;
          var addB = $('[data-act="add-row"]', tb);
          if (addB) addB.hidden = t.checked;
          // 收起时把这张表上的红字清掉，否则会留着一片"此项必填"
          if (t.checked) {
            $$('.tcell.is-err', tb).forEach(function (el) {
              el.classList.remove('is-err');
              var n = $('.f-err', el); if (n) n.textContent = '';
            });
            Object.keys(state.tableErrors).forEach(function (k) {
              if (k.indexOf(tb.dataset.tk + '.') === 0) delete state.tableErrors[k];
            });
          }
        }
        saveDraft();
        renderSide();
        return;
      }

      if (t.dataset.act === 'idcap') {
        handleIdPhoto(t.dataset.side, t.files && t.files[0]);
        t.value = '';   // 清掉，方便同一张图再选一次
        return;
      }

      if (t.dataset.act === 'photo') {
        var file = t.files && t.files[0];
        t.value = '';                 // 清掉，方便同一张图再选一次
        if (!file) return;
        // 480px 足够印在 2 寸照片格上（约 170dpi），一张约 40KB
        shrinkImage(file, function (dataUrl, w, h) {
          if (!dataUrl) { toast('这张图读不出来，换一张试试', 'bad'); return; }
          state.photo = dataUrl;
          state.values.photo = file.name;
          // 导出 Word 时要把这张图嵌进「照片」格，所以正文得跟着记录走
          state.values.photoData = dataUrl;
          state.values.photoW = w;
          state.values.photoH = h;
          var box = $('#photoBox');
          if (box) box.innerHTML = '<img src="' + dataUrl + '" alt="">';
          saveDraft();
          toast('照片已放好，导出 Word 时会贴在照片格里', 'ok');
        }, 480);
        return;
      }

      if (t.dataset.tk) return;

      var key = t.dataset.key;
      if (!key) return;

      if (key.indexOf('Note') > -1) {
        state.values[key] = t.value;
        saveDraft();
        return;
      }

      // 省市级联
      if (t.dataset.level !== undefined && t.dataset.level !== null && t.dataset.level !== '') {
        var lv = Number(t.dataset.level);
        var cur = state.values[key] || [];
        if (lv === 0) {
          state.values[key] = t.value ? [t.value, ''] : [];
          patchDom(key);
        } else {
          state.values[key] = [cur[0] || '', t.value];
          var wrap = document.getElementById('f-' + key);
          if (wrap) { wrap.classList.remove('is-err'); $('.f-err', wrap).textContent = ''; }
        }
        state.errors[key] = '';
        saveDraft();
        renderSide();
        return;
      }

      if (t.type === 'radio') state.values[key] = t.value;
      else if (t.type === 'checkbox') state.values[key] = t.checked;
      else state.values[key] = t.value;

      var f = FIELD_MAP[key];
      if (f) {
        state.errors[key] = validateField(f, state.values[key], state.values);
        var w = document.getElementById('f-' + key);
        if (w) {
          w.classList.toggle('is-err', !!state.errors[key]);
          $('.f-err', w).textContent = state.errors[key];
        }
      }

      // 渠道 / 介绍方式会带出一组条件字段，切换时先清掉不再显示的，再重绘
      if (key === 'channel' || key === 'channelRefType') {
        pruneHidden();
        saveDraft();          // 清空后的结果也要落进草稿，刷新后别又冒出来
        render();
        return;
      }
      if (f && f.type === 'yn') { patchDom(key); renderSide(); saveDraft(); return; }

      saveDraft();
      renderSide();
    });

    body.addEventListener('blur', function (e) {
      var t = e.target;
      if (!t.dataset || !t.dataset.key || t.dataset.tk) return;
      var key = t.dataset.key;
      var f = FIELD_MAP[key];
      if (!f) return;
      var err = validateField(f, state.values[key], state.values);
      state.errors[key] = err;
      var w = document.getElementById('f-' + key);
      if (w) {
        w.classList.toggle('is-err', !!err);
        $('.f-err', w).textContent = err;
      }
      renderSide();
    }, true);

    body.addEventListener('click', function (e) {
      // 点照片区域＝打开相机
      var ph = e.target.closest('.idcap-photo');
      if (ph) {
        var tile = ph.closest('.idcap-item');
        var inp = tile && tile.querySelector('input[data-act="idcap"]');
        if (inp) { inp.click(); return; }
      }

      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;

      if (act === 'idcap-del') {
        var side = btn.dataset.side;
        state.idPhotos[side] = '';
        state.ocr[side] = { status: 'idle', msg: '' };
        if (side === 'front' && state.values.idcardSource === 'ocr') {
          state.values.idcard = '';
          state.values.idcardSource = '';
          patchDom('idcard');
        }
        paintIdCap();
        saveDraft();
        return;
      }

      if (act === 'privacy') { openPrivacySheet(); return; }

      if (act === 'sign-clear') { clearSign(); return; }

      if (act === 'add-row') {
        var b = TABLE_MAP[btn.dataset.tk];
        if (b.maxRows && state.tables[b.key].length >= b.maxRows) {
          toast('这张表最多填 ' + b.maxRows + ' 段', 'bad');
          return;
        }
        state.tables[b.key].push(emptyRow(b));
        render();
        return;
      }
      if (act === 'reset') { askReset(); return; }
      if (act === 'del-row') {
        var block = TABLE_MAP[btn.dataset.tk];
        if (state.tables[block.key].length <= (block.requiredRows || 1)) return;
        state.tables[block.key].splice(Number(btn.dataset.ri), 1);
        render();
        return;
      }
    });

    $('#screenTop').addEventListener('click', function (e) {
      var el = e.target.closest('[data-step]');
      if (!el) return;
      var idx = Number(el.dataset.step);
      if (idx === state.step) return;

      if (idx < state.step) {
        state.step = idx; render(); saveDraft(); return;
      }
      // 往后跳：先过当前这一步
      var first = validateStep(state.step);
      if (first) { toast('这一步还有必填项没填', 'bad'); scrollTo(first); return; }
      state.step = idx; render(); saveDraft();
    });

    $('#screenFoot').addEventListener('click', function (e) {
      if (e.target.id === 'btnPrev') {
        if (state.step > 0) { state.step--; render(); saveDraft(); }
      }
      if (e.target.id === 'btnNext') {
        var first = validateStep(state.step);
        if (first) { toast('还有 ' + Object.keys(state.errors).filter(function (k) { return state.errors[k]; }).length + ' 项没填好', 'bad'); scrollTo(first); return; }
        state.step = Math.min(state.step + 1, LAST);
        render();
        saveDraft();
      }
      if (e.target.id === 'btnSubmit') submit();
    });

    // 侧栏已经移除，这段留着是为了页面结构再变时不至于报错
    var side = $('#side');
    if (side) {
      side.addEventListener('click', function (e) {
        var jump = e.target.closest('[data-jump]');
        if (jump) { scrollTo(jump.dataset.jump); return; }

        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'demo') { askAdminForDemo(); return; }
        if (btn.dataset.act === 'reset') { askReset(); }
      });
    }

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchView(t.dataset.view); });
    });

    // 首页两张卡：员工 / HR
    var home = $('#viewHome');
    if (home) {
      home.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'go-form') { enterForm(); return; }
        if (btn.dataset.act === 'go-hr') { switchView('hr'); }
      });
    }

    // 顶栏的「员工信息登记」＝回首页（首页没有 tab，这是唯一的回去的路）
    var brand = $('#brandHome');
    if (brand) {
      brand.addEventListener('click', function () {
        if (state.view !== 'home') switchView('home');
      });
    }
  }

  function askReset() {
    if (!confirm('清空当前填写的全部内容？')) return;
    resetForm();
    clearDraft();
    render();
    toast('已清空');
  }

  /* ================= 示例数据（一键填案例） ================= */

  // 三份预设案例：各有不同的学历 / 户籍，方便演示不同类型的员工。
  // 原则：**只填必填项，选填项一律留空**，演示时一眼能看出到底哪些必须填。
  // 选填的有：婚姻、职称、语言、证书、专业、邮箱、现居住地址、户口所在地、照片、
  // 教育经历的「证明人及电话」、「与内推人关系」。
  // 招聘渠道（channel）2026-10-26 起是必填，所以三份都填，并各用不同渠道，
  // 顺便让人看到渠道统计不是只有一种来源。
  // 编号用「地区码 + 出生日期」拼，前 17 位固定，末位校验码由程序现算，
  // 所以每份都能通过身份证校验，但都是虚构号码，不是真人。
  var DEMO_CASES = [
    {
      key: 'zhang', label: '案例 1 · 普工', tag: '高中',
      name: '张明远', idHead: '33010619930812453', gender: '男', birthday: '1993-08-12',
      nation: '汉族', nativePlace: ['浙江省', '杭州市'],
      politicalStatus: '群众', householdType: '农村',
      highestEducation: '高中', graduateSchool: '杭州市第二中学',
      graduateDate: '2011-06', height: '172', weight: '68',
      phone: '13800138000',
      permanentRegion: ['浙江省', '杭州市'], permanentDetail: '文三路 100 号 3 幢 201',
      emName: '李秀兰', emRelation: '母亲', emPhone: '13900139000',
      emAddress: '浙江省杭州市西湖区文三路 100 号',
      channel: '厂门口',
      credit: { type: '芝麻信用分', score: '688' },
      education: { start: '2008-09', end: '2011-06', school: '杭州市第二中学', degree: '高中' },
      work: { start: '2011-07', end: '2026-09', company: '杭州精工机械有限公司', duty: '装配工', leave: '个人发展 李经理 13700002222' }
    },
    {
      key: 'li', label: '案例 2 · 应届生', tag: '大专 · 无工作经历',
      name: '李思睿', idHead: '44030520020315886', gender: '女', birthday: '2002-03-15',
      nation: '汉族', nativePlace: ['广东省', '深圳市'],
      politicalStatus: '共青团员', householdType: '城镇',
      highestEducation: '大专（全日制）', graduateSchool: '深圳职业技术学院',
      graduateDate: '2023-06', height: '161', weight: '49',
      phone: '13712345678',
      permanentRegion: ['广东省', '深圳市'], permanentDetail: '南山区科技园 8 号',
      emName: '李建国', emRelation: '父亲', emPhone: '13600001111',
      emAddress: '广东省深圳市南山区科技园 8 号',
      channel: '网络',
      credit: { type: '芝麻信用分', score: '720' },
      education: { start: '2019-09', end: '2023-06', school: '深圳职业技术学院', degree: '大专（全日制）' },
      // 刚毕业，一段正式工作都没有——用「暂无工作经历」而不是编一段
      noWork: true
    },
    {
      key: 'wang', label: '案例 3 · 转岗', tag: '本科',
      name: '王雪梅', idHead: '51010719900715244', gender: '女', birthday: '1990-07-15',
      nation: '汉族', nativePlace: ['四川省', '成都市'],
      politicalStatus: '群众', householdType: '城镇',
      highestEducation: '本科（全日制）', graduateSchool: '成都理工大学',
      graduateDate: '2012-06', height: '160', weight: '52',
      phone: '15900001111',
      permanentRegion: ['四川省', '成都市'], permanentDetail: '武侯区科华北路 12 号',
      emName: '王建军', emRelation: '父亲', emPhone: '13500004444',
      emAddress: '四川省成都市武侯区科华北路 12 号',
      channel: '宣传单',
      credit: { type: '微信支付分', score: '755' },
      education: { start: '2008-09', end: '2012-06', school: '成都理工大学', degree: '本科（全日制）' },
      work: { start: '2012-07', end: '2026-07', company: '成都恒信财务咨询有限公司', duty: '会计', leave: '随家人迁居 周经理 13800006666' }
    }
  ];

  function demoId(head) {
    return head + computeCheckCode(head);
  }

  /** 把一份案例填进表单。seedRecords 也走这里，保证示例和"造的记录"是同一套数据 */
  function applyDemo(c) {
    // #demo / #demo-step3 这种锚点是不带参数的，默认填第一个案例。
    // 不兜这一下就会在 c.name 上炸（2026-10-22 实测踩到）。
    if (!c) c = DEMO_CASES[0];
    var v = state.values;
    v.realName = c.name;
    v.idcard = demoId(c.idHead);
    v.gender = c.gender;
    v.birthday = c.birthday;
    v.nation = c.nation;
    v.nativePlace = c.nativePlace.slice();
    v.politicalStatus = c.politicalStatus;      // 必填：党员 / 群众
    v.householdType = c.householdType;          // 必填：农村 / 城镇
    v.highestEducation = c.highestEducation;
    v.graduateSchool = c.graduateSchool;
    v.graduateDate = c.graduateDate;
    v.height = c.height;
    v.weight = c.weight;
    v.phone = c.phone;
    v.permanentRegion = c.permanentRegion.slice();
    v.permanentDetail = c.permanentDetail;
    v.emName = c.emName;
    v.emRelation = c.emRelation;
    v.emPhone = c.emPhone;
    v.emAddress = c.emAddress;
    // 招聘渠道是必填，每份案例各带一个渠道
    v.channel = c.channel || '网络';

    // 选填项：案例一律不填（婚姻、职称、语言、证书、专业、邮箱、
    // 现居住地址、户口所在地）。显式清空，避免上一份案例残留。
    v.marriage = '';
    v.major = '';
    v.title = '';
    v.language = '';
    v.certificate = '';
    v.email = '';
    v.liveRegion = [];
    v.liveDetail = '';
    v.householdRegion = [];
    v.householdDetail = '';
    // 选了「经人介绍」才会出现的三项——案例都走普通渠道，这里一定清干净，
    // 否则上份案例挑过中介，这份会带着隐藏值一起提交
    v.channelRefType = '';
    v.channelRefName = '';
    v.channelRefRelation = '';
    v.channelAgency = '';
    v.channelOther = '';

    ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13'].forEach(function (k) { v[k] = '否'; });
    v.q1CreditType = c.credit.type;
    v.q1CreditScore = c.credit.score;
    v.q14 = '无';
    v.agree = true;

    // 受教育情况只填最高的一段
    state.tables.educations = [Object.assign({}, c.education)];
    var work = TABLE_MAP.works;
    // 应届生那类案例走「暂无工作经历」，表格留空但勾上开关
    v.noWork = c.noWork === true;
    // 行数跟着模板走（纸质表工作经历只有 2 行），不要写死，
    // 否则案例会多出一段空行，导出时又得靠删行兜底
    var workRows = work.rows || work.maxRows || 1;
    var demoWorks = [];
    for (var wr = 0; wr < workRows; wr++) {
      demoWorks.push(wr === 0 && !v.noWork ? Object.assign({}, c.work) : emptyRow(work));
    }
    state.tables.works = demoWorks;

    state.errors = {};
    state.tableErrors = {};

    // 身份证照片：画出来的示意图，带「演示样例」水印，不是真证件
    var bd = String(c.birthday).split('-');
    state.idPhotos = {
      front: mockIdCard('front', {
        name: c.name, gender: c.gender, idcard: v.idcard,
        birthday: bd[0] + ' 年 ' + Number(bd[1]) + ' 月 ' + Number(bd[2]) + ' 日'
      }),
      back: mockIdCard('back', {})
    };
    state.ocr = {
      front: { status: 'ok', msg: '已识别 ' + v.idcard + '，可以直接改' },
      back: { status: 'ok', msg: '国徽面已存档，这一面没有号码' }
    };

    // 证件照 + 手写签名：都放上，导出的 Word 才能看到"照片贴进格子、两处签字有字"
    var photo = mockPhoto();
    state.photo = photo;
    v.photo = photo ? '演示证件照.jpg' : '';
    v.photoData = photo;
    v.photoW = 300;
    v.photoH = 400;

    var sign = mockSign(c.name);
    state.sign = sign;
    v.signData = sign;
  }

  function fillDemo(c) {
    applyDemo(c);
    state.step = 0;
    render();
    saveDraft();
    toast('已填入「' + c.label + '」示例，可直接翻页看效果', 'ok');
  }

  /* 一键填案例：先验证管理员身份，再挑一个案例。
     密码和 HR 后台用的是同一个账号：
       - 连了服务器 → 走 /api/login 由服务器校验，错一次都算数
       - 没连服务器（本机演示）→ 比对页面里的演示账号 HR001 / bmai2026
     这样普通人随手点一下填不进东西，免得把演示数据混进真档案。 */

  function askAdminForDemo() {
    var online = window.Api && window.Api.state.online;

    openSheet(
      '<div class="sheet-head"><b>一键填案例</b><button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">这是给 HR / 管理员演示用的，会直接写一份完整示例进表单。'
      + '需要输入 HR 后台的密码，防止别人随手填错。</p>'
      + '<input class="field-input" id="demoNo" placeholder="工号（' + (online ? 'HR 后台工号' : 'HR001') + '）" autocomplete="off">'
      + '<input class="field-input" id="demoPw" type="password" placeholder="HR 后台密码" autocomplete="off" enterkeyhint="go">'
      + '<div class="sheet-foot"><button class="btn ghost" data-sheet-act="demo-cancel">取消</button>'
      + '<button class="btn primary" data-sheet-act="demo-auth">验证并选案例</button></div>'
    );

    setTimeout(function () {
      var n = $('#demoNo');
      if (n && !n.value) n.focus();
    }, 40);
  }

  function tryAuthDemo() {
    var no = String(($('#demoNo') || {}).value || '').trim();
    var pw = String(($('#demoPw') || {}).value || '');
    var btn = $('[data-sheet-act="demo-auth"]');
    if (!no || !pw) { toast('工号和密码都要填', 'bad'); return; }

    var online = window.Api && window.Api.state.online;

    if (online) {
      if (btn) { btn.disabled = true; btn.textContent = '验证中…'; }
      window.Api.login(no, pw).then(function (r) {
        if (r && r.ok) {
          // 校验通过：顺便拿到一个短期 token，但这里用不上，清掉免得占用登录态
          openDemoPicker();
        } else {
          if (btn) { btn.disabled = false; btn.textContent = '验证并选案例'; }
          toast((r && r.message) || '工号或密码不对', 'bad');
        }
      });
    } else {
      // 本机演示模式：直接比页面里的演示账号
      if (no === HR_ACCOUNT.no && pw === HR_ACCOUNT.pwd) {
        openDemoPicker();
      } else {
        toast('工号或密码不对（本机演示账号 HR001 / bmai2026）', 'bad');
      }
    }
  }

  function openDemoPicker() {
    var rows = DEMO_CASES.map(function (c) {
      return '<button class="demo-case" data-sheet-act="demo-pick" data-key="' + esc(c.key) + '">'
        + '<div class="dc-head"><b>' + esc(c.label) + '</b><span class="dc-tag">' + esc(c.tag) + '</span></div>'
        + '<div class="dc-name">' + esc(c.name) + '</div>'
        + '<div class="dc-meta">' + esc(c.highestEducation) + ' · ' + esc(c.major) + '</div>'
        + '</button>';
    }).join('');

    openSheet(
      '<div class="sheet-head"><b>选一个案例</b><button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">选中的案例会整份填进表单，身份证号是虚构的（能过校验，但查无此人）。</p>'
      + '<div class="demo-list">' + rows + '</div>'
      + '<div class="sheet-foot"><button class="btn ghost" data-close>取消</button></div>'
    );
  }

  function pickDemo(key) {
    var c = null;
    DEMO_CASES.forEach(function (x) { if (x.key === key) c = x; });
    if (!c) return;
    closeSheet();
    fillDemo(c);
  }

  /** 演示用的身份证示意图（画在 canvas 上，带「演示样例」水印，不是真证件） */
  function mockIdCard(side, info) {
    try {
      var cv = document.createElement('canvas');
      cv.width = 856; cv.height = 540;
      var c = cv.getContext('2d');
      if (!c) return '';

      var g = c.createLinearGradient(0, 0, 856, 540);
      g.addColorStop(0, '#EAF1FB');
      g.addColorStop(1, '#D6E4F6');
      c.fillStyle = g;
      c.fillRect(0, 0, 856, 540);
      c.strokeStyle = '#B9CCE6';
      c.lineWidth = 6;
      c.strokeRect(3, 3, 850, 534);

      c.fillStyle = '#8FA6C4';
      c.font = 'bold 30px "PingFang SC", sans-serif';
      c.fillText('中华人民共和国', 40, 62);
      c.font = 'bold 26px "PingFang SC", sans-serif';
      c.fillText('居民身份证', 40, 96);

      if (side === 'front') {
        c.fillStyle = '#DDE7F4';
        c.fillRect(600, 150, 200, 250);
        c.fillStyle = '#A9BBD2';
        c.font = '20px "PingFang SC", sans-serif';
        c.fillText('照片', 668, 285);

        var rows = [
          ['姓　名', info.name || '张明远'],
          ['性　别', (info.gender || '男') + '　　民　族 ' + (info.nation || '汉')],
          ['出　生', info.birthday || '1993 年 8 月 12 日'],
          ['住　址', info.addr || '浙江省杭州市西湖区文三路 100 号'],
          ['', info.addr2 || '3 幢 201 室']
        ];
        c.fillStyle = '#2C3E55';
        var y = 170;
        rows.forEach(function (r) {
          c.font = '22px "PingFang SC", sans-serif';
          if (r[0]) c.fillText(r[0], 40, y);
          c.fillText(r[1], 150, y);
          y += 52;
        });
        c.font = '22px "PingFang SC", sans-serif';
        c.fillText('公民身份号码', 40, 470);
        c.font = 'bold 28px "PingFang SC", sans-serif';
        c.fillText(info.idcard || '330106199308124533', 240, 470);
      } else {
        c.fillStyle = '#9FB6D4';
        c.beginPath();
        c.arc(428, 200, 62, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2C3E55';
        c.font = '24px "PingFang SC", sans-serif';
        c.fillText('签发机关', 300, 340);
        c.fillText('杭州市公安局西湖分局', 440, 340);
        c.fillText('有效期限', 300, 400);
        c.fillText('2020.08.12 — 2040.08.12', 440, 400);
      }

      // 水印：别让人拿截图当真证件
      c.save();
      c.globalAlpha = 0.12;
      c.fillStyle = '#C0392B';
      c.font = 'bold 64px "PingFang SC", sans-serif';
      c.translate(120, 300);
      c.rotate(-Math.PI / 9);
      c.fillText('演示样例 非真实证件', 0, 0);
      c.restore();

      return cv.toDataURL('image/jpeg', 0.8);
    } catch (e) { return ''; }
  }

  /**
   * 演示用的证件照：蓝底 + 人像剪影，300x400（3:4），
   * 正好是贴在登记表照片格里最常见的比例。
   */
  function mockPhoto() {
    try {
      var cv = document.createElement('canvas');
      cv.width = 300; cv.height = 400;
      var c = cv.getContext('2d');
      if (!c) return '';
      var g = c.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, '#4A7DBE');
      g.addColorStop(1, '#2F5C96');
      c.fillStyle = g;
      c.fillRect(0, 0, 300, 400);
      c.fillStyle = 'rgba(238,231,222,1)';
      c.beginPath(); c.arc(150, 138, 52, 0, Math.PI * 2); c.fill();   // 头
      c.beginPath();                                                  // 肩
      c.moveTo(48, 400); c.quadraticCurveTo(54, 250, 150, 232);
      c.quadraticCurveTo(246, 250, 252, 400); c.closePath(); c.fill();
      c.fillStyle = '#1b1b1b';                                        // 头发
      c.beginPath(); c.arc(150, 124, 52, Math.PI, Math.PI * 2); c.fill();
      return cv.toDataURL('image/jpeg', 0.86);
    } catch (e) { return ''; }
  }

  /**
   * 演示用的手写签名：拿楷体把名字写出来，比两个字更能看出"这是签名"。
   * 真员工是自己用手指签的，这条路径只给演示看效果。
   */
  function mockSign(name) {
    try {
      var cv = document.createElement('canvas');
      cv.width = 600; cv.height = 180;
      var c = cv.getContext('2d');
      if (!c) return '';
      c.clearRect(0, 0, 600, 180);
      c.fillStyle = '#14181f';
      c.font = 'italic 76px "Kaiti SC", "STKaiti", "KaiTi", "楷体", serif';
      c.textBaseline = 'middle';
      c.save();
      c.translate(70, 96);
      c.rotate(-0.05);
      c.fillText(String(name || '签名'), 0, 0);
      c.restore();
      // 收笔那一道，看起来像连笔
      c.strokeStyle = '#14181f';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(60, 132);
      c.quadraticCurveTo(220, 112, 430, 130);
      c.stroke();
      return cv.toDataURL('image/png');
    } catch (e) { return ''; }
  }

  /** 造 3 条演示记录，让 HR 后台一进来就有东西看（只用于演示） */
  function seedRecords() {
    var list = [];

    DEMO_CASES.forEach(function (c, i) {
      initState();
      applyDemo(c);
      var id = demoId(c.idHead);
      var info = checkIdCard(id).data;

      state.values.realName = c.name;
      state.values.idcard = id;
      state.values.gender = info.gender;
      state.values.birthday = info.birthday;
      state.values.phone = c.phone;

      list.push({
        id: 'seed' + i,
        formNo: 'DJ20261019-10' + (i + 1),
        submittedAt: new Date(Date.now() - (i + 1) * 27 * 60000).toISOString(),
        values: JSON.parse(JSON.stringify(state.values)),
        tables: JSON.parse(JSON.stringify(state.tables)),
        idPhotos: JSON.parse(JSON.stringify(state.idPhotos))
      });
    });

    saveRecords(list);
    initState();
    state.errors = {};
    state.tableErrors = {};
    state.step = 0;
    render();
  }

  /* ================= 提交 ================= */

  function payload() {
    return Object.assign({}, state.values, state.tables);
  }

  /**
   * 一条记录 → 一份完整的值（values + tables）。
   *
   * 受教育情况和工作经历是"表格块"，存在 rec.tables 里，跟 rec.values 是分开的两坨。
   * 打印、花名册、导出 Word 全都要用合并后的这一份——只用 rec.values 的话，
   * 那两栏永远是空的（Word 里"受教育情况""工作经历"一整片白，就是这个原因）。
   */
  function recVals(rec) {
    return Object.assign({}, (rec && rec.values) || {}, (rec && rec.tables) || {});
  }

  /** 服务端开了填写口令：先问一次，再真正提交 */
  function submit() {
    var needCode = window.Api && window.Api.state.online && window.Api.state.requireCode;
    if (needCode && !state.code) {
      askCode(function () { doSubmit(); });
      return;
    }
    doSubmit();
  }

  /** 口令错了，重新问一次并补传当前这份 */
  function askCodeAgain() {
    askCode(function () {
      var rec = state.currentRecord;
      if (!rec || !(window.Api && window.Api.state.online)) return;
      rec.code = state.code;
      state.uploadState = 'ing';
      window.Api.submit(rec).then(function (r) {
        if (r && r.ok) {
          state.uploadState = 'ok';
          toast('已补传成功', 'ok');
        } else {
          state.uploadState = 'fail';
          state.uploadError = (r && r.message) || '上传失败';
          toast(state.uploadError, 'bad');
        }
        if (state.view === 'result') renderResult();
      });
    });
  }

  function doSubmit() {
    // 全部步骤过一遍
    var failStep = -1;
    for (var i = 0; i < STEPS.length; i++) {
      var saved = state.step;
      state.step = i;
      var first = validateStep(i);
      state.step = saved;
      if (first) { failStep = i; break; }
    }
    if (failStep > -1) {
      state.step = failStep;
      render();
      setTimeout(function () {
        var first = Object.keys(state.errors).filter(function (k) { return state.errors[k]; })[0];
        scrollTo(first);
      }, 60);
      toast('第 ' + (failStep + 1) + ' 步还有没填好的地方', 'bad');
      return;
    }

    var record = {
      id: 'r' + Date.now(),
      formNo: makeFormNo(),
      submittedAt: new Date().toISOString(),
      values: JSON.parse(JSON.stringify(state.values)),
      tables: JSON.parse(JSON.stringify(state.tables)),
      // 身份证照片随档案走：导出时按人放进各自的文件夹
      idPhotos: { front: state.idPhotos.front, back: state.idPhotos.back },
      code: state.code || ''
    };
    record.values.idcardMasked = checkIdCard(record.values.idcard).valid
      ? checkIdCard(record.values.idcard).data.masked : record.values.idcard;

    var list = loadRecords();
    list.push(record);
    saveRecords(list);
    // 已经交上去了，草稿就没用了。留着的话下次打开会以为"还有一份没提交"，
    // 员工很可能就照着旧数据再交一份，编号还不一样。
    clearDraft();

    state.currentRecord = record;
    state.resultAs = 'employee';
    // 表已经交上去了，表单清空：此时点顶栏「填写登记」应该是给下一个人一张空表，
    // 而不是把刚交过的内容还摆在上面（容易被再交一遍，HR 收到两条）
    resetForm();
    state.uploadState = '';
    switchView('result');
    toast('提交成功，已生成登记编号', 'ok');

    // 有服务器就同步上去；连不上也只是存本机，不影响继续用
    if (window.Api && window.Api.state.online) {
      state.uploadState = 'ing';
      window.Api.submit(record).then(function (r) {
        if (r && r.ok) {
          state.uploadState = 'ok';
        } else if (r && r.code === 'BAD_CODE') {
          // 口令错了：清掉重问，别让人卡在这一步
          state.code = '';
          state.uploadState = 'fail';
          state.uploadError = '填写口令不对';
          askCodeAgain();
        } else {
          state.uploadState = 'fail';
          state.uploadError = (r && r.message) || '上传失败';
          toast('上传没成功，已存在本机：' + state.uploadError, 'bad');
        }
        if (state.view === 'result') renderResult();
      });
    } else {
      state.uploadState = 'local';
    }
  }

  function makeFormNo() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return 'DJ' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + String(Math.floor(Math.random() * 9000) + 1000);
  }

  function loadRecords() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveRecords(list) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(list)); } catch (e) { }
  }

  /* ================= 导出 Excel ================= */

  function fmtTime(iso) {
    var d = new Date(iso);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function registerSheet(record) {
    var blocks = buildBlocks(recVals(record));
    var rows = [];
    rows.push([{ v: schema.title, s: 2 }, { v: '', s: 2 }]);
    rows[0].__h = 34;
    rows.push([{ v: '登记编号：' + record.formNo, s: 5 }, { v: '提交时间：' + fmtTime(record.submittedAt), s: 5 }]);
    rows.push([{ v: '项　目', s: 1 }, { v: '内　容', s: 1 }]);

    var merges = ['A1:B1'];

    blocks.forEach(function (blk) {
      rows.push([{ v: blk.title, s: 1 }, { v: '', s: 1 }]);
      merges.push('A' + rows.length + ':B' + rows.length);
      blk.rows.forEach(function (r) {
        rows.push([{ v: r.label, s: 4 }, { v: r.value, s: 3 }]);
      });
    });

    return { name: '员工信息登记表', cols: [26, 62], rows: rows, merges: merges };
  }

  /**
   * 「导入花名册」不再自己拼了。
   *
   * 摩卡那份模板带着 12 个隐藏工作表（下拉选项源）、258 条数据验证、列宽和批注，
   * 手写的 XML 永远拼不出一致的结果。现在改成拿模板当底板，只往第 6 行写数据，
   * 具体实现在 xlsx-lite.js 的 fromTemplate()。
   */

  function rosterFileName(record) {
    return (record.values.realName || '未命名') + '_花名册导入_' + record.formNo + '.xlsx';
  }


  function rosterView(record) {
    var rows = [[{ v: '花名册字段名', s: 1 }, { v: '中文名', s: 1 }, { v: '本次填写内容', s: 1 }]];
    buildRoster(record.values).forEach(function (it) {
      rows.push([{ v: it.key, s: 3 }, { v: it.cn, s: 3 }, { v: String(it.value == null ? '' : it.value), s: 3 }]);
    });
    return { name: '花名册对照', cols: [26, 24, 46], rows: rows };
  }

  function helpSheet() {
    var lines = [
      ['这个文件怎么用', 2],
      ['1. 打开「员工信息登记表」页，需要纸质归档时直接打印，A4 两列排版。', 3],
      ['2. 打开「花名册对照」页，左边是总花名册的列名，右边是这位员工这次填的内容。', 3],
      ['3. 在总花名册里新增一行，按左列字段名把右列内容复制过去即可。', 3],
      ['', 3],
      ['真正要导入摩卡的是另一个文件', 2],
      ['文件名带「花名册导入」，那个文件是拿公司模板当底板生成的，', 3],
      ['12 个隐藏工作表、258 条下拉验证都在，可以直接导入，不要用本文件导入。', 3],
      ['', 3],
      ['为什么不直接写进总花名册', 2],
      ['花名册里是全体在职员工的身份证、薪资等敏感信息。程序全程不读取、不写入这份文件，', 3],
      ['每份导出只包含一个人，避免任何一次操作把整表带出去。', 3],
      ['', 3],
      ['数据来源', 2],
      ['由员工本人在登记页填写，服务端按同一份表单结构校验后生成。', 3]
    ];
    return {
      name: '使用说明', cols: [96],
      rows: lines.map(function (l) { return [{ v: l[0], s: l[1] }]; }),
      merges: []
    };
  }

  /** 主导出：模板底板 + 一人一行，可直接导入摩卡 */
  function downloadRecord(record) {
    var row = buildRosterRow(recVals(record));
    var blob = window.XLSXLite.fromTemplate([row]);
    var name = rosterFileName(record);
    window.XLSXLite.download(blob, name);

    var miss = missingRequired(row);
    toast(miss.length ? ('已导出，导入前还需补：' + miss.join('、')) : ('已导出 ' + name));
  }

  /** 副导出：给人看的登记表，用来打印归档，不参与系统导入 */
  function downloadRegister(record) {
    var blob = window.XLSXLite.build([
      registerSheet(record),
      rosterView(record),
      helpSheet()
    ]);
    var name = (record.values.realName || '未命名') + '_员工信息登记表_' + record.formNo + '.xlsx';
    window.XLSXLite.download(blob, name);
    toast('已导出登记表（打印用）');
  }

  function downloadAll() {
    var list = loadRecords();
    if (!list.length) { toast('还没有提交记录', 'bad'); return; }

    // 每个人一行，第 6 行开始，顺序按提交时间
    var rows = list.map(function (rec) { return buildRosterRow(recVals(rec)); });
    var blob = window.XLSXLite.fromTemplate(rows);
    var name = '花名册导入_' + list.length + '人_'
      + fmtTime(new Date().toISOString()).slice(0, 10) + '.xlsx';
    window.XLSXLite.download(blob, name);

    var noNo = list.filter(function (rec) {
      return !String(buildRosterRow(recVals(rec))[1] || '').trim();
    }).length;
    toast('已导出 ' + list.length + ' 人，其中 ' + noNo + ' 人待补工号');
  }

  /**
   * 处理台账：给 HR 自己用的进度表，不进摩卡。
   *
   * 跟「花名册导入」分开是因为两个文件的用途完全不同：
   *   花名册 → 喂系统，只放员工填的客观字段；
   *   台账   → 给人看进度，放的是 HR 的处理状态和备注。
   */
  function downloadTrack() {
    var list = hrAll();
    if (!list.length) { toast('还没有提交记录', 'bad'); return; }

    var head = ['登记编号', '姓名', '手机号', '学历', '处理状态', '备注', '提交时间', '状态更新时间', '经办人'];
    var rows = [head.map(function (t) { return { v: t, s: 1 }; })];

    list.forEach(function (r) {
      var v = r.values || {};
      rows.push([
        { v: r.formNo, s: 3 },
        { v: v.realName || '', s: 3 },
        { v: String(v.phone || ''), s: 3 },
        { v: v.highestEducation || '', s: 3 },
        { v: statusMeta(statusOf(r)).label, s: 3 },
        { v: r.remark || '', s: 3 },
        { v: fmtTime(r.submittedAt), s: 3 },
        { v: r.statusAt ? fmtTime(r.statusAt) : '', s: 3 },
        { v: r.statusBy || '', s: 3 }
      ]);
    });

    var blob = window.XLSXLite.build([{
      name: '处理台账',
      cols: [22, 11, 15, 10, 12, 40, 18, 18, 11],
      rows: rows
    }]);
    window.XLSXLite.download(blob, '入职处理台账_'
      + fmtTime(new Date().toISOString()).slice(0, 10) + '.xlsx');
    toast('已导出处理台账（' + list.length + ' 人）');
  }

  /* ================= 导出：按人分文件夹的 zip ================= */

  function saveBytes(bytes, name, mime) {
    var blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    window.XLSXLite.download(blob, name);
  }

  function docTitle(rec) {
    return (rec.values.realName || '未命名') + '_员工信息登记表';
  }

  function downloadWord(rec) {
    try {
      saveBytes(window.TemplateDocx.build(recVals(rec), {
        noWork: !!(rec.values && rec.values.noWork)
      }), docTitle(rec) + '.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      toast('已导出 Word（公司模板）');
    } catch (e) {
      toast('Word 生成失败：' + e.message, 'bad');
    }
  }

  /* 不再导出 PDF：网页里重画的 PDF 和 Word 排版必然对不上，
     与其给一份"看着像、其实不一样"的文件，不如只给 Word。
     HR 用批量转换工具（或 Word 另存为）转一次，出来的才是标准版式。 */

  /**
   * 打包：N 个文件夹 + 1 个融合版花名册
   */
  function downloadPackage(records, opts) {
    var list = (records || []).filter(Boolean);
    if (!list.length) { toast('还没有提交记录', 'bad'); return Promise.resolve(null); }

    toast('正在打包 ' + list.length + ' 人的资料，请稍候…');

    // 先让浏览器把提示画出来，再开始生成（Word 是重活，会占住主线程）
    return new Promise(function (r) { setTimeout(r, 60); })
      .then(function () { return ensurePhotos(list); })
      .then(function () { return window.Pack.build(list, opts); })
      .then(function (r) {
      saveBytes(r.bytes, r.name, 'application/zip');
      var msg = '已打包 ' + r.report.persons + ' 人 · Word ' + r.report.word
        + ' · 照片 ' + r.report.photos + ' 张';
      if (r.report.missingPhoto.length) msg += '（缺照片 ' + r.report.missingPhoto.length + ' 张）';
      if (r.report.wordFail.length) msg += '（Word 失败 ' + r.report.wordFail.length + ' 人）';
      toast(msg, r.report.missingPhoto.length || r.report.wordFail.length ? '' : 'ok');
      return r;
    }).catch(function (e) {
      console.error(e);
      toast('打包失败：' + e.message, 'bad');
      return null;
    });
  }

  /* ================= 和服务器同步 ================= */

  /** 记录来自服务器时，照片只有"有没有"的标记，导出前才按需下载正文 */
  function ensurePhotos(list) {
    if (!(window.Api && window.Api.state.online && window.Api.hasToken())) return Promise.resolve();
    var todo = list.filter(function (r) { return r.remote && !(r.idPhotos && r.idPhotos.front); });
    if (!todo.length) return Promise.resolve();

    var i = 0;
    return new Promise(function (resolve) {
      (function next() {
        if (i >= todo.length) return resolve();
        var rec = todo[i++];
        window.Api.record(rec.formNo).then(function (res) {
          if (res && res.ok && res.record) {
            rec.idPhotos = res.record.idPhotos || rec.idPhotos;
            rec.values = res.record.values || rec.values;
            rec.tables = res.record.tables || rec.tables;
            rec.remote = false;
          }
          next();
        }, next);
      })();
    });
  }

  /** 进 HR 后台时把服务器上的记录合并到本机列表 */
  function syncRemote() {
    if (!(window.Api && window.Api.state.online && window.Api.hasToken())) return;
    window.Api.records().then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.list)) return;

      var map = {};
      loadRecords().forEach(function (x) { map[x.formNo] = x; });

      var added = 0;
      r.list.forEach(function (x) {
        var prev = map[x.formNo];
        if (!prev) added += 1;
        map[x.formNo] = {
          id: x.id,
          formNo: x.formNo,
          submittedAt: x.submittedAt,
          values: x.values || {},
          tables: x.tables || {},
          // 照片不跟着列表走，只记住有没有
          idPhotos: (prev && prev.idPhotos) || null,
          hasFront: !!x.hasFront,
          hasBack: !!x.hasBack,
          // 处理状态以服务器为准（可能是在另一台电脑上标的），服务器没有就沿用本机
          status: x.status || (prev && prev.status) || 'pending',
          remark: x.remark !== undefined ? x.remark : ((prev && prev.remark) || ''),
          statusAt: x.statusAt || (prev && prev.statusAt) || '',
          statusBy: x.statusBy || (prev && prev.statusBy) || '',
          remote: true
        };
      });

      var arr = Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (a, b) { return String(a.submittedAt).localeCompare(String(b.submittedAt)); });
      saveRecords(arr);

      if (state.view === 'hr') renderHr();
      if (added) toast('已从服务器同步 ' + added + ' 条新记录', 'ok');
    });
  }

  /* ================= 视图切换 ================= */

  /* 首页：先分「员工」还是「HR」，再进各自的界面。
     员工扫码进来是带着 #form 的，直接进填表，不会看到这一页。 */
  var ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="8" r="3.4"/><path d="M4.9 20c.6-3.5 3.6-5.5 7.1-5.5s6.5 2 7.1 5.5"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.2"/>'
    + '<path d="M8.3 10.4V8a3.7 3.7 0 0 1 7.4 0v2.4"/></svg>';

  function renderHome() {
    var hrOn = state.hr.authed || !!(window.Api && window.Api.hasToken && window.Api.hasToken());
    var draft = peekDraft();

    var html = '<div class="home">'
      + '<div class="home-hero">'
      + '<div class="home-logo">登</div>'
      + '<h1>员工信息登记</h1>'
      + '<p>博迈医疗 · 人事行政部</p>'
      + '</div>'

      + '<div class="home-cards">'
      + '<button class="home-card" type="button" data-act="go-form">'
      + '<span class="hc-ico">' + ICON_USER + '</span>'
      + '<span class="hc-txt"><b>我是员工</b>'
      + '<span>填写入职登记表 · 约 6~10 分钟</span>'
      + '<em>' + (draft
        ? '有一份未提交的草稿，停在第 ' + (draft.step + 1) + ' 步'
        : '要准备身份证，中途可以关掉下次接着填') + '</em></span>'
      + '<span class="hc-go">开始填写</span>'
      + '</button>'

      + '<button class="home-card" type="button" data-act="go-hr">'
      + '<span class="hc-ico">' + ICON_LOCK + '</span>'
      + '<span class="hc-txt"><b>我是 HR</b>'
      + '<span>登录后台 · 查看、筛选与导出档案</span>'
      + '<em>' + (hrOn ? '这台设备已登录，可以直接进' : '需要工号与密码') + '</em></span>'
      + '<span class="hc-go">' + (hrOn ? '进入后台' : '去登录') + '</span>'
      + '</button>'
      + '</div>'

      + '<p class="home-foot">内部系统 · 仅用于员工入职登记<span>填的内容只有 HR 看得到，身份证照片不外传</span></p>'
      + '</div>';

    $('#viewHome').innerHTML = html;
  }

  /** 员工入口的门槛：现在没有门槛，直接放行。
   *  以后要加一道「简易口令」或「真人验证」（滑块、图形码、短信码），只改这一个函数：
   *  返回 true 进填表；返回 false 就把人拦在首页，并弹自己的验证弹层。
   *  别把验证逻辑散在 renderHome / switchView 里，不然以后找不到。*/
  function gateOk() { return true; }

  function enterForm() {
    if (!gateOk()) return;
    switchView('form');
  }

  function switchView(name) {
    // HR 后台要登录；没登录先去登录页
    if (name === 'hr' && !state.hr.authed) name = 'login';

    state.view = name;
    var views = {
      home: '#viewHome', form: '#viewForm', hr: '#viewHr',
      result: '#viewResult', login: '#viewLogin'
    };
    Object.keys(views).forEach(function (k) {
      var el = $(views[k]);
      if (el) el.hidden = k !== name;
    });
    // 首页不显示顶栏那条「填写登记 / HR 后台」——首页本身就是选这两个
    document.body.dataset.view = name;

    var tabName = name === 'login' ? 'hr' : name;
    $$('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.view === tabName); });

    if (name === 'home') renderHome();
    if (name === 'login') renderLogin();
    if (name === 'hr') { renderHr(); syncRemote(); }
    if (name === 'result') renderResult();
    // 进填写页要重画整张表：只画侧栏的话，state 已经清空了、屏幕上还留着上一个人的字
    if (name === 'form') render();
  }

  /* ================= HR 登录 ================= */

  function loadHrSession() {
    try {
      var raw = sessionStorage.getItem(HR_SESSION_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      if (!d || !d.no) return false;
      if (Date.now() - d.at > 8 * 3600 * 1000) return false;   // 8 小时过期
      state.hr.authed = true;
      state.hr.empNo = d.no;
      return true;
    } catch (e) { return false; }
  }

  function saveHrSession() {
    try {
      sessionStorage.setItem(HR_SESSION_KEY, JSON.stringify({ no: state.hr.empNo, at: Date.now() }));
    } catch (e) { /* 忽略 */ }
  }

  function logoutHr() {
    try { sessionStorage.removeItem(HR_SESSION_KEY); } catch (e) { }
    state.hr.authed = false;
    state.hr.empNo = '';
    state.hr.sel = {};
    if (window.Api) window.Api.clearToken();
    switchView('home');   // 退出回首页，不回填表页 —— HR 不该被丢进员工的界面
    toast('已退出 HR 后台');
  }

  function renderLogin() {
    var locked = Date.now() < state.hr.lockedUntil;
    var wait = Math.ceil((state.hr.lockedUntil - Date.now()) / 1000);

    var html = '<div class="login-wrap"><div class="login-card">'
      + '<div class="login-brand"><div class="logo lg">登</div>'
      + '<div class="login-brand-txt"><b>HR 后台</b><span>员工档案 · 导出与归档</span></div></div>';

    html += '<form id="hrLogin" autocomplete="off" novalidate>'
      + '<label class="login-field"><span>工号</span>'
      + '<input class="in mono" id="hrNo" name="hrNo" inputmode="text" placeholder="例如 HR001" autocomplete="off"></label>'
      + '<label class="login-field"><span>密码</span>'
      + '<input class="in" id="hrPwd" name="hrPwd" type="password" placeholder="请输入密码" autocomplete="new-password"></label>';

    if (state.hr.error) html += '<div class="login-err">' + esc(state.hr.error) + '</div>';

    html += '<button class="btn primary block" type="submit"' + ((locked || state.hr.busy) ? ' disabled' : '') + '>'
      + (state.hr.busy ? '登录中…' : (locked ? (wait + ' 秒后可重试') : '登录')) + '</button>'
      + '</form>';

    var online = window.Api && window.Api.state.online;
    html += '<div class="login-note">'
      + (online
        ? '<b>账号由服务器校验</b><span>忘记密码让管理员在服务器上执行 '
          + '<code>node server.js --password 新密码</code></span>'
        : '<b>演示账号</b>　工号 <code>HR001</code>　密码 <code>bmai2026</code>'
          + '<span>当前没连服务器，所以校验写在前端。部署到服务器后会自动改成服务器校验。</span>')
      + '</div>';

    html += '</div></div>';

    $('#viewLogin').innerHTML = html;

    var form = $('#hrLogin');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var no = ($('#hrNo') || {}).value || '';
        var pwd = ($('#hrPwd') || {}).value || '';
        doLogin(no.trim(), pwd);
      });
    }
  }

  function doLogin(no, pwd) {
    if (Date.now() < state.hr.lockedUntil) {
      state.hr.error = '尝试次数过多，请稍后再试';
      renderLogin();
      return;
    }
    if (!no || !pwd) {
      state.hr.error = '工号和密码都要填';
      renderLogin();
      return;
    }
    // 有服务器就让服务器校验密码，前端不参与比对
    if (window.Api && window.Api.state.online) {
      state.hr.error = '';
      state.hr.busy = true;
      renderLogin();
      window.Api.login(no, pwd).then(function (r) {
        state.hr.busy = false;
        if (r && r.ok) {
          state.hr.authed = true;
          state.hr.empNo = r.empNo || no;
          state.hr.tries = 0;
          state.hr.error = '';
          saveHrSession();
          switchView('hr');
          toast('欢迎回来', 'ok');
        } else {
          state.hr.error = (r && r.message) || '登录失败';
          renderLogin();
          var el = $('#hrPwd'); if (el) { el.value = ''; el.focus(); }
        }
      });
      return;
    }

    if (no === HR_ACCOUNT.no && pwd === HR_ACCOUNT.pwd) {
      state.hr.authed = true;
      state.hr.empNo = no;
      state.hr.tries = 0;
      state.hr.error = '';
      saveHrSession();
      switchView('hr');
      toast('欢迎回来，' + HR_ACCOUNT.name, 'ok');
      return;
    }

    state.hr.tries += 1;
    var left = HR_MAX_TRY - state.hr.tries;
    if (left <= 0) {
      state.hr.lockedUntil = Date.now() + HR_LOCK_MS;
      state.hr.tries = 0;
      state.hr.error = '连续错 ' + HR_MAX_TRY + ' 次，锁定 ' + (HR_LOCK_MS / 1000) + ' 秒';
      setTimeout(function () { if (state.view === 'login') renderLogin(); }, HR_LOCK_MS + 200);
    } else {
      state.hr.error = '工号或密码不对，还可以试 ' + left + ' 次';
    }
    renderLogin();
    var pwdEl = $('#hrPwd');
    if (pwdEl) { pwdEl.value = ''; pwdEl.focus(); }
  }

  /** 这一份提交到底去哪了 —— 让员工自己看得见 */
  function uploadLine() {
    var s = state.uploadState;
    if (s === 'ok') return '<i class="up up-ok">已提交到服务器，HR 后台能看到</i>';
    if (s === 'ing') return '<i class="up up-warn">正在上传到服务器…</i>';
    if (s === 'fail') return '<i class="up up-bad">上传失败（' + esc(state.uploadError) + '），数据暂存在这台设备</i>';
    if (s === 'local') return '<i class="up up-warn">当前没连服务器，这份数据只存在这台设备的浏览器</i>';
    return '';
  }

  /**
   * 员工交完表看到的这一屏。
   * 只有三件事：交上了（编号）、填的对不对（登记表全文）、接下来干什么（HR 配的引导）。
   * 打包下载、花名册、字段对照、文件夹结构都只对 HR 有意义，别往员工眼前放。
   */
  function renderResultEmployee(rec) {
    var blocks = buildBlocks(recVals(rec));

    var html = '<div class="page-head">'
      + '<div><h1>登记表已提交</h1>'
      + '<p>不用再做什么了。下面是您填的内容，花一分钟对一下有没有写错。</p></div>'
      + '</div>';

    html += '<div class="ok-banner"><div class="ok-ic">✓</div><div>'
      + '<b>登记编号 ' + esc(rec.formNo) + '</b>'
      + '<span>' + esc(rec.values.realName) + '　·　提交于 ' + esc(fmtTime(rec.submittedAt)) + '</span>'
      + uploadLine() + '</div></div>';

    html += '<div class="review">'
      + '<div class="review-head"><b>您填写的内容</b>'
      + '<span>逐项看一眼。有写错的就点下面的「重新填一份」，HR 以最后收到的那份为准；'
      + '没有错的就不用管了，关掉页面就行。</span></div>'
      + '<table class="tbl doc"><tbody>'
      + '<tr><td colspan="2" class="doc-title">' + esc(schema.title) + '</td></tr>'
      + '<tr><td colspan="2" class="doc-meta">登记编号 ' + esc(rec.formNo) + '　|　'
      + esc(fmtTime(rec.submittedAt)) + '</td></tr>';

    blocks.forEach(function (blk) {
      html += '<tr><td colspan="2" class="doc-group">' + esc(blk.title) + '</td></tr>';
      blk.rows.forEach(function (r) {
        html += '<tr><td class="doc-label">' + esc(r.label) + '</td><td>' + esc(r.value) + '</td></tr>';
      });
    });

    html += '</tbody></table>'
      + '<div class="review-foot">'
      + '<span>如果 HR 已经核对过，需要改的地方直接找 HR。</span>'
      + '<button class="btn ghost" data-act="again">填错了，重新填一份</button>'
      + '</div></div>';

    // 接下来怎么走（HR 在后台配的）
    html += guideCardHtml();

    $('#viewResult').innerHTML = html;
    $('#viewResult').onclick = function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'copyguide') { copyText(btn.dataset.v, '已复制，去微信里搜这个号'); return; }
      if (btn.dataset.act === 'again') {
        resetForm();
        switchView('form');
        toast('重新填一份，上一份 HR 那边还留着');
      }
    };
  }

  function renderResult() {
    var rec = state.currentRecord;
    if (!rec) { switchView('hr'); return; }

    // 员工只看自己的内容，HR 才看导出包
    if (state.resultAs !== 'hr') { renderResultEmployee(rec); return; }

    var blocks = buildBlocks(recVals(rec));
    var roster = buildRoster(recVals(rec));

    var html = '<div class="page-head">'
      + '<div><h1>' + esc(rec.values.realName || '员工') + ' 的登记表</h1>'
      + '<p>这里是这位员工的完整档案：Word 和身份证正反面打包带走，'
      + '外面的花名册那一行可以直接导入摩卡。</p></div>'
      + '<div class="page-actions">'
      + '<button class="btn ghost" data-act="back">返回列表</button>'
      + '<button class="btn primary" data-act="pkg">打包下载</button>'
      + '</div></div>';

    html += '<div class="ok-banner"><div class="ok-ic">✓</div><div>'
      + '<b>登记编号 ' + esc(rec.formNo) + '</b>'
      + '<span>' + esc(rec.values.realName) + '　·　提交于 ' + esc(fmtTime(rec.submittedAt)) + '</span>'
      + uploadLine() + '</div></div>';

    // 「接下来怎么走」是给员工看的，后台这页不放：
    // HR 自己就是那个"接下来"的执行人，摆在这儿只是噪音
    html += '<div class="sheet-tabs">'
      + '<button class="sheet-tab is-on" data-sheet="0">花名册那一行</button>'
      + '<button class="sheet-tab" data-sheet="1">登记表（打印）</button>'
      + '<button class="sheet-tab" data-sheet="2">字段对照</button>'
      + '<button class="sheet-tab" data-sheet="3">文件夹结构</button></div>';

    // 0 导入花名册：与摩卡模板逐列一致，119 列固定
    var rowVals = buildRosterRow(recVals(rec));
    var miss = missingRequired(rowVals);
    var filled = ROSTER.COLUMNS.filter(function (c, i) { return String(rowVals[i]).trim() !== ''; }).length;

    html += '<div class="sheet-pane" data-pane="0">';
    html += '<div class="pane-note"><b>主文件：模板底板 + 下面这一行</b>'
      + '<span>导出的 xlsx 就是公司那份模板本身 —— 12 个隐藏工作表（下拉选项源）、258 条数据验证、'
      + '列宽、批注全部原样保留，只在第 6 行写入这一行数据。导入摩卡时直接用，不要改列顺序、不要改表头。</span></div>';
    if (miss.length) {
      html += '<div class="pane-warn">导入前需补齐：<b>' + esc(miss.join('、')) + '</b>'
        + '（模板里标了 * 的必填列。工号由 HR 分配，表单不采集）</div>';
    }
    html += '<div class="pane-tip">事件类型已默认填「<b>' + esc(ROSTER.FIXED.event_type || '入职')
      + '</b>」（本系统只收新员工）。若这人是重新入职，导入前把这一列改成「重新入职」，'
      + '并确保系统里已有他的离职记录。</div>';
    html += '<table class="tbl"><thead><tr><th>中文名</th><th>字段代号</th><th>本次的值</th></tr></thead><tbody>';
    ROSTER.COLUMNS.forEach(function (c, i) {
      var v = String(rowVals[i]);
      if (!v.trim()) return;
      html += '<tr><td>' + esc(c.cn.replace(/^\*/, '')) + (c.cn.charAt(0) === '*' ? ' <i class="star">*</i>' : '')
        + '</td><td class="mono-cell">' + esc(c.key) + '</td><td>' + esc(v) + '</td></tr>';
    });
    html += '</tbody></table>'
      + '<p class="hint">只列出有值的 ' + filled + ' 列，其余 ' + (119 - filled) + ' 列留空（不是缺失，是这件事本来就不该填）。</p></div>';

    // 1 打印用登记表
    html += '<div class="sheet-pane" data-pane="1" hidden><table class="tbl doc"><tbody>';
    html += '<tr><td colspan="2" class="doc-title">' + esc(schema.title) + '</td></tr>';
    html += '<tr><td colspan="2" class="doc-meta">登记编号 ' + esc(rec.formNo) + '　|　'
      + esc(fmtTime(rec.submittedAt)) + '</td></tr>';
    blocks.forEach(function (blk) {
      html += '<tr><td colspan="2" class="doc-group">' + esc(blk.title) + '</td></tr>';
      blk.rows.forEach(function (r) {
        html += '<tr><td class="doc-label">' + esc(r.label) + '</td><td>' + esc(r.value) + '</td></tr>';
      });
    });
    html += '</tbody></table></div>';

    // 2 字段对照
    html += '<div class="sheet-pane" data-pane="2" hidden><table class="tbl"><thead><tr>'
      + '<th>花名册字段名</th><th>中文名</th><th>本次填写内容</th></tr></thead><tbody>'
      + roster.map(function (it) {
        return '<tr><td class="mono-cell">' + esc(it.key) + '</td><td>' + esc(it.cn) + '</td><td>'
          + esc(it.value) + '</td></tr>';
      }).join('') + '</tbody></table>'
      + '<p class="hint">给人看的版本：左边是花名册列名，右边是这位员工这次填的内容。</p></div>';

    // 3 文件夹结构
    var folder = window.Pack.safe(rec.values.realName, '未命名');
    var ph = (rec.idPhotos || {});

    html += '<div class="sheet-pane" data-pane="3" hidden>'
      + '<div class="pane-note"><b>解压后长这样</b>'
      + '<span>每人一个文件夹，文件夹名＝员工姓名；里面的 Word 也用同一个名字开头，'
      + 'HR 一眼能对上人。花名册在文件夹外面，是一个总的 xlsx。</span></div>';

    html += '<div class="tree">'
      + '<div class="tree-row is-dir"><i>📁</i>入职档案_' + esc(fmtTime(rec.submittedAt).slice(0, 10)) + '</div>'
      + '<div class="tree-row lv1 is-file xls"><i>▤</i>花名册导入_1人_xlsx<span>融合版花名册</span></div>'
      + '<div class="tree-row lv1 is-dir"><i>📁</i>' + esc(folder) + '</div>'
      + '<div class="tree-row lv2 is-file doc"><i>▤</i>' + esc(folder) + '_员工信息登记表.docx</div>'
      + (ph.front ? '<div class="tree-row lv2 is-file img"><i>▣</i>' + esc(folder) + '_身份证正面.jpg</div>' : '')
      + (ph.back ? '<div class="tree-row lv2 is-file img"><i>▣</i>' + esc(folder) + '_身份证反面.jpg</div>' : '')
      + (!ph.front && !ph.back ? '<div class="tree-row lv2 is-miss"><i>!</i>没有上传身份证照片</div>' : '')
      + '</div>';

    if (ph.front || ph.back) {
      html += '<div class="idpreview">'
        + (ph.front ? '<figure><img src="' + ph.front + '" alt=""><figcaption>身份证人像面（识别用）</figcaption></figure>' : '')
        + (ph.back ? '<figure><img src="' + ph.back + '" alt=""><figcaption>身份证国徽面</figcaption></figure>' : '')
        + '</div>';
    }

    html += '<div class="help-text" style="padding-top:6px">'
      + '<p><b>为什么是 zip 不是真文件夹</b>：浏览器没有写本地目录的权限，'
      + '解压出来就是真文件夹，Windows / macOS 双击都行。</p>'
      + '<p><b>为什么只给 Word</b>：网页里重画的 PDF 跟 Word 排版对不上。要归档就用 Word 另存为 PDF，或者用批量转换工具转一次。</p>'
      + '<p><b>身份证照片</b>：员工自己拍的，只做存档；号码是识别出来回填的，可以改。</p>'
      + '</div>';

    html += '<div class="pane-actions">'
      + '<button class="btn ghost sm" data-act="word">只下 Word</button>'
      + '<button class="btn ghost sm" data-act="dl">只下花名册</button>'
      + '<button class="btn ghost sm" data-act="reg">只下登记表 xlsx</button>'
      + '</div></div>';

    $('#viewResult').innerHTML = html;

    $('#viewResult').onclick = function (e) {
      var tabEl = e.target.closest('[data-sheet]');
      if (tabEl) {
        var idx = tabEl.dataset.sheet;
        $$('.sheet-tab', $('#viewResult')).forEach(function (t) { t.classList.toggle('is-on', t === tabEl); });
        $$('.sheet-pane', $('#viewResult')).forEach(function (p) { p.hidden = p.dataset.pane !== idx; });
        return;
      }
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'dl') downloadRecord(rec);
      if (btn.dataset.act === 'reg') downloadRegister(rec);
      if (btn.dataset.act === 'word') downloadWord(rec);
      if (btn.dataset.act === 'pkg') downloadPackage([rec]);
      if (btn.dataset.act === 'copyguide') { copyText(btn.dataset.v, '已复制，去微信里搜这个号'); return; }
      if (btn.dataset.act === 'back') { switchView('hr'); return; }
      if (btn.dataset.act === 'again') {
        resetForm();
        switchView('form');
      }
    };
  }

  /* ================= 提交之后的「下一站」 ================= */

  function currentGuide() {
    if (window.Api && window.Api.state.guide) return window.Api.state.guide;
    return state.guide;
  }

  function qrSvg(url, scale) {
    try {
      return window.QrLite.toSvg(window.QrLite.encode(url), {
        scale: scale || 6, quiet: 2, dark: '#111111', light: '#ffffff'
      });
    } catch (e) {
      return '';
    }
  }

  /**
   * 员工交完表，紧接着要做的三件事：等审核、看通知、加群/加人。
   * 这里只负责把 HR 配好的内容画出来，内容本身一个字都不写死。
   */
  function guideCardHtml() {
    var g = currentGuide();
    if (!g || g.enabled === false) return '';

    var html = '<div class="guide">'
      + '<div class="guide-head"><span class="guide-tag">接下来</span>'
      + '<b>' + esc(g.title || '信息已提交，接下来这样走') + '</b></div>';

    if (g.intro) html += '<p class="guide-intro">' + esc(g.intro) + '</p>';

    if (g.steps && g.steps.length) {
      html += '<ol class="guide-steps">' + g.steps.map(function (s) {
        return '<li><span>' + esc(s) + '</span></li>';
      }).join('') + '</ol>';
    }

    var links = (g.links || []).filter(function (l) { return l && (l.value || l.label); });
    if (links.length) {
      html += '<div class="guide-links">';
      links.forEach(function (l) {
        var isUrl = /^https?:\/\//i.test(l.value || '');
        if (l.kind === 'qr' && isUrl) {
          var svg = qrSvg(l.value, 6);
          html += '<div class="guide-qr">'
            + (svg ? '<div class="guide-qr-img">' + svg + '</div>' : '')
            + '<div class="guide-qr-txt"><b>' + esc(l.label) + '</b>'
            + '<span>用微信扫一扫，或长按二维码保存</span>'
            + '<a href="' + esc(l.value) + '" target="_blank" rel="noopener">扫不出来？点这里打开</a>'
            + '</div></div>';
        } else if (l.kind === 'link' && isUrl) {
          html += '<a class="guide-btn" href="' + esc(l.value) + '" target="_blank" rel="noopener">'
            + '<span>' + esc(l.label) + '</span><i>→</i></a>';
        } else if (l.value) {
          html += '<div class="guide-copy"><span>' + esc(l.label) + '</span>'
            + '<code>' + esc(l.value) + '</code>'
            + '<button class="btn ghost sm" data-act="copyguide" data-v="' + esc(l.value) + '">复制</button></div>';
        }
      });
      html += '</div>';
    }

    if (g.note) html += '<p class="guide-note">' + esc(g.note) + '</p>';
    if (g.updatedAt) {
      html += '<p class="guide-foot">这段说明由 HR 维护，最后更新于 '
        + esc(String(g.updatedAt).slice(0, 10)) + '。等不到通知可以直接联系 HR。</p>';
    }
    return html + '</div>';
  }

  /** 复制一段文字（微信号、群号之类），老浏览器用 execCommand 兜底 */
  function copyText(text, okMsg) {
    if (!text) return;
    function legacy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast(okMsg || '已复制', 'ok');
      } catch (e) {
        toast('复制不了，长按自己复制一下', 'bad');
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已复制', 'ok'); }, legacy);
    } else {
      legacy();
    }
  }

  /* ================= 员工填写入口：链接 + 二维码 ================= */

  /** 员工该打开哪个地址：优先用服务器告诉我们的对外地址 */
  function fillUrl() {
    var origin = window.Api && window.Api.state.origin;
    var base;
    if (origin) {
      base = origin.replace(/\/+$/, '') + '/';
    } else {
      base = location.href.split('#')[0].replace(/index\.html$/, '');
    }
    // 当前地址上的查询串要留着 —— 云沙箱那类环境不带 ?sharecode= 会被挡在门外。
    // 只在同源时才拼，免得把别的站点的参数带过来。
    if (base.indexOf('?') < 0 && location.search) {
      try {
        if (!origin || new URL(origin).host === location.host) base += location.search;
      } catch (e) { /* 老浏览器没有 URL，就按原样 */ }
    }
    // 员工扫开直接是填表页，不经过「我是员工 / 我是 HR」那个首页
    return base + '#form';
  }

  function showQr() {
    var url = fillUrl();
    var svg = '';
    try {
      svg = window.QrLite.toSvg(window.QrLite.encode(url), { scale: 7, quiet: 3, dark: '#111111', light: '#ffffff' });
    } catch (e) {
      svg = '<div class="qr-fail">二维码生成失败：' + esc(e.message) + '</div>';
    }
    var online = window.Api && window.Api.state.online;
    var tip = online
      ? '员工在家里用手机扫码就能填，不要求和公司连同一个网络。也可以把这个链接发到招聘平台或公众号。'
      : '现在没连服务器，二维码指向的是本机地址，别人手机扫了打不开。部署到服务器后再来这里生成。';

    openSheet(
      '<div class="sheet-head"><b>员工填写入口</b><button class="x" data-close>×</button></div>'
      + '<div class="qr-box">' + svg + '</div>'
      + '<div class="link-row"><input id="fillUrlInput" readonly value="' + esc(url) + '">'
      + '<button class="btn primary" data-sheet-act="copy">复制</button></div>'
      + '<p class="sheet-desc">' + tip + '</p>'
      + '<div class="sheet-foot">'
      + '<button class="btn ghost" data-sheet-act="poster">打印海报</button>'
      + '<button class="btn ghost" data-close>关闭</button></div>'
    );
  }

  function copyFillUrl() {
    var input = $('#fillUrlInput');
    if (!input) return;
    var url = input.value;

    function legacy() {
      try {
        input.select();
        input.setSelectionRange(0, 99999);
        document.execCommand('copy');
        toast('链接已复制', 'ok');
      } catch (e) {
        toast('复制不了，长按链接自己复制一下', 'bad');
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('链接已复制，可以发到群里了', 'ok');
      }, legacy);
    } else {
      legacy();
    }
  }

  function openPoster() {
    window.open('海报.html?u=' + encodeURIComponent(fillUrl()), '_blank');
  }

  /* ================= HR 后台 ================= */

  /* ================= 系统状态（监控） ================= */

  function fmtUptime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (d) return d + ' 天 ' + h + ' 小时';
    if (h) return h + ' 小时 ' + m + ' 分';
    return m + ' 分钟';
  }

  /** 顶栏那条状态：不点开也能一眼看出"今天有没有出事" */
  function fillSysbar() {
    var box = $('#sysbar');
    if (!box) return;
    var text = box.querySelector('.sys-text');

    if (!window.Api || !window.Api.state.online) {
      box.className = 'sysbar is-off';
      if (text) text.innerHTML = '<b>本机演示模式</b><span class="sep">·</span>没有服务器，所以没有运行状态可看';
      var more = box.querySelector('.sys-more');
      if (more) more.style.display = 'none';
      box.removeAttribute('data-act');
      return;
    }

    window.Api.stats().then(function (r) {
      if (!box.isConnected) return;
      if (!r || !r.ok) {
        box.className = 'sysbar is-warn';
        if (text) text.innerHTML = '<b>读不到系统状态</b><span class="sep">·</span>'
          + esc((r && r.message) || '未知原因') + '（登录过期了？刷新重登一次）';
        return;
      }
      state.hr.stats = r;
      var bad = r.checks.filter(function (c) { return c.level === 'bad'; }).length;
      var warn = r.checks.filter(function (c) { return c.level === 'warn'; }).length;
      box.className = 'sysbar is-' + (r.level || 'ok');
      if (text) {
        text.innerHTML = '<b>' + (bad ? '有 ' + bad + ' 项严重问题' : (warn ? '有 ' + warn + ' 项要留意' : '一切正常')) + '</b>'
          + '<span class="sep">·</span>已运行 ' + fmtUptime(r.uptimeSec)
          + '<span class="sep">·</span>今日收到 ' + r.counts.today + ' 份'
          + '<span class="sep">·</span>磁盘剩 ' + r.storage.freeBytes;
      }
    });

  }

  /** 点开状态条：把后端算好的检查项摊开给 HR 看，不用懂命令 */
  function openSysPanel() {
    var r = state.hr.stats;
    if (!window.Api || !window.Api.state.online) {
      toast('本机演示模式没有系统状态');
      return;
    }
    if (!r) {
      toast('正在读取，稍等一下');
      fillSysbar();
      return;
    }

    var dot = { ok: 'ok', warn: 'warn', bad: 'bad' };
    var rows = r.checks.map(function (c) {
      return '<li class="ck-row"><i class="ck-dot ' + (dot[c.level] || '') + '"></i>'
        + '<b>' + esc(c.name) + '</b><span>' + esc(c.text) + '</span></li>';
    }).join('');

    var errRows = r.errors.length
      ? r.errors.map(function (e) {
        return '<li class="ck-row"><i class="ck-dot bad"></i><b>' + esc(e.event) + '</b>'
          + '<span>' + esc(String(e.message || '').slice(0, 80))
          + (e.requestId ? '<code>' + esc(e.requestId) + '</code>' : '') + '</span></li>';
      }).join('')
      : '<li class="ck-row"><i class="ck-dot ok"></i><b>没有报错</b><span>服务启动以来一次错都没出</span></li>';

    openSheet(
      '<div class="sheet-head"><b>系统状态</b><button class="x" data-close>×</button></div>'
      + '<div class="sys-grid">'
      + '<div><span>已运行</span><b>' + fmtUptime(r.uptimeSec) + '</b></div>'
      + '<div><span>今日收到</span><b>' + r.counts.today + ' 份</b></div>'
      + '<div><span>累计</span><b>' + r.counts.total + ' 份</b></div>'
      + '<div><span>照片占用</span><b>' + r.storage.photosBytes + '</b></div>'
      + '<div><span>磁盘剩余</span><b>' + r.storage.freeBytes + '</b></div>'
      + '<div><span>内存占用</span><b>' + r.memory.rss + '</b></div>'
      + '</div>'
      + '<ul class="ck-list">' + rows + '</ul>'
      + '<p class="sheet-desc">最近的错误（按时间倒序，最多 8 条）：</p>'
      + '<ul class="ck-list">' + errRows + '</ul>'
      + '<p class="sheet-desc">日志在服务器 <code>' + esc(r.logs.dir) + '</code>，'
      + '一天一个文件、留 ' + r.logs.keepDays + ' 天。报错时把上面那串编号（requestId）告诉我，能直接定位到那一次请求。</p>'
      + '<div class="sheet-foot">'
      + '<button class="btn ghost" data-sheet-act="sys-refresh">刷新</button>'
      + '<button class="btn ghost" data-sheet-act="chpass">改密码</button>'
      + '</div>'
    );
  }

  function openPasswordSheet() {
    openSheet(
      '<div class="sheet-head"><b>改 HR 密码</b><button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">默认密码 <b>bmai2026</b> 必须改掉，否则谁看到这段代码都能进后台。'
      + '至少 8 位；改完所有已登录的地方会被踢下线。</p>'
      + '<input class="field-input" id="pwOld" type="password" placeholder="原密码" autocomplete="current-password">'
      + '<input class="field-input" id="pwNew" type="password" placeholder="新密码（至少 8 位）" autocomplete="new-password">'
      + '<input class="field-input" id="pwNew2" type="password" placeholder="再输一遍新密码" autocomplete="new-password">'
      + '<div class="sheet-foot">'
      + '<button class="btn ghost" data-sheet-act="chpass-cancel">取消</button>'
      + '<button class="btn primary" data-sheet-act="chpass-ok">确定改</button>'
      + '</div>'
    );
  }

  /* ================= HR 后台：配置「下一站」 ================= */

  var GUIDE_KINDS = [
    ['link', '打开网页（公众号文章、表单）'],
    ['qr', '显示二维码（群邀请、企微名片）'],
    ['text', '一段文字（微信号、群名）']
  ];

  function openGuideSheet() {
    var g = currentGuide() || {};
    var links = (g.links || []).slice(0, 3);
    while (links.length < 3) links.push({ kind: 'link', label: '', value: '' });

    var linkRows = links.map(function (l, i) {
      return '<div class="gl-row">'
        + '<select class="field-input" id="gKind' + i + '">'
        + GUIDE_KINDS.map(function (k) {
          return '<option value="' + k[0] + '"' + (l.kind === k[0] ? ' selected' : '') + '>' + esc(k[1]) + '</option>';
        }).join('')
        + '</select>'
        + '<input class="field-input" id="gLabel' + i + '" placeholder="写什么，例如「关注公众号」" value="' + esc(l.label || '') + '">'
        + '<input class="field-input" id="gValue' + i + '" placeholder="链接，或微信号 / 群名" value="' + esc(l.value || '') + '">'
        + '</div>';
    }).join('');

    openSheet(
      '<div class="sheet-head"><b>员工交完表之后看什么</b><button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">这一段显示在员工提交成功页的最上面：审核要多久、通知在哪看、群和公众号怎么进。'
      + '内容会存到服务器，换群换人改这里就行，不用改代码。三行入口留空即不显示。</p>'
      + '<label class="gl-check"><input type="checkbox" id="gEnabled"'
      + (g.enabled !== false ? ' checked' : '') + '> 在提交成功页显示这一段</label>'

      + '<p class="sheet-label">标题</p>'
      + '<input class="field-input" id="gTitle" placeholder="信息已提交，接下来这样走" value="' + esc(g.title || '') + '">'

      + '<p class="sheet-label">开头一句话</p>'
      + '<textarea class="field-input" id="gIntro" rows="2" placeholder="你的登记已经到 HR 手上。有写错的地方，点「填错了，重新填一份」重填一遍；没有的话，审核结果从下面的入口通知你。">'
      + esc(g.intro || '') + '</textarea>'

      + '<p class="sheet-label">步骤（一行一步，最多 5 步）</p>'
      + '<textarea class="field-input" id="gSteps" rows="4" placeholder="HR 核对信息，一般 1–2 个工作日&#10;收到入职通知，按通知准备材料&#10;按约定的时间到公司报到">'
      + esc((g.steps || []).join('\n')) + '</textarea>'

      + '<p class="sheet-label">通知入口（最多三行）</p>' + linkRows

      + '<p class="sheet-label">最后补一句</p>'
      + '<input class="field-input" id="gNote" placeholder="有疑问可以打 0755-xxxxxxx" value="' + esc(g.note || '') + '">'

      + '<div class="sheet-foot">'
      + '<button class="btn ghost" data-close>取消</button>'
      + '<button class="btn primary" data-sheet-act="guide-save">保存</button>'
      + '</div>'
    );
  }

  function collectGuide() {
    var val = function (sel) { var el = $(sel); return el ? String(el.value || '') : ''; };

    var steps = val('#gSteps').split('\n').map(function (s) { return s.trim(); })
      .filter(Boolean).slice(0, 5);

    var links = [];
    for (var i = 0; i < 3; i++) {
      var kind = val('#gKind' + i) || 'link';
      var label = val('#gLabel' + i).trim();
      var value = val('#gValue' + i).trim();
      if (!label && !value) continue;
      links.push({ kind: kind, label: label || value, value: value });
    }

    return {
      enabled: !!($('#gEnabled') || {}).checked,
      title: val('#gTitle').trim(),
      intro: val('#gIntro').trim(),
      steps: steps,
      links: links,
      note: val('#gNote').trim()
    };
  }

  function saveGuideFromSheet() {
    var g = collectGuide();

    // 本机演示模式没有服务器，改了只在这台电脑上生效 —— 说清楚，别让人以为员工能看到
    if (!window.Api || !window.Api.state.online) {
      state.guide = g;
      closeSheet();
      toast('本机演示模式：只在这台电脑生效，连上服务器后才会同步给员工', 'bad');
      return;
    }

    window.Api.saveGuide(g).then(function (r) {
      if (r && r.ok) {
        state.guide = r.guide;
        closeSheet();
        toast('已保存，员工下次打开提交页就能看到', 'ok');
      } else {
        toast((r && r.message) || '保存失败，检查一下是不是登录过期了', 'bad');
      }
    });
  }

  /* ================= HR 后台 ================= */

  /** 全部记录，最新的在前 */
  function hrAll() { return loadRecords().slice().reverse(); }

  /** 按当前筛选 + 搜索词过滤后的记录 */
  function hrFiltered() {
    var f = state.hr.filter;
    var q = String(state.hr.q || '').trim().toLowerCase();
    return hrAll().filter(function (r) {
      if (f !== 'all' && statusOf(r) !== f) return false;
      if (!q) return true;
      var v = r.values || {};
      return [v.realName, r.formNo, v.phone, v.idcard, v.highestEducation]
        .join(' ').toLowerCase().indexOf(q) > -1;
    });
  }

  function findRec(formNo) {
    var all = loadRecords();
    for (var i = 0; i < all.length; i++) {
      if (all[i].formNo === formNo) return all[i];
    }
    return null;
  }

  function statusCounts() {
    var c = { all: 0, pending: 0, hired: 0, rejected: 0 };
    hrAll().forEach(function (r) {
      c.all += 1;
      c[statusOf(r)] += 1;
    });
    return c;
  }

  /* ================= 重复提交检查 ================= */

  /**
   * 两条记录「像不像同一个人」，返回 { score: 0~1, why: [...] }。
   *
   * 为什么不只看身份证：员工重复填的时候，第二次常常把身份证号或手机号某几位打错，
   * 只看单一字段就漏掉了。所以按维度加权，**至少两个维度对上**才判重复：
   *
   *   身份证一致  0.85   一个身份证不可能对应两个人，单独就够判
   *   手机号一致  0.50   一家人有时共用一个号，单独不够
   *   姓名一致    0.50   同名的人很多，单独不够
   *   姓名相近    0.22   字数相同、首尾字相同（张明远 / 张明月）
   *   出生日期    0.15   辅助
   *   住址一致    0.10   辅助
   *   性别/民族   0.05 / 0.03   很弱的辅助，只用来把临界情况往上抬一点
   */
  function dupCompare(a, b) {
    var va = a.values || {}, vb = b.values || {};
    var score = 0, why = [];

    var ida = String(va.idcard || '').trim().toUpperCase();
    var idb = String(vb.idcard || '').trim().toUpperCase();
    if (ida && idb && ida === idb) { score += 0.85; why.push('身份证相同'); }

    var pa = String(va.phone || '').trim(), pb = String(vb.phone || '').trim();
    if (pa && pb && pa === pb) { score += 0.50; why.push('手机号相同'); }

    var na = String(va.realName || '').trim(), nb = String(vb.realName || '').trim();
    if (na && nb && na === nb) { score += 0.50; why.push('姓名相同'); }
    else if (na.length >= 2 && na.length === nb.length && na.charAt(0) === nb.charAt(0)
      && na.charAt(na.length - 1) === nb.charAt(nb.length - 1)) {
      score += 0.22; why.push('姓名相近');
    }

    var ba = String(va.birthday || ''), bb = String(vb.birthday || '');
    if (ba && bb && ba === bb) { score += 0.15; why.push('出生日期相同'); }

    if (va.gender && vb.gender && va.gender === vb.gender) score += 0.05;
    if (va.nation && vb.nation && va.nation === vb.nation) score += 0.03;

    var da = String(va.permanentDetail || '').trim(), db = String(vb.permanentDetail || '').trim();
    if (da && db && da === db) { score += 0.10; why.push('住址相同'); }

    return { score: Math.min(score, 1), why: why };
  }

  /** 重合度到多少算"同一个人重复填" */
  var DUP_THRESHOLD = 0.8;

  /**
   * 把疑似重复的记录归组。
   *
   * 用并查集而不是简单两两配对：A 像 B、B 像 C，就把 A/B/C 归成一组——
   * 现实里就是"第一次填错、第二次改了点、第三次又填"这种链式重复。
   */
  function findDupGroups() {
    var all = loadRecords();          // 按提交顺序，先填的在前
    var n = all.length;
    if (n < 2) return [];

    var parent = [];
    for (var i = 0; i < n; i++) parent[i] = i;
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }

    for (var p = 0; p < n; p++) {
      for (var q = p + 1; q < n; q++) {
        if (dupCompare(all[p], all[q]).score >= DUP_THRESHOLD) {
          var rp = find(p), rq = find(q);
          if (rp !== rq) parent[rp] = rq;
        }
      }
    }

    var bucket = {};
    for (var k = 0; k < n; k++) {
      var g = find(k);
      (bucket[g] = bucket[g] || []).push(all[k]);
    }

    var out = [];
    Object.keys(bucket).forEach(function (g) {
      if (bucket[g].length > 1) out.push(bucket[g]);
    });
    // 组内最新的在前（默认保留最新那条），组间人多的排前面
    out.forEach(function (grp) {
      grp.sort(function (x, y) { return String(y.submittedAt).localeCompare(String(x.submittedAt)); });
    });
    out.sort(function (x, y) { return y.length - x.length; });
    return out;
  }

  /** 一份记录里手机号打码：138****8000 */
  function maskPhone(v) {
    var s = String(v || '');
    return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
  }

  /** 身份证打码：只看前 6 后 4，中间遮掉 */
  function maskId(v) {
    var s = String(v || '');
    return s.length >= 10 ? s.slice(0, 6) + '********' + s.slice(-4) : s;
  }

  /**
   * 删一批记录：本机列表先删（界面立刻响应），在线记录再挨个通知服务器。
   * 服务器删失败不回滚本机——和改状态一个道理，本机这份也是真的，
   * 下次同步时服务器上还在的那条会重新出现，HR 能看到。
   */
  function deleteRecords(recs) {
    var gone = {};
    recs.forEach(function (r) { gone[r.formNo] = true; });
    saveRecords(loadRecords().filter(function (r) { return !gone[r.formNo]; }));
    recs.forEach(function (r) { delete state.hr.sel[r.formNo]; });

    var online = window.Api && window.Api.state.online && window.Api.hasToken();
    if (!online) { renderHr(); return Promise.resolve(0); }

    var failed = 0;
    return recs.reduce(function (chain, r) {
      return chain.then(function () {
        if (!r.id || String(r.id).indexOf('seed') === 0) return;  // 本机造的演示记录没有服务器副本
        return window.Api.remove(r.id).then(function (res) {
          if (!res || !res.ok) failed += 1;
        }).catch(function () { failed += 1; });
      });
    }, Promise.resolve()).then(function () {
      renderHr();
      return failed;
    });
  }

  /** 打开「疑似重复提交」面板 */
  function openDupSheet() {
    var groups = findDupGroups();

    if (!groups.length) {
      openSheet(
        '<div class="sheet-head"><b>没有发现重复提交</b><button class="x" data-close>×</button></div>'
        + '<p class="sheet-desc">按姓名、手机号、身份证、出生日期、住址综合比对，'
        + '重合度都没到 80%，暂时没有谁重复填。</p>'
        + '<div class="sheet-foot"><button class="btn ghost" data-close>知道了</button></div>'
      );
      return;
    }

    var total = groups.reduce(function (s, g) { return s + g.length - 1; }, 0);

    var html = '<div class="sheet-head"><b>疑似重复提交</b>'
      + '<button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">姓名、手机号、身份证、出生日期、住址综合比对，'
      + '重合度 <b>≥ 80%</b> 的归为一组。<br>'
      + '默认保留每组<b>最新提交</b>的那条（通常是本人改过之后再交的版本），其余已经打勾，'
      + '不想删哪条把勾去掉就行。</p>';

    groups.forEach(function (grp) {
      var base = dupCompare(grp[0], grp[1]);
      // 只写"依据"不写百分比：多维度叠加后经常算出来 100%，
      // 但两条的身份证明明不一样，写着 100% 反而让人怀疑工具算错了
      var basis = base.why.length ? base.why.join('、') : '综合比对';
      html += '<div class="dup-group">'
        + '<div class="dup-ghead"><b>' + esc(grp[0].values.realName || '—') + '</b>'
        + '<span class="dup-tag">' + grp.length + ' 条 · ' + esc(basis) + '</span>'
        + '</div>'
        + '<table class="dup-tbl"><thead><tr>'
        + '<th>删</th><th>姓名</th><th>手机号</th><th>身份证</th><th>提交时间</th><th>依据</th>'
        + '</tr></thead><tbody>';

      grp.forEach(function (r, ri) {
        var v = r.values || {};
        var why = ri === 0 ? ['最新提交'] : dupCompare(grp[0], r).why;
        html += '<tr' + (ri === 0 ? ' class="is-keep"' : '') + '>'
          + '<td class="ta-c"><input type="checkbox" class="dupck" data-fno="' + esc(r.formNo) + '"'
          + (ri === 0 ? '' : ' checked') + ' aria-label="删除 ' + esc(v.realName) + '"></td>'
          + '<td><span class="dup-name">' + esc(v.realName || '—') + '</span>'
          + (ri === 0 ? '<i class="dup-keep">保留</i>' : '') + '</td>'
          + '<td class="mono-cell">' + esc(maskPhone(v.phone)) + '</td>'
          + '<td class="mono-cell">' + esc(maskId(v.idcard)) + '</td>'
          + '<td class="muted nowrap">' + esc(fmtTime(r.submittedAt)) + '</td>'
          + '<td class="muted">' + esc(why.join('、')) + '</td>'
          + '</tr>';
      });

      html += '</tbody></table></div>';
    });

    html += '<div class="sheet-foot">'
      + '<button class="btn ghost" data-close>取消</button>'
      + '<button class="btn danger" data-sheet-act="dup-del">删除勾选的 '
      + '<span id="dupN">' + total + '</span> 条</button>'
      + '</div>';

    openSheet(html);
    $('#sheetBox').classList.add('is-wide');   // 六列表格，380px 太窄
  }

  /**
   * 勾选变化后同步面板：按钮上的数字、每行的「保留」标签。
   *
   * 勾上 = 要删，取消勾 = 留下——标签跟着勾选走，而不是固定贴在"最新那条"上，
   * 免得 HR 改完勾选之后，标签和实际要留的人对不上。
   */
  function syncDupSheet() {
    $$('#sheetBox .dupck').forEach(function (ck) {
      var tr = ck.closest('tr');
      if (!tr) return;
      var cell = tr.children[1];
      var tag = cell ? cell.querySelector('.dup-keep') : null;
      if (ck.checked) {
        if (tag) tag.remove();
        tr.classList.remove('is-keep');
      } else {
        if (!tag && cell) {
          var i = document.createElement('i');
          i.className = 'dup-keep';
          i.textContent = '保留';
          cell.appendChild(i);
        }
        tr.classList.add('is-keep');
      }
    });

    var n = $$('#sheetBox .dupck').filter(function (b) { return b.checked; }).length;
    var el = $('#dupN');
    if (el) el.textContent = n;
  }

  /** 按面板里勾选的条目删除 */
  function deleteDupFromSheet(btn) {
    var fnos = $$('#sheetBox .dupck')
      .filter(function (b) { return b.checked; })
      .map(function (b) { return b.getAttribute('data-fno'); });

    if (!fnos.length) { toast('一条都没勾，那就先不删', 'bad'); return; }

    var all = hrAll();
    if (fnos.length >= all.length) {
      toast('不能把所有人都删了，至少留一条', 'bad');
      return;
    }

    if (!confirm('确定删除这 ' + fnos.length + ' 条记录？删掉之后只剩服务器备份里可能有。')) return;

    var recs = fnos.map(findRec).filter(Boolean);
    btn.disabled = true;
    btn.textContent = '正在删除…';

    deleteRecords(recs).then(function (failed) {
      closeSheet();
      if (failed) {
        toast('已删 ' + (recs.length - failed) + ' 条，还有 ' + failed + ' 条没同步到服务器', 'bad');
      } else {
        toast('已删除 ' + recs.length + ' 条重复记录', 'ok');
      }
    });
  }

  /**
   * 改一条记录的处理状态 / 备注。
   *
   * 先写本机、先刷新界面，再去写服务器——HR 点一下要立刻有反应，
   * 不能等一个网络往返。服务器写失败只提示，不回滚：本机这份也是真的，
   * 下次同步时以服务器为准，这条会显示"未同步"的红字提醒。
   */
  function patchRecord(formNo, patch) {
    var list = loadRecords();
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].formNo === formNo) { rec = list[i]; break; }
    }
    if (!rec) return;

    Object.assign(rec, patch);
    rec.statusAt = new Date().toISOString();
    rec.statusBy = state.hr.empNo || '';
    saveRecords(list);
    renderHrTable();          // 先让 HR 立刻看到结果，不等网络

    if (!(window.Api && window.Api.state.online && window.Api.hasToken())) return;

    rec.metaSyncing = true;
    renderHrTable();
    window.Api.setMeta(rec.formNo, { status: statusOf(rec), remark: rec.remark || '' })
      .then(function (r) {
        rec.metaSyncing = false;
        if (!r || !r.ok) {
          rec.metaError = (r && r.message) || '没同步到服务器';
          toast('状态已存在本机，但没同步到服务器：' + rec.metaError, 'bad');
        } else {
          rec.metaError = '';
        }
        saveRecords(list);
        renderHrTable();
      });
  }

  function openMetaSheet(rec) {
    var cur = statusOf(rec);
    var name = (rec.values && rec.values.realName) || '这位员工';

    openSheet(
      '<div class="sheet-head"><b>处理状态</b><button class="x" data-close>×</button></div>'
      + '<p class="sheet-desc">' + esc(name) + ' · ' + esc(rec.formNo) + '</p>'
      + '<div class="st-pick">' + HR_STATUS.map(function (s) {
        return '<label class="st-opt ' + s.cls + (s.k === cur ? ' is-on' : '') + '">'
          + '<input type="radio" name="metaSt" value="' + s.k + '"' + (s.k === cur ? ' checked' : '') + '>'
          + '<span>' + s.label + '</span></label>';
      }).join('') + '</div>'
      + '<label class="sheet-label">备注<span>只有 HR 看得到，不会出现在员工看到的页面和导出的登记表里</span></label>'
      + '<textarea class="in ta" id="metaRemark" rows="3" maxlength="200" '
      + 'placeholder="比如：等补离职证明 / 已确认 11 月 3 日到岗">' + esc(rec.remark || '') + '</textarea>'
      + '<div class="sheet-foot"><button class="btn ghost" data-close>取消</button>'
      + '<button class="btn primary" data-sheet-act="meta-save" data-fno="' + esc(rec.formNo) + '">保存</button></div>'
    );
  }

  function saveMetaFromSheet(btn) {
    var fno = btn.getAttribute('data-fno');
    var picked = $('input[name="metaSt"]:checked');
    var st = picked ? picked.value : 'pending';
    var ta = $('#metaRemark');
    var remark = ta ? String(ta.value || '').trim().slice(0, 200) : '';

    closeSheet();
    patchRecord(fno, { status: st, remark: remark });
    toast('已保存', 'ok');
  }

  function renderHr() {
    var all = hrAll();

    // 勾选状态只保留还存在的记录（删掉的要清掉）；筛选把某些人藏起来时不丢勾选
    var sel = {};
    all.forEach(function (r) { if (state.hr.sel[r.formNo]) sel[r.formNo] = true; });
    state.hr.sel = sel;
    var selCount = Object.keys(sel).length;
    var online = window.Api && window.Api.state.online;

    var html = '<div class="page-head">'
      + '<div><h1>HR 后台'
      + (state.hr.empNo ? '<span class="who">' + esc(state.hr.empNo) + '</span>' : '')
      + '</h1>'
      + '<p class="sub">' + (online
        ? '<i class="dot ok"></i>已连服务器，员工在家里提交的表单会自动同步过来'
        : '<i class="dot"></i>本机演示模式，只看得到这台设备填过的记录') + '</p></div>'
      + '<div class="page-actions">'
      + '<button class="btn ghost" data-act="qr">填写链接 / 二维码</button>'
      + '<button class="btn ghost" data-act="guide">提交后引导</button>'
      + '<button class="btn ' + (selCount ? 'primary' : 'ghost') + '" data-act="sel"'
      + (selCount ? '' : ' disabled') + '>导出选中（' + selCount + ' 人）</button>'
      + '<button class="btn ghost" data-act="logout">退出</button>'
      + '</div></div>';

    // 顶栏那条"系统状态"：HR 每天上班第一眼就该看这个，不用登服务器
    html += '<div class="sysbar" id="sysbar" data-act="sys" role="button" tabindex="0">'
      + '<span class="sys-dot"></span><span class="sys-text">正在读取系统状态…</span>'
      + '<span class="sys-more">详情</span></div>';

    html += hrToolsHtml();
    html += '<div id="hrTableBox"></div>';

    $('#viewHr').innerHTML = html;
    renderHrTable();
    fillSysbar();
  }

  /** 筛选条 + 搜索框。人一多，这两个是 HR 用得最频的控件 */
  function hrToolsHtml() {
    var c = statusCounts();
    var tabs = [{ k: 'all', label: '全部' }].concat(HR_STATUS);
    return '<div class="hr-tools">'
      + '<div class="hr-filters">' + tabs.map(function (s) {
        return '<button class="fbtn' + (state.hr.filter === s.k ? ' is-on' : '') + '"'
          + ' data-act="filter" data-f="' + s.k + '">' + s.label
          + '<b>' + c[s.k] + '</b></button>';
      }).join('') + '</div>'
      + '<input class="in hr-search" id="hrSearch" type="search" autocomplete="off"'
      + ' placeholder="搜姓名 / 编号 / 手机号" value="' + esc(state.hr.q) + '">'
      + '</div>';
  }

  /** 只重画表格（筛选、搜索、改状态都走这里，不整页重绘，搜索框不会丢焦点） */
  function renderHrTable() {
    var box = $('#hrTableBox');
    if (!box) return;

    var list = hrFiltered();
    var all = hrAll();
    var online = window.Api && window.Api.state.online;
    var html = '';

    if (!all.length) {
      html += '<div class="empty"><b>还没有人提交</b>'
        + '<span>' + (online
          ? '把「填写链接 / 二维码」发出去，员工填完就会出现在这里。'
          : '去「填写登记」页点「一键填入示例数据」，再提交一份，这里就会出现记录。') + '</span>'
        + '<div class="empty-btns">'
        + '<button class="btn primary" data-act="qr">看填写入口</button>'
        + '<button class="btn ghost" data-act="go">去填写</button></div></div>';
      box.innerHTML = html;
      refreshSelUi();
      return;
    }

    if (!list.length) {
      html += '<div class="empty slim"><b>没有符合条件的人</b>'
        + '<span>换一个状态，或者把搜索框清空再看看。</span></div>';
      box.innerHTML = html;
      refreshSelUi();
      return;
    }

    html += '<div class="hr-table"><table class="tbl"><thead><tr>'
      + '<th class="ta-c ck-col"><input type="checkbox" id="ckAll" aria-label="全选"></th>'
      + '<th>姓名</th><th class="col-status">状态</th><th class="col-gender">性别</th>'
      + '<th>手机号</th><th class="col-edu">学历</th>'
      + '<th class="col-marks">资料</th><th class="col-no">编号</th><th class="col-time">提交时间</th>'
      + '<th class="ta-r">操作</th></tr></thead><tbody>';

    list.forEach(function (r) {
      var ph = r.idPhotos || {};
      var hasF = !!ph.front || !!r.hasFront;
      var hasB = !!ph.back || !!r.hasBack;
      // "W / P" 这两个标记永远是绿的（浏览器现场生成，不可能失败），
      // 摆在那里只占宽度，删掉；"照 / 反"才是 HR 真要看的
      var marks = (hasF ? '<i class="mk ok">照</i>' : '<i class="mk">照</i>')
        + (hasB ? '<i class="mk ok">反</i>' : '<i class="mk">反</i>');

      var st = statusMeta(statusOf(r));
      var remark = String(r.remark || '');
      var stCell = '<button class="st-pill ' + st.cls + '" data-act="meta" data-fno="' + esc(r.formNo) + '"'
        + (remark ? ' title="' + esc(remark) + '"' : '') + '>' + st.label + '</button>';
      if (remark) {
        stCell += '<div class="st-note">' + esc(remark.length > 10 ? remark.slice(0, 10) + '…' : remark) + '</div>';
      }
      if (r.metaSyncing) stCell += '<div class="st-sync">同步中…</div>';
      else if (r.metaError) stCell += '<div class="st-sync bad">未同步</div>';

      html += '<tr' + (state.hr.sel[r.formNo] ? ' class="is-sel"' : '') + '>'
        + '<td class="ta-c ck-col"><input type="checkbox" class="rowck" data-fno="' + esc(r.formNo) + '"'
        + (state.hr.sel[r.formNo] ? ' checked' : '') + ' aria-label="选中 ' + esc(r.values.realName) + '"></td>'
        + '<td><b>' + esc(r.values.realName) + '</b></td>'
        + '<td class="col-status">' + stCell + '</td>'
        + '<td class="col-gender">' + esc(r.values.gender) + '</td>'
        + '<td class="mono-cell">' + esc(String(r.values.phone || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')) + '</td>'
        + '<td class="col-edu">' + esc(r.values.highestEducation) + '</td>'
        + '<td class="marks col-marks">' + marks + '</td>'
        + '<td class="mono-cell col-no">' + esc(r.formNo) + '</td>'
        + '<td class="muted col-time">' + esc(fmtTime(r.submittedAt)) + '</td>'
        + '<td class="ta-r nowrap"><button class="link-btn" data-act="view" data-fno="' + esc(r.formNo) + '">查看</button>'
        + '<button class="link-btn" data-act="pkg" data-fno="' + esc(r.formNo) + '">打包</button>'
        + '<button class="link-btn" data-act="dl" data-fno="' + esc(r.formNo) + '">花名册</button>'
        + '<button class="link-btn" data-act="reg" data-fno="' + esc(r.formNo) + '">登记表</button></td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<p class="hint">点「状态」可以标待核对 / 已入职 / 已驳回，还能写一条备注。'
      + '勾几个人再点「导出选中」，每人一个文件夹：Word、身份证正反面照片；'
      + '外面再放一份融合版花名册，可以直接导入摩卡。'
      + '底下那两个按钮不看勾选，永远导全部（一个都不勾也照导）。'
      + '<span class="only-wide">「照」＝人像面，「反」＝国徽面。</span></p>';

    // 重复提交预检：记录一多就有必要，但人少时算这个没意义（O(n²) 比较）
    var dupN = 0;
    if (all.length >= 2 && all.length <= 800) {
      findDupGroups().forEach(function (g) { dupN += g.length - 1; });
    }
    html += '<div class="hr-foot">'
      + '<button class="link-btn" data-act="track">导出处理台账（全部 ' + all.length + ' 人）</button>'
      + '<button class="link-btn" data-act="allxlsx">只导融合版花名册（全部 ' + all.length + ' 人）</button>'
      + (dupN ? '<button class="link-btn danger" data-act="dup">清理重复提交（' + dupN + ' 条）</button>' : '')
      + (online ? '' : '<button class="link-btn danger" data-act="clear">清空演示数据</button>')
      + '</div>';

    box.innerHTML = html;
    refreshSelUi();
  }

  /** 筛选按钮上的数字要跟着状态变化实时更新 */
  function updateFilterCounts() {
    var c = statusCounts();
    $$('#viewHr .fbtn').forEach(function (b) {
      var n = $('b', b);
      if (n) n.textContent = c[b.dataset.f] != null ? c[b.dataset.f] : 0;
    });
  }

  /** 只改按钮和全选框，不整页重绘，免得列表滚回顶部 */
  function refreshSelUi() {
    updateFilterCounts();
    var n = Object.keys(state.hr.sel).length;
    var btn = $('#viewHr [data-act="sel"]');
    if (btn) {
      btn.textContent = '导出选中（' + n + ' 人）';
      btn.disabled = !n;
      btn.classList.toggle('primary', n > 0);
      btn.classList.toggle('ghost', n === 0);
    }
    var all = $('#ckAll');
    if (all) {
      var boxes = $$('#viewHr .rowck');
      var checked = boxes.filter(function (b) { return b.checked; }).length;
      all.checked = boxes.length > 0 && checked === boxes.length;
      all.indeterminate = checked > 0 && checked < boxes.length;
    }
  }

  function bindHr() {
    var view = $('#viewHr');
    if (!view) return;

    // 搜索：只重画表格，输入框本身不重建，所以焦点和光标都在
    view.addEventListener('input', function (e) {
      if (e.target.id !== 'hrSearch') return;
      state.hr.q = e.target.value;
      renderHrTable();
    });

    view.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'ckAll') {
        var on = t.checked;
        // 只全选"当前看得到的这几个人"：筛选之后按全选，就该是筛出来的这些人
        $$('#viewHr .rowck').forEach(function (b) {
          b.checked = on;
          if (on) state.hr.sel[b.dataset.fno] = true;
          else delete state.hr.sel[b.dataset.fno];
        });
        $$('#viewHr tbody tr').forEach(function (tr) { tr.classList.toggle('is-sel', on); });
        refreshSelUi();
        return;
      }
      if (t.classList.contains('rowck')) {
        var fno = t.dataset.fno;
        if (t.checked) state.hr.sel[fno] = true;
        else delete state.hr.sel[fno];
        var tr = t.closest('tr');
        if (tr) tr.classList.toggle('is-sel', t.checked);
        refreshSelUi();
      }
    });

    view.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;

      if (act === 'allxlsx') { downloadAll(); return; }
      if (act === 'track') { downloadTrack(); return; }
      if (act === 'dup') { openDupSheet(); return; }
      if (act === 'logout') { logoutHr(); return; }
      if (act === 'go') { switchView('form'); return; }
      if (act === 'qr') { showQr(); return; }
      if (act === 'guide') { openGuideSheet(); return; }
      if (act === 'sys') { openSysPanel(); return; }

      if (act === 'filter') {
        state.hr.filter = btn.dataset.f || 'all';
        $$('#viewHr .fbtn').forEach(function (b) {
          b.classList.toggle('is-on', b.dataset.f === state.hr.filter);
        });
        renderHrTable();
        return;
      }

      if (act === 'meta') {
        var r0 = findRec(btn.dataset.fno);
        if (r0) openMetaSheet(r0);
        return;
      }

      if (act === 'sel') {
        var picked = hrAll().filter(function (r) { return state.hr.sel[r.formNo]; });
        if (!picked.length) { toast('先勾几个人', 'bad'); return; }
        downloadPackage(picked);
        return;
      }
      if (act === 'clear') {
        if (!confirm('清空所有演示记录？')) return;
        saveRecords([]);
        state.hr.sel = {};
        renderHr();
        return;
      }

      var rec = findRec(btn.dataset.fno);
      if (!rec) return;
      if (act === 'dl') downloadRecord(rec);
      if (act === 'reg') downloadRegister(rec);
      if (act === 'pkg') downloadPackage([rec]);
      if (act === 'view') { state.currentRecord = rec; state.resultAs = 'hr'; switchView('result'); }
    });
  }

  /* ================= 启动 ================= */

  function boot() {
    initState();
    loadHrSession();
    var restored = loadDraft();
    bind();
    render();
    // 默认停在首页（先分员工 / HR）。员工扫码带 #form 的会立刻跳过去。
    switchView('home');

    // 演示用锚点（方便直接跳状态给同事看）：
    //   #form           直接从首页跳进填表（员工扫码链接就带这个）
    //   #demo           自动填一份示例
    //   #demo-step3     填示例并直接跳到第 3 步
    //   #hr             进 HR 后台（未登录会先停在登录页）
    //   #seed           造 3 条记录后再进 HR 后台
    //   #export         直接看导出文件长什么样
    //   #login          直接看 HR 登录页
    var hash = (location.hash || '').replace('#', '');

    // 这两个会往列表里塞假数据，线上环境不能执行，
    // 否则 HR 的花名册里会混进"张明远"这种演示记录。
    var makeFakeData = hash === 'seed' || hash === 'export';

    function runHash() {
      if (hash === 'form') {
        enterForm();
        if (restored) toast('已恢复上次未提交的草稿');
      } else if (hash.indexOf('demo') === 0) {
        switchView('form');
        applyDemo();
        var m = hash.match(/step(\d+)/);
        if (m) state.step = Math.min(Math.max(Number(m[1]) - 1, 0), LAST);
        render();
      } else if (hash === 'seed' || hash === 'hr') {
        if (hash === 'seed') { seedRecords(); toast('已造 3 条演示记录，登录后查看', 'ok'); }
        switchView('hr');
      } else if (hash === 'login') {
        switchView('login');
      } else if (hash === 'export') {
        seedRecords();
        var list = loadRecords();
        state.currentRecord = list[list.length - 1];
        state.hr.authed = true;          // 直接看导出页时不卡登录
        state.resultAs = 'hr';           // #export 是看导出物的，走 HR 那版
        switchView('result');
      } else if (restored) {
        // 停在首页：首页那张「我是员工」的卡会写"有一份未提交的草稿，停在第 N 步"，
        // 比弹一个 toast 更安静，也不会在 HR 打开首页时冒出来。
        renderHome();
      }
    }

    // 探一下有没有服务器：部署在服务器上就走后端，双击 html 打开就退回本机存储
    if (window.Api) {
      window.Api.ping().then(function (online) {
        if (online) {
          if (!state.hr.authed && window.Api.hasToken()) {
            state.hr.authed = true;
            state.hr.empNo = window.Api.state.empNo || 'HR';
            saveHrSession();
            if (state.view === 'login') switchView('hr');
          }
          if (state.hr.authed && state.view === 'hr') syncRemote();
          // guide 是异步从服务器拉到的；如果这时已经停在结果页（比如带 #export 直接打开），
          // 补渲染一次，把「提交之后去哪儿」这块画出来
          if (state.view === 'result') renderResult();
        }

        // 造数据的那两个锚点，只在没连服务器（演示 / 本地双击）时才认
        if (makeFakeData) {
          if (online) { switchView('form'); return; }
          runHash();
          return;
        }
        runHash();
      });
    } else {
      runHash();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
