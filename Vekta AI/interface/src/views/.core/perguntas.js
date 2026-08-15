/* Widgets de pergunta interativa (bloco ```vekta-pergunta).
   Usado pelo chat principal e pelo chat designer da Galeria. */
import { el, CLASSE_BOTAO_PRIMARIO, animarEntrada } from './util.js';

const RE_PERGUNTA = /```vekta-pergunta\s*\n([\s\S]*?)```/g;

/** Separa o texto exibível dos blocos de pergunta. JSON incompleto (streaming) some do texto até fechar. */
export function analisarPerguntas(texto) {
  const perguntas = [];
  const limpo = String(texto || '').replace(RE_PERGUNTA, (_, corpo) => {
    try {
      const p = JSON.parse(corpo.trim());
      const opcoes = (p.opcoes || [])
        .map((o) => (typeof o === 'string' ? { rotulo: o } : o))
        .filter((o) => o && typeof o.rotulo === 'string' && o.rotulo.trim());
      if (p.pergunta && opcoes.length) {
        perguntas.push({ pergunta: String(p.pergunta), multipla: !!p.multipla, opcoes });
      }
    } catch { /* bloco incompleto durante o streaming */ }
    return '';
  });
  return { limpo: limpo.trim(), perguntas };
}

/** Remove fence aberto de pergunta ainda em streaming (não deixa JSON cru na tela). */
export function ocultarPerguntaEmStreaming(texto) {
  return String(texto || '').replace(/```vekta-pergunta[\s\S]*$/, '').trimEnd();
}

/**
 * Monta o card de pergunta com opções clicáveis.
 * @param {object} p — { pergunta, multipla, opcoes: [{ rotulo, descricao? }] }
 * @param {{ onResponder: (texto: string) => void, estaOcupado?: () => boolean }} opts
 */
export function montarPergunta(p, { onResponder, estaOcupado = () => false } = {}) {
  const selecionadas = new Set();
  const widget = el('div', {
    class: 'chat-pergunta w-full max-w-[min(100%,28rem)] flex flex-col gap-3',
    role: 'group',
    'aria-label': p.pergunta,
  });

  widget.append(
    el('div', { class: 'chat-pergunta-cabecalho flex items-center gap-2' },
      el('span', { class: 'chat-pergunta-badge inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0' },
        el('iconify-icon', { noobserver: '', icon: 'lucide:circle-help', class: 'text-[16px]', 'aria-hidden': 'true' })),
      el('span', { class: 'font-mono text-[11px] uppercase tracking-widest text-vekta' },
        p.multipla ? 'Escolha uma ou mais' : 'Escolha uma opção')),
    el('p', { class: 'chat-pergunta-titulo font-display text-base font-semibold tracking-tight text-tinta leading-snug' }, p.pergunta)
  );

  const lista = el('div', { class: 'chat-pergunta-opcoes flex flex-col gap-2' });
  let enviarMulti = null;
  let indice = 0;

  for (const op of p.opcoes) {
    indice += 1;
    const n = String(indice);
    const btn = el('button', {
      type: 'button',
      class: 'chat-pergunta-opcao group flex items-start gap-3 w-full text-left px-3.5 py-3 rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta disabled:cursor-default',
      onclick: () => {
        if (estaOcupado() || widget.hasAttribute('data-respondido')) return;
        if (p.multipla) {
          const ligado = btn.toggleAttribute('data-sel');
          if (ligado) selecionadas.add(op.rotulo); else selecionadas.delete(op.rotulo);
          if (enviarMulti) enviarMulti.disabled = selecionadas.size === 0;
        } else {
          responder(widget, op.rotulo, onResponder, estaOcupado);
        }
      },
    },
      el('span', { class: 'chat-pergunta-indice shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md font-mono text-[11px] font-medium' }, n),
      el('span', { class: 'min-w-0 flex-1' },
        el('span', { class: 'block font-medium text-sm text-tinta' }, op.rotulo),
        op.descricao ? el('span', { class: 'block text-xs text-cinza mt-0.5 leading-snug' }, op.descricao) : null),
      el('iconify-icon', {
        noobserver: '',
        icon: p.multipla ? 'lucide:square' : 'lucide:circle',
        class: 'chat-pergunta-check shrink-0 mt-0.5 text-[16px] text-cinza-claro',
        'aria-hidden': 'true',
      }));
    lista.append(btn);
  }
  widget.append(lista);

  if (p.multipla) {
    enviarMulti = el('button', {
      type: 'button',
      disabled: 'true',
      class: `${CLASSE_BOTAO_PRIMARIO} self-start mt-0.5`,
      onclick: () => {
        if (selecionadas.size) responder(widget, [...selecionadas].join(', '), onResponder, estaOcupado);
      },
    }, 'Confirmar seleção');
    widget.append(enviarMulti);
  }

  animarEntrada([widget], { translateY: [8, 0], duration: 280, delay: 0 });
  return widget;
}

function responder(widget, texto, onResponder, estaOcupado) {
  if (estaOcupado() || widget.hasAttribute('data-respondido')) return;
  widget.setAttribute('data-respondido', '');

  const botoes = [...widget.querySelectorAll('.chat-pergunta-opcao')];
  for (const b of botoes) {
    b.disabled = true;
    const rotulo = b.querySelector('.font-medium')?.textContent || '';
    const escolhida = texto.split(', ').includes(rotulo) || texto === rotulo;
    if (escolhida) {
      b.setAttribute('data-escolhida', '');
      const icone = b.querySelector('.chat-pergunta-check');
      if (icone) icone.setAttribute('icon', 'lucide:check');
    } else {
      b.setAttribute('data-nao-escolhida', '');
    }
  }
  widget.querySelectorAll('button').forEach((b) => { b.disabled = true; });

  const conf = el('p', { class: 'chat-pergunta-confirmada flex items-center gap-1.5 text-xs text-vekta font-medium' },
    el('iconify-icon', { noobserver: '', icon: 'lucide:check-check', class: 'text-[14px]', 'aria-hidden': 'true' }),
    'Resposta enviada');
  widget.append(conf);

  onResponder?.(texto);
}

/** Anexa os cards de pergunta ao container (filho do turno do assistente). */
export function anexarPerguntas(container, perguntas, opts) {
  if (!perguntas?.length) return;
  const bloco = el('div', { class: 'chat-perguntas flex flex-col gap-3 w-full mt-1' });
  for (const p of perguntas) bloco.append(montarPergunta(p, opts));
  container.append(bloco);
}
