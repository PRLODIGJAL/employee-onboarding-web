App({
  globalData: {
    // 管理员 openid 白名单：真实环境请改到数据库 admins 集合里维护
    adminOpenids: [],
    envId: '' // 云开发环境 ID，留空则使用默认环境
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('[app] 当前基础库不支持云开发，请把调试基础库调到 2.2.3 以上');
      return;
    }

    try {
      wx.cloud.init({
        env: this.globalData.envId || undefined,
        traceUser: true
      });
    } catch (err) {
      console.error('[app] 云开发初始化失败，请确认已开通云开发且 AppID 配置正确', err);
    }
  }
});
