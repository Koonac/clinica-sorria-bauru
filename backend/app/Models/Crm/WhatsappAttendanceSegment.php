<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappAttendanceSegment extends Model
{
    use BelongsToClinic;

    public const MODE_AI = 'ai';

    public const MODE_HUMAN = 'human';

    public const MODES = [self::MODE_AI, self::MODE_HUMAN];

    protected $fillable = [
        'clinic_id',
        'lead_id',
        'mode',
        'user_id',
        'started_at',
        'ended_at',
        'duration_seconds',
        'active_seconds',
        'active_started_at',
        'source',
        'ai_summary',
        'ai_summary_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'active_started_at' => 'datetime',
            'ai_summary_at' => 'datetime',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isOpen(): bool
    {
        return $this->ended_at === null;
    }
}
