const { Client, LocalAuth } = require("whatsapp-web.js");
const path = require("path");

async function testWhatsAppConnection() {
  try {
    console.log("🧪 Testando conexão WhatsApp...");

    const sessionId = "test-session-" + Date.now();

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: path.join(process.cwd(), "sessions"),
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
    });

    // Evento de QR Code
    client.once("qr", (qr) => {
      console.log("📱 QR Code gerado!");
      console.log("🔍 QR Code:", qr.substring(0, 50) + "...");
    });

    // Evento de autenticação
    client.on("authenticated", () => {
      console.log("✅ Cliente autenticado!");
    });

    // Evento de falha na autenticação
    client.on("auth_failure", (msg) => {
      console.error("❌ Falha na autenticação:", msg);
    });

    // Evento de carregamento
    client.on("loading_screen", (percent, message) => {
      console.log(`📱 Carregando: ${percent}% - ${message}`);
    });

    // Evento de pronto
    client.on("ready", () => {
      console.log("🚀 Cliente WhatsApp pronto!");
      console.log("📱 Informações:", client.info);
    });

    // Evento de desconexão
    client.on("disconnected", (reason) => {
      console.log("❌ Cliente desconectado:", reason);
    });

    // Evento de erro
    client.on("error", (error) => {
      console.error("❌ Erro no cliente:", error);
    });

    console.log("🚀 Inicializando cliente...");
    await client.initialize();
    console.log("✅ Cliente inicializado!");

    // Aguardar um pouco para ver os eventos
    setTimeout(() => {
      console.log("⏰ Teste concluído!");
      process.exit(0);
    }, 30000);
  } catch (error) {
    console.error("❌ Erro no teste:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

testWhatsAppConnection();
