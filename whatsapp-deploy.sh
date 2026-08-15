#!/usr/bin/env bash
# Deploy da API WhatsApp (wwebjs — rede interna, sem URL pública)
# git pull + rebuild do container wwebjs
#
# Uso:
#   bash whatsapp-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "==> [whatsapp] git pull"
git pull

echo "==> [whatsapp] build + up wwebjs"
docker compose -f "$COMPOSE_FILE" up -d --build wwebjs

echo "==> [whatsapp] OK — serviço interno wwebjs (sem porta pública)"
