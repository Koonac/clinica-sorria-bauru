<?php

namespace App\Services\Crm;

use App\Models\Crm\Connection;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class WhatsappApiClient
{
    public function __construct(private Connection $connection) {}

    /**
     * @return array<string, mixed>
     */
    public function connect(string $sessionId, string $notificationsUrl, string $messagesUrl): array
    {
        return $this->request('post', '/api/whatsapp/connect', [
            'sessionId' => $sessionId,
            'data' => [
                'notifications_url' => $notificationsUrl,
                'messages_url' => $messagesUrl,
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function status(string $sessionId): array
    {
        return $this->request('get', '/api/whatsapp/status/'.rawurlencode($sessionId));
    }

    /**
     * @return array<string, mixed>
     */
    public function qrcode(string $sessionId): array
    {
        return $this->request('get', '/api/whatsapp/qrcode/'.rawurlencode($sessionId));
    }

    /**
     * @return array<string, mixed>
     */
    public function disconnect(string $sessionId): array
    {
        return $this->request('delete', '/api/whatsapp/disconnect/'.rawurlencode($sessionId));
    }

    /**
     * @param  array{mimetype?: string, data?: string, filename?: string}|null  $media
     * @return array<string, mixed>
     */
    public function send(string $sessionId, string $to, string $message, ?array $media = null): array
    {
        $body = [
            'to' => $to,
            'message' => $message,
        ];
        if ($media !== null) {
            $body['media'] = $media;
        }

        return $this->request('post', '/api/whatsapp/send/'.rawurlencode($sessionId), $body);
    }

    /**
     * @return array<string, mixed>
     */
    public function listLabels(string $sessionId): array
    {
        return $this->request('get', '/api/whatsapp/labels/'.rawurlencode($sessionId));
    }

    /**
     * @return array<string, mixed>
     */
    public function createLabel(string $sessionId, string $name, ?int $color = null): array
    {
        $body = ['name' => $name];
        if ($color !== null) {
            $body['color'] = $color;
        }

        return $this->request('post', '/api/whatsapp/labels/'.rawurlencode($sessionId), $body);
    }

    /**
     * @return array<string, mixed>
     */
    public function linkLabel(string $sessionId, string $labelId, string $to): array
    {
        return $this->request(
            'post',
            '/api/whatsapp/labels/'.rawurlencode($sessionId).'/'.rawurlencode($labelId).'/contacts',
            ['to' => $to],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function unlinkLabel(string $sessionId, string $labelId, string $to): array
    {
        return $this->request(
            'delete',
            '/api/whatsapp/labels/'.rawurlencode($sessionId).'/'.rawurlencode($labelId).'/contacts',
            ['to' => $to],
        );
    }

    /**
     * URL temporária da foto de perfil no WhatsApp (ou null).
     *
     * @return array{success?: bool, url?: string|null, error?: string}
     */
    public function getProfilePicUrl(string $sessionId, string $jid): array
    {
        $path = '/api/whatsapp/profile-pic/'.rawurlencode($sessionId)
            .'?jid='.rawurlencode($jid);

        return $this->request('get', $path);
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function request(string $method, string $path, array $body = []): array
    {
        if (! $this->connection->hasCredentials()) {
            throw new RuntimeException('Credenciais da WhatsApp API não configuradas para esta conexão.');
        }

        $base = (string) config('services.whatsapp.url');
        if ($base === '') {
            throw new RuntimeException('WHATSAPP_API_URL não configurada.');
        }

        $pending = Http::withBasicAuth(
            (string) $this->connection->api_username,
            (string) $this->connection->api_password,
        )
            ->acceptJson()
            ->timeout(60);

        try {
            $response = match (strtolower($method)) {
                'get' => $pending->get($base.$path),
                'delete' => $body === []
                    ? $pending->delete($base.$path)
                    : $pending->send('DELETE', $base.$path, ['json' => $body]),
                'post' => $pending->post($base.$path, $body),
                default => throw new RuntimeException("Método HTTP não suportado: {$method}"),
            };

            $response->throw();
        } catch (RequestException $e) {
            $payload = $e->response?->json() ?? [];
            $message = is_array($payload)
                ? ($payload['message'] ?? $payload['error'] ?? $e->getMessage())
                : $e->getMessage();

            throw new RuntimeException(
                is_string($message) ? $message : 'Falha ao chamar a WhatsApp API.',
                (int) ($e->response?->status() ?: 502),
                $e,
            );
        }

        $json = $response->json();

        return is_array($json) ? $json : [];
    }
}
