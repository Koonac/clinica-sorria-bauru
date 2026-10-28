<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Aviso para a recepção (sino do painel + WhatsApp opcional).
 * Leitura é por usuário (crm_notification_reads).
 */
class CrmNotification extends Model
{
    use BelongsToClinic;

    public const TYPE_PRE_BOOKING = 'pre_agendamento';

    public const TYPE_URGENCY = 'urgencia';

    public const TYPE_COMPLAINT = 'reclamacao';

    public const TYPE_HUMAN_REQUEST = 'pedido_humano';

    public const TYPE_HANDOFF = 'handoff';

    public const TYPE_APPOINTMENT_CANCELLED = 'consulta_cancelada';

    public const TYPE_APPOINTMENT_CONFIRMED = 'consulta_confirmada';

    public const TYPES = [
        self::TYPE_PRE_BOOKING,
        self::TYPE_URGENCY,
        self::TYPE_COMPLAINT,
        self::TYPE_HUMAN_REQUEST,
        self::TYPE_HANDOFF,
        self::TYPE_APPOINTMENT_CANCELLED,
        self::TYPE_APPOINTMENT_CONFIRMED,
    ];

    public const PRIORITY_NORMAL = 'normal';

    public const PRIORITY_URGENT = 'urgent';

    protected $fillable = [
        'clinic_id',
        'type',
        'priority',
        'title',
        'body',
        'lead_id',
        'appointment_id',
        'data',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function readers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'crm_notification_reads')
            ->withPivot('read_at');
    }
}
