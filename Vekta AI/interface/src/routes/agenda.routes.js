/**
 * Rotas HTTP da aba Agenda (Google Calendar).
 */
const express = require('express');
const agendaController = require('../controllers/agenda.controller');

const router = express.Router();

router.get('/api/agenda/status', agendaController.status);
router.get('/api/agenda/eventos', agendaController.listarEventos);
router.post('/api/agenda/eventos', agendaController.criarEvento);
router.patch('/api/agenda/eventos/:id', agendaController.atualizarEvento);
router.delete('/api/agenda/eventos/:id', agendaController.excluirEvento);

module.exports = router;
