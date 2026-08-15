<?php

namespace App\Services\Crm;

use App\Models\Clinic;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\Source;
use App\Support\ClinicContext;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreateClinic
{
    /**
     * @param  array{
     *   name: string,
     *   slug?: string|null,
     *   is_active?: bool,
     *   google_calendar_refresh_token?: string|null,
     *   google_calendar_id?: string|null,
     *   google_calendar_timezone?: string|null,
     *   google_calendar_business_start?: int|null,
     *   google_calendar_business_end?: int|null,
     *   google_calendar_slot_minutes?: int|null,
     * }  $attrs
     */
    public function handle(array $attrs): Clinic
    {
        $name = trim((string) ($attrs['name'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages([
                'name' => 'O nome da clínica é obrigatório.',
            ]);
        }

        $slug = trim((string) ($attrs['slug'] ?? ''));
        if ($slug === '') {
            $slug = Str::slug($name);
        }
        if ($slug === '') {
            $slug = 'clinica-'.Str::lower(Str::random(6));
        }

        if (Clinic::query()->where('slug', $slug)->exists()) {
            throw ValidationException::withMessages([
                'slug' => 'Este slug já está em uso.',
            ]);
        }

        $clinic = Clinic::create([
            'name' => $name,
            'slug' => $slug,
            'is_active' => (bool) ($attrs['is_active'] ?? true),
            'google_calendar_refresh_token' => $attrs['google_calendar_refresh_token'] ?? null,
            'google_calendar_id' => $attrs['google_calendar_id'] ?? null,
            'google_calendar_timezone' => $attrs['google_calendar_timezone'] ?? config('services.google_calendar.timezone'),
            'google_calendar_business_start' => $attrs['google_calendar_business_start'] ?? config('services.google_calendar.business_hours_start'),
            'google_calendar_business_end' => $attrs['google_calendar_business_end'] ?? config('services.google_calendar.business_hours_end'),
            'google_calendar_slot_minutes' => $attrs['google_calendar_slot_minutes'] ?? config('services.google_calendar.slot_minutes'),
        ]);

        $this->seedPipeline($clinic);

        return $clinic;
    }

    private function seedPipeline(Clinic $clinic): void
    {
        $previous = app(ClinicContext::class)->clinic();
        app(ClinicContext::class)->set($clinic);

        try {
            $sources = [
                ['slug' => 'whatsapp', 'name' => 'WhatsApp'],
                ['slug' => 'instagram', 'name' => 'Instagram'],
                ['slug' => 'meta_ads', 'name' => 'Meta Ads'],
                ['slug' => 'google_ads', 'name' => 'Google Ads'],
                ['slug' => 'site', 'name' => 'Site'],
                ['slug' => 'indicacao', 'name' => 'Indicação'],
                ['slug' => 'cold_call', 'name' => 'Cold call'],
                ['slug' => 'outro', 'name' => 'Outro'],
            ];

            foreach ($sources as $source) {
                Source::query()->firstOrCreate(
                    ['slug' => $source['slug']],
                    $source,
                );
            }

            $dealStages = [
                ['slug' => 'novo', 'name' => 'Novo', 'position' => 1, 'color' => '#3b82f6', 'status' => 'open'],
                ['slug' => 'qualificacao', 'name' => 'Qualificação', 'position' => 2, 'color' => '#8b5cf6', 'status' => 'in_progress'],
                ['slug' => 'proposta', 'name' => 'Proposta', 'position' => 3, 'color' => '#f59e0b', 'status' => 'in_progress'],
                ['slug' => 'negociacao', 'name' => 'Negociação', 'position' => 4, 'color' => '#06b6d4', 'status' => 'in_progress'],
                ['slug' => 'ganho', 'name' => 'Ganho', 'position' => 5, 'color' => '#10b981', 'status' => 'won'],
                ['slug' => 'perdido', 'name' => 'Perdido', 'position' => 6, 'color' => '#6b7280', 'status' => 'lost'],
            ];

            foreach ($dealStages as $stage) {
                $status = $stage['status'];
                unset($stage['status']);
                PipelineStage::query()->updateOrCreate(
                    ['clinic_id' => $clinic->id, 'kind' => 'deal', 'slug' => $stage['slug']],
                    array_merge($stage, ['clinic_id' => $clinic->id, 'kind' => 'deal'], PipelineStage::flagsFor($status)),
                );
            }

            $leadStages = [
                ['slug' => 'new', 'name' => 'Novo', 'position' => 1, 'color' => '#3b82f6', 'status' => 'open'],
                ['slug' => 'contacted', 'name' => 'Contatado', 'position' => 2, 'color' => '#8b5cf6', 'status' => 'in_progress'],
                ['slug' => 'qualified', 'name' => 'Qualificado', 'position' => 3, 'color' => '#10b981', 'status' => 'in_progress'],
                ['slug' => 'unqualified', 'name' => 'Desqualificado', 'position' => 4, 'color' => '#6b7280', 'status' => 'lost'],
            ];

            foreach ($leadStages as $stage) {
                $status = $stage['status'];
                unset($stage['status']);
                PipelineStage::query()->updateOrCreate(
                    ['clinic_id' => $clinic->id, 'kind' => 'lead', 'slug' => $stage['slug']],
                    array_merge($stage, ['clinic_id' => $clinic->id, 'kind' => 'lead'], PipelineStage::flagsFor($status)),
                );
            }
        } finally {
            app(ClinicContext::class)->set($previous);
        }
    }
}
