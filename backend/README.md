# Vekta Backend

API Laravel (sem frontend) que concentra os domínios de negócio do Vekta AI. Hoje: **CRM**. Próximos: webhooks Instagram, etc.

## Stack

- Laravel 12 (API only — sem Blade/Vite/npm)
- PostgreSQL 16
- Laravel Sanctum (token de serviço via `Authorization: Bearer`)

## Setup

```bash
composer install
copy .env.example .env   # e preencha DB_PASSWORD
php artisan key:generate
php artisan migrate --seed
```

O Postgres sobe pelo compose da raiz do monorepo (`docker compose up -d postgres`) ou local na porta 5432 (`vekta_ai` / `postgres`).

No primeiro `migrate --seed`, o `AdminUserSeeder` cria o usuário **Admin** e o **Developer** com senhas aleatórias e imprime no terminal:

```text
User: Admin
Senha: <aleatória>

User: Developer
Senha: <aleatória>
```

Guarde as senhas — elas não são exibidas de novo. Para trocar depois: `POST /api/v1/auth/password` (autenticado).

Também imprime o **token de serviço da interface** — copie para `BACKEND_API_TOKEN` em `vekta-ai/interface/.env`. Ele não é exibido de novo; para gerar outro:

```bash
php artisan tinker --execute="echo App\Models\User::where('username','Admin')->first()->createToken('interface')->plainTextToken;"
```

## Rodar

```bash
php artisan serve   # http://localhost:8000
```

## API — CRM (`/api/v1/crm`, auth: Bearer token)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/leads` | Lista (filtros `status`, `search`) / cria lead |
| GET/PATCH | `/leads/{id}` | Detalhe (com activities) / atualiza |
| POST | `/leads/{id}/convert` | Converte em deal (cria/reaproveita contato + organização) |
| POST | `/leads/{id}/move` | Move no kanban (`stage_id`); exige `lost_reason` se destino for `perdido` |
| GET/POST | `/deals` | Lista (filtros `stage_id`, `search`) / cria deal |
| GET/PATCH | `/deals/{id}` | Detalhe / atualiza (mover `stage_id` registra `stage_change` e fecha/reabre) |
| GET | `/pipeline?kind=lead\|deal` | Estágios ativos do kind com leads ou deals (kanban) |
| GET | `/pipeline-stages?kind=lead\|deal` | Estágios ativos do kind |
| POST | `/pipeline-stages` | Cria estágio (`kind`, `name`, `color`, `status`) |
| PATCH | `/pipeline-stages/order` | Reordena (`kind`, `ordered_ids`) |
| PATCH/DELETE | `/pipeline-stages/{id}` | Atualiza / exclui (bloqueia se tiver cards) |
| GET | `/sources` | Origens ativas |
| GET/POST | `/activities` | Timeline (filtros `lead_id`, `deal_id`, `contact_id`, `type`) / cria |
| GET | `/contacts` | Lista contatos (`search`) |
| GET/POST | `/organizations` | Lista (`search`) / cria organização |

Convenções: respostas em `{ "data": ... }` (listas paginadas usam o paginator do Laravel, também com `data`); validação retorna 422 `{ message, errors }`.

### Modelo (MVP)

- **Lead** — entrada comercial; dados de pessoa no próprio lead (`name`, `email`, `mobile`, `whatsapp_jid`, `instagram`, `organization_name`). `status`: `new`, `contacted`, `qualified`, `unqualified`, `converted` (este último só via convert). Kanban via `stage_id` em estágios `kind=lead`.
- **Deal** — oportunidade no pipeline; exige `contact_id` e `stage_id` (`kind=deal`); `value` numeric(12,2) BRL; ganho/perdido vêm das flags do estágio e controlam `closed_at`.
- **Contact / Organization** — criados/reaproveitados na conversão (contato deduplicado por `whatsapp_jid`).
- **Activity** — timeline polimórfica (`note`, `call`, `whatsapp`, `email`, `task`, `stage_change`); exige vínculo com lead, deal ou contato.
- **PipelineStage / Source** — seedados (`database/seeders/CrmSeeder.php`). Stages têm `kind` (`lead` ou `deal`), `position`, `color` e flags exclusivas: `is_open`, `is_in_progress`, `is_won`, `is_lost` (API também aceita `status`: `open|in_progress|won|lost`).
## Testes

```bash
php artisan test
```
