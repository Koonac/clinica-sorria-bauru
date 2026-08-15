<?php

namespace App\Http\Controllers\Api\Crm;

use App\Events\Crm\WhatsappInboundMessageReceived;
use App\Http\Controllers\Controller;
use App\Http\Requests\Crm\MarkWhatsappChatReadRequest;
use App\Http\Requests\Crm\SendWhatsappMessageRequest;
use App\Jobs\Crm\FetchWhatsappAvatarJob;
use App\Models\Clinic;
use App\Models\Crm\Connection;
use App\Models\Crm\Contact;
use App\Models\Crm\Lead;
use App\Models\Crm\WhatsappConversationRead;
use App\Models\Crm\WhatsappMessage;
use App\Models\User;
use App\Services\Crm\EnsureWhatsappAvatar;
use App\Services\Crm\MarkWhatsappChatRead;
use App\Services\Crm\PauseWhatsappAgentForLead;
use App\Services\Crm\ScheduleWhatsappAttendanceAutoClose;
use App\Services\Crm\SyncWhatsappLabels;
use App\Services\Crm\UpsertClinicConnection;
use App\Services\Crm\WhatsappApiClient;
use App\Services\Crm\WhatsappChatHistory;
use App\Services\Crm\WhatsappConversationKey;
use App\Services\Crm\WhatsappLeadResolver;
use App\Support\ClinicContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class WhatsappController extends Controller
{
    public function __construct(
        private WhatsappLeadResolver $leadResolver,
        private SyncWhatsappLabels $labelSync,
        private PauseWhatsappAgentForLead $pauseAgent,
        private ClinicContext $clinicContext,
        private UpsertClinicConnection $upsertConnection,
        private WhatsappConversationKey $conversationKey,
        private MarkWhatsappChatRead $markChatRead,
        private EnsureWhatsappAvatar $ensureAvatar,
        private ScheduleWhatsappAttendanceAutoClose $autoClose,
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
        if ($message !== '' && filled($user->name)) {
            $message = '*_'.trim((string) $user->name)."_*\n\n".$message;
        }
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
                $connection,
                mb_substr($message !== '' ? $message : '[imagem]', 0, 500),
            );
            $this->autoClose->handle($resolved['lead']->fresh() ?? $resolved['lead'], $connection);
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
        $connection = $this->upsertConnection->handle([], $user->id);
        $search = trim((string) $request->query('search', ''));
        $filter = strtolower(trim((string) $request->query('filter', 'all')));
        if (! in_array($filter, ['all', 'mine', 'unassigned', 'unread', 'human', 'agent'], true)) {
            $filter = 'all';
        }

        $keyExpr = $this->conversationKey->sqlExpression();
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
                        {$keyExpr} AS conversation_key
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
        $conversationKeys = [];
        $leadIds = [];
        $contactIds = [];
        $chatJids = [];
        foreach ($rows as $row) {
            $conversationKeys[] = (string) $row->conversation_key;
            if ($row->lead_id) {
                $leadIds[] = (int) $row->lead_id;
            }
            if ($row->contact_id) {
                $contactIds[] = (int) $row->contact_id;
            }
            if (is_string($row->whatsapp_jid) && $row->whatsapp_jid !== '') {
                $chatJids[] = $row->whatsapp_jid;
            }
            if (is_string($row->whatsapp_jid) && str_ends_with($row->whatsapp_jid, '@lid')) {
                $lidKeys[] = $row->whatsapp_jid;
            } elseif (is_string($row->whatsapp_lid) && $row->whatsapp_lid !== '') {
                $lidKeys[] = $row->whatsapp_lid;
            }
        }
        $lidKeys = array_values(array_unique($lidKeys));
        $conversationKeys = array_values(array_unique(array_filter($conversationKeys)));
        $leadIds = array_values(array_unique($leadIds));
        $contactIds = array_values(array_unique($contactIds));
        $chatJids = array_values(array_unique($chatJids));

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

        $leadsById = [];
        if ($leadIds !== []) {
            $leadsById = Lead::query()
                ->with('owner:id,name')
                ->whereIn('id', $leadIds)
                ->get(['id', 'owner_id', 'whatsapp_agent_paused_at', 'whatsapp_agent_resume_at', 'whatsapp_conversation_closed_at', 'name', 'contact_id', 'whatsapp_jid'])
                ->keyBy('id');
            foreach ($leadsById as $lead) {
                if ($lead->contact_id) {
                    $contactIds[] = (int) $lead->contact_id;
                }
            }
            $contactIds = array_values(array_unique($contactIds));
        }

        $contactsById = collect();
        $contactsByJid = collect();
        if ($contactIds !== [] || $chatJids !== []) {
            $contacts = Contact::query()
                ->where(function ($q) use ($contactIds, $chatJids) {
                    if ($contactIds !== []) {
                        $q->orWhereIn('id', $contactIds);
                    }
                    if ($chatJids !== []) {
                        $q->orWhereIn('whatsapp_jid', $chatJids);
                    }
                })
                ->get([
                    'id',
                    'whatsapp_jid',
                    'avatar_path',
                    'avatar_status',
                    'avatar_fetched_at',
                    'name',
                ]);
            $contactsById = $contacts->keyBy('id');
            $contactsByJid = $contacts->filter(fn (Contact $c) => filled($c->whatsapp_jid))
                ->keyBy('whatsapp_jid');
        }

        $readsByKey = [];
        if ($conversationKeys !== []) {
            $readsByKey = WhatsappConversationRead::query()
                ->where('connection_id', $connection->id)
                ->where('user_id', $user->id)
                ->whereIn('conversation_key', $conversationKeys)
                ->get()
                ->keyBy('conversation_key');
        }

        $unreadByKey = $this->unreadCountsByConversationKey(
            $connection->id,
            $user->id,
            $conversationKeys,
            $keyExpr,
        );

        $data = [];
        foreach ($rows as $row) {
            $hasMedia = $row->has_media;
            if (is_string($hasMedia)) {
                $hasMedia = in_array(strtolower($hasMedia), ['1', 't', 'true', 'yes'], true);
            } else {
                $hasMedia = (bool) $hasMedia;
            }

            $jid = (string) $row->whatsapp_jid;
            $lid = filled($row->whatsapp_lid ?? null) ? (string) $row->whatsapp_lid : null;
            $phone = $row->phone_number;
            $key = (string) $row->conversation_key;

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

            $leadId = $row->lead_id ? (int) $row->lead_id : null;
            /** @var Lead|null $lead */
            $lead = $leadId ? ($leadsById[$leadId] ?? null) : null;
            $unread = (int) ($unreadByKey[$key] ?? 0);
            // Sem registro de leitura: conta como não lida se última msg for inbound
            if (! isset($readsByKey[$key]) && in_array($row->direction, ['in', 'inbound'], true)) {
                $unread = max($unread, 1);
            }

            $contactId = $row->contact_id ? (int) $row->contact_id : ($lead?->contact_id ? (int) $lead->contact_id : null);
            /** @var Contact|null $contact */
            $contact = $contactId
                ? ($contactsById[$contactId] ?? null)
                : ($contactsByJid[$jid] ?? null);
            if ($contact && ! $contactId) {
                $contactId = (int) $contact->id;
            }

            $avatarUrl = null;
            if ($contact && $this->ensureAvatar->hasServableAvatar($contact)) {
                $avatarUrl = '/v1/crm/whatsapp/avatars/'.$contact->id;
            }

            $item = [
                'whatsapp_jid' => $jid,
                'whatsapp_lid' => $lid,
                'phone_number' => $phone,
                'contact_name' => $row->contact_name ?: ($lead?->name) ?: ($contact?->name),
                'conversation_key' => $key,
                'lead_id' => $leadId,
                'deal_id' => $row->deal_id ? (int) $row->deal_id : null,
                'contact_id' => $contactId,
                'avatar_url' => $avatarUrl,
                'owner_id' => $lead?->owner_id,
                'owner_name' => $lead?->owner?->name,
                'whatsapp_agent_paused_at' => $lead?->whatsapp_agent_paused_at?->toIso8601String(),
                'whatsapp_agent_resume_at' => $lead?->whatsapp_agent_resume_at?->toIso8601String(),
                'whatsapp_conversation_closed_at' => $lead?->whatsapp_conversation_closed_at?->toIso8601String(),
                'unread_count' => $unread,
                'last_message' => [
                    'id' => (int) $row->id,
                    'body' => $row->body,
                    'direction' => $row->direction,
                    'has_media' => $hasMedia,
                    'wa_timestamp' => $row->wa_timestamp,
                    'created_at' => $row->created_at,
                ],
            ];

            if (! $this->chatMatchesFilter($item, $filter, $user->id)) {
                continue;
            }

            $data[] = $item;
        }

        $limit = (int) $request->query('limit', 20);
        $offset = (int) $request->query('offset', 0);
        $limit = max(1, min($limit, 50));
        $offset = max(0, $offset);

        $page = array_values(array_slice($data, $offset, $limit));
        $hasMore = ($offset + count($page)) < count($data);

        $this->dispatchAvatarFetches($connection, $page, $contactsById, $contactsByJid);

        return response()->json([
            'data' => $page,
            'meta' => [
                'offset' => $offset,
                'limit' => $limit,
                'has_more' => $hasMore,
            ],
        ]);
    }

    public function markChatRead(MarkWhatsappChatReadRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $connection = $this->upsertConnection->handle([], $user->id);
        $jid = trim((string) $request->validated('jid'));
        $leadId = $request->validated('lead_id');

        $result = $this->markChatRead->handle(
            $connection,
            $user,
            $jid,
            $leadId !== null ? (int) $leadId : null,
        );

        $contact = $this->resolveContactForChat($jid, $leadId !== null ? (int) $leadId : null);
        if ($contact && $this->ensureAvatar->needsFetch($contact)) {
            FetchWhatsappAvatarJob::dispatch($connection->id, $contact->id);
        }

        return response()->json(['data' => $result]);
    }

    public function avatar(Request $request, Contact $contact): BinaryFileResponse|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $connection = $this->upsertConnection->handle([], $user->id);

        if ($this->ensureAvatar->needsFetch($contact)) {
            $this->ensureAvatar->handle($connection, $contact);
            $contact->refresh();
        }

        if (! $this->ensureAvatar->hasServableAvatar($contact)) {
            return response()->json(['message' => 'Avatar indisponível.'], 404);
        }

        $path = (string) $contact->avatar_path;
        $absolute = Storage::disk('local')->path($path);
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        return response()->file($absolute, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=86400',
        ]);
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
     * @param  list<string>  $conversationKeys
     * @return array<string, int>
     */
    private function unreadCountsByConversationKey(
        int $connectionId,
        int $userId,
        array $conversationKeys,
        string $keyExpr,
    ): array {
        if ($conversationKeys === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($conversationKeys), '?'));

        $rows = DB::select(
            "SELECT keyed.conversation_key, COUNT(*)::int AS unread_count
             FROM (
                SELECT id, direction, {$keyExpr} AS conversation_key
                FROM whatsapp_messages
                WHERE connection_id = ?
                  AND direction IN ('inbound', 'in')
                  AND whatsapp_jid IS NOT NULL
                  AND whatsapp_jid <> ''
             ) keyed
             LEFT JOIN whatsapp_conversation_reads r
               ON r.connection_id = ?
              AND r.user_id = ?
              AND r.conversation_key = keyed.conversation_key
             WHERE keyed.conversation_key IN ({$placeholders})
               AND keyed.id > COALESCE(r.last_read_message_id, 0)
             GROUP BY keyed.conversation_key",
            array_merge([$connectionId, $connectionId, $userId], $conversationKeys),
        );

        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row->conversation_key] = (int) $row->unread_count;
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $item
     */
    private function chatMatchesFilter(array $item, string $filter, int $userId): bool
    {
        return match ($filter) {
            'mine' => ($item['owner_id'] ?? null) === $userId,
            // "Finalizados": conversa encerrada (manual, IA ou auto-close).
            'unassigned' => ($item['lead_id'] ?? null) !== null && filled($item['whatsapp_conversation_closed_at'] ?? null),
            'unread' => ((int) ($item['unread_count'] ?? 0)) > 0,
            'human' => filled($item['whatsapp_agent_paused_at'] ?? null)
                && ! filled($item['whatsapp_conversation_closed_at'] ?? null),
            'agent' => ($item['lead_id'] ?? null) !== null
                && ! filled($item['whatsapp_agent_paused_at'] ?? null)
                && ! filled($item['whatsapp_conversation_closed_at'] ?? null),
            default => true,
        };
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
     * @param  list<array<string, mixed>>  $chats
     * @param  \Illuminate\Support\Collection<int|string, Contact>  $contactsById
     * @param  \Illuminate\Support\Collection<string, Contact>  $contactsByJid
     */
    private function dispatchAvatarFetches(
        Connection $connection,
        array $chats,
        $contactsById,
        $contactsByJid,
    ): void {
        $dispatched = 0;
        $seen = [];

        foreach ($chats as $chat) {
            if ($dispatched >= 5) {
                break;
            }

            $contactId = isset($chat['contact_id']) ? (int) $chat['contact_id'] : 0;
            $jid = is_string($chat['whatsapp_jid'] ?? null) ? (string) $chat['whatsapp_jid'] : '';

            /** @var Contact|null $contact */
            $contact = $contactId > 0
                ? ($contactsById[$contactId] ?? null)
                : ($jid !== '' ? ($contactsByJid[$jid] ?? null) : null);

            if (! $contact || isset($seen[$contact->id])) {
                continue;
            }
            $seen[$contact->id] = true;

            if (! $this->ensureAvatar->needsFetch($contact)) {
                continue;
            }

            FetchWhatsappAvatarJob::dispatch($connection->id, $contact->id);
            $dispatched++;
        }
    }

    private function resolveContactForChat(string $jid, ?int $leadId): ?Contact
    {
        if ($leadId) {
            $lead = Lead::query()->find($leadId);
            if ($lead?->contact_id) {
                $contact = Contact::query()->find($lead->contact_id);
                if ($contact) {
                    return $contact;
                }
            }
        }

        $jid = trim($jid);
        if ($jid === '') {
            return null;
        }

        return Contact::query()->where('whatsapp_jid', $jid)->first();
    }
}
