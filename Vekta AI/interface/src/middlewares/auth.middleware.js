/**
 * Gate de autenticação: roda antes do static e das rotas protegidas.
 * Whitelist libera a tela de login e os endpoints de auth; o resto exige sessão.
 */
const { sessaoAutenticada } = require('../services/auth.service');

const WHITELIST = new Set([
  '/login',
  '/api/login',
  '/api/logout',
  '/__auth-desktop',
]);

/** Assets públicos necessários para renderizar a página de login sem sessão. */
function ehAssetPublicoDoLogin(caminho) {
  return (
    caminho === '/css/tailwind.css'
    || caminho === '/css/app.css'
    || caminho === '/logo-marca.png'
    || caminho.startsWith('/vendor/')
  );
}

/** Meta baixa a mídia sem cookie de sessão (token one-shot na URL). */
function ehMidiaPublicaInstagram(caminho) {
  return /^\/api\/instagram\/public-media\/[A-Za-z0-9]+$/.test(caminho);
}

/** Webhook Meta de DMs — hash na path, sem sessão. */
function ehWebhookInstagram(caminho) {
  return /^\/api\/instagram\/webhook\/[A-Za-z0-9]+$/.test(caminho);
}

function criarGate() {
  return function gateAuth(req, res, next) {
    const caminho = req.path || '/';

    if (
      WHITELIST.has(caminho)
      || ehAssetPublicoDoLogin(caminho)
      || ehMidiaPublicaInstagram(caminho)
      || ehWebhookInstagram(caminho)
    ) {
      return next();
    }

    if (sessaoAutenticada(req)) {
      return next();
    }

    // APIs e arquivos brutos: 401 JSON (o front trata; o browser não "segue" redirect em fetch).
    if (caminho.startsWith('/api/') || caminho.startsWith('/raw/')) {
      return res.status(401).json({ erro: 'Não autenticado' });
    }

    // Navegação (/, /index.html, etc.): manda para a tela de login.
    return res.redirect('/login');
  };
}

module.exports = { criarGate, WHITELIST };
