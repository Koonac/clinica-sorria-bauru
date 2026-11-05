<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\Crm\ClinicProduct;
use App\Support\ClinicContext;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo de peças da loja ativa (clinic_products).
 */
class ClinicProductCatalog
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function search(array $filters = []): array
    {
        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $categoria = mb_strtolower(trim((string) ($filters['categoria'] ?? $filters['category'] ?? '')));
        $publico = mb_strtolower(trim((string) ($filters['publico'] ?? $filters['audience'] ?? '')));
        $tamanho = mb_strtoupper(trim((string) ($filters['tamanho'] ?? $filters['size'] ?? '')));
        if (in_array($tamanho, ['ÚNICO', 'UNICO', 'U'], true)) {
            $tamanho = 'UNICO';
        }
        $limite = max(1, min(50, (int) ($filters['limite'] ?? 20)));

        $filtered = $this->all()->filter(function (array $product) use ($q, $categoria, $publico, $tamanho) {
            if ($categoria !== '' && mb_strtolower((string) ($product['categoria'] ?? '')) !== $categoria) {
                return false;
            }
            if ($publico !== '' && mb_strtolower((string) ($product['publico'] ?? '')) !== $publico) {
                return false;
            }
            if ($tamanho !== '' && ! in_array($tamanho, $product['tamanhos'] ?? [], true)) {
                return false;
            }
            if ($q !== '') {
                $hay = mb_strtolower(implode(' ', [
                    $product['nome'] ?? '',
                    $product['descricao'] ?? '',
                    $product['categoria_label'] ?? '',
                    $product['publico'] ?? '',
                    $product['cores'] ?? '',
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
            'produtos' => $page,
            'aviso' => 'Use apenas estas peças ao confirmar nome, preço, tamanho ou cor ao cliente. Se a peça ou tamanho não aparecer, diga que vai verificar com a equipe.',
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

        return $this->all()->first(function (array $product) use ($needle) {
            return mb_strtolower((string) ($product['id'] ?? '')) === $needle;
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
            throw new RuntimeException('Nenhuma loja ativa disponível.');
        }

        return ClinicProduct::query()
            ->where('clinic_id', $clinic->id)
            ->where('active', true)
            ->orderBy('name')
            ->orderBy('id')
            ->get()
            ->map(fn (ClinicProduct $product) => $this->mapProduct($product))
            ->values();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapProduct(ClinicProduct $product): array
    {
        return [
            'id' => $product->id,
            'nome' => $product->name,
            'descricao' => $product->description,
            'valor' => (float) $product->price,
            'categoria' => $product->category,
            'categoria_label' => ClinicProduct::CATEGORY_LABELS[$product->category] ?? $product->category,
            'publico' => $product->audience,
            'tamanhos' => $product->orderedSizes(),
            'cores' => $product->colors,
            'imagem_url' => $product->imageUrl(),
        ];
    }
}
