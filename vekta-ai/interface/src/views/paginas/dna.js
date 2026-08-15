/* Página: DNA da empresa */
import { $, el, md, api, CLASSE_PAINEL, CLASSE_BOTAO, CLASSE_BOTAO_PRIMARIO, CLASSE_VAZIO } from '../.core/util.js';
import { irParaPagina } from '../.core/roteador.js';

function montarCartaDna(arquivo) {
  const selo = el(
    'span',
    { class: seloClasse(arquivo.preenchido) },
    arquivo.preenchido ? 'preenchido' : 'vazio'
  );

  const conteudo = el('div', { class: 'flex-1' });
  const acoes = el('div', { class: 'flex gap-2 justify-end mt-3.5' });
  const carta = el(
    'article',
    { class: `${CLASSE_PAINEL} flex flex-col` },
    el('div', { class: 'flex items-baseline justify-between gap-3 mb-1' },
      el('h2', { class: 'font-display text-lg font-semibold flex items-center gap-2.5' }, el('code', { class: 'font-mono text-vekta' }, arquivo.nome), selo)),
    el('p', { class: 'text-sm text-cinza mb-3.5' }, arquivo.descricao),
    conteudo,
    acoes
  );

  function seloClasse(preenchido) {
    const base = 'font-mono text-xs uppercase tracking-wider px-2 py-0.5 rounded-full';
    return preenchido ? `${base} bg-vekta-suave text-vekta` : `${base} bg-alerta-suave text-alerta`;
  }

  function modoLeitura() {
    conteudo.innerHTML = '';
    acoes.innerHTML = '';
    if (arquivo.preenchido) {
      const caixa = el('div', { class: 'markdown max-h-75 overflow-y-auto pr-1.5' });
      caixa.innerHTML = md(arquivo.conteudo);
      conteudo.append(caixa);
    } else {
      conteudo.append(el('p', { class: CLASSE_VAZIO }, 'Ainda sem conteúdo.'));
    }
    acoes.append(el('button', { class: CLASSE_BOTAO, onclick: modoEdicao }, arquivo.preenchido ? 'Editar' : 'Escrever'));
  }

  function modoEdicao() {
    conteudo.innerHTML = '';
    acoes.innerHTML = '';
    const editor = el('textarea', {
      class: 'w-full min-h-65 resize-y border border-linha rounded-lg px-3.5 py-3 font-mono text-sm leading-relaxed text-tinta bg-fundo focus:outline-2 focus:-outline-offset-1 focus:outline-vekta',
      spellcheck: 'false',
    });
    editor.value = arquivo.conteudo || '';
    conteudo.append(editor);

    const aviso = el('span', { class: 'text-xs text-vekta self-center mr-auto' }, '');
    const botaoSalvar = el('button', {
      class: CLASSE_BOTAO_PRIMARIO,
      onclick: async () => {
        botaoSalvar.disabled = true;
        try {
          await api(`/api/dna/${arquivo.nome}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conteudo: editor.value }),
          });
          arquivo.conteudo = editor.value;
          arquivo.preenchido = !!editor.value.trim();
          selo.textContent = arquivo.preenchido ? 'preenchido' : 'vazio';
          selo.className = seloClasse(arquivo.preenchido);
          modoLeitura();
          document.dispatchEvent(new CustomEvent('vekta-ai:producao-concluida'));
        } catch (erro) {
          aviso.textContent = `Erro ao salvar: ${erro.message}`;
          botaoSalvar.disabled = false;
        }
      },
    }, 'Salvar');

    acoes.append(aviso, el('button', { class: CLASSE_BOTAO, onclick: modoLeitura }, 'Cancelar'), botaoSalvar);
    editor.focus();
  }

  modoLeitura();
  return carta;
}

async function carregarDna() {
  let dna;
  try {
    dna = await api('/api/dna');
  } catch (erro) {
    console.error('Falha ao carregar o DNA:', erro);
    return;
  }

  const algumPreenchido = dna.arquivos.some((a) => a.preenchido);
  $('#dna-vazio').classList.toggle('hidden', algumPreenchido);
  $('#dna-grade').classList.toggle('hidden', !algumPreenchido && !dna.existe);

  const grade = $('#dna-grade');
  grade.innerHTML = '';
  for (const arquivo of dna.arquivos) grade.append(montarCartaDna(arquivo));

  const fita = $('#logos-fita');
  fita.innerHTML = '';
  $('#contagem-logos').textContent = `${dna.logos.length} logo${dna.logos.length === 1 ? '' : 's'}`;
  if (dna.logos.length === 0) {
    fita.append(el('p', { class: 'text-cinza-claro text-sm' }, 'Nenhum logo salvo ainda.'));
  } else {
    for (const logo of dna.logos) {
      const img = el('img', {
        src: `/raw/${logo.caminho}`, alt: logo.nome, title: logo.nome,
        class: 'h-18 max-w-50 object-contain bg-white border border-linha rounded-lg p-2',
      });
      // xadrez atrás de PNGs transparentes — padrão não tem utilitário Tailwind equivalente
      img.style.backgroundImage = 'conic-gradient(#f4f6f8 90deg, transparent 90deg 180deg, #f4f6f8 180deg 270deg, transparent 270deg)';
      img.style.backgroundSize = '16px 16px';
      fita.append(img);
    }
  }
}

export async function iniciar() {
  $('#botao-instalar').addEventListener('click', async () => {
    await irParaPagina('chat');
    const entrada = $('#chat-entrada');
    entrada.value = '/instalar';
    entrada.focus();
  });
  await carregarDna();
}

export const atualizar = carregarDna;
