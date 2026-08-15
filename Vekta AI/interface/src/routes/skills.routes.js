const express = require('express');
const skillsController = require('../controllers/skills.controller');

const router = express.Router();

router.get('/api/skills', skillsController.skills);
router.get('/api/skills/:nome', skillsController.obterSkill);
router.put('/api/skills/:nome', skillsController.salvarSkill);

module.exports = router;
