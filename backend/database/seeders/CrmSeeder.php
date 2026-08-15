<?php

namespace Database\Seeders;

use App\Models\Clinic;
use App\Models\Crm\PipelineStage;
use App\Models\Crm\Source;
use App\Support\ClinicContext;
use Illuminate\Database\Seeder;

class CrmSeeder extends Seeder
{
    public function run(): void
    {
        $clinic = Clinic::query()->where('slug', 'sorria-bauru')->first()
            ?? Clinic::query()->orderBy('id')->first();

        if (! $clinic) {
            $clinic = Clinic::query()->create([
                'name' => 'Clínica Sorria Bauru',
                'slug' => 'sorria-bauru',
                'is_active' => true,
            ]);
        }

        app(ClinicContext::class)->set($clinic);

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
            Source::firstOrCreate(['slug' => $source['slug']], $source);
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
            PipelineStage::updateOrCreate(
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
            PipelineStage::updateOrCreate(
                ['clinic_id' => $clinic->id, 'kind' => 'lead', 'slug' => $stage['slug']],
                array_merge($stage, ['clinic_id' => $clinic->id, 'kind' => 'lead'], PipelineStage::flagsFor($status)),
            );
        }
    }
}
