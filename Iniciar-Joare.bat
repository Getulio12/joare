@echo off
setlocal
cd /d "%~dp0"
title Joare Insights
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 ou superior em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
  echo Este aplicativo precisa do Node.js 24 ou superior.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :failed
)
call npm run build
if errorlevel 1 goto :failed
echo.
echo Abra no navegador: http://127.0.0.1:3001
echo Mantenha esta janela aberta enquanto usar o Joare.
call npm start
exit /b %errorlevel%
:failed
echo Nao foi possivel preparar o aplicativo. Confira a conexao e a mensagem acima.
pause
exit /b 1
