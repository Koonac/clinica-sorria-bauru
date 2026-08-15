const express = require('express');
const claudeUsoController = require('../controllers/claude-uso.controller');

const router = express.Router();

router.get('/api/claude/limites', claudeUsoController.limites);
router.get('/api/claude/contexto', claudeUsoController.contexto);

module.exports = router;
