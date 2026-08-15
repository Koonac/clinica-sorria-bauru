const express = require('express');
const chatController = require('../controllers/chat.controller');

const router = express.Router();

router.get('/api/chat/sessoes', chatController.listarSessoes);
router.delete('/api/chat/sessoes/:id', chatController.excluirSessao);

module.exports = router;
