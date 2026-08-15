<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\PipelineStage;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePipelineStageRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'color' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'position' => ['sometimes', 'integer', 'min:1'],
            'status' => ['sometimes', Rule::in(PipelineStage::STATUSES)],
            'is_open' => ['sometimes', 'boolean'],
            'is_in_progress' => ['sometimes', 'boolean'],
            'is_won' => ['sometimes', 'boolean'],
            'is_lost' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
