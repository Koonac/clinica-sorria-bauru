<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Model;

/**
 * "Respostas prontas" da clínica: informações oficiais que o agent consulta
 * (horários, endereço, convênios, pagamento, procedimentos...).
 */
class ClinicKnowledgeEntry extends Model
{
    use BelongsToClinic;

    public const CATEGORIES = ['horarios', 'endereco', 'convenios', 'pagamento', 'procedimentos', 'outros'];

    public const CATEGORY_LABELS = [
        'horarios' => 'Horários de funcionamento',
        'endereco' => 'Endereço e como chegar',
        'convenios' => 'Convênios aceitos',
        'pagamento' => 'Formas de pagamento',
        'procedimentos' => 'Procedimentos',
        'outros' => 'Outras informações',
    ];

    protected $fillable = [
        'clinic_id',
        'category',
        'title',
        'content',
        'position',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'active' => 'boolean',
        ];
    }
}
