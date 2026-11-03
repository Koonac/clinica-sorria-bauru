<?php

namespace App\Http\Requests\Crm;

use Illuminate\Foundation\Http\FormRequest;

class DestroyClinicRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isDeveloper() === true;
    }

    public function rules(): array
    {
        return [];
    }
}
