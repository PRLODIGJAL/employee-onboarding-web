# 项目5 · 员工入职登记网页

员工入职登记网页系统，支持身份证 OCR 识别、照片采集、签名、自动生成登记表文档。Web 前端 + Node.js 后端。

## 目录结构

```
入职登记小程序/
  网页/              前端（HTML/CSS/JS）
    index.html       主页面
    app.js           主逻辑
    api.js           API 通信
    ocr-lite.js      OCR 识别
    pdf-lite.js      PDF 生成
    ...              其他模块
  服务器/            后端（Node.js）
    server.js        主服务
    ocr.js           OCR 服务
    backup.js        备份服务
  开发工具/          开发脚本、测试用例、构建工具
  ① 双击启动网页版（Mac）.command
  ① 双击启动网页版（Windows）.bat
  部署与运维.md       部署文档
使用说明书.txt        使用文档
```

## 怎么跑

双击启动器即可：
- macOS：`① 双击启动网页版（Mac）.command`
- Windows：`① 双击启动网页版（Windows）.bat`

## 说明

- **本仓库只含源代码**，不含运行数据（员工记录、证件照、日志等）
- 运行需 Node.js 环境
- 部署文档见 `部署与运维.md`
