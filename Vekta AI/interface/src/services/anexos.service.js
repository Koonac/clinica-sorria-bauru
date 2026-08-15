/**
 * Persistência em disco dos anexos enviados pelo chat.
 *
 * Sem isso, a imagem só existe como base64 na mensagem multimodal — o Claude
 * enxerga, mas não tem um path real para copiar/salvar quando o usuário pede
 * "baixa essa imagem" / "salva em materiais/…".
 *
 * Destino padrão: materiais/anexos/<timestamp>-<seq>-<nome-sanitizado>.
 */
const fs = require('fs');
const path = require('path');

const PASTA_ANEXOS = path.join('materiais', 'anexos');

const EXT_POR_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

function extensaoDe(mediaType, nome) {
  const doMime = EXT_POR_MIME[mediaType];
  if (doMime) return doMime;
  const ext = path.extname(String(nome || '')).toLowerCase();
  return ext || '.bin';
}

/** Nome seguro para disco: só basename, sem path traversal, ASCII-ish. */
function sanitizarNome(nome, mediaType) {
  const base = path.basename(String(nome || 'anexo')).replace(/[^\w.\-()+ ]+/g, '_').trim();
  const semExt = base.replace(/\.[^.]+$/, '') || 'anexo';
  const limpo = semExt.slice(0, 80) || 'anexo';
  return `${limpo}${extensaoDe(mediaType, nome)}`;
}

function timestampArquivo(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return [
    agora.getFullYear(),
    p(agora.getMonth() + 1),
    p(agora.getDate()),
    '-',
    p(agora.getHours()),
    p(agora.getMinutes()),
    p(agora.getSeconds()),
    p(agora.getMilliseconds()),
  ].join('');
}

/**
 * Grava um anexo base64 em materiais/anexos/ e devolve o caminho relativo à raiz.
 * @param {string} raiz
 * @param {object} anexo
 * @param {number} [indice=0] índice na lista do mesmo envio (evita colisão de nome)
 * @returns {{ caminho: string, nome: string, categoria: string } | null}
 */
function salvarAnexo(raiz, anexo, indice = 0) {
  if (!anexo || anexo.sourceType !== 'base64' || typeof anexo.data !== 'string') return null;
  if (anexo.categoria !== 'imagem' && anexo.categoria !== 'pdf') return null;

  let bytes;
  try {
    bytes = Buffer.from(anexo.data, 'base64');
  } catch {
    return null;
  }
  if (!bytes.length) return null;

  const pasta = path.join(raiz, PASTA_ANEXOS);
  fs.mkdirSync(pasta, { recursive: true });

  const seq = String(indice).padStart(2, '0');
  const arquivo = `${timestampArquivo()}-${seq}-${sanitizarNome(anexo.nome, anexo.mediaType)}`;
  const absoluto = path.join(pasta, arquivo);
  fs.writeFileSync(absoluto, bytes);

  return {
    caminho: path.join(PASTA_ANEXOS, arquivo).replace(/\\/g, '/'),
    nome: anexo.nome || arquivo,
    categoria: anexo.categoria,
  };
}

/**
 * Persiste todos os anexos binários válidos. Falhas individuais são ignoradas
 * (a mensagem multimodal segue; só perde o path em disco).
 */
function salvarAnexos(raiz, anexos) {
  if (!Array.isArray(anexos) || anexos.length === 0) return [];
  const salvos = [];
  anexos.forEach((anexo, indice) => {
    try {
      const salvo = salvarAnexo(raiz, anexo, indice);
      if (salvo) salvos.push(salvo);
    } catch (erro) {
      console.error('[anexos] falha ao gravar anexo:', erro.message);
    }
  });
  return salvos;
}

/** Bloco de texto anexado à mensagem do CLI (não aparece no balão da UI). */
function notaParaClaude(salvos) {
  if (!salvos.length) return '';
  const n = salvos.length;
  const linhas = salvos.map((s) => `- ${s.caminho}${s.nome ? ` (nome original: ${s.nome})` : ''}`);
  const verbo = n === 1
    ? 'use a skill /salvar-imagem se o usuário pedir para salvar, baixar ou mover a imagem'
    : `há ${n} anexos — se o usuário pedir para salvar/baixar, processe TODOS com /salvar-imagem (ou emita um único vekta-arquivo com o array "arquivos")`;
  return [
    `[Anexos disponíveis em disco — ${verbo}]`,
    ...linhas,
  ].join('\n');
}

module.exports = {
  PASTA_ANEXOS,
  salvarAnexo,
  salvarAnexos,
  notaParaClaude,
};
