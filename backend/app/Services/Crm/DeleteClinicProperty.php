<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProperty;

class DeleteClinicProperty
{
    public function __construct(private PropertyImageStore $images) {}

    public function handle(ClinicProperty $property): int
    {
        $id = (int) $property->id;
        $this->images->delete($property->image_path);
        $property->delete();

        return $id;
    }
}
