<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProduct;
use Illuminate\Http\UploadedFile;

class CreateClinicProduct
{
    public function __construct(private ProductImageStore $images) {}

    /**
     * @param  array<string, mixed>  $attrs
     */
    public function handle(array $attrs): ClinicProduct
    {
        $file = $attrs['image'] ?? null;
        unset($attrs['image'], $attrs['remove_image']);

        $attrs['name'] = trim((string) ($attrs['name'] ?? ''));
        $attrs['active'] = (bool) ($attrs['active'] ?? true);
        $attrs['description'] = $this->nullableString($attrs['description'] ?? null);
        $attrs['colors'] = $this->nullableString($attrs['colors'] ?? null);
        $attrs['sizes'] = $this->normalizeSizes($attrs['sizes'] ?? []);

        $product = ClinicProduct::create($attrs);

        if ($file instanceof UploadedFile) {
            $product->image_path = $this->images->store($product, $file);
            $product->save();
        }

        return $product->fresh() ?? $product;
    }

    private function nullableString(mixed $value): ?string
    {
        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @return list<string>
     */
    private function normalizeSizes(mixed $sizes): array
    {
        $sizes = is_array($sizes) ? $sizes : [];

        return array_values(array_filter(
            ClinicProduct::SIZES,
            fn (string $size) => in_array($size, $sizes, true),
        ));
    }
}
