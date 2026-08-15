/* Página: Skills (.claude/skills/) */
import {
  $,
  el,
  md,
  api,
  CLASSE_PAINEL,
  CLASSE_BOTAO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_VAZIO,
  animarEntrada,
  PODE_ANIMAR,
} from '../.core/util.js';

function montarCartaSkill(skill) {
  const conteudo = el('div', { class: 'flex-1 min-w-0' });
  const acoes = el('div', { class: 'flex gap-2 justify-end mt-3.5' });
  const carta = el(
    'article',
    { class: `${CLASSE_PAINEL} flex flex-col` },
    el('h2', { class: 'font-display text-lg font-semibold mb-1' },
      el('code', { class: 'font-mono text-vekta' }, `/${skill.nome}`)),
    el('p', { class: 'text-sm text-cinza mb-3.5' }, skill.descricao || 'Sem descrição.'),
    conteudo,
    acoes,
  );

  function modoLeitura() {
    conteudo.innerHTML = '';
    acoes.innerHTML = '';
    if (skill.corpo?.trim()) {
      const caixa = el('div', { class: 'markdown max-h-75 overflow-y-auto pr-1.5' });
      caixa.innerHTML = md(skill.corpo);
      conteudo.append(caixa);
    } else {
      conteudo.append(el('p', { class: CLASSE_VAZIO }, 'Ainda sem conteúdo no corpo da skill.'));
    }
    acoes.append(
      el('button', {
        class: 'font-mono text-xs text-cinza-claro self-center mr-auto truncate max-w-[50%]',
        title: skill.caminho,
      }, skill.caminho),
      el('button', { class: CLASSE_BOTAO, onclick: () => void modoEdicao() }, 'Editar'),
    );
  }

  async function modoEdicao() {
    conteudo.innerHTML = '';
    acoes.innerHTML = '';
    conteudo.append(el('p', { class: CLASSE_VAZIO }, 'Carregando…'));

    let texto = skill.conteudo || '';
    try {
      const dados = await api(`/api/skills/${encodeURIComponent(skill.nome)}`);
      texto = dados.conteudo ?? texto;
      skill.conteudo = texto;
      skill.corpo = dados.corpo ?? skill.corpo;
      skill.descricao = dados.descricao || skill.descricao;
    } catch (erro) {
      console.error('Falha ao carregar skill para edição:', erro);
    }

    const editor = el('textarea', {
      class: 'w-full min-h-65 resize-y border border-linha rounded-lg px-3.5 py-3 font-mono text-sm leading-relaxed text-tinta bg-fundo focus:outline-2 focus:-outline-offset-1 focus:outline-vekta',
      spellcheck: 'false',
    });
    editor.value = texto;
    conteudo.replaceChildren(editor);

    const aviso = el('span', { class: 'text-xs text-vekta self-center mr-auto' }, '');
    const botaoSalvar = el('button', {
      class: CLASSE_BOTAO_PRIMARIO,
      onclick: async () => {
        botaoSalvar.disabled = true;
        aviso.textContent = '';
        try {
          const { skill: atualizada } = await api(`/api/skills/${encodeURIComponent(skill.nome)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conteudo: editor.value }),
          });
          Object.assign(skill, atualizada);
          // Atualiza o título/descrição visíveis no card
          const titulo = carta.querySelector('h2 code');
          if (titulo) titulo.textContent = `/${skill.nome}`;
          const desc = carta.querySelector('p.text-sm');
          if (desc) desc.textContent = skill.descricao || 'Sem descrição.';
          modoLeitura();
          document.dispatchEvent(new CustomEvent('vekta-ai:producao-concluida'));
        } catch (erro) {
          aviso.textContent = `Erro ao salvar: ${erro.message}`;
          botaoSalvar.disabled = false;
        }
      },
    }, 'Salvar');

    acoes.append(
      aviso,
      el('button', { class: CLASSE_BOTAO, onclick: modoLeitura }, 'Cancelar'),
      botaoSalvar,
    );
    editor.focus();
  }

  modoLeitura();
  return carta;
}

async function carregarSkills() {
  let skills;
  try {
    ({ itens: skills } = await api('/api/skills'));
  } catch (erro) {
    console.error('Falha ao carregar as skills:', erro);
    return;
  }

  $('#skills-resumo').textContent = skills.length
    ? `${skills.length} skill${skills.length === 1 ? '' : 's'} em .claude/skills/.`
    : '';
  $('#skills-vazio').classList.toggle('hidden', skills.length > 0);

  const grade = $('#skills-grade');
  grade.innerHTML = '';
  grade.append(...skills.map(montarCartaSkill));
  if (PODE_ANIMAR) animarEntrada(grade.children, { translateY: [10, 0], duration: 320, delay: anime.stagger(40) });
}

export const iniciar = carregarSkills;
export const atualizar = carregarSkills;
