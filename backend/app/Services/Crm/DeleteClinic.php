<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Support\ClinicContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DeleteClinic
{
    public function __construct(private PropertyImageStore $images) {}

    public function handle(Clinic $clinic): int
    {
        $id = (int) $clinic->id;
        if ($id < 1) {
            throw ValidationException::withMessages([
                'clinic' => 'Modelo inválido.',
            ]);
        }

        DB::transaction(function () use ($clinic, $id): void {
            $this->images->deleteForClinic($id);
            $clinic->delete();
        });

        $context = app(ClinicContext::class);
        if ($context->id() === $id) {
            $context->clear();
        }

        return $id;
    }
}
