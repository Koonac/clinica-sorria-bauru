<?php

namespace App\Models\Crm;

use Illuminate\Database\Eloquent\Model;

class Source extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }
}
