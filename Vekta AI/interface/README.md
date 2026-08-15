# Vekta Ai — Interface

Interface local do **Vekta Ai**: um painel web para operar o sistema instalado na empresa — chat com o agente, DNA da marca, visão das pastas de marketing/saídas, galeria de mídias, agents e skills.

Roda só na sua máquina (`127.0.0.1`), acoplada à raiz do projeto Vekta Ai (a pasta pai de `interface/`).

## O que ela oferece

- **Chat** — conversa central com o Vekta Ai via Claude CLI (sessão viva, streaming por Socket.io); a mesma UI também aparece no painel direito da Visão geral
- **Visão geral** — workspace estilo IDE: explorador | preview | chat compartilhado
- **Galeria** — imagens/vídeos produzidos + chat exclusivo do designer (toda mensagem aciona `/interface` + `/designer`)
- **Site** — preview do site configurado em `VEKTA_SITE_DIR` (iframe) + chat exclusivo para alterações (canal `site` → agente `desenvolvedor`)
- **Tráfego** — análise de campanhas Meta Ads (Marketing API) e Google Ads (API REST)
- **DNA** — visualização e edição dos arquivos em `.dna/`
- **Agents / Skills** — listagem do que está em `.claude/agents/` e `.claude/skills/`

## Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js |
| Servidor HTTP | Express |
| Tempo real (chat) | Socket.io |
| Front-end | HTML + JS (ES modules), sem framework |
| Estilo | Tailwind CSS v4 (`@tailwindcss/cli`) |
| Ícones | Lucide (via Iconify) |
| Markdown | marked |
| Animações | anime.js |
| Agente (chat) | Claude CLI (`claude`) |

## Pré-requisitos

1. **Node.js** (versão recente com suporte a `node --watch`)
2. **npm**
3. **Claude CLI** instalado e autenticado no PATH — o chat da interface spawna o comando `claude`
4. Projeto Vekta Ai na pasta pai (`.dna/`, `.claude/`, `marketing/`, etc.)
5. Arquivo `interface/.env` com usuário, senha e segredo de sessão (ver seção [Autenticação](#autenticação))

## Instalação

Na pasta `interface/`:

```bash
npm install
```

O `postinstall` copia as libs de vendor para `public/vendor/`. Na primeira subida (`start` ou `dev`), o CSS do Tailwind e o preload do Lucide também são gerados automaticamente.

Copie o exemplo de variáveis e preencha as credenciais:

```bash
cp .env.example .env
```

Edite `interface/.env` com usuário, senha e um `VEKTA_AI_SESSION_SECRET` longo e aleatório (veja a seção abaixo).

## Autenticação

A interface exige login no **modo web** (`npm start` / `npm run dev`). Credenciais ficam em `interface/.env` — **sem banco de dados**. O cookie de sessão é httpOnly e assinado.

O app **desktop (Electron)** autentica sozinho via token de processo e não mostra a tela de login.

| Variável | Obrigatória | Função |
| --- | --- | --- |
| `VEKTA_AI_USUARIO` | sim (web) | Nome de usuário |
| `VEKTA_AI_SENHA` | sim* | Senha em texto |
| `VEKTA_AI_SENHA_HASH` | alternativa* | Hash scrypt no formato `saltHex:hashHex` (se definido, ignora `VEKTA_AI_SENHA`) |
| `VEKTA_AI_SESSION_SECRET` | recomendada | Segredo para assinar o cookie; sem ele, um segredo efêmero é gerado a cada boot |
| `VEKTA_AI_COOKIE_SECURE` | se HTTPS | `true` quando a interface é exposta via HTTPS (túnel/ngrok, proxy). Sem isso o navegador pode não enviar o cookie |

\* Informe `VEKTA_AI_SENHA` **ou** `VEKTA_AI_SENHA_HASH`.

Gere um segredo de sessão:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Expor na internet (túnel / proxy)

1. Sirva a interface atrás de **HTTPS**.
2. Defina `VEKTA_AI_COOKIE_SECURE=true` no `.env`.
3. Use uma senha forte — o login tem rate-limit (20 tentativas / 15 min).

Sem autenticação, o Socket.io do chat executaria o Claude CLI com `bypassPermissions` na máquina — por isso o login protege **HTTP e WebSocket**.

## Como rodar

Sempre a partir de `interface/`. Em **produção na VPS**, use o systemd (`bash vekta-deploy.sh` / `deploy/host/setup-vekta-host.sh`) — a interface **não** sobe mais pelo Docker Compose.

### Produção local — `npm run start`

Compila CSS + Lucide e sobe o servidor uma vez:

```bash
npm run start
```

Abra [http://localhost:4680](http://localhost:4680) — a tela de login aparece se ainda não houver sessão.

### Desenvolvimento — `npm run dev`

Sobe em paralelo:

- watch do Tailwind (`css:watch`)
- watch do preload Lucide (`lucide:watch`)
- servidor Node com `--watch` nos arquivos de backend (`dev:server`)

```bash
npm run dev
```

Mesma URL: [http://localhost:4680](http://localhost:4680). Alterações no back-end e no CSS recarregam/rebuildam sem reiniciar manualmente o processo todo.

## Variáveis de ambiente (opcional)

Além das de [Autenticação](#autenticação):

| Variável | Padrão | Função |
| --- | --- | --- |
| `PORT` | `4680` | Porta do servidor |
| `VEKTA_AI_PERMISSION_MODE` | `bypassPermissions` | Modo de permissão do Claude CLI no chat (`bypassPermissions`, `acceptEdits` ou `default`) |
| `VEKTA_FEATURE_SITE` | `true` | Exibe a aba Site e as APIs `/api/site` |
| `VEKTA_FEATURE_TRAFEGO` | `true` | Exibe a aba Tráfego e as APIs `/api/trafego` |
| `VEKTA_SITE_DIR` | `marketing/sites/portfolio-1/web/dist` | Pasta com o `index.html` a exibir (Vite: `…/dist`; HTML puro: raiz do site). Relativo à raiz do projeto Vekta |
| `META_ADS_ACCESS_TOKEN` | — | Token com `ads_read` (Marketing API; separado do Instagram) |
| `META_AD_ACCOUNT_ID` | — | Conta de anúncios (`act_…` ou só o número) |
| `GOOGLE_CLIENT_ID` | — | OAuth client ID único do app (Cloud Console; Ads + Calendar) |
| `GOOGLE_CLIENT_SECRET` | — | OAuth client secret do mesmo app |
| `GOOGLE_ADS_REFRESH_TOKEN` | — | Refresh token OAuth Ads (fluxo único fora da UI) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | — | Token do Centro da API no Google Ads |
| `GOOGLE_ADS_CUSTOMER_ID` | — | ID da conta de anúncios (só dígitos; hífens são removidos) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | — | Opcional — ID da MCC se acessar via gerente |
| `GOOGLE_ADS_API_VERSION` | `v21` | Versão da Google Ads API |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | — | Refresh token OAuth Calendar (scope `calendar`) |
| `GOOGLE_CALENDAR_CALENDAR_ID` | `primary` | ID do calendário |
| `VEKTA_FEATURE_AGENDA` | `true` | Exibe a aba Agenda e as APIs `/api/agenda` |

Exemplo no PowerShell:

```powershell
$env:PORT = "4680"
$env:VEKTA_AI_PERMISSION_MODE = "acceptEdits"
npm run start
```

## Estrutura rápida

```
interface/
├── public/          # estáticos servidos (HTML, CSS, JS, vendor) + login.html
├── scripts/         # build de vendor / Lucide
├── src/
│   ├── app.js       # entrada do servidor (sessão + gate + Socket.io auth)
│   ├── config/      # caminhos e env (.env)
│   ├── controllers/
│   ├── middlewares/ # gate de autenticação
│   ├── routes/      # inclui auth.routes (login/logout/desktop)
│   ├── services/    # filesystem, Claude CLI, auth…
│   ├── sockets/     # chat em tempo real (exige sessão)
│   ├── styles/      # entrada Tailwind
│   └── views/       # páginas e core do front
├── .env.example     # modelo das credenciais
└── package.json
```
