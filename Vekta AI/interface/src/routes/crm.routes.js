const express = require('express');
const crmController = require('../controllers/crm.controller');

const router = express.Router();

router.get('/api/crm/status', crmController.status);

router.get('/api/crm/leads', crmController.listarLeads);
router.post('/api/crm/leads', crmController.criarLead);
router.get('/api/crm/leads/:id', crmController.obterLead);
router.patch('/api/crm/leads/:id', crmController.atualizarLead);
router.delete('/api/crm/leads/:id', crmController.excluirLead);
router.post('/api/crm/leads/:id/convert', crmController.converterLead);
router.post('/api/crm/leads/:id/move', crmController.moverLead);
router.post('/api/crm/leads/:id/agent/resume', crmController.retomarAgentLead);
router.post('/api/crm/leads/:id/agent/pause', crmController.pausarAgentLead);

router.get('/api/crm/agents', crmController.listarAgents);
router.post('/api/crm/agents', crmController.criarAgent);
router.get('/api/crm/agents/:id', crmController.obterAgent);
router.patch('/api/crm/agents/:id', crmController.atualizarAgent);
router.delete('/api/crm/agents/:id', crmController.excluirAgent);
router.post('/api/crm/agents/:id/activate', crmController.ativarAgent);
router.post('/api/crm/agents/:id/deactivate', crmController.desativarAgent);

router.get('/api/crm/deals', crmController.listarDeals);
router.post('/api/crm/deals', crmController.criarDeal);
router.get('/api/crm/deals/:id', crmController.obterDeal);
router.patch('/api/crm/deals/:id', crmController.atualizarDeal);
router.delete('/api/crm/deals/:id', crmController.excluirDeal);

router.get('/api/crm/pipeline', crmController.pipeline);
router.get('/api/crm/pipeline-stages', crmController.estagios);
router.post('/api/crm/pipeline-stages', crmController.criarEstagio);
router.patch('/api/crm/pipeline-stages/order', crmController.ordenarEstagios);
router.patch('/api/crm/pipeline-stages/:id', crmController.atualizarEstagio);
router.delete('/api/crm/pipeline-stages/:id', crmController.excluirEstagio);
router.get('/api/crm/sources', crmController.origens);

router.get('/api/crm/activities', crmController.listarActivities);
router.post('/api/crm/activities', crmController.criarActivity);

router.get('/api/crm/tasks', crmController.listarTasks);
router.post('/api/crm/tasks', crmController.criarTask);
router.patch('/api/crm/tasks/:id', crmController.atualizarTask);
router.delete('/api/crm/tasks/:id', crmController.excluirTask);

router.get('/api/crm/stats/leads-por-dia', crmController.leadsPorDia);

router.get('/api/crm/contacts', crmController.listarContatos);
router.get('/api/crm/organizations', crmController.listarOrganizacoes);
router.post('/api/crm/organizations', crmController.criarOrganizacao);

router.get('/api/crm/whatsapp', crmController.whatsappStatus);
router.put('/api/crm/whatsapp/credentials', crmController.whatsappCredentials);
router.put('/api/crm/whatsapp/settings', crmController.whatsappSettings);
router.post('/api/crm/whatsapp/connect', crmController.whatsappConnect);
router.get('/api/crm/whatsapp/qrcode', crmController.whatsappQrcode);
router.get('/api/crm/whatsapp/status', crmController.whatsappSyncStatus);
router.delete('/api/crm/whatsapp/disconnect', crmController.whatsappDisconnect);
router.get('/api/crm/whatsapp/chats', crmController.whatsappChats);
router.get('/api/crm/whatsapp/messages', crmController.whatsappMessages);
router.post('/api/crm/whatsapp/send', crmController.whatsappSend);

router.get('/api/crm/campaigns/openrouter-models', crmController.modelosOpenrouterCampanha);
router.get('/api/crm/campaigns', crmController.listarCampanhas);
router.post('/api/crm/campaigns', crmController.criarCampanha);
router.get('/api/crm/campaigns/:id', crmController.obterCampanha);
router.patch('/api/crm/campaigns/:id', crmController.atualizarCampanha);
router.post('/api/crm/campaigns/:id/import-csv', crmController.importarCsvCampanha);
router.post('/api/crm/campaigns/:id/recipients', crmController.criarDestinatarioCampanha);
router.patch(
  '/api/crm/campaigns/:id/recipients/:recipientId',
  crmController.atualizarDestinatarioCampanha,
);
router.post(
  '/api/crm/campaigns/:id/recipients/:recipientId/apply-default',
  crmController.aplicarPadraoDestinatario,
);
router.post('/api/crm/campaigns/:id/generate-messages', crmController.gerarMensagensCampanha);
router.post('/api/crm/campaigns/:id/start', crmController.iniciarCampanha);
router.post('/api/crm/campaigns/:id/pause', crmController.pausarCampanha);
router.post('/api/crm/campaigns/:id/cancel', crmController.cancelarCampanha);

module.exports = router;
