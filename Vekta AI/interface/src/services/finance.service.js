/**
 * Cliente do backend Laravel (Financeiro): fatia o backend.service no domínio /api/v1/finance.
 */
const backend = require('./backend.service');

const ROTULO = 'Backend do financeiro';

/** Encaminha uma requisição para /api/v1/finance/<caminho> no backend. */
function encaminhar(opcoes) {
  return backend.encaminhar({ ...opcoes, dominio: 'finance', rotulo: ROTULO });
}

module.exports = { configurado: backend.configurado, encaminhar };
