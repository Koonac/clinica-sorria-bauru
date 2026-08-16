<?php

namespace App\Services\Crm;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenRouterAgentClient
{
    private const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

    public function apiKey(): string
    {
        $key = trim((string) config('services.openrouter.key', ''));
        if ($key === '') {
            throw new RuntimeException('OPENROUTER_API_KEY não configurada.');
        }

        return $key;
    }

    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array<string, mixed>>  $tools
     * @return array{content: ?string, tool_calls: list<array<string, mixed>>}
     */
    public function chat(array $messages, array $tools, string $model): array
    {
        $payload = [
            'model' => $model,
            'messages' => $messages,
        ];
        if ($tools !== []) {
            $payload['tools'] = $tools;
            $payload['tool_choice'] = 'auto';
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->apiKey(),
            'Content-Type' => 'application/json',
        ])->timeout(90)->post(self::CHAT_URL, $payload);

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
            throw new RuntimeException('OpenRouter não retornou choices.');
        }

        $message = $choices[0]['message'] ?? [];
        if (! is_array($message)) {
            throw new RuntimeException('OpenRouter retornou message inválida.');
        }

        $content = $message['content'] ?? null;
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
        if (is_string($content)) {
            $content = trim($content);
            if ($content === '') {
                $content = null;
            }
        } else {
            $content = null;
        }

        $toolCalls = [];
        $rawCalls = $message['tool_calls'] ?? [];
        if (is_array($rawCalls)) {
            foreach ($rawCalls as $call) {
                if (is_array($call)) {
                    $toolCalls[] = $call;
                }
            }
        }

        return [
            'content' => $content,
            'tool_calls' => $toolCalls,
            'raw_message' => $message,
        ];
    }

    /**
     * Completion simples sem tools (ex.: resumo de atendimento).
     */
    public function complete(string $system, string $user, string $model): string
    {
        $result = $this->chat([
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $user],
        ], [], $model);

        $content = is_string($result['content'] ?? null) ? trim((string) $result['content']) : '';
        if ($content === '') {
            throw new RuntimeException('OpenRouter não retornou conteúdo para o resumo.');
        }

        return $content;
    }
}
