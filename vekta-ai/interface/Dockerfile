# OBSOLETO para produção: a interface roda no host (systemd vekta-ai).
# Ver: deploy/host/setup-vekta-host.sh e deploy/systemd/vekta-ai.service
# Mantido só como referência de deps (Node + Claude CLI + Python/Playwright).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    git \
    gosu \
    python3 \
    python3-pip \
    python3-venv \
    # Display virtual para Playwright headed (chatgpt-image.py / Cloudflare)
    xvfb \
    x11-utils \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

# Binário `claude` usado pelo chat (spawn em claude.service.js)
RUN npm install -g @anthropic-ai/claude-code

# Deps dos scripts em Vekta AI/.scripts (html-to-image/video, image-to-pdf, instagram-scraper)
RUN pip3 install --no-cache-dir --break-system-packages playwright img2pdf \
    && playwright install --with-deps chromium

WORKDIR /workspace/interface

COPY package.json package-lock.json ./
COPY scripts ./scripts/

# postinstall (copy-vendor-libs) + deps de build (tailwind/lucide)
RUN npm ci

COPY . .

RUN npm run css:build && npm run lucide:build \
    && npm prune --omit=dev \
    && chown -R node:node /workspace

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4680

ENV HOST=0.0.0.0
ENV PORT=4680
ENV NODE_ENV=production
ENV CLAUDE_CONFIG_DIR=/claude-config
ENV HOME=/home/node
ENV DISPLAY=:99

# Entrypoint sobe como root só para ajustar mounts; o processo roda como `node`
# (Claude CLI recusa bypassPermissions com root/sudo).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/app.js"]
