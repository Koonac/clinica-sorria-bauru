const express = require('express');
const paginasController = require('../controllers/paginas.controller');

const router = express.Router();

router.get('/api/paginas', paginasController.listar);

module.exports = router;
