@echo off
chcp 65001 >nul
title 🎱 Bingo Comunitário
cd /d "%~dp0"

echo ======================================================
echo   🎱 BINGO COMUNITARIO - Iniciando o sistema...
echo ======================================================
echo.

REM ---------- 1) Verifica se o Node.js esta instalado ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado nesta maquina.
    echo.
    echo Instale uma unica vez em:  https://nodejs.org
    echo Depois execute este atalho novamente.
    echo.
    pause
    exit /b 1
)

REM ---------- 2) Primeira execucao: cria o arquivo .env ----------
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [PRIMEIRA EXECUCAO] Vou abrir o arquivo de configuracao.
    echo Coloque a SENHA do seu PostgreSQL na linha DB_PASSWORD,
    echo salve o arquivo ^(Ctrl+S^) e feche o Bloco de Notas.
    echo.
    start /wait notepad ".env"
)

REM ---------- 3) Instala as dependencias (so na primeira vez) ----------
if not exist "node_modules" (
    echo Instalando dependencias... isso acontece apenas uma vez.
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar as dependencias. Verifique a internet.
        pause
        exit /b 1
    )
)

REM ---------- 4) Garante que o banco e as tabelas existem ----------
echo Verificando o banco de dados...
node database\setup.js
if errorlevel 1 (
    echo.
    echo [ERRO] Nao consegui falar com o PostgreSQL.
    echo  - O servico do PostgreSQL esta rodando?
    echo  - A senha em .env esta correta? ^(apague o arquivo .env e
    echo    execute de novo para reconfigurar^)
    echo.
    pause
    exit /b 1
)

REM ---------- 5) Abre as telas no navegador apos 3 segundos ----------
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000/operador & start http://localhost:3000/"

echo.
echo ======================================================
echo   Sistema no ar! As telas vao abrir no navegador.
echo   Telao ....... http://localhost:3000/
echo   Operador .... http://localhost:3000/operador
echo.
echo   NAO FECHE ESTA JANELA durante o evento!
echo   (fechar esta janela desliga o sistema)
echo ======================================================
echo.

node server.js
pause
