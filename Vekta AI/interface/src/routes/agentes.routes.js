const express = require('express');
const agentesController = require('../controllers/agentes.controller');

const router = express.Router();

router.get('/api/agentes', agentesController.agentes);

module.exports = router;
