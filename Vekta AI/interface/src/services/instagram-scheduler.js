/**
 * Poller de agendamentos Instagram (a cada 60s + sweep no boot).
 */
const fila = require('./instagram-fila.service');
const publish = require('./instagram-publish.service');
const instagram = require('./instagram.service');

const INTERVALO_MS = 60_000;
let timer = null;
let rodando = false;

async function varrerUmaVez() {
  if (rodando) return;
  if (!instagram.configurado()) return;

  rodando = true;
  try {
    fila.recuperarTravados();
    const devidos = fila.listarDevidos();
    for (const item of devidos) {
      try {
        await publish.processarItem(item.id);
      } catch (erro) {
        console.error('[instagram-scheduler] item', item.id, erro.message || erro);
      }
    }
  } finally {
    rodando = false;
  }
}

function iniciar() {
  if (timer) return;
  fila.garantirPastas();
  // Sweep imediato no boot (atrasados enquanto o processo estava off).
  varrerUmaVez().catch((e) => console.error('[instagram-scheduler] boot:', e.message || e));
  timer = setInterval(() => {
    varrerUmaVez().catch((e) => console.error('[instagram-scheduler]:', e.message || e));
  }, INTERVALO_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('[instagram-scheduler] ativo (intervalo 60s)');
}

function parar() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  INTERVALO_MS,
  iniciar,
  parar,
  varrerUmaVez,
};
