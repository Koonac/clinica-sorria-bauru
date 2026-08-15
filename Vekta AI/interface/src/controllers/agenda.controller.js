/**
 * Endpoints HTTP da aba Agenda.
 * Usa Google Calendar quando configurado; senão, agenda local do site.
 */
const googleCalendar = require('../services/google-calendar.service');
const localCalendar = require('../services/local-calendar.service');

function usarGoogle() {
  return googleCalendar.configurado();
}

function calendario() {
  return usarGoogle() ? googleCalendar : localCalendar;
}

function status(_req, res) {
  const google = usarGoogle();
  res.json({
    configurado: true,
    provedor: google ? 'google' : 'local',
    calendarId: google ? googleCalendar.calendarId() : 'local',
  });
}

function responderErro(res, erro) {
  const statusCode =
    erro.status ||
    (erro.codigo === 'nao_configurado'
      ? 503
      : erro.codigo === 'validacao'
        ? 400
        : erro.codigo === 'nao_encontrado'
          ? 404
          : 500);
  const corpo = {
    erro: erro.message || 'Falha ao consultar a agenda.',
    codigo: erro.codigo || 'erro_interno',
  };
  if (erro.codigo === 'google_erro' && erro.detalhes) {
    corpo.detalhes = {
      code: erro.detalhes.code,
      status: erro.detalhes.status,
      message: erro.detalhes.message,
      errors: erro.detalhes.errors,
    };
  }
  if (!erro.codigo || erro.codigo === 'erro_interno') {
    console.error('[agenda]', erro);
  }
  return res.status(statusCode).json(corpo);
}

async function listarEventos(req, res) {
  try {
    const eventos = await calendario().listarEventos({
      timeMin: req.query.timeMin,
      timeMax: req.query.timeMax,
    });
    return res.json({ eventos, provedor: usarGoogle() ? 'google' : 'local' });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function criarEvento(req, res) {
  try {
    const evento = await calendario().criarEvento(req.body || {});
    return res.status(201).json({ evento });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function atualizarEvento(req, res) {
  try {
    const evento = await calendario().atualizarEvento(req.params.id, req.body || {});
    return res.json({ evento });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function excluirEvento(req, res) {
  try {
    const resultado = await calendario().excluirEvento(req.params.id);
    return res.json(resultado);
  } catch (erro) {
    return responderErro(res, erro);
  }
}

module.exports = {
  status,
  listarEventos,
  criarEvento,
  atualizarEvento,
  excluirEvento,
};
