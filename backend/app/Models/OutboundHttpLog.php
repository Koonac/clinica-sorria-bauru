<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutboundHttpLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'clinic_id',
        'provider',
        'method',
        'url',
        'request_headers',
        'request_body',
        'response_status',
        'response_body',
        'duration_ms',
        'error',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'request_headers' => 'array',
            'response_status' => 'integer',
            'duration_ms' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function clinic(): BelongsTo
    {
        return $this->belongsTo(Clinic::class);
    }
}
