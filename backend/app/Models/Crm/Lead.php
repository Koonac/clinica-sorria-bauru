<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Lead extends Model
{
    use BelongsToClinic;

    public const STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];

    public const ATTENDANCE_NEW = 'novo';

    public const ATTENDANCE_IN_PROGRESS = 'em_atendimento';

    public const ATTENDANCE_HUMAN = 'humano';

    public const ATTENDANCE_PRE_BOOKED = 'pre_agendado';

    public const ATTENDANCE_SCHEDULED = 'agendado';

    public const ATTENDANCE_NO_REPLY = 'sem_resposta';

    /** Status de atendimento (automático), independente da etapa do pipeline. */
    public const ATTENDANCE_STATUSES = [
        self::ATTENDANCE_NEW,
        self::ATTENDANCE_IN_PROGRESS,
        self::ATTENDANCE_HUMAN,
        self::ATTENDANCE_PRE_BOOKED,
        self::ATTENDANCE_SCHEDULED,
        self::ATTENDANCE_NO_REPLY,
    ];

    protected $fillable = [
        'clinic_id',
        'title',
        'status',
        'stage_id',
        'name',
        'email',
        'mobile',
        'whatsapp_jid',
        'instagram',
        'organization_name',
        'contact_id',
        'organization_id',
        'owner_id',
        'source_id',
        'value',
        'currency',
        'external_id',
        'lost_reason',
        'whatsapp_agent_paused_at',
        'whatsapp_agent_resume_at',
        'whatsapp_conversation_closed_at',
        'whatsapp_conversation_closed_by',
        'whatsapp_auto_close_at',
        'converted_deal_id',
        'converted_at',
        'attendance_status',
        'whatsapp_follow_up_step',
        'whatsapp_follow_up_due_at',
    ];

    protected $attributes = [
        'attendance_status' => self::ATTENDANCE_NEW,
        'whatsapp_follow_up_step' => 0,
    ];

    protected function casts(): array
    {
        return [
            'value' => 'decimal:2',
            'converted_at' => 'datetime',
            'whatsapp_follow_up_step' => 'integer',
            'whatsapp_follow_up_due_at' => 'datetime',
            'whatsapp_agent_paused_at' => 'datetime',
            'whatsapp_agent_resume_at' => 'datetime',
            'whatsapp_conversation_closed_at' => 'datetime',
            'whatsapp_auto_close_at' => 'datetime',
        ];
    }

    public function isWhatsappAgentPaused(): bool
    {
        return $this->whatsapp_agent_paused_at !== null;
    }

    public function isWhatsappConversationClosed(): bool
    {
        return $this->whatsapp_conversation_closed_at !== null;
    }

    public function whatsappConversationClosedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'whatsapp_conversation_closed_by');
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function source(): BelongsTo
    {
        return $this->belongsTo(Source::class);
    }

    public function convertedDeal(): BelongsTo
    {
        return $this->belongsTo(Deal::class, 'converted_deal_id');
    }

    public function stage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'stage_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public function attendanceSegments(): HasMany
    {
        return $this->hasMany(WhatsappAttendanceSegment::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function nextPendingTask(): HasOne
    {
        return $this->hasOne(Task::class)->ofMany(
            ['due_at' => 'min', 'id' => 'min'],
            fn ($query) => $query->whereNull('done_at'),
        );
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    /**
     * Consultas em aberto do lead (pré-agendamento pendente ou futura), mais próxima primeiro.
     */
    public function upcomingAppointments(): HasMany
    {
        return $this->hasMany(Appointment::class)
            ->upcoming()
            ->orderByRaw('starts_at IS NULL')
            ->orderBy('starts_at')
            ->orderBy('id');
    }
}
