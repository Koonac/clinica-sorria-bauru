<?php

namespace App\Services\Crm;

use InvalidArgumentException;

class ParseCampaignCsv
{
    private const NAME_ALIASES = [
        'nome', 'name', 'full_name', 'fullname', 'full name',
    ];

    private const PHONE_ALIASES = [
        'contato', 'contact', 'phone', 'telefone', 'mobile', 'whatsapp', 'celular',
    ];

    private const NOTES_ALIASES = [
        'anotacoes', 'anotações', 'notes', 'note', 'observacoes', 'observações', 'obs',
    ];

    /**
     * @return list<array{full_name: string, phone: string, notes: string, status: string}>
     */
    public function handle(string $content): array
    {
        $text = ltrim($content, "\xEF\xBB\xBF");
        $lines = preg_split("/\r\n|\n|\r/", $text) ?: [];
        if ($lines === [] || trim($lines[0] ?? '') === '') {
            throw new InvalidArgumentException('CSV must include a contact/phone column (contato, phone, telefone, …).');
        }

        $headers = str_getcsv(array_shift($lines));
        $mapping = $this->mapHeaders($headers);
        if (! isset($mapping['phone'])) {
            throw new InvalidArgumentException('CSV must include a contact/phone column (contato, phone, telefone, …).');
        }

        $recipients = [];
        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }
            $cols = str_getcsv($line);
            $row = [];
            foreach ($headers as $i => $header) {
                $row[$header] = $cols[$i] ?? '';
            }

            $phoneRaw = trim((string) ($row[$mapping['phone']] ?? ''));
            $digits = $this->normalizePhone($phoneRaw);
            if ($digits === null) {
                continue;
            }

            $fullName = '';
            if (isset($mapping['full_name'])) {
                $fullName = trim((string) ($row[$mapping['full_name']] ?? ''));
            }
            $notes = '';
            if (isset($mapping['notes'])) {
                $notes = trim((string) ($row[$mapping['notes']] ?? ''));
            }

            $recipients[] = [
                'full_name' => $fullName,
                'phone' => $digits,
                'notes' => $notes,
                'status' => 'pending',
            ];
        }

        return $recipients;
    }

    /** Normaliza telefone (só dígitos; prefixa 55 em celulares BR 10/11 dígitos). */
    public function normalizePhone(string $phoneRaw): ?string
    {
        $digits = preg_replace('/\D+/', '', trim($phoneRaw)) ?: '';
        if ($digits === '') {
            return null;
        }
        if (! str_starts_with($digits, '55') && in_array(strlen($digits), [10, 11], true)) {
            $digits = '55'.$digits;
        }

        return $digits;
    }

    /**
     * @param  list<string|null>  $fieldnames
     * @return array{full_name?: string, phone?: string, notes?: string}
     */
    private function mapHeaders(array $fieldnames): array
    {
        $mapping = [];
        foreach ($fieldnames as $raw) {
            $normalized = $this->normalizeHeader((string) $raw);
            if (in_array($normalized, self::NAME_ALIASES, true)) {
                $mapping['full_name'] = (string) $raw;
            } elseif (in_array($normalized, self::PHONE_ALIASES, true)) {
                $mapping['phone'] = (string) $raw;
            } elseif (in_array($normalized, self::NOTES_ALIASES, true)) {
                $mapping['notes'] = (string) $raw;
            }
        }

        return $mapping;
    }

    private function normalizeHeader(string $header): string
    {
        return preg_replace('/\s+/', ' ', trim(mb_strtolower($header))) ?: '';
    }
}
