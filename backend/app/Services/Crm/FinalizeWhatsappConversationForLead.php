<?php

namespace App\Services\Crm;

use App\Models\Crm\Activity;
use App\Models\Crm\Lead;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class FinalizeWhatsappConversationForLead
{
    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_AI = 'ai';

    public const SOURCE_AUTO_CLOSE = 'auto_close';

    public function __construct(private CloseWhatsappAttendanceSegment $closeSegment) {}

    /**
     * Finaliza o atendimento: remove dono, limpa pausa, fecha segmento e marca conversa fechada.
     *
     * @param  self::SOURCE_*  $source
     */
    public function handle(Lead $lead, ?User $user = null, string $source = self::SOURCE_MANUAL): Lead
    {
        return DB::transaction(function () use ($lead, $user, $source) {
            if ($lead->isWhatsappConversationClosed()) {
                return $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;
            }

            $lead->forceFill([
                'owner_id' => null,
                'whatsapp_agent_paused_at' => null,
                'whatsapp_agent_resume_at' => null,
                'whatsapp_conversation_closed_at' => now(),
                'whatsapp_conversation_closed_by' => $user?->id,
                'whatsapp_auto_close_at' => null,
            ])->save();

            $this->closeSegment->handle($lead);

            $updated = $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;

            [$subject, $body] = $this->activityCopy($user, $source);

            Activity::create([
                'type' => 'note',
                'subject' => $subject,
                'body' => $body,
                'lead_id' => $updated->id,
                'contact_id' => $updated->contact_id,
                'user_id' => $user?->id,
                'meta' => [
                    'whatsapp_finalized' => true,
                    'finalized_source' => $source,
                    'finalized_by' => $user?->id,
                    'finalized_by_name' => $user?->name,
                ],
            ]);

            return $updated;
        });
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function activityCopy(?User $user, string $source): array
    {
        return match ($source) {
            self::SOURCE_AUTO_CLOSE => [
                'Conversa finalizada automaticamente',
                'Conversa finalizada automaticamente por inatividade do cliente.',
            ],
            self::SOURCE_AI => [
                'Conversa finalizada',
                'Conversa finalizada pelo Agent IA.',
            ],
            default => [
                'Conversa finalizada',
                sprintf(
                    'Conversa finalizada por %s.',
                    $user?->name ?? 'atendente',
                ),
            ],
        };
    }
}
