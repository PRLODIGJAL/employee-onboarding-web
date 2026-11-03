const schema = require('../../config/form-schema');
const { validateField, validateTable, isEmpty } = require('../../utils/validators');
const { checkIdCard } = require('../../utils/idcard');

const STEP_COUNT = schema.steps.length;

function emptyRow(block) {
  const row = {};
  block.columns.forEach(c => { row[c.key] = ''; });
  return row;
}

Page({
  data: {
    schema,
    steps: schema.steps.map((s, i) => ({ key: s.key, title: s.title, index: i })),
    stepCount: STEP_COUNT,
    current: 0,
    currentStep: schema.steps[0],
    renderFields: schema.steps[0].fields,
    tableRows: {},
    values: {},
    errors: {},
    tableErrors: {},
    totalRequired: 0,
    filledRequired: 0,
    percent: 0,
    autoHint: '',
    submitting: false,
    isLast: false
  },

  onLoad() {
    const values = {};
    let required = 0;

    schema.steps.forEach(step => {
      step.fields.forEach(f => {
        values[f.key] = f.type === 'region' ? [] : (f.type === 'agree' ? false : '');
        if (f.type === 'yn' && f.allowNote) values[f.key + 'Note'] = '';
        if (f.required) required++;
      });
    });

    const tableRows = {};
    schema.steps.forEach(step => {
      (step.tables || []).forEach(b => {
        tableRows[b.key] = Array.from({ length: b.rows || 3 }, () => emptyRow(b));
      });
    });

    this._values = values;
    this._strict = false;
    this._buildFieldMap();

    this.setData({ values, tableRows, totalRequired: required, isLast: STEP_COUNT === 1 });
    this._renderStep(0);
    this._refreshProgress();
  },

  /* ---------------- 步骤切换 ---------------- */

  _renderStep(index) {
    const step = schema.steps[index];
    const visible = (step.fields || []).filter(f => this._visible(f));
    this.setData({
      current: index,
      currentStep: step,
      renderFields: visible,
      isLast: index === STEP_COUNT - 1
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  _visible(field) {
    if (!field.showWhen) return true;
    return this._values[field.showWhen.key] === field.showWhen.value;
  },

  onStepTap(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (idx === this.data.current) return;
    if (idx < this.data.current) {
      this._renderStep(idx);
      return;
    }
    // 往后跳要先过当前这一步
    if (this._validateStep(this.data.current)) this._renderStep(idx);
  },

  onNext() {
    if (!this._validateStep(this.data.current)) return;
    const next = this.data.current + 1;
    if (next < STEP_COUNT) this._renderStep(next);
  },

  onPrev() {
    const prev = this.data.current - 1;
    if (prev >= 0) this._renderStep(prev);
  },

  /* ---------------- 输入 ---------------- */

  onFieldChange(e) {
    const { key, value } = e.detail;
    const patch = {};
    this._values[key] = value;
    patch['values.' + key] = value;
    if (this.data.errors[key]) patch['errors.' + key] = '';
    this.setData(patch);

    if (key === 'idcard') this._onIdCardChanged(value);
    if (key === 'channel') this._renderStep(this.data.current);

    this._refreshProgress();
  },

  onFieldBlur(e) {
    this._validateOne(e.detail.key);
  },

  onTableChange(e) {
    const { key, rows } = e.detail;
    this.setData({ ['tableRows.' + key]: rows });
    this._refreshProgress();
  },

  closeHint() {
    this.setData({ autoHint: '' });
  },

  /* ---------------- 校验 ---------------- */

  _validateOne(key) {
    const field = this._fieldMap ? this._fieldMap[key] : null;
    if (!field) return true;
    if (!this._visible(field)) return true;
    const err = validateField(field, this._values[key], this._values);
    this.setData({ ['errors.' + key]: err });
    return !err;
  },

  _buildFieldMap() {
    if (this._fieldMap) return;
    this._fieldMap = {};
    schema.steps.forEach(s => s.fields.forEach(f => { this._fieldMap[f.key] = f; }));
  },

  /** 校验某一步，返回是否通过 */
  _validateStep(index) {
    this._buildFieldMap();
    const step = schema.steps[index];
    const errors = {};
    let firstKey = '';

    (step.fields || []).forEach(f => {
      if (!this._visible(f)) return;
      const err = validateField(f, this._values[f.key], this._values);
      errors[f.key] = err;
      if (err && !firstKey) firstKey = f.key;
    });

    let tableErrors = {};
    let tableFail = 0;
    (step.tables || []).forEach(b => {
      const r = validateTable(b, this.data.tableRows[b.key]);
      tableErrors = Object.assign(tableErrors, r.errors);
      tableFail += r.count;
    });

    this.setData({ errors, tableErrors });

    if (firstKey) {
      wx.showToast({ title: '还有必填项没填', icon: 'none' });
      wx.pageScrollTo({ selector: '#f-' + firstKey, duration: 300, offsetTop: -100 });
      return false;
    }
    if (tableFail) {
      wx.showToast({ title: '经历没填完整', icon: 'none' });
      return false;
    }
    return true;
  },

  /* ---------------- 身份证联动 ---------------- */

  _onIdCardChanged(raw) {
    const r = checkIdCard(raw);
    if (!r.valid) return;
    const d = r.data;
    const patch = {};
    const filled = [];

    if (!this._values.birthday) {
      this._values.birthday = d.birthday;
      patch['values.birthday'] = d.birthday;
      filled.push('出生日期 ' + d.birthday);
    }
    if (!this._values.gender) {
      this._values.gender = d.gender;
      patch['values.gender'] = d.gender;
      filled.push('性别 ' + d.gender);
    }

    const parts = ['性别 ' + d.gender, '出生日期 ' + d.birthday];
    if (d.province) parts.push('籍贯 ' + d.province);
    patch.autoHint = '身份证号识别结果：' + parts.join('、') +
      (d.province ? '。籍贯请选到市/县，不要只填城市名。' : '');

    if (filled.length) {
      wx.showToast({ title: '已自动填充 ' + filled.length + ' 项', icon: 'none', duration: 1200 });
    }

    this.setData(patch);
    this._refreshProgress();
  },

  _refreshProgress() {
    const total = this.data.totalRequired || 1;
    let filled = 0;

    schema.steps.forEach(step => {
      (step.fields || []).forEach(f => {
        if (!f.required) return;
        if (!this._visible(f)) return;
        if (!isEmpty(this._values[f.key])) filled++;
      });
    });

    this.setData({
      filledRequired: filled,
      percent: Math.min(100, Math.round((filled / total) * 100))
    });
  },

  /* ---------------- 提交 ---------------- */

  async onSubmit() {
    if (this.data.submitting) return;

    // 全部步骤过一遍，不通过就跳回那一步
    let failStep = -1;
    for (let i = 0; i < STEP_COUNT; i++) {
      this._renderStep(i);
      if (!this._validateStep(i)) { failStep = i; break; }
    }
    if (failStep > -1) {
      this._renderStep(failStep);
      return;
    }

    this._renderStep(STEP_COUNT - 1);
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    try {
      const payload = Object.assign({}, this._values, this.data.tableRows);
      const res = await wx.cloud.callFunction({
        name: 'formApi',
        data: { action: 'submit', payload }
      });

      wx.hideLoading();
      const result = (res && res.result) || {};
      if (!result.ok) throw new Error(result.message || '提交失败');

      this.setData({ submitting: false });
      wx.showModal({
        title: '提交成功',
        content: '登记编号 ' + result.formNo + '，请截图保存。HR 会核对后归档。',
        showCancel: false,
        confirmText: '好的',
        success: () => wx.navigateBack()
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      console.error('[submit] 失败', err);
      wx.showModal({
        title: '提交失败',
        content: (err && err.message) || '网络异常，请稍后重试',
        showCancel: false
      });
    }
  }
});
