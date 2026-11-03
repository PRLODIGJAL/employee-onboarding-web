const { buildBlocks, buildRoster, buildRosterRow } = require('../../utils/exporter');

Page({
  data: {
    list: [],
    loading: false,
    page: 1,
    size: 20,
    total: 0,
    hasMore: true,
    forbidden: false,
    exportingId: ''
  },

  onLoad() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(false);
  },

  async load(reset) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const page = reset ? 1 : this.data.page;

    try {
      const res = await wx.cloud.callFunction({
        name: 'formApi',
        data: { action: 'list', page, size: this.data.size }
      });
      const r = (res && res.result) || {};

      if (!r.ok) {
        this.setData({ loading: false, forbidden: r.code === 'FORBIDDEN' });
        wx.showToast({ title: r.message || '加载失败', icon: 'none' });
        return;
      }

      this.setData({
        list: reset ? r.list : this.data.list.concat(r.list),
        total: r.total,
        page: page + 1,
        hasMore: r.list.length >= this.data.size,
        loading: false
      });
    } catch (err) {
      console.error('[admin] 列表加载失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async onExport(e) {
    const { id, name } = e.currentTarget.dataset;
    if (this.data.exportingId) return;

    this.setData({ exportingId: id });
    wx.showLoading({ title: '正在生成', mask: true });

    try {
      // 1. 取这一条的完整数据
      const detailRes = await wx.cloud.callFunction({
        name: 'formApi',
        data: { action: 'detail', id }
      });
      const d = (detailRes && detailRes.result) || {};
      if (!d.ok) throw new Error(d.message || '读取数据失败');

      const record = d.data;
      const payload = record.payload || {};

      // 2. 生成三个数据块
      const blocks = buildBlocks(payload);
      const roster = buildRoster(payload);
      // 花名册那一行：长度固定 119，按模板列顺序，云函数直接写进模板第 6 行
      const rows = [buildRosterRow(payload)];

      // 3. 云端生成 Excel（一人两个文件：花名册导入 + 打印登记表）
      const exportRes = await wx.cloud.callFunction({
        name: 'exportExcel',
        data: {
          meta: { formNo: record.formNo, realName: payload.realName, createdAt: record.createdAt },
          rows,
          blocks,
          roster
        }
      });
      const r = (exportRes && exportRes.result) || {};
      if (!r.ok) throw new Error(r.message || '导出失败');

      wx.hideLoading();

      // 4. 一次生成两个文件，先让 HR 选要打开哪个
      const files = (r.files && r.files.length) ? r.files : [{ kind: 'roster', tempFileURL: r.tempFileURL }];

      const open = async (f) => {
        const dl = await wx.downloadFile({ url: f.tempFileURL });
        if (dl.statusCode !== 200) throw new Error('文件下载失败');
        await wx.openDocument({ filePath: dl.tempFilePath, fileType: 'xlsx', showMenu: true });
      };

      let pick = files[0];
      if (files.length > 1) {
        const idx = await new Promise(resolve => {
          wx.showActionSheet({
            itemList: files.map(f => (f.kind === 'register'
              ? '员工信息登记表（打印归档用）'
              : '花名册导入（导入摩卡用）')),
            success: res => resolve(res.tapIndex),
            fail: () => resolve(0)
          });
        });
        pick = files[idx] || files[0];
      }
      await open(pick);

      wx.showModal({
        title: '已生成',
        content: `${name || ''} 生成了 2 个文件：\n`
          + '1. 花名册导入 —— 导入摩卡用，导入前记得补工号；\n'
          + '2. 员工信息登记表 —— 打印归档用。\n\n'
          + '两个文件都只含这一名员工，请勿发到群里。',
        showCancel: false
      });
    } catch (err) {
      wx.hideLoading();
      console.error('[admin] 导出失败', err);
      wx.showModal({
        title: '导出失败',
        content: (err && err.message) || '请稍后重试',
        showCancel: false
      });
    } finally {
      this.setData({ exportingId: '' });
    }
  }
});
