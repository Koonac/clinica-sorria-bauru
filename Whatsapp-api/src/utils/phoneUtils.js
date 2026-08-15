/**
 * Utilitários para formatação de números de telefone
 */

/**
 * Extrai só dígitos de um telefone/JID.
 * @param {string} value
 * @returns {string}
 */
function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Normaliza número BR para E.164 sem +: adiciona 55 quando falta DDI.
 * Aceita 10–11 dígitos (DDD+número) ou já com 55.
 * @param {string} number
 * @returns {string}
 */
function normalizeBrazilianDigits(number) {
  let digits = digitsOnly(number);
  if (!digits) return "";

  // Já com DDI Brasil
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }

  // Celular/fixo com DDD (10 ou 11 dígitos) sem DDI
  if (digits.length === 10 || digits.length === 11) {
    return "55" + digits;
  }

  return digits;
}

/**
 * Formata um número de telefone para o formato do WhatsApp
 * @param {string} number - Número de telefone a ser formatado
 * @returns {string} Número formatado com @c.us
 */
function formatPhoneNumber(number) {
  const raw = String(number || "").trim();
  if (raw.includes("@")) {
    const server = getJidServer(raw);
    if (server === "lid") {
      return raw;
    }
    const digits = normalizeBrazilianDigits(raw.split("@")[0]);
    return digits ? `${digits}@c.us` : raw;
  }

  const digits = normalizeBrazilianDigits(raw);
  if (!digits) return "@c.us";
  return digits + "@c.us";
}

/**
 * Remove sufixo de JID do WhatsApp (@c.us, @s.whatsapp.net, etc.)
 * @param {string} jid - Identificador WhatsApp
 * @returns {string} Número ou identificador sem sufixo
 */
function extractPhoneFromJid(jid) {
  if (!jid) return "";
  return jid.split("@")[0];
}

/**
 * Extrai o server de um JID (@c.us, @lid, @g.us, ...)
 * @param {string} jid
 * @returns {string}
 */
function getJidServer(jid) {
  if (!jid || typeof jid !== "string") return "";
  const parts = jid.split("@");
  return parts.length > 1 ? parts[1] : "";
}

/**
 * Indica se o JID é baseado em telefone (não LID).
 * @param {string} jid
 * @returns {boolean}
 */
function isPhoneJid(jid) {
  const server = getJidServer(jid);
  return server === "c.us" || server === "s.whatsapp.net";
}

/**
 * True se o JID é de grupo WhatsApp.
 * @param {string|null|undefined} jid
 * @returns {boolean}
 */
function isGroupJid(jid) {
  return getJidServer(jid) === "g.us";
}

/**
 * True se o JID é lista de transmissão, status ou newsletter.
 * @param {string|null|undefined} jid
 * @returns {boolean}
 */
function isBroadcastJid(jid) {
  const server = getJidServer(jid);
  return server === "broadcast" || server === "newsletter";
}

/**
 * Resolve o número de telefone a partir do Contact do wwebjs.
 * contact.number pode ser o LID interno (userid) mesmo quando o id é @c.us.
 * @param {{ id?: { user?: string, server?: string, _serialized?: string }, number?: string }} contact
 * @param {string|null} fallbackJid
 * @returns {string}
 */
function resolvePhoneFromContact(contact, fallbackJid = null) {
  const jid = contact?.id?._serialized || fallbackJid || "";
  const server = contact?.id?.server || getJidServer(jid);

  if (server === "c.us" || server === "s.whatsapp.net") {
    return contact?.id?.user || extractPhoneFromJid(jid);
  }

  // JID @lid ou desconhecido: contact.number costuma ser o LID, não o telefone
  if (isPhoneJid(fallbackJid)) {
    return extractPhoneFromJid(fallbackJid);
  }

  return (
    contact?.id?.user ||
    extractPhoneFromJid(jid) ||
    contact?.number ||
    ""
  );
}

/**
 * Indica se o rótulo é só um telefone/JID (não um nome de pessoa).
 * No whatsapp-web.js, contact.name costuma cair no número quando o contato
 * não está na agenda — e isso engole o pushname se usarmos `name || pushname`.
 * @param {string|null|undefined} value
 * @param {string|null|undefined} phoneNumber
 * @returns {boolean}
 */
function isPhoneLikeLabel(value, phoneNumber = null) {
  if (value == null) return true;
  const name = String(value).trim();
  if (!name) return true;

  const nameDigits = name.replace(/\D/g, "");
  const phoneDigits = String(phoneNumber || "").replace(/\D/g, "");

  // Só dígitos / formatação de telefone
  if (/^[\d\s+\-().]+$/.test(name) && nameDigits.length >= 8) {
    return true;
  }

  if (
    nameDigits.length >= 8 &&
    phoneDigits &&
    (nameDigits === phoneDigits ||
      phoneDigits.endsWith(nameDigits) ||
      nameDigits.endsWith(phoneDigits))
  ) {
    return true;
  }

  return false;
}

/**
 * Escolhe o nome de exibição nesta ordem:
 * 1) nome salvo na agenda (contact.name), se não for só o telefone
 * 2) nome padrão do perfil WhatsApp (pushname; fallback notifyName da mensagem)
 * 3) null
 * @param {{ name?: string, pushname?: string }|null|undefined} contact
 * @param {string|null|undefined} phoneNumber
 * @param {string|null|undefined} notifyName
 * @returns {string|null}
 */
function pickContactDisplayName(contact, phoneNumber = null, notifyName = null) {
  const candidates = [
    contact?.name, // 1. contato salvo
    contact?.pushname, // 2. nome padrão do WhatsApp
    notifyName, // 2b. mesmo nome via metadado da mensagem, se pushname vier vazio
  ];

  for (const candidate of candidates) {
    const name = candidate == null ? "" : String(candidate).trim();
    if (!name) continue;
    if (isPhoneLikeLabel(name, phoneNumber)) continue;
    return name;
  }

  return null;
}

module.exports = {
  formatPhoneNumber,
  normalizeBrazilianDigits,
  digitsOnly,
  extractPhoneFromJid,
  getJidServer,
  isPhoneJid,
  isGroupJid,
  isBroadcastJid,
  resolvePhoneFromContact,
  isPhoneLikeLabel,
  pickContactDisplayName,
};
