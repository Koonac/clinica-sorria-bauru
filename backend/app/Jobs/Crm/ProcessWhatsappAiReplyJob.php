<?php

namespace App\Jobs\Crm;

use App\Models\Clinic;
use App\Models\Crm\Agent;
use App\Models\Crm\Connection;
use App\Models\Crm\Lead;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\Agent\AgentContext;
use App\Services\Crm\Agent\WhatsappAgentRunner;
use App\Services\Crm\EnrichWhatsappInboundMedia;
use App\Services\Crm\WhatsappChatHistory;
use App\Support\ClinicContext;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProcessWhatsappAiReplyJob implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Queueable;

    public int $uniqueFor = 120;

    /** Mensagens recentes verificadas em busca de mídia pendente de leitura. */
    private const MEDIA_LOOKBACK = 20;

    /** Teto de chamadas de transcrição/visão por execução. */
    private const MEDIA_ENRICH_LIMIT = 5;

    public function __construct(
        public int $connectionId,
        public string $chatKey,
    ) {}

    public function uniqueId(): string
    {
        return 'whatsapp-ai:'.$this->connectionId.':'.$this->chatKey;
    }

    public function handle(
        WhatsappAgentRunner $runner,
        WhatsappChatHistory $history,
        ClinicContext $clinicContext,
        EnrichWhatsappInboundMedia $enrichMedia,
    ): void {
        $connection = Connection::withoutGlobalScopes()->find($this->connectionId);
        if (! $connection) {
            return;
        }

        $clinic = Clinic::query()->find($connection->clinic_id);
        if (! $clinic) {
            return;
        }

        $clinicContext->set($clinic);

        $agent = Agent::activeForClinic((int) $connection->clinic_id);
        if (! $agent || ! $agent->canActivate()) {
            return;
        }

        if ($connection->status !== 'connected' || ! filled($connection->session_id)) {
            return;
        }

        [$leadId, $jid] = $this->parseChatKey($this->chatKey);

        $lead = $leadId ? Lead::query()->with('stage')->find($leadId) : null;
        if ($lead?->isWhatsappAgentPaused()) {
            return;
        }

        $latest = $history->latestInbound($connection->id, $leadId, $jid);
        if (! $latest) {
            return;
        }

        $body = trim((string) ($latest->body ?? ''));
        if ($body === '' && ! $latest->has_media) {
            return;
        }

        $idempotencyKey = 'wa-ai:replied:'.$latest->id;
        if (! Cache::add($idempotencyKey, 1, now()->addDay())) {
            return;
        }

        if (! $lead && $latest->lead_id) {
            $lead = Lead::query()->with('stage')->find($latest->lead_id);
            if ($lead?->isWhatsappAgentPaused()) {
                return;
            }
        }

        $jid = $latest->whatsapp_jid ?: $jid;
        if (! $jid) {
            return;
        }

        $user = $connection->created_by
            ? User::query()->find($connection->created_by)
            : ($agent->user_id ? User::query()->find($agent->user_id) : null);

        if (! $user) {
            return;
        }

        $this->enrichPendingMedia($enrichMedia, $history, $connection->id, $lead?->id ?? $leadId, $jid);

        $stages = PipelineStage::ofKind('lead')
            ->where('active', true)
            ->orderBy('position')
            ->get(['id', 'name', 'is_lost'])
            ->map(fn ($s) => [
                'id' => (int) $s->id,
                'name' => (string) $s->name,
                'is_lost' => (bool) $s->is_lost,
            ])
            ->all();

        $context = new AgentContext(
            user: $user,
            connection: $connection,
            agent: $agent,
            chatKey: $this->chatKey,
            jid: $jid,
            sessionId: (string) $connection->session_id,
            lead: $lead,
            deal: $latest->deal_id ? $latest->deal()->first() : null,
            leadStages: $stages,
        );

        try {
            $runner->run($context);
        } catch (Throwable $e) {
            Cache::forget($idempotencyKey);
            Log::error('Falha no WhatsApp agent.', [
                'connection_id' => $connection->id,
                'agent_id' => $agent->id,
                'chat_key' => $this->chatKey,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Áudio/imagem viram texto antes do runner, já que o modelo do agent é só texto.
     * Só roda aqui: com humano no controle o job nem chega neste ponto.
     */
    private function enrichPendingMedia(
        EnrichWhatsappInboundMedia $enrichMedia,
        WhatsappChatHistory $history,
        int $connectionId,
        ?int $leadId,
        ?string $jid,
    ): void {
        $pending = $history->messages($connectionId, $leadId, $jid, self::MEDIA_LOOKBACK)
            ->filter(fn (WhatsappMessage $message) => $enrichMedia->shouldEnrich($message))
            ->sortByDesc('id')
            ->values();

        if ($pending->isEmpty()) {
            return;
        }

        $enrichMedia->handleMany($pending, self::MEDIA_ENRICH_LIMIT);
    }

    /**
     * @return array{0: ?int, 1: ?string}
     */
    private function parseChatKey(string $chatKey): array
    {
        if (str_starts_with($chatKey, 'lead:')) {
            $id = (int) substr($chatKey, 5);

            return [$id > 0 ? $id : null, null];
        }

        if (str_starts_with($chatKey, 'jid:')) {
            return [null, substr($chatKey, 4) ?: null];
        }

        return [null, $chatKey !== '' ? $chatKey : null];
    }
}
