# Vekta AI

**Tudo é ferramenta para o Vekta AI.**

Este monorepo reúne a interface principal do agente e as ferramentas que ele usa no dia a dia: CRM próprio (Laravel) e WhatsApp.

## O que está incluído

| Peça | Papel | Onde roda |
|------|--------|-----------|
| **Vekta AI (interface)** | Hub — DNA, arquivos, skills, chat (Claude CLI) e scripts Python | **Host** (Node / systemd) |
| **CRM (backend Laravel)** | Gestão de relacionamentos, pipeline e campanhas WhatsApp | Docker (`vekta-network`) |
| **WhatsApp API** | Sessões WhatsApp Web e webhooks | Docker (`vekta-network`) |

Backend e WhatsApp sobem na rede `vekta-network`. A interface não usa essa rede — o nginx (ou o browser) fala com ela em `127.0.0.1:4680`.

## Como iniciar (dev)

**Pré-requisitos:** Docker Desktop, Node.js 20+, Claude CLI (`npm i -g @anthropic-ai/claude-code`).

```powershell
# 1. Credenciais (uma vez)
Copy-Item Whatsapp-api\.env.example Whatsapp-api\.env
Copy-Item "Vekta AI\interface\.env.example" "Vekta AI\interface\.env"
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
cd "Vekta AI\interface"
npm install
npm run start
# ou: npm run dev
```

## Acessos

| Serviço | URL |
|---------|-----|
| Interface Vekta | http://localhost:4680 |
| Backend API | http://localhost:8000 (Laravel no host) / http://127.0.0.1:8080 (prod Docker) |
| WhatsApp API | http://localhost:3000 (só dev; em prod não é publicado) |
| Postgres | localhost:5432 |

## Produção (nginx no host)

Domínio: `ai.vektaai.com.br` (Vekta no host). O backend fica em loopback (`127.0.0.1:8080`). O wwebjs **não** tem URL pública.

```bash
cp .env.example .env   # preencha secrets
cp backend/.env.example backend/.env
docker compose -f docker-compose.prod.yml up -d --build
# Ative deploy/nginx/*.conf no nginx do host + Certbot; DNS A/AAAA → IP do servidor

# Interface no host (uma vez):
bash deploy/host/setup-vekta-host.sh --migrate
```

Deploys incrementais (no servidor, após o primeiro up):

```bash
bash vekta-deploy.sh      # só interface (git pull + npm + systemctl restart)
bash whatsapp-deploy.sh   # só wwebjs
bash deploy.sh            # stack Docker + migrate backend + restart Vekta no host
```

Detalhes: [`docker-compose.prod.yml`](docker-compose.prod.yml), [`deploy/host/setup-vekta-host.sh`](deploy/host/setup-vekta-host.sh), [`deploy/systemd/vekta-ai.service`](deploy/systemd/vekta-ai.service), [`deploy/nginx/`](deploy/nginx/).

## Estrutura

```
├── Vekta AI/                 # Interface + contexto do agente (host)
├── backend/                  # CRM próprio — Laravel API (Docker em prod)
├── Whatsapp-api/             # API WhatsApp (Docker; rede interna em prod)
├── deploy/nginx/             # Server blocks
├── deploy/host/              # Setup da interface no host
├── deploy/systemd/           # Unit vekta-ai.service
├── docker-compose.yml        # Dev (Postgres + WhatsApp)
└── docker-compose.prod.yml   # Prod (Backend + WhatsApp; portas só em 127.0.0.1)
```

## Parar

```powershell
docker compose down
# Interface no host: Ctrl+C no npm, ou em prod: sudo systemctl stop vekta-ai
```
