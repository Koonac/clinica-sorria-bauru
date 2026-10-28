<?php

namespace App\Services\Crm\Agent;

use Illuminate\Support\Str;

/**
 * Rede de segurança barata antes do LLM: aponta sinais de dor/urgência, reclamação
 * ou pedido de humano no texto do paciente. Não escala sozinho — vira um alerta no prompt.
 */
class DetectHandoffSignals
{
    /** @var array<string, list<string>> */
    private const PATTERNS = [
        'dor/urgência' => [
            '/\bdor(es)?\b/',
            '/\bdoendo\b/',
            '/\bdoi(do)?\b/',
            '/\bsangr/',
            '/\binchad|\binchaco|\binchou/',
            '/\burgen/',
            '/\bemergen/',
            '/\bdente (quebr|caiu|rach)/',
            '/\bfebre\b/',
            '/\bpus\b|\babscess/',
        ],
        'reclamação' => [
            '/\breclama/',
            '/\babsurdo\b/',
            '/\bdescaso\b/',
            '/\binsatisfeit/',
            '/\bpessimo|\bhorrivel\b/',
            '/\bprocon\b/',
            '/\bcobra(ram|nca) indevid/',
        ],
        'pedido de humano' => [
            '/\batendente\b/',
            '/\bhumano\b/',
            '/\bpessoa (de verdade|real)\b/',
            '/\bfalar com (alguem|a recepcao|uma pessoa|o dentista|a dentista|o doutor|a doutora)\b/',
            '/\bnao (quero|gosto de) (falar com )?(robo|bot)\b/',
            '/\be (um )?(robo|bot)\b\?/',
        ],
    ];

    /**
     * @return list<string> rótulos dos sinais encontrados
     */
    public function handle(string $text): array
    {
        $normalized = mb_strtolower(Str::ascii($text));
        if (trim($normalized) === '') {
            return [];
        }

        $found = [];
        foreach (self::PATTERNS as $label => $patterns) {
            foreach ($patterns as $pattern) {
                if (preg_match($pattern, $normalized) === 1) {
                    $found[] = $label;
                    break;
                }
            }
        }

        return $found;
    }
}
