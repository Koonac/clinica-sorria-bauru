/**
 * Endpoints HTTP da aba Tráfego (Meta Ads + Google Ads).
 */
const metaAds = require('../services/meta-ads.service');
const googleAds = require('../services/google-ads.service');

function statusMeta(_req, res) {
  res.json({
    configurado: metaAds.configurado(),
  });
}

function statusGoogle(_req, res) {
  res.json({
    configurado: googleAds.configurado(),
  });
}

function responderErro(plataforma, res, erro) {
  const statusCode = erro.status || (erro.codigo === 'nao_configurado' ? 503 : 500);
  const corpo = {
    erro: erro.message || `Falha ao consultar ${plataforma === 'google' ? 'Google' : 'Meta'} Ads.`,
    codigo: erro.codigo || 'erro_interno',
  };
  if ((erro.codigo === 'meta_erro' || erro.codigo === 'google_erro') && erro.detalhes) {
    corpo.detalhes = {
      type: erro.detalhes.type,
      code: erro.detalhes.code,
      error_subcode: erro.detalhes.error_subcode,
      status: erro.detalhes.status,
      message: erro.detalhes.message,
    };
  }
  if (!erro.codigo || erro.codigo === 'erro_interno') {
    console.error(`[trafego/${plataforma}]`, erro);
  }
  return res.status(statusCode).json(corpo);
}

async function contaMeta(_req, res) {
  try {
    const dados = await metaAds.obterConta();
    return res.json(dados);
  } catch (erro) {
    return responderErro('meta', res, erro);
  }
}

async function campanhasMeta(req, res) {
  try {
    const lista = await metaAds.listarCampanhas({
      status: req.query.status,
    });
    return res.json({ campanhas: lista });
  } catch (erro) {
    return responderErro('meta', res, erro);
  }
}

async function insightsMeta(req, res) {
  try {
    const periodo = String(req.query.periodo || req.query.date_preset || '').trim();
    let time_range = null;
    if (req.query.since && req.query.until) {
      time_range = {
        since: String(req.query.since),
        until: String(req.query.until),
      };
    }
    const dados = await metaAds.obterInsights({
      level: req.query.level,
      date_preset: periodo || undefined,
      time_range,
    });
    return res.json(dados);
  } catch (erro) {
    return responderErro('meta', res, erro);
  }
}

async function contaGoogle(_req, res) {
  try {
    const dados = await googleAds.obterConta();
    return res.json(dados);
  } catch (erro) {
    return responderErro('google', res, erro);
  }
}

async function campanhasGoogle(req, res) {
  try {
    const lista = await googleAds.listarCampanhas({
      status: req.query.status,
    });
    return res.json({ campanhas: lista });
  } catch (erro) {
    return responderErro('google', res, erro);
  }
}

async function insightsGoogle(req, res) {
  try {
    const periodo = String(req.query.periodo || req.query.date_preset || '').trim();
    const dados = await googleAds.obterInsights({
      date_preset: periodo || undefined,
    });
    return res.json(dados);
  } catch (erro) {
    return responderErro('google', res, erro);
  }
}

module.exports = {
  // Compat: nomes antigos usados pelas rotas Meta
  status: statusMeta,
  conta: contaMeta,
  campanhas: campanhasMeta,
  insights: insightsMeta,
  statusMeta,
  contaMeta,
  campanhasMeta,
  insightsMeta,
  statusGoogle,
  contaGoogle,
  campanhasGoogle,
  insightsGoogle,
};
