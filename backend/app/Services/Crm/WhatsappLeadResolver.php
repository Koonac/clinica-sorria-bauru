<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use App\Models\Crm\Contact;
use App\Models\Crm\Deal;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\Source;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\User;

class WhatsappLeadResolver
{
    public function __construct(
        private SyncWhatsappLabels $labelSync,
        private EnsureContactForLead $ensureContact,
        private TrackWhatsappAttendanceSegment $attendance,
    ) {}

    /**
     * Localiza lead/deal/contato pelo JID (ou telefone) ou cria um lead novo.
     * Requer ClinicContext definido (escopo BelongsToClinic).
     *
     * @param  array{jid?: string|null, phone_number?: string|null, contact_name?: string|null}  $payload
     * @return array{lead: ?Lead, deal: ?Deal, contact: ?Contact}
     */
    public function resolve(Connection $connection, array $payload, ?User $owner = null): array
    {
        $jid = trim((string) ($payload['jid'] ?? ''));
        $phone = preg_replace('/\D+/', '', (string) ($payload['phone_number'] ?? '')) ?: null;
        $name = trim((string) ($payload['contact_name'] ?? ''));

        $contact = null;
        $lead = null;
        $deal = null;

        if ($jid !== '') {
            $contact = Contact::query()->where('whatsapp_jid', $jid)->first();
            $lead = Lead::query()
                ->where('whatsapp_jid', $jid)
                ->where('status', '!=', 'converted')
                ->latest('id')
                ->first();
            $deal = Deal::query()->where('whatsapp_jid', $jid)->latest('id')->first();
        }

        if (! $contact && $phone) {
            $contact = Contact::query()
                ->where(function ($q) use ($phone) {
                    $q->where('mobile', $phone)
                        ->orWhere('phone', $phone)
                        ->orWhere('mobile', 'like', '%'.$phone)
                        ->orWhere('phone', 'like', '%'.$phone);
                })
                ->first();
        }

        if (! $lead && $phone) {
            $lead = Lead::query()
                ->where('status', '!=', 'converted')
                ->where(function ($q) use ($phone) {
                    $q->where('mobile', $phone)
                        ->orWhere('mobile', 'like', '%'.$phone);
                })
                ->latest('id')
                ->first();
        }

        if ($contact && ! $deal) {
            $deal = Deal::query()->where('contact_id', $contact->id)->latest('id')->first();
        }

        if ($contact && ! $lead) {
            $lead = Lead::query()
                ->where('contact_id', $contact->id)
                ->where('status', '!=', 'converted')
                ->latest('id')
                ->first();
        }

        if ($lead || $deal || $contact) {
            if ($lead && $jid !== '' && ! $lead->whatsapp_jid) {
                $lead->update(['whatsapp_jid' => $jid]);
            }
            if ($deal && $jid !== '' && ! $deal->whatsapp_jid) {
                $deal->update(['whatsapp_jid' => $jid]);
            }
            if ($contact && $jid !== '' && ! $contact->whatsapp_jid) {
                $contact->update(['whatsapp_jid' => $jid]);
            }

            $contact = $contact ?? $lead?->contact ?? $deal?->contact;
            $this->applyDisplayName($lead, $deal, $contact, $name, $phone, $jid);

            return [
                'lead' => $lead?->fresh(),
                'deal' => $deal?->fresh(),
                'contact' => $contact?->fresh(),
            ];
        }

        if ($jid === '' && ! $phone) {
            return ['lead' => null, 'deal' => null, 'contact' => null];
        }

        $displayName = $this->isPhoneLikeName($name, $phone, $jid)
            ? ($phone ?: $jid)
            : ($name !== '' ? $name : ($phone ?: $jid));

        $sourceId = Source::query()->where('slug', 'whatsapp')->value('id');
        $stageId = $this->resolveDefaultLeadStageId($connection);
        $ownerId = $owner?->id ?? $connection->created_by;

        $lead = Lead::create([
            'title' => $displayName,
            'name' => $displayName,
            'status' => 'new',
            'mobile' => $phone,
            'whatsapp_jid' => $jid !== '' ? $jid : null,
            'owner_id' => $ownerId,
            'source_id' => $sourceId,
            'stage_id' => $stageId,
            'clinic_id' => $connection->clinic_id,
        ]);

        $contact = $this->ensureContact->handle($lead);
        $this->attendance->handle(
            $lead->fresh() ?? $lead,
            WhatsappAttendanceSegment::MODE_AI,
            null,
            'lead_created',
        );

        if ($stageId && $jid !== '') {
            $stage = PipelineStage::find($stageId);
            if ($stage) {
                $this->labelSync->applyStageLabel($connection, $jid, $stage);
            }
        }

        return [
            'lead' => $lead->fresh(),
            'deal' => null,
            'contact' => $contact->fresh(),
        ];
    }

    /**
     * Atualiza nome do lead/contato quando o atual é vazio ou parece telefone/JID
     * e o WhatsApp enviou o nome de perfil.
     */
    private function applyDisplayName(
        ?Lead $lead,
        ?Deal $deal,
        ?Contact $contact,
        string $name,
        ?string $phone,
        string $jid,
    ): void {
        if ($name === '' || $this->isPhoneLikeName($name, $phone, $jid)) {
            return;
        }

        if ($lead && $this->isPhoneLikeName($lead->name, $phone, $jid)) {
            $attrs = ['name' => $name];
            if ($this->isPhoneLikeName($lead->title, $phone, $jid)) {
                $attrs['title'] = $name;
            }
            $lead->update($attrs);
        }

        if ($contact && $this->isPhoneLikeName($contact->name, $phone, $jid)) {
            $contact->update(['name' => $name]);
        }

        if ($deal && $this->isPhoneLikeName($deal->title, $phone, $jid)) {
            $deal->update(['title' => $name]);
        }
    }

    private function isPhoneLikeName(?string $value, ?string $phone = null, ?string $jid = null): bool
    {
        $name = trim((string) $value);
        if ($name === '') {
            return true;
        }

        if ($jid && ($name === $jid || str_contains($name, '@'))) {
            return true;
        }

        $nameDigits = preg_replace('/\D+/', '', $name) ?: '';
        $phoneDigits = preg_replace('/\D+/', '', (string) $phone) ?: '';

        if (preg_match('/^[\d\s+\-().]+$/u', $name) && strlen($nameDigits) >= 8) {
            return true;
        }

        if (
            strlen($nameDigits) >= 8
            && $phoneDigits !== ''
            && (
                $nameDigits === $phoneDigits
                || str_ends_with($phoneDigits, $nameDigits)
                || str_ends_with($nameDigits, $phoneDigits)
            )
        ) {
            return true;
        }

        return false;
    }

    private function resolveDefaultLeadStageId(Connection $connection): ?int
    {
        $preferredId = $connection->default_lead_stage_id;
        if ($preferredId) {
            $preferred = PipelineStage::ofKind('lead')
                ->where('active', true)
                ->whereKey($preferredId)
                ->value('id');
            if ($preferred) {
                return (int) $preferred;
            }
        }

        $fallback = PipelineStage::ofKind('lead')
            ->where('active', true)
            ->orderBy('position')
            ->value('id');

        return $fallback ? (int) $fallback : null;
    }
}
