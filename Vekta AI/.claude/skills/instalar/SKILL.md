---
name: instalar
description: Instala o Vekta Ai em uma empresa. Cria as pastas base do sistema (a pasta .dna e .dna/logos/), coleta todo o contexto necessário para preencher os arquivos de contexto — via entrevista guiada OU a partir de uma transcrição detalhada fornecida pelo usuário, solicitando o que faltar — e personaliza a interface (interface/) com o nome da empresa + "AI", a cor de destaque e a logo do cliente. Use quando o Vekta Ai for instalado em uma empresa nova ou quando os arquivos de contexto em .dna estiverem vazios/incompletos.
---

# /instalar — Instalação do Vekta Ai na empresa

Esta skill prepara o Vekta Ai para operar em uma empresa: cria a estrutura de pastas base, preenche os arquivos de contexto da pasta `.dna` (fonte canônica de tudo que o Vekta Ai consome) e personaliza a interface local com o **nome da empresa + "AI"**, a cor de destaque e a logo da marca. Ela **não** produz peças de marketing — só coleta/grava contexto e ajusta a casca visual da interface.

## 1. Crie a estrutura base

Antes de coletar dados, garanta que toda a estrutura de pastas do Vekta Ai existe. Ela é usada durante todo o processo:

- `.dna/` — fonte canônica de contexto da empresa (detalhada abaixo).
- `.dna/logos/` — arquivos de logo.
- `materiais/` — insumos brutos que o Vekta Ai solicita à empresa ao longo do trabalho: imagens reais (para criativos, carrosséis), feedbacks de clientes, documentos e qualquer material fornecido pelo usuário sob demanda.
- `marketing/` — peças e conteúdo de marketing produzidos para a empresa (posts, criativos, campanhas).
- `saidas/` — entregas pontuais e análises geradas pelo Vekta Ai (documentos avulsos).
- `tarefas.md` — pipeline de tarefas do Vekta Ai.

Crie as pastas que faltarem e, se `tarefas.md` não existir, crie-o com um cabeçalho inicial (ex.: `# Pipeline de tarefas`). Não sobrescreva o que já existir.

Em seguida, com `Glob`/`Read`, verifique o que já existe e está **de fato preenchido** (arquivo vazio, com placeholder ou genérico demais conta como faltante). Monte a lista do que falta — não recolha o que já está bem preenchido.

Arquivos-alvo em `.dna/`:
- **`sobre.md`** — quem é a empresa: história, posicionamento e o que ela faz.
- **`metas.md`** — objetivos e metas de crescimento (incluindo KPIs, quando definidos).
- **`publico_alvo.md`** — perfis, dores e características do público.
- **`identidade_visual.md`** — paleta de cores, tipografia e regras de uso da marca.
- **`logos/`** — arquivos de logo da empresa.

## 2. Escolha o modo de coleta

Logo no início, pergunte ao usuário como ele prefere fornecer as informações:

- **Modo entrevista:** você faz as perguntas, seção por seção (ver roteiro abaixo).
- **Modo transcrição:** o usuário cola um texto/descrição detalhada da empresa (apresentação, briefing, site, documento interno). Você lê, extrai o que conseguir para cada arquivo e **identifica as lacunas** — depois pergunta ao usuário apenas o que ficou faltando para completar os arquivos.

Os dois modos convergem para o mesmo resultado: os arquivos de `.dna` preenchidos. Na transcrição, sempre faça a passada de lacunas antes de dar por concluído.

## 3. Roteiro de perguntas (por arquivo)

Pergunte por seção (um bloco por arquivo, não tudo de uma vez), só sobre o que estiver faltando.

### `sobre.md`
1. Qual é o nome oficial da empresa e, em uma frase, o que ela faz?
2. Como ela começou / qual problema resolve?
3. Como ela se posiciona no mercado e qual seu principal diferencial?

### `metas.md`
1. Quais são os objetivos de crescimento da empresa (curto e médio prazo)?
2. Há metas mensuráveis / KPIs (faturamento, leads, seguidores, vendas)?
3. Qual o principal resultado que a empresa espera do marketing?

### `publico_alvo.md`
1. Quem é o cliente ideal (perfil, contexto, características)?
2. Quais dores/problemas esse cliente tem que a empresa resolve?
3. O que ele deseja alcançar? Há mais de uma persona relevante?

### `identidade_visual.md`
1. Quais são as cores oficiais da marca (hex, se souber)?
2. Dentre essas cores, qual é a cor de destaque/principal (a que aparece em botões, links e CTAs)? — é ela que vai personalizar a interface do Vekta Ai (ver passo 5).
3. Qual(is) a(s) tipografia(s) oficial(is)?
4. Há regras de uso da marca (o que evitar, proporções, fundo)?

### `logos/`
1. Já existem arquivos de logo prontos? Se sim, peça o caminho para copiá-los para `.dna/logos/`.

## 4. Grave os arquivos

- Redija cada `.md` **imediatamente** após coletar as informações daquela seção — não espere terminar tudo.
- Use Markdown limpo, com headings claros: esses arquivos são lidos por mim (Vekta Ai) e pelos agentes.
- Ao salvar cada arquivo, confirme ao usuário o que foi escrito e pergunte se quer ajustar.
- **Nunca invente.** Se o usuário não souber algo, registre como `(a definir)` e siga — não preencha com suposições.

## 5. Personalize a interface do cliente

A interface local (`interface/`) vem com o nome genérico **"Vekta Ai"**, uma cor de marca genérica (verde) e um "orbe" decorativo em CSS no lugar de uma logo. Depois que o nome oficial da empresa estiver em `sobre.md`, personalize a interface com o que foi coletado: **sempre** o nome da interface; e, quando disponíveis, a cor de destaque e/ou a logo. Não invente cor nem logo.

Aplique nesta ordem: **nome → cor → logo**.

### Nome da interface

O nome exibido na interface deve ser o da empresa do cliente + o sufixo **" AI"** (com espaço e "AI" em maiúsculas). Exemplos:

| Nome oficial da empresa | Nome da interface |
|---|---|
| Dias Bueno | **Dias Bueno AI** (ou **Dias AI**, se o usuário preferir simplificar) |
| CheckVideo | **CheckVideo AI** |
| Acme Soluções | **Acme Soluções AI** (ou **Acme AI**) |

1. Pegue o nome oficial da empresa em `sobre.md`.
2. Monte a proposta padrão: `{Nome Oficial} AI` (preserve capitalização já registrada; se vier tudo minúsculo, capitalize cada palavra).
3. Se o nome tiver **mais de uma palavra**, ofereça também uma versão simplificada (`{Primeira palavra ou marca principal} AI`) e **pergunte ao usuário qual prefere** — use o bloco `vekta-pergunta` quando houver opções claras. Se tiver uma só palavra/marca (ex.: CheckVideo), aplique `{Nome} AI` sem perguntar.
4. Defina também o **nome curto** = a parte antes de ` AI` (ex.: "Dias Bueno", "Dias", "CheckVideo") — usado só nos status "… ativo" / "… pensando…".
5. Edite estes pontos (substitua todo "Vekta Ai" / "Vekta" de marca da casca pelo nome novo; **não** reescreva comentários de código nem textos de sistema/README):

   | Arquivo | O que mudar |
   |---|---|
   | `interface/public/index.html` | `<title>…</title>` → nome da interface; `title` do `#orbe` → nome da interface; texto do `<strong>` na sidebar → nome da interface; texto inicial de `#orbe-status` → `{nome curto} ativo` |
   | `interface/src/views/paginas/chat.js` | Em `definirOcupado`: `'Vekta pensando…'` → `'{nome curto} pensando…'`; `'Vekta ativo'` → `'{nome curto} ativo'` |
   | `interface/electron/main.js` | `title: 'Vekta Ai'` na `BrowserWindow` → nome da interface |
   | `interface/package.json` | `"productName": "Vekta Ai"` → nome da interface |

Não altere copy de telas internas que falem do agente de forma genérica (boas-vindas do chat, placeholders, DNA, galeria etc.) neste passo — só a **casca** (título da janela/aba, marca na sidebar e status do orbe).

### Cor de destaque

1. Se `identidade_visual.md` ainda não tiver cor de destaque, pule este subtítulo.
2. Pegue o hex da cor de destaque/principal definida em `identidade_visual.md` (pergunta 2 do roteiro acima).
3. Calcule as três variantes usadas pelo tema:
   - `--color-vekta`: o hex primário, como está (ex.: `#2563eb`).
   - `--color-vekta-escuro`: cada canal RGB do primário × 0.8, arredondado (ex.: `#2563eb` → R 37×0.8≈30, G 99×0.8≈79, B 235×0.8≈188 → `#1e4fbc`).
   - `--color-vekta-suave`: `rgba(R, G, B, 0.16)` do primário (ex.: `rgba(37, 99, 235, 0.16)`).
4. Edite `interface/src/styles/tailwind.css`, dentro do bloco `@theme`, substituindo os valores atuais de `--color-vekta`, `--color-vekta-escuro` e `--color-vekta-suave` pelos calculados. Não mexa nas demais cores do tema (`--color-fundo`, `--color-superficie`, `--color-tinta` etc.) — são neutras da interface, não da marca do cliente.
5. Edite `interface/public/index.html`, na tag `<link rel="icon" ...>`: troque `%230E8A76` (a cor do anel do favicon) pelo novo hex primário, no mesmo formato (`%23` + hex em maiúsculas sem `#`). Não mude `%230A0B0F` (fundo do favicon).
6. Rode `npm run css:build` dentro de `interface/` para recompilar `public/css/tailwind.css` imediatamente, sem esperar o próximo `npm start`.

Isso já revincula automaticamente o anel-logo, botões, links ativos, ícones e scrollbar em toda a interface — nenhuma outra edição de CSS é necessária.

### Logo

**Sempre use a logo do cliente na interface quando houver arquivo em `.dna/logos/`.** Não deixe o anel CSS genérico se a logo já foi coletada.

1. Veja se `.dna/logos/` tem algum arquivo de imagem. Se houver mais de um, prefira um `.svg`; senão use o primeiro `.png`/`.jpg`/`.jpeg`/`.webp`.
2. Se houver um arquivo, troque o elemento decorativo da barra lateral em `interface/public/index.html` (use o **nome da interface** definido acima no `title` e no `alt`):
   - De: `<div id="orbe" class="orbe-anel relative w-9 h-9 shrink-0 rounded-full" title="…"></div>`
   - Para: `<img id="orbe" src="/raw/.dna/logos/<nome-do-arquivo>" alt="Logo <nome da interface>" class="w-9 h-9 shrink-0 object-contain" title="<nome da interface>" />`
3. Se `.dna/logos/` estiver vazia, peça a logo ao usuário antes de concluir a instalação; se ele não tiver no momento, mantenha o anel CSS padrão (já com a cor de destaque, se aplicada) e registre `(a definir)` em `identidade_visual.md` / nas notas do passo — não invente logo.
4. Não é preciso duplicar a logo nos outros dois anéis decorativos (tela de boas-vindas do chat e cabeçalho da aba DNA) — são o mesmo anel CSS e já herdam a cor nova automaticamente.

Ao concluir este passo, confirme ao usuário o que foi aplicado (**nome da interface**, cor de destaque, se a logo foi aplicada ou se o anel padrão ficou) e, se a interface já estiver rodando, avise que basta recarregar a página para ver o resultado (o CSS já foi recompilado no passo 5; trocar nome/logo no HTML não exige reiniciar o servidor — mudanças em `electron/main.js` / `package.json` só aparecem no título da janela Electron após reiniciar o app).

## 6. Ao concluir

Quando os arquivos de `.dna` estiverem preenchidos (ou com lacunas explicitamente marcadas como `(a definir)`) e a interface personalizada (passo 5), informe ao usuário que a instalação está concluída e que o Vekta Ai já pode receber pedidos de marketing diretamente. Reexecute esta skill apenas se a empresa mudar de forma relevante (reposicionamento, novo público, rebranding) — o passo 5 também deve ser reaplicado nesse caso, com nome/cor/logo atualizados.
