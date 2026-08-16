#!/usr/bin/env bash
# Deploy da interface Vekta AI no HOST (systemd) — https://aiclinica.vektaai.com.br
# git pull + npm install/build + systemctl restart clinica-ai
#
# Pré-requisito (uma vez na VPS):
#   bash deploy/host/setup-vekta-host.sh --migrate
#
# Uso:
#   bash vekta-deploy.sh
#
# Importante: use Node/npm system-wide (/usr/bin), não o NVM do root —
# sudo -u vekta não pode executar bins em /root/.nvm/...

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

INTERFACE_DIR="$ROOT/vekta-ai/interface"
SKIP_PULL="${SKIP_PULL:-0}"
SERVICE_NAME="${VEKTA_SERVICE:-clinica-ai}"

if [ ! -d "$INTERFACE_DIR" ]; then
  echo "erro: pasta não encontrada: $INTERFACE_DIR" >&2
  exit 1
fi

if [ "$SKIP_PULL" != "1" ]; then
  echo "==> [vekta] git pull"
  git pull
fi

if ! systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  echo "erro: serviço systemd ${SERVICE_NAME} não encontrado." >&2
  echo "  Instale/migre com: bash deploy/host/setup-vekta-host.sh --migrate" >&2
  exit 1
fi

# Preferir Node do serviço / system-wide (nunca /root/.nvm)
NODE_BIN="$(systemctl show -p Environment --value "${SERVICE_NAME}.service" 2>/dev/null \
  | tr ' ' '\n' | sed -n 's/^VEKTA_NODE_BIN=//p' | head -n1 || true)"
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  if [ -x /usr/bin/node ]; then
    NODE_BIN=/usr/bin/node
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi
NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
if [ -x "${NODE_DIR}/npm" ]; then
  NPM_BIN="${NODE_DIR}/npm"
elif [ -x /usr/bin/npm ]; then
  NPM_BIN=/usr/bin/npm
else
  NPM_BIN="$(command -v npm || true)"
fi

if [ -z "$NPM_BIN" ] || [ ! -x "$NPM_BIN" ]; then
  echo "erro: npm não encontrado (esperado /usr/bin/npm)" >&2
  exit 1
fi

case "$NPM_BIN" in
  /root/*)
    echo "erro: npm aponta para NVM do root ($NPM_BIN)." >&2
    echo "  Use o NodeSource: /usr/bin/npm  (PATH sem nvm, ou NODE_BIN=/usr/bin/node)" >&2
    exit 1
    ;;
esac

SERVICE_USER="$(systemctl show -p User --value "${SERVICE_NAME}.service" 2>/dev/null || true)"
if [ -z "$SERVICE_USER" ]; then
  SERVICE_USER=vekta
fi

run_as_service() {
  if [ "$(id -u)" -eq 0 ] && [ "$SERVICE_USER" != "root" ]; then
    # -H + PATH limpo: evita shebang do npm cair no Node errado / sudo bloquear /root/.nvm
    sudo -u "$SERVICE_USER" -H env \
      "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" \
      "HOME=$(getent passwd "$SERVICE_USER" | cut -d: -f6)" \
      "$NPM_BIN" "$@"
  elif [ "$SERVICE_USER" != "root" ] && [ "$(id -un)" != "$SERVICE_USER" ]; then
    sudo -u "$SERVICE_USER" -H env \
      "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" \
      "HOME=$(getent passwd "$SERVICE_USER" | cut -d: -f6)" \
      "$NPM_BIN" "$@"
  else
    env "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" "$NPM_BIN" "$@"
  fi
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "==> [vekta] node=$NODE_BIN npm=$NPM_BIN user=$SERVICE_USER"
echo "==> [vekta] npm install + build (CSS/Lucide)"
cd "$INTERFACE_DIR"
run_as_service install
run_as_service run css:build
run_as_service run lucide:build
cd "$ROOT"

WD="$(systemctl show -p WorkingDirectory --value "${SERVICE_NAME}.service" 2>/dev/null || true)"
if [ -n "$WD" ] && [ ! -d "$WD" ]; then
  echo "erro: WorkingDirectory da unit não existe: $WD" >&2
  echo "  reinstale a unit: bash deploy/host/setup-vekta-host.sh" >&2
  exit 1
fi

echo "==> [vekta] systemctl restart ${SERVICE_NAME}"
run_root systemctl restart "${SERVICE_NAME}.service"

sleep 1
if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  echo "==> [vekta] OK — https://aiclinica.vektaai.com.br (systemd active)"
else
  echo "erro: ${SERVICE_NAME} não ficou active — journalctl -u ${SERVICE_NAME} -n 80 --no-pager" >&2
  run_root systemctl --no-pager --full status "${SERVICE_NAME}.service" || true
  exit 1
fi
