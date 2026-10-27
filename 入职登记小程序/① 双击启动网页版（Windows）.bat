@echo off
chcp 65001 >nul
title 员工信息登记 · 本地服务
cd /d "%~dp0"

echo.
echo   员工信息登记 · 正在启动
echo   -------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   这台电脑没找到 Node.js
  echo   去 https://nodejs.org/ 下载 LTS 版，一路点下一步装完，再双击本文件
  echo.
  pause
  exit /b
)

if not exist "服务器\server.js" (
  echo   找不到 服务器\server.js —— 请把整个文件夹一起拷贝
  pause
  exit /b
)

start "" http://127.0.0.1:8080/
cd /d "%~dp0服务器"
node server.js

echo.
pause
