const express = require('express');
const dnaController = require('../controllers/dna.controller');

const router = express.Router();

router.get('/api/dna', dnaController.obterDna);
router.put('/api/dna/:nome', dnaController.salvarDna);

module.exports = router;
