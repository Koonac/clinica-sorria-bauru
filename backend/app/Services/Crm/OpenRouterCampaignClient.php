<?php

namespace App\Services\Crm;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenRouterCampaignClient
{
    private const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

    private const MODELS_URL = 'https://openrouter.ai/api/v1/models';

    public function apiKey(): string
    {
        $key = trim((string) config('services.openrouter.key', ''));
        if ($key === '') {
            throw new RuntimeException('OPENROUTER_API_KEY não configurada. Defina a variável de ambiente no servidor.');
        }

        return $key;
    }

    /**
     * @param  bool  $requireTools  Se true, só modelos com function calling (OpenRouter `tools`).
     * @return list<array{id: string, name: string, label: string, value: string, context_length: mixed, pricing: array<string, mixed>}>
     */
    public function listModels(bool $requireTools = false): array
    {
        $headers = ['Content-Type' => 'application/json'];
        $key = trim((string) config('services.openrouter.key', ''));
        if ($key !== '') {
            $headers['Authorization'] = 'Bearer '.$key;
        }

        $query = [];
        if ($requireTools) {
            $query['supported_parameters'] = 'tools';
        }

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
            if ($modelId === '' || ! $this->modelSupportsTextOutput($item)) {
                continue;
            }
            if ($requireTools && ! $this->modelSupportsTools($item)) {
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

    public function generate(string $systemPrompt, ?string $fullName, ?string $notes, string $model): string
    {
        $apiKey = $this->apiKey();
        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                [
                    'role' => 'user',
                    'content' => 'nome: '.($fullName ?? '')."\nanotações: ".($notes ?? ''),
                ],
            ],
        ];

        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$apiKey,
            'Content-Type' => 'application/json',
        ])->timeout(60)->post(self::CHAT_URL, $payload);

        if ($response->failed()) {
            $detail = $response->json('error.message')
                ?? $response->json('message')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException(
                'OpenRouter retornou erro ('.$response->status().'): '.$detail,
            );
        }

        $choices = $response->json('choices');
        if (! is_array($choices) || $choices === []) {
            throw new RuntimeException('OpenRouter não retornou conteúdo.');
        }

        $message = $choices[0]['message'] ?? [];
        $content = $message['content'] ?? '';
        if (is_array($content)) {
            $parts = [];
            foreach ($content as $part) {
                if (is_string($part)) {
                    $parts[] = $part;
                } elseif (is_array($part) && isset($part['text'])) {
                    $parts[] = (string) $part['text'];
                }
            }
            $content = implode("\n", $parts);
        }

        $text = trim((string) $content);
        if ($text === '') {
            throw new RuntimeException('OpenRouter não retornou conteúdo.');
        }

        return $text;
    }

    /**
     * @param  array<string, mixed>  $model
     */
    private function modelSupportsTools(array $model): bool
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
    private function modelSupportsTextOutput(array $model): bool
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
}
