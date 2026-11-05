<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProduct;

class DeleteClinicProduct
{
    public function __construct(private ProductImageStore $images) {}

    public function handle(ClinicProduct $product): int
    {
        $id = (int) $product->id;
        $this->images->delete($product->image_path);
        $product->delete();

        return $id;
    }
}
