const express = require('express');
const midiaController = require('../controllers/midia.controller');

const router = express.Router();

router.get('/api/midia', midiaController.listar);

module.exports = router;
