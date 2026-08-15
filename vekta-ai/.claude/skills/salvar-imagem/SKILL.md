---
name: salvar-imagem
description: >-
  Salva, copia ou disponibiliza para download uma ou mais imagens (ou PDFs)
  enviadas pelo usuário no chat da interface, via .scripts/salvar-imagem.py.
  Use sempre que o usuário pedir para salvar, baixar, guardar, mover ou exportar
  imagem(ns) / foto(s) / anexo(s) que ele acabou de enviar no chat (ou que
  estejam em materiais/anexos/).
---

# /salvar-imagem — Salvar anexo(s) do chat em disco

Quando o usuário **anexa imagem(ns) no chat** e pede para salvá-las, baixá-las ou
guardá-las em algum lugar do projeto, use esta skill. A interface já grava cada
anexo em `materiais/anexos/` no momento do envio e informa os caminhos na
mensagem (bloco `[Anexos disponíveis em disco…]`). Este script copia (ou move)
esses arquivos para o destino final.

**Regra crítica — várias imagens:** se houver **mais de um** path em
`[Anexos disponíveis em disco…]` e o usuário pedir para baixar/salvar (no
plural ou “todas”, “essas”, “as imagens”), processe **todas** no mesmo turno.
Não pare após a primeira. Emita **um único** bloco `vekta-arquivo` com o array
`arquivos` cobrindo todos os destinos.

## Pré-requisitos

- Python 3 (sem dependências extras).
- Os caminhos de origem devem existir — em geral algo como
  `materiais/anexos/20260725-161045123-00-foto.png`, listados na própria
  mensagem do usuário.

## Como rodar

A partir da raiz do projeto:

```bash
# uma imagem
python .scripts/salvar-imagem.py --input "<origem>" --output "<destino>"

# várias imagens no mesmo comando (flags repetíveis, mesma ordem)
python .scripts/salvar-imagem.py \
  -i "<origem1>" -o "<destino1>" \
  -i "<origem2>" -o "<destino2>"
```

Argumentos:
- `--input` / `-i`: arquivo de origem (o path em `materiais/anexos/…`).
  Repita a flag para cada arquivo.
- `--output` / `-o` (obrigatório): destino final. Pastas faltando são criadas.
  Com vários `-i`, repita `-o` na mesma ordem (mesma quantidade).
- `--move` (opcional): move em vez de copiar (remove a origem).
- `--base64-file` / `--base64`: alternativas raras se o arquivo de origem não
  existir e você tiver o base64 em mãos — prefira sempre `--input` (base64 só
  aceita um arquivo por execução).

Extensões aceitas: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.pdf`.

## Onde salvar

| Pedido do usuário | Destino sugerido |
|---|---|
| "salva essa imagem" / "baixa pra mim" (sem pasta) | `materiais/<nome-descritivo>.ext` |
| Várias imagens sem pasta | `materiais/<nome1>.ext`, `materiais/<nome2>.ext`, … |
| Foto/insumo para criativos | `materiais/<nome>.ext` |
| Logo da empresa | `.dna/logos/<nome>.ext` |
| Peça / referência de um job | pasta do job em `marketing/…` (se já existir) |

Use nomes descritivos curtos e **distintos** (ex.: `materiais/fachada-loja.jpg`,
`materiais/vitrine-noite.jpg`), não o timestamp do anexo.

## Fluxo na interface

1. Leia **todos** os paths em `[Anexos disponíveis em disco…]`.
2. Se for só baixar e os arquivos em `materiais/anexos/…` já servem:
   **não copie** — emita `vekta-arquivo` direto com esses paths.
3. Caso contrário, rode o script uma vez com todos os pares `-i`/`-o`.
4. Confirme que os arquivos existem.
5. Responda pelo envelope `/interface` e emita **um** bloco `vekta-arquivo`:

Uma imagem:

````
```vekta-arquivo
{ "caminho": "materiais/fachada-loja.jpg", "rotulo": "Imagem salva" }
```
````

Várias imagens (obrigatório usar o array — não emita só a primeira):

````
```vekta-arquivo
{ "arquivos": [
  { "caminho": "materiais/fachada-loja.jpg", "rotulo": "Fachada" },
  { "caminho": "materiais/vitrine-noite.jpg", "rotulo": "Vitrine" }
] }
```
````

## Exemplos

```bash
# um anexo → insumo permanente
python .scripts/salvar-imagem.py \
  -i "materiais/anexos/20260725-161045123-00-produto.png" \
  -o "materiais/produto-hero.png"

# dois anexos no mesmo pedido
python .scripts/salvar-imagem.py \
  -i "materiais/anexos/20260725-161045123-00-foto-a.png" \
  -o "materiais/foto-a.png" \
  -i "materiais/anexos/20260725-161045200-01-foto-b.png" \
  -o "materiais/foto-b.png"
```

## Limites

- Só salva o que já está em disco (ou base64 explícito). Não “extrai” a imagem
  da visão do modelo — o path vem do upload da interface.
- Não substitui `chatgpt-image` (gerar imagem por IA) nem `html-to-image`
  (render de HTML). Aqui o assunto é **anexo do usuário**.
- Se não houver bloco `[Anexos disponíveis em disco…]` e o usuário falar de
  “essa imagem”, peça que ele anexe de novo ou informe o caminho.
- Nunca responda como se tivesse baixado N arquivos se só processou 1.
