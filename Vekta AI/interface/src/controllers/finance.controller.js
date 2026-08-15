/**
 * Endpoints HTTP da aba Financeiro: proxy fino para o backend Laravel (/api/v1/finance).
 */
const financeService = require('../services/finance.service');
const { criarProxy } = require('./backend-proxy');

const { proxy, status } = criarProxy(financeService, 'finance');

module.exports = {
  status,

  listarContas: proxy('GET', () => 'accounts'),
  criarConta: proxy('POST', () => 'accounts'),
  atualizarConta: proxy('PATCH', (req) => `accounts/${encodeURIComponent(req.params.id)}`),
  excluirConta: proxy('DELETE', (req) => `accounts/${encodeURIComponent(req.params.id)}`),

  listarLancamentos: proxy('GET', () => 'entries'),
  criarLancamento: proxy('POST', () => 'entries'),
  obterLancamento: proxy('GET', (req) => `entries/${encodeURIComponent(req.params.id)}`),
  atualizarLancamento: proxy('PATCH', (req) => `entries/${encodeURIComponent(req.params.id)}`),
  excluirLancamento: proxy('DELETE', (req) => `entries/${encodeURIComponent(req.params.id)}`),
  baixarLancamento: proxy('POST', (req) => `entries/${encodeURIComponent(req.params.id)}/settle`),
  estornarLancamento: proxy(
    'DELETE',
    (req) => `entries/${encodeURIComponent(req.params.id)}/settle`,
  ),

  overview: proxy('GET', () => 'stats/overview'),
};
