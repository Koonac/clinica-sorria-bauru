<?php

namespace App\Models\Concerns;

use App\Support\ClinicContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @mixin Model
 */
trait BelongsToClinic
{
    public static function bootBelongsToClinic(): void
    {
        static::creating(function (Model $model): void {
            if (! $model->getAttribute('clinic_id')) {
                $clinicId = app(ClinicContext::class)->id();
                if ($clinicId) {
                    $model->setAttribute('clinic_id', $clinicId);
                }
            }
        });

        static::addGlobalScope('clinic', function (Builder $builder): void {
            $clinicId = app(ClinicContext::class)->id();
            if ($clinicId !== null) {
                $builder->where($builder->getModel()->getTable().'.clinic_id', $clinicId);
            }
        });
    }

    public function clinic(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Clinic::class);
    }
}
