<?php

namespace App\Support;

use App\Models\Clinic;
use RuntimeException;

class ClinicContext
{
    private ?Clinic $clinic = null;

    public function set(?Clinic $clinic): void
    {
        $this->clinic = $clinic;
    }

    public function clinic(): ?Clinic
    {
        return $this->clinic;
    }

    public function id(): ?int
    {
        return $this->clinic?->id;
    }

    public function requireClinic(): Clinic
    {
        if (! $this->clinic) {
            throw new RuntimeException('Contexto de clínica não definido.');
        }

        return $this->clinic;
    }

    public function requireId(): int
    {
        return $this->requireClinic()->id;
    }

    public function clear(): void
    {
        $this->clinic = null;
    }
}
