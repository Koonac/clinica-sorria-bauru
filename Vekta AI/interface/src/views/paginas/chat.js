/* Página: Chat com o Vekta.
   Uma única instância de UI (#chat-host) é compartilhada entre a aba Chat
   (modo central) e a Visão geral (modo ide / painel direito). Ver alojar(). */
import { $, el, md, api, animarEntrada } from '../.core/util.js';
import { socket } from '../.core/socket.js';
import { analisarPerguntas, ocultarPerguntaEmStreaming, anexarPerguntas } from '../.core/perguntas.js';
import { analisarArquivos, ocultarArquivoEmStreaming, anexarArquivos } from '../.core/arquivos.js';

/** Extrai e remove blocos interativos (arquivos + perguntas) do markdown. */
function analisarWidgets(texto) {
  const { limpo: semArquivos, arquivos } = analisarArquivos(texto);
  const { limpo, perguntas } = analisarPerguntas(semArquivos);
  return { limpo, arquivos, perguntas };
}

function ocultarWidgetsEmStreaming(texto) {
  return ocultarPerguntaEmStreaming(ocultarArquivoEmStreaming(texto));
}

/** Move #chat-host para o slot da página ativa e ajusta o layout (central vs IDE). */
export function alojar(pagina) {
  const host = $('#chat-host');
  if (!host) return;

  const modoIde = pagina === 'dashboard';
  const slot = modoIde ? $('#chat-slot-ide') : $('#chat-slot-central');
  if (!slot) return;

  if (host.parentElement !== slot) slot.appendChild(host);
  host.dataset.modo = modoIde ? 'ide' : 'central';

  // Barras de limite só no chat principal (modo central)
  const limites = host.querySelector('#chat-limites');
  if (limites) {
    if (modoIde) limites.setAttribute('hidden', '');
    else if (limites.dataset.pronto === '1') limites.removeAttribute('hidden');
  }

  // Recoloca a rolagem no fim após o reflow do layout novo
  requestAnimationFrame(() => {
    const rolagem = $('#chat-rolagem');
    if (rolagem) rolagem.scrollTop = rolagem.scrollHeight;
    if (pagina === 'chat' || pagina === 'dashboard') $('#chat-entrada')?.focus();
  });
}

function formatarRelativo(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const TIPOS_IMAGEM_ACEITOS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024;  // 5 MB
const TAMANHO_MAX_PDF = 10 * 1024 * 1024;    // 10 MB
const TAMANHO_MAX_TEXTO = 2 * 1024 * 1024;   // 2 MB
const MAX_ANEXOS = 5;
const ICONE_POR_CATEGORIA = { pdf: 'lucide:file-type-2', texto: 'lucide:file-text' };

function lerArquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function lerArquivoComoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsText(arquivo);
  });
}

/** Identifica a categoria pelo MIME type, com fallback por extensão (ex.: .txt às vezes chega sem type). */
function categoriaDoArquivo(arquivo) {
  if (TIPOS_IMAGEM_ACEITOS.has(arquivo.type)) return 'imagem';
  if (arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name)) return 'pdf';
  if (arquivo.type === 'text/plain' || /\.txt$/i.test(arquivo.name)) return 'texto';
  return null;
}

/** Card com ícone + nome de arquivo, usado tanto no preview (com espaço pro X) quanto no balão enviado. */
function elCartaoArquivo(anexo, { espacoBotao = false } = {}) {
  return el('div', { class: `flex items-center gap-1.5 h-14 max-w-48 rounded-lg border border-linha bg-fundo px-2.5 shrink-0 ${espacoBotao ? 'pr-6' : ''}` },
    el('iconify-icon', { noobserver: '', icon: ICONE_POR_CATEGORIA[anexo.categoria] || 'lucide:file', class: 'text-[18px] text-cinza shrink-0' }),
    el('span', { class: 'text-xs text-tinta truncate' }, anexo.nome || 'arquivo'));
}

/** Monta o balão de mensagem do usuário (texto + miniaturas/cards dos anexos). */
function criarBalaoUsuario(texto, anexos) {
  const filhos = [];
  if (anexos && anexos.length) {
    const imagens = anexos.filter((a) => a.categoria === 'imagem');
    const documentos = anexos.filter((a) => a.categoria !== 'imagem');
    if (imagens.length) {
      filhos.push(el('div', { class: 'flex flex-wrap gap-1.5 justify-end' },
        ...imagens.map((img) => el('img', {
          src: img.dataUrl || `data:${img.mediaType};base64,${img.data}`,
          class: 'w-28 h-28 object-cover rounded-xl border border-linha',
          alt: img.nome || 'imagem anexada',
        }))));
    }
    if (documentos.length) {
      filhos.push(el('div', { class: 'flex flex-wrap gap-1.5 justify-end' },
        ...documentos.map((doc) => elCartaoArquivo(doc))));
    }
  }
  if (texto) {
    filhos.push(el('div', { class: 'bg-vekta text-white rounded-[16px_16px_4px_16px] px-4 py-2.5 max-w-[78%] whitespace-pre-wrap break-words' }, texto));
  }
  return el('div', { class: 'flex flex-col gap-1.5 items-end' }, ...filhos);
}

const TEXTO_BOASVINDAS_SEM_DNA = 'Antes, rode <code class="bg-vekta-suave text-vekta px-1.5 py-0.5 rounded-md font-mono text-[0.9em]">/instalar</code> para configurar a empresa.';
const TEXTO_BOASVINDAS_COM_DNA = 'Digite e o Vekta Ai coloca em movimento.';

async function atualizarTextoBoasVindas() {
  const alvo = $('#chat-boasvindas-texto');
  if (!alvo) return;
  try {
    const status = await api('/api/status');
    alvo.innerHTML = status.dnaInstalado ? TEXTO_BOASVINDAS_COM_DNA : TEXTO_BOASVINDAS_SEM_DNA;
  } catch {
    alvo.innerHTML = TEXTO_BOASVINDAS_SEM_DNA;
  }
}

export function iniciar() {
  const mensagens = $('#chat-mensagens');
  const rolagem = $('#chat-rolagem');
  const entrada = $('#chat-entrada');
  const botaoEnviar = $('#chat-enviar');
  const botaoEnviarIcone = $('#chat-enviar-icone');
  const botaoEnviarStop = $('#chat-enviar-stop');
  const chatForm = $('#chat-form');
  const composer = $('#chat-composer');
  const painelHistorico = $('#chat-historico');
  const listaHistorico = $('#chat-historico-lista');
  const botaoHistorico = $('#botao-historico');
  const anexosContainer = $('#chat-anexos');
  const inputArquivo = $('#chat-arquivo-imagem');
  const botaoAnexar = $('#chat-anexar');
  const botaoMicrofone = $('#chat-microfone');
  const botaoIrFim = $('#chat-ir-fim');
  const dropOverlay = $('#chat-drop-overlay');

  let anexos = []; // { id, nome, mediaType, data (base64 puro), dataUrl (preview) }
  let contadorDrag = 0; // dragenter/dragleave disparam em cada filho — conta pra não piscar o overlay
  let ditadoDisponivel = false; // true se o navegador tem ditado real (Chrome/Edge)

  // Primeiro contato: o composer (barras + form) começa dentro do bloco de boas-vindas
  // (centralizado na tela) — só existe #chat-form-espaco nesse estado.
  $('#chat-form-espaco')?.appendChild(composer || chatForm);
  atualizarTextoBoasVindas().catch(console.error);
  document.addEventListener('vekta-ai:producao-concluida', () => {
    atualizarTextoBoasVindas().catch(console.error);
  });

  let turnoAtual = null; // { balao, texto, chips } do turno em andamento do Vekta
  let ocupado = false;
  let sessaoAtivaId = null;
  let painelAberto = false;
  let pararDitado = () => {}; // reatribuído se o ditado por voz estiver disponível

  /** Propaga o ID da sessão Claude para a Visão geral (lista "Nesta conversa"). */
  function definirSessaoAtiva(id, { migrarPendente = false } = {}) {
    const novo = id || null;
    if (novo === sessaoAtivaId) {
      if (migrarPendente && novo) {
        document.dispatchEvent(new CustomEvent('vekta-ai:sessao-claude', {
          detail: { sessaoId: sessaoAtivaId, migrarPendente: true },
        }));
      }
      return;
    }
    sessaoAtivaId = novo;
    document.dispatchEvent(new CustomEvent('vekta-ai:sessao-claude', {
      detail: { sessaoId: sessaoAtivaId, migrarPendente },
    }));
  }

  function publicarSessaoAtual() {
    document.dispatchEvent(new CustomEvent('vekta-ai:sessao-claude', {
      detail: { sessaoId: sessaoAtivaId, migrarPendente: false },
    }));
  }

  // ==========================================================
  // Limites do plano (sessão 5h + semanal) + modal de contexto
  // ==========================================================
  const elLimites = $('#chat-limites');
  const elModalContexto = $('#chat-contexto-modal');
  const elModalContextoCorpo = $('#chat-contexto-corpo');
  let carregandoContexto = false;

  function corBarraPorPct(pct) {
    if (pct >= 90) return 'var(--color-alerta)';
    if (pct >= 75) return '#d4a017';
    return 'var(--color-vekta)';
  }

  function pintarLimite(prefixo, dados) {
    const barra = $(`#chat-limite-${prefixo}-barra`);
    const pctEl = $(`#chat-limite-${prefixo}-pct`);
    if (!barra || !pctEl) return;
    if (!dados || typeof dados.usadoPct !== 'number') {
      barra.style.width = '0%';
      pctEl.textContent = '—';
      barra.style.background = 'var(--color-vekta)';
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round(dados.usadoPct)));
    barra.style.width = `${pct}%`;
    barra.style.background = corBarraPorPct(pct);
    pctEl.textContent = `${pct}%`;
    const titulo = dados.reiniciaTexto
      ? `Reinicia ${dados.reiniciaTexto}`
      : '';
    barra.parentElement?.parentElement?.setAttribute('title', titulo || barra.parentElement.parentElement.getAttribute('title') || '');
  }

  function aplicarLimites(dados) {
    if (!dados) return;
    pintarLimite('sessao', dados.sessao);
    pintarLimite('semanal', dados.semanal);
    if (elLimites && $('#chat-host')?.dataset.modo !== 'ide') {
      elLimites.dataset.pronto = '1';
      elLimites.removeAttribute('hidden');
    }
  }

  async function carregarLimites({ forcar = false } = {}) {
    try {
      const q = forcar ? '?forcar=1' : '';
      const dados = await api(`/api/claude/limites${q}`);
      aplicarLimites(dados);
    } catch (erro) {
      console.warn('[limites]', erro.message);
      // Mantém barras visíveis com "—" se já estavam; senão tenta mostrar skeleton
      if (elLimites && $('#chat-host')?.dataset.modo !== 'ide') {
        elLimites.dataset.pronto = '1';
        elLimites.removeAttribute('hidden');
      }
    }
  }

  function formatarTokensK(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) {
      const k = n / 1000;
      return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`.replace(/\.0k$/, 'k');
    }
    return String(n);
  }

  function montarModalContexto(dados) {
    elModalContextoCorpo.innerHTML = '';
    if (!dados || !dados.categorias?.length) {
      elModalContextoCorpo.append(
        el('p', { class: 'text-sm text-cinza' }, dados?.erro || 'Sem dados de contexto no momento.'),
      );
      return;
    }

    const resumo = el('div', { class: 'mb-4' },
      el('p', { class: 'text-sm text-tinta' },
        dados.tokensTexto
          ? `${dados.tokensTexto} tokens (${dados.usadoPct ?? '—'}%)`
          : `${formatarTokensK(dados.tokensUsados)} / ${formatarTokensK(dados.tokensTotal)} tokens (${dados.usadoPct ?? '—'}%)`));

    // Barra segmentada (só categorias que não são free space, + free no resto)
    const barraSeg = el('div', {
      class: 'flex h-2 w-full rounded-full overflow-hidden bg-linha mb-5',
      title: 'Distribuição do contexto',
    });
    for (const cat of dados.categorias) {
      const ehLivre = /espa[cç]o livre|free\s*space/i.test(cat.nome);
      if (ehLivre) continue;
      const fatia = el('div', {
        class: 'h-full shrink-0',
        style: `width:${Math.max(cat.usadoPct, cat.usadoPct > 0 ? 0.4 : 0)}%;background:${cat.cor}`,
        title: `${cat.nome}: ${cat.tokensTexto || formatarTokensK(cat.tokens)} (${cat.usadoPct}%)`,
      });
      barraSeg.append(fatia);
    }

    const cab = el('div', {
      class: 'grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0 pb-2 mb-1 border-b border-linha font-mono text-[10px] uppercase tracking-wider text-cinza-claro',
    },
      el('span', {}, 'Categoria'),
      el('span', { class: 'text-right' }, 'Tokens'),
      el('span', { class: 'text-right w-12' }, 'Uso'));

    const lista = el('div', { class: 'flex flex-col' });
    for (const cat of dados.categorias) {
      const ehLivre = /espa[cç]o livre|free\s*space/i.test(cat.nome);
      const linha = el('div', {
        class: 'grid grid-cols-[1fr_auto_auto] gap-x-4 items-center py-2 border-b border-linha/60 last:border-0',
      },
        el('div', { class: 'flex items-center gap-2.5 min-w-0' },
          ehLivre
            ? el('span', { class: 'w-2.5 h-2.5 rounded-[3px] border border-linha shrink-0' })
            : el('span', {
              class: 'w-2.5 h-2.5 rounded-[3px] shrink-0',
              style: `background:${cat.cor}`,
            }),
          el('span', { class: `text-sm truncate ${ehLivre ? 'text-cinza' : 'text-tinta'}` }, cat.nome)),
        el('span', { class: 'font-mono text-xs text-cinza tabular-nums text-right' },
          cat.tokensTexto || formatarTokensK(cat.tokens)),
        el('span', { class: 'font-mono text-xs text-cinza tabular-nums text-right w-12' },
          cat.usadoPct < 0.1 && cat.usadoPct > 0 ? '<0.1%' : `${cat.usadoPct}%`));
      lista.append(linha);
    }

    elModalContextoCorpo.append(resumo, barraSeg, cab, lista);
  }

  function fecharModalContexto() {
    if (!elModalContexto) return;
    elModalContexto.setAttribute('hidden', '');
  }

  let contextoCacheLocal = null;
  let prefetchContextoEmAndamento = null;

  async function prefetchContexto({ forcar = false } = {}) {
    if (prefetchContextoEmAndamento && !forcar) return prefetchContextoEmAndamento;
    const params = new URLSearchParams();
    if (forcar) params.set('forcar', '1');
    if (sessaoAtivaId) params.set('sessaoId', sessaoAtivaId);
    prefetchContextoEmAndamento = (async () => {
      try {
        const dados = await api(`/api/claude/contexto?${params}`);
        if (dados?.categorias?.length) contextoCacheLocal = dados;
        return dados;
      } catch (erro) {
        console.warn('[contexto]', erro.message);
        return null;
      } finally {
        prefetchContextoEmAndamento = null;
      }
    })();
    return prefetchContextoEmAndamento;
  }

  async function abrirModalContexto() {
    if (!elModalContexto) return;
    elModalContexto.removeAttribute('hidden');

    // Abre na hora com o que já estiver em cache; só mostra "Carregando…" no frio.
    if (contextoCacheLocal?.categorias?.length) {
      montarModalContexto(contextoCacheLocal);
    } else {
      elModalContextoCorpo.innerHTML = '';
      elModalContextoCorpo.append(el('p', { class: 'text-sm text-cinza' }, 'Carregando…'));
    }

    if (carregandoContexto) return;
    carregandoContexto = true;
    try {
      // Sem forcar: usa cache do servidor se ainda fresco (abertura quase instantânea).
      const dados = await prefetchContexto({ forcar: !contextoCacheLocal });
      if (dados?.categorias?.length && !elModalContexto.hasAttribute('hidden')) {
        montarModalContexto(dados);
      } else if (!contextoCacheLocal && !elModalContexto.hasAttribute('hidden')) {
        montarModalContexto({ categorias: [], erro: 'Sem dados de contexto no momento.' });
      }
    } catch (erro) {
      if (!contextoCacheLocal) {
        montarModalContexto({ categorias: [], erro: erro.message || 'Não foi possível ler o contexto.' });
      }
    } finally {
      carregandoContexto = false;
    }
  }

  $('#chat-contexto-ajuda')?.addEventListener('click', () => abrirModalContexto());
  $('#chat-contexto-fechar')?.addEventListener('click', fecharModalContexto);
  elModalContexto?.addEventListener('click', (e) => {
    if (e.target === elModalContexto) fecharModalContexto();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elModalContexto && !elModalContexto.hasAttribute('hidden')) {
      fecharModalContexto();
    }
  });

  // Mostra as barras assim que possível (só no modo central)
  if ($('#chat-host')?.dataset.modo !== 'ide') {
    elLimites?.removeAttribute('hidden');
  }
  // Limites + contexto em paralelo — o "?" abre na hora depois desse prefetch.
  carregarLimites().catch(console.warn);
  prefetchContexto().catch(() => {});

  // ==========================================================
  // Autocomplete de skills: digitar "/" no início da mensagem abre um menu
  // com as skills disponíveis (.claude/skills/, via GET /api/skills).
  // ==========================================================
  let skillsCache = null;      // lista completa de skills (carregada uma vez)
  let skillsFiltradas = [];    // resultado do filtro atual
  let indiceSkill = 0;         // item destacado (navegação por teclado)
  let menuSkillsAberto = false;

  const menuSkills = el('div', {
    id: 'chat-skills-menu',
    role: 'listbox',
    'aria-label': 'Skills disponíveis',
    class: 'hidden absolute left-2 right-2 bottom-full mb-2 z-30 max-h-72 overflow-y-auto bg-superficie border border-linha rounded-2xl shadow-lg py-1.5',
  });
  chatForm.appendChild(menuSkills);

  async function garantirSkills() {
    if (skillsCache) return skillsCache;
    try {
      const { itens } = await api('/api/skills');
      skillsCache = itens || [];
    } catch {
      skillsCache = [];
    }
    return skillsCache;
  }

  /** Termo digitado após "/", só quando a mensagem inteira for "/algo" (sem espaço). */
  function termoSlash() {
    const m = /^\/(\S*)$/.exec(entrada.value);
    return m ? m[1] : null;
  }

  function abrirMenuSkills() {
    menuSkillsAberto = true;
    menuSkills.classList.remove('hidden');
  }
  function fecharMenuSkills() {
    menuSkillsAberto = false;
    menuSkills.classList.add('hidden');
  }

  function renderizarMenuSkills() {
    menuSkills.innerHTML = '';
    skillsFiltradas.forEach((skill, i) => {
      const item = el('button', {
        type: 'button',
        role: 'option',
        'data-idx': i,
        'aria-selected': i === indiceSkill ? 'true' : 'false',
        class: `w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors hover:bg-fundo ${i === indiceSkill ? 'bg-vekta-suave' : ''}`,
        // mousedown (não click) + preventDefault: seleciona sem tirar o foco do textarea
        onmousedown: (e) => { e.preventDefault(); selecionarSkill(i); },
      },
        el('span', { class: 'font-mono text-sm text-vekta' }, `/${skill.nome}`),
        el('span', { class: 'text-xs text-cinza truncate' }, skill.descricao || ''));
      menuSkills.append(item);
    });
  }

  async function atualizarMenuSkills() {
    const termo = termoSlash();
    if (termo === null) { fecharMenuSkills(); return; }
    await garantirSkills();
    const t = termo.toLowerCase();
    skillsFiltradas = skillsCache.filter((s) => s.nome.toLowerCase().includes(t));
    if (skillsFiltradas.length === 0) { fecharMenuSkills(); return; }
    indiceSkill = 0;
    renderizarMenuSkills();
    abrirMenuSkills();
  }

  function moverSelecaoSkill(delta) {
    const n = skillsFiltradas.length;
    if (n === 0) return;
    indiceSkill = (indiceSkill + delta + n) % n;
    renderizarMenuSkills();
    menuSkills.querySelector(`[data-idx="${indiceSkill}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function selecionarSkill(i) {
    const skill = skillsFiltradas[i];
    if (!skill) return;
    entrada.value = `/${skill.nome} `;
    fecharMenuSkills();
    entrada.focus();
    ajustarAlturaEntrada();
  }

  // "Preso no fim": durante o streaming só auto-rola se o usuário já estiver no
  // fim. Se ele rolar para cima para reler enquanto o Vekta digita, o auto-scroll
  // para de arrastá-lo de volta — e volta a colar assim que ele retornar ao fim.
  let presoNoFim = true;
  const LIMIAR_FIM = 48; // px de tolerância para considerar "no fim"

  function estaNoFim() {
    return rolagem.scrollHeight - rolagem.scrollTop - rolagem.clientHeight <= LIMIAR_FIM;
  }
  // botão flutuante "ir para o fim": visível só quando o usuário está descolado do fim
  function atualizarBotaoIrFim() {
    botaoIrFim.hidden = presoNoFim;
  }
  // a posição é a única fonte da verdade: o scroll programático abaixo recoloca no
  // fim (mantém preso); o scroll do usuário para cima descola.
  rolagem.addEventListener('scroll', () => {
    presoNoFim = estaNoFim();
    atualizarBotaoIrFim();
  }, { passive: true });

  function rolarParaFim({ forcar = false } = {}) {
    if (forcar) presoNoFim = true; // ações do usuário (enviar, abrir sessão) voltam ao fim
    if (!presoNoFim) return;
    rolagem.scrollTop = rolagem.scrollHeight;
    atualizarBotaoIrFim();
  }

  botaoIrFim.addEventListener('click', () => rolarParaFim({ forcar: true }));

  function definirOcupado(valor) {
    ocupado = valor;
    const status = $('#orbe-status');
    status.textContent = valor ? 'Vekta pensando…' : 'Vekta ativo';
    status.classList.toggle('text-alerta', valor);
    status.classList.toggle('text-vekta', !valor);
    chatForm.classList.toggle('chat-caixa--pensando', valor);
    atualizarBotaoAcao();
  }

  /** Alterna enviar ↔ cancelar (quadrado) conforme o turno ativo. */
  function atualizarBotaoAcao() {
    const cancelar = ocupado;
    botaoEnviar.dataset.modo = cancelar ? 'cancelar' : 'enviar';
    botaoEnviar.title = cancelar ? 'Cancelar' : 'Enviar (Enter)';
    botaoEnviar.setAttribute('aria-label', cancelar ? 'Cancelar geração' : 'Enviar mensagem');
    botaoEnviar.disabled = false;

    if (botaoEnviarIcone) botaoEnviarIcone.hidden = cancelar;
    if (botaoEnviarStop) botaoEnviarStop.hidden = !cancelar;

    if (cancelar) {
      botaoEnviar.hidden = false;
      if (botaoMicrofone) botaoMicrofone.hidden = true;
    } else if (ditadoDisponivel) {
      botaoEnviar.hidden = true;
      if (botaoMicrofone) botaoMicrofone.hidden = false;
    } else {
      botaoEnviar.hidden = false;
      if (botaoMicrofone) botaoMicrofone.hidden = true;
    }
  }

  function cancelarGeracao() {
    if (!ocupado) return;
    socket.emit('chat:cancelar', { canal: 'principal' });
  }

  function esconderBoasVindas({ animar = true } = {}) {
    const boasVindas = $('#chat-boasvindas');
    const peca = composer || chatForm;
    if (!boasVindas) {
      if (peca.parentElement !== rolagem.parentElement) rolagem.after(peca);
      chatForm.classList.remove('chat-caixa');
      return;
    }

    // o glow grande é só para o primeiro contato — some assim que a conversa já tem conteúdo
    chatForm.classList.remove('chat-caixa');

    // FLIP manual: o composer estava centralizado dentro das boas-vindas; ao devolvê-lo
    // pro lugar fixo (logo após a área de rolagem), anima o deslizar pra baixo em
    // vez de simplesmente "pular" pra posição nova.
    const antes = peca.getBoundingClientRect();
    rolagem.after(peca);
    const depois = peca.getBoundingClientRect();
    const deltaY = antes.top - depois.top;
    if (animar && deltaY) {
      peca.style.transition = 'none';
      peca.style.transform = `translateY(${deltaY}px)`;
      peca.offsetHeight; // força reflow: "commita" o salto antes de reativar a transição
      peca.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
      peca.style.transform = '';
      peca.addEventListener('transitionend', () => {
        peca.style.transition = '';
      }, { once: true });
    }

    boasVindas.remove();
  }

  function adicionarMensagemUsuario(texto, anexosMsg) {
    esconderBoasVindas();
    const msg = criarBalaoUsuario(texto, anexosMsg);
    mensagens.append(msg);
    animarEntrada([msg], { translateY: [10, 0], duration: 280, delay: 0 });
    rolarParaFim({ forcar: true });
  }

  function renderizarAnexos() {
    anexosContainer.innerHTML = '';
    anexosContainer.classList.toggle('hidden', anexos.length === 0);
    anexosContainer.classList.toggle('flex', anexos.length > 0);
    for (const anexo of anexos) {
      const remover = el('button', {
        type: 'button',
        title: 'Remover',
        'aria-label': `Remover ${anexo.nome}`,
        class: 'absolute top-0.5 right-0.5 w-4.5 h-4.5 rounded-full bg-black/60 text-white flex items-center justify-center leading-none',
        onclick: () => removerAnexo(anexo.id),
      }, el('iconify-icon', { noobserver: '', icon: 'lucide:x', class: 'text-[11px]' }));

      const item = anexo.categoria === 'imagem'
        ? el('div', { class: 'relative w-14 h-14 rounded-lg overflow-hidden border border-linha shrink-0' },
            el('img', { src: anexo.dataUrl, class: 'w-full h-full object-cover', alt: anexo.nome }), remover)
        : el('div', { class: 'relative' }, elCartaoArquivo(anexo, { espacoBotao: true }), remover);
      anexosContainer.append(item);
    }
  }

  function removerAnexo(id) {
    anexos = anexos.filter((a) => a.id !== id);
    renderizarAnexos();
  }

  async function adicionarAnexos(arquivos) {
    for (const arquivo of arquivos) {
      if (anexos.length >= MAX_ANEXOS) break;
      const categoria = categoriaDoArquivo(arquivo);
      if (!categoria) continue;
      const limite = categoria === 'imagem' ? TAMANHO_MAX_IMAGEM : categoria === 'pdf' ? TAMANHO_MAX_PDF : TAMANHO_MAX_TEXTO;
      if (arquivo.size > limite) continue;
      try {
        if (categoria === 'texto') {
          const texto = await lerArquivoComoTexto(arquivo);
          anexos.push({ id: crypto.randomUUID(), nome: arquivo.name, categoria, mediaType: 'text/plain', sourceType: 'text', data: texto });
        } else {
          const dataUrl = await lerArquivoComoDataUrl(arquivo);
          const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
          if (!match) continue;
          const mediaType = categoria === 'pdf' ? 'application/pdf' : match[1];
          anexos.push({
            id: crypto.randomUUID(), nome: arquivo.name, categoria, mediaType, sourceType: 'base64', data: match[2],
            dataUrl: categoria === 'imagem' ? dataUrl : undefined,
          });
        }
      } catch {
        /* ignora arquivo que falhar ao ler */
      }
    }
    renderizarAnexos();
  }

  // ==========================================================
  // Widgets no chat: ```vekta-pergunta e ```vekta-arquivo
  // ==========================================================
  const opcoesPergunta = {
    estaOcupado: () => ocupado,
    onResponder: (texto) => {
      socket.emit('chat:enviar', { texto, anexos: [], canal: 'principal' });
    },
  };

  function adicionarMensagemAssistente(texto) {
    const { limpo, perguntas, arquivos } = analisarWidgets(texto);
    const corpo = el('div', { class: 'markdown' });
    corpo.innerHTML = md(limpo);
    const balao = el('div', { class: 'bg-superficie border border-linha rounded-[16px_16px_16px_4px] px-4.5 py-3 max-w-[92%] shadow-sm' }, corpo);
    const msg = el('div', { class: 'flex flex-col gap-2 items-start' }, balao);
    const soWidgets = !limpo && (perguntas.length > 0 || arquivos.length > 0);
    if (soWidgets) balao.classList.add('hidden');
    if (arquivos.length) anexarArquivos(msg, arquivos);
    if (perguntas.length) anexarPerguntas(msg, perguntas, opcoesPergunta);
    mensagens.append(msg);
    return msg;
  }

  function garantirTurno() {
    if (turnoAtual) return turnoAtual;
    esconderBoasVindas();
    const chips = el('div', { class: 'flex flex-wrap gap-1.5' });
    const corpo = el('div', { class: 'markdown' });
    const digitando = el('span', { class: 'inline-flex gap-1 py-1 px-0.5' },
      el('span', { class: 'w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho' }),
      el('span', { class: 'w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho [animation-delay:150ms]' }),
      el('span', { class: 'w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho [animation-delay:300ms]' }));
    const balao = el('div', { class: 'bg-superficie border border-linha rounded-[16px_16px_16px_4px] px-4.5 py-3 max-w-[92%] shadow-sm' }, corpo, digitando);
    const msg = el('div', { class: 'flex flex-col gap-1.5 items-start' }, chips, balao);
    mensagens.append(msg);
    animarEntrada([msg], { translateY: [10, 0], duration: 280, delay: 0 });
    turnoAtual = { balao, corpo, chips, digitando, texto: '', blocosFechados: '' };
    rolarParaFim();
    return turnoAtual;
  }

  function renderizarTurno() {
    if (!turnoAtual) return;
    const completo = turnoAtual.blocosFechados + turnoAtual.texto;
    // durante o streaming, blocos interativos ficam ocultos; os cards só
    // são montados no 'fim', quando o JSON está completo e válido.
    let visivel = analisarWidgets(completo).limpo;
    visivel = ocultarWidgetsEmStreaming(visivel);
    turnoAtual.corpo.innerHTML = md(visivel);
    rolarParaFim();
  }

  function fecharTurno() {
    if (turnoAtual && turnoAtual.digitando) turnoAtual.digitando.remove();
    turnoAtual = null;
  }

  function adicionarErro(texto) {
    fecharTurno();
    mensagens.append(el('div', { class: 'flex flex-col gap-1.5 items-start' },
      el('div', { class: 'border border-alerta bg-alerta-suave text-alerta rounded-[16px_16px_16px_4px] px-4.5 py-3 max-w-[92%]' }, texto)));
    rolarParaFim();
  }

  function destacarSessaoNaLista(id) {
    const alvo = id || null;
    listaHistorico.querySelectorAll('[data-sessao-id]').forEach((btn) => {
      const ativo = btn.dataset.sessaoId === alvo;
      const linha = btn.parentElement;
      if (!linha) return;
      linha.classList.toggle('bg-vekta-suave', ativo);
      linha.classList.toggle('text-vekta', ativo);
      linha.classList.toggle('border-vekta', ativo);
    });
  }

  async function carregarHistorico() {
    listaHistorico.innerHTML = '';
    listaHistorico.append(el('p', { class: 'text-cinza-claro text-sm px-2 py-3' }, 'Carregando…'));
    try {
      const { sessoes } = await api('/api/chat/sessoes');
      listaHistorico.innerHTML = '';
      if (!sessoes || sessoes.length === 0) {
        listaHistorico.append(el('p', { class: 'text-cinza-claro text-sm px-2 py-3' }, 'Nenhuma conversa ainda.'));
        return;
      }
      for (const s of sessoes) {
        const ativo = s.id === sessaoAtivaId;
        const linha = el('div', {
          class: `group flex items-stretch gap-0.5 rounded-xl border border-transparent ${ativo ? 'bg-vekta-suave text-vekta border-vekta' : 'text-tinta'}`,
        },
          el('button', {
            type: 'button',
            'data-sessao-id': s.id,
            class: 'min-w-0 flex-1 text-left rounded-xl px-3 py-2.5 transition-colors hover:bg-fundo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta',
            onclick: () => {
              if (ocupado) return;
              socket.emit('chat:abrir-sessao', { sessaoId: s.id, canal: 'principal' });
            },
          },
            el('span', { class: 'block text-sm font-medium leading-snug line-clamp-2' }, s.titulo || s.id.slice(0, 8)),
            el('span', { class: 'block font-mono text-[11px] text-cinza-claro mt-1' }, formatarRelativo(s.atualizadoEm))),
          el('button', {
            type: 'button',
            title: 'Excluir conversa',
            'aria-label': `Excluir conversa ${s.titulo || s.id.slice(0, 8)}`,
            class: 'shrink-0 self-center inline-flex items-center justify-center w-8 h-8 mr-1 rounded-full text-cinza-claro opacity-70 transition-colors hover:bg-alerta-suave hover:text-alerta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alerta focus-visible:opacity-100',
            onclick: (e) => {
              e.stopPropagation();
              excluirSessaoDoHistorico(s);
            },
          }, el('iconify-icon', { noobserver: '', icon: 'lucide:trash-2', class: 'text-[15px]' })));
        listaHistorico.append(linha);
      }
    } catch (erro) {
      listaHistorico.innerHTML = '';
      listaHistorico.append(el('p', { class: 'text-alerta text-sm px-2 py-3' }, erro.message || 'Falha ao carregar.'));
    }
  }

  function excluirSessaoDoHistorico(sessao) {
    if (!sessao?.id || ocupado) return;
    const rotulo = sessao.titulo || sessao.id.slice(0, 8);
    if (!window.confirm(`Excluir a conversa "${rotulo}"? Esta ação não pode ser desfeita.`)) return;
    socket.emit('chat:excluir-sessao', { sessaoId: sessao.id, canal: 'principal' });
  }

  // O dropdown vive no <body> (não no header): a animação de entrada da página deixa
  // um transform inline no <header>, que cria um stacking context e prenderia o
  // dropdown atrás do corpo do chat. No body, com position:fixed, ele fica por cima.
  document.body.appendChild(painelHistorico);

  /** Ancora o dropdown logo abaixo do botão de histórico, sempre dentro da tela. */
  function posicionarDropdown() {
    const r = botaoHistorico.getBoundingClientRect();
    const largura = Math.min(320, window.innerWidth - 16);
    let left = r.right - largura; // alinha a borda direita do dropdown à do botão
    left = Math.max(8, Math.min(left, window.innerWidth - largura - 8)); // nunca sai da tela
    painelHistorico.style.width = `${largura}px`;
    painelHistorico.style.left = `${left}px`;
    painelHistorico.style.top = `${r.bottom + 8}px`;
    painelHistorico.style.maxHeight = `${Math.max(160, window.innerHeight - r.bottom - 16)}px`;
  }

  function definirPainelAberto(aberto) {
    painelAberto = aberto;
    if (aberto) posicionarDropdown();
    painelHistorico.hidden = !aberto;
    botaoHistorico.toggleAttribute('data-aberto', aberto);
    botaoHistorico.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    if (aberto) {
      carregarHistorico();
      animarEntrada([painelHistorico], { translateY: [-6, 0], scale: [0.97, 1], duration: 160, delay: 0 });
    }
  }

  window.addEventListener('resize', () => { if (painelAberto) posicionarDropdown(); });

  function reconstruirThread(lista) {
    mensagens.innerHTML = '';
    esconderBoasVindas({ animar: false });
    fecharTurno();
    for (const m of lista || []) {
      if (m.papel === 'usuario') {
        mensagens.append(criarBalaoUsuario(m.texto, m.anexos));
      } else if (m.papel === 'assistente') {
        adicionarMensagemAssistente(m.texto);
      }
    }
    if (!lista || lista.length === 0) {
      mensagens.append(el('p', { class: 'text-cinza text-sm text-center py-8' }, 'Esta conversa ainda não tem mensagens de texto.'));
    }
    rolarParaFim({ forcar: true });
  }

  socket.on('chat:evento', (evento) => {
    if ((evento.canal || 'principal') !== 'principal') return;
    switch (evento.tipo) {
      case 'usuario':
        adicionarMensagemUsuario(evento.texto, evento.anexos);
        break;

      case 'inicio':
        definirOcupado(true);
        garantirTurno();
        break;

      case 'sessao':
        if (evento.sessaoId) definirSessaoAtiva(evento.sessaoId, { migrarPendente: true });
        $('#chat-sessao').textContent = sessaoAtivaId ? `sessão · ${sessaoAtivaId.slice(0, 8)}` : 'sessão ativa';
        if (painelAberto) destacarSessaoNaLista(sessaoAtivaId);
        break;

      case 'delta': {
        const turno = garantirTurno();
        turno.texto += evento.texto;
        renderizarTurno();
        break;
      }

      case 'texto': {
        // Bloco de texto completo: substitui o streaming acumulado pela versão definitiva
        const turno = garantirTurno();
        turno.blocosFechados += (turno.blocosFechados ? '\n\n' : '') + evento.texto;
        turno.texto = '';
        renderizarTurno();
        break;
      }

      case 'ferramenta': {
        const turno = garantirTurno();
        const chip = el('span', {
          class: 'inline-flex items-center gap-1.5 font-mono text-xs text-cinza bg-superficie border border-dashed border-linha rounded-full px-2.5 py-0.75 max-w-full overflow-hidden whitespace-nowrap text-ellipsis',
          title: evento.resumo || evento.nome,
        }, el('b', { class: 'text-vekta font-medium' }, evento.nome), evento.resumo ? ` · ${evento.resumo}` : '');
        turno.chips.append(chip);
        animarEntrada([chip], { translateY: 0, scale: [0.85, 1], duration: 240, delay: 0 });
        rolarParaFim();
        break;
      }

      case 'fim': {
        if (turnoAtual) {
          const textoFinal = turnoAtual.blocosFechados + turnoAtual.texto;
          const { limpo, perguntas, arquivos } = analisarWidgets(textoFinal);
          if (perguntas.length || arquivos.length) {
            if (!limpo) turnoAtual.balao.classList.add('hidden');
            const pai = turnoAtual.balao.parentElement;
            if (arquivos.length) anexarArquivos(pai, arquivos);
            if (perguntas.length) anexarPerguntas(pai, perguntas, opcoesPergunta);
            rolarParaFim();
          }
          if (arquivos.length) {
            document.dispatchEvent(new CustomEvent('vekta-ai:arquivos-claude', {
              detail: {
                sessaoId: evento.sessaoId || sessaoAtivaId,
                arquivos,
              },
            }));
          }
          const meta = [];
          if (evento.duracaoMs) meta.push(`${(evento.duracaoMs / 1000).toFixed(1)}s`);
          if (!evento.ok && evento.erro) {
            adicionarErro(String(evento.erro));
          } else if (meta.length) {
            turnoAtual.balao.parentElement.append(el('span', { class: 'font-mono text-xs text-cinza-claro' }, meta.join(' · ')));
          }
        }
        fecharTurno();
        definirOcupado(false);
        if (evento.sessaoId) {
          definirSessaoAtiva(evento.sessaoId, { migrarPendente: true });
          if (painelAberto) carregarHistorico();
        }
        carregarLimites({ forcar: true }).catch(() => {});
        prefetchContexto({ forcar: true }).catch(() => {});
        document.dispatchEvent(new CustomEvent('vekta-ai:producao-concluida'));
        break;
      }

      case 'cancelada': {
        if (turnoAtual) {
          const pai = turnoAtual.balao.parentElement;
          pai?.append(el('span', { class: 'font-mono text-xs text-cinza-claro' }, 'Cancelado'));
        }
        fecharTurno();
        definirOcupado(false);
        if (evento.sessaoId) definirSessaoAtiva(evento.sessaoId);
        break;
      }

      case 'excluida': {
        if (evento.sessaoId && evento.sessaoId === sessaoAtivaId) {
          // Conversa aberta foi apagada → volta ao estado de conversa nova
          socket.emit('chat:nova-conversa', { canal: 'principal' });
        }
        if (painelAberto) carregarHistorico();
        break;
      }

      case 'limites':
        if (evento.limites) aplicarLimites(evento.limites);
        break;

      case 'erro':
        adicionarErro(evento.texto);
        definirOcupado(false);
        break;

      case 'encerrada':
        if (ocupado) {
          adicionarErro('A sessão do Claude CLI foi encerrada inesperadamente. A próxima mensagem tentará retomá-la.');
          definirOcupado(false);
          $('#chat-sessao').textContent = '';
        }
        break;

      case 'reiniciada':
        definirSessaoAtiva(null);
        mensagens.innerHTML = '';
        mensagens.append(el('div', { class: 'flex-1 flex flex-col items-center justify-center text-center px-5 text-cinza', id: 'chat-boasvindas' },
          // z-10 pra ficar sempre por cima do glow do #chat-form (que é pintado depois no DOM)
          el('div', { class: 'relative z-10 flex flex-col items-center' },
            el('div', { class: 'orbe-anel orbe-anel--grande relative w-16 h-16 mb-4 rounded-full' }),
            el('h2', { class: 'font-display text-xl text-tinta mb-1.5' }, 'O que vamos fazer hoje?'),
            el('p', { id: 'chat-boasvindas-texto', class: 'text-base mb-2' }, 'Digite e o Vekta Ai coloca em movimento.')),
          el('div', { id: 'chat-form-espaco', class: 'w-full' })));
        chatForm.classList.add('chat-caixa'); // "nova conversa" volta ao estado de primeiro contato
        $('#chat-form-espaco').appendChild(composer || chatForm); // ... e o composer volta pro centro
        $('#chat-sessao').textContent = '';
        presoNoFim = true;          // tela de boas-vindas: sem histórico para rolar
        atualizarBotaoIrFim();
        fecharTurno();
        definirOcupado(false);
        atualizarTextoBoasVindas();
        if (painelAberto) carregarHistorico();
        break;

      case 'aberta':
        definirOcupado(false);
        fecharTurno();
        definirSessaoAtiva(evento.sessaoId || null);
        reconstruirThread(evento.mensagens);
        $('#chat-sessao').textContent = sessaoAtivaId ? `sessão · ${sessaoAtivaId.slice(0, 8)}` : 'sessão ativa';
        if (painelAberto) destacarSessaoNaLista(sessaoAtivaId);
        break;
    }
  });

  socket.on('chat:estado', ({ ocupada, canal }) => {
    if ((canal || 'principal') !== 'principal') return;
    definirOcupado(!!ocupada);
  });

  function enviarMensagem() {
    pararDitado();
    if (ocupado) return;
    const texto = entrada.value.trim();
    if (!texto && anexos.length === 0) return;
    const payload = anexos.map(({ categoria, mediaType, sourceType, data, nome }) => ({ categoria, mediaType, sourceType, data, nome }));
    socket.emit('chat:enviar', { texto, anexos: payload, canal: 'principal' });
    entrada.value = '';
    anexos = [];
    fecharMenuSkills();
    renderizarAnexos();
    ajustarAlturaEntrada();
  }

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    enviarMensagem();
  });
  botaoEnviar.addEventListener('click', (e) => {
    if (!ocupado) return;
    e.preventDefault();
    cancelarGeracao();
  });
  entrada.addEventListener('keydown', (e) => {
    // Com o menu de skills aberto, as setas/Enter/Tab/Esc controlam o menu
    if (menuSkillsAberto) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moverSelecaoSkill(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moverSelecaoSkill(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selecionarSkill(indiceSkill); return; }
      if (e.key === 'Escape') { e.preventDefault(); fecharMenuSkills(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  });
  // fecha ao sair do campo (timeout deixa o mousedown do item selecionar antes)
  entrada.addEventListener('blur', () => setTimeout(fecharMenuSkills, 120));

  function ajustarAlturaEntrada() {
    entrada.style.height = 'auto';
    entrada.style.height = Math.min(entrada.scrollHeight, 160) + 'px';
  }
  entrada.addEventListener('input', ajustarAlturaEntrada);
  entrada.addEventListener('input', atualizarMenuSkills);

  botaoAnexar.addEventListener('click', () => inputArquivo.click());
  inputArquivo.addEventListener('change', () => {
    adicionarAnexos([...inputArquivo.files]);
    inputArquivo.value = '';
  });
  entrada.addEventListener('paste', (e) => {
    const arquivos = [...(e.clipboardData?.items || [])]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((arquivo) => arquivo && categoriaDoArquivo(arquivo));
    if (arquivos.length === 0) return;
    e.preventDefault();
    adicionarAnexos(arquivos);
  });
  function arrastaArquivo(e) {
    return !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  }
  function mostrarDropOverlay(mostrar) {
    dropOverlay.classList.toggle('hidden', !mostrar);
    dropOverlay.classList.toggle('flex', mostrar);
  }
  chatForm.addEventListener('dragenter', (e) => {
    if (!arrastaArquivo(e)) return;
    e.preventDefault();
    contadorDrag++;
    mostrarDropOverlay(true);
  });
  chatForm.addEventListener('dragover', (e) => {
    if (!arrastaArquivo(e)) return;
    e.preventDefault();
  });
  chatForm.addEventListener('dragleave', (e) => {
    if (!arrastaArquivo(e)) return;
    e.preventDefault();
    contadorDrag = Math.max(0, contadorDrag - 1);
    if (contadorDrag === 0) mostrarDropOverlay(false);
  });
  chatForm.addEventListener('drop', (e) => {
    e.preventDefault();
    contadorDrag = 0;
    mostrarDropOverlay(false);
    const arquivos = [...(e.dataTransfer?.files || [])];
    if (arquivos.length) adicionarAnexos(arquivos);
  });

  // ==========================================================
  // Botão à direita: microfone (ditado por voz) OU enviar.
  // A Web Speech API só transcreve de fato no Chrome e no Edge oficiais — em
  // Brave/Opera/Chromium a API existe mas falha (sem serviço de reconhecimento).
  // Por isso detectamos o navegador: onde o ditado funciona mostramos o
  // microfone; nos demais, o botão de enviar.
  // ==========================================================
  const ReconVoz = window.SpeechRecognition || window.webkitSpeechRecognition;

  function configurarDitado() {
    const recon = new ReconVoz();
    recon.lang = 'pt-BR';
    recon.continuous = true;      // segue ouvindo até o usuário parar
    recon.interimResults = true;  // mostra o texto parcial enquanto fala

    let gravando = false;
    let textoBase = '';   // o que já havia no campo quando o ditado começou
    let finalAcum = '';   // trechos já finalizados nesta sessão de ditado

    function definirGravando(valor) {
      gravando = valor;
      botaoMicrofone.toggleAttribute('data-gravando', valor);
      botaoMicrofone.setAttribute('aria-pressed', valor ? 'true' : 'false');
      botaoMicrofone.title = valor ? 'Parar ditado' : 'Ditar por voz';
    }

    pararDitado = () => { if (gravando) recon.stop(); };

    // Mensagem amigável por tipo de erro da SpeechRecognition
    const MSG_ERRO_VOZ = {
      'not-allowed': 'Permissão de microfone negada. Libere o microfone para este site nas configurações do navegador e tente de novo.',
      'service-not-allowed': 'Permissão de microfone negada. Libere o microfone para este site nas configurações do navegador e tente de novo.',
      'audio-capture': 'Nenhum microfone encontrado. Conecte um microfone e tente novamente.',
      'network': 'Falha de rede na transcrição. O ditado por voz precisa de internet e só funciona no Google Chrome ou no Microsoft Edge — outros navegadores baseados em Chromium (Brave, Opera, Chromium puro) não têm o serviço de reconhecimento.',
      'no-speech': null, // benigno: nenhuma fala captada — não incomoda o usuário
    };

    recon.addEventListener('result', (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const trecho = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalAcum += trecho;
        else interim += trecho;
      }
      const prefixo = textoBase && !/\s$/.test(textoBase) ? `${textoBase} ` : textoBase;
      entrada.value = prefixo + finalAcum + interim;
      ajustarAlturaEntrada();
    });

    // o reconhecimento pode encerrar sozinho (silêncio/erro) — reflete no botão
    recon.addEventListener('end', () => definirGravando(false));
    recon.addEventListener('error', (e) => {
      definirGravando(false);
      console.warn('[ditado por voz] erro:', e.error, e.message || '');
      if (e.error in MSG_ERRO_VOZ) {
        if (MSG_ERRO_VOZ[e.error]) adicionarErro(MSG_ERRO_VOZ[e.error]);
      } else {
        adicionarErro(`Não foi possível transcrever o áudio (${e.error || 'erro desconhecido'}).`);
      }
    });

    botaoMicrofone.addEventListener('click', () => {
      if (gravando) { recon.stop(); return; }
      textoBase = entrada.value;
      finalAcum = '';
      try {
        recon.start();
        definirGravando(true);
        entrada.focus();
      } catch (erro) {
        console.warn('[ditado por voz] falha ao iniciar:', erro);
        /* start() lança se chamado enquanto já ativo — ignora */
      }
    });

    botaoMicrofone.hidden = false;
  }

  // Brave expõe navigator.brave.isBrave() (assíncrono); Opera tem "OPR/" no UA.
  async function ditadoFunciona() {
    if (!ReconVoz) return false;
    const ua = navigator.userAgent;
    if (/\bOPR\//.test(ua)) return false;               // Opera
    if (navigator.brave?.isBrave) {                     // Brave
      try { if (await navigator.brave.isBrave()) return false; } catch { /* ignora */ }
    }
    return /\bEdg\//.test(ua) || /\bChrome\//.test(ua); // Edge ou Chrome oficiais
  }

  ditadoFunciona().then((ok) => {
    ditadoDisponivel = ok;
    if (ok) configurarDitado();
    atualizarBotaoAcao();
  });

  $('#botao-nova-conversa').addEventListener('click', () => {
    socket.emit('chat:nova-conversa', { canal: 'principal' });
  });

  botaoHistorico.addEventListener('click', () => {
    definirPainelAberto(!painelAberto);
  });
  $('#botao-fechar-historico').addEventListener('click', () => {
    definirPainelAberto(false);
  });
  // Dropdown: fecha ao clicar fora dele (o clique no próprio botão é tratado
  // pelo toggle acima, então ignoramos cliques dentro do botão/painel) ou no Esc.
  document.addEventListener('click', (e) => {
    if (!painelAberto) return;
    if (painelHistorico.contains(e.target) || botaoHistorico.contains(e.target)) return;
    definirPainelAberto(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && painelAberto) definirPainelAberto(false);
  });

  garantirSkills(); // pré-carrega para o menu de "/" abrir sem latência

  document.addEventListener('vekta-ai:pedir-sessao-claude', publicarSessaoAtual);
  publicarSessaoAtual();
}
