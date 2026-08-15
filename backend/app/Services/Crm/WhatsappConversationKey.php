<?php

namespace App\Services\Crm;

/**
 * Mesma regra do SQL em WhatsappController::chats (conversation_key).
 */
class WhatsappConversationKey
{
    public function fromMessageFields(?string $phoneNumber, ?string $whatsappJid, ?string $whatsappLid): string
    {
        $jid = (string) ($whatsappJid ?? '');
        $lid = filled($whatsappLid) ? (string) $whatsappLid : '';
        $phone = filled($phoneNumber) ? preg_replace('/\D+/', '', (string) $phoneNumber) : '';

        if (
            $phone !== ''
            && strlen($phone) >= 10
            && ! (
                str_ends_with($jid, '@lid')
                && preg_replace('/\D+/', '', explode('@', $jid, 2)[0]) === $phone
            )
        ) {
            return $phone;
        }

        if ($lid !== '') {
            return $lid;
        }

        if (str_ends_with($jid, '@lid')) {
            return $jid;
        }

        return $jid;
    }

    /**
     * Expressão SQL (PostgreSQL) alinhada a fromMessageFields.
     */
    public function sqlExpression(): string
    {
        return <<<'SQL'
CASE
    WHEN phone_number IS NOT NULL
      AND phone_number <> ''
      AND length(regexp_replace(phone_number, '\D', '', 'g')) >= 10
      AND NOT (
          whatsapp_jid LIKE '%@lid'
          AND regexp_replace(phone_number, '\D', '', 'g')
              = split_part(whatsapp_jid, '@', 1)
      )
    THEN regexp_replace(phone_number, '\D', '', 'g')
    ELSE COALESCE(
        NULLIF(whatsapp_lid, ''),
        CASE WHEN whatsapp_jid LIKE '%@lid' THEN whatsapp_jid END,
        whatsapp_jid
    )
END
SQL;
    }
}
