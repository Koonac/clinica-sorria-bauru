const { MongoStoreFixed } = require("./mongoStoreFixed");
const mongoose = require("mongoose");

// Schema para metadados das sessões
const sessionMetadataSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  status: {
    type: String,
    enum: ["connecting", "connected", "disconnected", "error"],
    default: "connecting",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware para atualizar updatedAt
sessionMetadataSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

sessionMetadataSchema.set("strict", false);

// Configuração da conexão MongoDB
const connectDB = async () => {
  try {
    const mongoURI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/whatsapp-sessions";

    await mongoose.connect(mongoURI);

    console.log("✅ MongoDB conectado com sucesso");
  } catch (error) {
    console.error("❌ Erro ao conectar com MongoDB:", error.message);
    process.exit(1);
  }
};

// Configuração do store para wwebjs-mongo
const createStore = () => {
  return new MongoStoreFixed({ mongoose: mongoose });
};

// Função para obter o modelo SessionMetadata
const getSessionMetadataModel = () => {
  try {
    // Verificar se o modelo já existe para evitar recompilação
    if (mongoose.models.SessionMetadata) {
      return mongoose.models.SessionMetadata;
    }

    // Criar o modelo se não existir
    return mongoose.model("SessionMetadata", sessionMetadataSchema);
  } catch (error) {
    console.error("❌ Erro ao obter modelo SessionMetadata:", error.message);
    throw error;
  }
};

module.exports = {
  connectDB,
  createStore,
  mongoose,
  getSessionMetadataModel,
};
