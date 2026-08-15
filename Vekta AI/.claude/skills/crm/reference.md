# Referência rápida — API CRM Vekta

Base: `{BACKEND_URL}/api/v1/crm`  
Auth: `Authorization: Bearer {BACKEND_API_TOKEN}`  
OpenAPI: `backend/swagger.json` (monorepo henrique-rodrigues)

## Endpoints usados pela skill

| Ação | Método | Path |
|------|--------|------|
| Listar leads | GET | `/leads?page&status&search` |
| Criar lead | POST | `/leads` |
| Detalhar lead | GET | `/leads/{id}` |
| Atualizar lead | PATCH | `/leads/{id}` |
| Mover lead | POST | `/leads/{id}/move` |
| Converter lead | POST | `/leads/{id}/convert` |
| Excluir lead | DELETE | `/leads/{id}` |
| Listar deals | GET | `/deals?page&search` |
| Criar deal | POST | `/deals` |
| Detalhar deal | GET | `/deals/{id}` |
| Atualizar deal | PATCH | `/deals/{id}` |
| Excluir deal | DELETE | `/deals/{id}` |
| Pipeline kanban | GET | `/pipeline?kind=lead\|deal&search` |
| Estágios | GET | `/pipeline-stages?kind` |
| WhatsApp status | GET | `/whatsapp` |
| Enviar WhatsApp | POST | `/whatsapp/send` |
| Listar campanhas | GET | `/campaigns?status&per_page` |
| Criar campanha | POST | `/campaigns` |
| Detalhar campanha | GET | `/campaigns/{id}` |
| Importar CSV | POST | `/campaigns/{id}/import-csv` |
| Adicionar destinatário | POST | `/campaigns/{id}/recipients` |
| Iniciar campanha | POST | `/campaigns/{id}/start` |
| Pausar campanha | POST | `/campaigns/{id}/pause` |
| Cancelar campanha | POST | `/campaigns/{id}/cancel` |

`DELETE /leads/{id}` e `DELETE /deals/{id}` removem o card permanentemente
(activities/tasks em cascata). Para só sair do funil ativo, use estágio lost
ou `status=unqualified` no lead.

## Campos — criar lead (`POST /leads`)

Obrigatório: `name`.

Opcionais: `title` (default=name), `status` (`new`\|`contacted`\|`qualified`\|`unqualified`),
`email`, `mobile`, `whatsapp_jid`, `instagram`, `organization_name`,
`contact_id`, `organization_id`, `owner_id`, `source_id`, `value`, `currency` (3 letras),
`external_id`, `stage_id` (kind=lead; se omitido, primeiro estágio lead ativo).

## Campos — atualizar lead (`PATCH /leads/{id}`)

Mesmos campos (todos opcionais) + `lost_reason`.  
Não aceite `status=converted` aqui — use `POST .../convert`.

## Mover / converter lead

- `POST /leads/{id}/move` — body `{ stage_id, lost_reason? }` (`lost_reason` obrigatório se estágio `is_lost`).
- `POST /leads/{id}/convert` — body opcional `{ title, stage_id, value, owner_id }` → cria deal.

## Campos — criar deal (`POST /deals`)

Obrigatórios: `title`, `contact_id`, `stage_id` (kind=deal).

Opcionais: `lead_id`, `organization_id`, `owner_id`, `source_id`, `value`,
`currency`, `probability` (0–100), `expected_close_on` (YYYY-MM-DD).

## Atualizar deal (`PATCH /deals/{id}`)

Campos opcionais acima + `lost_reason` / `lost_notes` (obrigatório `lost_reason` ao ir para estágio lost).

## Pipeline

`GET /pipeline?kind=lead|deal` devolve estágios ativos com itens do kanban
(`PipelineStageWithItems`). Use para “como está a dashboard / funil”.

## WhatsApp send

```json
{ "to": "5511... ou JID", "message": "...", "contact_name": "opcional" }
```

Resposta 201 inclui `data.message` e, quando houver match, `data.lead` / `data.deal` / `data.contact`.

O CLI com `--lead-id` faz `GET /leads/{id}` e usa `whatsapp_jid` ou `mobile` como `to`.

## Campanhas WhatsApp

Criar (`POST /campaigns`):

```json
{
  "name": "Follow-up",
  "delay_between_contacts_sec": 45,
  "delay_jitter_sec": 15,
  "messages": [
    { "message_body": "Olá {{nome}}!", "delay_after_sec": 10 }
  ]
}
```

Importar CSV (`POST /campaigns/{id}/import-csv`): `{ "csv_content": "nome,contato,anotacoes\\n..." }`.
Substitui destinatários. Não cria Leads no CRM. Anotações são internas.

Adicionar destinatário (`POST /campaigns/{id}/recipients`):
`{ "full_name": "Maria", "phone": "11999999999", "notes": "opcional" }`.
Inclui sem substituir a lista. Telefone normalizado (DDI 55 em números BR).

Status da campanha: `draft|queued|running|paused|completed|cancelled|failed`.
Placeholders no body: `{{nome}}`, `{{contato}}` (aliases name/phone).

Worker: job `RunWhatsappCampaignJob` (fila database). Requer `php artisan queue:work`.

## Status de lead

| Valor | Uso |
|-------|-----|
| `new` | Novo |
| `contacted` | Contatado |
| `qualified` | Qualificado |
| `unqualified` | Desqualificado |
| `converted` | Só via convert |

## Envelope de resposta

- Item único: `{ "data": { ... } }`
- Listagens paginadas: paginator Laravel na raiz (`data`, `current_page`, `per_page` ≈ 50, …)
- Erro 422: `{ "message", "errors": { campo: [msgs] } }`
- Erro 401: token inválido/ausente
