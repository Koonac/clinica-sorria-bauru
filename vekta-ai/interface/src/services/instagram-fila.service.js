/**
 * Fila de agendamentos Instagram em disco (materiais/instagram/).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RAIZ } = require('../config');

const PASTA_REL = path.join('materiais', 'instagram');
const PASTA_MIDIAS = path.join(PASTA_REL, 'midias');
const PASTA_LOGS = path.join(PASTA_REL, 'logs');
const ARQUIVO_FILA = path.join(PASTA_REL, 'fila.json');

const TIPOS = new Set(['IMAGE', 'REELS', 'STORIES', 'CAROUSEL']);
const STATUS = new Set(['pendente', 'publicando', 'erro']);
const MAX_TENTATIVAS = 3;
const CAROUSEL_MIN = 2;
const CAROUSEL_MAX = 10;

const EXT_POR_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
};

function abs(rel) {
  return path.join(RAIZ, rel);
}

function garantirPastas() {
  fs.mkdirSync(abs(PASTA_MIDIAS), { recursive: true });
  fs.mkdirSync(abs(PASTA_LOGS), { recursive: true });
}

function lerFila() {
  garantirPastas();
  const arquivo = abs(ARQUIVO_FILA);
  if (!fs.existsSync(arquivo)) return [];
  try {
    const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function escreverFila(itens) {
  garantirPastas();
  const arquivo = abs(ARQUIVO_FILA);
  const tmp = `${arquivo}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(itens, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function novoId() {
  const agora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = [
    agora.getUTCFullYear(),
    p(agora.getUTCMonth() + 1),
    p(agora.getUTCDate()),
    p(agora.getUTCHours()),
    p(agora.getUTCMinutes()),
  ].join('');
  return `ig-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function extensaoDe(mediaType, nome) {
  const doMime = EXT_POR_MIME[String(mediaType || '').toLowerCase()];
  if (doMime) return doMime;
  const ext = path.extname(String(nome || '')).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.mp4', '.mov'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  return '.bin';
}

function mimeOkParaTipo(tipo, mediaType) {
  const mime = String(mediaType || '').toLowerCase();
  const ehImagem = mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png';
  const ehVideo = mime === 'video/mp4' || mime === 'video/quicktime';
  if (tipo === 'IMAGE' || tipo === 'CAROUSEL') return ehImagem;
  if (tipo === 'REELS') return ehVideo;
  if (tipo === 'STORIES') return ehImagem || ehVideo;
  return false;
}

function decodificarBase64(dataBase64) {
  let bytes;
  try {
    bytes = Buffer.from(String(dataBase64 || ''), 'base64');
  } catch {
    bytes = null;
  }
  if (!bytes || !bytes.length) {
    const err = new Error('Arquivo de mídia inválido ou vazio.');
    err.codigo = 'validacao';
    err.status = 400;
    throw err;
  }
  return bytes;
}

function gravarMidia(id, indice, mediaType, nome, dataBase64) {
  const bytes = decodificarBase64(dataBase64);
  const ext = extensaoDe(mediaType, nome);
  const sufixo = indice == null ? '' : `-${indice}`;
  const relArquivo = path.join(PASTA_MIDIAS, `${id}${sufixo}${ext}`).replace(/\\/g, '/');
  fs.writeFileSync(abs(relArquivo), bytes);
  return {
    arquivo: relArquivo,
    media_type: String(mediaType || ''),
    nome_original: nome ? String(nome).slice(0, 120) : null,
  };
}

/**
 * Salva bytes da mídia e adiciona item à fila.
 * @param {{
 *   tipo: string,
 *   legenda?: string,
 *   agendado_para: string,
 *   nome?: string,
 *   mediaType?: string,
 *   dataBase64?: string,
 *   arquivos?: Array<{ nome?: string, mediaType?: string, media_type?: string, data: string }>
 * }} entrada
 */
function enfileirar(entrada) {
  const tipo = String(entrada.tipo || '').toUpperCase();
  if (!TIPOS.has(tipo)) {
    const err = new Error('Tipo inválido. Use IMAGE, REELS, STORIES ou CAROUSEL.');
    err.codigo = 'validacao';
    err.status = 400;
    throw err;
  }

  const agendado = Date.parse(entrada.agendado_para);
  if (!Number.isFinite(agendado)) {
    const err = new Error('agendado_para deve ser uma data ISO válida (UTC).');
    err.codigo = 'validacao';
    err.status = 400;
    throw err;
  }

  garantirPastas();
  const id = novoId();
  let arquivosGravados = [];

  if (tipo === 'CAROUSEL') {
    const lista = Array.isArray(entrada.arquivos) ? entrada.arquivos : [];
    if (lista.length < CAROUSEL_MIN || lista.length > CAROUSEL_MAX) {
      const err = new Error(
        `Carrossel exige entre ${CAROUSEL_MIN} e ${CAROUSEL_MAX} imagens.`
      );
      err.codigo = 'validacao';
      err.status = 400;
      throw err;
    }
    lista.forEach((arq, i) => {
      const mediaType = arq.mediaType || arq.media_type;
      if (!mimeOkParaTipo('CAROUSEL', mediaType)) {
        const err = new Error(
          `Item ${i + 1} do carrossel: use JPEG ou PNG.`
        );
        err.codigo = 'validacao';
        err.status = 400;
        throw err;
      }
      arquivosGravados.push(
        gravarMidia(id, i + 1, mediaType, arq.nome, arq.data)
      );
    });
  } else {
    if (!mimeOkParaTipo(tipo, entrada.mediaType)) {
      const msgs = {
        IMAGE: 'Post de imagem exige JPEG ou PNG.',
        REELS: 'Reels exige vídeo MP4 ou MOV.',
        STORIES: 'Story exige imagem (JPEG/PNG) ou vídeo (MP4/MOV).',
      };
      const err = new Error(msgs[tipo] || 'Tipo de arquivo inválido para este formato.');
      err.codigo = 'validacao';
      err.status = 400;
      throw err;
    }
    arquivosGravados.push(
      gravarMidia(id, null, entrada.mediaType, entrada.nome, entrada.dataBase64)
    );
  }

  const primeiro = arquivosGravados[0];
  const item = {
    id,
    tipo,
    legenda: String(entrada.legenda || '').slice(0, 2200),
    arquivo: primeiro.arquivo,
    media_type: primeiro.media_type,
    nome_original: primeiro.nome_original,
    arquivos: arquivosGravados,
    agendado_para: new Date(agendado).toISOString(),
    status: 'pendente',
    tentativas: 0,
    ultimo_erro: null,
    criado_em: new Date().toISOString(),
  };

  const filaAtual = lerFila();
  filaAtual.push(item);
  escreverFila(filaAtual);
  return item;
}

function obterPorId(id) {
  return lerFila().find((i) => i.id === id) || null;
}

function atualizarItem(id, patch) {
  const fila = lerFila();
  const idx = fila.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  fila[idx] = { ...fila[idx], ...patch };
  escreverFila(fila);
  return fila[idx];
}

function removerDaFila(id) {
  const fila = lerFila();
  const item = fila.find((i) => i.id === id);
  if (!item) return null;
  escreverFila(fila.filter((i) => i.id !== id));
  return item;
}

function apagarArquivoMidia(arquivoRel) {
  if (!arquivoRel) return false;
  const alvo = path.resolve(abs(arquivoRel));
  const raizMidias = path.resolve(abs(PASTA_MIDIAS));
  const prefixo = raizMidias.endsWith(path.sep) ? raizMidias : raizMidias + path.sep;
  if (!alvo.toLowerCase().startsWith(prefixo.toLowerCase())) return false;
  try {
    if (fs.existsSync(alvo)) {
      fs.unlinkSync(alvo);
      return true;
    }
  } catch (erro) {
    console.warn('[instagram-fila] falha ao apagar mídia:', erro.message);
  }
  return false;
}

function apagarMidiasDoItem(item) {
  if (!item) return;
  const vistos = new Set();
  const lista = Array.isArray(item.arquivos) ? item.arquivos : [];
  for (const arq of lista) {
    if (arq?.arquivo && !vistos.has(arq.arquivo)) {
      vistos.add(arq.arquivo);
      apagarArquivoMidia(arq.arquivo);
    }
  }
  if (item.arquivo && !vistos.has(item.arquivo)) {
    apagarArquivoMidia(item.arquivo);
  }
}

/**
 * Cancela item pendente/erro: remove da fila e apaga mídia.
 * Não cancela se estiver publicando.
 */
function cancelar(id) {
  const item = obterPorId(id);
  if (!item) {
    const err = new Error('Agendamento não encontrado.');
    err.codigo = 'nao_encontrado';
    err.status = 404;
    throw err;
  }
  if (item.status === 'publicando') {
    const err = new Error('Não é possível cancelar enquanto está publicando.');
    err.codigo = 'conflito';
    err.status = 409;
    throw err;
  }
  removerDaFila(id);
  apagarMidiasDoItem(item);
  return { id, cancelado: true };
}

function gravarLog(log) {
  garantirPastas();
  const arquivo = abs(path.join(PASTA_LOGS, `${log.id}.json`));
  fs.writeFileSync(arquivo, JSON.stringify(log, null, 2), 'utf8');
  return log;
}

function listarLogs(limite = 50) {
  garantirPastas();
  const pasta = abs(PASTA_LOGS);
  const arquivos = fs
    .readdirSync(pasta)
    .filter((n) => n.endsWith('.json'))
    .map((n) => {
      const absPath = path.join(pasta, n);
      return { nome: n, mtime: fs.statSync(absPath).mtimeMs, absPath };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limite);

  const logs = [];
  for (const arq of arquivos) {
    try {
      logs.push(JSON.parse(fs.readFileSync(arq.absPath, 'utf8')));
    } catch {
      /* ignora log corrompido */
    }
  }
  return logs;
}

function listarDevidos(agora = new Date()) {
  const ts = agora.getTime();
  return lerFila().filter(
    (i) =>
      i.status === 'pendente' &&
      Date.parse(i.agendado_para) <= ts &&
      (i.tentativas || 0) < MAX_TENTATIVAS
  );
}

/** Itens travados em publicando há mais de N ms voltam a pendente (crash mid-flight). */
function recuperarTravados(maxMs = 15 * 60 * 1000) {
  const agora = Date.now();
  const fila = lerFila();
  let mudou = false;
  for (const item of fila) {
    if (item.status !== 'publicando') continue;
    const desde = Date.parse(item.publicando_desde || item.criado_em || 0);
    if (!Number.isFinite(desde) || agora - desde > maxMs) {
      item.status = 'pendente';
      item.publicando_desde = null;
      item.ultimo_erro = item.ultimo_erro || 'Recuperado após publish interrompido.';
      mudou = true;
    }
  }
  if (mudou) escreverFila(fila);
}

module.exports = {
  TIPOS,
  STATUS,
  MAX_TENTATIVAS,
  PASTA_REL,
  PASTA_MIDIAS,
  PASTA_LOGS,
  ARQUIVO_FILA,
  garantirPastas,
  lerFila,
  escreverFila,
  enfileirar,
  obterPorId,
  atualizarItem,
  removerDaFila,
  apagarArquivoMidia,
  apagarMidiasDoItem,
  cancelar,
  gravarLog,
  listarLogs,
  listarDevidos,
  recuperarTravados,
  abs,
  CAROUSEL_MIN,
  CAROUSEL_MAX,
};
