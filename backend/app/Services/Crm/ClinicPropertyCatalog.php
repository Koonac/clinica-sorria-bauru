<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\Crm\ClinicProperty;
use App\Support\ClinicContext;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo de imóveis da clínica ativa (clinic_properties).
 */
class ClinicPropertyCatalog
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function search(array $filters = []): array
    {
        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $endereco = mb_strtolower(trim((string) ($filters['endereco'] ?? $filters['titulo'] ?? '')));
        $dealType = mb_strtolower(trim((string) ($filters['deal_type'] ?? $filters['negocio'] ?? '')));
        $propertyType = mb_strtolower(trim((string) ($filters['property_type'] ?? $filters['tipo'] ?? '')));
        $limite = max(1, min(50, (int) ($filters['limite'] ?? 20)));

        $filtered = $this->all()->filter(function (array $property) use ($q, $endereco, $dealType, $propertyType) {
            if ($dealType !== '' && mb_strtolower((string) ($property['negocio'] ?? '')) !== $dealType) {
                return false;
            }
            if ($propertyType !== '' && mb_strtolower((string) ($property['tipo'] ?? '')) !== $propertyType) {
                return false;
            }
            if ($endereco !== '') {
                $hay = mb_strtolower(($property['titulo'] ?? '').' '.($property['endereco'] ?? ''));
                if (! str_contains($hay, $endereco)) {
                    return false;
                }
            }
            if ($q !== '') {
                $hay = mb_strtolower(implode(' ', [
                    $property['titulo'] ?? '',
                    $property['endereco'] ?? '',
                    $property['negocio'] ?? '',
                    $property['tipo'] ?? '',
                ]));
                if (! str_contains($hay, $q)) {
                    return false;
                }
            }

            return true;
        })->values();

        $page = $filtered->take($limite)->values()->all();

        return [
            'ok' => true,
            'total' => $filtered->count(),
            'retornados' => count($page),
            'imoveis' => $page,
            'aviso' => 'Use apenas estes imóveis ao confirmar endereço, valor, tipo ou se é aluguel/compra ao lead.',
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(string $id): ?array
    {
        $needle = mb_strtolower(trim($id));
        if ($needle === '') {
            return null;
        }

        return $this->all()->first(function (array $property) use ($needle) {
            return mb_strtolower((string) ($property['id'] ?? '')) === $needle;
        });
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function all(): Collection
    {
        $clinic = app(ClinicContext::class)->clinic()
            ?? Clinic::query()->where('is_active', true)->orderBy('id')->first();

        if (! $clinic) {
            throw new RuntimeException('Nenhuma clínica ativa disponível.');
        }

        return ClinicProperty::query()
            ->where('clinic_id', $clinic->id)
            ->where('active', true)
            ->orderBy('title')
            ->orderBy('id')
            ->get()
            ->map(fn (ClinicProperty $property) => $this->mapProperty($property))
            ->values();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapProperty(ClinicProperty $property): array
    {
        return [
            'id' => $property->id,
            'titulo' => $property->title,
            'endereco' => $property->address,
            'valor' => (float) $property->price,
            'negocio' => $property->deal_type,
            'tipo' => $property->property_type,
            'imagem_url' => $property->imageUrl(),
        ];
    }
}
