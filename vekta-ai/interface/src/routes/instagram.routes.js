const express = require('express');
const instagramController = require('../controllers/instagram.controller');

const router = express.Router();

router.get('/api/instagram/status', instagramController.status);
router.get('/api/instagram/perfil', instagramController.perfil);
router.get('/api/instagram/metricas', instagramController.metricas);

router.get('/api/instagram/agendamentos', instagramController.listarAgendamentos);
router.post('/api/instagram/agendamentos', instagramController.criarAgendamento);
router.post('/api/instagram/agendamentos/:id/cancelar', instagramController.cancelarAgendamento);

// Sem sessão — liberado no gate de auth via token one-shot.
router.get('/api/instagram/public-media/:token', instagramController.servirMidiaPublica);

// Webhook Meta (guest) — hash na path.
router.get('/api/instagram/webhook/:hash', instagramController.webhookVerify);
router.post('/api/instagram/webhook/:hash', instagramController.webhookEvent);

// Automação (autenticado)
router.get('/api/instagram/automacao/config', instagramController.automacaoConfig);
router.post('/api/instagram/automacao/config/gerar-hash', instagramController.automacaoGerarHash);
router.put('/api/instagram/automacao/config', instagramController.automacaoSalvarConfig);
router.post('/api/instagram/automacao/config/inscrever', instagramController.automacaoInscrever);

router.get('/api/instagram/automacao/fluxos', instagramController.listarFluxos);
router.get('/api/instagram/automacao/fluxos/:id', instagramController.obterFluxo);
router.post('/api/instagram/automacao/fluxos', instagramController.criarFluxo);
router.put('/api/instagram/automacao/fluxos/:id', instagramController.atualizarFluxo);
router.delete('/api/instagram/automacao/fluxos/:id', instagramController.excluirFluxo);
router.post('/api/instagram/automacao/fluxos/:id/ativar', instagramController.ativarFluxo);

router.get('/api/instagram/automacao/conversas', instagramController.listarConversas);

module.exports = router;
