<?php

namespace App\Services\Crm\Knowledge;

use App\Models\Crm\ClinicKnowledgeEntry;
use Illuminate\Support\Facades\Log;

/**
 * Monta o bloco "Informações da clínica" injetado no system prompt do agent
 * (e no gerador de follow-up) a partir das respostas prontas ativas.
 */
class BuildClinicKnowledgePrompt
{
    public const MAX_CHARS = 8000;

    public function handle(): string
    {
        $entries = ClinicKnowledgeEntry::query()
            ->where('active', true)
            ->orderBy('position')
            ->orderBy('id')
            ->get(['id', 'category', 'title', 'content']);

        if ($entries->isEmpty()) {
            return '';
        }

        $byCategory = $entries->groupBy('category');
        $sections = [];
        foreach (ClinicKnowledgeEntry::CATEGORIES as $category) {
            $items = $byCategory->get($category);
            if (! $items || $items->isEmpty()) {
                continue;
            }

            $lines = ['## '.ClinicKnowledgeEntry::CATEGORY_LABELS[$category]];
            foreach ($items as $item) {
                $content = trim((string) $item->content);
                if ($content === '') {
                    continue;
                }
                $title = trim((string) ($item->title ?? ''));
                $lines[] = $title !== '' ? "- {$title}: {$content}" : "- {$content}";
            }
            if (count($lines) > 1) {
                $sections[] = implode("\n", $lines);
            }
        }

        $text = implode("\n\n", $sections);
        if (mb_strlen($text) > self::MAX_CHARS) {
            Log::warning('Base de conhecimento da clínica truncada no prompt do agent.', [
                'chars' => mb_strlen($text),
                'limit' => self::MAX_CHARS,
            ]);
            $text = mb_substr($text, 0, self::MAX_CHARS)."\n[...informações truncadas]";
        }

        return $text;
    }
}
