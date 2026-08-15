/**
 * Interface local do Vekta Ai.
 *
 * Servidor Express + Socket.io que expõe:
 *  - Dashboard das pastas do sistema (marketing/ e saidas/)
 *  - Visualização e edição do DNA da empresa (.dna)
 *  - Galeria de imagens e vídeos produzidos
 *  - Chat com o Vekta Ai via Claude CLI (sessão viva, streaming)
 *
 * Uso: npm start (dentro de interface/). Sobe em http://localhost:4680
 *
 * Autenticação: sessão por cookie (express-session). O modo web exige login
 * (credenciais em interface/.env). O Electron autentica sozinho via token
 * de processo passado em iniciar({ desktopToken }).
 */
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { RAIZ, PUBLIC_DIR, VIEWS_DIR, PORTA, HOST, PERMISSION_MODE, AUTH, FEATURES, SITE } = require('./config');
const { GerenciadorDeSessoes } = require('./services/claude.service');
const { criarMiddlewareSessao, sessaoAutenticada } = require('./services/auth.service');
const { criarGate } = require('./middlewares/auth.middleware');
const criarRotasAuth = require('./routes/auth.routes');
const rotas = require('./routes');
const chatSocket = require('./sockets/chat.socket');
const watcherService = require('./services/watcher.service');
const instagramScheduler = require('./services/instagram-scheduler');
const instagramFlowEngine = require('./services/instagram-flow-engine.service');

const app = express();
const servidorHttp = http.createServer(app);
// maxHttpBufferSize padrão do Socket.io é 1 MB — pequeno demais para os anexos em
// base64 do chat (até 5 arquivos, imagem até 5 MB ou PDF até 10 MB cada); acima do
// limite a mensagem é descartada sem erro nenhum, então o ajuste aqui é o que faz
// o anexo funcionar. 80 MB cobre o pior caso (5 PDFs de 10 MB em base64 ≈ 67 MB).
const io = new Server(servidorHttp, { maxHttpBufferSize: 80 * 1024 * 1024 });

const sessoes = new GerenciadorDeSessoes({ cwd: RAIZ, permissionMode: PERMISSION_MODE });

const sessionMiddleware = criarMiddlewareSessao();

// Atrás de túnel/proxy HTTPS o Express precisa confiar no X-Forwarded-Proto
// para o cookie `secure` funcionar.
if (AUTH.cookieSecure) {
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  // Webhook Meta precisa do raw body para validar X-Hub-Signature-256.
  if (/^\/api\/instagram\/webhook\/[A-Za-z0-9]+$/.test(req.path || '')) {
    return express.json({
      limit: '2mb',
      verify: (requisicao, _res, buf) => {
        requisicao.rawBody = buf;
      },
    })(req, res, next);
  }
  // Upload de Reels em base64 pode passar de 2 MB.
  if (req.method === 'POST' && req.path === '/api/instagram/agendamentos') {
    return express.json({ limit: '80mb' })(req, res, next);
  }
  // Envio de imagem WhatsApp (base64) via proxy CRM.
  if (req.method === 'POST' && req.path === '/api/crm/whatsapp/send') {
    return express.json({ limit: '12mb' })(req, res, next);
  }
  return express.json({ limit: '2mb' })(req, res, next);
});
app.use(sessionMiddleware);

// Token do Electron — preenchido em iniciar({ desktopToken }). No modo web fica null.
let desktopTokenAtual = null;

// Rotas de auth (login/logout/desktop) ANTES do gate — a whitelist também as libera,
// mas montá-las explicitamente garante que existam mesmo se o gate mudar.
app.use(criarRotasAuth({
  obterDesktopToken: () => desktopTokenAtual,
}));

app.use(criarGate());

app.use(express.static(PUBLIC_DIR));
// dotfiles: 'allow' — src/views/.core usa o prefixo de ponto pela mesma
// convenção de ".dna" no projeto; sem isso o Express esconde a pasta por padrão.
app.use('/views', express.static(VIEWS_DIR, { dotfiles: 'allow' }));
// Preview do site configurado (VEKTA_SITE_DIR) — atrás do gate de auth.
if (FEATURES.site && SITE.valido && SITE.absoluto) {
  app.use('/site-preview', express.static(SITE.absoluto, { index: 'index.html' }));
}
app.use(rotas);

// Sessão compartilhada com o Socket.io (mesmo cookie httpOnly).
// Auth no engine (bloqueia o transporte) e no socket (bloqueia o CONNECT).
io.engine.use(sessionMiddleware);
io.engine.use((req, res, next) => {
  if (sessaoAutenticada(req)) return next();
  const erro = new Error('Não autenticado');
  // Engine.IO trata next(err) como falha do handshake HTTP.
  return next(erro);
});
io.use((socket, next) => {
  const req = socket.request;
  if (sessaoAutenticada(req)) return next();
  const erro = new Error('Não autenticado');
  erro.data = { codigo: 401 };
  return next(erro);
});

chatSocket.registrar(io, sessoes);
// Observa o disco e avisa o front em tempo real (dados e páginas novas).
const watcher = watcherService.iniciar(io);

// ---------- Início e encerramento ----------

/**
 * Sobe o servidor HTTP. Retorna uma Promise que resolve quando ele está ouvindo,
 * entregando { servidorHttp, io, sessoes, porta } — usado tanto pelo `npm start`
 * (execução direta) quanto pelo wrapper Electron, que roda o mesmo server
 * in-process e depois carrega http://localhost:<porta> na janela.
 *
 * @param {{ porta?: number, desktopToken?: string | null }} opcoes
 */
function iniciar({ porta = PORTA, desktopToken = null } = {}) {
  desktopTokenAtual = desktopToken || null;

  return new Promise((resolve) => {
    // porta 0 = o SO escolhe uma porta livre. O Electron usa isso para nunca
    // colidir com um `npm start` web já rodando na 4680; lemos a porta real
    // atribuída em address() e é ela que a janela carrega.
    servidorHttp.listen(porta, HOST, () => {
      const portaReal = servidorHttp.address().port;
      console.log(`Vekta Ai Interface rodando em http://${HOST}:${portaReal}`);
      console.log(`Raiz do projeto: ${RAIZ}`);
      console.log(`Permission mode do chat: ${PERMISSION_MODE}`);
      if (!AUTH.usuario || (!AUTH.senha && !AUTH.senhaHash)) {
        console.warn('[auth] Credenciais ausentes no .env — o login web vai rejeitar qualquer tentativa.');
      }
      console.log(`[features] Instagram=${FEATURES.instagram ? 'on' : 'off'} CRM=${FEATURES.crm ? 'on' : 'off'} Campanhas=${FEATURES.campanhas ? 'on' : 'off'} Financeiro=${FEATURES.financeiro ? 'on' : 'off'} Site=${FEATURES.site ? 'on' : 'off'} Tráfego=${FEATURES.trafego ? 'on' : 'off'} Agenda=${FEATURES.agenda ? 'on' : 'off'}`);
      if (FEATURES.site && SITE.valido) {
        console.log(`[site] Preview: ${SITE.relativo} (código: ${SITE.codigoRelativo})`);
      }
      if (FEATURES.instagram) {
        instagramScheduler.iniciar();
        instagramFlowEngine.iniciarPollerDelays();
      }
      resolve({ servidorHttp, io, sessoes, porta: portaReal });
    });
  });
}

/** Encerra as sessões vivas do Claude CLI e para o watcher. Não mata o processo — quem chamou decide. */
function desligar() {
  if (FEATURES.instagram) {
    instagramScheduler.parar();
    instagramFlowEngine.pararPollerDelays();
  }
  sessoes.encerrarTodas();
  watcher.close();
}

// Execução direta (`node src/app.js` / `npm start`): sobe o server e trata os sinais.
// Sob o Electron, o main process importa `iniciar`/`desligar` e cuida do ciclo de vida.
if (require.main === module) {
  iniciar();
  const encerrarProcesso = () => { desligar(); process.exit(0); };
  process.on('SIGINT', encerrarProcesso);
  process.on('SIGTERM', encerrarProcesso);
}

module.exports = { app, servidorHttp, io, sessoes, iniciar, desligar };
