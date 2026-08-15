---
name: anuncio-google
description: >
  Especialista em campanha Google Ads (Search). Monta estrutura completa — keywords
  por cluster, grupos, RSAs, extensões, negativas — e gera CSV para o Google Ads Editor.
  Lê .dna, marketing/estrategia/ e saidas/seo/ quando existirem. Use para "campanha
  google ads", "anúncio google", "csv pro google ads" ou /anuncio-google. NUNCA decide
  posicionamento (planner) nem produz peça visual (designer); copy fora de RSA é do redator.
---

# /anuncio-google — Campanha Google Ads (Search)

Monta a campanha Search completa e gera CSV pronto para o Google Ads Editor. Texto gerado aqui é só RSA (limites de caracteres). Não decide estratégia (`planner`), não faz visual (`designer`), não escreve outros formatos de copy (`redator`).

## Limite de escopo

- Exige `.dna` mínimo: `sobre.md`, `publico_alvo.md`, `metas.md`, `identidade_visual.md`. Ausente/genérico → pare e reporte; não invente. `/instalar` é decisão do orquestrador.
- Use `marketing/estrategia/` se existir. Pedido de campanha X sem briefing do `planner` → pare; não invente posicionamento.
- Não invente dados da empresa nem CPC. Faltar orçamento/região/URL/objetivo → pergunte.
- Não coordena outros especialistas. Só copy (sem CSV) → `redator`. Display/visual → `designer`. Esta skill = **Search + CSV**.

## Fontes

| Fonte | Uso |
|---|---|
| `.dna/*` | Oferta, persona, metas, tom de voz |
| `marketing/estrategia/` | Posicionamento / campanha pontual (se existir) |
| `saidas/seo/` | Keywords já pesquisadas (se existir) |
| Briefing | Orçamento, geo, URL, conversão |

Não use `_memoria/`, `marketing/seo/` nem `marketing/campanhas/`.

## Fluxo

1. **Briefing** — Carregar `.dna` + estratégia + SEO. Perguntar só o que faltar: região, orçamento/dia, objetivo (WhatsApp/form/ligação/visita), URL final.
2. **Keywords** — Preferir `saidas/seo/`. Senão: 30–50 sementes do `.dna` + `WebSearch`, só intenção comercial/transacional, agrupar em clusters. Descartar informacionais.
3. **Estrutura** — 1 campanha Search (+ Local opcional); 1 grupo por cluster; 10–15 keywords/grupo; 1–3 RSAs/grupo; negativas em campanha e grupo (lista, não CSV).
4. **RSAs** — Tom de `.dna/identidade_visual.md`. Headline ≤30, description ≤90. Mix: keyword, diferencial real, CTA, prova social (só se existir no `.dna`). Sem emoji, caps, superlativo sem fonte. Orçamento baixo + muitos grupos → 1 RSA/grupo (não 3).
5. **Extensões** — Só tabela em `configuracoes.md` (sitelinks, chamada, snippets, preço se real). Sem CSV.
6. **Config** — Lance "Maximizar conversões", orçamento, geo, idioma PT, programação, conversões, negativas, extensões, decisão de nº de RSAs → `configuracoes.md`.
7. **CSVs** — Ver pasta e regras abaixo. Tudo pausado no import.
8. **Entrega** — Caminho do job, contagens, ordem de import, checklist de negativas/recursos/conversões manuais.

## Output

`marketing/estrategia/campanha-google-ads-<nome-ou-numero>/`

```
campanhas.csv  grupos.csv  keywords.csv  anuncios.csv
configuracoes.md  README.md
```

`Glob` antes de criar. Não gravar em `marketing/anuncios-texto/` (isso é do `redator`).

## CSV — regras pt-BR (Editor)

- **Só CSV de:** campanhas, grupos, keywords positivas, anúncios (RSAs).
- **Não gerar CSV de negativas nem extensões** — listar em `configuracoes.md` e instruir cadastro manual (aba Negativas / Recursos). CSV genérico já importou negativa como keyword positiva.
- **Keywords:** colunas oficiais do template do Editor. Mínimo: `Row Type=Keyword`, `Action=Add`, `Keyword status=Enabled`, `Campaign`, `Ad group`, `Keyword`, `Type`. Sem colunas inventadas. Ideal: pedir template exportado pelo usuário.
- **Locale:** decimal com vírgula (`"8,00"`); match type `Exata`/`Frase`/`Ampla`; coluna obrigatória `Anúncios políticos na UE` = `Não`.
- Match type inicial: Frase na maioria; Exata em premium; Ampla só com negativas fortes.
- Erro de import → pedir mensagem exata do Editor e corrigir pontualmente.

## Import (resumo no README)

Ordem: `campanhas.csv` → `grupos.csv` → `keywords.csv` → `anuncios.csv`. Depois: negativas (colar na aba), recursos (+), conferir conversões, ativar só após revisão.
