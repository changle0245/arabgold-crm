@echo off
chcp 65001 >nul
title 创建第一个管理员账号

cd /d "%~dp0"

echo.
echo ========================================
echo   创建 CRM 系统的第一个管理员账号
echo ========================================
echo.

REM 检查 Supabase 是否运行
bin\supabase.exe status >nul 2>&1
if errorlevel 1 (
    echo [×] Supabase 未运行，请先运行 start.bat
    pause
    exit /b 1
)

REM 检查 .env.local
if not exist ".env.local" (
    echo [×] .env.local 不存在，请先运行 start.bat
    pause
    exit /b 1
)

set /p ADMIN_EMAIL=请输入管理员邮箱 (例如 admin@arabgold.com):
set /p ADMIN_PASSWORD=请输入管理员密码 (至少 6 位):
set /p ADMIN_NAME=请输入管理员姓名:

echo.
echo 正在创建账号...

node scripts/init-admin.js "%ADMIN_EMAIL%" "%ADMIN_PASSWORD%" "%ADMIN_NAME%"

echo.
pause
