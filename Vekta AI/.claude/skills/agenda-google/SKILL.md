---
name: agenda-google
description: >-
  Marca, lista, altera ou cancela agendamentos no Google Calendar da conta
  conectada (OAuth em interface/.env), via .scripts/google-calendar-agendar.py.
  Use quando o usuário pedir para agendar reunião, marcar compromisso, criar
  evento na agenda, consultar a agenda/calendário, remarcar ou cancelar um
  horário no Google Agenda — inclusive pelo chat da interface.
---

# /agenda-google — Agendar no Google Calendar

Cria, lista, atualiza ou exclui eventos no **mesmo calendário** da aba Agenda
(`GOOGLE_CALENDAR_*` / `GOOGLE_CLIENT_*` em `interface/.env`).

Não gera copy (`redator`), não publica no Instagram (`instagram-publish`) e não
analisa Ads. Aqui o assunto é **compromisso na agenda Google**.

## Pré-requisitos

- Python 3 (stdlib + `zoneinfo`; sem pip extra).
- Em `interface/.env`:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALENDAR_REFRESH_TOKEN`
- Opcional: `GOOGLE_CALENDAR_CALENDAR_ID` (default `primary`),
  `GOOGLE_CALENDAR_TIMEZONE` (default `America/Sao_Paulo`).
- A interface **não** precisa estar rodando — o script fala direto com a API.

## Confirme antes de criar / alterar / excluir

1. **Título** do evento.
2. **Quando** — data/hora no fuso local (`AAAA-MM-DDTHH:mm`), ou dia inteiro
   (`AAAA-MM-DD` + `--dia-inteiro`).
3. **Duração** — se o usuário não disser o fim, use **+1 hora** (com horário)
   ou o mesmo dia (dia inteiro).
4. **Descrição / local** — só se o usuário passar.
5. Para **excluir/atualizar**: o `id` do evento (liste antes se não tiver).

Se a data/hora for ambígua (“amanhã de manhã”), pergunte o horário exato —
não invente.

## Como rodar

A partir da **raiz do projeto** (`Vekta AI/`):

```bash
# Criar reunião (1h se --fim omitido)
python .scripts/google-calendar-agendar.py criar \
  --titulo "Reunião com cliente X" \
  --inicio "2026-08-10T14:00" \
  --fim "2026-08-10T15:00" \
  --descricao "Alinhamento comercial" \
  --local "Google Meet"

# Dia inteiro
python .scripts/google-calendar-agendar.py criar \
  --titulo "Folga" \
  --inicio "2026-08-15" \
  --dia-inteiro

# Listar (mês atual se omitir --desde/--ate)
python .scripts/google-calendar-agendar.py listar
python .scripts/google-calendar-agendar.py listar \
  --desde "2026-08-01" \
  --ate "2026-08-31"

# Atualizar / excluir
python .scripts/google-calendar-agendar.py atualizar \
  --id "EVENT_ID" \
  --titulo "Novo título" \
  --inicio "2026-08-10T16:00" \
  --fim "2026-08-10T17:00"

python .scripts/google-calendar-agendar.py excluir --id "EVENT_ID"
```

O script imprime JSON no stdout. Leia-o para responder ao usuário.

## Fluxo

1. Extraia título, início/fim (e se é dia inteiro).
2. Rode `criar` (ou `listar` / `atualizar` / `excluir`).
3. Interprete o JSON (`ok`, `evento.id`, `evento.htmlLink`, `erro`).
4. Responda em português, curto: o que foi feito, quando, e o link se houver
   `htmlLink`.

Na interface (`/interface`), diga que o evento já aparece na aba **Agenda**
após atualizar.

## Limites

- Conta = refresh token em `.env` (um calendário por instalação).
- Não cria Meet automaticamente (só grava `location`/descrição se passados).
- Não envia convites a convidados nesta versão (sem `--attendees`).
- Horários interpretados no fuso `GOOGLE_CALENDAR_TIMEZONE` / `America/Sao_Paulo`.
