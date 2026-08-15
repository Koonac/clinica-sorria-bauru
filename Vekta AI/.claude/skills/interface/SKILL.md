---
name: interface
description: >-
  Contexto e entrega pela interface visual do Vekta Ai (pasta interface/). Use
  sempre que a mensagem vier do painel web/Electron — o canal injeta /interface
  uma vez no início da conversa (Galeria: /interface + /designer; Site:
  /interface + bloco de contexto do path do site). Garante páginas novas na
  navegação, arquivos (PDF, imagem, vídeo) com botão de download, perguntas
  interativas (vekta-pergunta) e resposta consumível no navegador — não só
  caminhos no terminal.
---

# /interface — Entrega pela interface Vekta Ai

Esta skill **não substitui** os especialistas (`designer`, `redator`, `planner`, agente `desenvolvedor`, etc.). Ela define o **contexto de canal** e as **regras de apresentação** quando o usuário fala pelo painel em `interface/`.

Você continua sendo o orquestrador do `CLAUDE.md`: escolha e execute a skill/agente certo via `Skill`/`Agent`. Depois, **empacote o resultado para a interface**.

## O que muda neste canal

1. O usuário **vê e interage no navegador** — caminhos absolutos de disco sozinhos não bastam.
2. Pedidos de “página / tela / painel / dashboard / visualização” dentro do Vekta Ai = **nova aba** em `interface/src/views/paginas/`, não site de marketing.
3. Arquivos gerados (PDF, PNG, JPG, MP4, etc.) = **caminho relativo ao projeto** + bloco `vekta-arquivo` (vira card com botão Baixar).
4. Escolhas com opções discretas = bloco `vekta-pergunta` (vira botões clicáveis no chat).

Sites públicos (landing, e-commerce) continuam com o agente `desenvolvedor` em `marketing/sites/`. Na **aba Site**, o preview embute o conteúdo de `VEKTA_SITE_DIR` e o chat dedicado é para alterar esse site.

## Fluxo

1. Interprete o pedido (na primeira mensagem da conversa o texto após `/interface` — e, na Galeria, após `/designer` — é o pedido real; no canal Site, após o bloco `[Contexto da aba Site]`; nas seguintes o texto chega sem o envelope).
2. Se precisar de especialista, execute-o normalmente (`Skill` / `Agent`). Na Galeria o `/designer` já veio no início da conversa; no canal Site, delegue alterações ao agente `desenvolvedor` (respeitando preview vs código — se o preview for `dist`, edite o fonte e rode `npm run build`); nos demais canais escolha a skill adequada.
3. Ao entregar, aplique uma das saídas abaixo conforme o tipo.

## Páginas novas na interface

Quando o pedido for uma **tela dentro do painel** (métricas, relatório interativo, listagem, checklist…):

Crie o par obrigatório (a navegação só registra se os dois existirem):

```
interface/src/views/paginas/<nome>.html
interface/src/views/paginas/<nome>.js
```

- `<nome>`: minúsculo, só letras/números/hífen (`metricas`, `relatorio-vendas`).
- Não edite `roteador.js` nem `index.html` — o servidor descobre as páginas sozinho.
- A aba nova aparece em tempo real (watcher `sistema:paginas`).

### Metadados no HTML

Primeira coisa do arquivo: comentário `vekta-pagina` com JSON válido:

```html
<!--vekta-pagina
{ "titulo": "Métricas", "icone": "lucide:chart-column", "ordem": 70 }
-->
<section id="aba-metricas" class="hidden h-full overflow-y-auto pt-8.5 px-10 pb-10 max-md:px-4 max-md:pt-5 max-md:pb-7">
  <!-- conteúdo -->
</section>
```

| Campo | Obrigatório | Notas |
|---|---|---|
| `titulo` | sim | Rótulo na nav |
| `icone` | recomendado | `lucide:...` (Iconify) |
| `ordem` | recomendado | Use **≥ 60** (páginas do sistema usam 10–50). Não use `principal: true` |

O `id` da `<section>` deve ser `aba-<nome>` (mesmo `<nome>` do arquivo).

### Módulo JS

Exporte `iniciar` (obrigatório). Exporte `atualizar` se a tela deve refrescar quando houver produção nova (`vekta-ai:producao-concluida`):

```js
import { $, el, api, CLASSE_PAINEL, CLASSE_BOTAO_PRIMARIO } from '../.core/util.js';

export async function iniciar() {
  // monta UI, fetch em /api/...
}

export async function atualizar() {
  return iniciar();
}
```

Reuse tokens/classes de `../.core/util.js` e o visual das páginas existentes (header com eyebrow mono + `font-display`, `CLASSE_PAINEL`, etc.). Não introduza framework novo.

### Dados e arquivos

- Conteúdo da empresa: ler de `.dna/`, `marketing/`, `saidas/`, `materiais/` (via APIs já existentes ou fetch `/raw/<caminho-relativo>` / `/api/arquivo?caminho=`).
- Pastas expostas em `/raw/`: `marketing`, `saidas`, `materiais`, `financeiro`, `rh`, `.dna` (e `tarefas.md`).
- Se precisar de endpoint novo, adicione rota/controller em `interface/src/` no mesmo padrão Express atual — só quando a página realmente precisar.

Ao terminar uma página, diga o nome da aba e o que ela mostra. Não peça refresh manual.

## Arquivos baixáveis (PDF, imagem, vídeo…)

Sempre que gerar ou apontar um arquivo para o usuário:

1. Salve-o onde a convenção do especialista mandar (`saidas/`, `marketing/…`, etc.).
2. Informe o **caminho relativo à raiz do projeto** (ex.: `saidas/analises/desempenho-2026.pdf`).
3. Emita o bloco interativo **no fim da resposta** (JSON completo e válido):

````
```vekta-arquivo
{ "arquivos": [
  { "caminho": "saidas/analises/desempenho-2026.pdf", "rotulo": "Relatório de desempenho" },
  { "caminho": "marketing/redes-sociais/post-1/post-1.png", "rotulo": "Post feed" }
] }
```
````

Forma curta (um arquivo):

````
```vekta-arquivo
{ "caminho": "saidas/analises/desempenho-2026.pdf", "rotulo": "Baixar PDF" }
```
````

Regras do bloco:
- `caminho` (string) é obrigatório em cada item — relativo à raiz, com `/`, sem `..`.
- `rotulo` é opcional (default: nome do arquivo).
- A interface monta card com caminho + botão **Baixar** (`/raw/<caminho>`).
- Também descreva o arquivo em texto — em transcrições sem UI o bloco ainda precisa fazer sentido.
- Não invente caminho: só emita o bloco depois que o arquivo existir no disco.

Peças visuais do `designer` na Galeria já aparecem na grade; mesmo assim, se o usuário pediu o arquivo no chat principal, emita `vekta-arquivo`.

### Imagens anexadas pelo usuário no chat

A interface grava automaticamente cada imagem/PDF anexado em `materiais/anexos/` e
inclui o(s) path(s) na mensagem enviada a você (`[Anexos disponíveis em disco…]`).
Quando o usuário pedir para **salvar, baixar, guardar ou mover** esse(s) anexo(s):

1. Acione a skill `salvar-imagem` (script `.scripts/salvar-imagem.py`). Com
   várias imagens, passe todos os pares `-i`/`-o` **no mesmo comando** (flags
   repetíveis) — não processe só a primeira.
2. Grave no destino pedido (default: `materiais/<nome-descritivo>.ext`).
3. Emita `vekta-arquivo` com o(s) caminho(s) final(is). Se forem várias, use
   obrigatoriamente `{ "arquivos": [ … ] }` num único bloco — nunca omita
   imagens do pedido.

Se ele só quiser baixar e o(s) arquivo(s) em `materiais/anexos/` já serve(m),
emita `vekta-arquivo` direto nesses paths (array se houver mais de um) — sem
copiar.

## Perguntas interativas ao usuário

Quando precisar que o usuário **escolha entre opções** (ex.: confirmar uma direção, decidir entre abordagens, priorizar) e a resposta mudar o que você faz em seguida, emita um **bloco de pergunta interativo**: a interface o transforma em botões clicáveis, e a escolha volta como a próxima mensagem do usuário. Use com parcimônia — só quando a decisão for realmente do usuário e houver opções discretas; para perguntas abertas, continue perguntando em texto normal.

Formato: bloco de código com a linguagem `vekta-pergunta` contendo um JSON. Emita-o **no fim da sua resposta** (é o ponto em que você para e espera a escolha):

````
```vekta-pergunta
{ "pergunta": "Qual abordagem prefere?", "multipla": false, "opcoes": [
  { "rotulo": "Rápida", "descricao": "Entrego uma versão simples hoje." },
  { "rotulo": "Completa", "descricao": "Levo mais tempo, cubro todos os casos." }
] }
```
````

Regras do bloco:
- `pergunta` (string) e `opcoes` (lista não vazia) são obrigatórios; `multipla` (bool, padrão `false`) permite selecionar mais de uma opção.
- Cada opção é `{ "rotulo": "...", "descricao": "..." }` — `descricao` é opcional. Uma opção também pode ser só uma string (vira o rótulo).
- Escreva o JSON **completo e válido** (a interface só monta os botões quando o bloco fecha). Não faça referência a "botões acima/abaixo" no texto — em transcrições sem a interface, a pergunta ainda precisa fazer sentido.
- A resposta chega como uma mensagem de usuário com o(s) rótulo(s) escolhido(s); siga a conversa a partir dela.

## O que esta skill NÃO faz

- Não escreve copy persuasiva, estratégia ou identidade visual — isso é dos especialistas.
- Não cria site de marketing (`marketing/sites/`) — isso é do `desenvolvedor`.
- Não substitui `/instalar` nem o `.dna`.
- Não usa a interface como desculpa para pular o especialista certo.

## Entrega

Responda de forma curta e acionável no painel: o que foi feito, onde está (aba ou caminho), o bloco `vekta-arquivo` quando houver arquivo, e o bloco `vekta-pergunta` quando precisar de uma escolha do usuário.
