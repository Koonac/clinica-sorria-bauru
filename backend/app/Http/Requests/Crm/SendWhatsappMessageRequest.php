<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SendWhatsappMessageRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'to' => ['required', 'string', 'max:80'],
            'message' => ['sometimes', 'nullable', 'string', 'max:65535'],
            'contact_name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'media' => ['sometimes', 'nullable', 'array'],
            'media.mimetype' => ['required_with:media', 'string', 'max:100'],
            'media.data' => ['required_with:media', 'string'],
            'media.filename' => ['sometimes', 'nullable', 'string', 'max:190'],
            'media.voice' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $message = trim((string) $this->input('message', ''));
            $media = $this->input('media');
            $hasMedia = is_array($media) && filled($media['data'] ?? null);

            if ($message === '' && ! $hasMedia) {
                $validator->errors()->add('message', 'Informe message ou media.');
            }

            if ($hasMedia) {
                $mimetype = strtolower((string) ($media['mimetype'] ?? ''));
                if (! $this->isAllowedMediaMime($mimetype)) {
                    $validator->errors()->add(
                        'media.mimetype',
                        'Apenas imagens, áudios e documentos são suportados.',
                    );
                }

                // ~8MB de arquivo em base64 (~10.7MB string) — alinhado ao limite da whatsapp-api.
                if (strlen((string) $media['data']) > 11_000_000) {
                    $validator->errors()->add('media.data', 'Arquivo muito grande (máx. ~8MB).');
                }
            }
        });
    }

    private function isAllowedMediaMime(string $mimetype): bool
    {
        $mimetype = strtolower(trim(explode(';', $mimetype)[0]));

        if (str_starts_with($mimetype, 'image/') || str_starts_with($mimetype, 'audio/')) {
            return true;
        }

        return in_array($mimetype, [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.oasis.opendocument.text',
            'application/vnd.oasis.opendocument.spreadsheet',
            'application/rtf',
            'application/zip',
            'application/x-zip-compressed',
            'application/octet-stream',
            'text/plain',
            'text/csv',
        ], true);
    }
}
