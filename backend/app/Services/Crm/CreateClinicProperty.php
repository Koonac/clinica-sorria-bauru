<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProperty;
use Illuminate\Http\UploadedFile;

class CreateClinicProperty
{
    public function __construct(private PropertyImageStore $images) {}

    /**
     * @param  array<string, mixed>  $attrs
     */
    public function handle(array $attrs): ClinicProperty
    {
        $file = $attrs['image'] ?? null;
        unset($attrs['image'], $attrs['remove_image']);

        $attrs['active'] = (bool) ($attrs['active'] ?? true);
        $attrs['title'] = $this->nullableString($attrs['title'] ?? null);

        $property = ClinicProperty::create($attrs);

        if ($file instanceof UploadedFile) {
            $property->image_path = $this->images->store($property, $file);
            $property->save();
        }

        return $property->fresh() ?? $property;
    }

    private function nullableString(mixed $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }
}
