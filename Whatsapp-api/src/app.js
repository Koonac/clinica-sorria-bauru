const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Importar configuração do banco de dados
const { connectDB } = require("./config");
const { swaggerServe, swaggerSetup } = require("./config/swagger");
// Importar WhatsAppService para restauração automática de sessões
const whatsappService = require("./services/whatsappService");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração para restauração automática
const AUTO_RESTORE_SESSIONS = process.env.AUTO_RESTORE_SESSIONS !== "false"; // true por padrão
const RESTORE_DELAY = parseInt(process.env.RESTORE_DELAY) || 5000; // 5 segundos por padrão

// Middleware
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// Importar rotas
const routes = require("./routes");

// Rotas básicas
app.get("/", (req, res) => {
  res.json({
    message: "WhatsApp Web API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      docs: "/docs",
      whatsapp: "/api/whatsapp",
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// Documentação Swagger (sem autenticação)
app.use("/docs", swaggerServe, swaggerSetup);

// Rotas da API
app.use("/api", routes);

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Erro interno do servidor",
    message: err.message,
  });
});

// Rota 404
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Rota não encontrada",
    path: req.originalUrl,
  });
});

// Inicialização do servidor
const startServer = async () => {
  try {
    // Conectar ao MongoDB
    await connectDB();

    // Iniciar servidor primeiro
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📱 WhatsApp Web API iniciada`);
      console.log(`🌐 Acesse: http://localhost:${PORT}`);
      console.log(`📚 Swagger: http://localhost:${PORT}/docs`);
      console.log(`🗄️  MongoDB conectado`);
    });

    // Aguardar o servidor estar estável antes de restaurar sessões
    if (AUTO_RESTORE_SESSIONS) {
      console.log(
        "⏳ Aguardando servidor estabilizar antes de restaurar sessões..."
      );
      await new Promise((resolve) => setTimeout(resolve, RESTORE_DELAY));

      // Executar em background para não bloquear o servidor
      setImmediate(async () => {
        try {
          const restoreResult = await whatsappService.restoreLostSessions();
          if (restoreResult.success) {
            console.log(
              `✅ Restauração automática concluída: ${restoreResult.message}`
            );
          } else {
            console.error(
              `❌ Erro na restauração automática: ${restoreResult.error}`
            );
          }
        } catch (restoreError) {
          console.error(
            "❌ Erro durante restauração automática:",
            restoreError.message
          );
        }
      });
    } else {
      console.log("⏭️ Restauração automática de sessões desabilitada");
    }
  } catch (error) {
    console.error("❌ Erro ao inicializar servidor:", error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
