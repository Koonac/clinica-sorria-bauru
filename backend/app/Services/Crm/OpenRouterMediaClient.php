<?php

namespace App\Services\Crm;

use App\Models\LlmTokenUsage;
use App\Models\SystemSetting;
use App\Services\RecordLlmTokenUsage;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Converte mídia do WhatsApp em texto na OpenRouter (áudio → transcrição,
 * imagem → descrição), já que o modelo do agent é somente texto.
 */
class OpenRouterMediaClient
{
    private const TRANSCRIPTION_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';

    public function __construct(
        private OpenRouterAgentClient $agent,
        private RecordLlmTokenUsage $recordUsage,
    ) {}

    public function transcriptionModel(): string
    {
        return (string) SystemSetting::resolve(SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_MODEL);
    }

    public function visionModel(): string
    {
        return (string) SystemSetting::resolve(SystemSetting::KEY_OPENROUTER_VISION_MODEL);
    }

    public function language(): ?string
    {
        $language = trim((string) SystemSetting::resolve(SystemSetting::KEY_OPENROUTER_TRANSCRIPTION_LANGUAGE));

        return $language !== '' ? $language : null;
    }

    /**
     * @param  string  $base64  Áudio em base64 puro (sem data URI)
     * @param  string  $format  wav, mp3, flac, m4a, ogg, webm ou aac
     */
    public function transcribe(string $base64, string $format, ?int $clinicId = null): string
    {
        $model = $this->transcriptionModel();

        $payload = [
            'model' => $model,
            'input_audio' => [
                'data' => $base64,
                'format' => $format,
            ],
        ];

        $language = $this->language();
        if ($language !== null) {
            $payload['language'] = $language;
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->agent->apiKey(),
            'Content-Type' => 'application/json',
        ])->timeout(120)->post(self::TRANSCRIPTION_URL, $payload);

        if ($response->failed()) {
            $detail = $response->json('error.message')
                ?? $response->json('message')
                ?? mb_substr($response->body(), 0, 300);
            throw new RuntimeException(
                'OpenRouter retornou erro na transcrição ('.$response->status().'): '.$detail,
            );
        }

        $usage = $response->json('usage');
        $this->recordUsage->handle(
            is_array($usage) ? $usage : null,
            LlmTokenUsage::PURPOSE_MEDIA_TRANSCRIPTION,
            $model,
            $clinicId,
        );

        $text = $response->json('text');
        $text = is_string($text) ? trim($text) : '';

        if ($text === '') {
            throw new RuntimeException('OpenRouter não retornou texto para o áudio.');
        }

        return $text;
    }

    /**
     * @param  string  $base64  Imagem em base64 puro (sem data URI)
     */
    public function describeImage(
        string $base64,
        string $mimetype,
        string $system,
        string $instruction,
        ?int $clinicId = null,
    ): string {
        $mimetype = $mimetype !== '' ? $mimetype : 'image/jpeg';

        $result = $this->agent->chat([
            ['role' => 'system', 'content' => $system],
            [
                'role' => 'user',
                'content' => [
                    ['type' => 'text', 'text' => $instruction],
                    [
                        'type' => 'image_url',
                        'image_url' => ['url' => 'data:'.$mimetype.';base64,'.$base64],
                    ],
                ],
            ],
        ], [], $this->visionModel(), LlmTokenUsage::PURPOSE_MEDIA_VISION, $clinicId);

        $content = is_string($result['content'] ?? null) ? trim((string) $result['content']) : '';
        if ($content === '') {
            throw new RuntimeException('OpenRouter não retornou descrição para a imagem.');
        }

        return $content;
    }
}
