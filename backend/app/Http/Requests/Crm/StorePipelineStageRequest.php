<?php

namespace App\Http\Requests\Crm;

use App\Models\Crm\PipelineStage;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePipelineStageRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(PipelineStage::KINDS)],
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:60'],
            'color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'status' => ['nullable', Rule::in(PipelineStage::STATUSES)],
            'is_open' => ['nullable', 'boolean'],
            'is_in_progress' => ['nullable', 'boolean'],
            'is_won' => ['nullable', 'boolean'],
            'is_lost' => ['nullable', 'boolean'],
        ];
    }
}
