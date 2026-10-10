@echo off
chcp 65001 > nul
echo ========================================================
echo   Smart Wolffia Cultivation V3.0.1 - GitHub Push Script
echo ========================================================
echo.

set /p REPO_URL="กรุณากรอก GitHub Repository URL (เช่น https://github.com/username/repo.git): "

if "%REPO_URL%"=="" (
    echo [ERROR] ไม่ได้กรอก URL กรุณาลองใหม่อีกครั้ง
    pause
    exit /b 1
)

echo.
echo [1/3] กำลังตั้งค่า Remote Origin...
git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo [2/3] กำลังตั้งค่า Branch main...
git branch -M main

echo [3/3] กำลัง Push โค้ดขึ้น GitHub...
git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCCESS] Push โค้ดขึ้น GitHub สำเร็จเรียบร้อยแล้ว!
    echo   ขั้นตอนต่อไป: ไปที่ vercel.com แล้วกด Import Repository นี้
    echo ========================================================
) else (
    echo ========================================================
    echo   [NOTICE] หากพบข้อผิดพลาด กรุณาตรวจสอบสิทธิ์การ Login ใน GitHub
    echo ========================================================
)

pause
