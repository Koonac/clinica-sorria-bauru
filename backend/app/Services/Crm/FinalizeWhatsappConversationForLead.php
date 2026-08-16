<?php

namespace App\Services\Crm;

use App\Jobs\Crm\SendWhatsappFinalizeNoticeJob;
use App\Jobs\Crm\SummarizeWhatsappAttendanceSegmentJob;
use App\Models\Crm\Activity;
use App\Models\Crm\Lead;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class FinalizeWhatsappConversationForLead
{
    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_AI = 'ai';

    public const SOURCE_AUTO_CLOSE = 'auto_close';

    public const DEFAULT_FINALIZE_NOTICE = '_finalizando chamado_';

    public function __construct(private CloseWhatsappAttendanceSegment $closeSegment) {}

    /**
     * Finaliza o atendimento: remove dono, limpa pausa, fecha segmento e marca conversa fechada.
     * Aviso WhatsApp e resumo IA rodam em jobs (não bloqueiam a resposta HTTP).
     *
     * @param  self::SOURCE_*  $source
     */
    public function handle(Lead $lead, ?User $user = null, string $source = self::SOURCE_MANUAL): Lead
    {
        $closedSegmentId = null;
        $didFinalize = false;
        $shouldNotify = $source !== self::SOURCE_AUTO_CLOSE;

        $updated = DB::transaction(function () use ($lead, $user, $source, &$closedSegmentId, &$didFinalize) {
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

            $closedSegment = $this->closeSegment->handle($lead);
            $closedSegmentId = $closedSegment?->id;
            $didFinalize = true;

            $fresh = $lead->fresh(['contact', 'source', 'owner', 'stage']) ?? $lead;

            [$subject, $body] = $this->activityCopy($user, $source);

            Activity::create([
                'type' => 'note',
                'subject' => $subject,
                'body' => $body,
                'lead_id' => $fresh->id,
                'contact_id' => $fresh->contact_id,
                'user_id' => $user?->id,
                'meta' => [
                    'whatsapp_finalized' => true,
                    'finalized_source' => $source,
                    'finalized_by' => $user?->id,
                    'finalized_by_name' => $user?->name,
                ],
            ]);

            return $fresh;
        });

        if ($didFinalize && $shouldNotify) {
            SendWhatsappFinalizeNoticeJob::dispatch($updated->id, $user?->id)->afterCommit();
        }

        if ($didFinalize && $closedSegmentId) {
            SummarizeWhatsappAttendanceSegmentJob::dispatch($closedSegmentId)->afterCommit();
        }

        return $updated;
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
