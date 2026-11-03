<?php

namespace App\Services\Crm;

use App\Models\Crm\ClinicProperty;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PropertyImageStore
{
    public function store(ClinicProperty $property, UploadedFile $file): string
    {
        $this->delete($property->image_path);

        $ext = strtolower((string) ($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg'));
        $ext = preg_replace('/[^a-z0-9]/', '', $ext) ?: 'jpg';
        $name = Str::uuid()->toString().'.'.$ext;
        $directory = 'properties/'.$property->clinic_id;

        $path = $file->storeAs($directory, $name, ClinicProperty::IMAGE_DISK);

        return is_string($path) ? $path : $directory.'/'.$name;
    }

    public function delete(?string $path): void
    {
        if (! is_string($path) || $path === '') {
            return;
        }

        $disk = Storage::disk(ClinicProperty::IMAGE_DISK);
        if ($disk->exists($path)) {
            $disk->delete($path);
        }
    }

    public function deleteForClinic(int $clinicId): void
    {
        $directory = 'properties/'.$clinicId;
        $disk = Storage::disk(ClinicProperty::IMAGE_DISK);
        if ($disk->exists($directory)) {
            $disk->deleteDirectory($directory);
        }
    }
}
