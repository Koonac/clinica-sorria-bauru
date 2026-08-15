<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\Crm\ClinicService;
use App\Support\ClinicContext;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Catálogo de serviços da clínica ativa (clinic_services).
 */
class ClinicServiceCatalog
{
    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function search(array $filters = []): array
    {
        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));
        $nome = mb_strtolower(trim((string) ($filters['nome'] ?? $filters['procedimento'] ?? '')));
        $codigo = mb_strtolower(trim((string) ($filters['codigo'] ?? '')));
        $aceitaConvenio = array_key_exists('aceita_convenio', $filters)
            ? filter_var($filters['aceita_convenio'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            : null;
        $limite = max(1, min(50, (int) ($filters['limite'] ?? 20)));

        $filtered = $this->all()->filter(function (array $service) use ($q, $nome, $codigo, $aceitaConvenio) {
            if ($codigo !== '' && ! str_contains(mb_strtolower((string) ($service['codigo'] ?? '')), $codigo)) {
                return false;
            }

            if ($nome !== '') {
                $hay = mb_strtolower(($service['nome'] ?? '').' '.($service['codigo'] ?? '').' '.($service['descricao'] ?? ''));
                if (! str_contains($hay, $nome)) {
                    return false;
                }
            }

            if ($aceitaConvenio === true && empty($service['aceita_convenio'])) {
                return false;
            }
            if ($aceitaConvenio === false && ! empty($service['aceita_convenio'])) {
                return false;
            }

            if ($q !== '') {
                $hay = mb_strtolower(implode(' ', [
                    $service['nome'] ?? '',
                    $service['codigo'] ?? '',
                    $service['descricao'] ?? '',
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
            'servicos' => $page,
            'aviso' => 'Use apenas estes serviços ao confirmar preços, duração ou cobertura por convênio ao lead. A clínica já é a do atendimento atual.',
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

        return $this->all()->first(function (array $service) use ($needle) {
            return mb_strtolower((string) ($service['id'] ?? '')) === $needle
                || mb_strtolower((string) ($service['codigo'] ?? '')) === $needle;
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

        return ClinicService::query()
            ->where('clinic_id', $clinic->id)
            ->orderBy('name')
            ->get()
            ->map(fn (ClinicService $service) => $this->mapService($service))
            ->values();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapService(ClinicService $service): array
    {
        return [
            'id' => $service->id,
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
