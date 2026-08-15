#!/usr/bin/env bash
# Deploy geral: git pull + rebuild da stack Docker (Backend CRM + WhatsApp) + restart Vekta no host
#
# Uso:
#   bash deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"

echo "==> [geral] git pull"
git pull

echo "==> [geral] build + up (Backend CRM + WhatsApp)"
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo "==> [geral] migrate backend"
docker compose -f "$COMPOSE_FILE" exec -T backend php artisan migrate --force \
  || echo "aviso: migrate pulado (backend ainda iniciando)"

echo "==> [geral] health backend"
docker compose -f "$COMPOSE_FILE" exec -T backend curl -fsS http://127.0.0.1:8000/up >/dev/null \
  || echo "aviso: backend ainda iniciando — confira: docker compose -f $COMPOSE_FILE logs backend"

echo "==> [geral] restart Vekta no host (systemd)"
if systemctl cat vekta-ai.service >/dev/null 2>&1; then
  SKIP_PULL=1 bash "$ROOT/vekta-deploy.sh" \
    || echo "aviso: vekta-deploy falhou — rode: bash vekta-deploy.sh"
else
  echo "aviso: vekta-ai.service ausente — rode: bash deploy/host/setup-vekta-host.sh --migrate"
fi

echo "==> [geral] OK"
echo "    Vekta:    https://ai.vektaai.com.br  (host / systemd)"
echo "    Backend:  http://127.0.0.1:8080  (BACKEND_URL na interface)"
echo "    WhatsApp: interno (wwebjs)"
