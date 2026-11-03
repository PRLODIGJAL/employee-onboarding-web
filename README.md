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
  部署与运维.md       部署文档
```

## 说明

- 身份证号 + 照片属敏感个人信息，运行前需自行配置 `服务器/data/` 目录（本仓库不含真实数据）
- `服务器/data/` 下的 `records/`（登记记录）、`photos/`（身份证照）、`secret.txt`（密钥）均不提交
- OCR 识别使用 Tesseract（可选，需另装），不上传照片到外部接口
