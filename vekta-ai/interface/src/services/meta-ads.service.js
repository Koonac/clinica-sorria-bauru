/**
 * Cliente da Meta Marketing API (graph.facebook.com) — leitura de Ads.
 */
const { META_ADS } = require('../config');

const NIVEIS = new Set(['account', 'campaign', 'adset', 'ad']);
const DATE_PRESETS = new Set([
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_28d',
  'this_month',
  'last_month',
]);

const STATUS_CAMPANHA_PADRAO = ['ACTIVE', 'PAUSED'];

const CAMPOS_CONTA =
  'id,name,account_status,currency,timezone_name,amount_spent,balance';

const CAMPOS_CAMPANHA =
  'id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time';

const CAMPOS_INSIGHTS_BASE =
  'impressions,clicks,spend,reach,cpc,cpm,ctr,frequency,actions,cost_per_action_type,purchase_roas';

/** Campos de vídeo / retenção (Marketing Insights). */
const CAMPOS_VIDEO =
  'video_play_actions,video_continuous_2_sec_watched_actions,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions';

/** Tipos de ação preferidos para “resultado” / CPA no painel. */
const ACOES_RESULTADO = [
  'purchase',
  'omni_purchase',
  'lead',
  'onsite_conversion.lead_grouped',
  'complete_registration',
  'contact',
  'submit_application',
  'subscribe',
  'link_click',
];

function configurado() {
  return Boolean(
    META_ADS.accessToken &&
      String(META_ADS.accessToken).trim() &&
      META_ADS.adAccountId &&
      String(META_ADS.adAccountId).trim(),
  );
}

function baseUrl() {
  const host = String(META_ADS.graphHost || 'https://graph.facebook.com').replace(/\/+$/, '');
  const versao = String(META_ADS.graphVersion || 'v25.0').replace(/^\/+|\/+$/g, '');
  return `${host}/${versao}`;
}

function actId() {
  return String(META_ADS.adAccountId || '').trim();
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
    'Meta Ads não configurado. Defina META_ADS_ACCESS_TOKEN e META_AD_ACCOUNT_ID em interface/.env.',
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
  url.searchParams.set('access_token', META_ADS.accessToken);

  let resposta;
  try {
    resposta = await fetch(url, { method: 'GET' });
  } catch (rede) {
    throw erroMeta(`Falha de rede ao chamar Marketing API: ${rede.message}`, 502);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const msg =
      corpo?.error?.message || corpo?.erro || `Marketing API retornou ${resposta.status}`;
    throw erroMeta(
      msg,
      resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502,
      corpo?.error,
    );
  }
  return corpo;
}

/** Pagina o edge Graph até esgotar (limite de segurança). */
async function graphGetTodas(caminho, params = {}, limitePaginas = 20) {
  const itens = [];
  let corpo = await graphGet(caminho, { ...params, limit: params.limit || 100 });
  let paginas = 0;
  while (corpo) {
    if (Array.isArray(corpo.data)) itens.push(...corpo.data);
    paginas += 1;
    const next = corpo?.paging?.next;
    if (!next || paginas >= limitePaginas) break;
    let resposta;
    try {
      resposta = await fetch(next);
    } catch (rede) {
      throw erroMeta(`Falha de rede ao paginar Marketing API: ${rede.message}`, 502);
    }
    corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const msg = corpo?.error?.message || `Marketing API retornou ${resposta.status}`;
      throw erroMeta(msg, resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502, corpo?.error);
    }
  }
  return itens;
}

function numOuNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extrairAcao(lista, tipos) {
  if (!Array.isArray(lista)) return null;
  for (const tipo of tipos) {
    const item = lista.find((a) => a && a.action_type === tipo);
    if (item && item.value != null) return { tipo, valor: numOuNull(item.value) };
  }
  return null;
}

/** Extrai o valor numérico de campos video_*_actions da Insights API. */
function extrairValorVideo(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const preferido =
    lista.find((a) => a && a.action_type === 'video_view' && a.value != null) ||
    lista.find((a) => a && a.value != null);
  return preferido ? numOuNull(preferido.value) : null;
}

function pctRetencao(parte, base) {
  if (parte == null || base == null || base <= 0) return null;
  return (parte / base) * 100;
}

function normalizarLinhaInsight(linha, level) {
  if (!linha || typeof linha !== 'object') return null;

  const resultado = extrairAcao(linha.actions, ACOES_RESULTADO);
  const cpa = resultado
    ? extrairAcao(linha.cost_per_action_type, [resultado.tipo])
    : extrairAcao(linha.cost_per_action_type, ACOES_RESULTADO);

  let purchaseRoas = null;
  if (Array.isArray(linha.purchase_roas) && linha.purchase_roas[0]) {
    purchaseRoas = numOuNull(linha.purchase_roas[0].value);
  }

  // 3s video views = action_type video_view em `actions` (padrão Meta Ads Manager).
  const video3s =
    extrairAcao(linha.actions, ['video_view'])?.valor ?? null;
  const videoPlays = extrairValorVideo(linha.video_play_actions);
  const video2s = extrairValorVideo(linha.video_continuous_2_sec_watched_actions);
  const thruplay = extrairValorVideo(linha.video_thruplay_watched_actions);
  const videoP25 = extrairValorVideo(linha.video_p25_watched_actions);
  const videoP50 = extrairValorVideo(linha.video_p50_watched_actions);
  const videoP75 = extrairValorVideo(linha.video_p75_watched_actions);
  const videoP100 = extrairValorVideo(linha.video_p100_watched_actions);
  const videoAvgTime = extrairValorVideo(linha.video_avg_time_watched_actions);
  const baseRetencao = videoPlays > 0 ? videoPlays : video3s;

  return {
    level,
    campaign_id: linha.campaign_id || null,
    campaign_name: linha.campaign_name || null,
    adset_id: linha.adset_id || null,
    adset_name: linha.adset_name || null,
    ad_id: linha.ad_id || null,
    ad_name: linha.ad_name || null,
    date_start: linha.date_start || null,
    date_stop: linha.date_stop || null,
    impressions: numOuNull(linha.impressions),
    clicks: numOuNull(linha.clicks),
    spend: numOuNull(linha.spend),
    reach: numOuNull(linha.reach),
    cpc: numOuNull(linha.cpc),
    cpm: numOuNull(linha.cpm),
    ctr: numOuNull(linha.ctr),
    frequency: numOuNull(linha.frequency),
    resultado_tipo: resultado?.tipo || null,
    resultado: resultado?.valor ?? null,
    cpa: cpa?.valor ?? null,
    purchase_roas: purchaseRoas,
    video_plays: videoPlays,
    video_3s: video3s,
    video_2s: video2s,
    video_thruplay: thruplay,
    video_p25: videoP25,
    video_p50: videoP50,
    video_p75: videoP75,
    video_p100: videoP100,
    video_avg_time: videoAvgTime,
    video_p25_pct: pctRetencao(videoP25, baseRetencao),
    video_p50_pct: pctRetencao(videoP50, baseRetencao),
    video_p75_pct: pctRetencao(videoP75, baseRetencao),
    video_p100_pct: pctRetencao(videoP100, baseRetencao),
    video_thruplay_pct: pctRetencao(thruplay, baseRetencao),
    actions: Array.isArray(linha.actions) ? linha.actions : [],
    cost_per_action_type: Array.isArray(linha.cost_per_action_type)
      ? linha.cost_per_action_type
      : [],
  };
}

function camposInsightsParaLevel(level) {
  const extras = [];
  if (level === 'campaign' || level === 'adset' || level === 'ad') {
    extras.push('campaign_id', 'campaign_name');
  }
  if (level === 'adset' || level === 'ad') {
    extras.push('adset_id', 'adset_name');
  }
  if (level === 'ad') {
    extras.push('ad_id', 'ad_name');
  }
  return [...extras, ...CAMPOS_INSIGHTS_BASE.split(','), ...CAMPOS_VIDEO.split(',')].join(
    ',',
  );
}

async function obterConta() {
  const id = actId();
  const dados = await graphGet(`/${id}`, { fields: CAMPOS_CONTA });
  return {
    id: dados.id || id,
    name: dados.name || null,
    account_status: dados.account_status ?? null,
    currency: dados.currency || null,
    timezone_name: dados.timezone_name || null,
    amount_spent: numOuNull(dados.amount_spent),
    balance: numOuNull(dados.balance),
  };
}

async function listarCampanhas({ status } = {}) {
  const id = actId();
  let effective = STATUS_CAMPANHA_PADRAO;
  if (status) {
    const lista = Array.isArray(status)
      ? status
      : String(status)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    if (lista.length) effective = lista.map((s) => s.toUpperCase());
  }

  const itens = await graphGetTodas(`/${id}/campaigns`, {
    fields: CAMPOS_CAMPANHA,
    effective_status: JSON.stringify(effective),
  });

  return itens.map((c) => ({
    id: c.id,
    name: c.name || null,
    objective: c.objective || null,
    status: c.status || null,
    effective_status: c.effective_status || null,
    daily_budget: numOuNull(c.daily_budget),
    lifetime_budget: numOuNull(c.lifetime_budget),
    created_time: c.created_time || null,
    updated_time: c.updated_time || null,
  }));
}

async function obterInsights({ level, date_preset, time_range } = {}) {
  const id = actId();
  const nivel = NIVEIS.has(level) ? level : 'campaign';
  const params = {
    level: nivel,
    fields: camposInsightsParaLevel(nivel),
  };

  if (time_range && typeof time_range === 'object' && time_range.since && time_range.until) {
    params.time_range = JSON.stringify({
      since: String(time_range.since),
      until: String(time_range.until),
    });
  } else {
    const preset = DATE_PRESETS.has(date_preset) ? date_preset : 'last_28d';
    params.date_preset = preset;
  }

  const linhas = await graphGetTodas(`/${id}/insights`, params);
  const normalizadas = linhas.map((l) => normalizarLinhaInsight(l, nivel)).filter(Boolean);

  // Totais no nível account (mesmo período) para os KPIs do painel.
  let totais = null;
  if (nivel === 'account' && normalizadas.length === 1) {
    totais = normalizadas[0];
  } else {
    const contaLinhas = await graphGetTodas(`/${id}/insights`, {
      level: 'account',
      fields: `${CAMPOS_INSIGHTS_BASE},${CAMPOS_VIDEO}`,
      ...(params.time_range
        ? { time_range: params.time_range }
        : { date_preset: params.date_preset }),
    });
    totais = contaLinhas[0] ? normalizarLinhaInsight(contaLinhas[0], 'account') : null;
  }

  return {
    level: nivel,
    date_preset: params.date_preset || null,
    time_range: time_range || null,
    totais,
    linhas: normalizadas,
  };
}

module.exports = {
  configurado,
  graphGet,
  obterConta,
  listarCampanhas,
  obterInsights,
  NIVEIS,
  DATE_PRESETS,
};
