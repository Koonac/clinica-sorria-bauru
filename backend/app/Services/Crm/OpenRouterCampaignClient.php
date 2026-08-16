<?php

namespace App\Services\Crm;

use App\Models\LlmTokenUsage;
use App\Services\RecordLlmTokenUsage;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenRouterCampaignClient
{
    private const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

    public function __construct(
        private RecordLlmTokenUsage $recordUsage,
        private OpenRouterModelCatalog $catalog,
    ) {}

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
        return $this->catalog->handle(
            $requireTools
                ? OpenRouterModelCatalog::CAPABILITY_TOOLS
                : OpenRouterModelCatalog::CAPABILITY_TEXT,
        );
    }

    public function generate(
        string $systemPrompt,
        ?string $fullName,
        ?string $notes,
        string $model,
        ?int $clinicId = null,
    ): string {
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

        $usage = $response->json('usage');
        $this->recordUsage->handle(
            is_array($usage) ? $usage : null,
            LlmTokenUsage::PURPOSE_CAMPAIGN,
            $model,
            $clinicId,
        );

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
}
