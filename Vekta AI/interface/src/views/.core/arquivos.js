/* Widgets de arquivo baixável (bloco ```vekta-arquivo).
   Usado pelo chat principal e pelo chat da Galeria — espelha o padrão de perguntas.js. */
import { el, CLASSE_BOTAO, CLASSE_BOTAO_PRIMARIO, EXTENSOES_IMAGEM, EXTENSOES_VIDEO, extensaoDe, animarEntrada } from './util.js';

const RE_ARQUIVO = /```vekta-arquivo\s*\n([\s\S]*?)```/g;

const ICONE_POR_EXT = {
  '.pdf': 'lucide:file-type-2',
  '.png': 'lucide:image',
  '.jpg': 'lucide:image',
  '.jpeg': 'lucide:image',
  '.webp': 'lucide:image',
  '.gif': 'lucide:image',
  '.mp4': 'lucide:film',
  '.webm': 'lucide:film',
  '.mov': 'lucide:film',
  '.md': 'lucide:file-text',
  '.txt': 'lucide:file-text',
  '.html': 'lucide:code-2',
  '.csv': 'lucide:table',
  '.zip': 'lucide:file-archive',
};

function nomeDoCaminho(caminho) {
  const partes = String(caminho || '').split(/[/\\]/);
  return partes[partes.length - 1] || caminho;
}

/** Normaliza um item do JSON do bloco para { caminho, rotulo }. */
function normalizarItem(item) {
  if (typeof item === 'string') {
    const caminho = item.trim().replace(/\\/g, '/');
    return caminho ? { caminho, rotulo: nomeDoCaminho(caminho) } : null;
  }
  if (!item || typeof item !== 'object') return null;
  const caminho = String(item.caminho || '').trim().replace(/\\/g, '/');
  if (!caminho || caminho.includes('..')) return null;
  const rotulo = typeof item.rotulo === 'string' && item.rotulo.trim()
    ? item.rotulo.trim()
    : nomeDoCaminho(caminho);
  return { caminho, rotulo };
}

/** Extrai itens de um corpo JSON (objeto único, lista, ou { arquivos: [...] }). */
function itensDoJson(dados) {
  if (Array.isArray(dados)) return dados.map(normalizarItem).filter(Boolean);
  if (dados && typeof dados === 'object') {
    if (Array.isArray(dados.arquivos)) return dados.arquivos.map(normalizarItem).filter(Boolean);
    const unico = normalizarItem(dados);
    return unico ? [unico] : [];
  }
  return [];
}

/** Separa o texto exibível dos blocos de arquivo. JSON incompleto some até fechar. */
export function analisarArquivos(texto) {
  const arquivos = [];
  const limpo = String(texto || '').replace(RE_ARQUIVO, (_, corpo) => {
    try {
      const itens = itensDoJson(JSON.parse(corpo.trim()));
      arquivos.push(...itens);
    } catch { /* bloco incompleto durante o streaming */ }
    return '';
  });
  return { limpo: limpo.trim(), arquivos };
}

/** Remove fence aberto de arquivo ainda em streaming. */
export function ocultarArquivoEmStreaming(texto) {
  return String(texto || '').replace(/```vekta-arquivo[\s\S]*$/, '').trimEnd();
}

function urlRaw(caminho, { download = false } = {}) {
  const base = `/raw/${caminho.split('/').map(encodeURIComponent).join('/')}`;
  return download ? `${base}?download=1` : base;
}

/** Card com caminho + botão Baixar (e Abrir em nova aba). */
export function montarArquivo(item) {
  const ext = extensaoDe(item.caminho);
  const icone = ICONE_POR_EXT[ext] || 'lucide:file';
  const url = urlRaw(item.caminho);
  const urlDownload = urlRaw(item.caminho, { download: true });
  const ehMidia = EXTENSOES_IMAGEM.has(ext) || EXTENSOES_VIDEO.has(ext);

  const widget = el('div', {
    class: 'chat-arquivo w-full max-w-[min(100%,28rem)] flex flex-col gap-3',
    role: 'group',
    'aria-label': item.rotulo,
  });

  widget.append(
    el('div', { class: 'chat-arquivo-cabecalho flex items-center gap-2' },
      el('span', { class: 'chat-arquivo-badge inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0' },
        el('iconify-icon', { noobserver: '', icon: icone, class: 'text-[16px]', 'aria-hidden': 'true' })),
      el('span', { class: 'font-mono text-[11px] uppercase tracking-widest text-vekta' }, 'Arquivo pronto')),
    el('p', { class: 'chat-arquivo-titulo font-display text-base font-semibold tracking-tight text-tinta leading-snug' }, item.rotulo),
    el('code', { class: 'chat-arquivo-caminho font-mono text-[11px] text-cinza break-all' }, item.caminho),
  );

  if (ehMidia && EXTENSOES_IMAGEM.has(ext)) {
    widget.append(el('img', {
      src: url,
      alt: item.rotulo,
      class: 'chat-arquivo-preview max-h-40 w-auto rounded-lg object-contain self-start bg-fundo',
      loading: 'lazy',
    }));
  }

  const acoes = el('div', { class: 'chat-arquivo-acoes flex flex-wrap gap-2' },
    el('button', {
      type: 'button',
      class: CLASSE_BOTAO_PRIMARIO,
      onclick: () => {
        document.dispatchEvent(new CustomEvent('vekta-ai:abrir-na-visao-geral', {
          detail: { caminho: item.caminho },
        }));
      },
    },
      el('iconify-icon', { noobserver: '', icon: 'lucide:panel-left', class: 'text-[15px]', 'aria-hidden': 'true' }),
      'Ver na Visão geral'),
    el('a', {
      href: urlDownload,
      download: nomeDoCaminho(item.caminho),
      class: CLASSE_BOTAO,
    },
      el('iconify-icon', { noobserver: '', icon: 'lucide:download', class: 'text-[15px]', 'aria-hidden': 'true' }),
      'Baixar'),
    el('a', {
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
      class: CLASSE_BOTAO,
    },
      el('iconify-icon', { noobserver: '', icon: 'lucide:external-link', class: 'text-[15px]', 'aria-hidden': 'true' }),
      'Abrir'));

  widget.append(acoes);
  animarEntrada([widget], { translateY: [8, 0], duration: 280, delay: 0 });
  return widget;
}

/** Anexa os cards de arquivo ao container (filho do turno do assistente). */
export function anexarArquivos(container, arquivos) {
  if (!arquivos?.length) return;
  const bloco = el('div', { class: 'chat-arquivos flex flex-col gap-3 w-full mt-1' });
  for (const a of arquivos) bloco.append(montarArquivo(a));
  container.append(bloco);
}
