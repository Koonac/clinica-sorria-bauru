<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\GenerateWhatsappCampaignMessagesRequest;
use App\Http\Requests\Crm\ImportWhatsappCampaignCsvRequest;
use App\Http\Requests\Crm\StoreWhatsappCampaignRecipientRequest;
use App\Http\Requests\Crm\StoreWhatsappCampaignRequest;
use App\Http\Requests\Crm\UpdateWhatsappCampaignRecipientRequest;
use App\Http\Requests\Crm\UpdateWhatsappCampaignRequest;
use App\Jobs\Crm\RunWhatsappCampaignJob;
use App\Models\Crm\WhatsappCampaign;
use App\Models\Crm\WhatsappCampaignRecipient;
use App\Models\User;
use App\Services\Crm\OpenRouterCampaignClient;
use App\Services\Crm\ParseCampaignCsv;
use App\Services\Crm\RenderCampaignMessage;
use App\Services\Crm\UpsertClinicConnection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class WhatsappCampaignController extends Controller
{
    public function __construct(
        private ParseCampaignCsv $csvParser,
        private RenderCampaignMessage $renderer,
        private OpenRouterCampaignClient $openRouter,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = WhatsappCampaign::query()
            ->latest('updated_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json($query->paginate(min(200, max(1, (int) $request->query('per_page', 50)))));
    }

    public function store(StoreWhatsappCampaignRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();

        $campaign = DB::transaction(function () use ($user, $data) {
            $campaign = WhatsappCampaign::create([
                'user_id' => $user->id,
                'name' => $data['name'],
                'status' => 'draft',
                'delay_between_contacts_sec' => $data['delay_between_contacts_sec'] ?? 45,
                'delay_jitter_sec' => $data['delay_jitter_sec'] ?? 15,
            ]);

            foreach (array_values($data['messages']) as $i => $msg) {
                $campaign->messages()->create([
                    'position' => $i,
                    'message_body' => $msg['message_body'],
                    'delay_after_sec' => $msg['delay_after_sec'] ?? 10,
                ]);
            }

            return $campaign->load(['messages', 'recipients']);
        });

        return response()->json(['data' => $this->serializeCampaign($campaign)], 201);
    }

    public function show(Request $request, WhatsappCampaign $campaign): JsonResponse
    {
        $this->authorizeCampaign($request, $campaign);
        $campaign->load(['messages', 'recipients']);

        return response()->json(['data' => $this->serializeCampaign($campaign)]);
    }

    public function update(UpdateWhatsappCampaignRequest $request, WhatsappCampaign $campaign): JsonResponse
    {
        $this->authorizeCampaign($request, $campaign);
        $this->assertEditable($campaign);

        $data = $request->validated();

        DB::transaction(function () use ($campaign, $data) {
            if (isset($data['name'])) {
                $campaign->name = $data['name'];
            }
            if (isset($data['delay_between_contacts_sec'])) {
                $campaign->delay_between_contacts_sec = $data['delay_between_contacts_sec'];
            }
            if (isset($data['delay_jitter_sec'])) {
                $campaign->delay_jitter_sec = $data['delay_jitter_sec'];
            }

            if (isset($data['messages'])) {
                $campaign->messages()->delete();
                foreach (array_values($data['messages']) as $i => $msg) {
                    $campaign->messages()->create([
                        'position' => $i,
                        'message_body' => $msg['message_body'],
                        'delay_after_sec' => $msg['delay_after_sec'] ?? 10,
                    ]);
                }
            }

            if (in_array($campaign->status, ['cancelled', 'failed', 'completed', 'paused'], true)) {
                $campaign->status = 'draft';
                $campaign->started_at = null;
                $campaign->completed_at = null;
            }

            $campaign->save();
        });

        return response()->json(['data' => $this->serializeCampaign($campaign->fresh(['messages', 'recipients']))]);
    }

    public function importCsv(
        ImportWhatsappCampaignCsvRequest $request,
        WhatsappCampaign $campaign,
    ): JsonResponse {
        $this->authorizeCampaign($request, $campaign);
        $this->assertEditable($campaign);

        try {
            $parsed = $this->csvParser->handle($request->validated('csv_content'));
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        if ($parsed === []) {
            return response()->json(['message' => 'No valid recipients found in the CSV.'], 422);
        }

        DB::transaction(function () use ($campaign, $parsed) {
            $campaign->recipients()->delete();
            foreach ($parsed as $row) {
                $campaign->recipients()->create($row);
            }
            $campaign->total_recipients = count($parsed);
            $campaign->sent_count = 0;
            $campaign->failed_count = 0;
            if (in_array($campaign->status, ['cancelled', 'failed', 'completed', 'paused'], true)) {
                $campaign->status = 'draft';
            }
            $campaign->save();
        });

        $campaign->load(['messages', 'recipients']);

        return response()->json([
            'data' => [
                'id' => $campaign->id,
                'total_recipients' => $campaign->total_recipients,
                'recipients' => $campaign->recipients->map(fn ($r) => $this->serializeRecipient($r))->values(),
                'campaign' => $this->serializeCampaign($campaign),
            ],
        ]);
    }

    public function storeRecipient(
        StoreWhatsappCampaignRecipientRequest $request,
        WhatsappCampaign $campaign,
    ): JsonResponse {
        $this->authorizeCampaign($request, $campaign);
        $this->assertEditable($campaign);

        $data = $request->validated();
        $phone = $this->csvParser->normalizePhone((string) $data['phone']);
        if ($phone === null) {
            return response()->json(['message' => 'Informe um telefone/WhatsApp válido.'], 422);
        }

        $recipient = DB::transaction(function () use ($campaign, $data, $phone) {
            $recipient = $campaign->recipients()->create([
                'full_name' => trim((string) ($data['full_name'] ?? '')),
                'phone' => $phone,
                'notes' => trim((string) ($data['notes'] ?? '')),
                'status' => 'pending',
            ]);

            $campaign->total_recipients = $campaign->recipients()->count();
            if (in_array($campaign->status, ['cancelled', 'failed', 'completed', 'paused'], true)) {
                $campaign->status = 'draft';
            }
            $campaign->save();

            return $recipient;
        });

        return response()->json([
            'data' => [
                'recipient' => $this->serializeRecipient($recipient),
                'total_recipients' => $campaign->fresh()->total_recipients,
            ],
        ], 201);
    }

    public function updateRecipient(
        UpdateWhatsappCampaignRecipientRequest $request,
        WhatsappCampaign $campaign,
        WhatsappCampaignRecipient $recipient,
    ): JsonResponse {
        $this->authorizeCampaign($request, $campaign);
        $this->assertRecipientBelongs($campaign, $recipient);
        $this->assertEditable($campaign);

        $data = $request->validated();

        if (array_key_exists('use_custom_message', $data)) {
            $recipient->use_custom_message = (bool) $data['use_custom_message'];
        }
        if (array_key_exists('custom_message', $data)) {
            $recipient->custom_message = $this->renderer->serializeCustomSequence($data['custom_message']);
        }
        if (array_key_exists('full_name', $data)) {
            $recipient->full_name = $data['full_name'];
        }
        if (array_key_exists('notes', $data)) {
            $recipient->notes = $data['notes'];
        }

        if ($recipient->use_custom_message && $this->renderer->parseCustomSequence($recipient->custom_message) === []) {
            return response()->json(['message' => 'Informe ao menos uma mensagem na sequência personalizada.'], 422);
        }

        $recipient->save();

        return response()->json(['data' => $this->serializeRecipient($recipient)]);
    }

    public function applyDefaultToRecipient(
        Request $request,
        WhatsappCampaign $campaign,
        WhatsappCampaignRecipient $recipient,
    ): JsonResponse {
        $this->authorizeCampaign($request, $campaign);
        $this->assertRecipientBelongs($campaign, $recipient);
        $this->assertEditable($campaign);

        $campaign->load('messages');
        $sequence = $campaign->messages
            ->filter(fn ($m) => trim((string) $m->message_body) !== '')
            ->map(fn ($m) => [
                'message_body' => trim((string) $m->message_body),
                'delay_after_sec' => (int) $m->delay_after_sec,
            ])
            ->values()
            ->all();

        if ($sequence === []) {
            return response()->json(['message' => 'A campanha não tem mensagem padrão definida.'], 422);
        }

        $recipient->custom_message = $this->renderer->serializeCustomSequence($sequence);
        $recipient->use_custom_message = true;
        $recipient->save();

        return response()->json(['data' => $this->serializeRecipient($recipient)]);
    }

    public function openrouterModels(Request $request): JsonResponse
    {
        $requireTools = $request->boolean('tools')
            || $request->boolean('supports_tools');

        try {
            $models = $this->openRouter->listModels($requireTools);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'data' => [
                'models' => $models,
                'total' => count($models),
                'tools_only' => $requireTools,
            ],
        ]);
    }

    public function generateMessages(
        GenerateWhatsappCampaignMessagesRequest $request,
        WhatsappCampaign $campaign,
    ): JsonResponse {
        $this->authorizeCampaign($request, $campaign);
        $this->assertEditable($campaign);

        $data = $request->validated();
        $campaign->load('recipients');

        if ($campaign->recipients->isEmpty()) {
            return response()->json(['message' => 'Importe destinatários antes de gerar mensagens.'], 422);
        }

        try {
            $this->openRouter->apiKey();
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $generated = 0;
        $failed = [];

        foreach ($campaign->recipients as $recipient) {
            try {
                $aiText = $this->openRouter->generate(
                    $data['system_prompt'],
                    $recipient->full_name,
                    $recipient->notes,
                    $data['model'],
                );
                $sequence = $this->renderer->splitAiMessages($aiText);
                if ($sequence === []) {
                    throw new RuntimeException('A IA não retornou nenhuma mensagem.');
                }
                $recipient->use_custom_message = true;
                $recipient->custom_message = $this->renderer->serializeCustomSequence($sequence);
                $recipient->save();
                $generated++;
            } catch (Throwable $e) {
                $failed[] = [
                    'recipient_id' => $recipient->id,
                    'full_name' => $recipient->full_name ?? '',
                    'phone' => $recipient->phone ?? '',
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'data' => [
                'campaign_id' => $campaign->id,
                'generated' => $generated,
                'failed_count' => count($failed),
                'failed' => $failed,
                'total' => $campaign->recipients->count(),
            ],
        ]);
    }

    public function start(Request $request, WhatsappCampaign $campaign, UpsertClinicConnection $upsert): JsonResponse
    {
        $this->authorizeCampaign($request, $campaign);

        $connection = $upsert->handle([], $request->user()?->id);

        if (! $connection->hasCredentials() || ! filled($connection->session_id)) {
            return response()->json(['message' => 'WhatsApp integration is not enabled'], 422);
        }
        if ($connection->status !== 'connected') {
            return response()->json(['message' => 'WhatsApp session is not connected. Connect it in Settings.'], 422);
        }

        $campaign->load(['messages', 'recipients']);

        if ($campaign->messages->isEmpty()) {
            return response()->json(['message' => 'Add at least one message before starting.'], 422);
        }
        if ($campaign->recipients->isEmpty()) {
            return response()->json(['message' => 'Import recipients before starting.'], 422);
        }

        if ($campaign->status === 'paused') {
            foreach ($campaign->recipients as $recipient) {
                if (in_array($recipient->status, ['failed', 'skipped', 'sending'], true)) {
                    $recipient->update(['status' => 'pending', 'error_message' => null]);
                }
            }
        } elseif (in_array($campaign->status, ['draft', 'cancelled', 'failed', 'completed'], true)) {
            foreach ($campaign->recipients as $recipient) {
                if ($recipient->status !== 'sent') {
                    $recipient->update(['status' => 'pending', 'error_message' => null]);
                }
            }
        } else {
            return response()->json([
                'message' => "Campaign cannot be started from status {$campaign->status}.",
            ], 422);
        }

        $pending = $campaign->recipients()->where('status', 'pending')->count();
        if ($pending === 0) {
            return response()->json(['message' => 'No pending recipients to send.'], 422);
        }

        $campaign->update([
            'status' => 'queued',
            'started_at' => $campaign->started_at ?? now(),
            'completed_at' => null,
        ]);

        RunWhatsappCampaignJob::dispatch($campaign->id);

        return response()->json([
            'data' => [
                'id' => $campaign->id,
                'status' => $campaign->status,
            ],
        ]);
    }

    public function pause(Request $request, WhatsappCampaign $campaign): JsonResponse
    {
        $this->authorizeCampaign($request, $campaign);

        if (! in_array($campaign->status, ['queued', 'running'], true)) {
            return response()->json(['message' => 'Only queued or running campaigns can be paused.'], 422);
        }

        $campaign->update(['status' => 'paused']);

        return response()->json([
            'data' => [
                'id' => $campaign->id,
                'status' => $campaign->status,
            ],
        ]);
    }

    public function cancel(Request $request, WhatsappCampaign $campaign): JsonResponse
    {
        $this->authorizeCampaign($request, $campaign);

        if (in_array($campaign->status, ['completed', 'cancelled'], true)) {
            return response()->json(['message' => "Campaign is already {$campaign->status}."], 422);
        }

        $campaign->recipients()
            ->whereIn('status', ['pending', 'sending'])
            ->update(['status' => 'skipped']);

        $campaign->update([
            'status' => 'cancelled',
            'completed_at' => now(),
        ]);

        return response()->json([
            'data' => [
                'id' => $campaign->id,
                'status' => $campaign->status,
            ],
        ]);
    }

    private function authorizeCampaign(Request $request, WhatsappCampaign $campaign): void
    {
        // Escopo de clínica (BelongsToClinic) já restringe a campanha da clínica ativa.
        abort_if(! $campaign->exists, 404);
    }

    private function assertRecipientBelongs(WhatsappCampaign $campaign, WhatsappCampaignRecipient $recipient): void
    {
        abort_if($recipient->whatsapp_campaign_id !== $campaign->id, 404);
    }

    private function assertEditable(WhatsappCampaign $campaign): void
    {
        if (! $campaign->isEditable()) {
            abort(422, 'Cannot edit a campaign that is queued or running.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeCampaign(WhatsappCampaign $campaign): array
    {
        return [
            'id' => $campaign->id,
            'name' => $campaign->name,
            'status' => $campaign->status,
            'delay_between_contacts_sec' => $campaign->delay_between_contacts_sec,
            'delay_jitter_sec' => $campaign->delay_jitter_sec,
            'total_recipients' => $campaign->total_recipients,
            'sent_count' => $campaign->sent_count,
            'failed_count' => $campaign->failed_count,
            'started_at' => $campaign->started_at,
            'completed_at' => $campaign->completed_at,
            'created_at' => $campaign->created_at,
            'updated_at' => $campaign->updated_at,
            'messages' => $campaign->relationLoaded('messages')
                ? $campaign->messages->map(fn ($m) => [
                    'id' => $m->id,
                    'position' => $m->position,
                    'message_body' => $m->message_body,
                    'delay_after_sec' => $m->delay_after_sec,
                ])->values()
                : [],
            'recipients' => $campaign->relationLoaded('recipients')
                ? $campaign->recipients->map(fn ($r) => $this->serializeRecipient($r))->values()
                : [],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeRecipient(WhatsappCampaignRecipient $recipient): array
    {
        $customSequence = $this->renderer->parseCustomSequence($recipient->custom_message);

        return [
            'id' => $recipient->id,
            'full_name' => $recipient->full_name,
            'phone' => $recipient->phone,
            'notes' => $recipient->notes,
            'status' => $recipient->status,
            'use_custom_message' => (bool) $recipient->use_custom_message,
            'custom_message' => $recipient->custom_message,
            'custom_sequence' => $customSequence,
            'error_message' => $recipient->error_message,
            'last_sent_at' => $recipient->last_sent_at,
        ];
    }
}
