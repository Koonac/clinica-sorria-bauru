# Vekta AI

**Tudo é ferramenta para o Vekta AI.**

Este monorepo reúne a interface principal do agente e as ferramentas que ele usa no dia a dia: CRM próprio (Laravel) e WhatsApp.

## O que está incluído

| Peça | Papel | Onde roda |
|------|--------|-----------|
| **Vekta AI (interface)** | Hub — DNA, arquivos, skills, chat (Claude CLI) e scripts Python | **Host** (Node / systemd) |
| **Painel (frontend Vue)** | Interface da clínica (CRM no browser) | Docker (`clinica-network`) |
| **CRM (backend Laravel)** | Gestão de relacionamentos, pipeline e campanhas WhatsApp | Docker (`clinica-network`) |
| **WhatsApp API** | Sessões WhatsApp Web e webhooks | Docker (`clinica-network`) |

Painel, backend e WhatsApp sobem na rede `clinica-network`. A interface Vekta não usa essa rede — o nginx (ou o browser) fala com ela em `127.0.0.1:4780`.

## Como iniciar (dev)

**Pré-requisitos:** Docker Desktop, Node.js 20+, Claude CLI (`npm i -g @anthropic-ai/claude-code`).

```powershell
# 1. Credenciais (uma vez)
Copy-Item whatsapp-api\.env.example whatsapp-api\.env
Copy-Item vekta-ai\interface\.env.example vekta-ai\interface\.env
Copy-Item backend\.env.example backend\.env
# Edite os .env (login da interface, basic auth do WhatsApp, APP_KEY do Laravel)

# 2. Login Claude no host (uma vez)
claude

# 3. Postgres + WhatsApp
docker compose up -d --build

# 4. Backend Laravel no host (dev) — ou use o compose prod
cd backend
# composer install; php artisan migrate; php artisan serve

# 5. Interface Vekta no host
cd vekta-ai\interface
npm install
npm run start
# ou: npm run dev
```

## Acessos

| Serviço | URL |
|---------|-----|
| Interface Vekta | http://localhost:4680 (dev) / http://127.0.0.1:4780 (prod Docker/systemd) |
| Painel Vue | http://localhost:5173 (dev) / http://127.0.0.1:8181 (prod Docker) |
| Backend API | http://localhost:8000 (Laravel no host) / http://127.0.0.1:8180 (prod Docker) |
| WhatsApp API | http://localhost:3000 (só dev; em prod não é publicado) |
| Postgres | localhost:5432 |

## Produção (nginx no host)

- Vekta: `https://aiclinica.vektaai.com.br` → `127.0.0.1:4780` (systemd `clinica-ai`)
- Painel Vue: `https://clinica.vektaai.com.br` → `127.0.0.1:8181`
- Backend: loopback `127.0.0.1:8180` (Vekta usa `BACKEND_URL`; o painel chama `/api` no mesmo origin)
- Filas Laravel: Redis (container interno)
- wwebjs **não** tem URL pública

```bash
cp .env.example .env   # preencha secrets
cp backend/.env.example backend/.env
cp whatsapp-api/.env.example whatsapp-api/.env
docker compose -f docker-compose.prod.yml up -d --build
# Ative deploy/nginx/*.conf no nginx do host + Certbot; DNS A/AAAA → IP do servidor

# Interface no host (uma vez):
bash deploy/host/setup-vekta-host.sh --migrate
```

Deploys incrementais (no servidor, após o primeiro up):

```bash
bash vekta-deploy.sh         # só interface (git pull + npm + systemctl restart)
bash frontend-deploy.sh      # só painel Vue
bash backend-deploy.sh       # API + queue + scheduler
bash whatsapp-deploy.sh      # só wwebjs
bash deploy.sh               # stack Docker + migrate backend + restart Vekta no host
```

Detalhes: [`docker-compose.prod.yml`](docker-compose.prod.yml), [`deploy/host/setup-vekta-host.sh`](deploy/host/setup-vekta-host.sh), [`deploy/systemd/clinica-ai.service`](deploy/systemd/clinica-ai.service), [`deploy/nginx/`](deploy/nginx/).

## Estrutura

```
├── vekta-ai/                 # Interface + contexto do agente (host)
├── frontend/                 # Painel Vue (Docker em prod)
├── backend/                  # CRM próprio — Laravel API (Docker em prod)
├── whatsapp-api/             # API WhatsApp (Docker; rede interna em prod)
├── deploy/nginx/             # Server blocks
├── deploy/host/              # Setup da interface no host
├── deploy/systemd/           # Unit clinica-ai.service
├── docker-compose.yml        # Dev (Postgres + WhatsApp)
└── docker-compose.prod.yml   # Prod (painel + backend + redis + WhatsApp; portas só em 127.0.0.1)
```

## Parar

```powershell
docker compose down
# Interface no host: Ctrl+C no npm, ou em prod: sudo systemctl stop clinica-ai
```
