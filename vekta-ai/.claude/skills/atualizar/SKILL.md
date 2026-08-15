---
name: atualizar
description: Captura o aprendizado do chat atual e o grava nos lugares certos. Lê toda a conversa, resume os pontos importantes — em especial os insights e correções dados pelo usuário — e (1) atualiza os arquivos da pasta .dna quando surgir contexto novo sobre a empresa e (2) salva na memória o que o Vekta Ai aprendeu sobre como trabalhar melhor. Use ao fim de um trabalho relevante, quando o usuário corrigir/ensinar algo, ou quando ele pedir explicitamente para "atualizar".
---

# /atualizar — Consolida o aprendizado da conversa

Esta skill transforma o que aconteceu na conversa atual em contexto persistente. Ela **não** produz peças de marketing nem coleta dados do zero (isso é da `/instalar`): ela revisa o que já foi dito e grava nos dois destinos certos:

- **`.dna/`** — quando surgiu informação nova ou corrigida sobre a **empresa** (quem é, metas, público, identidade visual).
- **Memória do Vekta Ai** — quando o usuário deu um **insight, preferência ou correção** sobre como o Vekta Ai deve trabalhar.

A regra de ouro é a separação: fato sobre a *empresa* vai para o `.dna`; aprendizado sobre *como eu trabalho* vai para a memória. Nunca misture os dois.

## 1. Releia e resuma a conversa

Antes de gravar, faça uma passada mental por **toda a conversa atual**, do início até aqui, e levante:

- **Insights e decisões do usuário** — preferências de tom, estilo, formato, canais, prioridades, vetos ("não faça X"), aprovações ("é assim que eu gosto").
- **Correções** — todo ponto em que o usuário corrigiu uma entrega ou um entendimento meu. Correção é o sinal mais valioso: quase sempre vira memória.
- **Fatos novos sobre a empresa** — dados que não estavam no `.dna` ou que mudaram: novo produto, nova meta, novo público, ajuste de marca, número/KPI.
- **Trabalho em andamento** — campanhas, peças ou tarefas que ficaram abertas e precisam de continuidade.

Monte uma lista curta do que merece ser persistido. Descarte o que é só conversa de momento (algo que não muda nenhuma decisão futura). Na dúvida entre salvar e não salvar algo trivial, não salve.

## 2. Atualize o `.dna` (fatos da empresa)

Para cada fato novo/corrigido sobre a empresa, identifique o arquivo-alvo e **atualize de forma cirúrgica** — edite só o trecho afetado, preserve o resto:

- **`sobre.md`** — história, posicionamento, o que a empresa faz, diferencial.
- **`metas.md`** — objetivos, metas e KPIs.
- **`publico_alvo.md`** — perfis, dores e características do público.
- **`identidade_visual.md`** — paleta, tipografia, regras de uso.

Regras:
- **Nunca invente.** Só grave o que o usuário disse de fato na conversa. Se algo ficou ambíguo, pergunte antes de gravar — não preencha de cabeça.
- Se a pasta `.dna` não existir, não há o que atualizar: avise o usuário que a empresa ainda não foi instalada e ofereça rodar `/instalar`.
- Se um fato **substitui** algo antigo (meta mudou, público mudou), reescreva o trecho; não acumule informação contraditória.
- Ao terminar, liste em uma linha cada arquivo do `.dna` que foi tocado e o que mudou.

## 3. Atualize a memória (como o Vekta Ai trabalha)

Grave na memória o que o usuário ensinou sobre **como eu devo trabalhar** — preferências, correções, abordagens aprovadas e trabalho em andamento. **Não** grave aqui fatos da empresa: esses são do `.dna`.

O que merece virar memória:
- **Quem é o usuário** — papel, expertise, preferências pessoais.
- **Como eu devo trabalhar** — orientações, correções e abordagens aprovadas; sempre com o porquê por trás.
- **Trabalho em andamento** — campanhas, peças ou tarefas abertas que precisam de continuidade.

Antes de criar uma memória nova, veja se já existe uma que cubra o tema e atualize-a, em vez de duplicar. Não salve o que o `.dna` já registra nem o que só importa nesta conversa.

## 4. Encerre confirmando

Ao final, dê ao usuário um resumo curto do que foi consolidado, em duas listas:

- **`.dna` atualizado:** arquivos tocados e o que mudou (ou "nada novo sobre a empresa").
- **Memória:** memórias criadas/atualizadas e o gancho de cada uma (ou "nada novo sobre o jeito de trabalhar").

Se não houver nada a persistir em nenhum dos dois, diga isso claramente — `/atualizar` não inventa aprendizado só para ter o que gravar.
