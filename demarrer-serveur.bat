@echo off
rem Lance le serveur des chutes et le relance automatiquement s'il s'arrête.
rem Le mot de passe est lu dans motdepasse.txt (à créer à côté de ce fichier, une seule ligne).
cd /d "%~dp0"
if not exist motdepasse.txt (
  echo Creez le fichier motdepasse.txt contenant le mot de passe, puis relancez.
  pause
  exit /b 1
)
set /p APP_PASSWORD=<motdepasse.txt
set APP_USER=Production
set PORT=3000
rem Pour copier aussi les sauvegardes sur un autre disque, decommentez la ligne suivante :
rem set BACKUP_DIR=D:\Sauvegardes-chutes
:boucle
node server.js >> serveur.log 2>&1
echo %date% %time% - serveur arrete, redemarrage dans 5 secondes >> serveur.log
timeout /t 5 /nobreak >nul
goto boucle
