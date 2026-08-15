/**
 * Endpoints HTTP da aba Agenda (Google Calendar).
 */
const googleCalendar = require('../services/google-calendar.service');

function status(_req, res) {
  res.json({
    configurado: googleCalendar.configurado(),
    calendarId: googleCalendar.calendarId(),
  });
}

function responderErro(res, erro) {
  const statusCode =
    erro.status ||
    (erro.codigo === 'nao_configurado' ? 503 : erro.codigo === 'validacao' ? 400 : 500);
  const corpo = {
    erro: erro.message || 'Falha ao consultar Google Calendar.',
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
    const eventos = await googleCalendar.listarEventos({
      timeMin: req.query.timeMin,
      timeMax: req.query.timeMax,
    });
    return res.json({ eventos });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function criarEvento(req, res) {
  try {
    const evento = await googleCalendar.criarEvento(req.body || {});
    return res.status(201).json({ evento });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function atualizarEvento(req, res) {
  try {
    const evento = await googleCalendar.atualizarEvento(req.params.id, req.body || {});
    return res.json({ evento });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function excluirEvento(req, res) {
  try {
    const resultado = await googleCalendar.excluirEvento(req.params.id);
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
