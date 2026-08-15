<?php

namespace App\Models\Crm;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsappCampaignRecipient extends Model
{
    public const STATUSES = [
        'pending',
        'sending',
        'sent',
        'failed',
        'skipped',
    ];

    protected $fillable = [
        'whatsapp_campaign_id',
        'full_name',
        'phone',
        'notes',
        'status',
        'use_custom_message',
        'custom_message',
        'error_message',
        'last_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'use_custom_message' => 'boolean',
            'last_sent_at' => 'datetime',
        ];
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(WhatsappCampaign::class, 'whatsapp_campaign_id');
    }

    public function whatsappMessages(): HasMany
    {
        return $this->hasMany(WhatsappMessage::class, 'whatsapp_campaign_recipient_id');
    }
}
