const express = require('express');
const statusController = require('../controllers/status.controller');

const router = express.Router();

router.get('/api/status', statusController.status);
router.get('/api/arvore', statusController.arvore);
router.get('/api/tarefas', statusController.tarefas);

module.exports = router;
