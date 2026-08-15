/* Modal global de Configurações: DNA, Agents, Skills e seções do CRM.
   Aberto pela engrenagem da sidebar. */
import { $, el } from './util.js';
import { haSelectAberto } from '../componentes/select.js';

/** @type {{
 *   montar: (nome: string) => Promise<unknown>,
 *   obterModulo: (nome: string) => Record<string, unknown> | undefined,
 * } | null} */
let deps = null;

/** @type {Array<{ id: string, tipo: 'pagina' | 'crm', titulo: string, icone: string, grupo?: string }>} */
let secoes = [];

let aberto = false;
let secaoAtiva = null;
/** @type {HTMLElement | null} */
let abaAlojada = null;

function onEsc(e) {
  if (e.key !== 'Escape') return;
  // Dropdown aberto consome o Esc: fecha só ele, não o modal por baixo.
  if (haSelectAberto()) return;
  fecharConfiguracoes();
}

function devolverAba() {
  if (!abaAlojada) return;
  const hostPaginas = $('#paginas');
  abaAlojada.classList.add('hidden');
  abaAlojada.classList.remove('config-modal-pagina');
  hostPaginas?.appendChild(abaAlojada);
  abaAlojada = null;
}

async function encerrarCrm() {
  const crm = deps?.obterModulo('crm');
  if (typeof crm?.encerrarConfig === 'function') crm.encerrarConfig();
}

/**
 * @param {{
 *   montar: (nome: string) => Promise<unknown>,
 *   obterModulo: (nome: string) => Record<string, unknown> | undefined,
 * }} opcoes
 */
export function iniciarConfiguracoes(opcoes) {
  deps = opcoes;
  const botao = $('#botao-config');
  botao?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (aberto) fecharConfiguracoes();
    else abrirConfiguracoes().catch(console.error);
  });
}

/**
 * Atualiza a lista de seções (páginas grupo config + CRM se existir).
 * @param {Array<{ nome: string, titulo: string, icone: string, grupo: string }>} paginas
 */
export function definirSecoesConfig(paginas) {
  const configs = paginas
    .filter((p) => p.grupo === 'config')
    .map((p) => ({
      id: p.nome,
      tipo: /** @type {'pagina'} */ ('pagina'),
      titulo: p.titulo,
      icone: p.icone,
    }));

  const temCrm = paginas.some((p) => p.nome === 'crm');
  const crmSecoes = temCrm
    ? [
        { id: 'crm-geral', tipo: /** @type {'crm'} */ ('crm'), titulo: 'Geral', icone: 'lucide:sliders-horizontal', grupo: 'CRM' },
        { id: 'crm-whatsapp', tipo: /** @type {'crm'} */ ('crm'), titulo: 'WhatsApp', icone: 'lucide:message-circle', grupo: 'CRM' },
      ]
    : [];

  // CRM (Geral / WhatsApp / Agents), depois DNA / Agents / Skills.
  secoes = [...crmSecoes, ...configs];

  const botao = $('#botao-config');
  botao?.classList.toggle('hidden', secoes.length === 0);
}

export function fecharConfiguracoes() {
  if (!aberto) return;
  aberto = false;
  devolverAba();
  encerrarCrm();
  $('#config-modal')?.remove();
  document.removeEventListener('keydown', onEsc, true);
  const botao = $('#botao-config');
  botao?.removeAttribute('data-aberto');
  botao?.setAttribute('aria-expanded', 'false');
}

/**
 * @param {string} [secaoInicial] id da seção (dna | agentes | skills | crm-geral | crm-whatsapp)
 */
export async function abrirConfiguracoes(secaoInicial) {
  if (!deps) return;
  if (aberto) fecharConfiguracoes();

  const inicial = secoes.find((s) => s.id === secaoInicial)?.id
    || secoes[0]?.id;
  if (!inicial) return;

  aberto = true;
  secaoAtiva = inicial;

  const botao = $('#botao-config');
  botao?.toggleAttribute('data-aberto', true);
  botao?.setAttribute('aria-expanded', 'true');

  const nav = el('nav', {
    id: 'config-modal-nav',
    class: 'w-full sm:w-56 shrink-0 space-y-1 p-3 sm:p-4 border-b sm:border-b-0 sm:border-r border-linha overflow-y-auto',
    'aria-label': 'Seções de configuração',
  });

  const conteudo = el('div', {
    id: 'config-modal-conteudo',
    class: 'flex-1 min-w-0 min-h-0 overflow-y-auto',
  });

  const layout = el(
    'div',
    {
      class: 'bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-[min(1100px,96vw)] h-[min(90vh,900px)] flex flex-col overflow-hidden',
      onclick: (e) => e.stopPropagation(),
    },
    el(
      'div',
      { class: 'shrink-0 flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-linha' },
      el(
        'div',
        { class: 'min-w-0' },
        el('p', { class: 'font-mono text-[11px] uppercase tracking-wider text-vekta mb-1' }, 'sistema'),
        el('h2', { id: 'config-modal-titulo', class: 'font-display text-xl font-semibold tracking-tight' }, 'Configurações'),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'inline-flex items-center justify-center w-8 h-8 rounded-full text-cinza hover:bg-fundo hover:text-tinta',
          'aria-label': 'Fechar',
          onclick: fecharConfiguracoes,
        },
        el('iconify-icon', { noobserver: '', icon: 'lucide:x', class: 'text-lg' }),
      ),
    ),
    el('div', { class: 'flex-1 min-h-0 flex flex-col sm:flex-row' }, nav, conteudo),
  );

  document.body.append(
    el(
      'div',
      {
        id: 'config-modal',
        class: 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'config-modal-titulo',
        onclick: fecharConfiguracoes,
      },
      layout,
    ),
  );
  document.addEventListener('keydown', onEsc, true);

  renderNav(nav);
  await mostrarSecao(inicial);
}

function renderNav(nav) {
  const filhos = [];
  let ultimoGrupo = null;

  for (const secao of secoes) {
    if (secao.grupo && secao.grupo !== ultimoGrupo) {
      ultimoGrupo = secao.grupo;
      filhos.push(
        el('p', {
          class: 'font-mono text-[10px] uppercase tracking-[0.18em] text-cinza px-3 pt-3 pb-1',
        }, secao.grupo),
      );
    }

    const ativo = secao.id === secaoAtiva;
    const btn = el(
      'button',
      {
        type: 'button',
        'data-config-secao': secao.id,
        class: classeNavItem(ativo),
      },
      el('iconify-icon', {
        noobserver: '',
        icon: secao.icone,
        class: 'text-[18px] shrink-0',
        'aria-hidden': 'true',
      }),
      el('span', { class: 'truncate' }, secao.titulo),
    );
    btn.addEventListener('click', () => {
      mostrarSecao(secao.id).catch(console.error);
    });
    filhos.push(btn);
  }

  nav.replaceChildren(...filhos);
}

function classeNavItem(ativo) {
  return `w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
    ativo ? 'bg-vekta text-white' : 'text-tinta hover:bg-fundo'
  }`;
}

function destacarNav() {
  const nav = $('#config-modal-nav');
  if (!nav) return;
  nav.querySelectorAll('[data-config-secao]').forEach((btn) => {
    const ativo = btn.getAttribute('data-config-secao') === secaoAtiva;
    btn.className = classeNavItem(ativo);
  });
}

async function mostrarSecao(id) {
  const secao = secoes.find((s) => s.id === id);
  const conteudo = $('#config-modal-conteudo');
  if (!secao || !conteudo || !deps) return;

  secaoAtiva = id;
  destacarNav();

  if (secao.tipo === 'pagina') {
    await encerrarCrm();
    await alojarPagina(secao.id, conteudo);
    return;
  }

  // CRM
  devolverAba();
  conteudo.classList.add('p-5', 'sm:p-6');
  conteudo.replaceChildren(
    el('div', { class: 'animate-pulse space-y-4 max-w-xl' },
      el('div', { class: 'h-5 w-40 rounded bg-linha' }),
      el('div', { class: 'h-10 w-full rounded-xl bg-linha' }),
    ),
  );

  await deps.montar('crm');
  const crm = deps.obterModulo('crm');
  const sub = id === 'crm-whatsapp' ? 'whatsapp' : 'geral';
  if (typeof crm?.renderizarSecaoConfig === 'function') {
    await crm.renderizarSecaoConfig(sub, conteudo);
  }
}

/**
 * @param {string} nome
 * @param {HTMLElement} conteudo
 */
async function alojarPagina(nome, conteudo) {
  devolverAba();
  conteudo.classList.remove('p-5', 'sm:p-6');
  conteudo.replaceChildren();

  await deps.montar(nome);
  const aba = $(`#aba-${nome}`);
  if (!aba) {
    conteudo.replaceChildren(
      el('p', { class: 'p-6 text-sm text-cinza' }, 'Não foi possível carregar esta seção.'),
    );
    return;
  }

  aba.classList.remove('hidden');
  aba.classList.add('config-modal-pagina');
  conteudo.appendChild(aba);
  abaAlojada = aba;

  const mod = deps.obterModulo(nome);
  if (typeof mod?.atualizar === 'function') await mod.atualizar();
}
