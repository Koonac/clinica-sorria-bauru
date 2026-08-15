<?php

namespace App\Services\Crm;

use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo de clínicas (procedimentos, médicos e convênios).
 * Mock JSON hoje; no futuro troca por banco sem mudar API/tool.
 */
class ClinicaCatalog
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function search(array $filters = []): array
    {
        $items = $this->all();

        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $tipo = mb_strtolower(trim((string) ($filters['tipo'] ?? '')));
        $cidade = mb_strtolower(trim((string) ($filters['cidade'] ?? '')));
        $bairro = mb_strtolower(trim((string) ($filters['bairro'] ?? '')));
        $convenio = mb_strtolower(trim((string) ($filters['convenio'] ?? '')));
        $procedimento = mb_strtolower(trim((string) ($filters['procedimento'] ?? '')));
        $medicoDisponivel = array_key_exists('medico_disponivel', $filters)
            ? filter_var($filters['medico_disponivel'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            : null;
        $limite = max(1, min(20, (int) ($filters['limite'] ?? 5)));

        $filtered = $items->filter(function (array $cli) use (
            $q,
            $tipo,
            $cidade,
            $bairro,
            $convenio,
            $procedimento,
            $medicoDisponivel,
        ) {
            if ($tipo !== '' && mb_strtolower((string) ($cli['tipo'] ?? '')) !== $tipo) {
                return false;
            }
            if ($cidade !== '' && ! str_contains(mb_strtolower((string) ($cli['cidade'] ?? '')), $cidade)) {
                return false;
            }
            if ($bairro !== '' && ! str_contains(mb_strtolower((string) ($cli['bairro'] ?? '')), $bairro)) {
                return false;
            }

            $convenios = collect($cli['convenios'] ?? [])->map(fn ($c) => mb_strtolower((string) $c));
            if ($convenio !== '' && ! $convenios->contains(fn ($c) => str_contains($c, $convenio))) {
                return false;
            }

            $procs = collect($cli['procedimentos'] ?? [])->filter(fn ($p) => is_array($p));
            if ($procedimento !== '') {
                $hit = $procs->contains(function (array $p) use ($procedimento) {
                    $hay = mb_strtolower(($p['nome'] ?? '').' '.($p['codigo'] ?? ''));

                    return str_contains($hay, $procedimento);
                });
                if (! $hit) {
                    return false;
                }
            }

            $medicos = collect($cli['medicos'] ?? [])->filter(fn ($m) => is_array($m));
            if ($medicoDisponivel === true) {
                if (! $medicos->contains(fn (array $m) => ! empty($m['disponivel']))) {
                    return false;
                }
            }

            if ($q !== '') {
                $procText = $procs->map(fn (array $p) => ($p['nome'] ?? '').' '.($p['codigo'] ?? ''))->implode(' ');
                $medText = $medicos->map(fn (array $m) => ($m['nome'] ?? '').' '.($m['especialidade'] ?? ''))->implode(' ');
                $hay = mb_strtolower(implode(' ', [
                    $cli['nome'] ?? '',
                    $cli['tipo'] ?? '',
                    $cli['tipo_label'] ?? '',
                    $cli['bairro'] ?? '',
                    $cli['cidade'] ?? '',
                    $convenios->implode(' '),
                    $procText,
                    $medText,
                ]));
                if (! str_contains($hay, $q)) {
                    return false;
                }
            }

            return true;
        })->values();

        $page = $filtered->take($limite)->map(function (array $cli) use ($procedimento) {
            if ($procedimento === '') {
                return $cli;
            }
            // Destaca procedimentos que bateram no filtro.
            $cli['procedimentos'] = collect($cli['procedimentos'] ?? [])
                ->filter(fn ($p) => is_array($p))
                ->filter(function (array $p) use ($procedimento) {
                    $hay = mb_strtolower(($p['nome'] ?? '').' '.($p['codigo'] ?? ''));

                    return str_contains($hay, $procedimento);
                })
                ->values()
                ->all();

            return $cli;
        })->values()->all();

        return [
            'ok' => true,
            'mock' => true,
            'total' => $filtered->count(),
            'retornados' => count($page),
            'clinicas' => $page,
            'aviso' => 'Dados fictícios (mock). Antes de confirmar procedimento, médico ou convênio ao lead, use só este retorno.',
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(string $idOrNome): ?array
    {
        $needle = mb_strtolower(trim($idOrNome));
        if ($needle === '') {
            return null;
        }

        return $this->all()->first(function (array $cli) use ($needle) {
            return mb_strtolower((string) ($cli['id'] ?? '')) === $needle
                || mb_strtolower((string) ($cli['nome'] ?? '')) === $needle;
        });
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function all(): Collection
    {
        $path = resource_path('data/clinicas.json');
        if (! is_file($path)) {
            throw new RuntimeException('Catálogo de clínicas mock não encontrado.');
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (! is_array($decoded) || ! is_array($decoded['clinicas'] ?? null)) {
            throw new RuntimeException('Catálogo de clínicas mock inválido.');
        }

        return collect($decoded['clinicas'])->map(fn ($row) => is_array($row) ? $row : [])->values();
    }
}
