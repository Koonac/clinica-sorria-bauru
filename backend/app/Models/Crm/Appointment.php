<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Appointment extends Model
{
    use BelongsToClinic;

    public const STATUS_PRE_BOOKED = 'pre_agendado';

    public const STATUS_SCHEDULED = 'agendado';

    public const STATUS_CONFIRMED = 'confirmado';

    public const STATUS_CANCELLED = 'cancelado';

    public const STATUS_DONE = 'realizado';

    public const STATUS_NO_SHOW = 'faltou';

    public const STATUSES = [
        self::STATUS_PRE_BOOKED,
        self::STATUS_SCHEDULED,
        self::STATUS_CONFIRMED,
        self::STATUS_CANCELLED,
        self::STATUS_DONE,
        self::STATUS_NO_SHOW,
    ];

    /** Consultas que ainda vão acontecer (ou aguardam a recepção). */
    public const ACTIVE_STATUSES = [
        self::STATUS_PRE_BOOKED,
        self::STATUS_SCHEDULED,
        self::STATUS_CONFIRMED,
    ];

    public const SOURCE_AI = 'ai';

    public const SOURCE_MANUAL = 'manual';

    protected $fillable = [
        'clinic_id',
        'lead_id',
        'contact_id',
        'clinic_service_id',
        'status',
        'source',
        'title',
        'preferred_text',
        'preferred_start_at',
        'starts_at',
        'ends_at',
        'notes',
        'task_id',
        'google_event_id',
        'google_html_link',
        'reminder_sent_at',
        'confirmed_at',
        'cancelled_at',
        'cancel_reason',
        'created_by',
        'confirmed_by',
    ];

    protected function casts(): array
    {
        return [
            'preferred_start_at' => 'datetime',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'reminder_sent_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(ClinicService::class, 'clinic_service_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', self::ACTIVE_STATUSES);
    }

    /** Pré-agendamentos pendentes + consultas futuras ainda não realizadas. */
    public function scopeUpcoming(Builder $query): Builder
    {
        return $query->where(function (Builder $q) {
            $q->where('status', self::STATUS_PRE_BOOKED)
                ->orWhere(function (Builder $inner) {
                    $inner->whereIn('status', [self::STATUS_SCHEDULED, self::STATUS_CONFIRMED])
                        ->where('starts_at', '>=', now()->subHours(2));
                });
        });
    }
}
