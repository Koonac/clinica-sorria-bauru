const axios = require("axios");

const WWEBJS_EVENTS = {
  QR_CODE: "qr_code",
  AUTHENTICATED: "authenticated",
  READY: "ready",
  DISCONNECTED: "disconnected",
  ERROR: "error",
  LOADING_SCREEN: "loading_screen",
  MESSAGE: "message",
};

class WebhookService {
  getAuthConfig() {
    const username = process.env.WEBHOOK_BASIC_AUTH_USERNAME?.trim();
    const password = process.env.WEBHOOK_BASIC_AUTH_PASSWORD?.trim();

    if (!username && !password) {
      return undefined;
    }

    if (!username || !password) {
      console.warn(
        "⚠️ WEBHOOK_BASIC_AUTH_USERNAME e WEBHOOK_BASIC_AUTH_PASSWORD devem estar definidos juntos. Webhooks serão enviados sem autenticação.",
      );
      return undefined;
    }

    return { username, password };
  }

  async sendWebhook(url, event, sessionId, payloadData = null) {
    try {
      if (!url) {
        console.log(`🚫 Webhook não configurado para a sessão ${sessionId}`);
        return;
      }

      const hasPayloadData =
        payloadData &&
        typeof payloadData === "object" &&
        Object.keys(payloadData).length > 0;

      const body = {
        event,
        session_id: sessionId,
        data: hasPayloadData ? payloadData : null,
      };

      const auth = this.getAuthConfig();

      await axios.post(url, body, auth ? { auth } : undefined);
    } catch (error) {
      console.error(
        `❌ Erro ao enviar webhook: ${error.message} - Webhook: ${url}`,
      );
    }
  }
}

module.exports = new WebhookService();
module.exports.WWEBJS_EVENTS = WWEBJS_EVENTS;
