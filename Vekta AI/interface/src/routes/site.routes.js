const express = require('express');
const siteController = require('../controllers/site.controller');

const router = express.Router();

router.get('/api/site', siteController.obter);
router.post('/api/site/build', siteController.build);

module.exports = router;
