<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Crm\PipelineStage;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const WHATSAPP_STATUSES = [
        'disconnected',
        'connecting',
        'connected',
        'error',
    ];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'whatsapp_api_username',
        'whatsapp_api_password',
        'whatsapp_session_id',
        'whatsapp_webhook_token',
        'whatsapp_status',
        'whatsapp_is_business',
        'whatsapp_phone',
        'whatsapp_qr',
        'whatsapp_default_lead_stage_id',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'whatsapp_api_password',
        'whatsapp_webhook_token',
        'whatsapp_qr',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'whatsapp_api_password' => 'encrypted',
            'whatsapp_is_business' => 'boolean',
        ];
    }

    public function hasWhatsappCredentials(): bool
    {
        return filled($this->whatsapp_api_username) && filled($this->whatsapp_api_password);
    }

    public function whatsappDefaultLeadStage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'whatsapp_default_lead_stage_id');
    }
}
