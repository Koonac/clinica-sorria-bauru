<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\Crm\ClinicService;
use App\Support\ClinicContext;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo da clínica ativa: serviços cadastrados em clinic_services.
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
        $procedimento = mb_strtolower(trim((string) ($filters['procedimento'] ?? '')));
        $codigo = mb_strtolower(trim((string) ($filters['codigo'] ?? '')));
        $aceitaConvenio = array_key_exists('aceita_convenio', $filters)
            ? filter_var($filters['aceita_convenio'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            : null;
        $limite = max(1, min(20, (int) ($filters['limite'] ?? 5)));

        $filtered = $items->filter(function (array $cli) use ($q, $procedimento, $codigo, $aceitaConvenio) {
            $procs = collect($cli['procedimentos'] ?? [])->filter(fn ($p) => is_array($p));

            if ($codigo !== '') {
                $hit = $procs->contains(function (array $p) use ($codigo) {
                    return str_contains(mb_strtolower((string) ($p['codigo'] ?? '')), $codigo);
                });
                if (! $hit) {
                    return false;
                }
            }

            if ($procedimento !== '') {
                $hit = $procs->contains(function (array $p) use ($procedimento) {
                    $hay = mb_strtolower(($p['nome'] ?? '').' '.($p['codigo'] ?? '').' '.($p['descricao'] ?? ''));

                    return str_contains($hay, $procedimento);
                });
                if (! $hit) {
                    return false;
                }
            }

            if ($aceitaConvenio === true) {
                if (! $procs->contains(fn (array $p) => ! empty($p['aceita_convenio']))) {
                    return false;
                }
            } elseif ($aceitaConvenio === false) {
                if (! $procs->contains(fn (array $p) => empty($p['aceita_convenio']))) {
                    return false;
                }
            }

            if ($q !== '') {
                $procText = $procs->map(function (array $p) {
                    return ($p['nome'] ?? '').' '.($p['codigo'] ?? '').' '.($p['descricao'] ?? '');
                })->implode(' ');
                $hay = mb_strtolower(implode(' ', [
                    $cli['nome'] ?? '',
                    $cli['slug'] ?? '',
                    $procText,
                ]));
                if (! str_contains($hay, $q)) {
                    return false;
                }
            }

            return true;
        })->values();

        $page = $filtered->take($limite)->map(function (array $cli) use ($procedimento, $codigo, $aceitaConvenio) {
            $procs = collect($cli['procedimentos'] ?? [])->filter(fn ($p) => is_array($p));

            if ($codigo !== '') {
                $procs = $procs->filter(function (array $p) use ($codigo) {
                    return str_contains(mb_strtolower((string) ($p['codigo'] ?? '')), $codigo);
                });
            }

            if ($procedimento !== '') {
                $procs = $procs->filter(function (array $p) use ($procedimento) {
                    $hay = mb_strtolower(($p['nome'] ?? '').' '.($p['codigo'] ?? '').' '.($p['descricao'] ?? ''));

                    return str_contains($hay, $procedimento);
                });
            }

            if ($aceitaConvenio === true) {
                $procs = $procs->filter(fn (array $p) => ! empty($p['aceita_convenio']));
            } elseif ($aceitaConvenio === false) {
                $procs = $procs->filter(fn (array $p) => empty($p['aceita_convenio']));
            }

            $cli['procedimentos'] = $procs->values()->all();

            return $cli;
        })->values()->all();

        return [
            'ok' => true,
            'mock' => false,
            'total' => $filtered->count(),
            'retornados' => count($page),
            'clinicas' => $page,
            'aviso' => 'Use apenas estes serviços/procedimentos ao confirmar preços, duração ou cobertura por convênio ao lead.',
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
                || mb_strtolower((string) ($cli['slug'] ?? '')) === $needle
                || mb_strtolower((string) ($cli['nome'] ?? '')) === $needle;
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

        $services = ClinicService::query()
            ->where('clinic_id', $clinic->id)
            ->orderBy('name')
            ->get();

        return collect([
            [
                'id' => (string) $clinic->id,
                'slug' => $clinic->slug,
                'nome' => $clinic->name,
                'procedimentos' => $services->map(fn (ClinicService $service) => $this->mapService($service))->values()->all(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapService(ClinicService $service): array
    {
        return [
            'codigo' => $service->code,
            'nome' => $service->name,
            'duracao_minutos' => $service->duration_minutes,
            'preco_particular_min' => (float) $service->price_particular_min,
            'preco_particular_max' => (float) $service->price_particular_max,
            'aceita_convenio' => (bool) $service->accepts_insurance,
            'descricao' => $service->description,
        ];
    }
}
