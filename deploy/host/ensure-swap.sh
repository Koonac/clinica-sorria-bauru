#!/usr/bin/env bash
# Cria/ativa swap de 4G no host (necessário para vite build do CRM em VPS ~4GB).
# Uso:
#   sudo bash deploy/host/ensure-swap.sh

set -euo pipefail

SWAPFILE="${SWAPFILE:-/swapfile}"
SIZE_GB="${SWAP_SIZE_GB:-4}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root: sudo bash $0"
  exit 1
fi

echo "==> Memória antes"
free -h

if swapon --show | grep -q .; then
  echo "==> Swap já ativo:"
  swapon --show
  free -h
  exit 0
fi

echo "==> Criando ${SWAPFILE} (${SIZE_GB}G)"
swapoff "$SWAPFILE" 2>/dev/null || true
rm -f "$SWAPFILE"

if ! fallocate -l "${SIZE_GB}G" "$SWAPFILE" 2>/dev/null; then
  echo "fallocate falhou — usando dd"
  dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SIZE_GB * 1024)) status=progress
fi

chmod 600 "$SWAPFILE"
mkswap "$SWAPFILE"
swapon "$SWAPFILE"

if ! grep -q "^${SWAPFILE} " /etc/fstab 2>/dev/null; then
  echo "${SWAPFILE} none swap sw 0 0" >> /etc/fstab
fi

echo "==> Memória depois"
swapon --show
free -h
echo "OK"
