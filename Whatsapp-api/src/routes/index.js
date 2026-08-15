const express = require("express");
const router = express.Router();

// Importação das rotas
const whatsappRoutes = require("./whatsappRoutes");
// const webhookRoutes = require('./webhookRoutes');

// Definição das rotas
router.use("/whatsapp", whatsappRoutes);
// router.use('/webhook', webhookRoutes);

module.exports = router;
