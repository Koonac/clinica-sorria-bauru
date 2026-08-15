<?php

namespace App\Http\Controllers\Api\Crm;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\SendWhatsappMessageRequest;
use App\Http\Requests\Crm\UpdateWhatsappCredentialsRequest;
use App\Http\Requests\Crm\UpdateWhatsappSettingsRequest;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\PauseWhatsappAgentForLead;
use App\Services\Crm\SyncWhatsappLabels;
use App\Services\Crm\WhatsappApiClient;
use App\Services\Crm\WhatsappLeadResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class WhatsappController extends Controller
{
    public function __construct(
        private WhatsappLeadResolver $leadResolver,
        private SyncWhatsappLabels $labelSync,
        private PauseWhatsappAgentForLead $pauseAgent,
    ) {}

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $this->publicState($user)]);
    }

    public function updateCredentials(UpdateWhatsappCredentialsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->update($request->validated());

        return response()->json(['data' => $this->publicState($user->fresh())]);
    }

    public function updateSettings(UpdateWhatsappSettingsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->whatsapp_default_lead_stage_id = $request->validated('default_lead_stage_id');
        $user->save();

        return response()->json(['data' => $this->publicState($user->fresh())]);
    }

    public function connect(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->hasWhatsappCredentials()) {
            return response()->json([
                'message' => 'Configure usuário e senha da WhatsApp API antes de conectar.',
            ], 422);
        }

        if (! filled($user->whatsapp_session_id)) {
            $user->whatsapp_session_id = (string) Str::uuid();
        }
        if (! filled($user->whatsapp_webhook_token)) {
            $user->whatsapp_webhook_token = Str::random(64);
        }

        $token = $user->whatsapp_webhook_token;
        $base = rtrim((string) config('app.url'), '/');
        $notificationsUrl = "{$base}/api/v1/crm/whatsapp/webhooks/notifications?token={$token}";
        $messagesUrl = "{$base}/api/v1/crm/whatsapp/webhooks/messages?token={$token}";

        $client = new WhatsappApiClient($user);

        try {
            if (in_array($user->whatsapp_status, ['connecting', 'connected', 'error'], true)) {
                try {
                    $client->disconnect($user->whatsapp_session_id);
                } catch (Throwable) {
                    // Sessão pode já estar morta na API.
                }
            }

            $client->connect($user->whatsapp_session_id, $notificationsUrl, $messagesUrl);
        } catch (RuntimeException $e) {
            $user->whatsapp_status = 'error';
            $user->save();

            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 502);
        }

        $user->whatsapp_status = 'connecting';
        $user->whatsapp_qr = null;
        $user->save();

        return response()->json([
            'data' => $this->publicState($user),
            'message' => 'Conexão iniciada. Escaneie o QR Code.',
        ], 201);
    }

    public function qrcode(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (filled($user->whatsapp_qr)) {
            return response()->json([
                'data' => [
                    'session_id' => $user->whatsapp_session_id,
                    'qr' => $user->whatsapp_qr,
                    'source' => 'local',
                ],
            ]);
        }

        if (! filled($user->whatsapp_session_id) || ! $user->hasWhatsappCredentials()) {
            return response()->json(['message' => 'Nenhuma sessão WhatsApp ativa.'], 404);
        }

        try {
            $result = (new WhatsappApiClient($user))->qrcode($user->whatsapp_session_id);
        } catch (RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode() === 404 ? 404 : 502);
        }

        $qr = $result['qrImage'] ?? $result['qr'] ?? null;
        if (is_string($qr) && $qr !== '') {
            $user->whatsapp_qr = $qr;
            $user->save();
        }

        return response()->json([
            'data' => [
                'session_id' => $user->whatsapp_session_id,
                'qr' => $qr,
                'source' => 'api',
            ],
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (filled($user->whatsapp_session_id) && $user->hasWhatsappCredentials()) {
            try {
                $remote = (new WhatsappApiClient($user))->status($user->whatsapp_session_id);
                $remoteStatus = $remote['status'] ?? null;
                if (is_string($remoteStatus) && in_array($remoteStatus, User::WHATSAPP_STATUSES, true)) {
                    $eraBusiness = (bool) $user->whatsapp_is_business;
                    $user->whatsapp_status = $remoteStatus;
                    if ($remoteStatus === 'connected') {
                        $user->whatsapp_qr = null;
                        $info = $remote['info'] ?? null;
                        if (is_array($info) && isset($info['wid']['user'])) {
                            $user->whatsapp_phone = (string) $info['wid']['user'];
                        }
                        if (array_key_exists('isBusiness', $remote)) {
                            $user->whatsapp_is_business = (bool) $remote['isBusiness'];
                        }
                    } else {
                        $user->whatsapp_is_business = false;
                    }
                    $user->save();

                    if (! $eraBusiness && $user->whatsapp_is_business) {
                        $this->labelSync->ensurePipelineLabels($user->fresh());
                    }
                }
            } catch (Throwable) {
                // Mantém status local se a API estiver indisponível.
            }
        }

        return response()->json(['data' => $this->publicState($user->fresh())]);
    }

    public function disconnect(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (filled($user->whatsapp_session_id) && $user->hasWhatsappCredentials()) {
            try {
                (new WhatsappApiClient($user))->disconnect($user->whatsapp_session_id);
            } catch (Throwable) {
                // Segue limpando o estado local mesmo se a API falhar.
            }
        }

        $user->forceFill([
            'whatsapp_status' => 'disconnected',
            'whatsapp_is_business' => false,
            'whatsapp_qr' => null,
            'whatsapp_phone' => null,
        ])->save();

        return response()->json([
            'data' => $this->publicState($user),
            'message' => 'WhatsApp desconectado.',
        ]);
    }

    public function send(SendWhatsappMessageRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->whatsapp_status !== 'connected' || ! filled($user->whatsapp_session_id)) {
            return response()->json(['message' => 'WhatsApp não está conectado.'], 422);
        }

        $to = trim($request->validated('to'));
        $message = trim((string) ($request->validated('message') ?? ''));
        $contactName = $request->validated('contact_name');
        $mediaInput = $request->validated('media');
        $hasMedia = is_array($mediaInput) && filled($mediaInput['data'] ?? null);

        $mediaPayload = null;
        $mediaStored = null;
        if ($hasMedia) {
            $rawData = (string) $mediaInput['data'];
            $rawData = preg_replace('#^data:[^;]+;base64,#', '', $rawData) ?: $rawData;
            $mimetype = strtolower((string) ($mediaInput['mimetype'] ?? 'image/jpeg'));
            $filename = filled($mediaInput['filename'] ?? null)
                ? (string) $mediaInput['filename']
                : 'image.jpg';

            $mediaPayload = [
                'mimetype' => $mimetype,
                'data' => $rawData,
                'filename' => $filename,
            ];
            // Não persistir base64 gigante no CRM.
            $mediaStored = [
                'mimetype' => $mimetype,
                'filename' => $filename,
                'omitted' => true,
            ];
        }

        $jid = str_contains($to, '@') ? $to : preg_replace('/\D+/', '', $to).'@c.us';
        $phone = $this->phoneFromJidOrTo($jid, $to);

        $resolved = $this->leadResolver->resolve($user, [
            'jid' => $this->preferPhoneJid($jid, $phone),
            'phone_number' => $phone,
            'contact_name' => $contactName,
        ]);

        try {
            $result = (new WhatsappApiClient($user))->send(
                $user->whatsapp_session_id,
                $jid,
                $message,
                $mediaPayload,
            );
        } catch (RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 502);
        }

        $resultTo = is_string($result['to'] ?? null) ? $result['to'] : $jid;
        [$storedJid, $storedLid] = $this->normalizeStoredJids($jid, $resultTo, $phone);
        $messageId = isset($result['messageId']) ? (string) $result['messageId'] : null;

        $raw = $result;
        unset($raw['media']);

        $record = WhatsappMessage::create([
            'user_id' => $user->id,
            'session_id' => $user->whatsapp_session_id,
            'whatsapp_jid' => $storedJid,
            'whatsapp_lid' => $storedLid,
            'phone_number' => $phone,
            'contact_name' => $contactName,
            'direction' => 'outbound',
            'body' => $message !== '' ? $message : ($hasMedia ? null : ''),
            'message_id' => $messageId ?: null,
            'type' => $hasMedia ? 'image' : 'chat',
            'has_media' => $hasMedia,
            'media' => $mediaStored,
            'lead_id' => $resolved['lead']?->id,
            'deal_id' => $resolved['deal']?->id,
            'contact_id' => $resolved['contact']?->id,
            'raw' => $raw,
            'wa_timestamp' => now(),
        ]);

        // Resposta humana pela plataforma — pausa o agent neste lead.
        if ($resolved['lead']) {
            $this->pauseAgent->handle(
                $resolved['lead'],
                $user,
                'platform',
                mb_substr($message !== '' ? $message : '[imagem]', 0, 500),
            );
        }

        return response()->json([
            'data' => [
                'message' => $record,
                'lead' => $resolved['lead'],
                'deal' => $resolved['deal'],
                'contact' => $resolved['contact'],
            ],
        ], 201);
    }

    public function chats(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $search = trim((string) $request->query('search', ''));

        $bindings = [$user->id];
        $searchSql = '';
        if ($search !== '') {
            $like = '%'.mb_strtolower($search).'%';
            $searchSql = ' AND (
                LOWER(COALESCE(contact_name, \'\')) LIKE ?
                OR LOWER(COALESCE(phone_number, \'\')) LIKE ?
                OR LOWER(whatsapp_jid) LIKE ?
                OR LOWER(COALESCE(whatsapp_lid, \'\')) LIKE ?
            )';
            $bindings[] = $like;
            $bindings[] = $like;
            $bindings[] = $like;
            $bindings[] = $like;
        }

        // Une @c.us e @lid do mesmo contato: chave = telefone real, senão LID, senão JID.
        $rows = DB::select(
            "SELECT * FROM (
                SELECT DISTINCT ON (conversation_key)
                    id, whatsapp_jid, whatsapp_lid, phone_number, contact_name,
                    direction, body, has_media, lead_id, deal_id, contact_id,
                    wa_timestamp, created_at, conversation_key
                FROM (
                    SELECT
                        id, whatsapp_jid, whatsapp_lid, phone_number, contact_name,
                        direction, body, has_media, lead_id, deal_id, contact_id,
                        wa_timestamp, created_at,
                        CASE
                            WHEN phone_number IS NOT NULL
                              AND phone_number <> ''
                              AND length(regexp_replace(phone_number, '\\D', '', 'g')) >= 10
                              AND NOT (
                                  whatsapp_jid LIKE '%@lid'
                                  AND regexp_replace(phone_number, '\\D', '', 'g')
                                      = split_part(whatsapp_jid, '@', 1)
                              )
                            THEN regexp_replace(phone_number, '\\D', '', 'g')
                            ELSE COALESCE(
                                NULLIF(whatsapp_lid, ''),
                                CASE WHEN whatsapp_jid LIKE '%@lid' THEN whatsapp_jid END,
                                whatsapp_jid
                            )
                        END AS conversation_key
                    FROM whatsapp_messages
                    WHERE user_id = ?
                      AND whatsapp_jid IS NOT NULL
                      AND whatsapp_jid <> ''
                ) keyed
                ORDER BY conversation_key, wa_timestamp DESC NULLS LAST, id DESC
            ) AS chats
            WHERE 1=1 {$searchSql}
            ORDER BY wa_timestamp DESC NULLS LAST, id DESC
            LIMIT 200",
            $bindings,
        );

        $lidKeys = [];
        foreach ($rows as $row) {
            if (is_string($row->whatsapp_jid) && str_ends_with($row->whatsapp_jid, '@lid')) {
                $lidKeys[] = $row->whatsapp_jid;
            } elseif (is_string($row->whatsapp_lid) && $row->whatsapp_lid !== '') {
                $lidKeys[] = $row->whatsapp_lid;
            }
        }
        $lidKeys = array_values(array_unique($lidKeys));

        $phoneJidByLid = [];
        if ($lidKeys !== []) {
            $mapped = WhatsappMessage::query()
                ->where('user_id', $user->id)
                ->whereIn('whatsapp_lid', $lidKeys)
                ->where(function ($q) {
                    $q->where('whatsapp_jid', 'like', '%@c.us')
                        ->orWhere('whatsapp_jid', 'like', '%@s.whatsapp.net');
                })
                ->orderByDesc('id')
                ->get(['whatsapp_jid', 'whatsapp_lid', 'phone_number']);

            foreach ($mapped as $msg) {
                $lid = (string) $msg->whatsapp_lid;
                if ($lid !== '' && ! isset($phoneJidByLid[$lid])) {
                    $phoneJidByLid[$lid] = [
                        'jid' => $msg->whatsapp_jid,
                        'phone' => $msg->phone_number,
                    ];
                }
            }
        }

        $data = array_map(function (object $row) use ($phoneJidByLid): array {
            $hasMedia = $row->has_media;
            if (is_string($hasMedia)) {
                $hasMedia = in_array(strtolower($hasMedia), ['1', 't', 'true', 'yes'], true);
            } else {
                $hasMedia = (bool) $hasMedia;
            }

            $jid = (string) $row->whatsapp_jid;
            $lid = filled($row->whatsapp_lid ?? null) ? (string) $row->whatsapp_lid : null;
            $phone = $row->phone_number;

            if (str_ends_with($jid, '@lid')) {
                $lid = $lid ?: $jid;
                if (isset($phoneJidByLid[$jid])) {
                    $mapped = $phoneJidByLid[$jid];
                    $jid = $mapped['jid'];
                    $phone = $mapped['phone'] ?: $phone;
                }
            } elseif ($lid && isset($phoneJidByLid[$lid]) && ! str_ends_with($jid, '@c.us') && ! str_ends_with($jid, '@s.whatsapp.net')) {
                $mapped = $phoneJidByLid[$lid];
                $jid = $mapped['jid'];
                $phone = $mapped['phone'] ?: $phone;
            }

            return [
                'whatsapp_jid' => $jid,
                'whatsapp_lid' => $lid,
                'phone_number' => $phone,
                'contact_name' => $row->contact_name,
                'lead_id' => $row->lead_id ? (int) $row->lead_id : null,
                'deal_id' => $row->deal_id ? (int) $row->deal_id : null,
                'contact_id' => $row->contact_id ? (int) $row->contact_id : null,
                'last_message' => [
                    'id' => (int) $row->id,
                    'body' => $row->body,
                    'direction' => $row->direction,
                    'has_media' => $hasMedia,
                    'wa_timestamp' => $row->wa_timestamp,
                    'created_at' => $row->created_at,
                ],
            ];
        }, $rows);

        return response()->json(['data' => $data]);
    }

    public function messages(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $leadId = $request->query('lead_id');
        $dealId = $request->query('deal_id');
        $jid = trim((string) $request->query('jid', ''));

        if (! $leadId && ! $dealId && $jid === '') {
            return response()->json([
                'message' => 'Informe lead_id, deal_id ou jid.',
            ], 422);
        }

        $relatedJids = $jid !== '' ? app(\App\Services\Crm\WhatsappChatHistory::class)->relatedJids($user->id, $jid) : [];

        $query = WhatsappMessage::query()
            ->where('user_id', $user->id)
            ->where(function ($q) use ($leadId, $dealId, $jid, $relatedJids) {
                if ($leadId) {
                    $q->orWhere('lead_id', (int) $leadId);
                }
                if ($dealId) {
                    $q->orWhere('deal_id', (int) $dealId);
                }
                if ($jid !== '') {
                    $q->orWhere(function ($inner) use ($relatedJids) {
                        $inner->whereIn('whatsapp_jid', $relatedJids)
                            ->orWhereIn('whatsapp_lid', $relatedJids);
                    });
                }
            })
            ->latest('wa_timestamp')
            ->latest('id');

        $mensagens = $query->limit(200)->get()->sortBy(function (WhatsappMessage $m) {
            return [$m->wa_timestamp?->timestamp ?? 0, $m->id];
        })->values();

        return response()->json(['data' => $mensagens]);
    }

    public function notificationsWebhook(Request $request): JsonResponse
    {
        $user = $this->userFromWebhookToken($request);
        if (! $user) {
            return response()->json(['message' => 'Token inválido.'], 401);
        }

        $event = (string) $request->input('event', '');
        $data = $request->input('data');

        match ($event) {
            'qr_code' => $this->handleQrCode($user, is_array($data) ? $data : []),
            'authenticated' => $user->forceFill([
                'whatsapp_qr' => null,
                'whatsapp_status' => 'connecting',
            ])->save(),
            'ready' => $this->handleReady($user, is_array($data) ? $data : []),
            'disconnected' => $user->forceFill([
                'whatsapp_status' => 'disconnected',
                'whatsapp_is_business' => false,
                'whatsapp_qr' => null,
            ])->save(),
            'error' => $user->forceFill([
                'whatsapp_status' => 'error',
            ])->save(),
            default => null,
        };

        return response()->json(['success' => true]);
    }

    public function messagesWebhook(Request $request): JsonResponse
    {
        $user = $this->userFromWebhookToken($request);
        if (! $user) {
            return response()->json(['message' => 'Token inválido.'], 401);
        }

        if ((string) $request->input('event') !== 'message') {
            return response()->json(['success' => true, 'ignored' => true]);
        }

        $data = $request->input('data');
        if (! is_array($data)) {
            return response()->json(['message' => 'Payload inválido.'], 422);
        }

        if (! empty($data['is_group'])) {
            return response()->json(['success' => true, 'ignored' => 'group']);
        }

        if (! empty($data['is_broadcast'])) {
            return response()->json(['success' => true, 'ignored' => 'broadcast']);
        }

        $jid = trim((string) ($data['jid'] ?? ''));
        if ($jid === '') {
            return response()->json(['message' => 'jid obrigatório.'], 422);
        }

        // Só chats diretos (@c.us / @s.whatsapp.net / @lid)
        $jidServer = strtolower((string) (str_contains($jid, '@') ? explode('@', $jid, 2)[1] : ''));
        if (in_array($jidServer, ['g.us', 'broadcast', 'newsletter'], true)) {
            return response()->json(['success' => true, 'ignored' => $jidServer]);
        }
        if (! in_array($jidServer, ['c.us', 's.whatsapp.net', 'lid'], true)) {
            return response()->json(['success' => true, 'ignored' => 'non_direct']);
        }

        $sessionId = (string) ($request->input('session_id') ?: $user->whatsapp_session_id);

        WhatsappInboundMessageReceived::dispatch($user, $sessionId, $data);

        return response()->json(['success' => true]);
    }

    private function handleReady(User $user, array $data): void
    {
        $isBusiness = (bool) ($data['isBusiness'] ?? false);

        $user->forceFill([
            'whatsapp_status' => 'connected',
            'whatsapp_qr' => null,
            'whatsapp_phone' => $data['phone_number'] ?? $user->whatsapp_phone,
            'whatsapp_is_business' => $isBusiness,
        ])->save();

        if ($isBusiness) {
            $this->labelSync->ensurePipelineLabels($user->fresh());
        }
    }

    private function handleQrCode(User $user, array $data): void
    {
        $qr = $data['qr'] ?? null;
        if (! is_string($qr) || $qr === '') {
            return;
        }

        $user->forceFill([
            'whatsapp_qr' => $qr,
            'whatsapp_status' => 'connecting',
        ])->save();
    }

    private function userFromWebhookToken(Request $request): ?User
    {
        $token = (string) $request->query('token', '');
        if ($token === '') {
            return null;
        }

        $user = User::query()->where('whatsapp_webhook_token', $token)->first();
        if (! $user) {
            return null;
        }

        // hash_equals contra timing; token já filtrado pelo where.
        if (! hash_equals((string) $user->whatsapp_webhook_token, $token)) {
            return null;
        }

        return $user;
    }

    /**
     * @return array<string, mixed>
     */
    private function publicState(User $user): array
    {
        return [
            'has_credentials' => $user->hasWhatsappCredentials(),
            'whatsapp_api_username' => $user->whatsapp_api_username,
            'session_id' => $user->whatsapp_session_id,
            'status' => $user->whatsapp_status ?? 'disconnected',
            'is_business' => (bool) $user->whatsapp_is_business,
            'phone' => $user->whatsapp_phone,
            'has_qr' => filled($user->whatsapp_qr),
            'default_lead_stage_id' => $user->whatsapp_default_lead_stage_id,
        ];
    }

    private function phoneFromJidOrTo(string $jid, string $to): ?string
    {
        $local = str_contains($jid, '@') ? explode('@', $jid, 2)[0] : $to;
        $server = str_contains($jid, '@') ? strtolower(explode('@', $jid, 2)[1]) : '';
        $digits = preg_replace('/\D+/', '', $local) ?: null;

        // LID não é telefone — tenta recuperar de mensagens anteriores.
        if ($server === 'lid') {
            if ($digits) {
                $known = WhatsappMessage::query()
                    ->where(function ($q) use ($jid, $digits) {
                        $q->where('whatsapp_lid', $jid)
                            ->orWhere('whatsapp_jid', $jid)
                            ->orWhere('whatsapp_lid', $digits.'@lid');
                    })
                    ->whereNotNull('phone_number')
                    ->where('phone_number', '!=', '')
                    ->where('phone_number', '!=', $digits)
                    ->orderByDesc('id')
                    ->value('phone_number');
                if (is_string($known) && $known !== '') {
                    return preg_replace('/\D+/', '', $known) ?: $known;
                }
            }

            return null;
        }

        return $digits;
    }

    private function preferPhoneJid(string $jid, ?string $phone): string
    {
        if ($phone && strlen($phone) >= 10 && (str_ends_with($jid, '@lid') || ! str_contains($jid, '@'))) {
            return $phone.'@c.us';
        }

        return $jid;
    }

    /**
     * @return array{0: string, 1: string|null}
     */
    private function normalizeStoredJids(string $requestedJid, string $resultTo, ?string $phone): array
    {
        $lid = null;
        $jid = $requestedJid;

        foreach ([$requestedJid, $resultTo] as $candidate) {
            if (str_ends_with($candidate, '@lid')) {
                $lid = $candidate;
            }
        }

        if ($phone && strlen($phone) >= 10) {
            $jid = $phone.'@c.us';
        } elseif (str_ends_with($resultTo, '@c.us') || str_ends_with($resultTo, '@s.whatsapp.net')) {
            $jid = $resultTo;
        } elseif (str_ends_with($requestedJid, '@c.us') || str_ends_with($requestedJid, '@s.whatsapp.net')) {
            $jid = $requestedJid;
        } elseif ($lid) {
            $jid = $lid;
        } else {
            $jid = $resultTo ?: $requestedJid;
        }

        return [$jid, $lid];
    }

    /**
     * JIDs/@lid relacionados ao mesmo chat (inbound @c.us + outbound @lid).
     *
     * @return list<string>
     */
    private function relatedJidsForChat(int $userId, string $jid): array
    {
        $related = [$jid];
        $phone = null;

        if (str_ends_with($jid, '@lid')) {
            $related[] = $jid;
            $rows = WhatsappMessage::query()
                ->where('user_id', $userId)
                ->where(function ($q) use ($jid) {
                    $q->where('whatsapp_lid', $jid)->orWhere('whatsapp_jid', $jid);
                })
                ->get(['whatsapp_jid', 'whatsapp_lid', 'phone_number']);
            foreach ($rows as $row) {
                if ($row->whatsapp_jid) {
                    $related[] = $row->whatsapp_jid;
                }
                if ($row->whatsapp_lid) {
                    $related[] = $row->whatsapp_lid;
                }
                if ($row->phone_number) {
                    $phone = preg_replace('/\D+/', '', (string) $row->phone_number) ?: $phone;
                }
            }
        } else {
            $rows = WhatsappMessage::query()
                ->where('user_id', $userId)
                ->where('whatsapp_jid', $jid)
                ->get(['whatsapp_lid', 'phone_number']);
            foreach ($rows as $row) {
                if ($row->whatsapp_lid) {
                    $related[] = $row->whatsapp_lid;
                }
                if ($row->phone_number) {
                    $phone = preg_replace('/\D+/', '', (string) $row->phone_number) ?: $phone;
                }
            }

            $lids = array_values(array_filter($related, static fn ($v) => str_ends_with((string) $v, '@lid')));
            if ($lids !== []) {
                $extra = WhatsappMessage::query()
                    ->where('user_id', $userId)
                    ->where(function ($q) use ($lids) {
                        $q->whereIn('whatsapp_jid', $lids)->orWhereIn('whatsapp_lid', $lids);
                    })
                    ->get(['whatsapp_jid', 'whatsapp_lid']);
                foreach ($extra as $row) {
                    if ($row->whatsapp_jid) {
                        $related[] = $row->whatsapp_jid;
                    }
                    if ($row->whatsapp_lid) {
                        $related[] = $row->whatsapp_lid;
                    }
                }
            }
        }

        if ($phone && strlen($phone) >= 10) {
            $related[] = $phone.'@c.us';
            $related[] = $phone.'@s.whatsapp.net';
            $byPhone = WhatsappMessage::query()
                ->where('user_id', $userId)
                ->where('phone_number', $phone)
                ->get(['whatsapp_jid', 'whatsapp_lid']);
            foreach ($byPhone as $row) {
                if ($row->whatsapp_jid) {
                    $related[] = $row->whatsapp_jid;
                }
                if ($row->whatsapp_lid) {
                    $related[] = $row->whatsapp_lid;
                }
            }
        }

        return array_values(array_unique(array_filter($related)));
    }
}
