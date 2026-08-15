<?php

namespace App\Models\Crm;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Task extends Model
{
    protected $fillable = [
        'title',
        'description',
        'due_at',
        'done_at',
        'lead_id',
        'deal_id',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'done_at' => 'datetime',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('done_at');
    }

    public function scopeOrderedByDue(Builder $query): Builder
    {
        return $query->orderBy('due_at')->orderBy('id');
    }

    public function isDone(): bool
    {
        return $this->done_at !== null;
    }
}
