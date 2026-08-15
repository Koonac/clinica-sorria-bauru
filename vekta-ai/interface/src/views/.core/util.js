/* Utilitários compartilhados entre a casca (app.js) e as páginas. */

export const $ = (seletor) => document.querySelector(seletor);

marked.setOptions({ breaks: true, gfm: true });
export const md = (texto) => marked.parse(texto || "");

export const EXTENSOES_TEXTO = new Set([
  ".md",
  ".txt",
  ".html",
  ".css",
  ".js",
  ".json",
  ".csv",
  ".xml",
  ".svg",
]);
export const EXTENSOES_IMAGEM = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);
export const EXTENSOES_VIDEO = new Set([".mp4", ".webm", ".mov"]);

// ==========================================================
// Classes Tailwind reaproveitadas nos elementos montados via JS
// (mantidas como constantes só para não repetir a string toda vez)
// ==========================================================
export const CLASSE_PAINEL =
  "bg-superficie border border-linha rounded-2xl px-5.5 py-5 shadow-sm";
export const CLASSE_BOTAO =
  "inline-flex items-center gap-2 px-4 py-2 border border-linha rounded-full bg-superficie text-sm font-medium text-tinta transition-colors hover:border-cinza-claro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta disabled:opacity-45 disabled:cursor-default";
export const CLASSE_BOTAO_PRIMARIO =
  "inline-flex items-center gap-2 px-4 py-2 rounded-full bg-vekta border border-vekta text-white text-sm font-medium transition-colors hover:bg-vekta-escuro hover:border-vekta-escuro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta disabled:opacity-45 disabled:cursor-default";
export const CLASSE_VAZIO = "text-cinza-claro text-sm pt-2.5 pb-1";

// ==========================================================
// Animações (anime.js) — desligadas se o usuário prefere menos movimento
// ==========================================================
export const PODE_ANIMAR =
  typeof anime !== "undefined" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function animarEntrada(alvos, opcoes = {}) {
  if (!PODE_ANIMAR || !alvos || alvos.length === 0) return;
  anime.remove(alvos);
  anime({
    targets: alvos,
    opacity: [0, 1],
    translateY: [14, 0],
    duration: 420,
    delay: anime.stagger(60),
    easing: "easeOutCubic",
    ...opcoes,
  });
}

export async function api(caminho, opcoes) {
  const resposta = await fetch(caminho, opcoes);
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro || corpo.message || `Erro ${resposta.status}`);
  return corpo;
}

export function extensaoDe(caminho) {
  const i = caminho.lastIndexOf(".");
  return i >= 0 ? caminho.slice(i).toLowerCase() : "";
}

export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === "class") no.className = valor;
    else if (chave.startsWith("on")) no.addEventListener(chave.slice(2), valor);
    // value/checked precisam da propriedade DOM — setAttribute não preenche textarea/input
    else if (chave === "value") no.value = valor ?? "";
    else if (chave === "checked" || chave === "selected") no[chave] = Boolean(valor);
    else if (valor != null) no.setAttribute(chave, valor);
  }
  for (const filho of filhos) {
    if (filho == null) continue;
    no.append(filho.nodeType ? filho : document.createTextNode(filho));
  }
  return no;
}
