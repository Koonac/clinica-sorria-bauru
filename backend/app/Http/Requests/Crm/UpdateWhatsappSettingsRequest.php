<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateWhatsappSettingsRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'default_lead_stage_id' => [
                'nullable',
                'integer',
                Rule::exists('pipeline_stages', 'id')->where(fn ($q) => $q->where('kind', 'lead')->where('active', true)),
            ],
        ];
    }
}
