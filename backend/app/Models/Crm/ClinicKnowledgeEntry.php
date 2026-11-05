<?php

namespace App\Models\Crm;

use App\Models\Clinic;
use App\Models\Concerns\BelongsToClinic;
use App\Support\ClinicContext;
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

    public const CATEGORIES_IMOBILIARIA = ['endereco', 'pagamento', 'outros'];

    public const CATEGORIES_LOJA_ROUPAS = ['endereco', 'pagamento', 'trocas', 'entrega', 'outros'];

    public const CATEGORY_LABELS = [
        'endereco' => 'Endereço e como chegar',
        'convenios' => 'Convênios aceitos',
        'pagamento' => 'Formas de pagamento',
        'procedimentos' => 'Procedimentos',
        'trocas' => 'Trocas e devoluções',
        'entrega' => 'Entrega e frete',
        'outros' => 'Outras informações',
    ];

    /**
     * @return list<string>
     */
    public static function categoriesFor(?Clinic $clinic = null): array
    {
        $clinic ??= app(ClinicContext::class)->clinic();
        $template = $clinic?->resolvedTemplate() ?? Clinic::TEMPLATE_CLINICA;

        return match ($template) {
            Clinic::TEMPLATE_IMOBILIARIA => self::CATEGORIES_IMOBILIARIA,
            Clinic::TEMPLATE_LOJA_ROUPAS => self::CATEGORIES_LOJA_ROUPAS,
            default => self::CATEGORIES,
        };
    }

    /**
     * @return array<string, string>
     */
    public static function labelsFor(?Clinic $clinic = null): array
    {
        return array_intersect_key(self::CATEGORY_LABELS, array_flip(self::categoriesFor($clinic)));
    }

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
