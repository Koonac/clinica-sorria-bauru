/**
 * Constantes de configuração da interface: caminhos e variáveis de ambiente.
 */
const path = require('path');
const dotenv = require('dotenv');

const INTERFACE_DIR = path.resolve(__dirname, '..', '..'); // interface/
const RAIZ = path.resolve(INTERFACE_DIR, '..'); // raiz do projeto Vekta Ai
const PUBLIC_DIR = path.join(INTERFACE_DIR, 'public');
const VIEWS_DIR = path.join(INTERFACE_DIR, 'src', 'views');

// Credenciais e segredos ficam em interface/.env (já no .gitignore via regra ".env").
dotenv.config({ path: path.join(INTERFACE_DIR, '.env') });

const PORTA = Number(process.env.PORT) || 4680;
// 127.0.0.1 no host (nginx faz o proxy). Use HOST=0.0.0.0 só se precisar expor além do loopback.
const HOST = process.env.HOST || '127.0.0.1';
// bypassPermissions: o chat roda skills e comandos sem prompts (uso local, máquina própria).
// Troque para 'acceptEdits' ou 'default' se quiser um chat mais restrito.
const PERMISSION_MODE = process.env.VEKTA_AI_PERMISSION_MODE || 'bypassPermissions';

const AUTH = {
  usuario: process.env.VEKTA_AI_USUARIO || '',
  senha: process.env.VEKTA_AI_SENHA || '',
  senhaHash: process.env.VEKTA_AI_SENHA_HASH || '',
  sessionSecret: process.env.VEKTA_AI_SESSION_SECRET || '',
  // true quando a interface é exposta via HTTPS (túnel, proxy reverso).
  cookieSecure: String(process.env.VEKTA_AI_COOKIE_SECURE || '').toLowerCase() === 'true',
};

/** Interpreta variável de ambiente booleana (`true`/`1`/`yes`/`on`). Ausente → padrao. */
function envBool(nome, padrao = true) {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  return ['1', 'true', 'yes', 'on'].includes(String(bruto).trim().toLowerCase());
}

// Abas/recursos opcionais: false remove a aba da nav e desliga APIs/schedulers.
const FEATURES = {
  instagram: envBool('VEKTA_FEATURE_INSTAGRAM', true),
  crm: envBool('VEKTA_FEATURE_CRM', true),
  campanhas: envBool('VEKTA_FEATURE_CAMPANHAS', false),
  financeiro: envBool('VEKTA_FEATURE_FINANCEIRO', false),
  site: envBool('VEKTA_FEATURE_SITE', true),
  trafego: envBool('VEKTA_FEATURE_TRAFEGO', true),
  agenda: envBool('VEKTA_FEATURE_AGENDA', true),
};

/**
 * Pasta do site exibido na aba Site (um por instalação).
 * VEKTA_SITE_DIR: relativo à raiz do projeto ou absoluto (deve ficar sob RAIZ).
 * Aponta para a pasta com index.html (ex.: .../web/dist ou raiz HTML puro).
 * Se o basename for "dist", o código/build fica no diretório pai.
 */
const SITE_DIR_PADRAO = 'marketing/sites/portfolio-1/web/dist';

function resolverDirSite(raiz, bruto) {
  const entrada = String(bruto || SITE_DIR_PADRAO).trim() || SITE_DIR_PADRAO;
  const absoluto = path.isAbsolute(entrada)
    ? path.resolve(entrada)
    : path.resolve(raiz, entrada);
  const rel = path.relative(raiz, absoluto);
  const foraDaRaiz = rel === '' || rel.startsWith('..') || path.isAbsolute(rel);
  if (foraDaRaiz) {
    return {
      valido: false,
      absoluto: null,
      relativo: null,
      codigoAbsoluto: null,
      codigoRelativo: null,
    };
  }
  const relativo = rel.split(path.sep).join('/');
  const eDist = path.basename(absoluto).toLowerCase() === 'dist';
  const codigoAbsoluto = eDist ? path.dirname(absoluto) : absoluto;
  const codigoRelativo = path.relative(raiz, codigoAbsoluto).split(path.sep).join('/');
  return { valido: true, absoluto, relativo, codigoAbsoluto, codigoRelativo };
}

const SITE = resolverDirSite(RAIZ, process.env.VEKTA_SITE_DIR);

// Backend Laravel (CRM e futuros domínios) — proxy autenticado por token de serviço.
const BACKEND = {
  url: String(process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  apiToken: process.env.BACKEND_API_TOKEN || '',
};

// Instagram API with Instagram Login (graph.instagram.com).
const META = {
  accessToken: process.env.META_ACCESS_TOKEN || '',
  igUserId: process.env.META_IG_USER_ID || '',
  graphHost: process.env.META_GRAPH_HOST || 'https://graph.instagram.com',
  graphVersion: process.env.META_GRAPH_VERSION || 'v25.0',
  // Base HTTPS pública para a Meta baixar a mídia no publish (túnel/domínio).
  // localhost / crm.localhost não funcionam.
  publicBaseUrl: String(process.env.META_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  // Webhooks DM: App Secret (X-Hub-Signature-256) + Verify Token do App Dashboard.
  appSecret: process.env.META_APP_SECRET || '',
  webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
};

/** Normaliza ID da conta de anúncios para o formato act_XXXXXXXXX. */
function normalizarAdAccountId(bruto) {
  const s = String(bruto || '').trim();
  if (!s) return '';
  if (/^act_\d+$/i.test(s)) return `act_${s.slice(4)}`;
  if (/^\d+$/.test(s)) return `act_${s}`;
  return s;
}

// Meta Marketing API (graph.facebook.com) — Ads, separado do Instagram Login.
const META_ADS = {
  accessToken: process.env.META_ADS_ACCESS_TOKEN || '',
  adAccountId: normalizarAdAccountId(process.env.META_AD_ACCOUNT_ID),
  graphHost: process.env.META_ADS_GRAPH_HOST || 'https://graph.facebook.com',
  graphVersion: process.env.META_ADS_GRAPH_VERSION || 'v25.0',
};

/** Remove hífens do customer ID do Google Ads (123-456-7890 → 1234567890). */
function normalizarGoogleCustomerId(bruto) {
  return String(bruto || '')
    .trim()
    .replace(/-/g, '');
}

// OAuth Client único do app Vekta (Cloud Console) — compartilhado por Ads e Calendar.
// Fallback nos nomes antigos GOOGLE_ADS_* / GOOGLE_CALENDAR_* para .env legados.
const GOOGLE_OAUTH = {
  clientId:
    process.env.GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_ADS_CLIENT_ID ||
    process.env.GOOGLE_CALENDAR_CLIENT_ID ||
    '',
  clientSecret:
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.GOOGLE_ADS_CLIENT_SECRET ||
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    '',
};

// Google Ads API (REST searchStream + OAuth refresh token).
const GOOGLE_ADS = {
  clientId: GOOGLE_OAUTH.clientId,
  clientSecret: GOOGLE_OAUTH.clientSecret,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
  customerId: normalizarGoogleCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID),
  loginCustomerId: normalizarGoogleCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
  apiVersion: String(process.env.GOOGLE_ADS_API_VERSION || 'v21').replace(/^\/+|\/+$/g, ''),
};

// Google Calendar API (OAuth refresh token; sem tela de login na UI).
const GOOGLE_CALENDAR = {
  clientId: GOOGLE_OAUTH.clientId,
  clientSecret: GOOGLE_OAUTH.clientSecret,
  refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || '',
  calendarId: String(process.env.GOOGLE_CALENDAR_CALENDAR_ID || 'primary').trim() || 'primary',
};

module.exports = {
  INTERFACE_DIR,
  RAIZ,
  PUBLIC_DIR,
  VIEWS_DIR,
  PORTA,
  HOST,
  PERMISSION_MODE,
  AUTH,
  FEATURES,
  SITE,
  BACKEND,
  META,
  META_ADS,
  GOOGLE_OAUTH,
  GOOGLE_ADS,
  GOOGLE_CALENDAR,
};
