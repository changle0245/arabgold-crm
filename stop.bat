@echo off
chcp 65001 >nul
title 停止 Supabase 本地实例

cd /d "%~dp0"

echo 正在停止 Supabase 本地实例...
bin\supabase.exe stop
echo.
echo [√] Supabase 已停止。Docker 容器已清理。
echo     下次启动只需再次运行 start.bat
pause
