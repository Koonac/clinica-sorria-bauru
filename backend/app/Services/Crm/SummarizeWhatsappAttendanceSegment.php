<?php

namespace App\Services\Crm;

use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\WhatsappAttendanceSegment;
use App\Models\Crm\WhatsappMessage;
use App\Models\LlmTokenUsage;
use App\Models\SystemSetting;
use App\Services\Crm\Agent\Tools\EscalarHumanoTool;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

class SummarizeWhatsappAttendanceSegment
{
    public const EMPTY_SUMMARY = 'Sem mensagens relevantes neste atendimento.';

    private const TRANSCRIPT_LIMIT = 80;

    public function __construct(
        private WhatsappChatHistory $history,
        private OpenRouterAgentClient $openRouter,
    ) {}

    public function handle(WhatsappAttendanceSegment $segment): void
    {
        $segment = $segment->fresh() ?? $segment;

        if (filled($segment->ai_summary)) {
            return;
        }

        if ($segment->ended_at === null || $segment->started_at === null) {
            return;
        }

        $lead = $segment->lead;
        if (! $lead) {
            return;
        }

        $connection = Connection::withoutGlobalScopes()
            ->where('clinic_id', $segment->clinic_id)
            ->orderBy('id')
            ->first();

        $jid = trim((string) ($lead->whatsapp_jid ?? ''));
        $messages = $connection
            ? $this->history->messages(
                $connection->id,
                $lead->id,
                $jid !== '' ? $jid : null,
                self::TRANSCRIPT_LIMIT,
                $segment->started_at,
                $segment->ended_at,
            )
            : $this->messagesForLeadOnly($lead->id, $segment);

        $systemNotices = $this->systemNoticeBodies($connection);
        $lines = [];
        foreach ($messages as $msg) {
            $body = $msg->textForAgent();
            if ($body === '') {
                continue;
            }
            if ($this->isSystemNoticeBody($body, $systemNotices)) {
                continue;
            }
            $role = $msg->direction === 'outbound' ? 'atendente' : 'cliente';
            $lines[] = "{$role}: {$body}";
        }

        if ($lines === []) {
            $segment->forceFill([
                'ai_summary' => self::EMPTY_SUMMARY,
                'ai_summary_at' => now(),
            ])->save();

            return;
        }

        $agent = Agent::activeForClinic((int) $segment->clinic_id);
        $model = $agent?->resolvedModel()
            ?? (string) config('services.openrouter.agent_model', 'deepseek/deepseek-v4-pro');

        $system = SystemSetting::getValue(
            SystemSetting::KEY_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
            SystemSetting::DEFAULT_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT,
        ) ?? SystemSetting::DEFAULT_AI_ATTENDANCE_SUMMARY_SYSTEM_PROMPT;

        $user = "Resuma este atendimento:\n\n".implode("\n", $lines);

        try {
            $summary = $this->openRouter->complete(
                $system,
                $user,
                $model,
                LlmTokenUsage::PURPOSE_ATTENDANCE_SUMMARY,
                (int) $segment->clinic_id,
            );
        } catch (Throwable $e) {
            Log::warning('Falha ao resumir segmento WhatsApp.', [
                'segment_id' => $segment->id,
                'lead_id' => $lead->id,
                'message' => $e->getMessage(),
            ]);

            throw $e;
        }

        $segment->forceFill([
            'ai_summary' => $summary,
            'ai_summary_at' => now(),
        ])->save();
    }

    /**
     * @return Collection<int, WhatsappMessage>
     */
    private function messagesForLeadOnly(int $leadId, WhatsappAttendanceSegment $segment): Collection
    {
        return WhatsappMessage::query()
            ->where('lead_id', $leadId)
            ->where(function ($q) use ($segment) {
                $started = $segment->started_at->copy()->startOfSecond()->subSeconds(WhatsappChatHistory::SEGMENT_START_SKEW_SECONDS);
                $ended = $segment->ended_at->copy()->endOfSecond();
                $q->where(function ($inner) use ($started, $ended) {
                    $inner->where('wa_timestamp', '>=', $started)
                        ->where('wa_timestamp', '<=', $ended);
                })->orWhere(function ($inner) use ($started, $ended) {
                    $inner->whereNull('wa_timestamp')
                        ->where('created_at', '>=', $started)
                        ->where('created_at', '<=', $ended);
                });
            })
            ->orderBy('wa_timestamp')
            ->orderBy('id')
            ->limit(self::TRANSCRIPT_LIMIT)
            ->get();
    }

    /**
     * @return list<string>
     */
    private function systemNoticeBodies(?Connection $connection): array
    {
        $notices = [
            EscalarHumanoTool::TRANSFER_NOTICE,
            FinalizeWhatsappConversationForLead::DEFAULT_FINALIZE_NOTICE,
        ];

        if ($connection) {
            $configured = trim((string) ($connection->whatsapp_finalize_notice ?? ''));
            if ($configured !== '') {
                $notices[] = $configured;
            }
        }

        return array_values(array_unique($notices));
    }

    /**
     * @param  list<string>  $notices
     */
    private function isSystemNoticeBody(string $body, array $notices): bool
    {
        $normalized = trim($body);
        foreach ($notices as $notice) {
            if ($notice !== '' && $normalized === $notice) {
                return true;
            }
        }

        return false;
    }
}
