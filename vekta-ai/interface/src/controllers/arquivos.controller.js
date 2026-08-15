/**
 * Acesso a arquivos do projeto: leitura de mídia/previews (/raw), preview de
 * texto, exclusão e o atalho de abrir a pasta do arquivo no Explorer.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { RAIZ } = require('../config');
const fsService = require('../services/fs.service');

const { RAIZES_NAO_SERVIVEIS } = fsService;

function caminhoPermitido(relativo) {
  if (!relativo || relativo.includes('..')) return false;
  const [primeira] = relativo.split('/');
  return !RAIZES_NAO_SERVIVEIS.has(primeira);
}

/** Nome seguro para Content-Disposition (ASCII + UTF-8 filename*). */
function nomeParaDownload(relativo) {
  const base = path.basename(String(relativo || 'arquivo')).replace(/[\r\n"]/g, '_');
  return base || 'arquivo';
}

function servirRaw(req, res) {
  const relativo = decodeURIComponent(req.params[0]).split('\\').join('/');
  if (!caminhoPermitido(relativo)) {
    return res.status(403).json({ erro: 'Pasta não exposta pela interface.' });
  }
  let absoluto;
  try {
    absoluto = fsService.resolverSeguro(RAIZ, relativo);
  } catch {
    return res.status(400).json({ erro: 'Caminho inválido.' });
  }
  if (!fs.existsSync(absoluto) || !fs.statSync(absoluto).isFile()) {
    return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  }
  // Evita o browser manter preview antigo após troca/exclusão no mesmo caminho.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  // Com ?download=1 (ou atributo download no <a>), força anexo em vez de inline.
  if (req.query.download !== undefined) {
    const nome = nomeParaDownload(relativo);
    const ascii = nome.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    );
  }
  res.sendFile(absoluto);
}

function lerArquivo(req, res) {
  try {
    const relativo = String(req.query.caminho || '');
    if (!caminhoPermitido(relativo)) {
      return res.status(403).json({ erro: 'Pasta não exposta pela interface.' });
    }
    res.json({ conteudo: fsService.lerArquivoTexto(RAIZ, relativo) });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
}

function salvarArquivo(req, res) {
  try {
    const relativo = String(req.body.caminho || '');
    if (!caminhoPermitido(relativo)) {
      return res.status(403).json({ erro: 'Pasta não exposta pela interface.' });
    }
    const resultado = fsService.salvarArquivoTexto(RAIZ, relativo, req.body.conteudo);
    res.json({ ok: true, ...resultado });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
}

function excluirArquivo(req, res) {
  try {
    const relativo = String(req.query.caminho || req.body?.caminho || '');
    if (!caminhoPermitido(relativo)) {
      return res.status(403).json({ erro: 'Pasta não exposta pela interface.' });
    }
    res.json(fsService.excluirArquivo(RAIZ, relativo));
  } catch (erro) {
    const status = /não encontrado/i.test(erro.message || '') ? 404 : 400;
    res.status(status).json({ erro: erro.message });
  }
}

// Abre a pasta do arquivo no Explorer (conveniência local, Windows)
function revelar(req, res) {
  try {
    const relativo = String(req.body.caminho || '');
    if (!caminhoPermitido(relativo)) {
      return res.status(403).json({ erro: 'Pasta não exposta pela interface.' });
    }
    const absoluto = fsService.resolverSeguro(RAIZ, relativo);
    if (process.platform === 'win32') {
      spawn('explorer', ['/select,', absoluto], { detached: true, stdio: 'ignore' }).unref();
    }
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
}

module.exports = { servirRaw, lerArquivo, salvarArquivo, excluirArquivo, revelar };
