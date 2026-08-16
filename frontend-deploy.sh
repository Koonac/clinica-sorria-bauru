#!/usr/bin/env bash
# Deploy do painel Vue (SPA nginx)
# git pull + rebuild do container frontend
#
# Uso:
#   bash frontend-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo "==> [frontend] git pull"
git pull

echo "==> [frontend] build + up frontend"
docker compose -f "$COMPOSE_FILE" up -d --build frontend

echo "==> [frontend] OK — painel em http://127.0.0.1:${FRONTEND_PORT:-8181}"
echo "    Público: https://clinica.vektaai.com.br (deploy/nginx/clinica.vektaai.com.br.conf)"
