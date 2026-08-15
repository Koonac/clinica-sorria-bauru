/**
 * Persistência em disco da automação de DMs Instagram
 * (materiais/instagram/automacao/).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RAIZ, META } = require('../config');

const PASTA_REL = path.join('materiais', 'instagram', 'automacao');
const PASTA_FLUXOS = path.join(PASTA_REL, 'fluxos');
const PASTA_CONVERSAS = path.join(PASTA_REL, 'conversas');
const PASTA_EVENTOS = path.join(PASTA_REL, 'eventos');
const ARQUIVO_CONFIG = path.join(PASTA_REL, 'config.json');

const CAMPOS_PADRAO = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'comments',
];

const CAMPOS_ANTIGOS_SEM_COMMENTS = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
];

function camposIguais(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((v, i) => v === sb[i]);
}

function garantirCommentsNosCampos(fields) {
  if (!Array.isArray(fields) || !fields.length) return [...CAMPOS_PADRAO];
  if (camposIguais(fields, CAMPOS_ANTIGOS_SEM_COMMENTS)) return [...CAMPOS_PADRAO];
  if (fields.includes('comments')) return fields.map(String);
  return [...fields.map(String), 'comments'];
}

function abs(rel) {
  return path.join(RAIZ, rel);
}

function garantirPastas() {
  fs.mkdirSync(abs(PASTA_FLUXOS), { recursive: true });
  fs.mkdirSync(abs(PASTA_CONVERSAS), { recursive: true });
  fs.mkdirSync(abs(PASTA_EVENTOS), { recursive: true });
}

function escreverJsonAtomico(arquivoAbs, dados) {
  const tmp = `${arquivoAbs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivoAbs);
}

function lerJson(arquivoAbs, fallback) {
  if (!fs.existsSync(arquivoAbs)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(arquivoAbs, 'utf8'));
  } catch {
    return fallback;
  }
}

function novoId(prefixo = 'ig') {
  const agora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = [
    agora.getUTCFullYear(),
    p(agora.getUTCMonth() + 1),
    p(agora.getUTCDate()),
    p(agora.getUTCHours()),
    p(agora.getUTCMinutes()),
  ].join('');
  return `${prefixo}-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Verify Token do App Dashboard — sempre do .env (META_WEBHOOK_VERIFY_TOKEN). */
function resolveVerifyToken() {
  return String(META.webhookVerifyToken || '').trim();
}

function configPadrao() {
  return {
    hash: '',
    verify_token: resolveVerifyToken(),
    ativo: true,
    subscribed_fields: [...CAMPOS_PADRAO],
    atualizado_em: null,
  };
}

function lerConfig() {
  garantirPastas();
  const bruto = lerJson(abs(ARQUIVO_CONFIG), null);
  if (!bruto || typeof bruto !== 'object') return configPadrao();
  const fieldsBrutos =
    Array.isArray(bruto.subscribed_fields) && bruto.subscribed_fields.length
      ? bruto.subscribed_fields
      : [...CAMPOS_PADRAO];
  return {
    ...configPadrao(),
    ...bruto,
    subscribed_fields: garantirCommentsNosCampos(fieldsBrutos),
  };
}

function salvarConfig(parcial = {}) {
  garantirPastas();
  const atual = lerConfig();
  const proximo = {
    ...atual,
    ...parcial,
    atualizado_em: new Date().toISOString(),
  };
  escreverJsonAtomico(abs(ARQUIVO_CONFIG), proximo);
  return proximo;
}

function gerarHash() {
  // Só regenera o segredo da path. Verify Token vem exclusivo do .env.
  return salvarConfig({
    hash: crypto.randomBytes(24).toString('hex'),
  });
}

function callbackUrl(hash) {
  const base = String(META.publicBaseUrl || '').replace(/\/+$/, '');
  const h = String(hash || '').trim();
  if (!base || !h) return null;
  return `${base}/api/instagram/webhook/${h}`;
}

function obterConfigPublica() {
  const cfg = lerConfig();
  const verify = resolveVerifyToken();
  return {
    ...cfg,
    // Sempre o valor do .env — não o hash da URL nem o que ficou no config.json.
    verify_token: verify,
    verify_token_ok: Boolean(verify),
    callback_url: callbackUrl(cfg.hash),
    public_base_url_ok: Boolean(META.publicBaseUrl),
    public_base_url: META.publicBaseUrl || null,
    app_secret_ok: Boolean(String(META.appSecret || '').trim()),
    access_token_ok: Boolean(String(META.accessToken || '').trim()),
  };
}

function caminhoFluxo(id) {
  const seguro = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!seguro) throw Object.assign(new Error('ID de fluxo inválido.'), { status: 400, codigo: 'fluxo_id' });
  return abs(path.join(PASTA_FLUXOS, `${seguro}.json`));
}

function listarFluxos() {
  garantirPastas();
  const dir = abs(PASTA_FLUXOS);
  const nomes = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  return nomes
    .map((nome) => lerJson(path.join(dir, nome), null))
    .filter((f) => f && f.id)
    .sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')));
}

function obterFluxo(id) {
  const arquivo = caminhoFluxo(id);
  const fluxo = lerJson(arquivo, null);
  if (!fluxo) {
    const err = new Error('Fluxo não encontrado.');
    err.status = 404;
    err.codigo = 'fluxo_nao_encontrado';
    throw err;
  }
  return fluxo;
}

function normalizarFluxo(entrada, idExistente = null) {
  const id = idExistente || String(entrada.id || '').trim() || novoId('fluxo');
  const nos = Array.isArray(entrada.nos) ? entrada.nos : [];
  const arestas = Array.isArray(entrada.arestas) ? entrada.arestas : [];
  return {
    id,
    nome: String(entrada.nome || 'Fluxo sem nome').slice(0, 120),
    ativo: Boolean(entrada.ativo),
    nos,
    arestas,
    criado_em: entrada.criado_em || new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
}

function salvarFluxo(entrada, idExistente = null) {
  garantirPastas();
  const fluxo = normalizarFluxo(entrada, idExistente);
  escreverJsonAtomico(caminhoFluxo(fluxo.id), fluxo);
  return fluxo;
}

function criarFluxo(entrada = {}) {
  const fluxo = normalizarFluxo({
    nome: entrada.nome || 'Novo fluxo',
    ativo: false,
    nos: entrada.nos || [
      {
        id: 't1',
        tipo: 'trigger',
        x: 40,
        y: 120,
        dados: { evento: 'message', palavras: [], qualquer: true },
      },
      {
        id: 'm1',
        tipo: 'mensagem',
        x: 320,
        y: 120,
        dados: { texto: 'Olá! Como posso ajudar?', quick_replies: [], botoes: [] },
      },
    ],
    arestas: entrada.arestas || [
      { id: 'e1', de: 't1', para: 'm1', handle: 'default' },
    ],
  });
  escreverJsonAtomico(caminhoFluxo(fluxo.id), fluxo);
  return fluxo;
}

function atualizarFluxo(id, entrada) {
  const atual = obterFluxo(id);
  return salvarFluxo({ ...atual, ...entrada, id: atual.id, criado_em: atual.criado_em }, atual.id);
}

function excluirFluxo(id) {
  const arquivo = caminhoFluxo(id);
  if (!fs.existsSync(arquivo)) {
    const err = new Error('Fluxo não encontrado.');
    err.status = 404;
    err.codigo = 'fluxo_nao_encontrado';
    throw err;
  }
  fs.unlinkSync(arquivo);
  return { ok: true, id };
}

/**
 * Ativa um fluxo. Desativa outros defaults do mesmo tipo de evento
 * (ex.: dois "qualquer mensagem" ou dois "qualquer comentário").
 */
function ativarFluxo(id) {
  const alvo = obterFluxo(id);
  const trigger = (alvo.nos || []).find((n) => n.tipo === 'trigger');
  const eventoAlvo = String(trigger?.dados?.evento || 'message');
  const ehDefault = Boolean(trigger?.dados?.qualquer) || !(trigger?.dados?.palavras || []).length;

  for (const f of listarFluxos()) {
    if (f.id === alvo.id) continue;
    if (!f.ativo) continue;
    if (!ehDefault) continue;
    const t = (f.nos || []).find((n) => n.tipo === 'trigger');
    const eventoOutro = String(t?.dados?.evento || 'message');
    if (eventoOutro !== eventoAlvo) continue;
    const outroDefault = Boolean(t?.dados?.qualquer) || !(t?.dados?.palavras || []).length;
    if (outroDefault) {
      salvarFluxo({ ...f, ativo: false }, f.id);
    }
  }

  return salvarFluxo({ ...alvo, ativo: true }, alvo.id);
}

function caminhoConversa(igsid) {
  const seguro = String(igsid || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!seguro) throw Object.assign(new Error('IGSID inválido.'), { status: 400 });
  return abs(path.join(PASTA_CONVERSAS, `${seguro}.json`));
}

function obterConversa(igsid) {
  garantirPastas();
  return lerJson(caminhoConversa(igsid), null);
}

function salvarConversa(igsid, dados) {
  garantirPastas();
  const atual = obterConversa(igsid) || {
    igsid: String(igsid),
    fluxo_id: null,
    no_atual: null,
    tags: [],
    ultimo_mid: null,
    janela_ate: null,
    wake_at: null,
    aguardando: false,
    criado_em: new Date().toISOString(),
  };
  const proximo = {
    ...atual,
    ...dados,
    igsid: String(igsid),
    atualizado_em: new Date().toISOString(),
  };
  escreverJsonAtomico(caminhoConversa(igsid), proximo);
  return proximo;
}

function listarConversas(limite = 50) {
  garantirPastas();
  const dir = abs(PASTA_CONVERSAS);
  const nomes = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  return nomes
    .map((nome) => lerJson(path.join(dir, nome), null))
    .filter(Boolean)
    .sort((a, b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')))
    .slice(0, Math.max(1, Math.min(200, Number(limite) || 50)));
}

function listarConversasComWake() {
  return listarConversas(500).filter((c) => c.wake_at && Date.parse(c.wake_at) <= Date.now());
}

function midJaProcessado(mid) {
  if (!mid) return false;
  const seguro = String(mid).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
  return fs.existsSync(abs(path.join(PASTA_EVENTOS, `${seguro}.json`)));
}

function registrarEvento(mid, payload) {
  garantirPastas();
  const seguro = String(mid || `evt-${Date.now()}`).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
  const arquivo = abs(path.join(PASTA_EVENTOS, `${seguro}.json`));
  escreverJsonAtomico(arquivo, {
    mid: mid || null,
    recebido_em: new Date().toISOString(),
    payload,
  });
  // Mantém só os 200 eventos mais recentes.
  const dir = abs(PASTA_EVENTOS);
  const nomes = fs.readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const item of nomes.slice(200)) {
    try { fs.unlinkSync(path.join(dir, item.n)); } catch { /* ignore */ }
  }
}

function listarEventos(limite = 30) {
  garantirPastas();
  const dir = abs(PASTA_EVENTOS);
  const nomes = fs.readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, Math.max(1, Math.min(100, Number(limite) || 30)));
  return nomes.map((item) => lerJson(path.join(dir, item.n), null)).filter(Boolean);
}

module.exports = {
  CAMPOS_PADRAO,
  resolveVerifyToken,
  lerConfig,
  salvarConfig,
  gerarHash,
  callbackUrl,
  obterConfigPublica,
  listarFluxos,
  obterFluxo,
  criarFluxo,
  atualizarFluxo,
  excluirFluxo,
  ativarFluxo,
  obterConversa,
  salvarConversa,
  listarConversas,
  listarConversasComWake,
  midJaProcessado,
  registrarEvento,
  listarEventos,
  novoId,
};
