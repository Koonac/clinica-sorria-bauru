/**
 * Endpoints HTTP da aba CRM: proxy fino para o backend Laravel (/api/v1/crm).
 */
const crmService = require('../services/crm.service');
const { criarProxy } = require('./backend-proxy');

const { proxy, status } = criarProxy(crmService, 'crm');

module.exports = {
  status,

  listarLeads: proxy('GET', () => 'leads'),
  criarLead: proxy('POST', () => 'leads'),
  obterLead: proxy('GET', (req) => `leads/${encodeURIComponent(req.params.id)}`),
  atualizarLead: proxy('PATCH', (req) => `leads/${encodeURIComponent(req.params.id)}`),
  excluirLead: proxy('DELETE', (req) => `leads/${encodeURIComponent(req.params.id)}`),
  converterLead: proxy('POST', (req) => `leads/${encodeURIComponent(req.params.id)}/convert`),
  moverLead: proxy('POST', (req) => `leads/${encodeURIComponent(req.params.id)}/move`),
  retomarAgentLead: proxy('POST', (req) => `leads/${encodeURIComponent(req.params.id)}/agent/resume`),
  pausarAgentLead: proxy('POST', (req) => `leads/${encodeURIComponent(req.params.id)}/agent/pause`),

  listarAgents: proxy('GET', () => 'agents'),
  criarAgent: proxy('POST', () => 'agents'),
  obterAgent: proxy('GET', (req) => `agents/${encodeURIComponent(req.params.id)}`),
  atualizarAgent: proxy('PATCH', (req) => `agents/${encodeURIComponent(req.params.id)}`),
  excluirAgent: proxy('DELETE', (req) => `agents/${encodeURIComponent(req.params.id)}`),
  ativarAgent: proxy('POST', (req) => `agents/${encodeURIComponent(req.params.id)}/activate`),
  desativarAgent: proxy('POST', (req) => `agents/${encodeURIComponent(req.params.id)}/deactivate`),

  listarDeals: proxy('GET', () => 'deals'),
  criarDeal: proxy('POST', () => 'deals'),
  obterDeal: proxy('GET', (req) => `deals/${encodeURIComponent(req.params.id)}`),
  atualizarDeal: proxy('PATCH', (req) => `deals/${encodeURIComponent(req.params.id)}`),
  excluirDeal: proxy('DELETE', (req) => `deals/${encodeURIComponent(req.params.id)}`),

  pipeline: proxy('GET', () => 'pipeline'),
  estagios: proxy('GET', () => 'pipeline-stages'),
  criarEstagio: proxy('POST', () => 'pipeline-stages'),
  atualizarEstagio: proxy('PATCH', (req) => `pipeline-stages/${encodeURIComponent(req.params.id)}`),
  excluirEstagio: proxy('DELETE', (req) => `pipeline-stages/${encodeURIComponent(req.params.id)}`),
  ordenarEstagios: proxy('PATCH', () => 'pipeline-stages/order'),
  origens: proxy('GET', () => 'sources'),

  listarActivities: proxy('GET', () => 'activities'),
  criarActivity: proxy('POST', () => 'activities'),

  listarTasks: proxy('GET', () => 'tasks'),
  criarTask: proxy('POST', () => 'tasks'),
  atualizarTask: proxy('PATCH', (req) => `tasks/${encodeURIComponent(req.params.id)}`),
  excluirTask: proxy('DELETE', (req) => `tasks/${encodeURIComponent(req.params.id)}`),

  leadsPorDia: proxy('GET', () => 'stats/leads-por-dia'),

  listarContatos: proxy('GET', () => 'contacts'),
  listarOrganizacoes: proxy('GET', () => 'organizations'),
  criarOrganizacao: proxy('POST', () => 'organizations'),

  whatsappStatus: proxy('GET', () => 'whatsapp'),
  whatsappCredentials: proxy('PUT', () => 'whatsapp/credentials'),
  whatsappSettings: proxy('PUT', () => 'whatsapp/settings'),
  whatsappConnect: proxy('POST', () => 'whatsapp/connect'),
  whatsappQrcode: proxy('GET', () => 'whatsapp/qrcode'),
  whatsappSyncStatus: proxy('GET', () => 'whatsapp/status'),
  whatsappDisconnect: proxy('DELETE', () => 'whatsapp/disconnect'),
  whatsappChats: proxy('GET', () => 'whatsapp/chats'),
  whatsappMessages: proxy('GET', () => 'whatsapp/messages'),
  whatsappSend: proxy('POST', () => 'whatsapp/send'),

  listarCampanhas: proxy('GET', () => 'campaigns'),
  criarCampanha: proxy('POST', () => 'campaigns'),
  obterCampanha: proxy('GET', (req) => `campaigns/${encodeURIComponent(req.params.id)}`),
  atualizarCampanha: proxy('PATCH', (req) => `campaigns/${encodeURIComponent(req.params.id)}`),
  importarCsvCampanha: proxy('POST', (req) => `campaigns/${encodeURIComponent(req.params.id)}/import-csv`, 200),
  criarDestinatarioCampanha: proxy('POST', (req) => `campaigns/${encodeURIComponent(req.params.id)}/recipients`),
  atualizarDestinatarioCampanha: proxy(
    'PATCH',
    (req) => `campaigns/${encodeURIComponent(req.params.id)}/recipients/${encodeURIComponent(req.params.recipientId)}`,
  ),
  aplicarPadraoDestinatario: proxy(
    'POST',
    (req) => `campaigns/${encodeURIComponent(req.params.id)}/recipients/${encodeURIComponent(req.params.recipientId)}/apply-default`,
    200,
  ),
  modelosOpenrouterCampanha: proxy('GET', () => 'campaigns/openrouter-models'),
  gerarMensagensCampanha: proxy(
    'POST',
    (req) => `campaigns/${encodeURIComponent(req.params.id)}/generate-messages`,
    200,
  ),
  iniciarCampanha: proxy('POST', (req) => `campaigns/${encodeURIComponent(req.params.id)}/start`, 200),
  pausarCampanha: proxy('POST', (req) => `campaigns/${encodeURIComponent(req.params.id)}/pause`, 200),
  cancelarCampanha: proxy('POST', (req) => `campaigns/${encodeURIComponent(req.params.id)}/cancel`, 200),
};
