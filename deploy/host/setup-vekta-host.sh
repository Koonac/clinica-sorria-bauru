#!/usr/bin/env bash
# Instala a interface Vekta AI no HOST (systemd), fora do Docker.
#
# Uso (na VPS, na raiz do monorepo):
#   bash deploy/host/setup-vekta-host.sh              # deps + unit (não para o container)
#   bash deploy/host/setup-vekta-host.sh --migrate    # para o container e sobe o systemd
#
# Importante:
#   - NÃO rode o serviço como root (Claude CLI bloqueia bypassPermissions).
#   - Com NVM em /root/.nvm, use Node system-wide OU o NVM do VEKTA_USER.
#   - Ex.: VEKTA_USER=ubuntu bash deploy/host/setup-vekta-host.sh --migrate
#
# Variáveis opcionais:
#   VEKTA_USER   usuário do serviço (obrigatório se estiver como root)
#   NODE_BIN     caminho absoluto do node

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    --migrate) MIGRATE=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
  esac
done

# --- usuário do serviço (nunca root) ---
resolve_vekta_user() {
  if [ -n "${VEKTA_USER:-}" ]; then
    echo "$VEKTA_USER"
    return
  fi
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    echo "$SUDO_USER"
    return
  fi
  local owner
  owner="$(stat -c '%U' "$ROOT" 2>/dev/null || true)"
  if [ -n "$owner" ] && [ "$owner" != "root" ]; then
    echo "$owner"
    return
  fi
  echo ""
}

VEKTA_USER="$(resolve_vekta_user)"
if [ -z "$VEKTA_USER" ] || [ "$VEKTA_USER" = "root" ]; then
  cat >&2 <<'EOF'
erro: o serviço NÃO pode rodar como root (Claude CLI recusa bypassPermissions).

Defina um usuário não-root, por exemplo:
  VEKTA_USER=ubuntu bash deploy/host/setup-vekta-host.sh --migrate

Se o usuário ainda não existe:
  sudo adduser --disabled-password --gecos "" vekta
  sudo chown -R vekta:vekta /home/vekta-ai-production
  VEKTA_USER=vekta bash deploy/host/setup-vekta-host.sh --migrate
EOF
  exit 1
fi

if ! id "$VEKTA_USER" >/dev/null 2>&1; then
  echo "erro: usuário '$VEKTA_USER' não existe." >&2
  exit 1
fi

VEKTA_GROUP="$(id -gn "$VEKTA_USER")"
VEKTA_HOME="$(getent passwd "$VEKTA_USER" | cut -d: -f6)"
INTERFACE_DIR="$ROOT/Vekta AI/interface"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
UNIT_SRC="$ROOT/deploy/systemd/vekta-ai.service"
UNIT_DST="/etc/systemd/system/vekta-ai.service"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    env "$@"
  else
    sudo env "$@"
  fi
}

echo "==> [setup-vekta] root=$ROOT user=$VEKTA_USER home=$VEKTA_HOME"

if [ -z "$VEKTA_HOME" ]; then
  echo "erro: home de '$VEKTA_USER' não definido no passwd." >&2
  exit 1
fi

# User criado sem home (comum com adduser falho / user pré-existente)
if [ ! -d "$VEKTA_HOME" ]; then
  echo "==> [setup-vekta] criando home ausente: $VEKTA_HOME"
  run_root mkdir -p "$VEKTA_HOME"
  run_root cp -a /etc/skel/. "$VEKTA_HOME" 2>/dev/null || true
fi
run_root chown -R "$VEKTA_USER:$VEKTA_GROUP" "$VEKTA_HOME"

if [ ! -d "$INTERFACE_DIR" ]; then
  echo "erro: pasta da interface não encontrada: $INTERFACE_DIR" >&2
  exit 1
fi

if [ ! -f "$ROOT/.env" ] && [ ! -f "$INTERFACE_DIR/.env" ]; then
  echo "aviso: nem .env na raiz nem em interface/ — o login web vai falhar até criar um deles." >&2
fi

echo "==> [setup-vekta] pacotes do sistema"
if command -v apt-get >/dev/null 2>&1; then
  run_root DEBIAN_FRONTEND=noninteractive apt-get update -qq
  run_root DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl ffmpeg git python3 python3-pip python3-venv \
    xvfb x11-utils
else
  echo "aviso: apt-get ausente — instale manualmente: ffmpeg python3 xvfb curl git" >&2
fi

node_major() {
  local ver
  ver="$("$1" -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" || return 1
  [ -n "$ver" ] || return 1
  echo "$ver"
}

# --- Node 20+: preferir binário legível pelo VEKTA_USER (não /root/.nvm) ---
pick_node() {
  if [ -n "${NODE_BIN:-}" ]; then
    echo "$NODE_BIN"
    return
  fi
  local candidate from_user major
  from_user="$(sudo -u "$VEKTA_USER" -H bash -lc 'command -v node' 2>/dev/null || true)"
  for candidate in "$from_user" /usr/local/bin/node /usr/bin/node "$(command -v node 2>/dev/null || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    major="$(node_major "$candidate" || true)"
    if [ -n "$major" ] && [ "$major" -ge 20 ]; then
      echo "$candidate"
      return
    fi
  done
  echo ""
}

NODE_BIN="$(pick_node)"
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "==> [setup-vekta] Node 20+ ausente (sistema tem v12?) — instalando NodeSource 22.x"
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "erro: sem apt-get; instale Node 20+ manualmente." >&2
    exit 1
  fi
  curl -fsSL https://deb.nodesource.com/setup_22.x | run_root bash -
  run_root DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  hash -r 2>/dev/null || true
  NODE_BIN="$(pick_node)"
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  cat >&2 <<'EOF'
erro: Node.js 20+ ainda não encontrado após tentativa de instalação.

Confira:
  /usr/bin/node -v
  # deve ser v20+ (não v12)

Se ainda for v12:
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
EOF
  exit 1
fi

# npm ao lado do mesmo Node (evita shebang /usr/bin/env node → Node antigo)
NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
if [ -x "${NODE_DIR}/npm" ]; then
  NPM_BIN="${NODE_DIR}/npm"
elif command -v npm >/dev/null 2>&1; then
  NPM_BIN="$(command -v npm)"
else
  echo "erro: npm não encontrado ao lado de $NODE_BIN" >&2
  exit 1
fi

# Garante que `npm` (shebang env node) use ESTE node, não o Node antigo do apt
export PATH="${NODE_DIR}:$PATH"

# Se o node está sob /root/ e o serviço não é root, o systemd não vai conseguir executá-lo
case "$NODE_BIN" in
  /root/*)
    if [ "$VEKTA_USER" != "root" ]; then
      cat >&2 <<EOF
erro: Node está em $NODE_BIN (NVM do root), inacessível para '$VEKTA_USER'.

Instale Node system-wide e rode de novo:
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  hash -r
  VEKTA_USER=$VEKTA_USER bash deploy/host/setup-vekta-host.sh ${MIGRATE:+--migrate}
EOF
      exit 1
    fi
    ;;
esac

NODE_VER="$("$NODE_BIN" -v)"
echo "==> [setup-vekta] node=$NODE_BIN ($NODE_VER) npm=$NPM_BIN"

# npm como VEKTA_USER, sempre com PATH do Node certo
run_npm_user() {
  sudo -u "$VEKTA_USER" -H env "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin:$PATH" \
    "$NPM_BIN" "$@"
}

# Claude CLI: reutiliza se já estiver no PATH do serviço; senão instala em /usr/local
# (nunca em /root/.nvm — o user do serviço não acessa /root).
echo "==> [setup-vekta] Claude CLI"
CLAUDE_BIN="$(sudo -u "$VEKTA_USER" -H env "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" bash -c 'command -v claude' 2>/dev/null || true)"
if [ -n "$CLAUDE_BIN" ] && sudo -u "$VEKTA_USER" -H env "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" "$CLAUDE_BIN" --version >/dev/null 2>&1; then
  echo "    já disponível para $VEKTA_USER: $CLAUDE_BIN"
else
  echo "    instalando em /usr/local (npm -g --prefix /usr/local)"
  # remove symlink quebrado apontando para /root/.nvm
  if [ -L /usr/local/bin/claude ]; then
    case "$(readlink -f /usr/local/bin/claude 2>/dev/null || true)" in
      /root/*) run_root rm -f /usr/local/bin/claude ;;
    esac
  fi
  run_root env "PATH=${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" \
    "$NPM_BIN" install -g --prefix /usr/local @anthropic-ai/claude-code
  CLAUDE_BIN="/usr/local/bin/claude"
  if ! sudo -u "$VEKTA_USER" -H env "PATH=/usr/local/bin:/usr/bin:/bin" "$CLAUDE_BIN" --version >/dev/null 2>&1; then
    echo "erro: claude instalado mas inacessível para $VEKTA_USER ($CLAUDE_BIN)" >&2
    ls -la /usr/local/bin/claude /usr/local/lib/node_modules/@anthropic-ai/ 2>&1 || true
    exit 1
  fi
  echo "    ok: $CLAUDE_BIN"
fi

echo "==> [setup-vekta] deps Python (scripts / Playwright)"
pip_install() {
  # Ubuntu 22.04: pip antigo sem --break-system-packages; 24.04+ exige a flag (PEP 668).
  if run_root python3 -m pip install --help 2>/dev/null | grep -q -- '--break-system-packages'; then
    run_root python3 -m pip install --break-system-packages "$@"
  else
    run_root python3 -m pip install "$@"
  fi
}
pip_install --upgrade pip >/dev/null 2>&1 || true
pip_install playwright img2pdf
run_root python3 -m playwright install --with-deps chromium

echo "==> [setup-vekta] permissões do projeto para $VEKTA_USER"
run_root chown -R "$VEKTA_USER:$VEKTA_GROUP" "$ROOT/Vekta AI" || true

echo "==> [setup-vekta] npm install + build CSS/Lucide"
cd "$INTERFACE_DIR"
run_npm_user install
run_npm_user run css:build
run_npm_user run lucide:build
cd "$ROOT"

# PATH do serviço: node + bins globais (claude em /usr/local) + home
VEKTA_PATH="${NODE_DIR}:/usr/local/bin:/usr/bin:/bin:${VEKTA_HOME}/.local/bin"

RUN_SCRIPT="$ROOT/deploy/host/vekta-ai-run.sh"
chmod +x "$RUN_SCRIPT"

# systemd + paths com espaço: symlink estável sem espaço (evita \x20 / CHDIR)
VEKTA_LINK="${ROOT}/vekta-ai"
run_root ln -sfn "Vekta AI" "$VEKTA_LINK"
INTERFACE_DIR_UNIT="${VEKTA_LINK}/interface"

echo "==> [setup-vekta] /etc/default/vekta-ai (env sem espaço no path do arquivo)"
TMP_ENV="$(mktemp)"
cat > "$TMP_ENV" <<EOF
VEKTA_INTERFACE_DIR=${INTERFACE_DIR_UNIT}
VEKTA_NODE_BIN=${NODE_BIN}
EOF
if [ -f "$INTERFACE_DIR/.env" ]; then
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$INTERFACE_DIR/.env" >> "$TMP_ENV" || true
fi
run_root cp "$TMP_ENV" /etc/default/vekta-ai
run_root chmod 640 /etc/default/vekta-ai
run_root chown "root:$VEKTA_GROUP" /etc/default/vekta-ai
rm -f "$TMP_ENV"

echo "==> [setup-vekta] unit systemd → $UNIT_DST"
TMP_UNIT="$(mktemp)"
sed \
  -e "s|__VEKTA_USER__|${VEKTA_USER}|g" \
  -e "s|__VEKTA_GROUP__|${VEKTA_GROUP}|g" \
  -e "s|__VEKTA_HOME__|${VEKTA_HOME}|g" \
  -e "s|__VEKTA_ROOT__|${ROOT}|g" \
  -e "s|__VEKTA_INTERFACE_DIR__|${INTERFACE_DIR_UNIT}|g" \
  -e "s|__VEKTA_RUN_SCRIPT__|${RUN_SCRIPT}|g" \
  -e "s|__VEKTA_PATH__|${VEKTA_PATH}|g" \
  "$UNIT_SRC" > "$TMP_UNIT"
run_root cp "$TMP_UNIT" "$UNIT_DST"
rm -f "$TMP_UNIT"
run_root systemctl daemon-reload

if ! systemd-analyze verify "$UNIT_DST" 2>/tmp/vekta-unit-verify.err; then
  echo "erro: unit inválida — $(cat /tmp/vekta-unit-verify.err)" >&2
  echo "---- $UNIT_DST ----" >&2
  cat "$UNIT_DST" >&2
  exit 1
fi

run_root systemctl enable vekta-ai.service

if [ "$MIGRATE" -eq 1 ]; then
  echo "==> [setup-vekta] migrate: parando container vekta-interface (libera :4680)"
  docker compose -f "$COMPOSE_FILE" stop vekta-interface 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" rm -f vekta-interface 2>/dev/null || true
  # Nomes comuns: vekta-prod-vekta-interface-1, vekta-vekta-interface-1
  while read -r cid; do
    [ -n "$cid" ] || continue
    docker stop "$cid" 2>/dev/null || true
    docker rm -f "$cid" 2>/dev/null || true
  done < <(docker ps -aq --filter name=vekta-interface 2>/dev/null || true)

  if ss -ltn 2>/dev/null | grep -qE ':4680\s'; then
    echo "erro: porta 4680 ainda em uso. Liberte-a e rode: systemctl start vekta-ai" >&2
    ss -ltnp | grep 4680 || true
    exit 1
  fi

  echo "==> [setup-vekta] subindo systemd vekta-ai"
  run_root systemctl restart vekta-ai.service
  sleep 2
  run_root systemctl --no-pager --full status vekta-ai.service || true

  if curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:4680/" | grep -Eq '200|302|401'; then
    echo "==> [setup-vekta] OK — http://127.0.0.1:4680 responde"
  else
    echo "aviso: healthcheck local falhou — veja: journalctl -u vekta-ai -n 80 --no-pager" >&2
  fi

  echo "==> [setup-vekta] limpando órfãos do compose (CRM/WhatsApp seguem no ar)"
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
else
  echo
  echo "==> [setup-vekta] unit instalada (ainda NÃO iniciada)."
  echo "    Cutover:"
  echo "      VEKTA_USER=$VEKTA_USER bash deploy/host/setup-vekta-host.sh --migrate"
fi

if [ ! -f "${VEKTA_HOME}/.claude/.claude.json" ] && [ ! -f "${VEKTA_HOME}/.claude.json" ]; then
  echo
  echo "aviso: Claude CLI parece sem login para $VEKTA_USER."
  echo "  sudo -u $VEKTA_USER -H env PATH=${NODE_DIR}:\$PATH claude"
  echo "  (ou copie ~/.claude do volume antigo para ${VEKTA_HOME}/.claude)"
fi

echo "==> [setup-vekta] concluído"
