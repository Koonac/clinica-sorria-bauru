/**
 * Endpoints HTTP da integração Instagram (Instagram Login API).
 */
const fs = require('fs');
const path = require('path');
const instagram = require('../services/instagram.service');
const fila = require('../services/instagram-fila.service');
const publicMedia = require('../services/instagram-public-media.service');
const publish = require('../services/instagram-publish.service');
const store = require('../services/instagram-automacao-store.service');
const webhook = require('../services/instagram-webhook.service');
const { META } = require('../config');

function status(_req, res) {
  res.json({
    configurado: instagram.configurado(),
    public_base_url_ok: publicMedia.publicBaseUrlConfigurado(),
  });
}

function responderErro(res, erro) {
  const statusCode = erro.status || (erro.codigo === 'nao_configurado' ? 503 : 500);
  const corpo = {
    erro: erro.message || 'Falha ao consultar Instagram.',
    codigo: erro.codigo || 'erro_interno',
  };
  if (erro.codigo === 'meta_erro' && erro.detalhes) {
    corpo.detalhes = {
      type: erro.detalhes.type,
      code: erro.detalhes.code,
      error_subcode: erro.detalhes.error_subcode,
    };
  }
  if (!erro.codigo || erro.codigo === 'erro_interno') {
    console.error('[instagram]', erro);
  }
  return res.status(statusCode).json(corpo);
}

async function perfil(_req, res) {
  try {
    const dados = await instagram.obterPerfil();
    return res.json(dados);
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function metricas(req, res) {
  try {
    const dados = await instagram.obterMetricas(req.query.periodo);
    return res.json(dados);
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function listarAgendamentos(_req, res) {
  try {
    return res.json({
      fila: fila.lerFila(),
      logs: fila.listarLogs(50),
      public_base_url_ok: publicMedia.publicBaseUrlConfigurado(),
      public_base_url: META.publicBaseUrl || null,
    });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function criarAgendamento(req, res) {
  try {
    const corpo = req.body || {};
    const tipo = String(corpo.tipo || '').toUpperCase();
    let item;

    if (tipo === 'CAROUSEL') {
      item = fila.enfileirar({
        tipo,
        legenda: corpo.legenda,
        agendado_para: corpo.agendado_para,
        arquivos: Array.isArray(corpo.arquivos) ? corpo.arquivos : [],
      });
    } else {
      const arquivo = corpo.arquivo || {};
      item = fila.enfileirar({
        tipo: corpo.tipo,
        legenda: corpo.legenda,
        agendado_para: corpo.agendado_para,
        nome: arquivo.nome,
        mediaType: arquivo.mediaType || arquivo.media_type,
        dataBase64: arquivo.data,
      });
    }

    const due = Date.parse(item.agendado_para) <= Date.now();
    let publishResult = null;
    if (due && instagram.configurado()) {
      publishResult = await publish.processarItem(item.id);
    }

    const atual = fila.obterPorId(item.id);
    return res.status(201).json({
      item: atual || null,
      log: publishResult?.ok ? publishResult.log : null,
      publicado: Boolean(publishResult?.ok),
      publish_erro: publishResult && !publishResult.ok ? publishResult.erro : null,
    });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function cancelarAgendamento(req, res) {
  try {
    const resultado = fila.cancelar(req.params.id);
    return res.json(resultado);
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function servirMidiaPublica(req, res) {
  const resolved = publicMedia.resolverToken(req.params.token);
  if (!resolved) {
    return res.status(404).json({ erro: 'Token inválido ou expirado.' });
  }
  const ext = path.extname(resolved.absoluto).toLowerCase();
  const mime =
    resolved.mime ||
    ({
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
    }[ext] || 'application/octet-stream');

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(resolved.absoluto).pipe(res);
}

function webhookVerify(req, res) {
  return webhook.verificarGet(req, res);
}

function webhookEvent(req, res) {
  return webhook.receberPost(req, res);
}

function automacaoConfig(_req, res) {
  try {
    return res.json({
      config: store.obterConfigPublica(),
      eventos: store.listarEventos(20),
    });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function automacaoGerarHash(_req, res) {
  try {
    const config = store.gerarHash();
    return res.json({ config: store.obterConfigPublica() });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function automacaoSalvarConfig(req, res) {
  try {
    const corpo = req.body || {};
    const parcial = {};
    if (typeof corpo.ativo === 'boolean') parcial.ativo = corpo.ativo;
    // verify_token não é editável pela API — só META_WEBHOOK_VERIFY_TOKEN no .env.
    if (Array.isArray(corpo.subscribed_fields)) {
      parcial.subscribed_fields = corpo.subscribed_fields.map(String);
    }
    store.salvarConfig(parcial);
    return res.json({ config: store.obterConfigPublica() });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

async function automacaoInscrever(_req, res) {
  try {
    const cfg = store.lerConfig();
    const resultado = await instagram.inscreverWebhooks(cfg.subscribed_fields);
    return res.json({ ok: true, meta: resultado, config: store.obterConfigPublica() });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function listarFluxos(_req, res) {
  try {
    return res.json({ fluxos: store.listarFluxos() });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function obterFluxo(req, res) {
  try {
    return res.json({ fluxo: store.obterFluxo(req.params.id) });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function criarFluxo(req, res) {
  try {
    const fluxo = store.criarFluxo(req.body || {});
    return res.status(201).json({ fluxo });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function atualizarFluxo(req, res) {
  try {
    const fluxo = store.atualizarFluxo(req.params.id, req.body || {});
    return res.json({ fluxo });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function excluirFluxo(req, res) {
  try {
    return res.json(store.excluirFluxo(req.params.id));
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function ativarFluxo(req, res) {
  try {
    const fluxo = store.ativarFluxo(req.params.id);
    return res.json({ fluxo, fluxos: store.listarFluxos() });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

function listarConversas(req, res) {
  try {
    const limite = Number(req.query.limite) || 50;
    return res.json({ conversas: store.listarConversas(limite) });
  } catch (erro) {
    return responderErro(res, erro);
  }
}

module.exports = {
  status,
  perfil,
  metricas,
  listarAgendamentos,
  criarAgendamento,
  cancelarAgendamento,
  servirMidiaPublica,
  webhookVerify,
  webhookEvent,
  automacaoConfig,
  automacaoGerarHash,
  automacaoSalvarConfig,
  automacaoInscrever,
  listarFluxos,
  obterFluxo,
  criarFluxo,
  atualizarFluxo,
  excluirFluxo,
  ativarFluxo,
  listarConversas,
};
