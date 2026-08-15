/**
 * Tokens de uso único para a Meta baixar mídia via URL pública.
 * Persistidos em disco para o script Python (.scripts/instagram-agendar.py)
 * e o servidor Node compartilharem o mesmo mapa.
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { META, RAIZ } = require('../config');
const fila = require('./instagram-fila.service');

const TTL_MS = 15 * 60 * 1000;
const ARQUIVO_TOKENS = path.join('materiais', 'instagram', 'public-tokens.json');

function caminhoTokens() {
  return path.join(RAIZ, ARQUIVO_TOKENS);
}

function publicBaseUrlConfigurado() {
  return Boolean(META.publicBaseUrl && String(META.publicBaseUrl).trim());
}

function obterPublicBaseUrl() {
  if (!publicBaseUrlConfigurado()) {
    const err = new Error(
      'META_PUBLIC_BASE_URL não configurada. A Meta precisa de uma URL HTTPS pública para baixar a mídia.'
    );
    err.codigo = 'public_url_ausente';
    err.status = 503;
    throw err;
  }
  return META.publicBaseUrl;
}

function lerTokens() {
  const arquivo = caminhoTokens();
  if (!fs.existsSync(arquivo)) return {};
  try {
    const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {};
  } catch {
    return {};
  }
}

function escreverTokens(mapa) {
  const arquivo = caminhoTokens();
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(mapa, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function limparExpirados(mapa) {
  const agora = Date.now();
  let mudou = false;
  for (const [tok, meta] of Object.entries(mapa)) {
    if (!meta || meta.expiraEm <= agora) {
      delete mapa[tok];
      mudou = true;
    }
  }
  return mudou;
}

/**
 * Emite token e URL pública para um arquivo do item.
 * @param {{ arquivo?: string, media_type?: string }} item
 * @param {{ arquivo?: string, media_type?: string, mime?: string } | null} override
 * @returns {{ token: string, url: string }}
 */
function emitirUrlPublica(item, override = null) {
  const base = obterPublicBaseUrl();
  const arquivoRel = override?.arquivo || item.arquivo;
  const mime =
    override?.media_type ||
    override?.mime ||
    item.media_type ||
    'application/octet-stream';
  const absoluto = fila.abs(arquivoRel);
  if (!fs.existsSync(absoluto)) {
    const err = new Error('Arquivo de mídia não encontrado no disco.');
    err.codigo = 'midia_ausente';
    err.status = 404;
    throw err;
  }

  const mapa = lerTokens();
  limparExpirados(mapa);

  const token = crypto.randomBytes(24).toString('hex');
  mapa[token] = {
    arquivoRel,
    mime,
    expiraEm: Date.now() + TTL_MS,
  };
  escreverTokens(mapa);

  return {
    token,
    url: `${base}/api/instagram/public-media/${token}`,
  };
}

function invalidarToken(token) {
  if (!token) return;
  const mapa = lerTokens();
  if (mapa[token]) {
    delete mapa[token];
    escreverTokens(mapa);
  }
}

function invalidarTokens(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return;
  const mapa = lerTokens();
  let mudou = false;
  for (const token of lista) {
    if (token && mapa[token]) {
      delete mapa[token];
      mudou = true;
    }
  }
  if (mudou) escreverTokens(mapa);
}

/**
 * Resolve token → { absoluto, mime } ou null.
 */
function resolverToken(token) {
  const mapa = lerTokens();
  if (limparExpirados(mapa)) escreverTokens(mapa);

  const meta = mapa[String(token || '')];
  if (!meta) return null;
  if (meta.expiraEm <= Date.now()) {
    delete mapa[token];
    escreverTokens(mapa);
    return null;
  }

  const absoluto = path.resolve(fila.abs(meta.arquivoRel));
  const raizMidias = path.resolve(fila.abs(fila.PASTA_MIDIAS));
  const prefixo = raizMidias.endsWith(path.sep) ? raizMidias : raizMidias + path.sep;
  if (!absoluto.toLowerCase().startsWith(prefixo.toLowerCase())) return null;
  if (!fs.existsSync(absoluto)) {
    delete mapa[token];
    escreverTokens(mapa);
    return null;
  }
  return { absoluto, mime: meta.mime };
}

module.exports = {
  TTL_MS,
  ARQUIVO_TOKENS,
  publicBaseUrlConfigurado,
  obterPublicBaseUrl,
  emitirUrlPublica,
  invalidarToken,
  invalidarTokens,
  resolverToken,
};
