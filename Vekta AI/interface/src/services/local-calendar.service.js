/**
 * Agenda local da interface (JSON em disco), sem vínculo com o Google.
 * Mesmo contrato de eventos da aba Agenda / google-calendar.service.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { INTERFACE_DIR } = require('../config');

const ARQUIVO = path.join(INTERFACE_DIR, 'data', 'agenda.json');

function erroValidacao(mensagem) {
  const err = new Error(mensagem);
  err.codigo = 'validacao';
  err.status = 400;
  return err;
}

function erroNaoEncontrado(mensagem) {
  const err = new Error(mensagem);
  err.codigo = 'nao_encontrado';
  err.status = 404;
  return err;
}

function garantirPasta() {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
}

function lerEventos() {
  garantirPasta();
  if (!fs.existsSync(ARQUIVO)) return [];
  try {
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function escreverEventos(eventos) {
  garantirPasta();
  const tmp = `${ARQUIVO}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(eventos, null, 2), 'utf8');
  fs.renameSync(tmp, ARQUIVO);
}

function novoId() {
  const agora = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = [
    agora.getUTCFullYear(),
    p(agora.getUTCMonth() + 1),
    p(agora.getUTCDate()),
    p(agora.getUTCHours()),
    p(agora.getUTCMinutes()),
  ].join('');
  return `loc-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function montarDateTime(valor, allDay) {
  if (allDay) {
    const data = String(valor || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw erroValidacao('Data de dia inteiro inválida (use YYYY-MM-DD).');
    }
    return data;
  }
  const iso = String(valor || '').trim();
  if (!iso) throw erroValidacao('Data/hora obrigatória.');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw erroValidacao('Data/hora inválida.');
  return d.toISOString();
}

function corpoEventoDePayload(payload, parcial = false) {
  const corpo = {};
  if (!parcial || payload.summary !== undefined) {
    const summary = String(payload.summary || '').trim();
    if (!parcial && !summary) throw erroValidacao('Título do evento é obrigatório.');
    if (payload.summary !== undefined) corpo.summary = summary;
  }
  if (payload.description !== undefined) {
    corpo.description = String(payload.description || '');
  }
  if (payload.location !== undefined) {
    corpo.location = String(payload.location || '');
  }

  const temInicio = payload.start !== undefined;
  const temFim = payload.end !== undefined;
  const temAllDay = payload.allDay !== undefined;

  if (!parcial || temInicio || temFim || temAllDay) {
    if (!parcial && (!temInicio || !temFim)) {
      throw erroValidacao('Início e fim do evento são obrigatórios.');
    }
    if (temInicio || temFim || temAllDay) {
      if (!temInicio || !temFim) {
        throw erroValidacao('Ao alterar horário, envie start e end juntos.');
      }
      const allDay = Boolean(payload.allDay);
      corpo.allDay = allDay;
      corpo.start = montarDateTime(payload.start, allDay);
      corpo.end = montarDateTime(payload.end, allDay);
    }
  }

  return corpo;
}

function normalizarEvento(ev) {
  if (!ev || !ev.id) return null;
  const allDay = Boolean(ev.allDay);
  return {
    id: ev.id,
    summary: ev.summary || '(Sem título)',
    description: ev.description || '',
    location: ev.location || '',
    htmlLink: null,
    status: ev.status || 'confirmed',
    allDay,
    start: ev.start || null,
    end: ev.end || null,
    startRaw: allDay ? { date: ev.start } : { dateTime: ev.start },
    endRaw: allDay ? { date: ev.end } : { dateTime: ev.end },
  };
}

function eventoNoIntervalo(ev, min, max) {
  if (ev.allDay) {
    const ini = Date.parse(`${String(ev.start || '').slice(0, 10)}T00:00:00`);
    let fimExcl = Date.parse(`${String(ev.end || '').slice(0, 10)}T00:00:00`);
    if (!Number.isFinite(ini)) return false;
    if (!Number.isFinite(fimExcl) || fimExcl <= ini) fimExcl = ini + 86_400_000;
    return ini < max.getTime() && fimExcl > min.getTime();
  }
  const ini = new Date(ev.start);
  const fim = new Date(ev.end || ev.start);
  if (Number.isNaN(ini.getTime())) return false;
  const fimMs = Number.isNaN(fim.getTime()) ? ini.getTime() : fim.getTime();
  return ini.getTime() < max.getTime() && fimMs > min.getTime();
}

function listarEventos({ timeMin, timeMax } = {}) {
  if (!timeMin || !timeMax) {
    throw erroValidacao('timeMin e timeMax são obrigatórios (ISO 8601).');
  }
  const min = new Date(timeMin);
  const max = new Date(timeMax);
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime())) {
    throw erroValidacao('timeMin/timeMax inválidos.');
  }
  if (max <= min) throw erroValidacao('timeMax deve ser posterior a timeMin.');

  return lerEventos()
    .map(normalizarEvento)
    .filter(Boolean)
    .filter((ev) => eventoNoIntervalo(ev, min, max))
    .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
}

function criarEvento(payload) {
  const corpo = corpoEventoDePayload(payload || {}, false);
  const agora = new Date().toISOString();
  const evento = {
    id: novoId(),
    summary: corpo.summary,
    description: corpo.description || '',
    location: corpo.location || '',
    allDay: Boolean(corpo.allDay),
    start: corpo.start,
    end: corpo.end,
    status: 'confirmed',
    createdAt: agora,
    updatedAt: agora,
  };
  const lista = lerEventos();
  lista.push(evento);
  escreverEventos(lista);
  return normalizarEvento(evento);
}

function atualizarEvento(eventId, payload) {
  const eid = String(eventId || '').trim();
  if (!eid) throw erroValidacao('ID do evento é obrigatório.');
  const corpo = corpoEventoDePayload(payload || {}, true);
  if (Object.keys(corpo).length === 0) {
    throw erroValidacao('Nenhum campo para atualizar.');
  }

  const lista = lerEventos();
  const idx = lista.findIndex((ev) => ev.id === eid);
  if (idx < 0) throw erroNaoEncontrado('Evento não encontrado.');

  lista[idx] = {
    ...lista[idx],
    ...corpo,
    updatedAt: new Date().toISOString(),
  };
  escreverEventos(lista);
  return normalizarEvento(lista[idx]);
}

function excluirEvento(eventId) {
  const eid = String(eventId || '').trim();
  if (!eid) throw erroValidacao('ID do evento é obrigatório.');
  const lista = lerEventos();
  const proxima = lista.filter((ev) => ev.id !== eid);
  if (proxima.length === lista.length) throw erroNaoEncontrado('Evento não encontrado.');
  escreverEventos(proxima);
  return { ok: true, id: eid };
}

module.exports = {
  listarEventos,
  criarEvento,
  atualizarEvento,
  excluirEvento,
};
