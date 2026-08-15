---
name: instagram-publish
description: >-
  Publica ou agenda post de imagem, carrossel, Reels ou Stories no Instagram da
  conta conectada (Meta API da interface), via .scripts/instagram-agendar.py.
  Use quando o usuário pedir para postar, publicar, agendar no Instagram,
  marcar um reel/story/carrossel, subir um post agora, ou enfileirar conteúdo
  na aba Agendar — inclusive a partir de anexos do chat em materiais/anexos/
  ou arquivos em materiais/.
---

# /instagram-publish — Publicar ou agendar no Instagram

Enfileira (e opcionalmente publica na hora) um **post de imagem**, **carrossel**,
**Reels** ou **Story** na mesma fila da aba Instagram → Agendar
(`materiais/instagram/`).

Não mede métricas (`instagram-analyst`) nem gera criativo (`designer` /
`html-to-image`). Aqui o assunto é **enviar para a conta conectada**.

## Pré-requisitos

- Python 3 (stdlib apenas — sem pip extra).
- Interface configurada: `META_ACCESS_TOKEN` em `interface/.env`.
- Para **publicar de verdade** (agora ou no horário): `META_PUBLIC_BASE_URL`
  com HTTPS alcançável pela Meta (túnel/domínio) **e** a interface rodando
  (serve `/api/instagram/public-media/...`). Sem isso o item fica na fila /
  erro — avise o usuário.
- Mídia já em disco. Anexos do chat: path em `[Anexos disponíveis em disco…]`
  (em geral `materiais/anexos/…`).
- Tipos:
  - **IMAGE** — 1× `.jpg` / `.jpeg` / `.png`
  - **CAROUSEL** — 2 a 10 imagens JPEG/PNG (`-i` repetido)
  - **REELS** — `.mp4` / `.mov`
  - **STORIES** — imagem ou vídeo
- Stories **não** aceitam legenda na API (é ignorada).

## Confirme antes de rodar

1. **Arquivo(s)** — path relativo à raiz do projeto.
2. **Tipo** — IMAGE, CAROUSEL, REELS ou STORIES.
3. **Legenda** — para IMAGE/CAROUSEL/REELS; em STORIES pode omitir.
4. **Quando** — “agora” → `--agora`; data/hora → `--quando` no **horário local**
   da máquina (`AAAA-MM-DDTHH:mm`).

Se faltar arquivo ou horário ambíguo, pergunte — não invente mídia.

## Como rodar

A partir da **raiz do projeto** (`Vekta AI/`):

```bash
# Post simples
python .scripts/instagram-agendar.py \
  --input "materiais/anexos/foto.jpg" \
  --tipo IMAGE \
  --legenda "Legenda" \
  --agora

# Carrossel (2–10 imagens)
python .scripts/instagram-agendar.py \
  --input "materiais/slides/1.jpg" \
  --input "materiais/slides/2.jpg" \
  --input "materiais/slides/3.jpg" \
  --tipo CAROUSEL \
  --legenda "Carrossel" \
  --quando "2026-07-26T18:00"

# Story
python .scripts/instagram-agendar.py \
  --input "materiais/anexos/story.jpg" \
  --tipo STORIES \
  --quando "2026-07-26T12:00"

python .scripts/instagram-agendar.py --listar
python .scripts/instagram-agendar.py --cancelar "ig-...."
```

O script imprime JSON no stdout. Leia-o para responder ao usuário.

## Fluxo

1. Resolva o(s) path(s) da mídia.
2. Defina o tipo e a legenda (se couber).
3. Rode o script com `--agora` ou `--quando`.
4. Interprete o JSON (`publicado`, `item`, `publish_erro`, `public_base_url_ok`).
5. Responda em português, curto: o que foi feito, quando, e o `id`.

## Limites

- Conta = token em `.env` (uma conta).
- Interface precisa estar rodando para a Meta baixar a mídia e para o poller.
- Carrossel v1: só imagens (sem vídeo nos slides).
- Stories: sem stickers/enquetes/links via API.
- Após publish OK as mídias somem de `materiais/instagram/midias/`; resta log.
