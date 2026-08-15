<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Connection;
use App\Models\Crm\Deal;
use App\Models\Crm\Lead;
use App\Models\Crm\Organization;
use App\Models\Crm\PipelineStage;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ConvertLead
{
    public function __construct(
        private SyncWhatsappLabels $labelSync,
        private EnsureContactForLead $ensureContact,
    ) {}

    /**
     * Converte um lead em deal, criando/reaproveitando contato e organização.
     *
     * @param  array{stage_id?: int, title?: string, value?: string|float|null, owner_id?: int|null}  $attrs
     */
    public function handle(Lead $lead, array $attrs = [], ?int $userId = null): Deal
    {
        if ($lead->status === 'converted') {
            throw ValidationException::withMessages([
                'status' => 'Lead já foi convertido.',
            ]);
        }

        $origemLeadStage = $lead->stage_id ? PipelineStage::find($lead->stage_id) : null;
        $jid = $lead->whatsapp_jid;

        $deal = DB::transaction(function () use ($lead, $attrs, $userId, &$jid) {
            $contact = $this->ensureContact->handle($lead);
            $organization = $this->resolveOrganization($lead);

            if ($organization && ! $contact->organization_id) {
                $contact->update(['organization_id' => $organization->id]);
            }

            $stageId = $attrs['stage_id']
                ?? PipelineStage::ofKind('deal')
                    ->where('active', true)
                    ->where('is_won', false)
                    ->where('is_lost', false)
                    ->orderBy('position')
                    ->value('id');

            if (! $stageId) {
                throw ValidationException::withMessages([
                    'stage_id' => 'Nenhum estágio de pipeline disponível.',
                ]);
            }

            $stage = PipelineStage::find($stageId);

            if ($stage && $stage->kind !== 'deal') {
                throw ValidationException::withMessages([
                    'stage_id' => 'O estágio deve pertencer ao pipeline de negócios.',
                ]);
            }

            $jid = $lead->whatsapp_jid ?: $contact->whatsapp_jid;

            $deal = Deal::create([
                'title' => $attrs['title'] ?? $lead->title,
                'lead_id' => $lead->id,
                'contact_id' => $contact->id,
                'organization_id' => $organization?->id,
                'owner_id' => $attrs['owner_id'] ?? $lead->owner_id,
                'source_id' => $lead->source_id,
                'whatsapp_jid' => $jid,
                'stage_id' => $stageId,
                'value' => $attrs['value'] ?? $lead->value,
                'closed_at' => $stage?->isTerminal() ? now() : null,
            ]);

            $lead->update([
                'status' => 'converted',
                'contact_id' => $contact->id,
                'organization_id' => $organization?->id,
                'converted_deal_id' => $deal->id,
                'converted_at' => now(),
                'stage_id' => null,
            ]);

            Activity::create([
                'type' => 'note',
                'subject' => 'Lead convertido em negócio',
                'lead_id' => $lead->id,
                'deal_id' => $deal->id,
                'contact_id' => $contact->id,
                'user_id' => $userId,
                'meta' => ['lead_id' => $lead->id, 'deal_id' => $deal->id],
            ]);

            return $deal->load(['contact', 'organization', 'stage', 'source']);
        });

        $connection = $this->connectionForLead($lead);
        if ($connection) {
            $this->labelSync->moveCardLabels(
                $connection,
                $jid,
                $origemLeadStage,
                $deal->stage,
            );
        }

        return $deal;
    }

    private function connectionForLead(Lead $lead): ?Connection
    {
        $clinicId = $lead->clinic_id;
        if (! $clinicId) {
            return null;
        }

        return Connection::withoutGlobalScopes()
            ->where('clinic_id', $clinicId)
            ->first();
    }

    private function resolveOrganization(Lead $lead): ?Organization
    {
        if ($lead->organization_id) {
            return Organization::find($lead->organization_id);
        }

        $nome = trim((string) $lead->organization_name);
        if ($nome === '') {
            return null;
        }

        return Organization::firstOrCreate(['name' => $nome]);
    }
}
