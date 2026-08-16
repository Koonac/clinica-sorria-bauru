#!/usr/bin/env bash
# Wrapper do systemd: garante Xvfb (skills Playwright headed) e sobe a interface.
# Instalado/atualizado por deploy/host/setup-vekta-host.sh — não invocar à mão.

set -euo pipefail

INTERFACE_DIR="${VEKTA_INTERFACE_DIR:?VEKTA_INTERFACE_DIR ausente}"
NODE_BIN="${VEKTA_NODE_BIN:?VEKTA_NODE_BIN ausente}"
DISPLAY="${DISPLAY:-:99}"
export DISPLAY

if ! command -v xdpyinfo >/dev/null 2>&1 || ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
  if ! command -v Xvfb >/dev/null 2>&1; then
    echo "[vekta-ai-run] aviso: Xvfb ausente — skills headed podem falhar" >&2
  else
    echo "[vekta-ai-run] iniciando Xvfb em $DISPLAY"
    Xvfb "$DISPLAY" -screen 0 1280x900x24 -ac +extension GLX +render -noreset \
      >/tmp/clinica-xvfb.log 2>&1 &
    for _ in $(seq 1 50); do
      if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
        break
      fi
      sleep 0.1
    done
  fi
fi

cd "$INTERFACE_DIR"
exec "$NODE_BIN" src/app.js
