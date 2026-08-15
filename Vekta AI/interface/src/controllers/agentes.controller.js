/**
 * Página Agents: lista os agents do Vekta Ai (.claude/agents/).
 */
const { RAIZ } = require('../config');
const agentesService = require('../services/agentes.service');

function agentes(_req, res) {
  res.json({ itens: agentesService.listarAgentes(RAIZ) });
}

module.exports = { agentes };
