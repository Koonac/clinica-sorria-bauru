# Estrutura do Código Fonte

Esta pasta contém todo o código fonte da aplicação WhatsApp Web API.

## Estrutura de Pastas

### `/controllers`

Responsável por lidar com as requisições HTTP e respostas da API.

- Recebe dados das requisições
- Valida dados de entrada
- Chama os serviços apropriados
- Retorna respostas formatadas

### `/routes`

Define todas as rotas da API usando Express.js.

- Organiza endpoints por funcionalidade
- Define middlewares específicos
- Conecta rotas aos controllers

### `/services`

Contém a lógica de negócio da aplicação.

- Gerenciamento de conexões WhatsApp
- Processamento de mensagens
- Integração com webhooks
- Lógica de autenticação

### `/utils`

Funções utilitárias e helpers reutilizáveis.

- Loggers
- Geradores de QR Code
- Funções de validação
- Helpers de formatação

## Arquivos Principais

- `app.js` - Configuração principal do servidor Express
- `index.js` (em cada pasta) - Arquivos de exportação centralizada

## Convenções

- Use camelCase para nomes de arquivos e funções
- Use PascalCase para nomes de classes
- Mantenha um arquivo por funcionalidade
- Use comentários para documentar funções complexas
