<?php

namespace App\Services;

use App\Models\OutboundHttpLog;
use App\Support\ClinicContext;
use Illuminate\Http\Client\Events\ConnectionFailed;
use Illuminate\Http\Client\Events\ResponseReceived;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;
use Throwable;

class LogOutboundHttpRequest
{
    private const BODY_MAX_BYTES = 8192;

    /** @var list<string> */
    private const SENSITIVE_HEADERS = [
        'authorization',
        'proxy-authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
    ];

    public function __construct(private ClinicContext $clinicContext) {}

    public function handleResponseReceived(ResponseReceived $event): void
    {
        try {
            $this->persist(
                request: $event->request,
                responseStatus: $event->response->status(),
                responseBody: $this->formatResponseBody($event->response),
                durationMs: $this->durationMs($event->response),
                error: $event->response->failed()
                    ? mb_substr(trim((string) ($event->response->json('error.message')
                        ?? $event->response->json('message')
                        ?? $event->response->body())), 0, 2000) ?: null
                    : null,
            );
        } catch (Throwable $e) {
            Log::warning('Falha ao gravar outbound HTTP log.', [
                'message' => $e->getMessage(),
            ]);
        }
    }

    public function handleConnectionFailed(ConnectionFailed $event): void
    {
        try {
            $this->persist(
                request: $event->request,
                responseStatus: null,
                responseBody: null,
                durationMs: null,
                error: mb_substr($event->exception->getMessage(), 0, 2000),
            );
        } catch (Throwable $e) {
            Log::warning('Falha ao gravar outbound HTTP log (connection).', [
                'message' => $e->getMessage(),
            ]);
        }
    }

    private function persist(
        Request $request,
        ?int $responseStatus,
        ?string $responseBody,
        ?int $durationMs,
        ?string $error,
    ): void {
        OutboundHttpLog::query()->create([
            'clinic_id' => $this->clinicContext->id(),
            'provider' => $this->providerFromUrl($request->url()),
            'method' => strtoupper($request->method()),
            'url' => $request->url(),
            'request_headers' => $this->redactHeaders($request->headers()),
            'request_body' => $this->formatRequestBody($request),
            'response_status' => $responseStatus,
            'response_body' => $responseBody,
            'duration_ms' => $durationMs,
            'error' => $error,
            'created_at' => now(),
        ]);
    }

    public function providerFromUrl(string $url): string
    {
        $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));

            if ($host === '') {
                return 'other';
            }

        if (str_contains($host, 'openrouter.ai')) {
            return 'openrouter';
        }

        if (str_contains($host, 'googleapis.com') || str_contains($host, 'google.com')) {
            return 'google';
        }

        $whatsappBase = trim((string) config('services.whatsapp.url', ''));
        if ($whatsappBase !== '') {
            $waHost = strtolower((string) (parse_url($whatsappBase, PHP_URL_HOST) ?? ''));
            if ($waHost !== '' && ($host === $waHost || str_ends_with($host, '.'.$waHost))) {
                return 'whatsapp';
            }
        }

        if (str_contains($host, 'whatsapp')) {
            return 'whatsapp';
        }

        return 'other';
    }

    /**
     * @param  array<string, array<int, string>>  $headers
     * @return array<string, array<int, string>>
     */
    private function redactHeaders(array $headers): array
    {
        $out = [];
        foreach ($headers as $name => $values) {
            $key = (string) $name;
            if (in_array(strtolower($key), self::SENSITIVE_HEADERS, true)) {
                $out[$key] = ['[redacted]'];
                continue;
            }
            $out[$key] = array_values(array_map('strval', (array) $values));
        }

        return $out;
    }

    private function formatRequestBody(Request $request): ?string
    {
        $contentType = strtolower(implode(', ', $request->header('Content-Type')));
        $raw = (string) $request->body();

        if ($raw === '') {
            return null;
        }

        if ($this->looksBinary($contentType, $raw)) {
            return sprintf('[binary omitted, %d bytes]', strlen($raw));
        }

        return $this->truncate($raw);
    }

    private function formatResponseBody(Response $response): ?string
    {
        $contentType = strtolower((string) $response->header('Content-Type'));
        $raw = $response->body();

        if ($raw === '') {
            return null;
        }

        if ($this->looksBinary($contentType, $raw)) {
            return sprintf('[binary omitted, %d bytes]', strlen($raw));
        }

        return $this->truncate($raw);
    }

    private function looksBinary(string $contentType, string $body): bool
    {
        if (
            str_starts_with($contentType, 'image/')
            || str_contains($contentType, 'octet-stream')
            || str_starts_with($contentType, 'audio/')
            || str_starts_with($contentType, 'video/')
            || str_contains($contentType, 'multipart/')
        ) {
            return true;
        }

        // JSON / texto: não tratar como binário.
        if (
            str_contains($contentType, 'json')
            || str_starts_with($contentType, 'text/')
            || str_contains($contentType, 'xml')
            || str_contains($contentType, 'x-www-form-urlencoded')
        ) {
            return false;
        }

        // Body enorme sem content-type textual → omitir.
        if (strlen($body) > self::BODY_MAX_BYTES * 2 && ! $this->looksLikeText($body)) {
            return true;
        }

        // Base64 media embutido (ex.: WhatsApp send com data URI longa).
        if (strlen($body) > self::BODY_MAX_BYTES && preg_match('/"data"\s*:\s*"[A-Za-z0-9+\/=]{500,}/', $body) === 1) {
            return true;
        }

        return false;
    }

    private function looksLikeText(string $body): bool
    {
        $sample = substr($body, 0, 512);

        return ! preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $sample);
    }

    private function truncate(string $body): string
    {
        if (strlen($body) <= self::BODY_MAX_BYTES) {
            return $body;
        }

        return substr($body, 0, self::BODY_MAX_BYTES).'…[truncated]';
    }

    private function durationMs(Response $response): ?int
    {
        $stats = $response->transferStats;
        if ($stats && method_exists($stats, 'getTransferTime')) {
            $seconds = $stats->getTransferTime();
            if (is_numeric($seconds)) {
                return (int) max(0, round(((float) $seconds) * 1000));
            }
        }

        $handler = $response->handlerStats();
        if (isset($handler['total_time']) && is_numeric($handler['total_time'])) {
            return (int) max(0, round(((float) $handler['total_time']) * 1000));
        }

        return null;
    }
}
