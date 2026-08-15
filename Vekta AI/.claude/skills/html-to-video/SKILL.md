---
name: html-to-video
description: Renderiza um HTML animado em vídeo (MP4/WebM/GIF) usando Chromium headless + ffmpeg, via .scripts/html-to-video.py. Use sempre que o usuário pedir para transformar/converter HTML em vídeo, gerar um Reels/Stories a partir de HTML animado, ou exportar uma animação HTML como MP4, WebM ou GIF.
---

# HTML para Vídeo

Transforma um HTML animado em vídeo (MP4, WebM ou GIF) renderizando-o no Chromium headless e montando os frames com ffmpeg, via `.scripts/html-to-video.py`.

O tempo das animações CSS é controlado frame a frame via `animation.currentTime` — não depende de tempo real, por isso cada frame é capturado com precisão independentemente da velocidade da máquina.

## Pré-requisitos

- Python 3. O script auto-instala o `playwright` e baixa o Chromium na primeira execução, se faltarem.
- `ffmpeg` instalado e disponível no PATH.

## Como rodar

Rode a partir da raiz do projeto:

```bash
python .scripts/html-to-video.py --html-file "<caminho/do/arquivo.html>" --output "<caminho/saida.mp4>"
```

A fonte do HTML é obrigatória e deve ser **uma** das duas opções:
- `--html-file` / `-f`: caminho de um arquivo `.html` a renderizar.
- `--html`: string HTML inline a renderizar.

Demais argumentos:
- `--output` / `-o` (obrigatório): caminho do vídeo de saída. A extensão define o formato: `.mp4`, `.webm` ou `.gif`. Pastas faltando são criadas automaticamente.
- `--duration` / `-d` (opcional): duração total da captura em segundos (default: 3).
- `--fps` (opcional): frames por segundo (default: 30).
- `--width` / `-w` (opcional): largura do viewport em px (default: 1080).
- `--height` (opcional): altura do viewport em px (default: 1080).
- `--scale` / `-s` (opcional): device scale factor (default: 1.0).
- `--wait` (opcional): espera em ms após o load, antes de iniciar a captura (default: 500).
- `--selector` (opcional): seletor CSS de um elemento específico a capturar, em vez do viewport inteiro.
- `--crf` (opcional): qualidade do MP4/WebM — menor = melhor (default: 18).
- `--keep-frames` (opcional): mantém a pasta de frames PNG temporários após a renderização.

## Exemplos

```bash
# Reels 9:16, 12 segundos, 30fps
python .scripts/html-to-video.py -f "animacao-reels.html" -o "saida/reels.mp4" --duration 12 --fps 30 --width 1080 --height 1920 --wait 0

# Post quadrado, 5 segundos, alta qualidade
python .scripts/html-to-video.py -f "animacao-post.html" -o "saida/post.mp4" --duration 5 --width 1080 --height 1080

# GIF animado 800x800
python .scripts/html-to-video.py -f "animacao.html" -o "saida/animacao.gif" --duration 4 --fps 24 --width 800 --height 800

# Captura apenas um elemento específico
python .scripts/html-to-video.py -f "animacao.html" -o "saida/clip.mp4" --selector ".card" --duration 3

# Mantém frames para inspecionar individualmente
python .scripts/html-to-video.py -f "animacao.html" -o "saida/video.mp4" --duration 6 --keep-frames
```

## Formatos de saída

| Extensão | Codec | Ideal para |
|---|---|---|
| `.mp4` | H.264 | Publicação em redes sociais (Instagram, TikTok, WhatsApp) |
| `.webm` | VP9 | Web, embeds |
| `.gif` | Palette GIF | Miniaturas animadas, preview |

## Notas importantes

- **Animações CSS**: o script controla o tempo via `animation.currentTime` — cada frame é posicionado com precisão. A animação não precisa estar configurada para loop.
- **Fontes externas (Google Fonts)**: carregadas normalmente durante `networkidle`. Se não houver internet, o browser usará as fontes de fallback definidas no CSS.
- **`--wait 0`**: recomendado para animações que começam imediatamente no load. Use valores maiores (ex: `--wait 500`) se o HTML precisa de tempo extra para carregar recursos.
- **GIF**: gera automaticamente uma paleta de cores dedicada para maior fidelidade visual.

## Erros comuns

- `ffmpeg não encontrado` — instale o ffmpeg e garanta que está no PATH. Verifique com `ffmpeg -version`.
- `seletor não encontrado: <selector>` — o `--selector` não casa com nenhum elemento; confira o seletor CSS.
- Frames em branco ou animação congelada — verifique se o HTML usa `animation-fill-mode: forwards` e se o `--duration` cobre toda a animação.
