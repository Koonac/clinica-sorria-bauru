<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Model;

class ClinicProperty extends Model
{
    use BelongsToClinic;

    public const DEAL_TYPES = ['aluguel', 'compra'];

    public const PROPERTY_TYPES = ['residencial', 'apartamento', 'comercial', 'rural'];

    public const IMAGE_DISK = 'public';

    protected $fillable = [
        'clinic_id',
        'title',
        'image_path',
        'address',
        'price',
        'deal_type',
        'property_type',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'active' => 'boolean',
        ];
    }

    public function imageUrl(): ?string
    {
        if (! is_string($this->image_path) || $this->image_path === '') {
            return null;
        }

        return '/media/'.$this->image_path;
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'clinic_id' => $this->clinic_id,
            'title' => $this->title,
            'image_path' => $this->image_path,
            'image_url' => $this->imageUrl(),
            'address' => $this->address,
            'price' => $this->price,
            'deal_type' => $this->deal_type,
            'property_type' => $this->property_type,
            'active' => (bool) $this->active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
