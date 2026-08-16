<?php

namespace App\Services\Crm;

use App\Models\Crm\WhatsappMessage;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Transforma áudio/imagem inbound em texto (OpenRouter) para o agent — que usa
 * um modelo somente texto — conseguir responder. Só é chamado quando o agent
 * está no controle da conversa.
 */
class EnrichWhatsappInboundMedia
{
    public const VISION_SYSTEM = 'Você descreve imagens recebidas por WhatsApp em uma clínica odontológica. Responda em português, em no máximo 3 frases objetivas, focando no que é relevante para o atendimento (o que aparece, textos legíveis, região da boca/dente, documentos, exames). Não faça diagnóstico nem suposições sobre o paciente.';

    public const VISION_INSTRUCTION = 'Descreva esta imagem enviada pelo paciente.';

    public function __construct(
        private WhatsappMediaStore $mediaStore,
        private OpenRouterMediaClient $client,
    ) {}

    /**
     * Enriquece as mensagens pendentes de um histórico (mais recentes primeiro).
     *
     * @param  iterable<int, WhatsappMessage>  $messages
     */
    public function handleMany(iterable $messages, int $limit = 5): int
    {
        $done = 0;
        foreach ($messages as $message) {
            if ($done >= $limit) {
                break;
            }
            if (! $this->shouldEnrich($message)) {
                continue;
            }
            if ($this->handle($message) !== null) {
                $done++;
            }
        }

        return $done;
    }

    /**
     * @return string|null Texto extraído, ou null se não houve enriquecimento
     */
    public function handle(WhatsappMessage $message): ?string
    {
        if (! $this->shouldEnrich($message)) {
            return null;
        }

        $kind = $message->mediaKind();
        $base64 = $this->mediaStore->base64($message);
        if ($base64 === null) {
            return null;
        }

        try {
            $text = $kind === WhatsappMediaStore::KIND_AUDIO
                ? $this->client->transcribe(
                    $base64,
                    $this->mediaStore->transcriptionFormat($message),
                    (int) $message->clinic_id,
                )
                : $this->client->describeImage(
                    $base64,
                    (string) $message->mediaMimetype(),
                    self::VISION_SYSTEM,
                    self::VISION_INSTRUCTION,
                    (int) $message->clinic_id,
                );
        } catch (Throwable $e) {
            Log::warning('EnrichWhatsappInboundMedia: falha ao interpretar mídia.', [
                'message_id' => $message->id,
                'kind' => $kind,
                'message' => $e->getMessage(),
            ]);
            $this->markFailed($message);

            return null;
        }

        $media = is_array($message->media) ? $message->media : [];
        $media[$kind === WhatsappMediaStore::KIND_AUDIO ? 'transcript' : 'description'] = $text;
        $media['enriched_at'] = now()->toIso8601String();
        unset($media['enrich_failed_at']);

        $attributes = ['media' => $media];
        if (trim((string) $message->body) === '') {
            $attributes['body'] = $kind === WhatsappMediaStore::KIND_AUDIO
                ? $text
                : '[imagem] '.$text;
        }

        $message->forceFill($attributes)->save();

        return $text;
    }

    public function shouldEnrich(WhatsappMessage $message): bool
    {
        if ($message->direction !== 'inbound' || ! $message->has_media) {
            return false;
        }

        if (! in_array($message->mediaKind(), [
            WhatsappMediaStore::KIND_AUDIO,
            WhatsappMediaStore::KIND_IMAGE,
        ], true)) {
            return false;
        }

        $media = is_array($message->media) ? $message->media : [];
        if (filled($media['enriched_at'] ?? null) || filled($media['enrich_failed_at'] ?? null)) {
            return false;
        }

        return $this->mediaStore->exists($message);
    }

    private function markFailed(WhatsappMessage $message): void
    {
        $media = is_array($message->media) ? $message->media : [];
        $media['enrich_failed_at'] = now()->toIso8601String();

        $message->forceFill(['media' => $media])->save();
    }
}
