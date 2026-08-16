<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LlmTokenUsage extends Model
{
    public $timestamps = false;

    public const PURPOSE_AGENT_CHAT = 'agent_chat';

    public const PURPOSE_ATTENDANCE_SUMMARY = 'attendance_summary';

    public const PURPOSE_CAMPAIGN = 'campaign';

    public const PURPOSE_MEDIA_TRANSCRIPTION = 'media_transcription';

    public const PURPOSE_MEDIA_VISION = 'media_vision';

    public const PURPOSE_OTHER = 'other';

    protected $fillable = [
        'clinic_id',
        'provider',
        'purpose',
        'model',
        'prompt_tokens',
        'completion_tokens',
        'total_tokens',
        'cost',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'clinic_id' => 'integer',
            'prompt_tokens' => 'integer',
            'completion_tokens' => 'integer',
            'total_tokens' => 'integer',
            'cost' => 'float',
            'created_at' => 'datetime',
        ];
    }

    public function clinic(): BelongsTo
    {
        return $this->belongsTo(Clinic::class);
    }
}
