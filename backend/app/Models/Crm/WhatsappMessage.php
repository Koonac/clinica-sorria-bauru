<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappMessage extends Model
{
    use BelongsToClinic;

    public const DIRECTIONS = ['inbound', 'outbound'];

    protected $fillable = [
        'clinic_id',
        'connection_id',
        'user_id',
        'session_id',
        'whatsapp_jid',
        'whatsapp_lid',
        'phone_number',
        'contact_name',
        'direction',
        'body',
        'message_id',
        'type',
        'has_media',
        'media',
        'lead_id',
        'deal_id',
        'contact_id',
        'whatsapp_campaign_id',
        'whatsapp_campaign_recipient_id',
        'raw',
        'wa_timestamp',
    ];

    protected $appends = ['media_url'];

    protected function casts(): array
    {
        return [
            'has_media' => 'boolean',
            'media' => 'array',
            'raw' => 'array',
            'wa_timestamp' => 'datetime',
        ];
    }

    /**
     * Bytes e caminho em disco nunca saem na API: a mídia é servida pelo
     * endpoint dedicado (`media_url`).
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $array = parent::toArray();

        if (isset($array['media']) && is_array($array['media'])) {
            unset($array['media']['data'], $array['media']['path']);
        }

        return $array;
    }

    public function getMediaUrlAttribute(): ?string
    {
        return $this->mediaPath() !== null
            ? '/v1/crm/whatsapp/messages/'.$this->id.'/media'
            : null;
    }

    public function mediaPath(): ?string
    {
        $path = is_array($this->media) ? ($this->media['path'] ?? null) : null;

        return is_string($path) && $path !== '' ? $path : null;
    }

    public function mediaMimetype(): ?string
    {
        $mime = is_array($this->media) ? ($this->media['mimetype'] ?? null) : null;

        return is_string($mime) && $mime !== '' ? strtolower($mime) : null;
    }

    public function mediaFilename(): ?string
    {
        $name = is_array($this->media) ? ($this->media['filename'] ?? null) : null;

        return is_string($name) && $name !== '' ? $name : null;
    }

    /**
     * `image`, `audio` ou null (demais tipos não são interpretados pela IA).
     */
    public function mediaKind(): ?string
    {
        $mime = (string) $this->mediaMimetype();
        if (str_starts_with($mime, 'image/')) {
            return 'image';
        }
        if (str_starts_with($mime, 'audio/')) {
            return 'audio';
        }

        return match ((string) $this->type) {
            'image', 'sticker' => $mime === '' ? 'image' : null,
            'ptt', 'audio' => $mime === '' ? 'audio' : null,
            default => null,
        };
    }

    /**
     * Placeholder textual usado quando não há corpo nem transcrição/descrição.
     */
    public function mediaPlaceholder(): string
    {
        return match ($this->mediaKind()) {
            'image' => '[imagem]',
            'audio' => '[áudio]',
            default => '[mídia]',
        };
    }

    public function mediaTranscript(): ?string
    {
        $text = is_array($this->media) ? ($this->media['transcript'] ?? null) : null;

        return is_string($text) && trim($text) !== '' ? trim($text) : null;
    }

    public function mediaDescription(): ?string
    {
        $text = is_array($this->media) ? ($this->media['description'] ?? null) : null;

        return is_string($text) && trim($text) !== '' ? trim($text) : null;
    }

    /**
     * Corpo somado à transcrição/descrição da mídia (o modelo do agent é só texto).
     * Vazio quando não há nada de útil para enviar ao LLM.
     */
    public function textForAgent(): string
    {
        $body = trim((string) $this->body);
        $parts = $body !== '' ? [$body] : [];

        $transcript = $this->mediaTranscript();
        if ($transcript !== null && ! str_contains($body, $transcript)) {
            $parts[] = '[áudio] '.$transcript;
        }

        $description = $this->mediaDescription();
        if ($description !== null && ! str_contains($body, $description)) {
            $parts[] = '[imagem] '.$description;
        }

        if ($parts === []) {
            return $this->has_media ? $this->mediaPlaceholder() : '';
        }

        return implode("\n", $parts);
    }

    public function connection(): BelongsTo
    {
        return $this->belongsTo(Connection::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(WhatsappCampaign::class, 'whatsapp_campaign_id');
    }

    public function campaignRecipient(): BelongsTo
    {
        return $this->belongsTo(WhatsappCampaignRecipient::class, 'whatsapp_campaign_recipient_id');
    }
}
