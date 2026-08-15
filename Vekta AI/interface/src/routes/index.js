/**
 * Agrega todas as rotas HTTP da interface num único router.
 * CRM, Campanhas, Financeiro, Instagram, Site, Tráfego e Agenda só montam se a feature
 * correspondente estiver true no .env.
 */
const express = require('express');
const { FEATURES } = require('../config');

const router = express.Router();

router.use(require('./arquivos.routes'));
router.use(require('./status.routes'));
router.use(require('./paginas.routes'));
router.use(require('./dna.routes'));
router.use(require('./midia.routes'));
router.use(require('./agentes.routes'));
router.use(require('./skills.routes'));
router.use(require('./chat.routes'));
router.use(require('./claude-uso.routes'));
if (FEATURES.crm) router.use(require('./crm.routes'));
if (FEATURES.financeiro) router.use(require('./finance.routes'));
if (FEATURES.instagram) router.use(require('./instagram.routes'));
if (FEATURES.site) router.use(require('./site.routes'));
if (FEATURES.trafego) router.use(require('./trafego.routes'));
if (FEATURES.agenda) router.use(require('./agenda.routes'));

module.exports = router;
