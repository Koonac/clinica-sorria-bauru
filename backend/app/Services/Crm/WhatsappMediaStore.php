<?php

namespace App\Services\Crm;

use App\Models\Crm\WhatsappMessage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Guarda os bytes de mídia do WhatsApp em disco e mantém apenas metadados no JSON
 * da mensagem (o base64 nunca fica no banco nem na resposta da API).
 */
class WhatsappMediaStore
{
    public const MAX_BYTES = 16_777_216;

    public const KIND_IMAGE = 'image';

    public const KIND_AUDIO = 'audio';

    private const DIRECTORY = 'whatsapp-media';

    /**
     * Metadados do payload do webhook, sem o base64.
     *
     * @param  mixed  $media
     * @return array<string, mixed>|null
     */
    public function metadata($media): ?array
    {
        if (! is_array($media)) {
            return null;
        }

        $meta = [
            'mimetype' => filled($media['mimetype'] ?? null) ? (string) $media['mimetype'] : null,
            'filename' => filled($media['filename'] ?? null) ? (string) $media['filename'] : null,
            'filesize' => is_numeric($media['filesize'] ?? null) ? (int) $media['filesize'] : null,
        ];

        if ($meta['mimetype'] === null && $meta['filename'] === null && $meta['filesize'] === null) {
            return null;
        }

        return $meta;
    }

    /**
     * Base64 cru do payload do webhook (aceita data URI).
     */
    public function rawBase64($media): ?string
    {
        if (! is_array($media)) {
            return null;
        }

        $data = $media['data'] ?? null;
        if (! is_string($data) || $data === '') {
            return null;
        }

        return preg_replace('#^data:[^;]+;base64,#', '', $data) ?: $data;
    }

    /**
     * Grava os bytes e devolve os metadados atualizados (com `path` ou `omitted`).
     *
     * @param  array<string, mixed>|null  $meta
     * @return array<string, mixed>
     */
    public function store(WhatsappMessage $message, string $base64, ?array $meta = null): array
    {
        $meta ??= [];
        $binary = base64_decode($base64, true);

        if ($binary === false || $binary === '') {
            $meta['omitted'] = true;

            return $meta;
        }

        if (strlen($binary) > self::MAX_BYTES) {
            Log::warning('WhatsappMediaStore: mídia acima do limite, bytes descartados.', [
                'message_id' => $message->id,
                'bytes' => strlen($binary),
            ]);
            $meta['filesize'] = strlen($binary);
            $meta['omitted'] = true;

            return $meta;
        }

        $path = sprintf(
            '%s/%d/%d.%s',
            self::DIRECTORY,
            (int) $message->clinic_id,
            (int) $message->id,
            $this->extension((string) ($meta['mimetype'] ?? ''), $meta['filename'] ?? null),
        );

        try {
            Storage::disk('local')->put($path, $binary);
        } catch (Throwable $e) {
            Log::warning('WhatsappMediaStore: falha ao gravar mídia.', [
                'message_id' => $message->id,
                'message' => $e->getMessage(),
            ]);
            $meta['omitted'] = true;

            return $meta;
        }

        unset($meta['omitted']);
        $meta['path'] = $path;
        $meta['filesize'] = strlen($binary);

        return $meta;
    }

    public function path(WhatsappMessage $message): ?string
    {
        $media = $message->media;
        if (! is_array($media)) {
            return null;
        }

        $path = $media['path'] ?? null;
        if (! is_string($path) || $path === '') {
            return null;
        }

        return Storage::disk('local')->exists($path) ? $path : null;
    }

    public function exists(WhatsappMessage $message): bool
    {
        return $this->path($message) !== null;
    }

    public function absolutePath(WhatsappMessage $message): ?string
    {
        $path = $this->path($message);

        return $path === null ? null : Storage::disk('local')->path($path);
    }

    public function base64(WhatsappMessage $message): ?string
    {
        $path = $this->path($message);
        if ($path === null) {
            return null;
        }

        $contents = Storage::disk('local')->get($path);

        return is_string($contents) && $contents !== '' ? base64_encode($contents) : null;
    }

    public function delete(WhatsappMessage $message): void
    {
        $path = $this->path($message);
        if ($path !== null) {
            Storage::disk('local')->delete($path);
        }
    }

    /**
     * Extensão a partir do mimetype (fallback: extensão do filename).
     */
    public function extension(string $mimetype, ?string $filename = null): string
    {
        $mimetype = strtolower(trim(explode(';', $mimetype)[0]));

        $byMime = [
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'audio/ogg' => 'ogg',
            'audio/opus' => 'ogg',
            'audio/mpeg' => 'mp3',
            'audio/mp3' => 'mp3',
            'audio/mp4' => 'm4a',
            'audio/x-m4a' => 'm4a',
            'audio/aac' => 'aac',
            'audio/wav' => 'wav',
            'audio/x-wav' => 'wav',
            'audio/webm' => 'webm',
            'audio/flac' => 'flac',
            'video/mp4' => 'mp4',
            'application/pdf' => 'pdf',
        ];

        if (isset($byMime[$mimetype])) {
            return $byMime[$mimetype];
        }

        $ext = strtolower((string) pathinfo((string) $filename, PATHINFO_EXTENSION));
        if ($ext !== '' && preg_match('/^[a-z0-9]{1,5}$/', $ext) === 1) {
            return $ext;
        }

        return 'bin';
    }

    /**
     * Formato aceito pelo endpoint de transcrição da OpenRouter.
     */
    public function transcriptionFormat(WhatsappMessage $message): string
    {
        $ext = $this->extension((string) $message->mediaMimetype(), $message->mediaFilename());

        return match ($ext) {
            'wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm', 'aac' => $ext,
            default => 'ogg',
        };
    }
}
