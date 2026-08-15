<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Connection extends Model
{
    use BelongsToClinic;

    public const STATUSES = [
        'disconnected',
        'connecting',
        'connected',
        'error',
    ];

    protected $fillable = [
        'clinic_id',
        'name',
        'api_username',
        'api_password',
        'session_id',
        'webhook_token',
        'status',
        'phone',
        'qr',
        'is_business',
        'default_lead_stage_id',
        'whatsapp_agent_auto_resume_hours',
        'created_by',
    ];

    protected $hidden = [
        'api_password',
        'webhook_token',
        'qr',
    ];

    protected function casts(): array
    {
        return [
            'api_password' => 'encrypted',
            'is_business' => 'boolean',
        ];
    }

    public function hasCredentials(): bool
    {
        return filled($this->api_username) && filled($this->api_password);
    }

    public function defaultLeadStage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'default_lead_stage_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'clinic_id' => $this->clinic_id,
            'name' => $this->name,
            'status' => $this->status,
            'phone' => $this->phone,
            'is_business' => (bool) $this->is_business,
            'has_credentials' => $this->hasCredentials(),
            'session_id' => $this->session_id,
            'default_lead_stage_id' => $this->default_lead_stage_id,
            'whatsapp_agent_auto_resume_hours' => (int) ($this->whatsapp_agent_auto_resume_hours ?? 24),
            'api_username' => $this->api_username,
        ];
    }
}
