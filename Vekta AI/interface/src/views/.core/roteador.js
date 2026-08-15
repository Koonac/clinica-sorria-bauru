/* Roteador de páginas data-driven: a lista de páginas vem de /api/paginas (o
   servidor varre src/views/paginas/ — ver services/paginas.service.js), então
   uma tela nova aparece na navegação só por existir, sem editar este arquivo.

   Para cada página, busca o fragmento em /views/paginas/*.html, importa o módulo
   /views/paginas/*.js e alterna qual fica visível. A página principal monta
   primeiro (exibição rápida) e as demais montam em segundo plano. Uma vez
   montada, cada página fica em DOM para sempre — trocar é só show/hide, sem
   perder estado (ex.: conversa do chat em andamento). irParaPagina espera a
   montagem específica terminar antes de mostrar, então clicar numa aba ainda
   montando funciona normalmente.

   Páginas com grupo "config" (DNA, Agents, Skills…) saem da nav principal e
   abrem no modal global de Configurações (engrenagem). Grupo "oculto" não
   aparece na navegação, mas continua montável via irParaPagina. */
import { $, animarEntrada } from './util.js';
import { socket } from './socket.js';
import { iniciarConfiguracoes, definirSecoesConfig } from './configuracoes.js';

const CLASSE_NAV_ATIVO = ['bg-vekta-suave', 'text-vekta'];
// Botões verticais da sidebar.
const CLASSE_BOTAO_NAV = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-cinza transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta';

const container = $('#paginas');
const nav = $('#nav-abas');
const botaoConfig = $('#botao-config');
const modulos = new Map(); // nome -> módulo já montado (com iniciar/atualizar)
const montagens = new Map(); // nome -> Promise da montagem em andamento/concluída
let paginaAtual = null;
let nomesConfig = new Set();

function montar(nome) {
  if (!montagens.has(nome)) {
    montagens.set(nome, (async () => {
      const html = await fetch(`/views/paginas/${nome}.html`).then((r) => r.text());
      container.insertAdjacentHTML('beforeend', html);
      const modulo = await import(`/views/paginas/${nome}.js`);
      modulos.set(nome, modulo);
      await modulo.iniciar();
    })());
  }
  return montagens.get(nome);
}

/** Monta o botão de navegação de uma página. */
function criarBotaoNav(pagina) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.dataset.aba = pagina.nome;
  botao.title = pagina.titulo;
  botao.className = CLASSE_BOTAO_NAV;

  const icone = document.createElement('iconify-icon');
  icone.setAttribute('noobserver', '');
  icone.setAttribute('icon', pagina.icone);
  icone.setAttribute('aria-hidden', 'true');
  icone.className = 'shrink-0 text-[20px]';

  const rotulo = document.createElement('span');
  rotulo.className = 'rail-rotulo whitespace-nowrap truncate';
  rotulo.textContent = pagina.titulo;

  botao.append(icone, rotulo);
  botao.addEventListener('click', () => irParaPagina(pagina.nome).catch(console.error));
  return botao;
}

/** Lista atual de páginas vinda do servidor (varre src/views/paginas/). */
async function buscarPaginas() {
  const dados = await fetch('/api/paginas').then((r) => r.json()).catch(() => ({ paginas: [] }));
  return dados.paginas || [];
}

function destacarAbas() {
  destacarAbasPara(paginaAtual);
}

function destacarAbasPara(nome) {
  document.querySelectorAll('[data-aba]').forEach((botao) => {
    const ativo = botao.dataset.aba === nome;
    botao.classList.toggle('text-cinza', !ativo);
    CLASSE_NAV_ATIVO.forEach((c) => botao.classList.toggle(c, ativo));
  });
  botaoConfig?.toggleAttribute('data-ativo', nomesConfig.has(nome));
}

/** (Re)desenha os botões da nav e registra seções do modal de configuração. */
function renderizarNav(paginas) {
  const principais = paginas.filter((p) => p.grupo === 'nav');
  const configs = paginas.filter((p) => p.grupo === 'config');
  nomesConfig = new Set(configs.map((p) => p.nome));

  nav.replaceChildren(...principais.map(criarBotaoNav));
  definirSecoesConfig(paginas);
  if (paginaAtual) destacarAbas();
}

/** Busca a lista de páginas no servidor, monta a nav e sobe a página principal. */
export async function iniciarNavegacao() {
  iniciarConfiguracoes({
    montar,
    obterModulo: (nome) => modulos.get(nome),
  });

  const paginas = await buscarPaginas();
  renderizarNav(paginas);

  const principal = paginas.find((p) => p.principal) || paginas[0];
  if (!principal) return;

  await montar(principal.nome);
  await irParaPagina(principal.nome);
  for (const pagina of paginas) {
    if (pagina.nome === principal.nome) continue;
    montar(pagina.nome).catch((erro) => console.error(`Falha ao montar a página "${pagina.nome}":`, erro));
  }
}

/** Rebusca as páginas e re-renderiza a nav — usado quando o watcher avisa que o
    Vekta criou/removeu uma tela. Páginas novas montam em segundo plano (as já
    montadas são no-op); a aba nova só passa a existir na navegação, sem trocar
    a página atual do usuário. */
async function recarregarPaginas() {
  const paginas = await buscarPaginas();
  renderizarNav(paginas);
  for (const pagina of paginas) {
    montar(pagina.nome).catch((erro) => console.error(`Falha ao montar a página "${pagina.nome}":`, erro));
  }
}

export async function irParaPagina(nome) {
  await montar(nome); // no-op se já montada; espera se ainda estiver montando

  // Chat compartilhado: precisa existir no DOM antes de migrar o #chat-host
  // entre o slot central e o painel direito da Visão geral.
  if (nome === 'dashboard' || nome === 'chat') {
    await montar('chat');
  }

  destacarAbasPara(nome);
  document.querySelectorAll('#paginas > [id^="aba-"]').forEach((secao) => {
    secao.classList.toggle('hidden', secao.id !== `aba-${nome}`);
  });
  // Páginas de config podem estar alojadas no modal — não forçar hide nelas.
  if (nome !== paginaAtual) animarEntrada(document.querySelectorAll(`#aba-${nome} > *`));
  paginaAtual = nome;

  const chat = modulos.get('chat');
  if (typeof chat?.alojar === 'function') chat.alojar(nome);
}

// Quando o Vekta termina uma entrega, cada página já montada que exportar
// "atualizar" se atualiza sozinha (ex.: dashboard/dna/galeria refletem o que
// acabou de ser produzido, mesmo se não estiverem visíveis no momento).
document.addEventListener('vekta-ai:producao-concluida', () => {
  for (const modulo of modulos.values()) {
    if (typeof modulo.atualizar === 'function') modulo.atualizar();
  }
});

// Cards ```vekta-arquivo → abre o arquivo na Visão geral (explorador + preview).
document.addEventListener('vekta-ai:abrir-na-visao-geral', (evento) => {
  const caminho = evento.detail?.caminho;
  if (!caminho) return;
  irParaPagina('dashboard')
    .then(() => {
      document.dispatchEvent(new CustomEvent('vekta-ai:abrir-arquivo', {
        detail: { caminho, modificado: evento.detail?.modificado },
      }));
    })
    .catch(console.error);
});

// Watcher de disco (ver services/watcher.service.js): reage em tempo real a
// mudanças de arquivo, independente de um turno de chat ter terminado.
// - dados (.dna, marketing/, saidas/, materiais/): reaproveita o mesmo caminho
//   de atualização das páginas já montadas.
socket.on('sistema:dados', () => {
  document.dispatchEvent(new CustomEvent('vekta-ai:producao-concluida'));
});
// - páginas (src/views/paginas/): uma tela nova aparece na navegação sem refresh.
socket.on('sistema:paginas', () => {
  recarregarPaginas().catch(console.error);
});
