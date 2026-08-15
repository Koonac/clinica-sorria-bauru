---
name: image-to-pdf
description: Junta uma ou mais imagens (PNG/JPEG) em um único PDF, uma imagem por página, via .scripts/image-to-pdf.py. Use sempre que o usuário pedir para transformar/converter imagens em PDF, juntar slides/criativos num PDF, ou exportar uma apresentação de PNGs como um arquivo PDF.
---

# Imagem para PDF

Junta uma ou mais imagens (PNG/JPEG) em um único PDF, **uma imagem por página**, via `.scripts/image-to-pdf.py`. Usa o `img2pdf`, que embute as imagens **sem recompressão** — a qualidade original é preservada (ideal para apresentações geradas pela skill `html-to-image`).

## Pré-requisitos

- Python 3. O script auto-instala o `img2pdf` na primeira execução, se faltar.

## Como rodar

Rode a partir da raiz do projeto. A fonte das imagens é obrigatória e deve ser **uma** das duas opções:

- `--input` / `-i`: lista de caminhos de imagens, **na ordem desejada** (uma página por imagem).
- `--glob` / `-g`: padrão glob para selecionar as imagens.

```bash
# por glob (ordenado alfabeticamente -> use nomes como 01-, 02-, ...)
python .scripts/image-to-pdf.py --glob "saida/apresentacao/*.png" --output "saida/apresentacao.pdf"

# por lista explícita, na ordem dada
python .scripts/image-to-pdf.py -i capa.png dor.png cta.png -o proposta.pdf
```

Demais argumentos:
- `--output` / `-o` (obrigatório): caminho do PDF de saída. Pastas faltando são criadas automaticamente.
- `--no-sort` (opcional): não ordena os arquivos. Por padrão a lista é ordenada alfabeticamente (tanto para `--input` quanto para `--glob`); use `--no-sort` para preservar a ordem exata passada em `--input` ou a ordem natural do glob.

## Dica de ordenação

Como a ordenação padrão é alfabética, nomeie os arquivos com prefixo numérico com zero à esquerda (`01-capa.png`, `02-dor.png`, …, `10-...`) para garantir a sequência correta das páginas.

## Exemplos

```bash
# apresentação completa de slides -> PDF único
python .scripts/image-to-pdf.py -g "marketing/propostas/apresentacao/*.png" -o "marketing/propostas/Proposta.pdf"

# ordem manual específica, sem reordenar
python .scripts/image-to-pdf.py -i slide-final.png slide-inicial.png -o fora-de-ordem.pdf --no-sort
```

## Erros comuns

- `nenhuma imagem encontrada para juntar` — o `--glob` não casou com nenhum arquivo; confira o caminho/padrão.
- `arquivo(s) não encontrado(s)` — algum caminho em `--input` está errado; confira os nomes.
