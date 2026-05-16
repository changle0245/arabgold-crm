@echo off
chcp 65001 >nul
title ArabGold CRM - 本地预览

cd /d "%~dp0"

echo.
echo ========================================
echo   ArabGold CRM 本地预览启动中...
echo ========================================
echo.

REM ── 1. 检查 Docker 是否运行 ──────────────────
where docker >nul 2>&1
if errorlevel 1 (
    echo [×] 未检测到 Docker
    echo     请先安装 Docker Desktop: https://www.docker.com/products/docker-desktop/
    echo     装好后启动 Docker Desktop，再运行此脚本
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [×] Docker 已安装但未运行
    echo     请先启动 Docker Desktop，等它的图标变绿后再运行此脚本
    pause
    exit /b 1
)
echo [√] Docker 运行中

REM ── 2. 检查 node_modules ─────────────────────
if not exist "node_modules" (
    echo [!] 首次启动，安装依赖中（可能需要几分钟）...
    call npm install
    if errorlevel 1 (
        echo [×] 依赖安装失败
        pause
        exit /b 1
    )
)
echo [√] Node 依赖就绪

REM ── 3. 启动 Supabase 本地实例 ────────────────
echo.
echo [...] 启动 Supabase 本地实例（首次启动需要拉取镜像，可能 5-15 分钟）
echo.

bin\supabase.exe status >nul 2>&1
if errorlevel 1 (
    bin\supabase.exe start
    if errorlevel 1 (
        echo [×] Supabase 启动失败
        pause
        exit /b 1
    )
) else (
    echo [√] Supabase 已在运行
)

REM ── 4. 写入 .env.local ───────────────────────
echo.
echo [...] 同步本地 Supabase 凭据到 .env.local

REM 用 supabase status -o env 直接输出 KEY=VALUE 格式，--override-name 重命名为本项目变量
bin\supabase.exe status -o env ^
    --override-name api.url=NEXT_PUBLIC_SUPABASE_URL ^
    --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY ^
    --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY > .env.local

echo [√] 凭据已写入 .env.local

REM ── 5. 启动 Next.js dev ─────────────────────
echo.
echo ========================================
echo   一切就绪！
echo ========================================
echo.
echo   本地服务：
echo   • CRM 系统:      http://localhost:3000
echo   • Supabase Studio: http://localhost:54323
echo   • 邮件查看:     http://localhost:54324
echo.
echo   首次使用？运行 init-admin.bat 创建管理员账号
echo   关闭此窗口或按 Ctrl+C 可停止前端服务
echo   完整停止 Supabase 请运行 stop.bat
echo ----------------------------------------
echo.

start "" /B cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

call npm run dev
