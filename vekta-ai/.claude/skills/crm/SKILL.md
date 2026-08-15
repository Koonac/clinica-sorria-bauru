---
name: crm
description: >-
  Manuseia o CRM Vekta via API (backend/swagger.json): CRUD de leads, CRUD de
  deals, consulta da pipeline da dashboard, disparo de mensagens WhatsApp para
  um lead e campanhas de disparo em massa (CSV). Use quando o usuário pedir
  listar/criar/atualizar leads ou deals, ver o kanban/pipeline, mover lead de
  estágio, converter lead em deal, enviar WhatsApp a um lead, ou criar/iniciar
  campanhas WhatsApp — inclusive pelo chat da interface.
---

# /crm — Manusear o CRM Vekta

Opera o CRM autenticado (Sanctum) através de `.scripts/crm.py`, que fala com
`BACKEND_URL` + `BACKEND_API_TOKEN` em `interface/.env`.

Não escreve copy (`redator`), não publica no Instagram e não agenda no Google.
Aqui o assunto é **lead / deal / pipeline / WhatsApp / campanhas** do CRM.

## Pré-requisitos

- Python 3 (stdlib; sem pip extra).
- Em `interface/.env`:
  - `BACKEND_URL` (ex.: `http://localhost:8000`)
  - `BACKEND_API_TOKEN` (token Sanctum do usuário/serviço)
- Backend Laravel do CRM acessível.
- Para WhatsApp / campanhas: sessão conectada no CRM (`whatsapp status` deve indicar ready/connected).
- Para personalização com IA nas campanhas (interface): `OPENROUTER_API_KEY` no `.env` do backend.

A interface **não** precisa estar rodando — o script fala direto com a API.

## Confirme antes de mutar / enviar

1. **Criar lead** — pelo menos `name` (`--nome`).
2. **Criar deal** — `title`, `contact_id`, `stage_id` (kind=deal).
3. **Mover lead** — `stage_id`; se estágio `is_lost`, peça `lost_reason`.
4. **WhatsApp** — texto da mensagem + lead (ou telefone). Confirme o conteúdo
   com o usuário antes de enviar; não invente ofertas/preços fora do `.dna`.
5. **Campanha** — nome + sequência + CSV; confirme antes de `iniciar` (dispara em massa).
6. **Atualizar** — confirme o `id` (liste/busque antes se ambíguo).

Se o pedido for ambíguo (“manda mensagem pro João”), busque o lead
(`leads listar --search João`) e confirme o id antes de agir.

## Como rodar

A partir da **raiz do projeto** (`Vekta AI/`):

```bash
# Leads
python .scripts/crm.py leads listar
python .scripts/crm.py leads listar --search "Maria" --status new
python .scripts/crm.py leads ver --id 12
python .scripts/crm.py leads criar --nome "Maria Silva" --mobile "5511999999999" --email "maria@ex.com"
python .scripts/crm.py leads atualizar --id 12 --status contacted
python .scripts/crm.py leads mover --id 12 --stage-id 3
python .scripts/crm.py leads converter --id 12 --titulo "Proposta Maria"
python .scripts/crm.py leads excluir --id 12

# Deals
python .scripts/crm.py deals listar --search "Proposta"
python .scripts/crm.py deals ver --id 5
python .scripts/crm.py deals criar --titulo "Deal X" --contact-id 1 --stage-id 10 --value 1500
python .scripts/crm.py deals atualizar --id 5 --stage-id 11 --probability 60
python .scripts/crm.py deals excluir --id 5

# Pipeline (dashboard / kanban)
python .scripts/crm.py pipeline --kind lead
python .scripts/crm.py pipeline --kind deal --search "acme"
python .scripts/crm.py estagios --kind lead

# WhatsApp
python .scripts/crm.py whatsapp status
python .scripts/crm.py whatsapp enviar --lead-id 12 --mensagem "Olá! Segue o retorno combinado."
python .scripts/crm.py whatsapp enviar --to "5511999999999" --mensagem "Oi"

# Campanhas WhatsApp
python .scripts/crm.py campanhas listar
python .scripts/crm.py campanhas ver --id 1
python .scripts/crm.py campanhas criar --nome "Follow-up" --mensagem "Olá {{nome}}!"
python .scripts/crm.py campanhas importar --id 1 --csv materiais/lista.csv
python .scripts/crm.py campanhas iniciar --id 1
python .scripts/crm.py campanhas pausar --id 1
python .scripts/crm.py campanhas cancelar --id 1
```

Flags extras e corpos complexos: `--json '{"name":"...","value":100}'`.
O script imprime JSON no stdout (`ok`, `acao`, `data` / erros). Leia-o para
responder ao usuário.

## Fluxo

1. Identifique a intenção: lead, deal, pipeline, WhatsApp ou campanha.
2. Se faltar id/telefone/estágio, liste/busque ou peça confirmação.
3. Rode o comando correspondente.
4. Interprete o JSON (`ok`, `erro`, `http`, `detalhes` de validação 422).
5. Responda em português, curto: o que foi feito, ids relevantes, estágio/status.

Na interface (`/interface`), diga que as abas **CRM** e **Campanhas** refletem
as mesmas alterações após atualizar.

## Limites

- `converted` em lead só via `leads converter` (não via `atualizar --status`).
- Excluir lead/deal (`leads excluir` / `deals excluir`) é permanente: activities e
  tasks do card saem em cascata. Preferir estágio lost / `unqualified` quando
  quiser só tirar do funil ativo sem apagar histórico.
- WhatsApp exige sessão conectada; falha 502 = API WhatsApp/indisponível.
- Campanhas: CSV vira **destinatários da campanha**, não cria Leads no CRM.
  Anotações do CSV são internas e nunca entram no body do WhatsApp.
- Um token = um usuário do CRM (dados daquele tenant/conta).
- Contrato completo: [reference.md](reference.md). Fonte da verdade da API:
  `../backend/swagger.json` no monorepo (ou `backend/swagger.json` relativo à
  raiz `henrique-rodrigues/`).
