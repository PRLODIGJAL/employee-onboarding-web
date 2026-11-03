/**
 * table-block —— 多段经历填写（教育经历 / 工作经历）
 *
 * 手机上放不下 6 列表格，所以每一段渲染成一张卡片，字段竖排。
 * properties: block 表格定义 / rows 数据 / errors 形如 "educations.0.school"
 * events: change -> { key, rows }
 */
Component({
  options: { addGlobalClass: true },

  properties: {
    block: { type: Object, value: {} },
    rows: { type: Array, value: [] },
    errors: { type: Object, value: {} },
    maxRows: { type: Number, value: 5 }
  },

  data: {
    today: ''
  },

  lifetimes: {
    attached() {
      const n = new Date();
      const p = v => (v < 10 ? '0' + v : '' + v);
      this.setData({ today: `${n.getFullYear()}-${p(n.getMonth() + 1)}` });
    }
  },

  methods: {
    _emit(rows) {
      this.triggerEvent('change', { key: this.data.block.key, rows });
    },

    onCellInput(e) {
      const { idx, col } = e.currentTarget.dataset;
      const rows = this.data.rows.slice();
      rows[idx] = Object.assign({}, rows[idx], { [col]: e.detail.value });
      this._emit(rows);
    },

    onCellMonth(e) {
      const { idx, col } = e.currentTarget.dataset;
      const rows = this.data.rows.slice();
      rows[idx] = Object.assign({}, rows[idx], { [col]: e.detail.value });
      this._emit(rows);
    },

    onCellSelect(e) {
      const { idx, col } = e.currentTarget.dataset;
      const opt = (this.data.block.columns.find(c => c.key === col).options || [])[Number(e.detail.value)];
      const rows = this.data.rows.slice();
      rows[idx] = Object.assign({}, rows[idx], { [col]: opt === undefined ? '' : String(opt) });
      this._emit(rows);
    },

    onAdd() {
      if (this.data.rows.length >= this.data.maxRows) {
        wx.showToast({ title: `最多 ${this.data.maxRows} 段`, icon: 'none' });
        return;
      }
      const empty = {};
      this.data.block.columns.forEach(c => { empty[c.key] = ''; });
      this._emit(this.data.rows.concat([empty]));
    },

    onRemove(e) {
      const idx = Number(e.currentTarget.dataset.idx);
      if (idx < (this.data.block.requiredRows || 1)) return;
      const rows = this.data.rows.filter((_, i) => i !== idx);
      this._emit(rows);
    }
  }
});
