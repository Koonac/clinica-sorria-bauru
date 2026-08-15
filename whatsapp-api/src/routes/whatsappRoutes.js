const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsappController");
const { basicAuth } = require("../middlewares");

// Aplicar middleware de autenticação em todas as rotas do WhatsApp
router.use(basicAuth);

// Criar nova conexão WhatsApp
router.post("/connect", whatsappController.createConnection);

// Obter QR Code de uma sessão
router.get("/qrcode/:sessionId", whatsappController.getQRCode);

// Verificar status da conexão
router.get("/status/:sessionId", whatsappController.getConnectionStatus);

// Foto de perfil (URL temporária do WhatsApp)
router.get("/profile-pic/:sessionId", whatsappController.getProfilePic);

// Enviar mensagem
router.post("/send/:sessionId", whatsappController.sendMessage);

// Desconectar cliente
router.delete("/disconnect/:sessionId", whatsappController.disconnectClient);

// Listar todas as conexões
router.get("/connections", whatsappController.listConnections);

// Labels (etiquetas/listas do WhatsApp Business)
router.get("/labels/:sessionId", whatsappController.listLabels);
router.post("/labels/:sessionId", whatsappController.createLabel);
router.post(
  "/labels/:sessionId/:labelId/contacts",
  whatsappController.linkLabelContact,
);
router.delete(
  "/labels/:sessionId/:labelId/contacts",
  whatsappController.unlinkLabelContact,
);

module.exports = router;
