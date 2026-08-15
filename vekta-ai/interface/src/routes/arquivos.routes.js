const express = require('express');
const arquivosController = require('../controllers/arquivos.controller');

const router = express.Router();

router.get(/^\/raw\/(.+)/, arquivosController.servirRaw);
router.get('/api/arquivo', arquivosController.lerArquivo);
router.put('/api/arquivo', arquivosController.salvarArquivo);
router.delete('/api/arquivo', arquivosController.excluirArquivo);
router.post('/api/revelar', arquivosController.revelar);

module.exports = router;
