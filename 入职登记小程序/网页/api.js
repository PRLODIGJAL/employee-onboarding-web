/**
 * 前端和服务端之间的那一层
 *
 * 设计原则：有服务器就用，没服务器照样能用。
 *   - 用 http(s) 打开（部署在服务器上）→ 提交的数据存到服务器，HR 能拉到别人的
 *   - 直接双击 html 打开（file://）→ 自动退回浏览器本地存储，只适合自己演示
 *
 * 所以下面的函数失败时都只是"没连上"，不抛异常，页面逻辑不用 try/catch 包一层又一层。
 */
(function (root) {
  'use strict';

  var state = {
    online: false,      // 服务器是否可用
    checked: false,     // 是否已经探测过
    token: '',          // HR 登录后的 token
    empNo: '',
    lastError: '',
    origin: '',         // 服务器认为的"对外地址"，生成二维码用
    requireCode: false, // 服务端是否要求填写口令
    guide: null         // 提交之后给员工看的「下一站」内容（HR 在后台改）
  };

  var T_KEY = 'onboard_hr_token_v1';

  function loadToken() {
    try {
      var raw = sessionStorage.getItem(T_KEY) || localStorage.getItem(T_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.token && o.exp > Date.now()) { state.token = o.token; state.empNo = o.empNo || ''; }
      }
    } catch (e) { /* 无痕模式忽略 */ }
  }

  function saveToken(token, empNo, hours) {
    state.token = token || '';
    state.empNo = empNo || '';
    try {
      var o = JSON.stringify({ token: token, empNo: empNo, exp: Date.now() + (hours || 8) * 3600 * 1000 });
      sessionStorage.setItem(T_KEY, o);
      localStorage.setItem(T_KEY, o);
    } catch (e) { /* 忽略 */ }
  }

  function clearToken() {
    state.token = '';
    state.empNo = '';
    try {
      sessionStorage.removeItem(T_KEY);
      localStorage.removeItem(T_KEY);
    } catch (e) { /* 忽略 */ }
  }

  function req(method, url, body, timeoutMs) {
    // 老浏览器 / 某些 App 内置浏览器没有 fetch，当作离线处理，不让整个页面崩掉
    if (typeof fetch !== 'function') {
      state.lastError = '这个浏览器不支持 fetch';
      return Promise.resolve({ ok: false, offline: true, message: state.lastError });
    }

    var opt = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    };
    if (state.token) opt.headers['x-token'] = state.token;
    if (body) opt.body = JSON.stringify(body);

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (ctrl) {
      opt.signal = ctrl.signal;
      setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000);
    }

    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return { ok: false, message: 'HTTP ' + r.status }; });
    }).catch(function (e) {
      state.lastError = e && e.name === 'AbortError' ? '请求超时' : '连不上服务器';
      return { ok: false, offline: true, message: state.lastError };
    });
  }

  /** 探测服务器在不在。双击 html 打开时这里会失败，属于正常情况。 */
  function ping() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      state.online = false; state.checked = true;
      return Promise.resolve(false);
    }
    if (typeof fetch !== 'function') {
      state.online = false; state.checked = true;
      return Promise.resolve(false);
    }
    return req('GET', '/api/ping', null, 4000).then(function (r) {
      state.online = !!(r && r.ok);
      state.checked = true;
      if (!state.online) return false;
      // 顺手问一下对外地址和要不要口令，HR 生成二维码时要用
      return config().then(function () { return true; });
    });
  }

  function config() {
    return req('GET', '/api/config', null, 6000).then(function (r) {
      if (r && r.ok) {
        state.origin = String(r.origin || '').replace(/\/+$/, '');
        state.requireCode = !!r.requireCode;
        if (r.guide) state.guide = r.guide;
      }
      return r;
    });
  }

  /** 保存「提交之后去哪儿」——只有 HR 能改 */
  function saveGuide(g) {
    return req('POST', '/api/hr/guide', g, 15000).then(function (r) {
      if (r && r.ok && r.guide) state.guide = r.guide;
      return r;
    });
  }

  function login(empNo, password) {
    return req('POST', '/api/login', { empNo: empNo, password: password }, 12000)
      .then(function (r) {
        if (r && r.ok && r.token) saveToken(r.token, r.empNo, r.hours);
        return r;
      });
  }

  function submit(rec) {
    return req('POST', '/api/submit', {
      formNo: rec.formNo,
      submittedAt: rec.submittedAt,
      values: rec.values,
      tables: rec.tables,
      idPhotos: rec.idPhotos || {},
      code: rec.code || ''
    }, 60000);
  }

  function records() {
    return req('GET', '/api/records', null, 20000);
  }

  function record(id) {
    return req('GET', '/api/record/' + encodeURIComponent(id), null, 60000);
  }

  function remove(id) {
    return req('DELETE', '/api/record/' + encodeURIComponent(id), null, 12000);
  }

  /** 改一条记录的处理状态 / 备注（只有 HR 能改） */
  function setMeta(formNo, meta) {
    return req('POST', '/api/record/' + encodeURIComponent(formNo) + '/meta', {
      status: meta.status,
      remark: meta.remark
    }, 15000);
  }

  /** 身份证识别：把照片交给服务器上的 Tesseract 认字。
   *
   *  为什么不在浏览器里自己认：网页那套模板匹配拿 canvas 画的字当模板，
   *  跟证件上的专用字体对不上，糊一点就废。Tesseract 有真分类器，稳得多。
   *
   *  超时给得比较宽（30s）：第一次调用 tesseract 要加载模型，会慢一些；
   *  连不上时 req 会返回 { offline:true }，调用方据此退回本机识别。 */
  function ocr(image) {
    return req('POST', '/api/ocr', { image: image }, 30000);
  }

  /** OCR 引擎可用性（服务器有没有装 Tesseract、有没有中文包） */
  function ocrStatus() {
    return req('GET', '/api/ocr/status', null, 8000);
  }

  /** 系统状态：运行时长、磁盘、错误、备份 —— HR 后台顶栏那条用 */
  function stats() {
    return req('GET', '/api/admin/stats', null, 12000);
  }

  /** 改 HR 密码（不用登服务器） */
  function changePassword(oldPw, nextPw) {
    return req('POST', '/api/hr/password', { old: oldPw, next: nextPw }, 15000);
  }

  loadToken();

  root.Api = {
    state: state,
    ping: ping,
    login: login,
    submit: submit,
    records: records,
    record: record,
    remove: remove,
    setMeta: setMeta,
    stats: stats,
    ocr: ocr,
    ocrStatus: ocrStatus,
    changePassword: changePassword,
    saveGuide: saveGuide,
    clearToken: clearToken,
    hasToken: function () { return !!state.token; }
  };
})(window);
