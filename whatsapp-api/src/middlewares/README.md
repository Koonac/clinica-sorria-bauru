# Middlewares

Esta pasta contém os middlewares da aplicação.

## Basic Auth

O middleware `basicAuth.js` implementa autenticação Basic Auth para proteger as rotas da API.

### Configuração

1. Crie um arquivo `.env` na raiz do projeto
2. Adicione as seguintes variáveis de ambiente:

```env
# Configurações de Autenticação Basic Auth
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=sua_senha_segura
```

### Como usar

#### Importar o middleware:

```javascript
const { basicAuth } = require("./middlewares");
```

#### Aplicar em rotas específicas:

```javascript
// Aplicar em uma rota específica
app.post(
  "/api/whatsapp/connect",
  basicAuth,
  whatsappController.createConnection
);

// Aplicar em um grupo de rotas
app.use("/api/whatsapp", basicAuth);
app.get("/api/whatsapp/status", whatsappController.getStatus);
```

#### Aplicar em todas as rotas da API:

```javascript
// Aplicar em todas as rotas que começam com /api
app.use("/api", basicAuth);
```

### Como fazer requisições

Para fazer requisições autenticadas, inclua o header `Authorization` com as credenciais em base64:

```bash
# Exemplo com curl
curl -X POST http://localhost:3000/api/whatsapp/connect \
  -H "Authorization: Basic YWRtaW46c3VhX3NlbmhhX3NlZ3VyYQ==" \
  -H "Content-Type: application/json"
```

Onde `YWRtaW46c3VhX3NlbmhhX3NlZ3VyYQ==` é o resultado de `echo -n "admin:sua_senha_segura" | base64`

### Respostas de erro

O middleware retorna os seguintes códigos de status:

- `401 Unauthorized`: Header Authorization não fornecido ou credenciais inválidas
- `500 Internal Server Error`: Configuração de autenticação não encontrada no .env
