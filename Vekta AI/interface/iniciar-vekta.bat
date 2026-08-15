@echo off
setlocal
title Vekta Ai

rem ============================================================================
rem  Inicia o Vekta Ai (app desktop Electron).
rem  Instala as dependencias APENAS quando necessario (primeira vez ou quando o
rem  package-lock.json mudar) e sobe o Electron, que ja builda CSS + icones no
rem  passo "preelectron".
rem
rem  Normalmente e chamado OCULTO por iniciar-vekta.vbs (para nao mostrar a janela
rem  preta do console); o atalho "Iniciar.lnk" aponta para o .vbs. Por isso, em
rem  caso de erro este .bat NAO usa "pause" (travaria invisivel): grava o motivo em
rem  _erro-inicializacao.log e encerra. Rode este .bat direto para ver o erro na tela.
rem
rem  IMPORTANTE: NAO renomeie este arquivo para "electron.bat". O passo abaixo roda
rem  "npm run electron" (ou seja, o comando "electron ."), e o Windows procura no
rem  diretorio atual ANTES do PATH — um electron.bat aqui seria chamado no lugar do
rem  binario real do Electron, fazendo o launcher chamar a si mesmo em loop infinito.
rem ============================================================================

cd /d "%~dp0"
set "LOG=%~dp0_erro-inicializacao.log"

rem --- Node.js / npm precisam existir na maquina ---
where npm >nul 2>nul
if errorlevel 1 (
  echo [Vekta Ai] Node.js / npm nao encontrado. Instale o Node.js: https://nodejs.org> "%LOG%"
  exit /b 1
)

rem --- Decide se precisa instalar (evita reinstalar a cada abertura) ---
rem  Marcador: node_modules\.vekta-deps.lock = copia do package-lock.json da
rem  ultima instalacao bem-sucedida. Se sumir ou o lock mudar, reinstala.
set "PRECISA_INSTALAR="
if not exist "node_modules" set "PRECISA_INSTALAR=1"
if not exist "node_modules\.vekta-deps.lock" set "PRECISA_INSTALAR=1"
if exist "node_modules\.vekta-deps.lock" (
  fc /b "package-lock.json" "node_modules\.vekta-deps.lock" >nul 2>nul || set "PRECISA_INSTALAR=1"
)

if defined PRECISA_INSTALAR (
  echo [Vekta Ai] Instalando dependencias... pode demorar na primeira vez.
  call npm install --no-audit --no-fund > "%LOG%" 2>&1
  if errorlevel 1 (
    echo [Vekta Ai] Falha ao instalar as dependencias. Veja %LOG%>> "%LOG%"
    exit /b 1
  )
  rem grava o marcador so apos sucesso, para uma instalacao interrompida reinstalar
  copy /y "package-lock.json" "node_modules\.vekta-deps.lock" >nul 2>nul
) else (
  echo [Vekta Ai] Dependencias em dia.
)

rem --- Sobe o app desktop (preelectron builda CSS + icones antes) ---
echo [Vekta Ai] Iniciando o app desktop...
call npm run electron
if errorlevel 1 (
  echo [Vekta Ai] O app encerrou com erro (codigo %errorlevel%).> "%LOG%"
  exit /b 1
)

rem chegou aqui sem erro: remove log antigo, se houver
if exist "%LOG%" del "%LOG%" >nul 2>nul
endlocal
