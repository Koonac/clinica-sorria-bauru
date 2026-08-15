/**
 * Webhook Meta Instagram — verificação GET e eventos POST (DMs + comments).
 * Doc: Setup Webhooks Subscriptions (Instagram Platform).
 */
const crypto = require('crypto');
const { META } = require('../config');
const store = require('./instagram-automacao-store.service');
const flowEngine = require('./instagram-flow-engine.service');

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function hashValido(hashUrl) {
  const cfg = store.lerConfig();
  const esperado = String(cfg.hash || '').trim();
  if (!esperado) return false;
  return timingSafeEqualStr(esperado, String(hashUrl || '').trim());
}

function verifyTokenEsperado() {
  // Fonte única: META_WEBHOOK_VERIFY_TOKEN no .env (nunca o hash da URL).
  return store.resolveVerifyToken();
}

/**
 * GET verification request da Meta.
 * Responde hub.challenge em texto puro se token e hash baterem.
 */
function verificarGet(req, res) {
  const hash = req.params.hash;
  if (!hashValido(hash)) {
    return res.status(403).send('Hash inválido');
  }

  const mode = req.query['hub.mode'] || req.query.hub_mode;
  const token = req.query['hub.verify_token'] || req.query.hub_verify_token;
  const challenge = req.query['hub.challenge'] || req.query.hub_challenge;

  if (mode !== 'subscribe') {
    return res.status(400).send('hub.mode inválido');
  }

  const esperado = verifyTokenEsperado();
  if (!esperado || !timingSafeEqualStr(esperado, token)) {
    return res.status(403).send('Verify token inválido');
  }

  return res.status(200).type('text/plain').send(String(challenge));
}

function validarAssinatura(req) {
  const secret = String(META.appSecret || '').trim();
  if (!secret) {
    // Sem secret configurado: aceita em dev, mas registra aviso.
    console.warn('[ig-webhook] META_APP_SECRET ausente — assinatura não validada');
    return true;
  }

  const header = req.get('X-Hub-Signature-256') || req.get('x-hub-signature-256') || '';
  const match = /^sha256=(.+)$/i.exec(header);
  if (!match) return false;

  const raw = req.rawBody;
  if (!raw || !Buffer.isBuffer(raw)) {
    console.warn('[ig-webhook] rawBody ausente — não é possível validar assinatura');
    return false;
  }

  const esperado = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return timingSafeEqualStr(esperado, match[1]);
}

function normalizarMessagingItem(item) {
  if (!item || typeof item !== 'object') return null;

  const igsid = item.sender?.id;
  if (!igsid) return null;

  // Echoes / self — só log, não dispara automação.
  if (item.message?.is_echo || item.message?.is_self) {
    return {
      ignorar_automacao: true,
      igsid,
      mid: item.message?.mid,
      tipo: 'echo',
      texto: item.message?.text || null,
      timestamp: item.timestamp,
      bruto: item,
    };
  }

  if (item.postback) {
    return {
      igsid,
      mid: item.postback.mid || `postback-${item.timestamp}`,
      tipo: 'postback',
      texto: item.postback.title || '',
      payload: item.postback.payload || '',
      timestamp: item.timestamp,
      bruto: item,
    };
  }

  if (item.message) {
    const qr = item.message.quick_reply;
    return {
      igsid,
      mid: item.message.mid,
      tipo: qr ? 'quick_reply' : 'message',
      texto: item.message.text || '',
      payload: qr?.payload || '',
      timestamp: item.timestamp,
      bruto: item,
    };
  }

  // messaging_seen etc. — ignora para fluxo
  return {
    ignorar_automacao: true,
    igsid,
    mid: null,
    tipo: 'outro',
    timestamp: item.timestamp,
    bruto: item,
  };
}

function normalizarCommentChange(change, entryTime) {
  if (!change || change.field !== 'comments') return null;
  const value = change.value || {};
  const commentId = value.id;
  if (!commentId) return null;

  const fromId = value.from?.id ? String(value.from.id) : '';
  return {
    tipo: 'comment',
    comment_id: String(commentId),
    mid: String(commentId),
    texto: value.text || '',
    payload: '',
    // Chave de conversa: id do comentarista; fallback se a Meta omitir.
    igsid: fromId || `comment_${commentId}`,
    username: value.from?.username || null,
    media_id: value.media?.id ? String(value.media.id) : null,
    media_product_type: value.media?.media_product_type || null,
    timestamp: entryTime || Date.now(),
    bruto: change,
  };
}

/**
 * O botão "Test" do App Dashboard envia `messages` (e afins) em entry.changes
 * com o sample { field, value }, não em entry.messaging. Eventos reais de DM
 * usam messaging[]; este caminho cobre o teste e formatos mistos.
 */
const CAMPOS_MESSAGING_EM_CHANGES = new Set([
  'messages',
  'messaging_postbacks',
  'message_echoes',
  'messaging_seen',
  'messaging_referrals',
  'messaging_optins',
  'message_reactions',
]);

function normalizarMessagingChange(change) {
  if (!change || !CAMPOS_MESSAGING_EM_CHANGES.has(String(change.field || ''))) {
    return null;
  }
  const value = change.value;
  if (!value || typeof value !== 'object') return null;
  return normalizarMessagingItem(value);
}

function resumoEvento(evento) {
  return {
    tipo: evento.tipo,
    igsid: evento.igsid,
    texto: evento.texto,
    payload: evento.payload,
    mid: evento.mid || null,
    comment_id: evento.comment_id || null,
    media_id: evento.media_id || null,
    username: evento.username || null,
  };
}

async function despacharEvento(evento, entryId, processadosRef) {
  if (!evento) return;

  processadosRef.reconhecidos += 1;

  const mid = evento.mid;
  const duplicado = Boolean(mid && store.midJaProcessado(mid));
  const chaveRegistro = duplicado
    ? `dup-${Date.now()}-${String(mid).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 40)}`
    : (mid || `evt-${Date.now()}-${processadosRef.n}`);

  store.registrarEvento(chaveRegistro, {
    entry_id: entryId,
    duplicado,
    evento: resumoEvento(evento),
  });

  // Dedup só bloqueia reexecução do fluxo — o histórico acima já registrou a chegada.
  if (duplicado || evento.ignorar_automacao) return;

  try {
    await flowEngine.processarEvento(evento);
    processadosRef.n += 1;
  } catch (erro) {
    console.error('[ig-webhook] fluxo', erro.message);
  }
}

function enveloparSampleMeta(body) {
  // UI de teste às vezes documenta só { field, value }; se chegar assim, envelopa.
  if (
    body
    && typeof body === 'object'
    && body.field
    && body.value
    && !body.object
    && !body.entry
  ) {
    return {
      object: 'instagram',
      entry: [
        {
          id: '0',
          time: Date.now(),
          changes: [{ field: body.field, value: body.value }],
        },
      ],
    };
  }
  return body;
}

async function processarPayload(bodyEntrada) {
  const body = enveloparSampleMeta(bodyEntrada);

  if (!body || body.object !== 'instagram') {
    console.warn('[ig-webhook] payload ignorado — object !== instagram', {
      object: body?.object,
      keys: body && typeof body === 'object' ? Object.keys(body) : [],
    });
    store.registrarEvento(`raw-ignored-${Date.now()}`, {
      ignorado: true,
      motivo: 'object_invalido',
      object: body?.object || null,
      bruto: body,
    });
    return { processados: 0 };
  }

  const processadosRef = { n: 0, reconhecidos: 0 };
  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const item of messaging) {
      await despacharEvento(normalizarMessagingItem(item), entry.id, processadosRef);
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const deMessaging = normalizarMessagingChange(change);
      if (deMessaging) {
        await despacharEvento(deMessaging, entry.id, processadosRef);
        continue;
      }
      await despacharEvento(
        normalizarCommentChange(change, entry.time),
        entry.id,
        processadosRef,
      );
    }
  }

  // Só grava "vazio" se nenhum campo conhecido foi reconhecido (não quando é só dedup).
  if (processadosRef.reconhecidos === 0 && entries.length) {
    const field = entries[0]?.changes?.[0]?.field || null;
    store.registrarEvento(`raw-empty-${Date.now()}`, {
      ignorado: true,
      motivo: 'nenhum_evento_util',
      field,
      bruto: body,
    });
  }

  return { processados: processadosRef.n, reconhecidos: processadosRef.reconhecidos };
}

/**
 * POST event notification. Sempre responde 200 rápido; processa em seguida.
 */
function receberPost(req, res) {
  const hash = req.params.hash;
  if (!hashValido(hash)) {
    return res.status(403).json({ erro: 'Hash inválido' });
  }

  const cfg = store.lerConfig();
  if (cfg.ativo === false) {
    return res.status(200).json({ ok: true, ignorado: 'inativo' });
  }

  if (!validarAssinatura(req)) {
    return res.status(401).json({ erro: 'Assinatura inválida' });
  }

  // Responde 200 imediatamente (Meta retenta se falhar).
  res.status(200).json({ ok: true });

  const body = req.body;
  setImmediate(() => {
    processarPayload(body).catch((e) => console.error('[ig-webhook] processar', e.message));
  });
}

module.exports = {
  verificarGet,
  receberPost,
  validarAssinatura,
  processarPayload,
  normalizarMessagingItem,
  normalizarCommentChange,
  normalizarMessagingChange,
  hashValido,
};
