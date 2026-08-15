/* Página: Agents (.claude/agents/) */
import { $, el, api, CLASSE_PAINEL, animarEntrada, PODE_ANIMAR } from '../.core/util.js';
import { visualizarArquivo } from '../.core/modal.js';

function chip(texto, destaque) {
  const base = 'font-mono text-xs px-2 py-0.75 rounded-full';
  return el('span', { class: destaque ? `${base} bg-vekta-suave text-vekta` : `${base} border border-linha text-cinza` }, texto);
}

function montarCartaAgente(agente) {
  const blocos = [
    el('div', { class: 'flex items-baseline justify-between gap-3 mb-1' },
      el('h2', { class: 'font-display text-lg font-semibold' }, agente.nome),
      agente.modelo ? el('span', { class: 'font-mono text-xs uppercase tracking-wider text-cinza-claro shrink-0' }, agente.modelo) : null),
    el('p', { class: 'text-sm text-cinza mb-3.5' }, agente.descricao || 'Sem descrição.'),
  ];

  if (agente.ferramentas.length) {
    blocos.push(el('div', { class: 'flex flex-wrap gap-1.5 mb-2' },
      ...agente.ferramentas.map((ferramenta) => chip(ferramenta, false))));
  }
  if (agente.skills.length) {
    blocos.push(el('div', { class: 'flex flex-wrap gap-1.5 mb-3.5' },
      ...agente.skills.map((skill) => chip(skill, true))));
  }

  blocos.push(el('button', {
    class: 'mt-auto self-start font-mono text-xs text-cinza-claro hover:text-vekta transition-colors truncate max-w-full',
    title: `Ver ${agente.caminho}`,
    onclick: () => visualizarArquivo(agente.caminho),
  }, agente.caminho));

  return el('article', { class: `${CLASSE_PAINEL} flex flex-col` }, ...blocos);
}

async function carregarAgentes() {
  let agentes;
  try {
    ({ itens: agentes } = await api('/api/agentes'));
  } catch (erro) {
    console.error('Falha ao carregar os agents:', erro);
    return;
  }

  $('#agentes-resumo').textContent = agentes.length
    ? `${agentes.length} agent${agentes.length === 1 ? '' : 's'} em .claude/agents/.`
    : '';
  $('#agentes-vazio').classList.toggle('hidden', agentes.length > 0);

  const grade = $('#agentes-grade');
  grade.innerHTML = '';
  grade.append(...agentes.map(montarCartaAgente));
  if (PODE_ANIMAR) animarEntrada(grade.children, { translateY: [10, 0], duration: 320, delay: anime.stagger(40) });
}

export const iniciar = carregarAgentes;
export const atualizar = carregarAgentes;
