<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappMessage extends Model
{
    use BelongsToClinic;

    public const DIRECTIONS = ['inbound', 'outbound'];

    protected $fillable = [
        'clinic_id',
        'connection_id',
        'user_id',
        'session_id',
        'whatsapp_jid',
        'whatsapp_lid',
        'phone_number',
        'contact_name',
        'direction',
        'body',
        'message_id',
        'type',
        'has_media',
        'media',
        'lead_id',
        'deal_id',
        'contact_id',
        'whatsapp_campaign_id',
        'whatsapp_campaign_recipient_id',
        'raw',
        'wa_timestamp',
    ];

    protected function casts(): array
    {
        return [
            'has_media' => 'boolean',
            'media' => 'array',
            'raw' => 'array',
            'wa_timestamp' => 'datetime',
        ];
    }

    public function connection(): BelongsTo
    {
        return $this->belongsTo(Connection::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(WhatsappCampaign::class, 'whatsapp_campaign_id');
    }

    public function campaignRecipient(): BelongsTo
    {
        return $this->belongsTo(WhatsappCampaignRecipient::class, 'whatsapp_campaign_recipient_id');
    }
}
