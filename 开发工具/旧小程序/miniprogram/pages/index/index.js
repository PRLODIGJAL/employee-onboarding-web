const schema = require('../../config/form-schema');

Page({
  data: {
    title: schema.title,
    version: schema.version,
    stepCount: schema.steps.length,
    fieldCount: 0,
    requiredCount: 0
  },

  onLoad() {
    let total = 0;
    let required = 0;
    schema.steps.forEach(step => {
      step.fields.forEach(f => {
        total++;
        if (f.required) required++;
      });
    });
    this.setData({ fieldCount: total, requiredCount: required });
  },

  goForm() {
    wx.navigateTo({ url: '/pages/form/form' });
  },

  // 管理入口：非管理员进去会显示"没有权限"，不暴露数据
  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/list' });
  },

  goPrivacy() {
    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({ title: '尚未配置隐私保护指引', icon: 'none' });
      }
    });
  }
});
