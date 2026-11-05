<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProduct;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProductImageStore
{
    public function store(ClinicProduct $product, UploadedFile $file): string
    {
        $this->delete($product->image_path);

        $ext = strtolower((string) ($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg'));
        $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?: 'jpg';
        $name = Str::uuid()->toString().'.'.$ext;
        $directory = 'products/'.$product->clinic_id;

        $path = $file->storeAs($directory, $name, ClinicProduct::IMAGE_DISK);

        return is_string($path) ? $path : $directory.'/'.$name;
    }

    public function delete(?string $path): void
    {
        if (! is_string($path) || $path === '') {
            return;
        }

        $disk = Storage::disk(ClinicProduct::IMAGE_DISK);
        if ($disk->exists($path)) {
            $disk->delete($path);
        }
    }

    public function deleteForClinic(int $clinicId): void
    {
        $directory = 'products/'.$clinicId;
        $disk = Storage::disk(ClinicProduct::IMAGE_DISK);
        if ($disk->exists($directory)) {
            $disk->deleteDirectory($directory);
        }
    }
}
