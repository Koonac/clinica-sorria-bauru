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
                if (! str_starts_with($mimetype, 'image/')) {
                    $validator->errors()->add('media.mimetype', 'Apenas imagens são suportadas (image/*).');
                }

                // ~8MB de arquivo em base64 (~10.7MB string) — alinhado ao limite da whatsapp-api.
                if (strlen((string) $media['data']) > 11_000_000) {
                    $validator->errors()->add('media.data', 'Imagem muito grande (máx. ~8MB).');
                }
            }
        });
    }
}
