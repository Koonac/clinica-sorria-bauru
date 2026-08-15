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
    ];

    protected function casts(): array
    {
        return [
            'value' => 'decimal:2',
            'converted_at' => 'datetime',
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
}
