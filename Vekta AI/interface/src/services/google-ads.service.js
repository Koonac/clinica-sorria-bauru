/**
 * Cliente da Google Ads API (REST searchStream + OAuth refresh token).
 */
const { GOOGLE_ADS } = require('../config');

const DATE_PRESETS = new Set([
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_28d',
  'this_month',
  'last_month',
]);

const STATUS_CAMPANHA_PADRAO = ['ENABLED', 'PAUSED'];

const STATUS_PARA_PAINEL = {
  ENABLED: 'ACTIVE',
  PAUSED: 'PAUSED',
  REMOVED: 'DELETED',
};

/** Cache do access token em memória. */
let tokenCache = { accessToken: null, expiraEm: 0 };

function configurado() {
  return Boolean(
    GOOGLE_ADS.clientId &&
      String(GOOGLE_ADS.clientId).trim() &&
      GOOGLE_ADS.clientSecret &&
      String(GOOGLE_ADS.clientSecret).trim() &&
      GOOGLE_ADS.refreshToken &&
      String(GOOGLE_ADS.refreshToken).trim() &&
      GOOGLE_ADS.developerToken &&
      String(GOOGLE_ADS.developerToken).trim() &&
      GOOGLE_ADS.customerId &&
      String(GOOGLE_ADS.customerId).trim(),
  );
}

function customerId() {
  return String(GOOGLE_ADS.customerId || '').trim();
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
    'Google Ads não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_DEVELOPER_TOKEN e GOOGLE_ADS_CUSTOMER_ID em interface/.env.',
  );
  err.codigo = 'nao_configurado';
  err.status = 503;
  return err;
}

function numOuNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function microsParaUnidade(v) {
  const n = numOuNull(v);
  if (n === null) return null;
  return n / 1_000_000;
}

function isoDataUTC(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Converte preset da UI Meta/Tráfego em cláusula GAQL de data.
 * last_28d usa BETWEEN (Google não tem LAST_28_DAYS).
 */
function clausulaData(date_preset) {
  const preset = DATE_PRESETS.has(date_preset) ? date_preset : 'last_28d';
  const mapa = {
    today: 'segments.date DURING TODAY',
    yesterday: 'segments.date DURING YESTERDAY',
    last_7d: 'segments.date DURING LAST_7_DAYS',
    last_14d: 'segments.date DURING LAST_14_DAYS',
    this_month: 'segments.date DURING THIS_MONTH',
    last_month: 'segments.date DURING LAST_MONTH',
  };
  if (mapa[preset]) return { clausula: mapa[preset], preset };

  const ate = new Date();
  const desde = new Date(ate);
  desde.setUTCDate(desde.getUTCDate() - 27);
  return {
    clausula: `segments.date BETWEEN '${isoDataUTC(desde)}' AND '${isoDataUTC(ate)}'`,
    preset: 'last_28d',
  };
}

function mapearStatus(statusGoogle) {
  if (!statusGoogle) return null;
  return STATUS_PARA_PAINEL[statusGoogle] || statusGoogle;
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
        client_id: GOOGLE_ADS.clientId,
        client_secret: GOOGLE_ADS.clientSecret,
        refresh_token: GOOGLE_ADS.refreshToken,
      }),
    });
  } catch (rede) {
    throw erroGoogle(`Falha de rede ao renovar token OAuth: ${rede.message}`, 502);
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo.access_token) {
    const msg =
      corpo.error_description || corpo.error || `OAuth retornou ${resposta.status}`;
    throw erroGoogle(msg, resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502, corpo);
  }

  const expiresIn = Number(corpo.expires_in) || 3600;
  tokenCache = {
    accessToken: corpo.access_token,
    expiraEm: agora + expiresIn * 1000,
  };
  return tokenCache.accessToken;
}

/**
 * Executa GAQL via googleAds:searchStream e devolve as linhas (results).
 */
async function searchStream(query) {
  if (!configurado()) throw erroNaoConfigurado();

  const accessToken = await obterAccessToken();
  const versao = GOOGLE_ADS.apiVersion || 'v21';
  const id = customerId();
  const url = `https://googleads.googleapis.com/${versao}/customers/${id}/googleAds:searchStream`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': GOOGLE_ADS.developerToken,
    'Content-Type': 'application/json',
  };
  if (GOOGLE_ADS.loginCustomerId) {
    headers['login-customer-id'] = GOOGLE_ADS.loginCustomerId;
  }

  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });
  } catch (rede) {
    throw erroGoogle(`Falha de rede ao chamar Google Ads API: ${rede.message}`, 502);
  }

  const texto = await resposta.text();
  let corpo;
  try {
    corpo = texto ? JSON.parse(texto) : [];
  } catch {
    throw erroGoogle(`Resposta inválida da Google Ads API (${resposta.status})`, 502);
  }

  if (!resposta.ok) {
    const errObj = Array.isArray(corpo)
      ? corpo[0]?.error
      : corpo?.error || corpo;
    const msg =
      errObj?.message ||
      errObj?.details?.[0]?.errors?.[0]?.message ||
      `Google Ads API retornou ${resposta.status}`;
    throw erroGoogle(
      msg,
      resposta.status >= 400 && resposta.status < 600 ? resposta.status : 502,
      errObj,
    );
  }

  // searchStream devolve um array de batches; cada um tem results[].
  const batches = Array.isArray(corpo) ? corpo : [corpo];
  const linhas = [];
  for (const batch of batches) {
    if (Array.isArray(batch?.results)) linhas.push(...batch.results);
  }
  return linhas;
}

async function obterConta() {
  const id = customerId();
  const linhas = await searchStream(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone
    FROM customer
    LIMIT 1
  `);
  const row = linhas[0] || {};
  const cust = row.customer || {};
  return {
    id: cust.id != null ? String(cust.id) : id,
    name: cust.descriptiveName || cust.descriptive_name || null,
    account_status: null,
    currency: cust.currencyCode || cust.currency_code || null,
    timezone_name: cust.timeZone || cust.time_zone || null,
    amount_spent: null,
    balance: null,
  };
}

async function listarCampanhas({ status } = {}) {
  let statuses = STATUS_CAMPANHA_PADRAO;
  if (status) {
    const lista = Array.isArray(status)
      ? status
      : String(status)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    if (lista.length) {
      statuses = lista.map((s) => {
        const u = s.toUpperCase();
        if (u === 'ACTIVE') return 'ENABLED';
        return u;
      });
    }
  }

  const inList = statuses.map((s) => `'${s}'`).join(', ');
  const linhas = await searchStream(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status IN (${inList})
    ORDER BY campaign.name
  `);

  return linhas.map((row) => {
    const c = row.campaign || {};
    const budget = row.campaignBudget || row.campaign_budget || {};
    const statusGoogle = c.status || null;
    return {
      id: c.id != null ? String(c.id) : null,
      name: c.name || null,
      objective: c.advertisingChannelType || c.advertising_channel_type || null,
      status: mapearStatus(statusGoogle),
      effective_status: mapearStatus(statusGoogle),
      daily_budget: microsParaUnidade(budget.amountMicros ?? budget.amount_micros),
      lifetime_budget: null,
      created_time: null,
      updated_time: null,
    };
  });
}

function normalizarLinhaInsight(row) {
  const c = row.campaign || {};
  const m = row.metrics || {};
  const impressions = numOuNull(m.impressions);
  const clicks = numOuNull(m.clicks);
  const spend = microsParaUnidade(m.costMicros ?? m.cost_micros);
  const ctrRaw = numOuNull(m.ctr);
  // Google devolve CTR como fração (0.05 = 5%); o painel Meta espera percentual.
  const ctr = ctrRaw != null ? ctrRaw * 100 : null;
  const cpc = microsParaUnidade(m.averageCpc ?? m.average_cpc);
  const conversions = numOuNull(m.conversions);
  const cpa = microsParaUnidade(m.costPerConversion ?? m.cost_per_conversion);
  const cpm =
    spend != null && impressions != null && impressions > 0
      ? (spend / impressions) * 1000
      : null;

  return {
    level: 'campaign',
    campaign_id: c.id != null ? String(c.id) : null,
    campaign_name: c.name || null,
    adset_id: null,
    adset_name: null,
    ad_id: null,
    ad_name: null,
    date_start: null,
    date_stop: null,
    impressions,
    clicks,
    spend,
    reach: null,
    cpc,
    cpm,
    ctr,
    frequency: null,
    resultado_tipo: conversions != null ? 'conversions' : null,
    resultado: conversions,
    cpa,
    purchase_roas: null,
    actions: [],
    cost_per_action_type: [],
  };
}

function agregarTotais(linhas) {
  if (!linhas.length) return null;
  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  let conversions = 0;
  let temImpressions = false;
  let temClicks = false;
  let temSpend = false;
  let temConv = false;

  for (const l of linhas) {
    if (l.impressions != null) {
      impressions += l.impressions;
      temImpressions = true;
    }
    if (l.clicks != null) {
      clicks += l.clicks;
      temClicks = true;
    }
    if (l.spend != null) {
      spend += l.spend;
      temSpend = true;
    }
    if (l.resultado != null) {
      conversions += l.resultado;
      temConv = true;
    }
  }

  const imp = temImpressions ? impressions : null;
  const clk = temClicks ? clicks : null;
  const sp = temSpend ? spend : null;
  const conv = temConv ? conversions : null;
  const ctr = imp != null && clk != null && imp > 0 ? (clk / imp) * 100 : null;
  const cpc = sp != null && clk != null && clk > 0 ? sp / clk : null;
  const cpm = sp != null && imp != null && imp > 0 ? (sp / imp) * 1000 : null;
  const cpa = sp != null && conv != null && conv > 0 ? sp / conv : null;

  return {
    level: 'account',
    campaign_id: null,
    campaign_name: null,
    impressions: imp,
    clicks: clk,
    spend: sp,
    reach: null,
    cpc,
    cpm,
    ctr,
    frequency: null,
    resultado_tipo: conv != null ? 'conversions' : null,
    resultado: conv,
    cpa,
    purchase_roas: null,
    actions: [],
    cost_per_action_type: [],
  };
}

function agregarPorCampanha(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const id = l.campaign_id;
    if (!id) continue;
    const prev = mapa.get(id);
    if (!prev) {
      mapa.set(id, { ...l });
      continue;
    }
    prev.impressions = (prev.impressions || 0) + (l.impressions || 0);
    prev.clicks = (prev.clicks || 0) + (l.clicks || 0);
    prev.spend = (prev.spend || 0) + (l.spend || 0);
    prev.resultado =
      prev.resultado != null || l.resultado != null
        ? (prev.resultado || 0) + (l.resultado || 0)
        : null;
  }
  return [...mapa.values()].map((l) => {
    const imp = l.impressions;
    const clk = l.clicks;
    const sp = l.spend;
    const conv = l.resultado;
    return {
      ...l,
      ctr: imp > 0 && clk != null ? (clk / imp) * 100 : null,
      cpc: clk > 0 && sp != null ? sp / clk : null,
      cpm: imp > 0 && sp != null ? (sp / imp) * 1000 : null,
      cpa: conv > 0 && sp != null ? sp / conv : null,
      resultado_tipo: conv != null ? 'conversions' : null,
    };
  });
}

async function obterInsights({ date_preset } = {}) {
  const { clausula, preset } = clausulaData(date_preset);
  const linhasRaw = await searchStream(`
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE ${clausula}
      AND campaign.status != 'REMOVED'
  `);

  const normalizadas = agregarPorCampanha(
    linhasRaw.map(normalizarLinhaInsight).filter((l) => l.campaign_id),
  );
  const totais = agregarTotais(normalizadas);

  return {
    level: 'campaign',
    date_preset: preset,
    time_range: null,
    totais,
    linhas: normalizadas,
  };
}

module.exports = {
  configurado,
  obterConta,
  listarCampanhas,
  obterInsights,
  searchStream,
  DATE_PRESETS,
};
