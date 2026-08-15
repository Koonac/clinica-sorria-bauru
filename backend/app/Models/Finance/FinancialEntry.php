<?php

namespace App\Models\Finance;

use App\Models\Crm\Contact;
use App\Models\Crm\Deal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialEntry extends Model
{
    /** payable = conta a pagar; receivable = conta a receber. */
    public const DIRECTIONS = ['payable', 'receivable'];

    public const STATUSES = ['pending', 'paid', 'canceled'];

    protected $fillable = [
        'direction',
        'description',
        'amount',
        'due_date',
        'status',
        'paid_at',
        'paid_amount',
        'payment_method',
        'document',
        'party_name',
        'notes',
        'account_id',
        'contact_id',
        'deal_id',
        'installment_group',
        'installment_number',
        'installment_total',
    ];

    /** `overdue` é derivado, não persistido — o front lê o campo pronto. */
    protected $appends = ['overdue'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'due_date' => 'date:Y-m-d',
            'paid_at' => 'datetime',
            'installment_number' => 'integer',
            'installment_total' => 'integer',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinancialAccount::class, 'account_id');
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function getOverdueAttribute(): bool
    {
        return $this->status === 'pending'
            && $this->due_date !== null
            && $this->due_date->isBefore(now(config('app.timezone'))->startOfDay());
    }

    public function scopeOfDirection(Builder $query, string $direction): Builder
    {
        return $query->where('direction', $direction);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', 'pending');
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query->where('status', 'pending')
            ->whereDate('due_date', '<', now(config('app.timezone'))->toDateString());
    }

    public function scopeDueBetween(Builder $query, string $inicio, string $fim): Builder
    {
        return $query->whereBetween('due_date', [$inicio, $fim]);
    }
}
