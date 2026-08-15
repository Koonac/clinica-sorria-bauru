<?php

namespace App\Models;

use App\Models\Crm\Connection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Clinic extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'is_active',
        'google_calendar_refresh_token',
        'google_calendar_id',
        'google_calendar_timezone',
        'google_calendar_business_start',
        'google_calendar_business_end',
        'google_calendar_slot_minutes',
    ];

    protected $hidden = [
        'google_calendar_refresh_token',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'google_calendar_refresh_token' => 'encrypted',
            'google_calendar_business_start' => 'integer',
            'google_calendar_business_end' => 'integer',
            'google_calendar_slot_minutes' => 'integer',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function connection(): HasOne
    {
        return $this->hasOne(Connection::class);
    }

    /**
     * @return array{id: int, name: string, slug: string, is_active: bool}
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'is_active' => (bool) $this->is_active,
        ];
    }
}
