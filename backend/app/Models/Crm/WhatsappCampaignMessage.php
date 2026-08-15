<?php

namespace App\Models\Crm;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappCampaignMessage extends Model
{
    protected $fillable = [
        'whatsapp_campaign_id',
        'position',
        'message_body',
        'delay_after_sec',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'delay_after_sec' => 'integer',
        ];
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(WhatsappCampaign::class, 'whatsapp_campaign_id');
    }
}
