/* Vekta Ai Interface — casca: sidebar, cursor personalizado e boot das páginas.
   Cada página (Visão geral, DNA, Galeria, Chat) vive em src/views/paginas/*.html
   + *.js e é montada pelo roteador (ver src/views/.core/roteador.js), servido
   pelo Express em /views/ (ver src/app.js). */
import { $ } from '/views/.core/util.js';
import '/views/.core/modal.js'; // auto-wire do lightbox (#veu) — usado pelas páginas
import { iniciarNavegacao } from '/views/.core/roteador.js';

const LS_SIDEBAR = 'vekta-sidebar-recolhida';

// ==========================================================
// Sidebar: drawer mobile + recolher/expandir desktop
// ==========================================================
const rail = $('#rail');
const botaoMenu = $('#botao-menu');
const botaoFecharMenu = $('#botao-fechar-menu');
const botaoRecolher = $('#botao-recolher');
const menuOverlay = $('#menu-overlay');

function definirMenuAberto(aberto) {
  if (!rail) return;
  rail.toggleAttribute('data-menu-aberto', aberto);
  if (botaoMenu) {
    botaoMenu.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    botaoMenu.title = aberto ? 'Fechar menu' : 'Menu';
  }
  if (menuOverlay) {
    menuOverlay.classList.toggle('hidden', !aberto);
    menuOverlay.setAttribute('aria-hidden', aberto ? 'false' : 'true');
  }
  document.body.classList.toggle('menu-mobile-aberto', aberto);
}

function fecharMenuMobile() {
  definirMenuAberto(false);
}

function definirRecolhida(recolhida) {
  if (!rail) return;
  rail.toggleAttribute('data-recolhida', recolhida);
  if (botaoRecolher) {
    botaoRecolher.setAttribute('aria-expanded', recolhida ? 'false' : 'true');
    botaoRecolher.setAttribute('aria-label', recolhida ? 'Expandir menu' : 'Recolher menu');
    botaoRecolher.title = recolhida ? 'Expandir menu' : 'Recolher menu';
  }
  try {
    localStorage.setItem(LS_SIDEBAR, recolhida ? '1' : '0');
  } catch {
    // localStorage pode estar bloqueado
  }
}

function lerRecolhida() {
  try {
    return localStorage.getItem(LS_SIDEBAR) === '1';
  } catch {
    return false;
  }
}

if (rail) definirRecolhida(lerRecolhida());

if (botaoMenu) {
  botaoMenu.addEventListener('click', () => {
    definirMenuAberto(!rail.hasAttribute('data-menu-aberto'));
  });
}
botaoFecharMenu?.addEventListener('click', () => fecharMenuMobile());
menuOverlay?.addEventListener('click', () => fecharMenuMobile());

botaoRecolher?.addEventListener('click', () => {
  definirRecolhida(!rail.hasAttribute('data-recolhida'));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && rail?.hasAttribute('data-menu-aberto')) fecharMenuMobile();
});

// Clicar numa aba fecha o drawer mobile (nav + itens do menu config).
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-aba]')) fecharMenuMobile();
});

// Se girar / ampliar para desktop, fecha o painel mobile
window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
  if (e.matches) fecharMenuMobile();
});

// ==========================================================
// Sair — só no modo web. No Electron (window.vektaDesktop) o
// auto-login cuida da sessão e o botão fica oculto.
// ==========================================================
const botaoSair = $('#botao-sair');
if (botaoSair && !window.vektaDesktop) {
  botaoSair.classList.remove('hidden');
  botaoSair.addEventListener('click', async () => {
    botaoSair.disabled = true;
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Mesmo se a rede falhar, manda para o login — a sessão pode já ter expirado.
    }
    window.location.href = '/login';
  });
}

// ==========================================================
// Cursor personalizado — retícula HUD instantânea + glow ambiente
// atrás do conteúdo (só desktop; ver .cursor-glow em app.css)
// ==========================================================
(function initCursor() {
  const cursor = $('#cursor');
  const glow = $('#cursor-glow');
  if (!cursor || !window.matchMedia('(pointer: fine)').matches) return;

  const interativos = 'a, button, [role="button"], input, textarea, select, label, summary, [data-aba], [data-ir-chat], .cursor-pointer';
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.body.classList.add('cursor-ativo');

  // O glow persegue o mouse com suavização (lerp); a retícula acompanha na hora.
  let alvoX = 0;
  let alvoY = 0;
  let glowX = 0;
  let glowY = 0;
  let glowPosicionado = false;

  function passoGlow() {
    glowX += (alvoX - glowX) * 0.08;
    glowY += (alvoY - glowY) * 0.08;
    if (glow) glow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
    requestAnimationFrame(passoGlow);
  }
  if (glow && !reduzMovimento) requestAnimationFrame(passoGlow);

  document.addEventListener('mousemove', (e) => {
    cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    cursor.classList.add('cursor-visivel');

    alvoX = e.clientX;
    alvoY = e.clientY;
    if (glow) {
      glow.classList.add('cursor-visivel');
      if (reduzMovimento) {
        glowX = alvoX;
        glowY = alvoY;
        glow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
      } else if (!glowPosicionado) {
        // primeiro movimento: começa já no lugar certo, sem "voar" da origem
        glowPosicionado = true;
        glowX = alvoX;
        glowY = alvoY;
      }
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    cursor.classList.remove('cursor-visivel');
    if (glow) glow.classList.remove('cursor-visivel');
  });

  document.addEventListener('mousedown', () => { cursor.dataset.click = ''; });
  document.addEventListener('mouseup', () => { delete cursor.dataset.click; });

  document.addEventListener('mouseover', (e) => {
    const alvo = e.target.closest(interativos);
    if (!alvo || alvo.disabled) return;
    cursor.dataset.hover = '';
    const ehTexto = alvo.matches('input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable="true"]');
    if (ehTexto) cursor.dataset.texto = '';
    else delete cursor.dataset.texto;
  });

  document.addEventListener('mouseout', (e) => {
    const alvo = e.target.closest(interativos);
    if (!alvo || alvo.contains(e.relatedTarget)) return;
    delete cursor.dataset.hover;
    delete cursor.dataset.texto;
  });
})();

// ==========================================================
// Início — o roteador busca /api/paginas, monta a navegação e mostra a
// página principal (Chat); as demais montam em segundo plano (ver roteador.js).
// A navegação é preenchida ali, então os cliques já são ligados na renderização.
// ==========================================================
await iniciarNavegacao();
