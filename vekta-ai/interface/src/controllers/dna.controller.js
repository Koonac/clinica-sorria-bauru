/**
 * Leitura e edição dos arquivos canônicos do .dna da empresa.
 */
const { RAIZ } = require('../config');
const fsService = require('../services/fs.service');

function obterDna(_req, res) {
  res.json(fsService.lerDna(RAIZ));
}

function salvarDna(req, res) {
  try {
    fsService.salvarDna(RAIZ, req.params.nome, String(req.body.conteudo ?? ''));
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
}

module.exports = { obterDna, salvarDna };
