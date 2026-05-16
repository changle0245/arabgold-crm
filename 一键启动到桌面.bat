@echo off
chcp 65001 >nul
title 创建桌面快捷方式

set "TARGET=%~dp0start.bat"
set "ICON=%~dp0public\favicon.ico"
set "SHORTCUT=%USERPROFILE%\Desktop\ArabGold CRM.lnk"

echo 正在创建桌面快捷方式...

powershell -NoProfile -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = '%ICON%'; $s.Description = 'ArabGold CRM 本地预览'; $s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo [√] 已在桌面创建快捷方式：ArabGold CRM
    echo     双击它即可一键启动本地预览
    echo.
) else (
    echo.
    echo [×] 创建失败，请尝试手动操作
    echo.
)

pause
