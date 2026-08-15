---
name: html-to-image
description: Renderiza um HTML em imagem (PNG/JPEG) usando Chromium headless, via .scripts/html-to-image.py. Use sempre que o usuário pedir para transformar/converter HTML em imagem, gerar um print/screenshot de um HTML, ou exportar um layout HTML como PNG ou JPEG.
---

# HTML para Imagem

Transforma um HTML em imagem (PNG ou JPEG) renderizando-o no Chromium headless, via `.scripts/html-to-image.py`. O formato de saída é inferido pela extensão do `--output` (`.png` ou `.jpg`/`.jpeg`).

## Pré-requisitos

- Python 3. O script auto-instala o `playwright` e baixa o Chromium na primeira execução, se faltarem.

## Como rodar

Rode a partir da raiz do projeto:

```bash
python .scripts/html-to-image.py --html-file "<caminho/do/arquivo.html>" --output "<caminho/saida.png>"
```

A fonte do HTML é obrigatória e deve ser **uma** das duas opções:
- `--html-file` / `-f`: caminho de um arquivo `.html` a renderizar.
- `--html`: string HTML inline a renderizar.

Demais argumentos:
- `--output` / `-o` (obrigatório): caminho da imagem de saída. A extensão define o formato (`.png`, `.jpg`, `.jpeg`). Pastas faltando são criadas automaticamente.
- `--width` / `-w` (opcional): largura do viewport em px (default: 1080).
- `--height` (opcional): altura do viewport em px (default: 1080).
- `--scale` / `-s` (opcional): device scale factor para imagens nítidas/retina (default: 2.0).
- `--selector` (opcional): seletor CSS de um elemento específico a capturar, em vez do viewport/página inteira.
- `--full-page` (opcional): captura a página inteira (rolagem completa) em vez de só o viewport.
- `--quality` / `-q` (opcional): qualidade JPEG de 0 a 100 (ignorado para PNG).
- `--transparent` (opcional): fundo transparente (apenas PNG).
- `--wait` (opcional): tempo extra de espera em ms após o load, para animações/fontes terminarem (default: 0).

## Exemplos

```bash
# arquivo HTML -> PNG (viewport 1080x1080)
python .scripts/html-to-image.py -f "layout/post.html" -o "saida/post.png"

# HTML inline -> JPEG com qualidade definida
python .scripts/html-to-image.py --html "<h1>Olá</h1>" -o "saida/teste.jpg" -q 90

# captura apenas um elemento específico
python .scripts/html-to-image.py -f "layout/card.html" -o "saida/card.png" --selector ".card"

# página inteira (rolagem completa), com espera extra para fontes/animações
python .scripts/html-to-image.py -f "layout/pagina.html" -o "saida/pagina.png" --full-page --wait 500

# story 9:16 com fundo transparente
python .scripts/html-to-image.py -f "layout/story.html" -o "saida/story.png" -w 1080 --height 1920 --transparent
```

## Erros comuns

- `seletor não encontrado: <selector>` — o `--selector` informado não casa com nenhum elemento no HTML; confira o seletor CSS.
- Falha ao baixar o Chromium — o script avisa e tenta mesmo assim; se a renderização falhar, garanta acesso à internet e rode `python -m playwright install chromium` manualmente.
