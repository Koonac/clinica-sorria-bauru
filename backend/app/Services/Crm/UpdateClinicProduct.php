<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProduct;
use Illuminate\Http\UploadedFile;

class UpdateClinicProduct
{
    public function __construct(private ProductImageStore $images) {}

    /**
     * @param  array<string, mixed>  $attrs
     */
    public function handle(ClinicProduct $product, array $attrs): ClinicProduct
    {
        $file = $attrs['image'] ?? null;
        $removeImage = (bool) ($attrs['remove_image'] ?? false);
        unset($attrs['image'], $attrs['remove_image']);

        if (array_key_exists('name', $attrs)) {
            $attrs['name'] = trim((string) $attrs['name']);
        }
        foreach (['description', 'colors'] as $field) {
            if (array_key_exists($field, $attrs)) {
                $attrs[$field] = $this->nullableString($attrs[$field]);
            }
        }
        if (array_key_exists('sizes', $attrs)) {
            $sizes = is_array($attrs['sizes']) ? $attrs['sizes'] : [];
            $attrs['sizes'] = array_values(array_filter(
                ClinicProduct::SIZES,
                fn (string $size) => in_array($size, $sizes, true),
            ));
        }
        if (array_key_exists('active', $attrs)) {
            $attrs['active'] = (bool) $attrs['active'];
        }

        $product->fill($attrs);

        if ($file instanceof UploadedFile) {
            $product->image_path = $this->images->store($product, $file);
        } elseif ($removeImage) {
            $this->images->delete($product->image_path);
            $product->image_path = null;
        }

        $product->save();

        return $product->fresh() ?? $product;
    }

    private function nullableString(mixed $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }
}
