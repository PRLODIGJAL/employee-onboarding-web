#!/bin/bash
# ============================================================
#  员工信息登记 · 一键启动（macOS）
#  双击本文件 → 起服务 → 自动打开浏览器
#  关掉这个终端窗口 = 停止服务
# ============================================================

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
PORT="${PORT:-8080}"
URL="http://127.0.0.1:${PORT}/"

echo ""
echo "  员工信息登记 · 正在启动"
echo "  ─────────────────────────────────────"

# 已经在跑就直接开浏览器，不重复启动
if curl --noproxy '*' -s -m 1 "http://127.0.0.1:${PORT}/api/ping" >/dev/null 2>&1; then
  echo "  服务已经在运行，直接打开浏览器"
  echo "  地址：$URL"
  echo "  ─────────────────────────────────────"
  open "$URL"
  sleep 1
  exit 0
fi

# 找 node：先看 PATH，再看常见安装位置
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  for p in /usr/local/bin/node /opt/homebrew/bin/node "$HOME"/.workbuddy/binaries/node/versions/*/bin/node; do
    if [ -x "$p" ]; then NODE_BIN="$p"; break; fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo ""
  echo "  这台电脑没找到 Node.js"
  echo "  去 https://nodejs.org/ 下载 LTS 版，一路点下一步装完，再双击本文件"
  echo ""
  read -n 1 -s -r -p "  按任意键关闭…"
  exit 1
fi

if [ ! -f "$ROOT/服务器/server.js" ]; then
  echo "  找不到 服务器/server.js —— 请把整个文件夹一起拷贝，不要只拷一部分"
  read -n 1 -s -r -p "  按任意键关闭…"
  exit 1
fi

echo "  网页目录：$ROOT/网页"
echo "  数据目录：$ROOT/服务器/data"
echo "  ─────────────────────────────────────"

# 等服务起来再开浏览器
( sleep 1.5; open "$URL" ) &

cd "$ROOT/服务器" || exit 1
"$NODE_BIN" server.js

echo ""
read -n 1 -s -r -p "  服务已停止，按任意键关闭…"
