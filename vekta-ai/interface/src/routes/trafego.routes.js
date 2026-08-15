/**
 * Rotas HTTP da aba Tráfego (Meta Ads + Google Ads).
 */
const express = require('express');
const trafegoController = require('../controllers/trafego.controller');

const router = express.Router();

router.get('/api/trafego/meta/status', trafegoController.statusMeta);
router.get('/api/trafego/meta/conta', trafegoController.contaMeta);
router.get('/api/trafego/meta/campanhas', trafegoController.campanhasMeta);
router.get('/api/trafego/meta/insights', trafegoController.insightsMeta);

router.get('/api/trafego/google/status', trafegoController.statusGoogle);
router.get('/api/trafego/google/conta', trafegoController.contaGoogle);
router.get('/api/trafego/google/campanhas', trafegoController.campanhasGoogle);
router.get('/api/trafego/google/insights', trafegoController.insightsGoogle);

module.exports = router;
