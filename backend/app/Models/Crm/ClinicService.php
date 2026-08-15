<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Model;

class ClinicService extends Model
{
    use BelongsToClinic;

    protected $fillable = [
        'clinic_id',
        'code',
        'name',
        'duration_minutes',
        'price_particular_min',
        'price_particular_max',
        'accepts_insurance',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'duration_minutes' => 'integer',
            'price_particular_min' => 'decimal:2',
            'price_particular_max' => 'decimal:2',
            'accepts_insurance' => 'boolean',
        ];
    }
}
