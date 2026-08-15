<?php

namespace App\Http\Controllers\Api\Crm;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\SendWhatsappMessageRequest;
use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\PauseWhatsappAgentForLead;
use App\Services\Crm\SyncWhatsappLabels;
use App\Services\Crm\UpsertClinicConnection;
use App\Services\Crm\WhatsappApiClient;
use App\Services\Crm\WhatsappChatHistory;
use App\Services\Crm\WhatsappLeadResolver;
use App\Support\ClinicContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class WhatsappController extends Controller
{
    public function __construct(
        private WhatsappLeadResolver $leadResolver,
        private SyncWhatsappLabels $labelSync,
        private PauseWhatsappAgentForLead $pauseAgent,
        private ClinicContext $clinicContext,
        private UpsertClinicConnection $upsertConnection,
    ) {}

    public function send(SendWhatsappMessageRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $connection = $this->upsertConnection->handle([], $user->id);

        if ($connection->status !== 'connected' || ! filled($connection->session_id)) {
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
            $mediaStored = [
                'mimetype' => $mimetype,
                'filename' => $filename,
                'omitted' => true,
            ];
        }

        $jid = str_contains($to, '@') ? $to : preg_replace('/\D+/', '', $to).'@c.us';
        $phone = $this->phoneFromJidOrTo($jid, $to, $connection->id);

        $resolved = $this->leadResolver->resolve($connection, [
            'jid' => $this->preferPhoneJid($jid, $phone),
            'phone_number' => $phone,
            'contact_name' => $contactName,
        ], $user);

        try {
            $result = (new WhatsappApiClient($connection))->send(
                (string) $connection->session_id,
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
            'clinic_id' => $connection->clinic_id,
            'connection_id' => $connection->id,
            'user_id' => $user->id,
            'session_id' => $connection->session_id,
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
        $connection = $this->upsertConnection->handle([], $request->user()?->id);
        $search = trim((string) $request->query('search', ''));

        $bindings = [$connection->id];
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
                    WHERE connection_id = ?
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
                ->where('connection_id', $connection->id)
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

    public function messages(Request $request, WhatsappChatHistory $history): JsonResponse
    {
        $connection = $this->upsertConnection->handle([], $request->user()?->id);

        $leadId = $request->query('lead_id');
        $dealId = $request->query('deal_id');
        $jid = trim((string) $request->query('jid', ''));

        if (! $leadId && ! $dealId && $jid === '') {
            return response()->json([
                'message' => 'Informe lead_id, deal_id ou jid.',
            ], 422);
        }

        $relatedJids = $jid !== '' ? $history->relatedJids($connection->id, $jid) : [];

        $query = WhatsappMessage::query()
            ->where('connection_id', $connection->id)
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
        $connection = $this->connectionFromWebhookToken($request);
        if (! $connection) {
            return response()->json(['message' => 'Token inválido.'], 401);
        }

        $this->bindClinicFromConnection($connection);

        $event = (string) $request->input('event', '');
        $data = $request->input('data');

        match ($event) {
            'qr_code' => $this->handleQrCode($connection, is_array($data) ? $data : []),
            'authenticated' => $connection->forceFill([
                'qr' => null,
                'status' => 'connecting',
            ])->save(),
            'ready' => $this->handleReady($connection, is_array($data) ? $data : []),
            'disconnected' => $connection->forceFill([
                'status' => 'disconnected',
                'is_business' => false,
                'qr' => null,
            ])->save(),
            'error' => $connection->forceFill([
                'status' => 'error',
            ])->save(),
            default => null,
        };

        return response()->json(['success' => true]);
    }

    public function messagesWebhook(Request $request): JsonResponse
    {
        $connection = $this->connectionFromWebhookToken($request);
        if (! $connection) {
            return response()->json(['message' => 'Token inválido.'], 401);
        }

        $this->bindClinicFromConnection($connection);

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

        $jidServer = strtolower((string) (str_contains($jid, '@') ? explode('@', $jid, 2)[1] : ''));
        if (in_array($jidServer, ['g.us', 'broadcast', 'newsletter'], true)) {
            return response()->json(['success' => true, 'ignored' => $jidServer]);
        }
        if (! in_array($jidServer, ['c.us', 's.whatsapp.net', 'lid'], true)) {
            return response()->json(['success' => true, 'ignored' => 'non_direct']);
        }

        $sessionId = (string) ($request->input('session_id') ?: $connection->session_id);

        WhatsappInboundMessageReceived::dispatch($connection, $sessionId, $data);

        return response()->json(['success' => true]);
    }

    private function handleReady(Connection $connection, array $data): void
    {
        $isBusiness = (bool) ($data['isBusiness'] ?? false);

        $connection->forceFill([
            'status' => 'connected',
            'qr' => null,
            'phone' => $data['phone_number'] ?? $connection->phone,
            'is_business' => $isBusiness,
        ])->save();

        if ($isBusiness) {
            $this->labelSync->ensurePipelineLabels($connection->fresh());
        }
    }

    private function handleQrCode(Connection $connection, array $data): void
    {
        $qr = $data['qr'] ?? null;
        if (! is_string($qr) || $qr === '') {
            return;
        }

        $connection->forceFill([
            'qr' => $qr,
            'status' => 'connecting',
        ])->save();
    }

    private function connectionFromWebhookToken(Request $request): ?Connection
    {
        $token = (string) $request->query('token', '');
        if ($token === '') {
            return null;
        }

        $connection = Connection::withoutGlobalScopes()
            ->where('webhook_token', $token)
            ->first();

        if (! $connection) {
            return null;
        }

        if (! hash_equals((string) $connection->webhook_token, $token)) {
            return null;
        }

        return $connection;
    }

    private function bindClinicFromConnection(Connection $connection): void
    {
        $clinic = $connection->relationLoaded('clinic')
            ? $connection->clinic
            : Clinic::query()->find($connection->clinic_id);

        if ($clinic) {
            $this->clinicContext->set($clinic);
        }
    }

    private function phoneFromJidOrTo(string $jid, string $to, int $connectionId): ?string
    {
        $local = str_contains($jid, '@') ? explode('@', $jid, 2)[0] : $to;
        $server = str_contains($jid, '@') ? strtolower(explode('@', $jid, 2)[1]) : '';
        $digits = preg_replace('/\D+/', '', $local) ?: null;

        if ($server === 'lid') {
            if ($digits) {
                $known = WhatsappMessage::query()
                    ->where('connection_id', $connectionId)
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
}
