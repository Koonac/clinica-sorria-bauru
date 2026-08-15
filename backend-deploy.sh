#!/usr/bin/env bash
# Deploy do backend Laravel (API + queue + postgres)
# git pull + rebuild dos containers backend / backend-queue
#
# Uso:
#   bash backend-deploy.sh
#   bash backend-deploy.sh --seed   # roda AdminUserSeeder (imprime token uma vez)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SEED=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
  esac
done

if [ ! -f backend/.env ]; then
  echo "erro: falta backend/.env — copie de backend/.env.example e preencha APP_KEY / DB_PASSWORD" >&2
  exit 1
fi

echo "==> [backend] git pull"
git pull

echo "==> [backend] build + up postgres backend backend-queue"
docker compose -f "$COMPOSE_FILE" up -d --build postgres backend backend-queue

if [ "$SEED" = "1" ]; then
  echo "==> [backend] AdminUserSeeder (token da interface)"
  docker compose -f "$COMPOSE_FILE" exec -T backend php artisan db:seed --class=AdminUserSeeder --force
fi

echo "==> [backend] OK — API em http://127.0.0.1:8080 (health: /up)"
echo "    Interface: BACKEND_URL=http://127.0.0.1:8080 + BACKEND_API_TOKEN no .env da raiz / interface"
