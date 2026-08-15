<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\ClinicSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OpenRouterModelsFilterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ClinicSeeder::class);
    }

    public function test_lista_com_tools_1_so_retorna_modelos_com_tools(): void
    {
        Sanctum::actingAs(User::factory()->create());

        Http::fake([
            'openrouter.ai/api/v1/models*' => Http::response([
                'data' => [
                    [
                        'id' => 'openai/gpt-4o-mini',
                        'name' => 'GPT-4o Mini',
                        'architecture' => ['output_modalities' => ['text']],
                        'supported_parameters' => ['tools', 'temperature'],
                        'pricing' => [],
                    ],
                    [
                        'id' => 'openai/gpt-image',
                        'name' => 'Image Only',
                        'architecture' => ['output_modalities' => ['image']],
                        'supported_parameters' => ['tools'],
                        'pricing' => [],
                    ],
                    [
                        'id' => 'meta/llama-no-tools',
                        'name' => 'Llama No Tools',
                        'architecture' => ['output_modalities' => ['text']],
                        'supported_parameters' => ['temperature'],
                        'pricing' => [],
                    ],
                ],
            ], 200),
        ]);

        $this->getJson('/api/v1/crm/campaigns/openrouter-models?tools=1')
            ->assertOk()
            ->assertJsonPath('data.tools_only', true)
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.models.0.id', 'openai/gpt-4o-mini');

        Http::assertSent(function ($request) {
            $query = [];
            $qs = parse_url($request->url(), PHP_URL_QUERY);
            if (is_string($qs)) {
                parse_str($qs, $query);
            }

            return str_contains($request->url(), 'openrouter.ai/api/v1/models')
                && ($query['supported_parameters'] ?? null) === 'tools';
        });
    }

    public function test_lista_sem_filtro_mantem_modelos_texto_sem_tools(): void
    {
        Sanctum::actingAs(User::factory()->create());

        Http::fake([
            'openrouter.ai/api/v1/models*' => Http::response([
                'data' => [
                    [
                        'id' => 'meta/llama-no-tools',
                        'name' => 'Llama No Tools',
                        'architecture' => ['output_modalities' => ['text']],
                        'supported_parameters' => ['temperature'],
                        'pricing' => [],
                    ],
                    [
                        'id' => 'openai/gpt-4o-mini',
                        'name' => 'GPT-4o Mini',
                        'architecture' => ['output_modalities' => ['text']],
                        'supported_parameters' => ['tools'],
                        'pricing' => [],
                    ],
                ],
            ], 200),
        ]);

        $this->getJson('/api/v1/crm/campaigns/openrouter-models')
            ->assertOk()
            ->assertJsonPath('data.tools_only', false)
            ->assertJsonPath('data.total', 2);
    }
}
