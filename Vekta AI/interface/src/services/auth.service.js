/**
 * Autenticação da interface: valida credenciais do .env (sem banco) e
 * produz o middleware de sessão compartilhado entre Express e Socket.io.
 */
const crypto = require('crypto');
const session = require('express-session');
const { AUTH } = require('../config');

/** Compara duas strings em tempo constante (evita timing attacks). */
function iguaisEmTempoConstante(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Ainda compara algo do mesmo tamanho para não vazar o comprimento por tempo.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifica senha contra VEKTA_AI_SENHA_HASH (formato "saltHex:hashHex", scrypt)
 * ou, se o hash não estiver definido, contra VEKTA_AI_SENHA em texto.
 */
function senhaCorreta(senhaInformada) {
  if (AUTH.senhaHash) {
    const [saltHex, hashHex] = AUTH.senhaHash.split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const esperado = Buffer.from(hashHex, 'hex');
      const derivado = crypto.scryptSync(String(senhaInformada), salt, esperado.length);
      return crypto.timingSafeEqual(derivado, esperado);
    } catch {
      return false;
    }
  }
  if (!AUTH.senha) return false;
  return iguaisEmTempoConstante(senhaInformada, AUTH.senha);
}

/** Valida usuário + senha contra o que está no .env. */
function validarCredenciais(usuario, senha) {
  if (!AUTH.usuario || (!AUTH.senha && !AUTH.senhaHash)) {
    console.error('[auth] VEKTA_AI_USUARIO e VEKTA_AI_SENHA (ou VEKTA_AI_SENHA_HASH) não configurados no .env');
    return false;
  }
  const usuarioOk = iguaisEmTempoConstante(usuario, AUTH.usuario);
  const senhaOk = senhaCorreta(senha);
  return usuarioOk && senhaOk;
}

/**
 * Middleware express-session. O mesmo objeto deve ser aplicado ao Express
 * e ao Socket.io (via io.engine.use) para o cookie valer nos dois canais.
 */
function criarMiddlewareSessao() {
  const secret = AUTH.sessionSecret || crypto.randomBytes(32).toString('hex');
  if (!AUTH.sessionSecret) {
    console.warn('[auth] VEKTA_AI_SESSION_SECRET ausente — usando segredo efêmero (sessões reiniciam a cada boot)');
  }

  return session({
    name: 'vekta.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: AUTH.cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    },
  });
}

/** Marca a sessão como autenticada (login web ou auto-login do Electron). */
function autenticarSessao(req) {
  req.session.autenticado = true;
  req.session.usuario = AUTH.usuario || 'desktop';
}

function sessaoAutenticada(req) {
  return !!(req.session && req.session.autenticado);
}

/**
 * Gera um hash scrypt no formato esperado por VEKTA_AI_SENHA_HASH.
 * Uso: node -e "require('./src/services/auth.service').gerarHashSenha('minha-senha').then(console.log)"
 */
function gerarHashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(senha), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

module.exports = {
  validarCredenciais,
  criarMiddlewareSessao,
  autenticarSessao,
  sessaoAutenticada,
  gerarHashSenha,
};
