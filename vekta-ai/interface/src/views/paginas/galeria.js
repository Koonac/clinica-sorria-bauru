/* Página: Galeria de mídia + chat exclusivo do designer (canal "galeria"). */
import { $, el, api, md, PODE_ANIMAR, animarEntrada, CLASSE_BOTAO } from '../.core/util.js';
import { visualizarArquivo } from '../.core/modal.js';
import { socket } from '../.core/socket.js';
import { analisarPerguntas, ocultarPerguntaEmStreaming, anexarPerguntas } from '../.core/perguntas.js';
import { analisarArquivos, ocultarArquivoEmStreaming, anexarArquivos } from '../.core/arquivos.js';

function analisarWidgets(texto) {
  const { limpo: semArquivos, arquivos } = analisarArquivos(texto);
  const { limpo, perguntas } = analisarPerguntas(semArquivos);
  return { limpo, arquivos, perguntas };
}

function ocultarWidgetsEmStreaming(texto) {
  return ocultarPerguntaEmStreaming(ocultarArquivoEmStreaming(texto));
}

const TAMANHO_LOTE = 40;
const CANAL = 'galeria';
const TIPOS_IMAGEM = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TAMANHO_MAX = 5 * 1024 * 1024;
const MAX_ANEXOS = 5;
const LONG_PRESS_MS = 450;

let itensDeMidia = [];
let filtroTipo = 'todas';
let pastaAberta = null;
let filaRenderizacao = [];
let indiceRenderizado = 0;
let observadorLote = null;
let chatPronto = false;
/** @type {Set<string>} caminhos de arquivo selecionados */
const selecionados = new Set();

function filtroClasse(ativo) {
  const base = 'px-3.5 py-1.25 rounded-full text-sm transition-colors';
  return ativo ? `${base} bg-vekta border border-vekta text-white` : `${base} border border-linha bg-superficie text-cinza hover:border-cinza-claro hover:text-tinta`;
}

function modoSelecaoAtivo() {
  return selecionados.size > 0;
}

function aplicarModoSelecaoNaUi() {
  $('#aba-galeria')?.classList.toggle('is-modo-selecao', modoSelecaoAtivo());
}

function caminhosDaPasta(categoria) {
  const prefixo = `${categoria}/`;
  return itensDeMidia
    .filter((item) => filtroTipo === 'todas' || item.tipo === filtroTipo)
    .filter((item) => item.caminho.startsWith(prefixo))
    .map((item) => item.caminho);
}

function pastaEstaSelecionada(categoria) {
  const caminhos = caminhosDaPasta(categoria);
  return caminhos.length > 0 && caminhos.every((c) => selecionados.has(c));
}

function atualizarCheckVisual(card, ligado) {
  if (!card) return;
  card.classList.toggle('is-selected', ligado);
  const chk = card.querySelector('.galeria-card__check');
  if (!chk) return;
  chk.setAttribute('aria-pressed', ligado ? 'true' : 'false');
  chk.classList.toggle('is-on', ligado);
  chk.title = ligado ? 'Remover da seleção' : 'Selecionar';
  chk.setAttribute('aria-label', ligado ? 'Remover da seleção' : 'Selecionar');
  const icone = chk.querySelector('iconify-icon');
  if (icone) icone.setAttribute('icon', ligado ? 'lucide:check' : 'lucide:circle');
}

function sincronizarVisualSelecao() {
  for (const card of document.querySelectorAll('#galeria-grade .galeria-card[data-caminho]')) {
    atualizarCheckVisual(card, selecionados.has(card.getAttribute('data-caminho')));
  }
  for (const card of document.querySelectorAll('#galeria-grade .galeria-card[data-pasta]')) {
    const pasta = card.getAttribute('data-pasta');
    atualizarCheckVisual(card, pastaEstaSelecionada(pasta));
  }
  aplicarModoSelecaoNaUi();
  atualizarBarraExclusao();
}

function definirSelecaoArquivo(caminho, ligado) {
  if (ligado) selecionados.add(caminho);
  else selecionados.delete(caminho);
}

function alternarSelecao(caminho) {
  definirSelecaoArquivo(caminho, !selecionados.has(caminho));
  sincronizarVisualSelecao();
}

function alternarPasta(categoria) {
  const caminhos = caminhosDaPasta(categoria);
  if (!caminhos.length) return;
  const ligar = !pastaEstaSelecionada(categoria);
  for (const c of caminhos) definirSelecaoArquivo(c, ligar);
  sincronizarVisualSelecao();
}

function limparSelecao() {
  selecionados.clear();
  sincronizarVisualSelecao();
}

/**
 * Clique curto vs segurar: long-press seleciona e entra no modo;
 * no modo seleção o clique curto marca/desmarca.
 */
function ligarInteracaoSelecao(alvo, { onAbrir, onSegurar, onCliqueModo }) {
  let timer = null;
  let longDone = false;
  let startX = 0;
  let startY = 0;

  const limparTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  alvo.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest?.('.galeria-card__check')) return;
    longDone = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      longDone = true;
      timer = null;
      onSegurar();
      try {
        alvo.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }, LONG_PRESS_MS);
  });

  alvo.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) limparTimer();
  });

  const fim = (e) => {
    const eraLong = longDone;
    limparTimer();
    if (eraLong) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.type === 'pointercancel') return;
    if (e.target.closest?.('.galeria-card__check')) return;
    if (modoSelecaoAtivo()) {
      e.preventDefault();
      onCliqueModo();
      return;
    }
    onAbrir();
  };

  alvo.addEventListener('pointerup', fim);
  alvo.addEventListener('pointercancel', () => {
    limparTimer();
    longDone = false;
  });
  alvo.addEventListener('contextmenu', (e) => {
    if (longDone || modoSelecaoAtivo()) e.preventDefault();
  });
}

function selecionarPasta(categoria) {
  const caminhos = caminhosDaPasta(categoria);
  if (!caminhos.length) return;
  for (const c of caminhos) definirSelecaoArquivo(c, true);
  sincronizarVisualSelecao();
}

function montarBotaoCheck({ selecionado, onClick }) {
  return el(
    'button',
    {
      type: 'button',
      class: `galeria-card__check${selecionado ? ' is-on' : ''}`,
      title: selecionado ? 'Remover da seleção' : 'Selecionar',
      'aria-label': selecionado ? 'Remover da seleção' : 'Selecionar',
      'aria-pressed': selecionado ? 'true' : 'false',
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      },
    },
    el('iconify-icon', {
      noobserver: '',
      icon: selecionado ? 'lucide:check' : 'lucide:circle',
      class: 'text-[14px]',
      'aria-hidden': 'true',
    }),
  );
}

function montarCartaoPasta(tarefa) {
  const selecionado = pastaEstaSelecionada(tarefa.categoria);
  const card = el(
    'div',
    {
      class: `galeria-card galeria-card--pasta group relative flex flex-col items-center justify-center gap-2 border border-linha rounded-lg bg-superficie p-4 aspect-square transition-[transform,box-shadow] hover:-translate-y-0.75 hover:shadow-md${selecionado ? ' is-selected' : ''}`,
      'data-pasta': tarefa.categoria,
      title: tarefa.categoria,
    },
    montarBotaoCheck({
      selecionado,
      onClick: () => alternarPasta(tarefa.categoria),
    }),
    el('iconify-icon', { noobserver: '', icon: 'lucide:folder', class: 'text-vekta text-3xl pointer-events-none', 'aria-hidden': 'true' }),
    el('span', { class: 'font-mono text-xs text-tinta text-center break-all line-clamp-2 pointer-events-none' }, tarefa.categoria.split('/').pop()),
    el('span', { class: 'font-mono text-xs text-cinza-claro pointer-events-none' }, `${tarefa.quantidade} ${tarefa.quantidade === 1 ? 'item' : 'itens'}`),
  );

  ligarInteracaoSelecao(card, {
    onAbrir: () => abrirPasta(tarefa.categoria),
    onSegurar: () => selecionarPasta(tarefa.categoria),
    onCliqueModo: () => selecionarPasta(tarefa.categoria),
  });

  return card;
}

function atualizarBarraExclusao() {
  const barra = $('#galeria-acoes');
  if (!barra) return;
  const n = selecionados.size;
  barra.innerHTML = '';
  if (n === 0) {
    barra.classList.add('hidden');
    barra.classList.remove('flex');
    return;
  }
  barra.classList.remove('hidden');
  barra.classList.add('flex');

  barra.append(
    el('span', { class: 'text-sm text-cinza' }, `${n} selecionado${n === 1 ? '' : 's'}`),
    el(
      'button',
      {
        type: 'button',
        class: CLASSE_BOTAO,
        onclick: limparSelecao,
      },
      'Limpar',
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'btn-excluir',
        onclick: () => excluirSelecionados().catch(console.error),
      },
      el('iconify-icon', { noobserver: '', icon: 'lucide:trash-2', class: 'text-[14px]', 'aria-hidden': 'true' }),
      `Excluir (${n})`,
    ),
  );
}

async function excluirSelecionados() {
  const lista = [...selecionados];
  if (!lista.length) return;
  const rotulo = lista.length === 1 ? 'este arquivo' : `estes ${lista.length} arquivos`;
  if (!confirm(`Excluir ${rotulo}? Esta ação não pode ser desfeita.`)) return;

  const resultados = await Promise.allSettled(
    lista.map((caminho) =>
      api(`/api/arquivo?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' }),
    ),
  );
  const falhas = resultados.filter((r) => r.status === 'rejected');
  selecionados.clear();
  aplicarModoSelecaoNaUi();
  await carregarGaleria();
  if (falhas.length) {
    alert(`${falhas.length} arquivo${falhas.length === 1 ? '' : 's'} não puderam ser excluídos.`);
  }
}

function montarCartaoItem(item) {
  const src = `/raw/${item.caminho.split('/').map(encodeURIComponent).join('/')}?t=${item.modificado || 0}`;
  const miniatura = item.tipo === 'video'
    ? el('video', { src, muted: '', preload: 'none', class: 'w-full h-full object-cover block pointer-events-none' })
    : el('img', { src, alt: item.nome, loading: 'lazy', decoding: 'async', class: 'w-full h-full object-cover block pointer-events-none' });
  const selecionado = selecionados.has(item.caminho);

  const card = el(
    'div',
    {
      class: `galeria-card group relative border border-linha rounded-lg overflow-hidden bg-superficie aspect-square transition-[transform,box-shadow] hover:-translate-y-0.75 hover:shadow-md${selecionado ? ' is-selected' : ''}`,
      'data-caminho': item.caminho,
      title: item.caminho,
    },
    el(
      'div',
      { class: 'galeria-card__abrir absolute inset-0' },
      miniatura,
    ),
    montarBotaoCheck({
      selecionado,
      onClick: () => alternarSelecao(item.caminho),
    }),
    el('span', { class: 'absolute top-2 right-2 z-10 bg-black/65 text-white font-mono text-xs tracking-wide px-1.75 py-0.5 rounded-full pointer-events-none' }, item.tipo === 'video' ? 'vídeo' : 'imagem'),
    el('span', {
      class: 'absolute inset-x-0 bottom-0 z-10 pt-5 pb-2 px-2.5 bg-linear-to-t from-black/72 to-transparent text-white font-mono text-xs text-left whitespace-nowrap overflow-hidden text-ellipsis opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none',
    }, item.caminho),
  );

  ligarInteracaoSelecao(card, {
    onAbrir: () => visualizarArquivo(item.caminho, item.modificado),
    onSegurar: () => {
      definirSelecaoArquivo(item.caminho, true);
      sincronizarVisualSelecao();
    },
    onCliqueModo: () => {
      definirSelecaoArquivo(item.caminho, true);
      sincronizarVisualSelecao();
    },
  });

  return card;
}

function agruparPorSubpasta(itens, profundidade) {
  const grupos = new Map();
  const soltos = [];
  for (const item of itens) {
    const partes = item.caminho.split('/');
    if (partes.length - profundidade <= 1) {
      soltos.push(item);
      continue;
    }
    const chave = partes.slice(0, profundidade + 1).join('/');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }
  return { grupos, soltos };
}

function montarFilaNivel(itens, profundidade) {
  const { grupos, soltos } = agruparPorSubpasta(itens, profundidade);
  const chavesOrdenadas = [...grupos.keys()].sort((a, b) => a.localeCompare(b));
  const fila = [];
  for (const chave of chavesOrdenadas) {
    fila.push({ tipo: 'pasta', categoria: chave, quantidade: grupos.get(chave).length });
  }
  for (const item of soltos) fila.push({ tipo: 'item', item });
  return fila;
}

function revelarProximoLote() {
  const grade = $('#galeria-grade');
  const fim = Math.min(indiceRenderizado + TAMANHO_LOTE, filaRenderizacao.length);
  const novosElementos = [];
  for (; indiceRenderizado < fim; indiceRenderizado++) {
    const tarefa = filaRenderizacao[indiceRenderizado];
    const elemento = tarefa.tipo === 'pasta' ? montarCartaoPasta(tarefa) : montarCartaoItem(tarefa.item);
    grade.append(elemento);
    novosElementos.push(elemento);
  }

  if (PODE_ANIMAR && novosElementos.length) {
    animarEntrada(novosElementos, { translateY: [10, 0], scale: [0.97, 1], delay: anime.stagger(25), duration: 320 });
  }

  if (indiceRenderizado >= filaRenderizacao.length) return;

  const sentinela = el('div', { class: 'col-span-full h-1' });
  grade.append(sentinela);
  const raizScroll = $('#galeria-painel-midia');
  observadorLote = new IntersectionObserver((entradas) => {
    if (!entradas[0].isIntersecting) return;
    observadorLote.disconnect();
    sentinela.remove();
    revelarProximoLote();
  }, { root: raizScroll || $('#paginas'), rootMargin: '600px 0px' });
  observadorLote.observe(sentinela);
}

function abrirPasta(caminho) {
  pastaAberta = caminho;
  renderizar();
}

function irUmNivelAcima() {
  const partes = pastaAberta.split('/');
  pastaAberta = partes.length > 2 ? partes.slice(0, -1).join('/') : null;
  renderizar();
}

function montarCaminho() {
  const caminho = $('#galeria-caminho');
  caminho.innerHTML = '';
  if (!pastaAberta) {
    caminho.classList.add('hidden');
    caminho.classList.remove('flex');
    return;
  }
  caminho.classList.remove('hidden');
  caminho.classList.add('flex', 'flex-wrap', 'items-center');

  caminho.append(
    el('button', {
      class: 'inline-flex items-center gap-1.5 px-3 py-1.25 rounded-full text-sm border border-linha bg-superficie text-cinza hover:border-cinza-claro hover:text-tinta transition-colors',
      onclick: irUmNivelAcima,
    },
      el('iconify-icon', { noobserver: '', icon: 'lucide:arrow-left', class: 'text-sm', 'aria-hidden': 'true' }),
      'Voltar'
    )
  );

  const partes = pastaAberta.split('/');
  for (let i = 1; i < partes.length; i++) {
    const parcial = partes.slice(0, i + 1).join('/');
    const ultimo = i === partes.length - 1;
    caminho.append(
      el('span', { class: 'text-cinza-claro text-xs px-1' }, '/'),
      ultimo
        ? el('span', { class: 'font-mono text-xs uppercase tracking-widest text-tinta' }, partes[i])
        : el('button', {
          class: 'font-mono text-xs uppercase tracking-widest text-cinza hover:text-tinta transition-colors',
          onclick: () => abrirPasta(parcial),
        }, partes[i])
    );
  }
}

function renderizar() {
  const visiveisPorTipo = itensDeMidia.filter((item) => filtroTipo === 'todas' || item.tipo === filtroTipo);
  montarCaminho();

  let itensDoNivel;
  let profundidade;
  if (pastaAberta) {
    const prefixo = `${pastaAberta}/`;
    itensDoNivel = visiveisPorTipo.filter((item) => item.caminho.startsWith(prefixo));
    profundidade = pastaAberta.split('/').length;
    $('#galeria-resumo').textContent = `${itensDoNivel.length} peça${itensDoNivel.length === 1 ? '' : 's'} em ${pastaAberta.split('/').pop()}.`;
  } else {
    itensDoNivel = visiveisPorTipo;
    profundidade = 1;
    $('#galeria-resumo').textContent = itensDeMidia.length
      ? `${itensDeMidia.length} peça${itensDeMidia.length === 1 ? '' : 's'} encontrada${itensDeMidia.length === 1 ? '' : 's'} em marketing/, saidas/ e materiais/.`
      : '';
  }

  filaRenderizacao = montarFilaNivel(itensDoNivel, profundidade);
  observadorLote?.disconnect();
  observadorLote = null;
  indiceRenderizado = 0;

  const grade = $('#galeria-grade');
  grade.innerHTML = '';

  if (pastaAberta && filaRenderizacao.length === 0) {
    grade.append(el('p', { class: 'col-span-full text-cinza text-sm py-6' }, 'Nenhum item com esse filtro nesta pasta.'));
    return;
  }

  revelarProximoLote();
}

async function carregarGaleria() {
  try {
    const { itens } = await api('/api/midia');
    itensDeMidia = itens;
  } catch (erro) {
    console.error('Falha ao carregar a galeria:', erro);
    return;
  }

  const caminhosValidos = new Set(itensDeMidia.map((i) => i.caminho));
  for (const caminho of [...selecionados]) {
    if (!caminhosValidos.has(caminho)) selecionados.delete(caminho);
  }

  if (pastaAberta && !itensDeMidia.some((item) => item.caminho.startsWith(`${pastaAberta}/`))) pastaAberta = null;

  const filtros = $('#galeria-filtros');
  filtros.innerHTML = '';
  for (const opcao of [
    { id: 'todas', rotulo: 'Todas' },
    { id: 'imagem', rotulo: 'Imagens' },
    { id: 'video', rotulo: 'Vídeos' },
  ]) {
    filtros.append(el('button', {
      class: filtroClasse(filtroTipo === opcao.id),
      onclick: () => { filtroTipo = opcao.id; renderizar(); },
    }, opcao.rotulo));
  }

  $('#galeria-vazia').classList.toggle('hidden', itensDeMidia.length > 0);
  filtros.classList.toggle('hidden', itensDeMidia.length === 0);
  renderizar();
  atualizarBarraExclusao();
}

// ==========================================================
// Chat designer (canal galeria — envelope /interface + /designer só na 1ª msg)
// ==========================================================
function lerArquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function iniciarChatGaleria() {
  if (chatPronto) return;
  chatPronto = true;

  const mensagens = $('#gchat-mensagens');
  const rolagem = $('#gchat-rolagem');
  const entrada = $('#gchat-entrada');
  const botaoEnviar = $('#gchat-enviar');
  const botaoEnviarIcone = $('#gchat-enviar-icone');
  const botaoEnviarStop = $('#gchat-enviar-stop');
  const form = $('#gchat-form');
  const anexosContainer = $('#gchat-anexos');
  const inputArquivo = $('#gchat-arquivo');

  let anexos = [];
  let ocupado = false;
  let turnoAtual = null;

  function ajustarAltura() {
    entrada.style.height = 'auto';
    entrada.style.height = `${Math.min(entrada.scrollHeight, 144)}px`;
  }

  function rolarFim() {
    rolagem.scrollTop = rolagem.scrollHeight;
  }

  function atualizarBotaoAcao() {
    const cancelar = ocupado;
    botaoEnviar.dataset.modo = cancelar ? 'cancelar' : 'enviar';
    botaoEnviar.title = cancelar ? 'Cancelar' : 'Enviar';
    botaoEnviar.setAttribute('aria-label', cancelar ? 'Cancelar geração' : 'Enviar');
    botaoEnviar.disabled = false;
    if (botaoEnviarIcone) botaoEnviarIcone.hidden = cancelar;
    if (botaoEnviarStop) botaoEnviarStop.hidden = !cancelar;
  }

  function definirOcupado(valor) {
    ocupado = valor;
    atualizarBotaoAcao();
  }

  function cancelarGeracao() {
    if (!ocupado) return;
    socket.emit('chat:cancelar', { canal: CANAL });
  }

  function esconderBoasVindas() {
    $('#gchat-boasvindas')?.remove();
  }

  function renderizarAnexos() {
    anexosContainer.innerHTML = '';
    anexosContainer.classList.toggle('hidden', anexos.length === 0);
    anexosContainer.classList.toggle('flex', anexos.length > 0);
    for (const anexo of anexos) {
      anexosContainer.append(
        el('div', { class: 'relative w-14 h-14 rounded-lg overflow-hidden border border-linha shrink-0' },
          el('img', { src: anexo.dataUrl, class: 'w-full h-full object-cover', alt: anexo.nome }),
          el('button', {
            type: 'button',
            class: 'absolute top-0.5 right-0.5 w-4.5 h-4.5 rounded-full bg-black/60 text-white flex items-center justify-center',
            'aria-label': `Remover ${anexo.nome}`,
            onclick: () => {
              anexos = anexos.filter((a) => a.id !== anexo.id);
              renderizarAnexos();
            },
          }, el('iconify-icon', { noobserver: '', icon: 'lucide:x', class: 'text-[11px]' })))
      );
    }
  }

  function adicionarUsuario(texto, listaAnexos) {
    esconderBoasVindas();
    const filhos = [];
    if (listaAnexos?.length) {
      filhos.push(el('div', { class: 'flex flex-wrap gap-1.5 justify-end' },
        ...listaAnexos.filter((a) => a.categoria === 'imagem').map((img) =>
          el('img', {
            src: img.dataUrl || `data:${img.mediaType};base64,${img.data}`,
            class: 'w-20 h-20 object-cover rounded-lg border border-linha',
            alt: img.nome || 'anexo',
          }))));
    }
    if (texto) {
      filhos.push(el('div', { class: 'bg-vekta text-white rounded-[16px_16px_4px_16px] px-3.5 py-2 max-w-[90%] whitespace-pre-wrap break-words text-sm' }, texto));
    }
    mensagens.append(el('div', { class: 'flex flex-col gap-1 items-end' }, ...filhos));
    rolarFim();
  }

  function garantirTurno() {
    if (turnoAtual) return turnoAtual;
    esconderBoasVindas();
    const corpo = el('div', { class: 'markdown text-sm' });
    const chips = el('div', { class: 'flex flex-wrap gap-1.5' });
    const digitando = el('span', { class: 'inline-flex gap-1 py-1' },
      el('span', { class: 'w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho' }),
      el('span', { class: 'w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho [animation-delay:150ms]' }),
      el('span', { class: 'w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho [animation-delay:300ms]' }));
    const balao = el('div', { class: 'bg-fundo border border-linha rounded-[16px_16px_16px_4px] px-3.5 py-2.5 max-w-[92%]' }, corpo, digitando);
    const msg = el('div', { class: 'flex flex-col gap-2 items-start' }, chips, balao);
    mensagens.append(msg);
    turnoAtual = { balao, corpo, chips, digitando, texto: '', blocosFechados: '' };
    rolarFim();
    return turnoAtual;
  }

  function renderizarTurno() {
    if (!turnoAtual) return;
    const completo = turnoAtual.blocosFechados + turnoAtual.texto;
    let visivel = analisarWidgets(completo).limpo;
    visivel = ocultarWidgetsEmStreaming(visivel);
    turnoAtual.corpo.innerHTML = md(visivel);
    rolarFim();
  }

  const opcoesPergunta = {
    estaOcupado: () => ocupado,
    onResponder: (texto) => {
      // Resposta a pergunta: sem reativar skills do canal
      socket.emit('chat:enviar', { texto, anexos: [], canal: CANAL, pularSkill: true });
    },
  };

  function fecharTurno() {
    turnoAtual?.digitando?.remove();
    turnoAtual = null;
  }

  function adicionarErro(texto) {
    fecharTurno();
    mensagens.append(el('div', { class: 'flex flex-col items-start' },
      el('div', { class: 'border border-alerta bg-alerta-suave text-alerta rounded-[16px_16px_16px_4px] px-3.5 py-2.5 max-w-[92%] text-sm' }, texto)));
    rolarFim();
  }

  async function adicionarAnexos(arquivos) {
    for (const arquivo of arquivos) {
      if (anexos.length >= MAX_ANEXOS) break;
      if (!TIPOS_IMAGEM.has(arquivo.type) || arquivo.size > TAMANHO_MAX) continue;
      try {
        const dataUrl = await lerArquivoComoDataUrl(arquivo);
        const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
        if (!match) continue;
        anexos.push({
          id: crypto.randomUUID(),
          nome: arquivo.name,
          categoria: 'imagem',
          mediaType: match[1],
          sourceType: 'base64',
          data: match[2],
          dataUrl,
        });
      } catch { /* ignora */ }
    }
    renderizarAnexos();
  }

  function enviar() {
    if (ocupado) return;
    const texto = entrada.value.trim();
    if (!texto && anexos.length === 0) return;
    const payload = anexos.map(({ categoria, mediaType, sourceType, data, nome }) => ({ categoria, mediaType, sourceType, data, nome }));
    socket.emit('chat:enviar', { texto, anexos: payload, canal: CANAL });
    entrada.value = '';
    anexos = [];
    renderizarAnexos();
    ajustarAltura();
  }

  socket.on('chat:evento', (evento) => {
    if ((evento.canal || 'principal') !== CANAL) return;
    switch (evento.tipo) {
      case 'usuario':
        adicionarUsuario(evento.texto, evento.anexos);
        break;
      case 'inicio':
        definirOcupado(true);
        garantirTurno();
        break;
      case 'delta': {
        const turno = garantirTurno();
        turno.texto += evento.texto;
        renderizarTurno();
        break;
      }
      case 'texto': {
        const turno = garantirTurno();
        turno.blocosFechados += (turno.blocosFechados ? '\n\n' : '') + evento.texto;
        turno.texto = '';
        renderizarTurno();
        break;
      }
      case 'ferramenta': {
        const turno = garantirTurno();
        turno.chips.append(el('span', {
          class: 'inline-flex items-center gap-1 font-mono text-[10px] text-cinza bg-superficie border border-dashed border-linha rounded-full px-2 py-0.5',
          title: evento.resumo || evento.nome,
        }, el('b', { class: 'text-vekta' }, evento.nome)));
        rolarFim();
        break;
      }
      case 'fim':
        if (turnoAtual) {
          const textoFinal = turnoAtual.blocosFechados + turnoAtual.texto;
          const { limpo, perguntas, arquivos } = analisarWidgets(textoFinal);
          if (perguntas.length || arquivos.length) {
            if (!limpo) turnoAtual.balao.classList.add('hidden');
            const pai = turnoAtual.balao.parentElement;
            if (arquivos.length) anexarArquivos(pai, arquivos);
            if (perguntas.length) anexarPerguntas(pai, perguntas, opcoesPergunta);
            rolarFim();
          }
        }
        fecharTurno();
        definirOcupado(false);
        document.dispatchEvent(new CustomEvent('vekta-ai:producao-concluida'));
        break;
      case 'cancelada':
        if (turnoAtual) {
          turnoAtual.balao.parentElement?.append(
            el('span', { class: 'font-mono text-[10px] text-cinza-claro' }, 'Cancelado'));
        }
        fecharTurno();
        definirOcupado(false);
        break;
      case 'erro':
        adicionarErro(evento.texto);
        definirOcupado(false);
        break;
      case 'encerrada':
        if (ocupado) {
          adicionarErro('A sessão do Claude CLI foi encerrada. A próxima mensagem tenta retomá-la.');
          definirOcupado(false);
        }
        break;
      case 'reiniciada':
        fecharTurno();
        definirOcupado(false);
        mensagens.innerHTML = '';
        mensagens.append(
          el('div', { id: 'gchat-boasvindas', class: 'flex-1 flex flex-col items-center justify-center text-center px-4 text-cinza' },
            el('iconify-icon', { noobserver: '', icon: 'lucide:sparkles', class: 'text-[28px] text-vekta mb-2', 'aria-hidden': 'true' }),
            el('h2', { class: 'font-display text-base text-tinta mb-1' }, 'Conversa nova'),
            el('p', { class: 'text-sm' }, 'Peça outra peça no chat ao lado.'))
        );
        break;
    }
  });

  socket.on('chat:estado', ({ ocupada, canal }) => {
    if ((canal || 'principal') !== CANAL) return;
    definirOcupado(!!ocupada);
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
  botaoEnviar.addEventListener('click', (e) => {
    if (!ocupado) return;
    e.preventDefault();
    cancelarGeracao();
  });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  });
  entrada.addEventListener('input', ajustarAltura);
  $('#gchat-anexar').addEventListener('click', () => inputArquivo.click());
  inputArquivo.addEventListener('change', () => {
    adicionarAnexos([...inputArquivo.files]).catch(console.error);
    inputArquivo.value = '';
  });
  $('#gchat-nova').addEventListener('click', () => socket.emit('chat:nova-conversa', { canal: CANAL }));
  $('#galeria-focar-chat')?.addEventListener('click', () => {
    $('#galeria-chat')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    entrada.focus();
  });
}

export async function iniciar() {
  // Marca o painel de scroll da grade (sentinel do IntersectionObserver)
  const painel = $('#aba-galeria')?.querySelector('.overflow-y-auto');
  if (painel && !painel.id) painel.id = 'galeria-painel-midia';

  iniciarChatGaleria();
  await carregarGaleria();
}

export const atualizar = carregarGaleria;
