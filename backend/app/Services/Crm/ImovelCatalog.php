<?php

namespace App\Services\Crm;

use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo de imóveis da imobiliária.
 * Hoje lê mock JSON; no futuro troca por consulta ao banco sem mudar a API/tool.
 */
class ImovelCatalog
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array{total: int, imoveis: list<array<string, mixed>>, mock: bool}
     */
    public function search(array $filters = []): array
    {
        $items = $this->all();

        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $cidade = mb_strtolower(trim((string) ($filters['cidade'] ?? '')));
        $bairro = mb_strtolower(trim((string) ($filters['bairro'] ?? '')));
        $tipo = mb_strtolower(trim((string) ($filters['tipo'] ?? '')));
        $finalidade = mb_strtolower(trim((string) ($filters['finalidade'] ?? '')));
        $status = mb_strtolower(trim((string) ($filters['status'] ?? 'disponivel')));
        $quartosMin = isset($filters['quartos_min']) ? (int) $filters['quartos_min'] : null;
        $precoMin = isset($filters['preco_min']) ? (float) $filters['preco_min'] : null;
        $precoMax = isset($filters['preco_max']) ? (float) $filters['preco_max'] : null;
        $destaque = array_key_exists('destaque', $filters)
            ? filter_var($filters['destaque'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            : null;
        $limite = max(1, min(20, (int) ($filters['limite'] ?? 5)));

        $filtered = $items->filter(function (array $imo) use (
            $q,
            $cidade,
            $bairro,
            $tipo,
            $finalidade,
            $status,
            $quartosMin,
            $precoMin,
            $precoMax,
            $destaque,
        ) {
            if ($status !== '' && $status !== 'todos') {
                if (mb_strtolower((string) ($imo['status'] ?? '')) !== $status) {
                    return false;
                }
            }
            if ($cidade !== '' && ! str_contains(mb_strtolower((string) ($imo['cidade'] ?? '')), $cidade)) {
                return false;
            }
            if ($bairro !== '' && ! str_contains(mb_strtolower((string) ($imo['bairro'] ?? '')), $bairro)) {
                return false;
            }
            if ($tipo !== '' && mb_strtolower((string) ($imo['tipo'] ?? '')) !== $tipo) {
                return false;
            }
            if ($finalidade !== '' && mb_strtolower((string) ($imo['finalidade'] ?? '')) !== $finalidade) {
                return false;
            }
            if ($quartosMin !== null && (int) ($imo['quartos'] ?? 0) < $quartosMin) {
                return false;
            }
            if ($precoMin !== null && (float) ($imo['preco'] ?? 0) < $precoMin) {
                return false;
            }
            if ($precoMax !== null && (float) ($imo['preco'] ?? 0) > $precoMax) {
                return false;
            }
            if ($destaque !== null && (bool) ($imo['destaque'] ?? false) !== $destaque) {
                return false;
            }
            if ($q !== '') {
                $hay = mb_strtolower(implode(' ', [
                    $imo['titulo'] ?? '',
                    $imo['descricao'] ?? '',
                    $imo['bairro'] ?? '',
                    $imo['cidade'] ?? '',
                    $imo['codigo'] ?? '',
                    $imo['tipo'] ?? '',
                ]));
                if (! str_contains($hay, $q)) {
                    return false;
                }
            }

            return true;
        })->values();

        $total = $filtered->count();
        $page = $filtered->take($limite)->values()->all();

        return [
            'ok' => true,
            'mock' => true,
            'total' => $total,
            'retornados' => count($page),
            'filtros' => array_filter([
                'q' => $q !== '' ? $q : null,
                'cidade' => $cidade !== '' ? $cidade : null,
                'bairro' => $bairro !== '' ? $bairro : null,
                'tipo' => $tipo !== '' ? $tipo : null,
                'finalidade' => $finalidade !== '' ? $finalidade : null,
                'status' => $status !== '' ? $status : null,
                'quartos_min' => $quartosMin,
                'preco_min' => $precoMin,
                'preco_max' => $precoMax,
                'destaque' => $destaque,
                'limite' => $limite,
            ], fn ($v) => $v !== null),
            'imoveis' => $page,
            'aviso' => 'Dados fictícios (mock). Use só estes imóveis ao falar com o lead — não invente opções.',
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(string $idOrCodigo): ?array
    {
        $needle = mb_strtolower(trim($idOrCodigo));
        if ($needle === '') {
            return null;
        }

        return $this->all()->first(function (array $imo) use ($needle) {
            return mb_strtolower((string) ($imo['id'] ?? '')) === $needle
                || mb_strtolower((string) ($imo['codigo'] ?? '')) === $needle;
        });
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function all(): Collection
    {
        $path = resource_path('data/imoveis.json');
        if (! is_file($path)) {
            throw new RuntimeException('Catálogo de imóveis mock não encontrado.');
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded) || ! is_array($decoded['imoveis'] ?? null)) {
            throw new RuntimeException('Catálogo de imóveis mock inválido.');
        }

        return collect($decoded['imoveis'])->map(fn ($row) => is_array($row) ? $row : [])->values();
    }
}
