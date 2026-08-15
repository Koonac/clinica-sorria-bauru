/**
 * Motor de fluxos de automação de DMs Instagram (estilo ManyChat).
 */
const store = require('./instagram-automacao-store.service');
const instagram = require('./instagram.service');

const JANELA_MS = 24 * 60 * 60 * 1000;
const MAX_PASSOS = 40;

function noPorId(fluxo, id) {
  return (fluxo.nos || []).find((n) => n.id === id) || null;
}

function arestasDe(fluxo, de, handle = null) {
  return (fluxo.arestas || []).filter((a) => {
    if (a.de !== de) return false;
    if (handle == null) return true;
    return String(a.handle || 'default') === String(handle);
  });
}

function proximoNo(fluxo, de, handle = 'default') {
  const lista = arestasDe(fluxo, de, handle);
  if (lista.length) return noPorId(fluxo, lista[0].para);
  // Fallback: primeira aresta saindo do nó.
  const qualquer = arestasDe(fluxo, de);
  return qualquer.length ? noPorId(fluxo, qualquer[0].para) : null;
}

function textoNorm(s) {
  return String(s || '').trim().toLowerCase();
}

function matchPalavras(texto, palavras) {
  const t = textoNorm(texto);
  if (!t) return false;
  return (palavras || []).some((p) => {
    const palavra = textoNorm(p);
    return palavra && t.includes(palavra);
  });
}

function avaliarCondicao(dados, texto) {
  const t = String(texto || '');
  const valor = String(dados?.valor || '');
  const op = String(dados?.operador || 'contem').toLowerCase();
  if (op === 'igual') return textoNorm(t) === textoNorm(valor);
  if (op === 'regex') {
    try {
      return new RegExp(valor, 'i').test(t);
    } catch {
      return false;
    }
  }
  return textoNorm(t).includes(textoNorm(valor));
}

function triggerCasa(triggerDados, evento) {
  const tipo = String(triggerDados?.evento || 'message');

  if (tipo === 'comment') {
    if (evento.tipo !== 'comment') return false;
    const mediaFiltro = String(triggerDados?.media_id || '').trim();
    if (mediaFiltro && mediaFiltro !== String(evento.media_id || '')) return false;
    if (triggerDados?.qualquer) return true;
    const palavras = triggerDados?.palavras || [];
    if (!palavras.length) return true;
    return matchPalavras(evento.texto, palavras);
  }

  if (tipo === 'postback' || tipo === 'quick_reply' || tipo === 'ice_breaker') {
    if (evento.tipo === 'comment') return false;
    const payloadEsp = String(triggerDados?.payload || '').trim();
    if (!payloadEsp) return Boolean(evento.payload);
    return textoNorm(evento.payload) === textoNorm(payloadEsp);
  }

  // message
  if (evento.tipo !== 'message' && evento.tipo !== 'quick_reply') return false;
  if (triggerDados?.qualquer) return true;
  const palavras = triggerDados?.palavras || [];
  if (!palavras.length) return true;
  return matchPalavras(evento.texto, palavras) || matchPalavras(evento.payload, palavras);
}

function scoreTrigger(triggerDados, evento) {
  if (!triggerCasa(triggerDados, evento)) return -1;
  const palavras = triggerDados?.palavras || [];
  let score = 5;
  if (palavras.length) score = 100 + palavras.length;
  else if (triggerDados?.payload) score = 80;
  else if (triggerDados?.qualquer) score = 10;
  if (triggerDados?.evento === 'comment' && triggerDados?.media_id) score += 50;
  return score;
}

function escolherFluxo(evento) {
  const ativos = store.listarFluxos().filter((f) => f.ativo);
  let melhor = null;
  let melhorScore = -1;
  for (const fluxo of ativos) {
    const trigger = (fluxo.nos || []).find((n) => n.tipo === 'trigger');
    if (!trigger) continue;
    const score = scoreTrigger(trigger.dados || {}, evento);
    if (score > melhorScore) {
      melhorScore = score;
      melhor = { fluxo, trigger };
    }
  }
  return melhorScore >= 0 ? melhor : null;
}

function dentroDaJanela(conversa) {
  if (!conversa?.janela_ate) return false;
  return Date.parse(conversa.janela_ate) > Date.now();
}

async function enviarNoMensagem(igsid, no, conversa) {
  const message = instagram.montarPayloadMensagem(no.dados || {});
  const precisaPrivateReply =
    Boolean(conversa?.comment_id)
    && conversa?.private_reply_pendente !== false
    && !conversa?.private_reply_enviada;

  try {
    if (precisaPrivateReply) {
      const resp = await instagram.enviarRespostaPrivada(conversa.comment_id, message);
      const recipientId = resp?.recipient_id ? String(resp.recipient_id) : null;
      const patch = {
        private_reply_pendente: false,
        private_reply_enviada: true,
        fora_janela: false,
        janela_ate: new Date(Date.now() + JANELA_MS).toISOString(),
      };
      if (recipientId) patch.messaging_igsid = recipientId;
      store.salvarConversa(igsid, patch);
      if (recipientId && recipientId !== String(igsid)) {
        const base = store.obterConversa(igsid) || {};
        store.salvarConversa(recipientId, {
          ...base,
          igsid: recipientId,
          messaging_igsid: recipientId,
        });
      }
      return { ok: true, private_reply: true, recipient_id: recipientId };
    }

    const atual = store.obterConversa(igsid) || conversa;
    if (!dentroDaJanela(atual)) {
      store.salvarConversa(igsid, { ...atual, fora_janela: true });
      return { ok: false, motivo: 'fora_janela' };
    }

    const destino = atual.messaging_igsid || igsid;
    await instagram.enviarMensagem(destino, message);
    return { ok: true };
  } catch (erro) {
    console.error('[ig-flow] envio falhou', igsid, erro.message);
    return { ok: false, motivo: erro.message };
  }
}

/**
 * Executa nós a partir de `inicioId` até pausar (aguardar/delay) ou fim.
 */
async function executarDesde(igsid, fluxo, inicioId, contexto = {}) {
  let conversa = store.obterConversa(igsid) || store.salvarConversa(igsid, {});
  let no = noPorId(fluxo, inicioId);
  let passos = 0;

  while (no && passos < MAX_PASSOS) {
    passos += 1;
    conversa = store.salvarConversa(igsid, {
      fluxo_id: fluxo.id,
      no_atual: no.id,
      aguardando: false,
      wake_at: null,
      fora_janela: false,
    });

    if (no.tipo === 'trigger') {
      no = proximoNo(fluxo, no.id, 'default');
      continue;
    }

    if (no.tipo === 'mensagem') {
      await enviarNoMensagem(igsid, no, conversa);
      conversa = store.obterConversa(igsid) || conversa;
      no = proximoNo(fluxo, no.id, 'default');
      continue;
    }

    if (no.tipo === 'condicao') {
      const ok = avaliarCondicao(no.dados || {}, contexto.texto || contexto.payload || '');
      no = proximoNo(fluxo, no.id, ok ? 'sim' : 'nao');
      continue;
    }

    if (no.tipo === 'tag') {
      const tags = new Set(conversa.tags || []);
      const nome = String(no.dados?.tag || '').trim();
      if (nome) {
        if (no.dados?.acao === 'remover') tags.delete(nome);
        else tags.add(nome);
      }
      conversa = store.salvarConversa(igsid, { tags: [...tags] });
      no = proximoNo(fluxo, no.id, 'default');
      continue;
    }

    if (no.tipo === 'delay') {
      const unidade = String(no.dados?.unidade || 'segundos');
      const qtd = Math.max(1, Number(no.dados?.quantidade) || 1);
      const ms = unidade === 'minutos' ? qtd * 60_000 : qtd * 1000;
      const wake = new Date(Date.now() + ms).toISOString();
      const prox = proximoNo(fluxo, no.id, 'default');
      store.salvarConversa(igsid, {
        fluxo_id: fluxo.id,
        no_atual: prox?.id || null,
        wake_at: wake,
        aguardando: false,
      });
      return { pausado: 'delay', wake_at: wake };
    }

    if (no.tipo === 'aguardar_resposta') {
      store.salvarConversa(igsid, {
        fluxo_id: fluxo.id,
        no_atual: no.id,
        aguardando: true,
        wake_at: null,
      });
      return { pausado: 'aguardar' };
    }

    if (no.tipo === 'fim') {
      store.salvarConversa(igsid, {
        fluxo_id: null,
        no_atual: null,
        aguardando: false,
        wake_at: null,
      });
      return { fim: true };
    }

    // Tipo desconhecido — avança ou encerra.
    no = proximoNo(fluxo, no.id, 'default');
  }

  store.salvarConversa(igsid, {
    fluxo_id: fluxo.id,
    no_atual: null,
    aguardando: false,
    wake_at: null,
  });
  return { fim: true };
}

function resolverArestaAguardar(fluxo, noAguardar, evento) {
  const saidas = arestasDe(fluxo, noAguardar.id);
  // Match por handle = payload/keyword
  for (const a of saidas) {
    const handle = String(a.handle || 'default');
    if (handle === 'default' || handle === 'senao' || handle === 'else') continue;
    if (evento.payload && textoNorm(evento.payload) === textoNorm(handle)) {
      return noPorId(fluxo, a.para);
    }
    if (evento.texto && matchPalavras(evento.texto, [handle])) {
      return noPorId(fluxo, a.para);
    }
  }
  // Keywords no próprio nó
  const rotas = noAguardar.dados?.rotas || [];
  for (const rota of rotas) {
    if (matchPalavras(evento.texto, rota.palavras || [])
      || (evento.payload && textoNorm(evento.payload) === textoNorm(rota.payload || ''))) {
      return noPorId(fluxo, rota.para);
    }
  }
  const senao = saidas.find((a) => ['default', 'senao', 'else'].includes(String(a.handle || 'default')));
  return senao ? noPorId(fluxo, senao.para) : null;
}

/**
 * Processa um evento de messaging/comentário já normalizado.
 * @param {{ igsid, texto, payload, mid, tipo, timestamp, comment_id?, media_id?, username? }} evento
 */
async function processarEvento(evento) {
  let igsid = String(evento.igsid || '');
  if (!igsid && evento.comment_id) igsid = `comment_${evento.comment_id}`;
  if (!igsid) return { ignorado: 'sem_igsid' };

  const ehComment = evento.tipo === 'comment';
  const janelaAte = new Date(
    (evento.timestamp ? Number(evento.timestamp) : Date.now()) + JANELA_MS
  ).toISOString();

  const patch = {
    ultimo_mid: evento.mid || null,
    ultimo_texto: evento.texto || null,
  };

  if (ehComment) {
    patch.origem = 'comment';
    patch.comment_id = evento.comment_id || null;
    patch.media_id = evento.media_id || null;
    patch.username = evento.username || null;
    patch.private_reply_pendente = true;
    patch.private_reply_enviada = false;
    // Janela de messaging só abre após private reply bem-sucedido.
  } else {
    patch.janela_ate = janelaAte;
  }

  let conversa = store.salvarConversa(igsid, patch);

  // Continuação de aguardar_resposta (só para DMs / pós-private-reply)
  if (!ehComment && conversa.aguardando && conversa.fluxo_id && conversa.no_atual) {
    let fluxo;
    try {
      fluxo = store.obterFluxo(conversa.fluxo_id);
    } catch {
      fluxo = null;
    }
    if (fluxo) {
      const no = noPorId(fluxo, conversa.no_atual);
      if (no?.tipo === 'aguardar_resposta') {
        const proximo = resolverArestaAguardar(fluxo, no, evento);
        if (proximo) {
          return executarDesde(igsid, fluxo, proximo.id, evento);
        }
      }
    }
  }

  const escolhido = escolherFluxo(evento);
  if (!escolhido) return { ignorado: 'sem_fluxo' };

  const { fluxo, trigger } = escolhido;
  return executarDesde(igsid, fluxo, trigger.id, evento);
}

async function processarWake(conversa) {
  if (!conversa?.igsid || !conversa.fluxo_id || !conversa.no_atual) {
    return store.salvarConversa(conversa.igsid, { wake_at: null });
  }
  let fluxo;
  try {
    fluxo = store.obterFluxo(conversa.fluxo_id);
  } catch {
    return store.salvarConversa(conversa.igsid, { wake_at: null, no_atual: null });
  }
  store.salvarConversa(conversa.igsid, { wake_at: null });
  return executarDesde(conversa.igsid, fluxo, conversa.no_atual, {
    texto: conversa.ultimo_texto || '',
  });
}

let timerDelays = null;

function iniciarPollerDelays() {
  if (timerDelays) return;
  timerDelays = setInterval(() => {
    try {
      const pendentes = store.listarConversasComWake();
      for (const c of pendentes) {
        processarWake(c).catch((e) => console.error('[ig-flow] wake', e.message));
      }
    } catch (e) {
      console.error('[ig-flow] poller', e.message);
    }
  }, 2000);
  if (typeof timerDelays.unref === 'function') timerDelays.unref();
}

function pararPollerDelays() {
  if (timerDelays) {
    clearInterval(timerDelays);
    timerDelays = null;
  }
}

module.exports = {
  processarEvento,
  processarWake,
  iniciarPollerDelays,
  pararPollerDelays,
  escolherFluxo,
  triggerCasa,
};
