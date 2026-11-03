const INPUT_TYPES = ['number'];
const PICKER_TYPES = ['select', 'region', 'date', 'month'];

Component({
  options: { addGlobalClass: true },

  properties: {
    field: { type: Object, value: {} },
    value: { type: null, value: '' },
    noteValue: { type: String, value: '' },   // yn 题的补充说明
    error: { type: String, value: '' },
    disabled: { type: Boolean, value: false }
  },

  data: {
    kind: 'text',
    inputType: 'text',
    display: '',
    selectIndex: 0,
    regionValue: ['', '', ''],
    dateValue: '1995-01-01',
    monthValue: '2020-06',
    today: '',
    uploading: false
  },

  lifetimes: {
    attached() {
      const n = new Date();
      const p = v => (v < 10 ? '0' + v : '' + v);
      this.setData({ today: `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}` });
    }
  },

  observers: {
    'field, value'(field, value) {
      if (!field || !field.type) return;
      const type = field.type;
      const kind = type === 'textarea' || type === 'select' || type === 'radio'
        || type === 'region' || type === 'date' || type === 'month'
        || type === 'yn' || type === 'agree' || type === 'image'
        ? type
        : 'text';

      const patch = { kind };

      if (kind === 'text') {
        patch.inputType = type === 'idcard' ? 'idcard'
          : type === 'number' ? 'digit'
            : (type === 'phone' || type === 'bankcard') ? 'number' : 'text';
        if (type === 'image') patch.inputType = 'text';
      }

      let display = '';
      if (kind === 'region') {
        display = Array.isArray(value) ? value.filter(Boolean).join(' / ') : '';
      } else if (value !== '' && value !== null && value !== undefined && typeof value !== 'boolean') {
        display = String(value);
      }
      patch.display = display;

      if (kind === 'select') {
        const opts = (field.options || []).map(String);
        const idx = opts.indexOf(String(value));
        patch.selectIndex = idx > -1 ? idx : 0;
      }
      if (kind === 'region') {
        patch.regionValue = (Array.isArray(value) && value.length === 3) ? value : ['', '', ''];
      }
      if (kind === 'date') patch.dateValue = value ? String(value) : '1995-01-01';
      if (kind === 'month') patch.monthValue = value ? String(value) : '2020-06';

      this.setData(patch);
    }
  },

  methods: {
    _emit(value) {
      this.triggerEvent('change', { key: this.data.field.key, value });
    },

    onInput(e) { this._emit(e.detail.value); },
    onBlur() { this.triggerEvent('blur', { key: this.data.field.key }); },

    onSelect(e) {
      const idx = Number(e.detail.value);
      const opt = (this.data.field.options || [])[idx];
      this._emit(opt === undefined ? '' : String(opt));
    },
    onRegion(e) { this._emit(e.detail.value || []); },
    onDate(e) { this._emit(e.detail.value); },
    onMonth(e) { this._emit(e.detail.value); },

    onRadio(e) {
      const val = e.currentTarget.dataset.val;
      this._emit(val === this.data.value ? '' : val);
    },

    // 是/否 题：选了"是"才展开补充说明
    onYn(e) {
      const val = e.currentTarget.dataset.val;
      const next = val === this.data.value ? '' : val;
      this._emit(next);
      if (next !== '是') {
        this.triggerEvent('change', { key: this.data.field.key + 'Note', value: '' });
      }
    },

    onNote(e) {
      this.triggerEvent('change', { key: this.data.field.key + 'Note', value: e.detail.value });
    },

    onAgree() {
      this._emit(!this.data.value);
    },

    // 照片：选图后直传云存储，表单里只存 fileID
    async onChooseImage() {
      if (this.data.uploading) return;
      try {
        const media = await wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera']
        });
        const file = media.tempFiles && media.tempFiles[0];
        if (!file) return;

        this.setData({ uploading: true });
        wx.showLoading({ title: '上传中', mask: true });

        const ext = (file.tempFilePath.match(/\.(\w+)$/) || [, 'jpg'])[1];
        const cloudPath = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const res = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath });

        wx.hideLoading();
        this.setData({ uploading: false });
        this._emit(res.fileID);
      } catch (err) {
        wx.hideLoading();
        this.setData({ uploading: false });
        console.error('[photo] 上传失败', err);
        wx.showToast({ title: '照片上传失败，可先跳过', icon: 'none' });
      }
    },

    onRemoveImage() { this._emit(''); }
  }
});
