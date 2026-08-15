/**
 * Rotas de autenticação: login, logout e auto-login do Electron.
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { PUBLIC_DIR } = require('../config');
const {
  validarCredenciais,
  autenticarSessao,
  sessaoAutenticada,
} = require('../services/auth.service');

/**
 * @param {{ obterDesktopToken?: () => string | null }} opcoes
 *   `obterDesktopToken` só devolve um valor quando o servidor foi iniciado
 *   pelo Electron; no modo web fica sempre null e /__auth-desktop rejeita.
 */
function criarRotasAuth({ obterDesktopToken = () => null } = {}) {
  const router = express.Router();

  const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Tente de novo em alguns minutos.' },
  });

  router.get('/login', (req, res) => {
    if (sessaoAutenticada(req)) {
      return res.redirect('/');
    }
    return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  });

  router.post('/api/login', limiteLogin, (req, res) => {
    const usuario = String(req.body?.usuario || '').trim();
    const senha = String(req.body?.senha || '');

    if (!validarCredenciais(usuario, senha)) {
      return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
    }

    autenticarSessao(req);
    return res.json({ ok: true });
  });

  router.post('/api/logout', (req, res) => {
    req.session.destroy((erro) => {
      res.clearCookie('vekta.sid');
      if (erro) {
        return res.status(500).json({ erro: 'Falha ao encerrar a sessão.' });
      }
      return res.json({ ok: true });
    });
  });

  /**
   * Auto-login do Electron: o main process gera um token por execução e
   * carrega esta URL. Quem não passou o token em iniciar() nunca autentica aqui.
   */
  router.get('/__auth-desktop', (req, res) => {
    const desktopToken = obterDesktopToken();
    if (!desktopToken) {
      return res.status(404).send('Não encontrado');
    }

    const token = String(req.query.token || '');
    if (!token || token.length !== desktopToken.length) {
      return res.status(403).send('Token inválido');
    }

    const ok = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(desktopToken));
    if (!ok) {
      return res.status(403).send('Token inválido');
    }

    autenticarSessao(req);
    return res.redirect('/');
  });

  return router;
}

module.exports = criarRotasAuth;
