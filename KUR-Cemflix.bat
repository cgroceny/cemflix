@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
REM Turkce Windows'ta Java'nin "Turkce I" hatasi sertifika uretimini bozuyor; Ingilizce yerel ayari zorla.
set "JAVA_TOOL_OPTIONS=-Duser.language=en -Duser.country=US"
title Cemflix - Samsung TV'ye kurulum
color 0E
echo.
echo   ============================================
echo      CEMFLIX  -  Samsung TV kurulum araci
echo   ============================================
echo.

REM ---- Tizen Studio CLI'yi bul ----
set "TIZEN="
for %%P in ("%USERPROFILE%\tizen-studio" "C:\tizen-studio" "D:\tizen-studio" "%LOCALAPPDATA%\tizen-studio") do (
  if exist "%%~P\tools\ide\bin\tizen.bat" if not defined TIZEN (
    set "TIZEN=%%~P\tools\ide\bin\tizen.bat"
    set "SDB=%%~P\tools\sdb.exe"
    set "TSROOT=%%~P"
  )
)
if not defined TIZEN (
  echo   [HATA] Tizen Studio bulunamadi.
  echo   KURULUM.txt dosyasindaki 1. adimi yapin, sonra bu dosyayi tekrar calistirin.
  echo.
  pause & exit /b 1
)
echo   Tizen Studio: !TSROOT!
echo.

REM ---- TV IP adresi ----
set "TVIP="
if exist "%~dp0tv-ip.txt" set /p TVIP=<"%~dp0tv-ip.txt"
if defined TVIP (
  echo   Kayitli TV IP adresi: !TVIP!   ^(degistirmek icin tv-ip.txt dosyasini silin^)
) else (
  echo   TV'nin IP adresi: TV'de Ayarlar ^> Genel ^> Ag ^> Ag Durumu ^> IP Ayarlari
  set /p TVIP=  TV IP adresini yazin ^(ornek 192.168.1.45^): 
  > "%~dp0tv-ip.txt" echo !TVIP!
)
echo.

REM ---- Baglan ----
echo   [1/4] TV'ye baglaniliyor...
"!SDB!" disconnect !TVIP! >nul 2>&1
"!SDB!" connect !TVIP!
"!SDB!" devices | findstr /C:"!TVIP!" >nul
if errorlevel 1 (
  echo.
  echo   [HATA] TV'ye baglanilamadi. Kontrol edin:
  echo     - TV acik ve bilgisayarla ayni Wi-Fi/modemde mi?
  echo     - TV'de Gelistirici Modu acik mi ve bu bilgisayarin IP'si girildi mi?
  echo     - Gelistirici Modunu actiktan sonra TV kapatilip acildi mi?
  echo.
  pause & exit /b 1
)
for /f "tokens=3" %%N in ('"!SDB!" devices ^| findstr /C:"!TVIP!"') do set "TVNAME=%%N"
echo   Baglandi: !TVNAME!
echo.

REM ---- Sertifika profili ----
echo   [2/4] Imza sertifikasi hazirlaniyor...
set "PROFILE="
if exist "%~dp0profil.txt" set /p PROFILE=<"%~dp0profil.txt"
if not defined PROFILE set "PROFILE=cemflix"
call "!TIZEN!" security-profiles list 2>nul | findstr /B /C:"!PROFILE! " >nul
if errorlevel 1 (
  if /I "!PROFILE!"=="cemflix" (
    echo   'cemflix' profili yok, Tizen yazar sertifikasi olusturuluyor...
    call "!TIZEN!" certificate -a cemflix -p cemflix123 -c TR -n Cemflix -f cemflix >nul
    REM Veri klasoru sdk.info'daki TIZEN_SDK_DATA_PATH (orn. C:\tizen-studio-data)
    set "TSDATA=%USERPROFILE%\tizen-studio-data"
    for /f "tokens=1,* delims==" %%A in ('type "!TSROOT!\sdk.info" 2^>nul') do if /I "%%A"=="TIZEN_SDK_DATA_PATH" set "TSDATA=%%B"
    set "P12=!TSDATA!\keystore\author\cemflix.p12"
    if not exist "!P12!" (
      for /f "delims=" %%F in ('dir /s /b "!TSDATA!\cemflix.p12" "%USERPROFILE%\tizen-studio-data\cemflix.p12" 2^>nul') do set "P12=%%F"
    )
    call "!TIZEN!" security-profiles add -n cemflix -a "!P12!" -p cemflix123 >nul
  ) else (
    echo   [HATA] profil.txt icinde yazan '!PROFILE!' profili bulunamadi.
    pause & exit /b 1
  )
)
echo   Profil: !PROFILE!
echo.

REM ---- Paketle ----
echo   [3/4] Uygulama paketleniyor...
if exist "%~dp0app\Cemflix.wgt" del /q "%~dp0app\Cemflix.wgt"
call "!TIZEN!" package -t wgt -s !PROFILE! -- "%~dp0app"
for %%W in ("%~dp0app\*.wgt") do set "WGT=%%~nxW"
if not defined WGT (
  echo   [HATA] Paket olusturulamadi.
  pause & exit /b 1
)
echo   Paket: !WGT!
echo.

REM ---- Kur ve calistir ----
echo   [4/4] TV'ye yukleniyor...
call "!TIZEN!" install -n "!WGT!" -s !TVIP!:26101 -- "%~dp0app" > "%~dp0kurulum-log.txt" 2>&1
type "%~dp0kurulum-log.txt"
findstr /I /C:"successfully" /C:"completed" "%~dp0kurulum-log.txt" >nul
if errorlevel 1 (
  echo.
  echo   [HATA] Kurulum basarisiz oldu.
  findstr /I /C:"signature" /C:"certificate" /C:"privilege" "%~dp0kurulum-log.txt" >nul
  if not errorlevel 1 (
    echo   Bu TV, Samsung sertifikasi istiyor. KURULUM.txt dosyasindaki
    echo   "Samsung sertifikasi" bolumunu uygulayin ve profil adini profil.txt'ye yazin.
  )
  echo.
  pause & exit /b 1
)
call "!TIZEN!" run -p CemflixTV1.Cemflix -s !TVIP!:26101 >nul 2>&1
echo.
echo   ============================================
echo     Cemflix TV'ye kuruldu ve acildi!
echo     TV'de Uygulamalar listesinde de bulabilirsiniz.
echo   ============================================
echo.
pause
