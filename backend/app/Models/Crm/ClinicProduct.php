<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Model;

/**
 * Peça do catálogo de uma loja de roupas (template loja_roupas).
 */
class ClinicProduct extends Model
{
    use BelongsToClinic;

    public const CATEGORIES = [
        'camiseta',
        'camisa',
        'blusa',
        'calca',
        'bermuda_short',
        'vestido',
        'saia',
        'casaco_jaqueta',
        'moda_intima',
        'calcado',
        'acessorio',
        'outros',
    ];

    public const CATEGORY_LABELS = [
        'camiseta' => 'Camiseta',
        'camisa' => 'Camisa',
        'blusa' => 'Blusa',
        'calca' => 'Calça',
        'bermuda_short' => 'Bermuda / short',
        'vestido' => 'Vestido',
        'saia' => 'Saia',
        'casaco_jaqueta' => 'Casaco / jaqueta',
        'moda_intima' => 'Moda íntima',
        'calcado' => 'Calçado',
        'acessorio' => 'Acessório',
        'outros' => 'Outros',
    ];

    public const AUDIENCES = ['feminino', 'masculino', 'unissex', 'infantil'];

    public const SIZES = [
        'PP', 'P', 'M', 'G', 'GG', 'XG',
        '34', '36', '38', '40', '42', '44', '46', '48',
        'UNICO',
    ];

    public const IMAGE_DISK = 'public';

    protected $fillable = [
        'clinic_id',
        'name',
        'description',
        'image_path',
        'price',
        'category',
        'audience',
        'sizes',
        'colors',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'sizes' => 'array',
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
     * Tamanhos na ordem canônica de SIZES (ignora valores desconhecidos).
     *
     * @return list<string>
     */
    public function orderedSizes(): array
    {
        $sizes = is_array($this->sizes) ? $this->sizes : [];

        return array_values(array_filter(self::SIZES, fn (string $size) => in_array($size, $sizes, true)));
    }

    /**
     * @return array<string, mixed>
     */
    public function toPublicArray(): array
    {
        return [
            'id' => $this->id,
            'clinic_id' => $this->clinic_id,
            'name' => $this->name,
            'description' => $this->description,
            'image_path' => $this->image_path,
            'image_url' => $this->imageUrl(),
            'price' => $this->price,
            'category' => $this->category,
            'audience' => $this->audience,
            'sizes' => $this->orderedSizes(),
            'colors' => $this->colors,
            'active' => (bool) $this->active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
