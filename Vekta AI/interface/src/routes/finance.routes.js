const express = require('express');
const financeController = require('../controllers/finance.controller');

const router = express.Router();

router.get('/api/finance/status', financeController.status);

router.get('/api/finance/accounts', financeController.listarContas);
router.post('/api/finance/accounts', financeController.criarConta);
router.patch('/api/finance/accounts/:id', financeController.atualizarConta);
router.delete('/api/finance/accounts/:id', financeController.excluirConta);

router.get('/api/finance/entries', financeController.listarLancamentos);
router.post('/api/finance/entries', financeController.criarLancamento);
router.get('/api/finance/entries/:id', financeController.obterLancamento);
router.patch('/api/finance/entries/:id', financeController.atualizarLancamento);
router.delete('/api/finance/entries/:id', financeController.excluirLancamento);
router.post('/api/finance/entries/:id/settle', financeController.baixarLancamento);
router.delete('/api/finance/entries/:id/settle', financeController.estornarLancamento);

router.get('/api/finance/stats/overview', financeController.overview);

module.exports = router;
