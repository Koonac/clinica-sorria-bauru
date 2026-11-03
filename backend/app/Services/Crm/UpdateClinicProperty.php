<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProperty;
use Illuminate\Http\UploadedFile;

class UpdateClinicProperty
{
    public function __construct(private PropertyImageStore $images) {}

    /**
     * @param  array<string, mixed>  $attrs
     */
    public function handle(ClinicProperty $property, array $attrs): ClinicProperty
    {
        $file = $attrs['image'] ?? null;
        $removeImage = (bool) ($attrs['remove_image'] ?? false);
        unset($attrs['image'], $attrs['remove_image']);

        if (array_key_exists('title', $attrs)) {
            $attrs['title'] = $this->nullableString($attrs['title']);
        }
        if (array_key_exists('active', $attrs)) {
            $attrs['active'] = (bool) $attrs['active'];
        }

        $property->fill($attrs);

        if ($file instanceof UploadedFile) {
            $property->image_path = $this->images->store($property, $file);
        } elseif ($removeImage) {
            $this->images->delete($property->image_path);
            $property->image_path = null;
        }

        $property->save();

        return $property->fresh() ?? $property;
    }

    private function nullableString(mixed $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }
}
