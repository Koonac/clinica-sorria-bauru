/**
 * Cliente do backend Laravel (CRM): fatia o backend.service no domínio /api/v1/crm.
 */
const backend = require('./backend.service');

const ROTULO = 'Backend do CRM';

/** Encaminha uma requisição para /api/v1/crm/<caminho> no backend. */
function encaminhar(opcoes) {
  return backend.encaminhar({ ...opcoes, dominio: 'crm', rotulo: ROTULO });
}

module.exports = { configurado: backend.configurado, encaminhar };
