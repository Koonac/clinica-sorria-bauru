/**
 * Middleware de autenticação Basic Auth
 * Valida se o header Authorization contém credenciais válidas
 */

const basicAuth = (req, res, next) => {
  // Obtém o header Authorization
  const authHeader = req.headers.authorization;

  // Verifica se o header existe
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Header Authorization não fornecido",
    });
  }

  // Verifica se o header começa com "Basic "
  if (!authHeader.startsWith("Basic ")) {
    return res.status(401).json({
      success: false,
      message: "Tipo de autenticação inválido. Use Basic Auth",
    });
  }

  try {
    // Remove "Basic " do header e decodifica a string base64
    const credentials = Buffer.from(authHeader.substring(6), "base64").toString(
      "utf-8"
    );

    // Separa usuário e senha (formato: "usuario:senha")
    const [username, password] = credentials.split(":");

    // Obtém as credenciais do arquivo .env
    const envUsername = process.env.BASIC_AUTH_USERNAME;
    const envPassword = process.env.BASIC_AUTH_PASSWORD;

    // Verifica se as credenciais do .env estão configuradas
    if (!envUsername || !envPassword) {
      console.error("Credenciais Basic Auth não configuradas no .env");
      return res.status(500).json({
        success: false,
        message: "Configuração de autenticação não encontrada",
      });
    }

    // Valida as credenciais
    if (username === envUsername && password === envPassword) {
      // Credenciais válidas, continua para o próximo middleware
      next();
    } else {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas",
      });
    }
  } catch (error) {
    console.error("Erro ao processar autenticação Basic Auth:", error);
    return res.status(401).json({
      success: false,
      message: "Erro ao processar autenticação",
    });
  }
};

module.exports = basicAuth;
