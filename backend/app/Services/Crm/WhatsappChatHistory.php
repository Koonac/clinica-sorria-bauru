<?php

namespace App\Services\Crm;

use App\Models\Crm\WhatsappMessage;
use Illuminate\Support\Collection;

class WhatsappChatHistory
{
    /**
     * JIDs/@lid relacionados ao mesmo chat (inbound @c.us + outbound @lid).
     *
     * @return list<string>
     */
    public function relatedJids(int $connectionId, string $jid): array
    {
        $related = [$jid];
        $phone = null;

        if (str_ends_with($jid, '@lid')) {
            $related[] = $jid;
            $rows = WhatsappMessage::query()
                ->where('connection_id', $connectionId)
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
                ->where('connection_id', $connectionId)
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
                    ->where('connection_id', $connectionId)
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
                ->where('connection_id', $connectionId)
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

    /**
     * Mensagens do chat em ordem cronológica (mais antigas primeiro).
     *
     * @return Collection<int, WhatsappMessage>
     */
    public function messages(
        int $connectionId,
        ?int $leadId,
        ?string $jid,
        int $limit = 40,
    ): Collection {
        $relatedJids = ($jid !== null && $jid !== '') ? $this->relatedJids($connectionId, $jid) : [];

        $query = WhatsappMessage::query()
            ->where('connection_id', $connectionId)
            ->where(function ($q) use ($leadId, $jid, $relatedJids) {
                if ($leadId) {
                    $q->orWhere('lead_id', $leadId);
                }
                if ($jid !== null && $jid !== '') {
                    $q->orWhere(function ($inner) use ($relatedJids) {
                        $inner->whereIn('whatsapp_jid', $relatedJids)
                            ->orWhereIn('whatsapp_lid', $relatedJids);
                    });
                }
            })
            ->latest('wa_timestamp')
            ->latest('id');

        return $query->limit($limit)->get()->sortBy(function (WhatsappMessage $m) {
            return [$m->wa_timestamp?->timestamp ?? 0, $m->id];
        })->values();
    }

    public function latestInbound(int $connectionId, ?int $leadId, ?string $jid): ?WhatsappMessage
    {
        $relatedJids = ($jid !== null && $jid !== '') ? $this->relatedJids($connectionId, $jid) : [];

        return WhatsappMessage::query()
            ->where('connection_id', $connectionId)
            ->where('direction', 'inbound')
            ->where(function ($q) use ($leadId, $jid, $relatedJids) {
                if ($leadId) {
                    $q->orWhere('lead_id', $leadId);
                }
                if ($jid !== null && $jid !== '') {
                    $q->orWhere(function ($inner) use ($relatedJids) {
                        $inner->whereIn('whatsapp_jid', $relatedJids)
                            ->orWhereIn('whatsapp_lid', $relatedJids);
                    });
                }
            })
            ->latest('wa_timestamp')
            ->latest('id')
            ->first();
    }
}
