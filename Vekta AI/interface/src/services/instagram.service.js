/**
 * Cliente da Instagram API with Instagram Login (graph.instagram.com).
 */
const { META } = require('../config');

const CAMPOS_PERFIL =
  'user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count';
const CAMPOS_MIDIA =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

const PERIODOS = new Set(['day', 'week', 'days_28']);

/** Métricas usadas na comparação mês atual vs mês passado. */
const METRICAS_MOM = [
  'reach',
  'profile_views',
  'views',
  'accounts_engaged',
  'total_interactions',
];

/** Cache em memória do IG professional user_id resolvido via /me. */
let igUserIdCache = null;

function configurado() {
  return Boolean(META.accessToken && String(META.accessToken).trim());
}

function baseUrl() {
  const host = String(META.graphHost || 'https://graph.instagram.com').replace(/\/+$/, '');
  const versao = String(META.graphVersion || 'v25.0').replace(/^\/+|\/+$/g, '');
  return `${host}/${versao}`;
}

function erroMeta(mensagem, status = 502, detalhes = null) {
  const err = new Error(mensagem);
  err.codigo = 'meta_erro';
  err.status = status;
  if (detalhes) err.detalhes = detalhes;
  return err;
}

function erroNaoConfigurado() {
  const err = new Error(
    'Instagram não configurado. Defina META_ACCESS_TOKEN em interface/.env (token do App Dashboard).'
  );
  err.codigo = 'nao_configurado';
  err.status = 503;
  return err;
}

async function graphGet(caminho, params = {}) {
  if (!configurado()) throw erroNaoConfigurado();

  const url = new URL(`${baseUrl()}${caminho.startsWith('/') ? caminho : `/${caminho}`}`);
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    url.searchParams.set(chave, String(valor));
  }
  url.searchParams.set('access_token', META.accessToken);

  let resposta;
  try {
    resposta = await fetch(url, { method: 'GET' });
  } catch (rede) {
    throw erroMeta(`Falha de rede ao chamar Instagram API: ${rede.message}`, 502);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const msg =
      corpo?.error?.message ||
      corpo?.erro ||
      `Instagram API retornou ${resposta.status}`;
    throw erroMeta(msg, resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502, corpo?.error);
  }
  return corpo;
}

async function graphPost(caminho, params = {}) {
  if (!configurado()) throw erroNaoConfigurado();

  const url = new URL(`${baseUrl()}${caminho.startsWith('/') ? caminho : `/${caminho}`}`);
  const corpoParams = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    corpoParams.set(chave, String(valor));
  }
  corpoParams.set('access_token', META.accessToken);

  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpoParams.toString(),
    });
  } catch (rede) {
    throw erroMeta(`Falha de rede ao chamar Instagram API: ${rede.message}`, 502);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const msg =
      corpo?.error?.message ||
      corpo?.erro ||
      `Instagram API retornou ${resposta.status}`;
    throw erroMeta(msg, resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502, corpo?.error);
  }
  return corpo;
}

/**
 * POST JSON com Bearer — Messaging API (DMs, quick replies, templates).
 */
async function graphPostJson(caminho, body = {}) {
  if (!configurado()) throw erroNaoConfigurado();

  const url = new URL(`${baseUrl()}${caminho.startsWith('/') ? caminho : `/${caminho}`}`);
  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${META.accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (rede) {
    throw erroMeta(`Falha de rede ao chamar Instagram Messaging API: ${rede.message}`, 502);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const msg =
      corpo?.error?.message ||
      corpo?.erro ||
      `Instagram Messaging API retornou ${resposta.status}`;
    throw erroMeta(msg, resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502, corpo?.error);
  }
  return corpo;
}

async function enviarMensagem(igsid, message) {
  const igId = await resolverIgUserId();
  return graphPostJson(`/${igId}/messages`, {
    recipient: { id: String(igsid) },
    message,
  });
}

/**
 * Private Reply: DM para quem comentou, via comment_id (1x por comentário).
 * Doc: Instagram Platform → Private Replies.
 */
async function enviarRespostaPrivada(commentId, message) {
  const igId = await resolverIgUserId();
  return graphPostJson(`/${igId}/messages`, {
    recipient: { comment_id: String(commentId) },
    message,
  });
}

/** Monta o objeto `message` a partir dos dados do nó (texto / QR / botões). */
function montarPayloadMensagem(dados = {}) {
  const texto = String(dados.texto || '').slice(0, 1000);
  const botoes = Array.isArray(dados.botoes) ? dados.botoes : [];
  const qrs = Array.isArray(dados.quick_replies) ? dados.quick_replies : [];

  if (botoes.length) {
    const buttons = botoes
      .slice(0, 3)
      .map((b) => {
        if (b.type === 'web_url') {
          return {
            type: 'web_url',
            url: String(b.url || ''),
            title: String(b.title || '').slice(0, 20),
          };
        }
        return {
          type: 'postback',
          title: String(b.title || '').slice(0, 20),
          payload: String(b.payload || b.title || '').slice(0, 1000),
        };
      })
      .filter((b) => b.title && (b.type !== 'web_url' || b.url));

    if (buttons.length) {
      return {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: String(dados.texto || '').slice(0, 640),
            buttons,
          },
        },
      };
    }
  }

  if (qrs.length) {
    const quick_replies = qrs
      .slice(0, 13)
      .map((q) => ({
        content_type: q.content_type || 'text',
        title: String(q.title || '').slice(0, 20),
        payload: String(q.payload || q.title || '').slice(0, 1000),
      }))
      .filter((q) => q.title);
    const message = { text: texto };
    if (quick_replies.length) message.quick_replies = quick_replies;
    return message;
  }

  return { text: texto };
}

async function enviarMensagemTexto(igsid, texto) {
  return enviarMensagem(igsid, { text: String(texto || '').slice(0, 1000) });
}

async function enviarMensagemComQuickReplies(igsid, texto, quickReplies = []) {
  return enviarMensagem(
    igsid,
    montarPayloadMensagem({ texto, quick_replies: quickReplies }),
  );
}

async function enviarMensagemBotoes(igsid, texto, botoes = []) {
  return enviarMensagem(igsid, montarPayloadMensagem({ texto, botoes }));
}

// Instagram Login: echoes vêm dentro de `messages` (não existe message_echoes).
const CAMPOS_WEBHOOK_DM = [
  'messages',
  'messaging_postbacks',
  'messaging_seen',
  'comments',
];

async function inscreverWebhooks(fields = CAMPOS_WEBHOOK_DM) {
  const igId = await resolverIgUserId();
  const lista = (Array.isArray(fields) && fields.length ? fields : CAMPOS_WEBHOOK_DM)
    .map((f) => String(f).trim())
    .filter(Boolean)
    .join(',');
  return graphPost(`/${igId}/subscribed_apps`, { subscribed_fields: lista });
}

async function definirIceBreakers(itens = []) {
  const igId = await resolverIgUserId();
  const callToActions = (Array.isArray(itens) ? itens : [])
    .slice(0, 4)
    .map((i) => ({
      question: String(i.question || i.title || '').slice(0, 80),
      payload: String(i.payload || i.question || '').slice(0, 1000),
    }))
    .filter((i) => i.question);

  return graphPostJson(`/${igId}/messenger_profile`, {
    platform: 'instagram',
    ice_breakers: [{ call_to_actions: callToActions }],
  });
}

async function resolverIgUserId() {
  if (!configurado()) throw erroNaoConfigurado();

  const doEnv = String(META.igUserId || '').trim();
  if (doEnv) return doEnv;
  if (igUserIdCache) return igUserIdCache;

  const me = await graphGet('/me', { fields: 'user_id,username' });
  const item = Array.isArray(me?.data) ? me.data[0] : me;
  const id = item?.user_id || item?.id;
  if (!id) {
    throw erroMeta('Não foi possível obter user_id via /me. Defina META_IG_USER_ID no .env.', 502, me);
  }
  igUserIdCache = String(id);
  return igUserIdCache;
}

/**
 * Stories ativos (até ~24h). Falha silenciosa: perfil/feed não dependem disso.
 */
async function obterStories(igId) {
  try {
    const lista = await graphGet(`/${igId}/stories`, {
      fields: CAMPOS_MIDIA,
      limit: 20,
    });
    const itens = Array.isArray(lista?.data) ? lista.data : [];
    if (itens.length === 0) return [];

    const enriquecidos = await Promise.all(
      itens.map(async (item) => {
        if (item?.media_url || item?.thumbnail_url) return item;
        if (!item?.id) return null;
        try {
          return await graphGet(`/${item.id}`, { fields: CAMPOS_MIDIA });
        } catch {
          return item;
        }
      })
    );

    return enriquecidos
      .filter((s) => s && (s.media_url || s.thumbnail_url))
      .sort((a, b) => {
        const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
        return ta - tb;
      });
  } catch (erro) {
    console.warn('[instagram] stories indisponíveis:', erro.message || erro);
    return [];
  }
}

async function obterPerfil() {
  const igId = await resolverIgUserId();
  const [perfil, midiaResp, stories] = await Promise.all([
    graphGet(`/${igId}`, { fields: CAMPOS_PERFIL }),
    graphGet(`/${igId}/media`, { fields: CAMPOS_MIDIA, limit: 12 }),
    obterStories(igId),
  ]);

  return {
    perfil: {
      user_id: perfil.user_id || igId,
      username: perfil.username || null,
      name: perfil.name || null,
      account_type: perfil.account_type || null,
      profile_picture_url: perfil.profile_picture_url || null,
      followers_count: perfil.followers_count ?? null,
      follows_count: perfil.follows_count ?? null,
      media_count: perfil.media_count ?? null,
    },
    midias: Array.isArray(midiaResp?.data) ? midiaResp.data : [],
    stories,
  };
}

function normalizarPeriodo(periodo) {
  const p = String(periodo || 'day').toLowerCase();
  return PERIODOS.has(p) ? p : 'day';
}

function janelaUnix(periodoUi) {
  const until = Math.floor(Date.now() / 1000);
  const dias = periodoUi === 'week' ? 7 : periodoUi === 'days_28' ? 28 : 2;
  const since = until - dias * 24 * 60 * 60;
  return { since, until, dias };
}

/** Início do mês UTC e janelas mês atual / mês passado. */
function janelasMensais() {
  const agora = new Date();
  const y = agora.getUTCFullYear();
  const m = agora.getUTCMonth();
  const inicioAtual = Math.floor(Date.UTC(y, m, 1) / 1000);
  const inicioPassado = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
  const fimPassado = inicioAtual - 1;
  const untilAtual = Math.floor(Date.now() / 1000);

  const rotulo = (ano, mes) =>
    new Date(Date.UTC(ano, mes, 1)).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  return {
    atual: {
      since: inicioAtual,
      until: untilAtual,
      rotulo: rotulo(y, m),
    },
    passado: {
      since: inicioPassado,
      until: fimPassado,
      rotulo: rotulo(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1),
    },
  };
}

function primeiroItem(resp) {
  const itens = Array.isArray(resp?.data) ? resp.data : [];
  return itens[0] || null;
}

async function tentarInsights(igId, variantes) {
  const erros = [];
  for (const params of variantes) {
    try {
      const resp = await graphGet(`/${igId}/insights`, params);
      const item = primeiroItem(resp);
      if (item) return { item, params, erros };
      erros.push({ params, erro: 'Resposta vazia (data=[])' });
    } catch (erro) {
      erros.push({ params, erro: erro.message });
    }
  }
  return { item: null, params: null, erros };
}

function somaSerie(item) {
  if (!Array.isArray(item?.values)) return null;
  let soma = 0;
  let tem = false;
  for (const v of item.values) {
    if (v?.value == null || Number.isNaN(Number(v.value))) continue;
    soma += Number(v.value);
    tem = true;
  }
  return tem ? soma : null;
}

function maxSerie(item) {
  if (!Array.isArray(item?.values) || item.values.length === 0) return null;
  let max = null;
  for (const v of item.values) {
    if (v?.value == null || Number.isNaN(Number(v.value))) continue;
    const n = Number(v.value);
    if (max === null || n > max) max = n;
  }
  return max;
}

function valorTotal(item) {
  if (!item) return null;
  if (item.total_value?.value != null) return Number(item.total_value.value);
  if (item.name === 'reach' && Array.isArray(item.values) && item.values.length) {
    return Number(item.values[item.values.length - 1].value);
  }
  return somaSerie(item);
}

function parseFollowsUnfollows(item) {
  const total = valorTotal(item);
  let follows = null;
  let unfollows = null;
  const breakdowns = item?.total_value?.breakdowns || [];
  for (const b of breakdowns) {
    for (const r of b.results || []) {
      const dim = String((r.dimension_values || [])[0] || '').toUpperCase();
      if (dim === 'FOLLOW' || dim === 'FOLLOWER') follows = Number(r.value);
      else if (dim === 'UNFOLLOW' || dim === 'NON_FOLLOWER') unfollows = Number(r.value);
    }
  }
  return { total, follows, unfollows };
}

function parseFollowerBreakdown(item) {
  let followers = null;
  let nonFollowers = null;
  const breakdowns = item?.total_value?.breakdowns || [];
  for (const b of breakdowns) {
    for (const r of b.results || []) {
      const dim = String((r.dimension_values || [])[0] || '').toUpperCase();
      const val = Number(r.value);
      if (Number.isNaN(val)) continue;
      if (dim.includes('NON')) nonFollowers = (nonFollowers || 0) + val;
      else if (dim.includes('FOLLOW')) followers = (followers || 0) + val;
    }
  }
  const total = valorTotal(item);
  const somaPartes =
    followers != null || nonFollowers != null ? (followers || 0) + (nonFollowers || 0) : null;
  return {
    total: total ?? somaPartes,
    followers,
    non_followers: nonFollowers,
  };
}

/**
 * Calcula variação %. Se o mês passado era 0 e agora há valor → crescimento "novo".
 */
function pctVariacao(atual, passado) {
  if (atual == null && passado == null) {
    return { pct: null, direcao: 'indefinido', novo: false };
  }
  const a = Number(atual ?? 0);
  const p = Number(passado ?? 0);
  if (Number.isNaN(a) || Number.isNaN(p)) {
    return { pct: null, direcao: 'indefinido', novo: false };
  }
  if (p === 0 && a === 0) return { pct: 0, direcao: 'estavel', novo: false };
  if (p === 0 && a > 0) return { pct: null, direcao: 'alta', novo: true };
  if (p === 0 && a < 0) return { pct: null, direcao: 'baixa', novo: false };
  const pct = Math.round(((a - p) / Math.abs(p)) * 1000) / 10;
  return {
    pct,
    direcao: pct > 0 ? 'alta' : pct < 0 ? 'baixa' : 'estavel',
    novo: false,
  };
}

async function totalEmJanela(igId, metric, since, until, extras = {}) {
  const janela = { since: String(since), until: String(until) };
  const variantes = [
    { metric, period: 'day', metric_type: 'total_value', ...janela, ...extras },
    { metric, period: 'day', metric_type: 'total_value', ...extras },
  ];
  // views / accounts_engaged sempre total_value; reach também aceita
  const r = await tentarInsights(igId, variantes);
  return r.item ? valorTotal(r.item) : null;
}

/**
 * Busca insights: séries (só métricas que devolvem values[]), totais,
 * engajamento com barras, e comparação mês atual vs passado.
 */
async function obterMetricas(periodoRaw) {
  const igId = await resolverIgUserId();
  const periodo = normalizarPeriodo(periodoRaw);
  const { since, until, dias } = janelaUnix(periodo);
  const janela = { since: String(since), until: String(until) };

  const avisos = [];
  const totais = {};
  const series = {};
  const engajamento = {};

  async function carregarSerie(nome, variantes) {
    const r = await tentarInsights(igId, variantes);
    if (r.item && Array.isArray(r.item.values) && r.item.values.length >= 1) {
      series[nome] = r.item;
      return r.item;
    }
    if (r.erros.length) {
      avisos.push({ metrica: nome, erro: r.erros.map((e) => e.erro).join(' | '), tipo: 'serie' });
    }
    return null;
  }

  async function carregarTotal(nome, variantes, fallbackItem = null) {
    const r = await tentarInsights(igId, variantes);
    if (r.item) {
      totais[nome] = valorTotal(r.item);
      return r.item;
    }
    if (fallbackItem) {
      totais[nome] = valorTotal(fallbackItem);
      return fallbackItem;
    }
    avisos.push({
      metrica: nome,
      erro: r.erros.map((e) => e.erro).join(' | ') || 'Sem total',
      tipo: 'total',
    });
    return null;
  }

  // —— Séries diárias (gráficos) ——
  const reachSerie = await carregarSerie('reach', [
    { metric: 'reach', period: 'day', ...janela },
    { metric: 'reach', period: 'day' },
  ]);
  await carregarTotal(
    'reach',
    [
      { metric: 'reach', period: 'day', metric_type: 'total_value', ...janela },
      { metric: 'reach', period: 'day', metric_type: 'total_value' },
    ],
    reachSerie
  );

  const pvSerie = await carregarSerie('profile_views', [
    { metric: 'profile_views', period: 'day', ...janela },
    { metric: 'profile_views', period: 'day' },
  ]);
  await carregarTotal(
    'profile_views',
    [
      { metric: 'profile_views', period: 'day', metric_type: 'total_value', ...janela },
      { metric: 'profile_views', period: 'day', metric_type: 'total_value' },
    ],
    pvSerie
  );

  // views: total + breakdown seguidores / não seguidores (donut estilo Instagram)
  let viewsBreakdown = null;
  const viewsComBreakdown = await tentarInsights(igId, [
    { metric: 'views', period: 'day', metric_type: 'total_value', breakdown: 'follower_type', ...janela },
    { metric: 'views', period: 'day', metric_type: 'total_value', breakdown: 'follower_type' },
  ]);
  if (viewsComBreakdown.item) {
    viewsBreakdown = parseFollowerBreakdown(viewsComBreakdown.item);
    totais.views = viewsBreakdown.total;
  } else {
    await carregarTotal('views', [
      { metric: 'views', period: 'day', metric_type: 'total_value', ...janela },
      { metric: 'views', period: 'day', metric_type: 'total_value' },
    ]);
  }

  // reach com breakdown follower_type (opcional, para donut de alcance)
  let reachBreakdown = null;
  const reachBd = await tentarInsights(igId, [
    { metric: 'reach', period: 'day', metric_type: 'total_value', breakdown: 'follow_type', ...janela },
    { metric: 'reach', period: 'day', metric_type: 'total_value', breakdown: 'follower_type', ...janela },
  ]);
  if (reachBd.item) {
    reachBreakdown = parseFollowerBreakdown(reachBd.item);
    if (totais.reach == null) totais.reach = reachBreakdown.total;
  }

  const folSerie = await carregarSerie('follower_count', [
    { metric: 'follower_count', period: 'day', ...janela },
    { metric: 'follower_count', period: 'day' },
  ]);
  if (folSerie) {
    totais.follower_count = somaSerie(folSerie) ?? valorTotal(folSerie);
  } else {
    avisos.push({
      metrica: 'follower_count',
      erro: 'Indisponível (em geral exige ~100 seguidores).',
      tipo: 'serie',
    });
  }

  // —— Engajamento (lista estilo Instagram, sem barras) ——
  const ae = await tentarInsights(igId, [
    { metric: 'accounts_engaged', period: 'day', metric_type: 'total_value', ...janela },
    { metric: 'accounts_engaged', period: 'day', metric_type: 'total_value' },
  ]);
  if (ae.item) {
    engajamento.accounts_engaged = valorTotal(ae.item);
    totais.accounts_engaged = engajamento.accounts_engaged;
  } else {
    avisos.push({ metrica: 'accounts_engaged', erro: ae.erros.map((e) => e.erro).join(' | '), tipo: 'engajamento' });
  }

  const ti = await tentarInsights(igId, [
    { metric: 'total_interactions', period: 'day', metric_type: 'total_value', ...janela },
    { metric: 'total_interactions', period: 'day', metric_type: 'total_value' },
  ]);
  if (ti.item) {
    engajamento.total_interactions = valorTotal(ti.item);
    totais.total_interactions = engajamento.total_interactions;
  } else {
    avisos.push({ metrica: 'total_interactions', erro: ti.erros.map((e) => e.erro).join(' | '), tipo: 'engajamento' });
  }

  const fu = await tentarInsights(igId, [
    {
      metric: 'follows_and_unfollows',
      period: 'day',
      metric_type: 'total_value',
      breakdown: 'follow_type',
      ...janela,
    },
    { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', breakdown: 'follow_type' },
    { metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', ...janela },
  ]);
  if (fu.item) {
    const parsed = parseFollowsUnfollows(fu.item);
    engajamento.follows_and_unfollows = parsed.total;
    engajamento.follows = parsed.follows;
    engajamento.unfollows = parsed.unfollows;
    totais.follows_and_unfollows = parsed.total;
  } else {
    avisos.push({
      metrica: 'follows_and_unfollows',
      erro: fu.erros.map((e) => e.erro).join(' | '),
      tipo: 'engajamento',
    });
  }

  const of = await tentarInsights(igId, [
    { metric: 'online_followers', period: 'lifetime' },
    { metric: 'online_followers', period: 'day' },
  ]);
  if (of.item) {
    const pico = maxSerie(of.item) ?? valorTotal(of.item);
    engajamento.online_followers = pico;
    totais.online_followers = pico;
  } else {
    avisos.push({
      metrica: 'online_followers',
      erro: of.erros.map((e) => e.erro).join(' | '),
      tipo: 'engajamento',
    });
  }

  let followersAbsoluto = null;
  try {
    const perfil = await graphGet(`/${igId}`, { fields: 'followers_count' });
    followersAbsoluto = perfil.followers_count ?? null;
  } catch {
    /* ignore */
  }

  // —— Comparação mês atual vs mês passado ——
  const meses = janelasMensais();
  const totaisAtual = {};
  const totaisPassado = {};
  const variacoes = {};

  await Promise.all(
    METRICAS_MOM.map(async (nome) => {
      const [a, p] = await Promise.all([
        totalEmJanela(igId, nome, meses.atual.since, meses.atual.until),
        totalEmJanela(igId, nome, meses.passado.since, meses.passado.until),
      ]);
      // Garante 0 quando a API responde vazio mas a outra janela tem dado
      const atual = a;
      const passado = p;
      if (atual != null) totaisAtual[nome] = atual;
      if (passado != null) totaisPassado[nome] = passado;
      if (atual != null || passado != null) {
        const calc = pctVariacao(atual ?? 0, passado ?? 0);
        variacoes[nome] = {
          atual: atual ?? 0,
          passado: passado ?? 0,
          pct: calc.pct,
          direcao: calc.direcao,
          novo: calc.novo,
        };
      }
    })
  );

  const metricas = Object.values(series);
  for (const [nome, valor] of Object.entries(totais)) {
    if (!series[nome] && valor != null) {
      metricas.push({ name: nome, period: 'day', total_value: { value: valor } });
    }
  }

  const avisosFiltrados = avisos.filter((a) => {
    if (a.tipo === 'serie' && series[a.metrica]) return false;
    if (a.tipo === 'total' && totais[a.metrica] != null) return false;
    if (a.tipo === 'engajamento' && engajamento[a.metrica] != null) return false;
    return true;
  });

  return {
    periodo,
    dias,
    since,
    until,
    ig_user_id: igId,
    metricas,
    series,
    totais,
    engajamento,
    breakdowns: {
      views: viewsBreakdown,
      reach: reachBreakdown,
    },
    followers_absoluto: followersAbsoluto,
    comparacao_mensal: {
      mes_atual: { ...meses.atual, totais: totaisAtual },
      mes_passado: { ...meses.passado, totais: totaisPassado },
      variacoes,
    },
    avisos: avisosFiltrados,
  };
}

module.exports = {
  configurado,
  obterPerfil,
  obterMetricas,
  resolverIgUserId,
  graphGet,
  graphPost,
  graphPostJson,
  enviarMensagemTexto,
  enviarMensagemComQuickReplies,
  enviarMensagemBotoes,
  enviarRespostaPrivada,
  montarPayloadMensagem,
  inscreverWebhooks,
  definirIceBreakers,
  CAMPOS_WEBHOOK_DM,
  erroMeta,
};
