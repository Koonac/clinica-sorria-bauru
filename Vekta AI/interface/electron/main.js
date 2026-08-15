/**
 * Wrapper desktop (Electron) do Vekta Ai.
 *
 * Não reimplementa nada da interface: sobe o MESMO servidor Express + Socket.io
 * de src/app.js dentro do main process (Node) e carrega http://localhost:<porta>
 * numa janela nativa. Assim o front, o chat via Claude CLI e o acesso ao disco
 * do projeto continuam idênticos ao modo web (`npm start`).
 *
 * Uso em dev: npm run electron (dentro de interface/).
 */
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain } = require('electron');

const { iniciar, desligar } = require('../src/app');

// Token de processo: só existe nesta execução do Electron e autentica a janela
// via /__auth-desktop sem pedir login. O modo web (npm start) nunca gera isso.
const desktopToken = crypto.randomBytes(32).toString('hex');

// Ícone da marca (mesmo .ico do atalho Iniciar.lnk), em interface/:
// interface/electron -> .. = interface. Usado na janela e na barra de tarefas.
const ICONE = path.join(__dirname, '..', 'icon.ico');

// Uma única instância: se o usuário abrir o app de novo, foca a janela existente
// em vez de subir um segundo servidor na mesma porta.
const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
  app.quit();
}

let janela = null;

function criarJanela(porta) {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    // Mínimo baixo de propósito: a interface usa header + conteúdo, e a janela
    // pode ser reduzida em monitores pequenos sem quebrar.
    minWidth: 400,
    minHeight: 560,
    backgroundColor: '#0A0B0F', // mesmo fundo do tema, evita flash branco no load
    title: 'Vekta Ai',
    icon: ICONE,
    webPreferences: {
      // Renderer carrega uma origem local confiável (nosso próprio server); mantemos
      // as defaults seguras do Electron (contextIsolation on, nodeIntegration off).
      // O acesso ao SO fica todo no server/main, nunca exposto ao renderer.
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Auto-login: o server valida o token de processo e grava a sessão no cookie.
  janela.loadURL(`http://localhost:${porta}/__auth-desktop?token=${encodeURIComponent(desktopToken)}`);

  janela.on('closed', () => {
    janela = null;
  });
}

/**
 * Relança o app inteiro para aplicar código novo (ex.: quando o Vekta cria uma
 * tela que exige rota/serviço de backend). Substitui o "buildar de novo": não é
 * build, é um restart do próprio processo, que recarrega todo o código do server.
 */
function relancar() {
  app.relaunch();
  app.exit(0);
}

app.whenReady().then(async () => {
  // Windows: sem um AppUserModelID próprio, a barra de tarefas usa o ícone do
  // host (electron.exe) e não o da janela. Fixá-lo garante o ícone da marca.
  if (process.platform === 'win32') app.setAppUserModelId('ai.vekta.desktop');

  // Sobe o servidor ANTES de abrir a janela, para o loadURL nunca cair num "connection refused".
  // porta 0 = porta livre escolhida pelo SO, para conviver com um `npm start` web na 4680.
  // desktopToken autentica a janela sem tela de login (só existe neste processo).
  const { porta } = await iniciar({ porta: 0, desktopToken });
  criarJanela(porta);

  // macOS: reabrir a janela ao clicar no ícone do dock sem sair do app.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela(porta);
  });
});

// Alguém tentou abrir uma segunda instância: traz a janela atual para frente.
app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

// Canal para o fluxo de "mudança de backend" disparar o relaunch a partir do app.
ipcMain.handle('vekta:relaunch', () => relancar());

app.on('window-all-closed', () => {
  // Convenção: no macOS o app segue vivo no dock; nas demais plataformas encerra.
  if (process.platform !== 'darwin') {
    desligar();
    app.quit();
  }
});

app.on('before-quit', () => {
  desligar();
});
