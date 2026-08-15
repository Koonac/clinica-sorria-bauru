/**
 * Cliente da Google Calendar API (REST v3 + OAuth refresh token).
 */
const { GOOGLE_CALENDAR } = require('../config');

const API_BASE = 'https://www.googleapis.com/calendar/v3';

/** Cache do access token em memória. */
let tokenCache = { accessToken: null, expiraEm: 0 };

function configurado() {
  return Boolean(
    GOOGLE_CALENDAR.clientId &&
      String(GOOGLE_CALENDAR.clientId).trim() &&
      GOOGLE_CALENDAR.clientSecret &&
      String(GOOGLE_CALENDAR.clientSecret).trim() &&
      GOOGLE_CALENDAR.refreshToken &&
      String(GOOGLE_CALENDAR.refreshToken).trim(),
  );
}

function calendarId() {
  return String(GOOGLE_CALENDAR.calendarId || 'primary').trim() || 'primary';
}

function erroGoogle(mensagem, status = 502, detalhes = null) {
  const err = new Error(mensagem);
  err.codigo = 'google_erro';
  err.status = status;
  if (detalhes) err.detalhes = detalhes;
  return err;
}

function erroNaoConfigurado() {
  const err = new Error(
    'Google Calendar não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_CALENDAR_REFRESH_TOKEN em interface/.env.',
  );
  err.codigo = 'nao_configurado';
  err.status = 503;
  return err;
}

function erroValidacao(mensagem) {
  const err = new Error(mensagem);
  err.codigo = 'validacao';
  err.status = 400;
  return err;
}

async function obterAccessToken() {
  if (!configurado()) throw erroNaoConfigurado();

  const agora = Date.now();
  if (tokenCache.accessToken && tokenCache.expiraEm > agora + 60_000) {
    return tokenCache.accessToken;
  }

  let resposta;
  try {
    resposta = await fetch('https://www.googleapis.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: GOOGLE_CALENDAR.clientId,
        client_secret: GOOGLE_CALENDAR.clientSecret,
        refresh_token: GOOGLE_CALENDAR.refreshToken,
      }),
    });
  } catch (rede) {
    throw erroGoogle(`Falha de rede ao renovar token OAuth: ${rede.message}`, 502);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo.access_token) {
    const msg =
      corpo.error_description || corpo.error || `OAuth retornou ${resposta.status}`;
    throw erroGoogle(
      msg,
      resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502,
      corpo,
    );
  }

  const expiresIn = Number(corpo.expires_in) || 3600;
  tokenCache = {
    accessToken: corpo.access_token,
    expiraEm: agora + expiresIn * 1000,
  };
  return tokenCache.accessToken;
}

function extrairMensagemErro(corpo, status) {
  return (
    corpo?.error?.message ||
    corpo?.error_description ||
    (typeof corpo?.error === 'string' ? corpo.error : null) ||
    `Google Calendar API retornou ${status}`
  );
}

async function calendarFetch(caminho, opcoes = {}) {
  if (!configurado()) throw erroNaoConfigurado();

  const accessToken = await obterAccessToken();
  const url = caminho.startsWith('http') ? caminho : `${API_BASE}${caminho}`;

  let resposta;
  try {
    resposta = await fetch(url, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(opcoes.headers || {}),
      },
    });
  } catch (rede) {
    throw erroGoogle(`Falha de rede ao chamar Google Calendar API: ${rede.message}`, 502);
  }

  if (resposta.status === 204) return null;

  const texto = await resposta.text();
  let corpo = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      throw erroGoogle(`Resposta inválida da Google Calendar API (${resposta.status})`, 502);
    }
  }

  if (!resposta.ok) {
    throw erroGoogle(
      extrairMensagemErro(corpo, resposta.status),
      resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502,
      corpo?.error || corpo,
    );
  }

  return corpo;
}

function normalizarEvento(ev) {
  if (!ev || !ev.id) return null;
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  return {
    id: ev.id,
    summary: ev.summary || '(Sem título)',
    description: ev.description || '',
    location: ev.location || '',
    htmlLink: ev.htmlLink || null,
    status: ev.status || null,
    allDay,
    start: allDay ? ev.start.date : ev.start?.dateTime || null,
    end: allDay ? ev.end?.date || null : ev.end?.dateTime || null,
    startRaw: ev.start || null,
    endRaw: ev.end || null,
  };
}

function montarDateTime(valor, allDay) {
  if (allDay) {
    const data = String(valor || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw erroValidacao('Data de dia inteiro inválida (use YYYY-MM-DD).');
    }
    return { date: data };
  }
  const iso = String(valor || '').trim();
  if (!iso) throw erroValidacao('Data/hora obrigatória.');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw erroValidacao('Data/hora inválida.');
  return { dateTime: d.toISOString() };
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
      corpo.start = montarDateTime(payload.start, allDay);
      corpo.end = montarDateTime(payload.end, allDay);
    }
  }

  return corpo;
}

async function listarEventos({ timeMin, timeMax } = {}) {
  if (!timeMin || !timeMax) {
    throw erroValidacao('timeMin e timeMax são obrigatórios (ISO 8601).');
  }
  const min = new Date(timeMin);
  const max = new Date(timeMax);
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime())) {
    throw erroValidacao('timeMin/timeMax inválidos.');
  }
  if (max <= min) throw erroValidacao('timeMax deve ser posterior a timeMin.');

  const id = encodeURIComponent(calendarId());
  const eventos = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      timeMin: min.toISOString(),
      timeMax: max.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const corpo = await calendarFetch(`/calendars/${id}/events?${params}`);
    for (const item of corpo?.items || []) {
      const normalizado = normalizarEvento(item);
      if (normalizado) eventos.push(normalizado);
    }
    pageToken = corpo?.nextPageToken || null;
  } while (pageToken);

  return eventos;
}

async function criarEvento(payload) {
  const corpo = corpoEventoDePayload(payload || {}, false);
  const id = encodeURIComponent(calendarId());
  const criado = await calendarFetch(`/calendars/${id}/events`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
  return normalizarEvento(criado);
}

async function atualizarEvento(eventId, payload) {
  const eid = String(eventId || '').trim();
  if (!eid) throw erroValidacao('ID do evento é obrigatório.');
  const corpo = corpoEventoDePayload(payload || {}, true);
  if (Object.keys(corpo).length === 0) {
    throw erroValidacao('Nenhum campo para atualizar.');
  }
  const id = encodeURIComponent(calendarId());
  const atualizado = await calendarFetch(
    `/calendars/${id}/events/${encodeURIComponent(eid)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(corpo),
    },
  );
  return normalizarEvento(atualizado);
}

async function excluirEvento(eventId) {
  const eid = String(eventId || '').trim();
  if (!eid) throw erroValidacao('ID do evento é obrigatório.');
  const id = encodeURIComponent(calendarId());
  await calendarFetch(`/calendars/${id}/events/${encodeURIComponent(eid)}`, {
    method: 'DELETE',
  });
  return { ok: true, id: eid };
}

module.exports = {
  configurado,
  calendarId,
  listarEventos,
  criarEvento,
  atualizarEvento,
  excluirEvento,
};
