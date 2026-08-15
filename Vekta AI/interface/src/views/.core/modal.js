/* Modal / lightbox de preview de arquivo (#veu) — vive na casca (index.html)
   e é usado por qualquer página que precise abrir um preview de arquivo.
   Também exporta renderizarPreview para o editor inline da Visão geral. */
import { $, el, api, md, PODE_ANIMAR, EXTENSOES_TEXTO, EXTENSOES_IMAGEM, EXTENSOES_VIDEO, extensaoDe } from './util.js';

const veu = $('#veu');
let caminhoNoModal = null;

function abrirModal(caminho) {
  caminhoNoModal = caminho;
  $('#modal-caminho').textContent = caminho;
  $('#modal-corpo').innerHTML = '';
  veu.classList.remove('hidden');
  if (PODE_ANIMAR) anime({ targets: veu, opacity: [0, 1], duration: 180, easing: 'linear' });
}

function fecharModal() {
  veu.classList.add('hidden');
  $('#modal-corpo').innerHTML = ''; // interrompe vídeo em reprodução
}

$('#modal-fechar').addEventListener('click', fecharModal);
veu.addEventListener('click', (e) => { if (e.target === veu) fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !veu.classList.contains('hidden')) fecharModal(); });
$('#modal-revelar').addEventListener('click', () => {
  if (caminhoNoModal) {
    api('/api/revelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caminho: caminhoNoModal }),
    }).catch(() => {});
  }
});

/** URL de /raw/ com segmentos codificados e opcional cache-bust (mtime). */
function urlRaw(caminho, cacheBust) {
  const base = `/raw/${String(caminho).split('/').map(encodeURIComponent).join('/')}`;
  return cacheBust != null ? `${base}?t=${encodeURIComponent(cacheBust)}` : base;
}

/** Renderiza o preview de um arquivo dentro de `alvo` (modal ou editor IDE). */
export async function renderizarPreview(caminho, alvo, { imagemClass = 'max-w-full max-h-[68vh] block mx-auto rounded-lg', videoClass = imagemClass, cacheBust } = {}) {
  alvo.innerHTML = '';
  const ext = extensaoDe(caminho);

  if (EXTENSOES_IMAGEM.has(ext)) {
    alvo.append(el('img', {
      src: urlRaw(caminho, cacheBust), alt: caminho,
      class: imagemClass,
    }));
    return;
  }
  if (EXTENSOES_VIDEO.has(ext)) {
    alvo.append(el('video', {
      src: urlRaw(caminho, cacheBust), controls: '', autoplay: '',
      class: videoClass,
    }));
    return;
  }
  if (EXTENSOES_TEXTO.has(ext)) {
    try {
      const { conteudo } = await api(`/api/arquivo?caminho=${encodeURIComponent(caminho)}`);
      if (ext === '.md') {
        const caixa = el('div', { class: 'markdown' });
        caixa.innerHTML = md(conteudo);
        alvo.append(caixa);
      } else {
        alvo.append(el('pre', { class: 'font-mono text-xs whitespace-pre-wrap break-words text-tinta' }, conteudo));
      }
    } catch (erro) {
      alvo.append(el('pre', { class: 'font-mono text-xs whitespace-pre-wrap break-words text-alerta' }, erro.message));
    }
    return;
  }
  alvo.append(el('pre', { class: 'font-mono text-xs whitespace-pre-wrap break-words text-cinza' }, 'Sem preview para este tipo de arquivo. Use "Abrir no Explorer".'));
}

export async function visualizarArquivo(caminho, cacheBust) {
  abrirModal(caminho);
  await renderizarPreview(caminho, $('#modal-corpo'), { cacheBust });
}
