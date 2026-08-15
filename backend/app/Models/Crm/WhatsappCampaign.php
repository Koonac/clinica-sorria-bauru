<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsappCampaign extends Model
{
    use BelongsToClinic;

    public const STATUSES = [
        'draft',
        'queued',
        'running',
        'paused',
        'completed',
        'cancelled',
        'failed',
    ];

    public const EDITABLE_STATUSES = [
        'draft',
        'paused',
        'cancelled',
        'failed',
        'completed',
    ];

    protected $fillable = [
        'clinic_id',
        'user_id',
        'name',
        'status',
        'delay_between_contacts_sec',
        'delay_jitter_sec',
        'total_recipients',
        'sent_count',
        'failed_count',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'delay_between_contacts_sec' => 'integer',
            'delay_jitter_sec' => 'integer',
            'total_recipients' => 'integer',
            'sent_count' => 'integer',
            'failed_count' => 'integer',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(WhatsappCampaignMessage::class)->orderBy('position');
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(WhatsappCampaignRecipient::class)->orderBy('id');
    }

    public function isEditable(): bool
    {
        return in_array($this->status, self::EDITABLE_STATUSES, true);
    }
}
