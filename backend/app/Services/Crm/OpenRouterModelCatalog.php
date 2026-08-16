<?php

namespace App\Services\Crm;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Lista modelos da OpenRouter filtrados pela capacidade necessária
 * (texto, function calling, transcrição de áudio ou leitura de imagem).
 */
class OpenRouterModelCatalog
{
    public const CAPABILITY_TEXT = 'text';

    public const CAPABILITY_TOOLS = 'tools';

    public const CAPABILITY_TRANSCRIPTION = 'transcription';

    public const CAPABILITY_VISION = 'vision';

    /** @var list<string> */
    public const CAPABILITIES = [
        self::CAPABILITY_TEXT,
        self::CAPABILITY_TOOLS,
        self::CAPABILITY_TRANSCRIPTION,
        self::CAPABILITY_VISION,
    ];

    private const MODELS_URL = 'https://openrouter.ai/api/v1/models';

    /**
     * @return list<array{id: string, name: string, label: string, value: string, context_length: mixed, pricing: array<string, mixed>}>
     */
    public function handle(string $capability = self::CAPABILITY_TEXT): array
    {
        if (! in_array($capability, self::CAPABILITIES, true)) {
            throw new RuntimeException("Capacidade de modelo inválida: {$capability}");
        }

        $headers = ['Content-Type' => 'application/json'];
        $key = trim((string) config('services.openrouter.key', ''));
        if ($key !== '') {
            $headers['Authorization'] = 'Bearer '.$key;
        }

        // Modelos de transcrição não aparecem no catálogo padrão: só com o filtro.
        $query = match ($capability) {
            self::CAPABILITY_TOOLS => ['supported_parameters' => 'tools'],
            self::CAPABILITY_TRANSCRIPTION => ['output_modalities' => 'transcription'],
            self::CAPABILITY_VISION => ['input_modalities' => 'image'],
            default => [],
        };

        $response = Http::withHeaders($headers)
            ->timeout(30)
            ->get(self::MODELS_URL, $query);

        if ($response->failed()) {
            $detail = $response->json('error.message')
                ?? $response->json('message')
                ?? $response->body();
            throw new RuntimeException(
                'OpenRouter retornou erro ao listar modelos ('.$response->status().'): '.mb_substr((string) $detail, 0, 300),
            );
        }

        $rawModels = $response->json('data');
        if (! is_array($rawModels)) {
            $rawModels = $response->json();
        }
        if (! is_array($rawModels)) {
            throw new RuntimeException('OpenRouter não retornou a lista de modelos.');
        }

        $models = [];
        foreach ($rawModels as $item) {
            if (! is_array($item)) {
                continue;
            }
            $modelId = trim((string) ($item['id'] ?? ''));
            if ($modelId === '' || ! $this->matchesCapability($item, $capability)) {
                continue;
            }
            $name = trim((string) ($item['name'] ?? $modelId));
            $models[] = [
                'id' => $modelId,
                'name' => $name,
                'label' => "{$name} ({$modelId})",
                'value' => $modelId,
                'context_length' => $item['context_length'] ?? null,
                'pricing' => is_array($item['pricing'] ?? null) ? $item['pricing'] : [],
            ];
        }

        usort($models, fn (array $a, array $b): int => strcasecmp($a['name'], $b['name']));

        return $models;
    }

    /**
     * @param  array<string, mixed>  $model
     */
    private function matchesCapability(array $model, string $capability): bool
    {
        return match ($capability) {
            self::CAPABILITY_TOOLS => $this->supportsTextOutput($model) && $this->supportsTools($model),
            self::CAPABILITY_TRANSCRIPTION => $this->supportsTranscription($model),
            self::CAPABILITY_VISION => $this->supportsTextOutput($model) && $this->supportsImageInput($model),
            default => $this->supportsTextOutput($model),
        };
    }

    /**
     * @param  array<string, mixed>  $model
     */
    private function supportsTools(array $model): bool
    {
        $params = $model['supported_parameters'] ?? null;
        if (! is_array($params)) {
            return false;
        }

        foreach ($params as $param) {
            if (is_string($param) && strtolower($param) === 'tools') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $model
     */
    private function supportsTextOutput(array $model): bool
    {
        $architecture = $model['architecture'] ?? [];
        if (! is_array($architecture)) {
            return true;
        }
        $outputs = $architecture['output_modalities'] ?? [];
        if (is_array($outputs) && $outputs !== []) {
            return in_array('text', $outputs, true);
        }
        $modality = (string) ($architecture['modality'] ?? '');
        if (str_contains($modality, '->')) {
            return str_contains(explode('->', $modality, 2)[1], 'text');
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $model
     */
    private function supportsImageInput(array $model): bool
    {
        return $this->hasModality($model, 'input_modalities', 'image', 0);
    }

    /**
     * @param  array<string, mixed>  $model
     */
    private function supportsTranscription(array $model): bool
    {
        return $this->hasModality($model, 'output_modalities', 'transcription', 1)
            || $this->hasModality($model, 'input_modalities', 'audio', 0);
    }

    /**
     * Procura a modalidade na lista declarada e, como fallback, no formato
     * legado `entrada->saida` do campo `modality`.
     *
     * @param  array<string, mixed>  $model
     * @param  int  $modalitySide  0 = entrada, 1 = saída
     */
    private function hasModality(array $model, string $listKey, string $modality, int $modalitySide): bool
    {
        $architecture = $model['architecture'] ?? [];
        if (! is_array($architecture)) {
            return false;
        }

        $list = $architecture[$listKey] ?? [];
        if (is_array($list) && $list !== []) {
            return in_array($modality, $list, true);
        }

        $legacy = (string) ($architecture['modality'] ?? '');
        if (! str_contains($legacy, '->')) {
            return false;
        }

        return str_contains(explode('->', $legacy, 2)[$modalitySide] ?? '', $modality);
    }
}
