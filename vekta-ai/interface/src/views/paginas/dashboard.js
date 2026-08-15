/* Página: Visão geral — workspace estilo IDE (árvore | preview) */
import { $, el, api, extensaoDe, EXTENSOES_IMAGEM, CLASSE_VAZIO } from '../.core/util.js';
import { renderizarPreview } from '../.core/modal.js';

const ICONE_EXT = {
  '.md': 'lucide:file-text',
  '.txt': 'lucide:file-text',
  '.html': 'lucide:file-code',
  '.css': 'lucide:file-code',
  '.js': 'lucide:file-code',
  '.json': 'lucide:file-json',
  '.png': 'lucide:image',
  '.jpg': 'lucide:image',
  '.jpeg': 'lucide:image',
  '.webp': 'lucide:image',
  '.gif': 'lucide:image',
  '.svg': 'lucide:image',
  '.mp4': 'lucide:film',
  '.webm': 'lucide:film',
  '.mov': 'lucide:film',
  '.pdf': 'lucide:file-type-2',
};

const LIMITE_SESSAO = 24;
const STORAGE_ARQUIVOS = 'vekta-ide-arquivos-por-sessao';
const CHAVE_PENDENTE = '__pendente__';
const LIMITE_BUCKETS = 40;

let caminhoAberto = null;
let metaAberto = null; // { modificado }
let editando = false;
let conteudoEdicao = '';
let arvoreJaMontada = false;

/** Snapshot mtime por caminho no primeiro load — base para detectar novos/alterados. */
const snapshotMtimes = new Map();
let snapshotPronto = false;

/** ID da sessão Claude ativa (null = conversa nova ainda sem ID). */
let claudeSessaoId = null;

/** Arquivos da conversa Claude ativa: caminho → meta. */
const arquivosSessao = new Map();

/** Caminhos da conversa ainda não abertos pelo usuário (badge "Novo"). */
const pendentesNovos = new Set();

function chaveBucket() {
  return claudeSessaoId || CHAVE_PENDENTE;
}

function lerStoreArquivos() {
  try {
    const bruto = localStorage.getItem(STORAGE_ARQUIVOS);
    if (!bruto) return {};
    const dados = JSON.parse(bruto);
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

function gravarStoreArquivos(store) {
  try {
    const entradas = Object.entries(store)
      .filter(([, v]) => v && Array.isArray(v.arquivos))
      .sort((a, b) => (b[1].atualizadoEm || 0) - (a[1].atualizadoEm || 0))
      .slice(0, LIMITE_BUCKETS);
    localStorage.setItem(STORAGE_ARQUIVOS, JSON.stringify(Object.fromEntries(entradas)));
  } catch {
    /* quota / modo privado */
  }
}

function persistirBucketAtual() {
  const store = lerStoreArquivos();
  store[chaveBucket()] = {
    arquivos: [...arquivosSessao.values()],
    atualizadoEm: Date.now(),
  };
  gravarStoreArquivos(store);
}

function carregarBucket(chave) {
  arquivosSessao.clear();
  pendentesNovos.clear();
  const bucket = lerStoreArquivos()[chave];
  if (!bucket?.arquivos?.length) return;
  for (const a of bucket.arquivos) {
    if (!a?.caminho) continue;
    arquivosSessao.set(a.caminho, {
      caminho: a.caminho,
      nome: a.nome || nomeDoArquivo(a.caminho),
      extensao: a.extensao || extensaoDe(a.caminho),
      modificado: a.modificado || 0,
    });
  }
}

/** Troca o bucket da lista conforme a sessão Claude (histórico / nova conversa). */
function trocarSessaoClaude(novoId, { migrarPendente = false } = {}) {
  const id = (novoId && String(novoId).trim()) || null;
  if (id === claudeSessaoId) {
    if (migrarPendente && id) {
      // Mesmo ID, mas acabou de ser confirmado pelo Claude — migra pendente se houver.
      const store = lerStoreArquivos();
      const pendente = store[CHAVE_PENDENTE]?.arquivos || [];
      if (pendente.length) {
        for (const a of pendente) registrarNaSessao(a, { marcarNovo: false, persistir: false });
        delete store[CHAVE_PENDENTE];
        gravarStoreArquivos(store);
        persistirBucketAtual();
        montarPainelSessao();
      }
    }
    return;
  }

  const anterior = claudeSessaoId;
  const arquivosAntes = [...arquivosSessao.values()];
  persistirBucketAtual();

  claudeSessaoId = id;
  carregarBucket(chaveBucket());

  // Conversa ao vivo recebeu ID do Claude: migra o que estava em pendente.
  if (migrarPendente && !anterior && id && arquivosAntes.length) {
    for (const a of arquivosAntes) registrarNaSessao(a, { marcarNovo: false, persistir: false });
    const store = lerStoreArquivos();
    delete store[CHAVE_PENDENTE];
    gravarStoreArquivos(store);
    persistirBucketAtual();
  } else if (!migrarPendente && id) {
    // Abriu conversa do histórico — não mistura com pendente órfão.
    const store = lerStoreArquivos();
    if (store[CHAVE_PENDENTE]) {
      delete store[CHAVE_PENDENTE];
      gravarStoreArquivos(store);
    }
  }

  montarPainelSessao();
  carregarDashboard().catch(console.error);
}

function iconeArquivo(ext) {
  return ICONE_EXT[ext] || 'lucide:file';
}

function acharArquivo(no, caminho) {
  if (!no) return null;
  if (no.tipo === 'arquivo' && no.caminho === caminho) return no;
  for (const filho of no.filhos || []) {
    const achado = acharArquivo(filho, caminho);
    if (achado) return achado;
  }
  return null;
}

function coletarArquivos(no, lista = []) {
  if (!no) return lista;
  if (no.tipo === 'arquivo') {
    lista.push(no);
    return lista;
  }
  for (const filho of no.filhos || []) coletarArquivos(filho, lista);
  return lista;
}

function pastasAbertasAgora() {
  const abertas = new Set();
  document.querySelectorAll('#ide-arvore details[data-caminho][open]').forEach((detalhe) => {
    abertas.add(detalhe.dataset.caminho);
  });
  return abertas;
}

/** Pastas ancestrais de cada arquivo da sessão — para expandir a árvore até eles. */
function pastasComSessao() {
  const pastas = new Set();
  for (const caminho of arquivosSessao.keys()) {
    const partes = String(caminho).split('/');
    let acumulado = '';
    for (let i = 0; i < partes.length - 1; i++) {
      acumulado = acumulado ? `${acumulado}/${partes[i]}` : partes[i];
      pastas.add(acumulado);
    }
  }
  return pastas;
}

function destacarSelecao(caminho) {
  document.querySelectorAll('#ide-arvore [data-caminho]').forEach((no) => {
    if (no.tagName === 'DETAILS') return;
    const ativo = no.dataset.caminho === caminho;
    no.classList.toggle('bg-vekta-suave', ativo);
    no.classList.toggle('text-vekta', ativo);
  });
}

function nomeDoArquivo(caminho) {
  const partes = String(caminho || '').split('/');
  return partes[partes.length - 1] || 'arquivo';
}

function urlRaw(caminho, cacheBust) {
  const base = `/raw/${String(caminho).split('/').map(encodeURIComponent).join('/')}`;
  return cacheBust != null ? `${base}?t=${encodeURIComponent(cacheBust)}` : base;
}

/** Escapa valor para uso dentro de seletor com aspas: [data-caminho="…"]. */
function escapeAttr(valor) {
  return String(valor || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function expandirAte(caminho) {
  const partes = String(caminho || '').split('/');
  let acumulado = '';
  for (let i = 0; i < partes.length - 1; i++) {
    acumulado = acumulado ? `${acumulado}/${partes[i]}` : partes[i];
    const detalhes = document.querySelector(`#ide-arvore details[data-caminho="${escapeAttr(acumulado)}"]`);
    if (detalhes) detalhes.open = true;
  }
}

function rolarAteNaArvore(caminho) {
  const no = document.querySelector(`#ide-arvore [data-caminho="${escapeAttr(caminho)}"]`);
  if (!no || no.tagName === 'DETAILS') return;
  no.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  no.classList.remove('ide-arquivo-pulse');
  // Force reflow para reiniciar a animação.
  void no.offsetWidth;
  no.classList.add('ide-arquivo-pulse');
}

function marcarVisto(caminho) {
  if (!caminho) return;
  pendentesNovos.delete(caminho);
  document.querySelectorAll(`#ide-arvore [data-caminho="${escapeAttr(caminho)}"] .ide-badge-novo`).forEach((b) => b.remove());
  document.querySelectorAll(`#ide-sessao-lista [data-caminho="${escapeAttr(caminho)}"]`).forEach((item) => {
    item.classList.remove('ide-sessao-item-novo');
    item.querySelector('.ide-badge-novo')?.remove();
  });
}

function atualizarBotoesCabecalho() {
  const temArquivo = !!caminhoAberto;
  const ext = temArquivo ? extensaoDe(caminhoAberto) : '';
  const ehMd = ext === '.md';
  const ehImagem = EXTENSOES_IMAGEM.has(ext);
  $('#ide-excluir').hidden = !temArquivo || editando;
  $('#ide-editar').hidden = !ehMd || editando;
  $('#ide-salvar').hidden = !editando;
  $('#ide-cancelar-edicao').hidden = !editando;

  const baixar = $('#ide-baixar');
  if (baixar) {
    baixar.hidden = !ehImagem || editando;
    if (ehImagem && caminhoAberto) {
      baixar.href = urlRaw(caminhoAberto, metaAberto?.modificado);
      baixar.setAttribute('download', nomeDoArquivo(caminhoAberto));
    } else {
      baixar.removeAttribute('href');
      baixar.removeAttribute('download');
    }
  }

  const aviso = $('#ide-aviso-salvar');
  if (aviso && !editando) {
    aviso.hidden = true;
    aviso.textContent = '';
  }
}

function mostrarVazio() {
  caminhoAberto = null;
  metaAberto = null;
  editando = false;
  conteudoEdicao = '';
  $('#ide-caminho').textContent = 'Nenhum arquivo selecionado';
  atualizarBotoesCabecalho();
  const corpo = $('#ide-corpo');
  corpo.innerHTML = '';
  corpo.append(
    el('div', { id: 'ide-vazio', class: 'h-full min-h-50 flex flex-col items-center justify-center text-center px-6 text-cinza' },
      el('iconify-icon', { noobserver: '', icon: 'lucide:panel-left', class: 'text-[36px] text-cinza-claro mb-3', 'aria-hidden': 'true' }),
      el('p', { class: 'font-display text-lg text-tinta mb-1' }, 'Workspace Vekta'),
      el('p', { class: 'text-sm max-w-80' }, 'Selecione um arquivo na árvore à esquerda para visualizar. O chat fica à direita — a mesma conversa da aba Chat.'))
  );
}

async function abrirArquivo(caminho, { modificado, forcar = false } = {}) {
  if (editando && caminhoAberto === caminho && !forcar) return;

  caminhoAberto = caminho;
  metaAberto = { modificado: modificado ?? Date.now() };
  editando = false;
  conteudoEdicao = '';
  $('#ide-caminho').textContent = caminho;
  atualizarBotoesCabecalho();
  destacarSelecao(caminho);
  marcarVisto(caminho);

  const corpo = $('#ide-corpo');
  corpo.innerHTML = '';
  await renderizarPreview(caminho, corpo, {
    imagemClass: 'max-w-full max-h-full block mx-auto rounded-lg',
    videoClass: 'max-w-full max-h-[calc(100vh-8rem)] block mx-auto rounded-lg',
    cacheBust: metaAberto.modificado,
  });
}

/** Abre um arquivo na IDE: expande pastas, destaca e mostra o preview. */
async function revelarEAbrir(caminho, { modificado } = {}) {
  if (!caminho) return;
  expandirAte(caminho);
  await abrirArquivo(caminho, { modificado, forcar: true });
  rolarAteNaArvore(caminho);
}

async function entrarModoEdicao() {
  if (!caminhoAberto || extensaoDe(caminhoAberto) !== '.md') return;
  try {
    const { conteudo } = await api(`/api/arquivo?caminho=${encodeURIComponent(caminhoAberto)}`);
    conteudoEdicao = conteudo ?? '';
    editando = true;
    atualizarBotoesCabecalho();

    const corpo = $('#ide-corpo');
    corpo.innerHTML = '';
    const editor = el('textarea', {
      id: 'ide-editor-md',
      class: 'w-full h-full min-h-75 resize-none border border-linha rounded-lg px-3.5 py-3 font-mono text-sm leading-relaxed text-tinta bg-superficie focus:outline-2 focus:-outline-offset-1 focus:outline-vekta',
      spellcheck: 'false',
    });
    editor.value = conteudoEdicao;
    editor.addEventListener('input', () => { conteudoEdicao = editor.value; });
    corpo.append(editor);
    editor.focus();
  } catch (erro) {
    const aviso = $('#ide-aviso-salvar');
    if (aviso) {
      aviso.hidden = false;
      aviso.textContent = erro.message;
    }
  }
}

async function salvarEdicao() {
  if (!caminhoAberto || !editando) return;
  const botao = $('#ide-salvar');
  const aviso = $('#ide-aviso-salvar');
  botao.disabled = true;
  if (aviso) {
    aviso.hidden = true;
    aviso.textContent = '';
  }
  try {
    const editor = $('#ide-editor-md');
    const conteudo = editor ? editor.value : conteudoEdicao;
    const { modificado } = await api('/api/arquivo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caminho: caminhoAberto, conteudo }),
    });
    registrarNaSessao({
      caminho: caminhoAberto,
      nome: nomeDoArquivo(caminhoAberto),
      extensao: extensaoDe(caminhoAberto),
      modificado,
    }, { marcarNovo: false });
    await abrirArquivo(caminhoAberto, { modificado, forcar: true });
  } catch (erro) {
    if (aviso) {
      aviso.hidden = false;
      aviso.textContent = `Erro: ${erro.message}`;
    }
    botao.disabled = false;
  }
}

async function cancelarEdicao() {
  if (!caminhoAberto) return;
  await abrirArquivo(caminhoAberto, { modificado: metaAberto?.modificado, forcar: true });
}

function registrarNaSessao(arquivo, { marcarNovo = true, persistir = true } = {}) {
  if (!arquivo?.caminho) return false;
  const anterior = arquivosSessao.get(arquivo.caminho);
  const mudou = !anterior || anterior.modificado !== arquivo.modificado;
  arquivosSessao.set(arquivo.caminho, {
    caminho: arquivo.caminho,
    nome: arquivo.nome || nomeDoArquivo(arquivo.caminho),
    extensao: arquivo.extensao || extensaoDe(arquivo.caminho),
    modificado: arquivo.modificado || Date.now(),
  });
  if (marcarNovo && mudou && arquivo.caminho !== caminhoAberto) {
    pendentesNovos.add(arquivo.caminho);
  }
  if (persistir && mudou) persistirBucketAtual();
  return mudou;
}

/**
 * Compara a árvore atual com o snapshot: caminhos novos ou mtime maior
 * entram em "Nesta sessão". No primeiro load só grava o snapshot.
 */
function sincronizarSessaoComArvore(projeto) {
  const arquivos = coletarArquivos(projeto);
  const recemChegados = [];

  if (!snapshotPronto) {
    for (const a of arquivos) snapshotMtimes.set(a.caminho, a.modificado || 0);
    snapshotPronto = true;
    return recemChegados;
  }

  for (const a of arquivos) {
    const mtime = a.modificado || 0;
    const conhecido = snapshotMtimes.has(a.caminho);
    const anterior = snapshotMtimes.get(a.caminho) || 0;
    if (!conhecido || mtime > anterior) {
      const mudou = registrarNaSessao(a, { marcarNovo: true });
      if (mudou) recemChegados.push(a);
    }
    snapshotMtimes.set(a.caminho, mtime);
  }

  return recemChegados;
}

function listaSessaoOrdenada() {
  return [...arquivosSessao.values()]
    .sort((a, b) => (b.modificado || 0) - (a.modificado || 0))
    .slice(0, LIMITE_SESSAO);
}

function montarPainelSessao() {
  const painel = $('#ide-sessao');
  const lista = $('#ide-sessao-lista');
  const contador = $('#ide-sessao-count');
  const idEl = $('#ide-sessao-id');
  if (!painel || !lista) return;

  if (idEl) {
    if (claudeSessaoId) {
      idEl.hidden = false;
      idEl.title = claudeSessaoId;
    } else {
      idEl.hidden = true;
      idEl.removeAttribute('title');
    }
  }

  const itens = listaSessaoOrdenada();
  if (itens.length === 0) {
    painel.hidden = true;
    lista.innerHTML = '';
    if (contador) contador.textContent = '';
    return;
  }

  painel.hidden = false;
  if (contador) contador.textContent = String(arquivosSessao.size);
  lista.innerHTML = '';

  for (const item of itens) {
    const ehNovo = pendentesNovos.has(item.caminho);
    const botao = el(
      'button',
      {
        type: 'button',
        class: `ide-sessao-item group flex items-center gap-1.5 w-full py-1 px-1.5 rounded-md text-left font-mono text-[11px] transition-colors hover:bg-fundo ${ehNovo ? 'ide-sessao-item-novo text-tinta' : 'text-cinza hover:text-tinta'}`,
        title: item.caminho,
        'data-caminho': item.caminho,
        onclick: () => revelarEAbrir(item.caminho, { modificado: item.modificado }).catch(console.error),
      },
      el('iconify-icon', {
        noobserver: '',
        icon: iconeArquivo(item.extensao),
        class: 'shrink-0 text-[12px] text-vekta',
        'aria-hidden': 'true',
      }),
      el('span', { class: 'truncate flex-1 min-w-0' }, item.nome),
    );
    if (ehNovo) {
      botao.append(el('span', { class: 'ide-badge-novo shrink-0' }, 'Novo'));
    }
    lista.append(botao);
  }
}

function removerDaSessao(caminho) {
  if (!caminho) return;
  arquivosSessao.delete(caminho);
  pendentesNovos.delete(caminho);
  snapshotMtimes.delete(caminho);
  persistirBucketAtual();
  montarPainelSessao();
}

async function excluirArquivoAberto() {
  if (!caminhoAberto || editando) return;
  const nome = nomeDoArquivo(caminhoAberto);
  if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;

  const caminho = caminhoAberto;
  const btn = $('#ide-excluir');
  if (btn) btn.disabled = true;
  try {
    await api(`/api/arquivo?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' });
    removerDaSessao(caminho);
    mostrarVazio();
    await carregarDashboard();
  } catch (erro) {
    alert(erro.message || 'Falha ao excluir arquivo.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function limparSessao() {
  arquivosSessao.clear();
  pendentesNovos.clear();
  const store = lerStoreArquivos();
  delete store[chaveBucket()];
  gravarStoreArquivos(store);
  montarPainelSessao();
  carregarDashboard().catch(console.error);
}

function montarNo(no, profundidade, pastasAbertas) {
  if (no.tipo === 'pasta') {
    const naSessao = pastasComSessao().has(no.caminho);
    const estavaAberta = pastasAbertas.has(no.caminho);
    const aberta = estavaAberta || naSessao || (!arvoreJaMontada && profundidade < 1);
    const detalhes = el(
      'details',
      {
        class: 'group/pasta',
        'data-caminho': no.caminho,
        ...(aberta ? { open: '' } : {}),
      },
      el(
        'summary',
        {
          class: 'list-none flex items-center gap-1.5 py-1 px-1.5 rounded-md cursor-pointer text-tinta hover:bg-fundo [&::-webkit-details-marker]:hidden select-none',
          style: `padding-left: ${6 + profundidade * 12}px`,
        },
        el('iconify-icon', {
          noobserver: '',
          icon: 'lucide:chevron-right',
          class: 'ide-arvore-chevron shrink-0 text-cinza-claro text-[12px] transition-transform',
          'aria-hidden': 'true',
        }),
        el('iconify-icon', {
          noobserver: '',
          icon: 'lucide:folder',
          class: 'ide-arvore-folder-fechada shrink-0 text-vekta text-[14px]',
          'aria-hidden': 'true',
        }),
        el('iconify-icon', {
          noobserver: '',
          icon: 'lucide:folder-open',
          class: 'ide-arvore-folder-aberta hidden shrink-0 text-vekta text-[14px]',
          'aria-hidden': 'true',
        }),
        el('span', { class: 'truncate text-[13px] font-medium' }, no.nome)
      )
    );

    const filhos = no.filhos || [];
    if (filhos.length === 0) {
      detalhes.append(el(
        'p',
        {
          class: 'text-[11px] text-cinza-claro py-0.5 pr-1',
          style: `padding-left: ${22 + (profundidade + 1) * 12}px`,
        },
        no.ausente ? 'Pasta ainda não criada' : 'Vazia'
      ));
    } else {
      detalhes.append(...filhos.map((filho) => montarNo(filho, profundidade + 1, pastasAbertas)));
    }
    return detalhes;
  }

  const naSessao = arquivosSessao.has(no.caminho);
  const ehNovo = pendentesNovos.has(no.caminho);
  const classes = [
    'group flex items-center gap-1.5 w-full py-1 px-1.5 rounded-md bg-transparent font-mono text-[12px] text-left hover:bg-fundo hover:text-tinta',
    naSessao ? 'ide-arquivo-sessao text-tinta' : 'text-cinza',
    ehNovo ? 'ide-arquivo-novo' : '',
  ].filter(Boolean).join(' ');

  const botao = el(
    'button',
    {
      type: 'button',
      class: classes,
      style: `padding-left: ${22 + profundidade * 12}px`,
      title: no.caminho,
      'data-caminho': no.caminho,
      onclick: () => abrirArquivo(no.caminho, { modificado: no.modificado }).catch(console.error),
    },
    el('iconify-icon', {
      noobserver: '',
      icon: iconeArquivo(no.extensao),
      class: 'shrink-0 text-[13px] text-cinza-claro group-hover:text-vekta',
      'aria-hidden': 'true',
    }),
    el('span', { class: 'truncate flex-1 min-w-0' }, no.nome)
  );

  if (ehNovo) {
    botao.append(el('span', { class: 'ide-badge-novo shrink-0' }, 'Novo'));
  }

  return botao;
}

function montarArvore(projeto, pastasAbertas = new Set()) {
  const alvo = $('#ide-arvore');
  alvo.innerHTML = '';

  if (!projeto || !projeto.filhos || projeto.filhos.length === 0) {
    alvo.append(el('p', { class: CLASSE_VAZIO }, 'Nenhuma pasta do workspace encontrada.'));
    return;
  }

  const raizLabel = el(
    'div',
    { class: 'flex items-center gap-1.5 px-1.5 py-1 mb-1 text-cinza' },
    el('iconify-icon', { noobserver: '', icon: 'lucide:hard-drive', class: 'text-[13px] text-vekta', 'aria-hidden': 'true' }),
    el('span', { class: 'font-mono text-[11px] uppercase tracking-wider truncate' }, projeto.nome || 'projeto')
  );
  alvo.append(raizLabel, ...projeto.filhos.map((filho) => montarNo(filho, 0, pastasAbertas)));

  arvoreJaMontada = true;
  if (caminhoAberto) destacarSelecao(caminhoAberto);
}

async function carregarDashboard() {
  try {
    const pastasAbertas = pastasAbertasAgora();
    const [status, arvores] = await Promise.all([
      api('/api/status'),
      api('/api/arvore'),
    ]);

    const estavaVazio = !caminhoAberto;
    const recemChegados = sincronizarSessaoComArvore(arvores.projeto);

    montarArvore(arvores.projeto, pastasAbertas);
    montarPainelSessao();

    const statusEl = $('#ide-explorer-status');
    if (statusEl) {
      const nSessao = arquivosSessao.size;
      const base = status.dnaInstalado
        ? `DNA ok · ${status.totais.marketing + status.totais.saidas} arquivos`
        : 'DNA pendente — rode /instalar';
      statusEl.textContent = nSessao > 0 ? `${base} · ${nSessao} nesta conversa` : base;
    }

    // Se o workspace estava vazio e acabou de chegar arquivo novo, abre o mais recente.
    if (estavaVazio && !editando && recemChegados.length > 0) {
      const maisRecente = [...recemChegados].sort((a, b) => (b.modificado || 0) - (a.modificado || 0))[0];
      await revelarEAbrir(maisRecente.caminho, { modificado: maisRecente.modificado });
      return;
    }

    if (!caminhoAberto) return;

    const no = acharArquivo(arvores.projeto, caminhoAberto);
    if (!no) {
      mostrarVazio();
      return;
    }

    if (editando) {
      destacarSelecao(caminhoAberto);
      return;
    }

    const modificadoMudou = !metaAberto || no.modificado !== metaAberto.modificado;
    if (modificadoMudou) {
      await abrirArquivo(caminhoAberto, { modificado: no.modificado, forcar: true });
    } else {
      destacarSelecao(caminhoAberto);
    }
  } catch (erro) {
    console.error('Falha ao carregar o workspace:', erro);
  }
}

function ligarControles() {
  if ($('#ide-atualizar-arvore')?.dataset.ligado) return;
  $('#ide-atualizar-arvore').dataset.ligado = '1';

  $('#ide-atualizar-arvore')?.addEventListener('click', () => {
    carregarDashboard().catch(console.error);
  });

  $('#ide-sessao-limpar')?.addEventListener('click', () => {
    limparSessao();
  });

  $('#ide-excluir')?.addEventListener('click', () => {
    excluirArquivoAberto().catch(console.error);
  });

  $('#ide-editar')?.addEventListener('click', () => {
    entrarModoEdicao().catch(console.error);
  });

  $('#ide-salvar')?.addEventListener('click', () => {
    salvarEdicao().catch(console.error);
  });

  $('#ide-cancelar-edicao')?.addEventListener('click', () => {
    cancelarEdicao().catch(console.error);
  });

  document.addEventListener('vekta-ai:abrir-arquivo', (evento) => {
    const caminho = evento.detail?.caminho;
    if (!caminho) return;
    const modificado = evento.detail?.modificado;
    registrarNaSessao({
      caminho,
      nome: nomeDoArquivo(caminho),
      extensao: extensaoDe(caminho),
      modificado: modificado ?? Date.now(),
    }, { marcarNovo: false });
    carregarDashboard()
      .then(() => revelarEAbrir(caminho, { modificado }))
      .catch(console.error);
  });

  document.addEventListener('vekta-ai:sessao-claude', (evento) => {
    trocarSessaoClaude(evento.detail?.sessaoId || null, {
      migrarPendente: !!evento.detail?.migrarPendente,
    });
  });

  document.addEventListener('vekta-ai:arquivos-claude', (evento) => {
    const id = evento.detail?.sessaoId;
    if (id && id !== claudeSessaoId) {
      trocarSessaoClaude(id, { migrarPendente: true });
    }
    const lista = evento.detail?.arquivos || [];
    let mudouAlgo = false;
    for (const item of lista) {
      const caminho = item?.caminho;
      if (!caminho) continue;
      const mudou = registrarNaSessao({
        caminho,
        nome: item.rotulo || nomeDoArquivo(caminho),
        extensao: extensaoDe(caminho),
        modificado: Date.now(),
      }, { marcarNovo: true, persistir: false });
      if (mudou) mudouAlgo = true;
    }
    if (mudouAlgo) {
      persistirBucketAtual();
      montarPainelSessao();
    }
  });

  configurarResizeChat();
}

function configurarResizeChat() {
  const handle = $('#ide-resize-chat');
  const painel = $('#chat-slot-ide');
  if (!handle || !painel || handle.dataset.ligado) return;
  handle.dataset.ligado = '1';

  let ativo = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('pointerdown', (e) => {
    ativo = true;
    startX = e.clientX;
    startW = painel.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('ide-resizing');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!ativo) return;
    const delta = startX - e.clientX;
    const nova = Math.min(Math.max(startW + delta, 280), Math.min(640, window.innerWidth * 0.5));
    painel.style.width = `${nova}px`;
  });

  const soltar = () => {
    if (!ativo) return;
    ativo = false;
    document.body.classList.remove('ide-resizing');
  };
  handle.addEventListener('pointerup', soltar);
  handle.addEventListener('pointercancel', soltar);
}

export async function iniciar() {
  ligarControles();
  carregarBucket(chaveBucket());
  document.dispatchEvent(new CustomEvent('vekta-ai:pedir-sessao-claude'));
  await carregarDashboard();
}

export const atualizar = carregarDashboard;
