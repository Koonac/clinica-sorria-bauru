<?php

namespace App\Services\Crm;

use InvalidArgumentException;

class RenderCampaignMessage
{
    /**
     * Replace {{nome}} / {{contato}} (and name/phone aliases). Notes are never interpolated.
     */
    public function handle(string $template, ?string $fullName, ?string $phone): string
    {
        $replacements = [
            'nome' => $fullName ?? '',
            'contato' => $phone ?? '',
            'name' => $fullName ?? '',
            'phone' => $phone ?? '',
        ];

        $text = $template;
        foreach ($replacements as $key => $value) {
            $pattern = '/\{\{\s*'.preg_quote($key, '/').'\s*\}\}/i';
            $text = preg_replace($pattern, (string) $value, $text) ?? $text;
        }

        return $text;
    }

    /**
     * @param  mixed  $raw
     * @return list<array{message_body: string, delay_after_sec: int}>
     */
    public function parseCustomSequence(mixed $raw): array
    {
        if ($raw === null) {
            return [];
        }

        if (is_array($raw)) {
            $data = $raw;
        } else {
            $text = trim((string) $raw);
            if ($text === '') {
                return [];
            }
            if (str_starts_with($text, '[')) {
                $parsed = json_decode($text, true);
                $data = is_array($parsed) ? $parsed : [['message_body' => $text, 'delay_after_sec' => 0]];
            } else {
                $data = [['message_body' => $text, 'delay_after_sec' => 0]];
            }
        }

        $sequence = [];
        foreach ($data as $item) {
            if (is_string($item)) {
                $body = trim($item);
                $delay = 0;
            } elseif (is_array($item)) {
                $body = trim((string) ($item['message_body'] ?? $item['message'] ?? ''));
                $delay = (int) ($item['delay_after_sec'] ?? 0);
            } else {
                continue;
            }
            if ($body === '') {
                continue;
            }
            $sequence[] = [
                'message_body' => $body,
                'delay_after_sec' => max(0, $delay),
            ];
        }

        return $sequence;
    }

    /**
     * @param  list<array{message_body?: string, message?: string, delay_after_sec?: int}>|string|null  $messages
     */
    public function serializeCustomSequence(array|string|null $messages): string
    {
        $sequence = $this->parseCustomSequence($messages);
        if ($sequence === []) {
            return '';
        }

        return json_encode($sequence, JSON_UNESCAPED_UNICODE) ?: '';
    }

    /**
     * Split AI response by newlines into a campaign message sequence.
     *
     * @return list<array{message_body: string, delay_after_sec: int}>
     */
    public function splitAiMessages(?string $text, int $delayAfterSec = 10): array
    {
        if ($text === null || trim($text) === '') {
            return [];
        }

        $parts = array_values(array_filter(
            array_map('trim', preg_split("/\r\n|\n|\r/", $text) ?: []),
            fn (string $p): bool => $p !== '',
        ));

        if ($parts === []) {
            return [];
        }

        $delay = max(0, $delayAfterSec);
        $sequence = [];
        foreach ($parts as $i => $body) {
            $sequence[] = [
                'message_body' => $body,
                'delay_after_sec' => $i < count($parts) - 1 ? $delay : 0,
            ];
        }

        return $sequence;
    }

    /**
     * @throws InvalidArgumentException
     */
    public function assertEditableStatus(string $status): void
    {
        if (in_array($status, ['queued', 'running'], true)) {
            throw new InvalidArgumentException('Cannot edit a campaign that is queued or running.');
        }
    }
}
