/* Página: preview do site (VEKTA_SITE_DIR) + chat exclusivo (canal "site"). */
import { $, el, api, md } from '../.core/util.js';
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

const CANAL = 'site';
const TIPOS_IMAGEM = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TAMANHO_MAX = 5 * 1024 * 1024;
const MAX_ANEXOS = 5;

let chatPronto = false;
/** @type {{ existe: boolean, temBuild: boolean, urlPreview: string, caminho?: string } | null} */
let infoSite = null;

function urlPreviewComCache() {
  const base = infoSite?.urlPreview || '/site-preview/';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}t=${Date.now()}`;
}

function mostrarStatusBuild(texto, erro = false) {
  const elStatus = $('#site-build-status');
  if (!elStatus) return;
  if (!texto) {
    elStatus.hidden = true;
    elStatus.textContent = '';
    return;
  }
  elStatus.hidden = false;
  elStatus.textContent = texto;
  elStatus.classList.toggle('text-alerta', erro);
  elStatus.classList.toggle('border-alerta', erro);
}

function aplicarEstadoPreview() {
  const frame = $('#site-frame');
  const vazio = $('#site-vazio');
  const caminho = $('#site-caminho');
  const btnRebuild = $('#site-rebuild');
  const msg = $('#site-vazio-msg');

  const ok = !!(infoSite?.configurado && infoSite?.existe);
  if (caminho) {
    caminho.textContent = infoSite?.caminho || 'VEKTA_SITE_DIR';
  }
  if (btnRebuild) {
    btnRebuild.hidden = !infoSite?.temBuild;
  }

  if (ok) {
    vazio?.classList.add('hidden');
    if (frame) {
      frame.classList.remove('hidden');
      frame.src = urlPreviewComCache();
    }
  } else {
    frame?.classList.add('hidden');
    if (frame) frame.removeAttribute('src');
    vazio?.classList.remove('hidden');
    if (msg) {
      if (!infoSite?.configurado) {
        msg.innerHTML =
          'Defina <code class="font-mono text-xs">VEKTA_SITE_DIR</code> em '
          + '<code class="font-mono text-xs">interface/.env</code> apontando para '
          + 'a pasta com o <code class="font-mono text-xs">index.html</code> do site '
          + '(ex.: <code class="font-mono text-xs">…/web/dist</code>).';
      } else {
        msg.innerHTML =
          `A pasta <code class="font-mono text-xs">${infoSite.caminho || ''}</code> `
          + 'não existe. Gere o build do site ou ajuste o caminho no '
          + '<code class="font-mono text-xs">.env</code>.';
      }
    }
  }
}

function recarregarPreview() {
  const frame = $('#site-frame');
  if (!frame || !infoSite?.existe) return;
  frame.src = urlPreviewComCache();
}

async function carregarSite() {
  try {
    infoSite = await api('/api/site');
  } catch (erro) {
    console.error('[site]', erro);
    infoSite = { configurado: false, existe: false, temBuild: false, urlPreview: '/site-preview/' };
  }
  aplicarEstadoPreview();
}

async function rebuildSite() {
  const btn = $('#site-rebuild');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  mostrarStatusBuild('Build em andamento…');
  try {
    const resultado = await api('/api/site/build', { method: 'POST' });
    if (resultado.ok) {
      mostrarStatusBuild('Build concluído.');
      await carregarSite();
      recarregarPreview();
      setTimeout(() => mostrarStatusBuild(''), 4000);
    } else {
      const detalhe = resultado.erro || resultado.stderr || 'Build falhou.';
      mostrarStatusBuild(detalhe.slice(0, 280), true);
    }
  } catch (erro) {
    mostrarStatusBuild(erro.message || String(erro), true);
  } finally {
    btn.disabled = false;
  }
}

// ==========================================================
// Chat do site (canal site — envelope /interface + contexto na 1ª msg)
// ==========================================================
function lerArquivoComoDataUrl(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function iniciarChatSite() {
  if (chatPronto) return;
  chatPronto = true;

  const mensagens = $('#schat-mensagens');
  const rolagem = $('#schat-rolagem');
  const entrada = $('#schat-entrada');
  const botaoEnviar = $('#schat-enviar');
  const botaoEnviarIcone = $('#schat-enviar-icone');
  const botaoEnviarStop = $('#schat-enviar-stop');
  const form = $('#schat-form');
  const anexosContainer = $('#schat-anexos');
  const inputArquivo = $('#schat-arquivo');

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
    $('#schat-boasvindas')?.remove();
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
          el('div', { id: 'schat-boasvindas', class: 'flex-1 flex flex-col items-center justify-center text-center px-4 text-cinza' },
            el('iconify-icon', { noobserver: '', icon: 'lucide:sparkles', class: 'text-[28px] text-vekta mb-2', 'aria-hidden': 'true' }),
            el('h2', { class: 'font-display text-base text-tinta mb-1' }, 'Conversa nova'),
            el('p', { class: 'text-sm' }, 'Peça outro ajuste no site.'))
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
  $('#schat-anexar').addEventListener('click', () => inputArquivo.click());
  inputArquivo.addEventListener('change', () => {
    adicionarAnexos([...inputArquivo.files]).catch(console.error);
    inputArquivo.value = '';
  });
  $('#schat-nova').addEventListener('click', () => socket.emit('chat:nova-conversa', { canal: CANAL }));
}

export async function iniciar() {
  iniciarChatSite();
  $('#site-recarregar')?.addEventListener('click', () => {
    recarregarPreview();
  });
  $('#site-rebuild')?.addEventListener('click', () => {
    rebuildSite().catch(console.error);
  });
  await carregarSite();
}

export async function atualizar() {
  await carregarSite();
  if (infoSite?.existe) recarregarPreview();
}
