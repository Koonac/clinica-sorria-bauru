<?php

namespace App\Services\Crm;

use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo de faixas estimativas de preços.
 * Mock JSON hoje; no futuro troca por banco sem mudar API/tool.
 */
class FaixaPrecoCatalog
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function search(array $filters = []): array
    {
        $items = $this->all();

        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $categoria = mb_strtolower(trim((string) ($filters['categoria'] ?? '')));
        $ambiente = mb_strtolower(trim((string) ($filters['ambiente'] ?? '')));
        $tipoVeiculo = mb_strtolower(trim((string) ($filters['tipo_veiculo'] ?? '')));
        $cobertura = mb_strtolower(trim((string) ($filters['cobertura'] ?? '')));
        $tipoSistema = mb_strtolower(trim((string) ($filters['tipo'] ?? '')));
        $metragem = isset($filters['metragem_m2']) ? (float) $filters['metragem_m2'] : null;
        $consumo = isset($filters['consumo_kwh_mes']) ? (float) $filters['consumo_kwh_mes'] : null;
        $fipe = isset($filters['valor_fipe']) ? (float) $filters['valor_fipe'] : null;
        $precoMin = isset($filters['preco_min']) ? (float) $filters['preco_min'] : null;
        $precoMax = isset($filters['preco_max']) ? (float) $filters['preco_max'] : null;
        $limite = max(1, min(20, (int) ($filters['limite'] ?? 8)));

        $filtered = $items->filter(function (array $row) use (
            $q,
            $categoria,
            $ambiente,
            $tipoVeiculo,
            $cobertura,
            $tipoSistema,
            $metragem,
            $consumo,
            $fipe,
            $precoMin,
            $precoMax,
        ) {
            if ($categoria !== '' && mb_strtolower((string) ($row['categoria'] ?? '')) !== $categoria) {
                return false;
            }

            $params = is_array($row['parametros'] ?? null) ? $row['parametros'] : [];

            if ($ambiente !== '' && mb_strtolower((string) ($params['ambiente'] ?? '')) !== $ambiente) {
                return false;
            }
            if ($tipoVeiculo !== '' && mb_strtolower((string) ($params['tipo_veiculo'] ?? '')) !== $tipoVeiculo) {
                return false;
            }
            if ($cobertura !== '' && mb_strtolower((string) ($params['cobertura'] ?? '')) !== $cobertura) {
                return false;
            }
            if ($tipoSistema !== '' && mb_strtolower((string) ($params['tipo'] ?? '')) !== $tipoSistema) {
                return false;
            }

            if ($metragem !== null) {
                $min = isset($params['metragem_m2_min']) ? (float) $params['metragem_m2_min'] : null;
                $max = isset($params['metragem_m2_max']) ? (float) $params['metragem_m2_max'] : null;
                if ($min !== null && $metragem < $min) {
                    return false;
                }
                if ($max !== null && $metragem > $max) {
                    return false;
                }
            }

            if ($consumo !== null) {
                $min = isset($params['consumo_kwh_mes_min']) ? (float) $params['consumo_kwh_mes_min'] : null;
                $max = isset($params['consumo_kwh_mes_max']) ? (float) $params['consumo_kwh_mes_max'] : null;
                if ($min !== null && $consumo < $min) {
                    return false;
                }
                if ($max !== null && $consumo > $max) {
                    return false;
                }
            }

            if ($fipe !== null) {
                $min = isset($params['faixa_fipe_min']) ? (float) $params['faixa_fipe_min'] : null;
                $max = isset($params['faixa_fipe_max']) ? (float) $params['faixa_fipe_max'] : null;
                if ($min !== null && $fipe < $min) {
                    return false;
                }
                if ($max !== null && $fipe > $max) {
                    return false;
                }
            }

            if ($precoMin !== null && (float) ($row['preco_max'] ?? 0) < $precoMin) {
                return false;
            }
            if ($precoMax !== null && (float) ($row['preco_min'] ?? 0) > $precoMax) {
                return false;
            }

            if ($q !== '') {
                $hay = mb_strtolower(implode(' ', [
                    $row['produto'] ?? '',
                    $row['categoria'] ?? '',
                    $row['categoria_label'] ?? '',
                    $row['observacoes'] ?? '',
                    json_encode($params, JSON_UNESCAPED_UNICODE) ?: '',
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
            'mock' => true,
            'total' => $filtered->count(),
            'retornados' => count($page),
            'faixas' => $page,
            'aviso' => 'Faixas estimativas fictícias (mock). Não trate como orçamento fechado; use só estes valores ao falar com o lead.',
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

        return $this->all()->first(
            fn (array $row) => mb_strtolower((string) ($row['id'] ?? '')) === $needle
        );
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function all(): Collection
    {
        $path = resource_path('data/faixas_precos.json');
        if (! is_file($path)) {
            throw new RuntimeException('Catálogo de faixas de preços mock não encontrado.');
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded) || ! is_array($decoded['faixas'] ?? null)) {
            throw new RuntimeException('Catálogo de faixas de preços mock inválido.');
        }

        return collect($decoded['faixas'])->map(fn ($row) => is_array($row) ? $row : [])->values();
    }
}
