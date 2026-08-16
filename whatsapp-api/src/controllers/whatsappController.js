const whatsappService = require("../services/whatsappService");

class WhatsAppController {
	
  // Criar nova conexão WhatsApp
  async createConnection(req, res) {
    try {
      const { sessionId, data } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return res.status(400).json({
          success: false,
          error: "data é obrigatório e deve ser um objeto",
        });
      }

      if (
        !data.notifications_url ||
        typeof data.notifications_url !== "string" ||
        !data.notifications_url.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "data.notifications_url é obrigatório",
        });
      }

      if (
        !data.messages_url ||
        typeof data.messages_url !== "string" ||
        !data.messages_url.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "data.messages_url é obrigatório",
        });
      }

      const result = await whatsappService.createConnection(sessionId, data);

      if (result.success) {
        return res.status(201).json(result);
      } else {
        return res.status(500).json(result);
      }
    } catch (error) {
      console.error("Erro no controller createConnection:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Obter QR Code
  async getQRCode(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      const result = whatsappService.getQRCode(sessionId);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      console.error("Erro no controller getQRCode:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Verificar status da conexão
  async getConnectionStatus(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      const result = await whatsappService.getConnectionStatus(sessionId);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      console.error("Erro no controller getConnectionStatus:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Enviar mensagem (texto e/ou imagem)
  async sendMessage(req, res) {
    try {
      const { sessionId } = req.params;
      const { to, message, media } = req.body;

      const hasMedia =
        media &&
        typeof media === "object" &&
        typeof media.data === "string" &&
        media.data.trim() !== "";
      const text = message == null ? "" : String(message);

      if (!sessionId || !to || (!text.trim() && !hasMedia)) {
        return res.status(400).json({
          success: false,
          error: "sessionId, to e (message ou media) são obrigatórios",
        });
      }

      if (hasMedia) {
        const mimetype = String(media.mimetype || "").toLowerCase();
        if (!mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            error: "Apenas imagens são suportadas (image/*).",
          });
        }
      }

      const result = await whatsappService.sendMessage(
        sessionId,
        to,
        text,
        hasMedia ? media : null,
      );

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error("Erro no controller sendMessage:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Desconectar cliente
  async disconnectClient(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      const result = await whatsappService.disconnectClient(sessionId);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(404).json(result);
      }
    } catch (error) {
      console.error("Erro no controller disconnectClient:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Listar todas as conexões
  async listConnections(req, res) {
    try {
      const connections = whatsappService.listConnections();

      return res.status(200).json({
        success: true,
        connections: connections,
        total: connections.length,
      });
    } catch (error) {
      console.error("Erro no controller listConnections:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Listar labels (etiquetas/listas)
  async listLabels(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      const result = await whatsappService.listLabels(sessionId);

      if (result.success) {
        return res.status(200).json(result);
      }

      const status = result.error === "Cliente não encontrado" ? 404 : 400;
      return res.status(status).json(result);
    } catch (error) {
      console.error("Erro no controller listLabels:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Criar label
  async createLabel(req, res) {
    try {
      const { sessionId } = req.params;
      const { name, color } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: "name é obrigatório",
        });
      }

      const result = await whatsappService.createLabel(
        sessionId,
        name.trim(),
        color ?? null,
      );

      if (result.success) {
        return res.status(201).json(result);
      }

      const status = result.error === "Cliente não encontrado" ? 404 : 400;
      return res.status(status).json(result);
    } catch (error) {
      console.error("Erro no controller createLabel:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Vincular contato à label
  async linkLabelContact(req, res) {
    try {
      const { sessionId, labelId } = req.params;
      const { to } = req.body || {};

      if (!sessionId || !labelId || !to) {
        return res.status(400).json({
          success: false,
          error: "sessionId, labelId e to são obrigatórios",
        });
      }

      const result = await whatsappService.linkLabelToChat(
        sessionId,
        labelId,
        to,
      );

      if (result.success) {
        return res.status(200).json(result);
      }

      const status = result.error === "Cliente não encontrado" ? 404 : 400;
      return res.status(status).json(result);
    } catch (error) {
      console.error("Erro no controller linkLabelContact:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  // Remover contato da label
  async unlinkLabelContact(req, res) {
    try {
      const { sessionId, labelId } = req.params;
      const { to } = req.body || {};

      if (!sessionId || !labelId || !to) {
        return res.status(400).json({
          success: false,
          error: "sessionId, labelId e to são obrigatórios",
        });
      }

      const result = await whatsappService.unlinkLabelFromChat(
        sessionId,
        labelId,
        to,
      );

      if (result.success) {
        return res.status(200).json(result);
      }

      const status = result.error === "Cliente não encontrado" ? 404 : 400;
      return res.status(status).json(result);
    } catch (error) {
      console.error("Erro no controller unlinkLabelContact:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }

  async getProfilePic(req, res) {
    try {
      const { sessionId } = req.params;
      const jid = String(req.query.jid || "").trim();
      const lid = String(req.query.lid || "").trim() || null;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "sessionId é obrigatório",
        });
      }

      if (!jid && !lid) {
        return res.status(400).json({
          success: false,
          error: "jid é obrigatório",
        });
      }

      const result = await whatsappService.getProfilePicUrl(sessionId, jid, lid);

      if (!result.success) {
        const status = result.error === "Cliente não encontrado" ? 404 : 400;
        return res.status(status).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro no controller getProfilePic:", error);
      return res.status(500).json({
        success: false,
        error: "Erro interno do servidor",
      });
    }
  }
}

module.exports = new WhatsAppController();
