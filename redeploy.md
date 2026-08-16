# Redeploy — implementar este projeto em outra VPS / outro domínio

> **Atualização:** o Frappe CRM (e MariaDB/Redis) foram removidos da stack Docker.
> O CRM atual é o **backend Laravel** (`backend/`, porta `127.0.0.1:8180` em prod).
> Painel: `https://clinica.vektaai.com.br` · AI: `https://aiclinica.vektaai.com.br`
> Este guia ainda menciona Frappe/`crm.*` em trechos antigos — ignore-os e use
> [`README.md`](README.md) + [`docker-compose.prod.yml`](docker-compose.prod.yml) como fonte de verdade.

Guia para copiar este monorepo e subir uma instalação **nova** (outro cliente, outro domínio, mesma VPS ou VPS limpa). Use os valores Ferri abaixo como **exemplo**; troque pelo seu prefixo/domínio antes de subir.

## Exemplo Ferri (referência)

| Peça | Onde | URL |
|------|------|-----|
| Interface Vekta AI | Host — systemd `ferri-ai` | `https://ai.ferricompany.com` |
| CRM (Frappe) | Docker — projeto `ferri-prod` | `https://crm.ferricompany.com/crm` |
| WhatsApp (wwebjs) | Docker — rede `ferri-network` | sem URL pública |

| Recurso | Valor Ferri |
|---------|-------------|
| Pasta da interface | `vekta-ai/` |
| Portas host | AI `5680`, CRM `8100`, Socket.IO `9100` |
| Projeto Compose | `ferri-prod` |
| Rede Docker | `ferri-network` |
| Volumes | `ferri-mariadb-data`, `ferri-frappe-bench`, `ferri-mongo-data`, `ferri-sessions-data` |
| Systemd | `ferri-ai.service` + `/etc/default/ferri-ai` |
| Nginx upstreams | `ferri_ai`, `ferri_frappe_web`, `ferri_frappe_socketio` |

Em outra instalação na **mesma** VPS, **todos** esses nomes devem ser únicos (não reutilize `vekta-prod`, `vekta_ai`, `frappe_web`, etc. de stacks vizinhas).

---

## A. Customizar antes de subir (outro cliente / domínio)

Defina placeholders, por exemplo:

```text
CLIENTE_SLUG=acme          # prefixo curto: acme-prod, acme-ai, acme_network…
AI_HOST=ai.acme.com
CRM_HOST=crm.acme.com
PORT_AI=5680               # mude se a porta já estiver em uso
PORT_CRM=8100
PORT_WS=9100
```

### A.1 Domínios

Troque `ai.ferricompany.com` / `crm.ferricompany.com` (e renomeie os arquivos nginx) em:

- `deploy/nginx/ai.*.conf` e `crm.*.conf` (`server_name`)
- `.env` / `.env.example` → `CRM_URL`, `VEKTA_FRAME_ANCESTORS`, `FRAPPE_SITE`
- `docker-compose.prod.yml` (defaults de `FRAPPE_SITE` / `VEKTA_FRAME_ANCESTORS`)
- `deploy/frappe/*.sh`, `deploy.sh`, `crm-deploy.sh`, `vekta-deploy.sh`

### A.2 Portas

Se `5680` / `8100` / `9100` já estiverem ocupadas:

- `deploy/systemd/ferri-ai.service` (`PORT=…`) — e renomeie a unit se necessário
- `deploy/nginx/*.conf` (upstreams `server 127.0.0.1:…`)
- `docker-compose.prod.yml` (`127.0.0.1:HOST:CONTAINER`)
- `deploy/host/setup-vekta-host.sh` (checks/`curl` da porta)

### A.3 Namespace (obrigatório se a VPS já tiver outra stack Vekta/Ferri)

| O quê | Trocar |
|-------|--------|
| Compose `name:` | `ferri-prod` → ex. `acme-prod` |
| Rede `name:` | `ferri-network` → ex. `acme-network` |
| Volumes `name:` | `ferri-*` → ex. `acme-*` |
| Systemd | `ferri-ai.service`, `/etc/default/ferri-ai`, script `ferri-ai-run.sh` |
| **Nginx `upstream`** | `ferri_ai`, `ferri_frappe_web`, `ferri_frappe_socketio` → nomes **únicos** |

Nginx falha com `duplicate upstream "…"` se dois sites-enabled usarem o mesmo nome de upstream (ex.: `vekta_ai` da stack antiga + conf novo). Sempre use prefixo do cliente.

### A.4 Secrets e DNA

- Gere `.env` novo (nunca copie secrets de outro ambiente).
- `vekta-ai/.dna/` ou skill `/instalar` na interface.

---

## B. Pré-requisitos na VPS

- Ubuntu/Debian, root/sudo
- Docker + Compose plugin, Nginx, Certbot (`python3-certbot-nginx`)
- Node.js **20+** para o usuário **não-root** do serviço (não só NVM do `root`)
- DNS A/AAAA: `AI_HOST` e `CRM_HOST` → IP da VPS

```bash
curl -4 ifconfig.me
dig +short ai.SEUDOMINIO.com
dig +short crm.SEUDOMINIO.com
```

Exemplo de path:

```bash
sudo mkdir -p /home/ferri-company   # ou /home/acme-production
sudo chown "$USER:$USER" /home/ferri-company
cd /home/ferri-company
# git clone …  OU  rsync/scp do monorepo
```

SSH típico: `ssh vps1` (alias no seu `~/.ssh/config`).

---

## C. Ambiente (`.env`)

```bash
cp .env.example .env
cp whatsapp-api/.env.example whatsapp-api/.env
```

No `.env` da raiz (ajuste o domínio):

```bash
CRM_URL=https://crm.SEUDOMINIO.com/crm
VEKTA_FRAME_ANCESTORS=https://ai.SEUDOMINIO.com
FRAPPE_SITE=crm.SEUDOMINIO.com
VEKTA_AI_COOKIE_SECURE=true
MYSQL_ROOT_PASSWORD=…          # senha FORTE; só vale na 1ª criação do volume
FRAPPE_ADMIN_PASSWORD=…
VEKTA_AI_USUARIO=…
VEKTA_AI_SENHA=…
VEKTA_AI_SESSION_SECRET=…      # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
VEKTA_CRM_SSO_SECRET=…         # MESMO valor no Frappe e na interface
```

Preencha também `whatsapp-api/.env` (Basic Auth, etc.). **Nunca** commite `.env`.

---

## D. Stack Docker

```bash
cd /caminho/do/monorepo
docker compose -f docker-compose.prod.yml up -d --build
```

Primeiro boot do bench pode demorar vários minutos.

### D.1 Site Frappe

```bash
bash deploy/frappe/create-crm-site.sh
# Se o site for crm.localhost e o domínio público for outro:
# bash deploy/frappe/add-crm-domain.sh
```

`FRAPPE_SITE` no `.env` deve ser o Host público (`crm.SEUDOMINIO.com`).

### D.2 Frontend do CRM (Vue)

Avisos de peer dependency no `yarn` são inofensivos.

**Na VPS ~4 GiB o `vite build` costuma morrer com OOM** (`Killed` / exit **137**), mesmo com heap reduzido. Preferência: **build local + upload**.

#### Opção 1 — Build na sua máquina + envio (recomendado)

Na máquina local (PowerShell, raiz do monorepo), com Docker:

```powershell
cd C:\Projetos\ferri-company   # ajuste o path

docker run --rm `
  -e FORCE_CRM_FRONTEND_BUILD=1 `
  -v "${PWD}/Crm:/workspace" `
  -w /workspace `
  node:20-bookworm `
  bash -lc "corepack enable; corepack prepare yarn@1.22.22 --activate; bash scripts/build-frontend-prod.sh"
```

Sucesso = `OK: /workspace/crm/public/frontend` e arquivos em:

- `Crm/crm/public/frontend/`
- `Crm/crm/www/crm.html`

Enviar (exemplo com host SSH `vps1`):

```powershell
scp -r Crm\crm\public\frontend vps1:/home/ferri-company/Crm/crm/public/
scp Crm\crm\www\crm.html vps1:/home/ferri-company/Crm/crm/www/crm.html
```

Na VPS — **não** rode `bench build --app crm` só por causa do SPA (esbuild pode falhar/OOM). Ligar assets + cache:

```bash
cd /home/ferri-company
ls Crm/crm/public/frontend/assets | head
ls -la Crm/crm/www/crm.html

docker compose -f docker-compose.prod.yml exec -T frappe bash -lc '
set -e
cd /home/frappe/frappe-bench
mkdir -p sites/assets/crm
rm -rf sites/assets/crm/frontend
ln -sfn /workspace/crm/public/frontend sites/assets/crm/frontend
ls sites/assets/crm/frontend/assets | head
bench --site crm.SEUDOMINIO.com clear-cache
bench --site crm.SEUDOMINIO.com clear-website-cache
echo OK
'
```

(Troque `crm.SEUDOMINIO.com` pelo `FRAPPE_SITE` do `.env`.)

#### Opção 2 — Build na própria VPS (só se houver RAM sobrando)

```bash
docker compose -f docker-compose.prod.yml stop wwebjs mongo
# Se houver outra stack na mesma VPS, pare-a também durante o build
FORCE_CRM_FRONTEND_BUILD=1 bash deploy/frappe/build-crm-frontend.sh
docker compose -f docker-compose.prod.yml up -d wwebjs mongo
```

Espere `OK: .../crm/public/frontend`. Se voltar ao prompt no `transforming...` sem `OK`, foi OOM — use a opção 1.

### D.3 MariaDB Access denied

```bash
bash deploy/frappe/repair-db-access.sh
```

`MYSQL_ROOT_PASSWORD` no `.env` precisa ser a senha **original** do volume.

---

## E. Nginx + HTTPS

### E.1 Ativar server blocks

```bash
sudo cp deploy/nginx/ai.SEUDOMINIO.com.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/crm.SEUDOMINIO.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/ai.SEUDOMINIO.com.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/crm.SEUDOMINIO.com.conf /etc/nginx/sites-enabled/

sudo nginx -t
sudo systemctl reload nginx
```

### E.2 Conflito `duplicate upstream`

Se `nginx -t` disser:

```text
duplicate upstream "vekta_ai" in .../ai.vektaai.com.br.conf
```

(ou `frappe_web` / outro nome), a stack antiga na mesma VPS já usa esse `upstream`. Nos confs **deste** projeto use nomes únicos (`ferri_ai`, `ferri_frappe_web`, `ferri_frappe_socketio` — ou `acme_ai`, etc.) e recopie:

```bash
sudo cp deploy/nginx/ai.*.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/crm.*.conf /etc/nginx/sites-available/
sudo nginx -t && sudo systemctl reload nginx
```

Não remova os confs da outra stack a menos que queira desligá-la. Só evite nomes de `upstream` iguais.

### E.3 Certbot (DNS já deve resolver)

```bash
sudo certbot --nginx -d ai.SEUDOMINIO.com
sudo certbot --nginx -d crm.SEUDOMINIO.com
```

Não referencie `fullchain.pem` antes do Certbot. Se o DNS ainda não apontar, o Certbot falha — espere e rode de novo.

---

## F. Interface Vekta no host (systemd)

O serviço **não** pode rodar como `root` (Claude CLI bloqueia `bypassPermissions`).

```bash
# sudo adduser --disabled-password --gecos "" vekta
# sudo chown -R vekta:vekta /caminho/do/monorepo

VEKTA_USER=vekta bash deploy/host/setup-vekta-host.sh --migrate
```

Sobe em `127.0.0.1:PORT_AI` (Ferri: `5680`), unit `ferri-ai` (ou o nome que você customizou).

### F.1 Login Claude (chat)

```bash
sudo -u vekta -H bash -lc 'claude'
```

---

## G. Checklist

```bash
curl -sI http://127.0.0.1:5680/ | head -n1
curl -sI http://127.0.0.1:8100/crm | head -n1
systemctl is-active ferri-ai
docker compose -f docker-compose.prod.yml ps

curl -sI https://ai.SEUDOMINIO.com/ | head -n1
curl -sI https://crm.SEUDOMINIO.com/crm | head -n1
```

Browser: login na AI → aba CRM (SSO) → mensagem no chat.

Containers esperados (prefixo do projeto Compose): `mariadb`, `redis`, `frappe`, `mongo`, `wwebjs`.

---

## H. Deploys seguintes

```bash
bash vekta-deploy.sh       # interface (git pull + npm + systemctl)
bash crm-deploy.sh         # CRM
bash whatsapp-deploy.sh    # wwebjs
bash deploy.sh             # Docker + restart interface
SKIP_PULL=1 bash vekta-deploy.sh
```

Após atualizar só o frontend Vue (build local de novo), reenvie `frontend/` + `crm.html` e rode o bloco de `ln -sfn` + `clear-cache` da seção D.2.

---

## I. Ordem resumida

```text
1. Customizar domínio / portas / namespace (A) — inclusive upstreams nginx únicos
2. DNS A/AAAA → IP da VPS
3. Copiar monorepo + .env (+ whatsapp-api/.env)
4. docker compose -f docker-compose.prod.yml up -d --build
5. bash deploy/frappe/create-crm-site.sh
6. Frontend: build local + scp + symlink assets + clear-cache  (ou build na VPS se houver RAM)
7. Nginx (sites-available/enabled) → nginx -t → reload
8. certbot --nginx -d ai.… -d crm.…
9. VEKTA_USER=… bash deploy/host/setup-vekta-host.sh --migrate
10. claude login como VEKTA_USER
11. Testar https://ai.… e https://crm.…/crm
```

---

## J. Armadilhas

| Problema | Causa / o que fazer |
|----------|---------------------|
| `duplicate upstream "vekta_ai"` (ou `frappe_web`) | Nginx: dois confs com o mesmo `upstream`. Use prefixo único (`ferri_*` / `acme_*`) |
| `pasta …/Vekta AI/interface` | Path correto: `vekta-ai/` |
| Porta em uso | Outra stack; mude 5680/8100/9100 |
| Projeto/rede/volume colide | Não reutilize `vekta-prod` / `vekta-network`; use `ferri-*` ou slug do cliente |
| Frontend `Killed` / exit **137** / some no `transforming...` | OOM na VPS — build local + scp (D.2 opção 1) |
| `bench build --app crm` quebra / exit 143 | Não é necessário para o SPA Vue; use symlink + `clear-cache` |
| CRM 404 de Host | `create-crm-site.sh` / `add-crm-domain.sh` com o domínio público |
| Cookie some no HTTPS | `VEKTA_AI_COOKIE_SECURE=true` |
| SSO falha | Mesmo `VEKTA_CRM_SSO_SECRET`; `VEKTA_FRAME_ANCESTORS` = URL da AI |
| Chat morto | Claude sem login no HOME do `VEKTA_USER` |
| MariaDB 1045 | Senha do `.env` ≠ volume; `repair-db-access.sh` |
| `FRAPPE_FORCE_NEW_SITE=1` | Apaga o site — só com wipe intencional |

---

## Referências

- [`docker-compose.prod.yml`](docker-compose.prod.yml)
- [`deploy/nginx/`](deploy/nginx/)
- [`deploy/host/setup-vekta-host.sh`](deploy/host/setup-vekta-host.sh)
- [`deploy/systemd/ferri-ai.service`](deploy/systemd/ferri-ai.service)
- [`Crm/scripts/build-frontend-prod.sh`](Crm/scripts/build-frontend-prod.sh)
- [`.env.example`](.env.example)
- [`README.md`](README.md)
