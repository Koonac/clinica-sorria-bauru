/**
 * Publica item da fila no Instagram (container → status → media_publish).
 * Em sucesso: apaga mídia, remove da fila, grava log.
 */
const fila = require('./instagram-fila.service');
const publicMedia = require('./instagram-public-media.service');
const instagram = require('./instagram.service');

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TENTATIVAS = 40;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function aguardarContainerPronto(containerId) {
  let ultimo = null;
  for (let i = 0; i < POLL_MAX_TENTATIVAS; i += 1) {
    const status = await instagram.graphGet(`/${containerId}`, {
      fields: 'status_code,status',
    });
    ultimo = status;
    const code = status?.status_code;
    if (code === 'FINISHED') return status;
    if (code === 'ERROR' || code === 'EXPIRED') {
      const err = new Error(
        status?.status || `Container ${code || 'falhou'} ao processar mídia.`
      );
      err.codigo = 'meta_container';
      err.status = 502;
      err.detalhes = status;
      throw err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const err = new Error('Timeout aguardando container de mídia ficar pronto.');
  err.codigo = 'meta_timeout';
  err.status = 504;
  err.detalhes = ultimo;
  throw err;
}

function listarMidiasItem(item) {
  if (Array.isArray(item.arquivos) && item.arquivos.length > 0) {
    return item.arquivos;
  }
  return [{ arquivo: item.arquivo, media_type: item.media_type }];
}

/**
 * Executa o publish completo de um item já marcado como publicando.
 */
async function publicarItem(item) {
  const tokensPublicos = [];
  const apiTrace = {
    children: [],
    container: null,
    container_status: null,
    publish: null,
  };

  try {
    const igId = await instagram.resolverIgUserId();
    let containerId = null;

    if (item.tipo === 'CAROUSEL') {
      const midias = listarMidiasItem(item);
      if (midias.length < fila.CAROUSEL_MIN) {
        throw Object.assign(new Error('Carrossel sem mídias suficientes.'), {
          codigo: 'validacao',
          status: 400,
        });
      }

      const childIds = [];
      for (const midia of midias) {
        const { token, url } = publicMedia.emitirUrlPublica(item, midia);
        tokensPublicos.push(token);
        const child = await instagram.graphPost(`/${igId}/media`, {
          image_url: url,
          is_carousel_item: true,
        });
        if (!child?.id) {
          const err = new Error('Meta não retornou ID do item do carrossel.');
          err.codigo = 'meta_erro';
          err.status = 502;
          err.detalhes = child;
          throw err;
        }
        const childStatus = await aguardarContainerPronto(child.id);
        apiTrace.children.push({ container: child, status: childStatus });
        childIds.push(child.id);
      }

      const container = await instagram.graphPost(`/${igId}/media`, {
        media_type: 'CAROUSEL',
        children: JSON.stringify(childIds),
        caption: item.legenda || '',
      });
      apiTrace.container = container;
      containerId = container?.id;
    } else {
      const midia = listarMidiasItem(item)[0];
      const { token, url } = publicMedia.emitirUrlPublica(item, midia);
      tokensPublicos.push(token);

      const mime = String(midia.media_type || item.media_type || '').toLowerCase();
      const ehVideo =
        mime.startsWith('video/') ||
        item.tipo === 'REELS' ||
        /\.(mp4|mov)$/i.test(String(midia.arquivo || item.arquivo || ''));

      const params = {};
      if (item.tipo === 'STORIES') {
        params.media_type = 'STORIES';
        if (ehVideo) params.video_url = url;
        else params.image_url = url;
      } else if (item.tipo === 'REELS') {
        params.media_type = 'REELS';
        params.video_url = url;
        params.caption = item.legenda || '';
      } else {
        params.image_url = url;
        params.caption = item.legenda || '';
      }

      const container = await instagram.graphPost(`/${igId}/media`, params);
      apiTrace.container = container;
      containerId = container?.id;
    }

    if (!containerId) {
      const err = new Error('Meta não retornou ID do container.');
      err.codigo = 'meta_erro';
      err.status = 502;
      err.detalhes = apiTrace.container;
      throw err;
    }

    const statusContainer = await aguardarContainerPronto(containerId);
    apiTrace.container_status = statusContainer;

    const publish = await instagram.graphPost(`/${igId}/media_publish`, {
      creation_id: containerId,
    });
    apiTrace.publish = publish;

    const enviadoEm = new Date().toISOString();
    const arquivosRemovidos = listarMidiasItem(item).map((m) => m.arquivo).filter(Boolean);
    fila.apagarMidiasDoItem(item);
    fila.removerDaFila(item.id);
    publicMedia.invalidarTokens(tokensPublicos);

    const log = fila.gravarLog({
      id: item.id,
      tipo: item.tipo,
      legenda: item.legenda || '',
      agendado_para: item.agendado_para,
      enviado_em: enviadoEm,
      arquivo_removido: arquivosRemovidos[0] || item.arquivo || null,
      arquivos_removidos: arquivosRemovidos,
      api: {
        container_id: containerId,
        media_id: publish?.id || null,
        children: apiTrace.children,
        container: apiTrace.container,
        container_status: apiTrace.container_status,
        publish: apiTrace.publish,
      },
    });

    return { ok: true, log };
  } catch (erro) {
    publicMedia.invalidarTokens(tokensPublicos);
    throw erro;
  }
}

/**
 * Tenta publicar um item: lock → publish → sucesso ou erro/retry.
 */
async function processarItem(id) {
  const atual = fila.obterPorId(id);
  if (!atual || atual.status !== 'pendente') return null;

  const locked = fila.atualizarItem(id, {
    status: 'publicando',
    publicando_desde: new Date().toISOString(),
  });
  if (!locked || locked.status !== 'publicando') return null;

  try {
    return await publicarItem(locked);
  } catch (erro) {
    const tentativas = (locked.tentativas || 0) + 1;
    const msg = erro.message || 'Falha ao publicar.';
    const statusFinal =
      tentativas >= fila.MAX_TENTATIVAS ? 'erro' : 'pendente';
    fila.atualizarItem(id, {
      status: statusFinal,
      tentativas,
      ultimo_erro: msg,
      publicando_desde: null,
    });
    console.error(`[instagram-publish] ${id}:`, msg);
    return { ok: false, id, erro: msg, status: statusFinal, tentativas };
  }
}

module.exports = {
  publicarItem,
  processarItem,
  aguardarContainerPronto,
};
