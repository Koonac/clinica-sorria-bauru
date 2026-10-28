<?php

namespace App\Models\Crm;

use App\Models\Concerns\BelongsToClinic;
use Illuminate\Database\Eloquent\Model;

/**
 * "Respostas prontas" da clínica: informações oficiais que o agent consulta
 * (endereço, convênios, pagamento, procedimentos...). Horário de funcionamento fica em
 * Configurações › Horário de atendimento (clinics.business_hours), não aqui.
 */
class ClinicKnowledgeEntry extends Model
{
    use BelongsToClinic;

    public const CATEGORIES = ['endereco', 'convenios', 'pagamento', 'procedimentos', 'outros'];

    public const CATEGORY_LABELS = [
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
