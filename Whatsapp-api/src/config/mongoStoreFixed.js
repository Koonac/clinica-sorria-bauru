const fs = require("fs");
const path = require("path");

function normalizeSessionKey(session) {
  if (!session) return session;
  const raw = String(session);

  // RemoteAuth às vezes envia um caminho absoluto no Windows (ex: E:\...\RemoteAuth-session-9)
  // O GridFS precisa de uma chave estável; usamos apenas o "basename" do caminho.
  const asPosix = raw.replace(/\\/g, "/");
  const base = asPosix.split("/").pop();

  // Se por algum motivo vier com sufixo .zip, removemos para manter a convenção `${session}.zip`
  return base.endsWith(".zip") ? base.slice(0, -4) : base;
}

function resolveZipSourcePath({ rawSession, sessionKey }) {
  const candidates = [];

  if (rawSession) {
    const raw = String(rawSession);
    // Se vier como caminho absoluto/relativo para o "prefixo" do zip
    if (raw.includes("\\") || raw.includes("/") || raw.includes(":")) {
      candidates.push(raw.endsWith(".zip") ? raw : `${raw}.zip`);
    }
  }

  // Padrão do projeto: `dataPath` aponta para `<cwd>/sessions`
  candidates.push(path.join(process.cwd(), "sessions", `${sessionKey}.zip`));
  candidates.push(path.join(process.cwd(), `${sessionKey}.zip`));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignora e tenta o próximo
    }
  }

  // fallback: mantém compatibilidade com comportamento original
  return path.join(process.cwd(), `${sessionKey}.zip`);
}

class MongoStoreFixed {
  constructor({ mongoose } = {}) {
    if (!mongoose)
      throw new Error("A valid Mongoose instance is required for MongoStoreFixed.");
    this.mongoose = mongoose;
  }

  async sessionExists(options) {
    const session = normalizeSessionKey(options?.session);
    const multiDeviceCollection = this.mongoose.connection.db.collection(
      `whatsapp-${session}.files`
    );
    const hasExistingSession = await multiDeviceCollection.countDocuments();
    return !!hasExistingSession;
  }

  async save(options) {
    const rawSession = options?.session;
    const session = normalizeSessionKey(rawSession);
    const bucket = new this.mongoose.mongo.GridFSBucket(
      this.mongoose.connection.db,
      {
        bucketName: `whatsapp-${session}`,
      }
    );

    const zipSourcePath = resolveZipSourcePath({
      rawSession,
      sessionKey: session,
    });

    await new Promise((resolve, reject) => {
      fs.createReadStream(zipSourcePath)
        .pipe(bucket.openUploadStream(`${session}.zip`))
        .on("error", (err) => reject(err))
        .on("close", () => resolve());
    });

    await this.#deletePrevious({ bucket, session });
  }

  async extract(options) {
    const session = normalizeSessionKey(options?.session);
    const bucket = new this.mongoose.mongo.GridFSBucket(
      this.mongoose.connection.db,
      {
        bucketName: `whatsapp-${session}`,
      }
    );

    // `options.path` é o destino do zip no disco (exigido pelo RemoteAuth)
    return new Promise((resolve, reject) => {
      bucket
        .openDownloadStreamByName(`${session}.zip`)
        .pipe(fs.createWriteStream(options.path))
        .on("error", (err) => reject(err))
        .on("close", () => resolve());
    });
  }

  async delete(options) {
    const session = normalizeSessionKey(options?.session);
    const bucket = new this.mongoose.mongo.GridFSBucket(
      this.mongoose.connection.db,
      {
        bucketName: `whatsapp-${session}`,
      }
    );

    const documents = await bucket
      .find({
        filename: `${session}.zip`,
      })
      .toArray();

    await Promise.all(documents.map((doc) => bucket.delete(doc._id)));
  }

  async #deletePrevious({ bucket, session }) {
    const documents = await bucket
      .find({
        filename: `${session}.zip`,
      })
      .toArray();

    if (documents.length > 1) {
      const oldSession = documents.reduce((a, b) =>
        a.uploadDate < b.uploadDate ? a : b
      );
      return bucket.delete(oldSession._id);
    }
  }
}

module.exports = { MongoStoreFixed, normalizeSessionKey };

