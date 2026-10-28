<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappAttendanceSegment extends Model
{
    use BelongsToClinic;

    public const MODE_AI = 'ai';

    public const MODE_HUMAN = 'human';

    public const MODES = [self::MODE_AI, self::MODE_HUMAN];

    /**
     * Teto de uma execução do agent (5 rodadas × ~90s + envios). Marca de início mais velha que
     * isso é de job que morreu no meio (deploy/restart) e não pode contar tempo para sempre.
     */
    public const MAX_ACTIVE_RUN_SECONDS = 600;

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

    /**
     * Segundos da execução em andamento (desde active_started_at), limitados ao teto de um job.
     */
    public function activeRunSeconds(CarbonInterface $now): int
    {
        if ($this->active_started_at === null) {
            return 0;
        }

        $elapsed = max(0, (int) $this->active_started_at->diffInSeconds($now, false));

        return min($elapsed, self::MAX_ACTIVE_RUN_SECONDS);
    }

    public function hasStaleActiveRun(CarbonInterface $now): bool
    {
        return $this->active_started_at !== null
            && $this->active_started_at->diffInSeconds($now, false) > self::MAX_ACTIVE_RUN_SECONDS;
    }
}
