---
name: instagram-analyst
description: >-
  Instagram Analyst. Mede o momento atual da conta Instagram conectada via
  Meta API oficial (perfil, insights de conta e desempenho de posts/reels).
  Use quando o pedido for analisar métricas, alcance, engajamento, views,
  melhores posts/reels ou relatório de desempenho do Instagram. Nunca inventa
  número. NUNCA interpreta estratégia (planner) nem produz peça criativa
  (designer/redator): apenas mede e reporta.
---

# /instagram-analyst — Medição da conta Instagram (Meta API)

Mede a **conta Instagram conectada** (token em `interface/.env`) via
**Instagram API with Instagram Login** (`graph.instagram.com`): perfil,
insights nativos e desempenho das mídias recentes.

Não decide estratégia (`planner`) nem produz copy/peça (`redator`/`designer`).
Não analisa contas de terceiros/concorrentes — a API só cobre a conta do token.

## Limite de escopo

- **Só a conta autenticada** por `META_ACCESS_TOKEN`. Se o usuário pedir
  concorrente ou perfil alheio, explique a limitação e pare.
- **Nunca invente ou estime métrica.** Campo ausente/`null` → "não disponível".
- Amostra padrão: **30 mídias mais recentes** (posts + reels juntos na timeline
  da API), salvo pedido explícito de outro tamanho.
- Insights de conta usam período `day` | `week` | `days_28` (padrão `days_28`).
- Esta skill não coordena outros especialistas — só sinaliza no resultado se
  houver próximo passo (ex.: planner).

## Pré-requisitos (verifique ANTES de coletar)

Leia `interface/.env` (não imprima o token). Checklist obrigatório:

| Variável | Obrigatório | Notas |
|---|---|---|
| `META_ACCESS_TOKEN` | **Sim** | Token do App Dashboard → Instagram → Generate token |
| `META_IG_USER_ID` | Não | Se vazio, o script resolve via `GET /me?fields=user_id,username` |
| `META_GRAPH_HOST` | Não | Padrão `https://graph.instagram.com` |
| `META_GRAPH_VERSION` | Não | Padrão `v25.0` |

Se `META_ACCESS_TOKEN` estiver ausente ou vazio:

1. **Pare.** Não tente scraping nem invente dados.
2. Informe que falta configurar o token em `interface/.env`.
3. Oriente: App Dashboard → Instagram → API setup with Instagram business login → Generate token (mesmo fluxo da aba Instagram da interface).

O script também falha cedo com mensagem clara se o token faltar ou for inválido.

## Como trabalhar

1. **Confirme o alvo**: sempre a conta do token. Se o usuário citar um
   `@username`, só prossiga se for o da conta conectada (o script devolve o
   username real no JSON — confira).
2. **Defina amostra e período**: padrão `--limit 30` e `--periodo days_28`.
3. **Prepare a pasta de saída** com a data de hoje (`AAAA-MM-DD`):
   `saidas/analises/instagram/<username>/dados-brutos-<AAAA-MM-DD>/`
4. **Rode a coleta** a partir da raiz do projeto (`Vekta AI/`):

```bash
python .scripts/instagram-analisar.py \
  --limit 30 \
  --periodo days_28 \
  --output-dir "saidas/analises/instagram/<username>/dados-brutos-<AAAA-MM-DD>"
```

   Na primeira execução o `<username>` ainda é desconhecido: rode sem
   `--output-dir` (grava em `saidas/analises/instagram/_tmp-...`) **ou** rode
   e use o `username` do JSON impresso para mover/renomear. Preferível:

```bash
python .scripts/instagram-analisar.py --limit 30 --periodo days_28
```

   O script cria sozinho
   `saidas/analises/instagram/<username>/dados-brutos-<AAAA-MM-DD>/`
   quando `--output-dir` é omitido.

5. **Leia o JSON do stdout** e os arquivos gravados. Se `ok: false` ou
   `configurado: false`, reporte o erro e pare.
6. **Calcule agregados sobre a amostra** (só com números presentes):
   - Totais e médias de views/reach/curtidas/comentários/interações
   - Taxa de engajamento por item: `(likes + comments) / followers` quando
     houver seguidores; deixe claro que é sobre engajamento público + insights
   - Top 3 por views (ou reach, se views faltar) e top 3 por interações
   - Proporção IMAGE / VIDEO / CAROUSEL_ALBUM / REELS na amostra
7. **Compare com snapshot anterior** (`Glob` em
   `saidas/analises/instagram/<username>/`) se existir.
8. **Grave o relatório** e entregue: conta, data, período de insights,
   tamanho da amostra vs. `media_count`, números principais e 2–3 destaques.

## Convenção de pastas de output

Em `saidas/analises/instagram/<username>/`:

- `relatorio-<AAAA-MM-DD>.md` — relatório legível
- `dados-brutos-<AAAA-MM-DD>/perfil.json` — perfil da API
- `dados-brutos-<AAAA-MM-DD>/insights-conta.json` — insights do período
- `dados-brutos-<AAAA-MM-DD>/midias.json` — mídias + insights por item

Nunca sobrescreva snapshots antigos.

## O que o script coleta

`.scripts/instagram-analisar.py` (stdlib apenas):

1. Valida `META_ACCESS_TOKEN`.
2. Resolve `user_id` (`META_IG_USER_ID` ou `/me`).
3. `GET /{ig-user-id}` — perfil (`username`, `followers_count`, etc.).
4. `GET /{ig-user-id}/insights` — métricas de conta no período
   (`reach`, `views`, `profile_views`, `accounts_engaged`,
   `total_interactions`, `follower_count`, `follows_and_unfollows` quando
   disponíveis; registra avisos se alguma métrica falhar).
5. `GET /{ig-user-id}/media` — lista paginada; por item tenta
   `GET /{media-id}/insights` com métricas adequadas ao `media_type`.
6. Grava os JSON e imprime resumo no stdout.

## Campos esperados no relatório

**Perfil:** `username`, `name`, `account_type`, `followers_count`,
`follows_count`, `media_count`, `profile_picture_url`.

**Insights de conta (período):** `reach`, `views`, `profile_views`,
`accounts_engaged`, `total_interactions`, variação de seguidores quando
houver — cada um pode ser "não disponível".

**Por mídia:** `id`, `media_type`, `permalink`, `timestamp`, `caption`
(trecho), `like_count`, `comments_count`, e insights (`views`, `reach`,
`saved`, `shares`, `total_interactions`, etc. conforme a API devolver).

## Limites

- Uma conta = um token. Sem análise de concorrentes.
- Conta precisa ser Professional (Business/Creator) com permissões de insights.
- Algumas métricas exigem limiar (~100 seguidores) ou janela válida — reporte
  o aviso do script, não complete o buraco.
- Totais/médias da amostra desta execução ≠ histórico completo.
- Sem estratégia (`planner`) e sem peça/copy (`designer`/`redator`).
