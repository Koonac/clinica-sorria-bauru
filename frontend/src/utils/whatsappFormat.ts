/**
 * Formata marcação estilo WhatsApp (*negrito*, _itálico_, *_ambos_*) para HTML seguro.
 */
export function formatWhatsappText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return escaped
    .replace(/\*_([\s\S]+?)_\*/g, '<strong><em>$1</em></strong>')
    .replace(/_\*([\s\S]+?)\*_/g, '<strong><em>$1</em></strong>')
    .replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, '<strong>$1</strong>')
    .replace(/_(?!\s)([^_\n]+?)(?<!\s)_/g, '<em>$1</em>')
}

/** Prefixo de remetente no padrão WhatsApp: negrito + itálico + linha em branco. */
export function whatsappSenderPrefix(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return `*_${trimmed}_*\n\n`
}
