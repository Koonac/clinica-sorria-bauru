/**
 * Listagem e exclusão das sessões recentes do Claude CLI neste projeto
 * (histórico do chat).
 */
const { RAIZ } = require('../config');
const sessoesService = require('../services/sessoes.service');

function listarSessoes(_req, res) {
  try {
    const sessoes = sessoesService.listarSessoes(RAIZ, { limite: sessoesService.LIMITE_PADRAO });
    res.json({ sessoes });
  } catch (erro) {
    res.status(500).json({ erro: erro.message || 'Falha ao listar sessões.' });
  }
}

function excluirSessao(req, res) {
  try {
    const resultado = sessoesService.excluirSessao(RAIZ, req.params.id);
    res.json(resultado);
  } catch (erro) {
    const msg = erro.message || 'Falha ao excluir sessão.';
    const status = /não encontrada/i.test(msg) ? 404 : 500;
    res.status(status).json({ erro: msg });
  }
}

module.exports = { listarSessoes, excluirSessao };
