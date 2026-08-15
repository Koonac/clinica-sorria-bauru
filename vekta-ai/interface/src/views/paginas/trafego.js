/* Página: Tráfego — Meta Ads + Google Ads (análise) + chat lateral. */
import {
  $,
  el,
  api,
  md,
  CLASSE_PAINEL,
  CLASSE_VAZIO,
  animarEntrada,
} from "../.core/util.js";
import { socket } from "../.core/socket.js";
import {
  analisarPerguntas,
  ocultarPerguntaEmStreaming,
  anexarPerguntas,
} from "../.core/perguntas.js";
import {
  analisarArquivos,
  ocultarArquivoEmStreaming,
  anexarArquivos,
} from "../.core/arquivos.js";

function analisarWidgets(texto) {
  const { limpo: semArquivos, arquivos } = analisarArquivos(texto);
  const { limpo, perguntas } = analisarPerguntas(semArquivos);
  return { limpo, arquivos, perguntas };
}

function ocultarWidgetsEmStreaming(texto) {
  return ocultarPerguntaEmStreaming(ocultarArquivoEmStreaming(texto));
}

const CANAL = "trafego";

const SUBABAS = [
  { id: "meta", rotulo: "Meta Ads" },
  { id: "google", rotulo: "Google Ads" },
];

const PERIODOS = [
  { id: "today", rotulo: "Hoje" },
  { id: "yesterday", rotulo: "Ontem" },
  { id: "last_7d", rotulo: "7 dias" },
  { id: "last_14d", rotulo: "14 dias" },
  { id: "last_28d", rotulo: "28 dias" },
  { id: "this_month", rotulo: "Este mês" },
  { id: "last_month", rotulo: "Mês passado" },
];

const ROTULOS_PERIODO = Object.fromEntries(PERIODOS.map((p) => [p.id, p.rotulo]));

const ROTULOS_STATUS = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  DELETED: "Excluída",
  ARCHIVED: "Arquivada",
  CAMPAIGN_PAUSED: "Campanha pausada",
  IN_PROCESS: "Em processo",
  WITH_ISSUES: "Com problemas",
};

let subabaAtiva = "meta";
let periodoAtivo = "last_28d";
let carregando = false;
let ouvintesProntos = false;
let chatPronto = false;
let moedaConta = "BRL";
/** Status de configuração por plataforma (preenchido em iniciar). */
let statusMetaOk = false;
let statusGoogleOk = false;
/** Último snapshot carregado — usado por “Gerar análise”. */
let ultimoSnapshot = null;
/** Campanhas Meta expandidas (mostra anúncios). */
let campanhasExpandidas = new Set();
/** Função de envio do chat (definida em iniciarChatTrafego). */
let enviarChatTexto = null;
let chatOcupado = false;

function pillClasse(ativo) {
  const base = "px-3.5 py-1.25 rounded-full text-sm transition-colors";
  return ativo
    ? `${base} bg-vekta border border-vekta text-white`
    : `${base} border border-linha bg-superficie text-cinza hover:border-cinza-claro hover:text-tinta`;
}

function formatarNumero(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return "—";
  const n = Number(valor);
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} mi`;
  if (Math.abs(n) >= 10_000)
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")} mil`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatarDecimal(valor, casas = 2) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return "—";
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarMoeda(valor, moeda = moedaConta) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return "—";
  try {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: moeda || "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${formatarDecimal(valor)} ${moeda || ""}`.trim();
  }
}

function formatarPct(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return "—";
  return `${formatarDecimal(valor, 2)}%`;
}

function formatarSegundos(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor)))
    return "—";
  const n = Number(valor);
  if (n >= 60) {
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}m ${s}s`;
  }
  return `${formatarDecimal(n, 1)}s`;
}

function rotuloObjetivo(obj) {
  if (!obj) return "—";
  return String(obj)
    .replace(/^OUTCOME_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function rotuloStatus(s) {
  if (!s) return "—";
  return ROTULOS_STATUS[s] || s;
}

function statusClasse(s) {
  if (s === "ACTIVE") return "text-emerald-600 bg-emerald-500/10";
  if (s === "PAUSED" || s === "CAMPAIGN_PAUSED")
    return "text-amber-700 bg-amber-500/10";
  if (s === "WITH_ISSUES") return "text-alerta bg-alerta/10";
  return "text-cinza bg-fundo";
}

function slugConta(nome, id) {
  const base = String(nome || id || "conta")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "conta";
}

function dataHojeIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setCarregando(v) {
  carregando = v;
  const btn = $("#tf-atualizar");
  if (btn) btn.disabled = v;
  atualizarBotaoAnalise();
}

function atualizarBotaoAnalise() {
  const btn = $("#tf-gerar-analise");
  if (!btn) return;
  const conteudoOk = !$("#tf-conteudo")?.classList.contains("hidden");
  const plataformaOk =
    (subabaAtiva === "meta" || subabaAtiva === "google") &&
    Boolean(ultimoSnapshot) &&
    ultimoSnapshot.plataforma === subabaAtiva;
  const visivel = conteudoOk && plataformaOk;
  btn.classList.toggle("hidden", !visivel);
  btn.disabled = carregando || chatOcupado || !ultimoSnapshot;
}

function mostrarErro(msg) {
  const no = $("#tf-erro");
  if (!no) return;
  if (!msg) {
    no.classList.add("hidden");
    no.textContent = "";
    return;
  }
  no.textContent = msg;
  no.classList.remove("hidden");
}

function montarSubabas() {
  const container = $("#tf-subabas");
  if (!container) return;
  container.innerHTML = "";
  for (const aba of SUBABAS) {
    container.append(
      el(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": String(aba.id === subabaAtiva),
          class: pillClasse(aba.id === subabaAtiva),
          onclick: () => trocarSubaba(aba.id),
        },
        aba.rotulo,
      ),
    );
  }
}

function trocarSubaba(id) {
  if (id === subabaAtiva) return;
  subabaAtiva = id;
  montarSubabas();
  void aplicarVisibilidadeSubaba();
}

function plataformaConfigurada(id = subabaAtiva) {
  return id === "google" ? statusGoogleOk : statusMetaOk;
}

async function aplicarVisibilidadeSubaba() {
  const ok = plataformaConfigurada(subabaAtiva);
  $("#tf-setup-meta")?.classList.toggle(
    "hidden",
    !(subabaAtiva === "meta" && !statusMetaOk),
  );
  $("#tf-setup-google")?.classList.toggle(
    "hidden",
    !(subabaAtiva === "google" && !statusGoogleOk),
  );
  $("#tf-conteudo")?.classList.toggle("hidden", !ok);
  $("#tf-painel-meta")?.classList.toggle(
    "hidden",
    !(ok && subabaAtiva === "meta"),
  );
  $("#tf-painel-google")?.classList.toggle(
    "hidden",
    !(ok && subabaAtiva === "google"),
  );

  if (!ok) {
    ultimoSnapshot = null;
    mostrarErro("");
    atualizarBotaoAnalise();
    return;
  }

  if (subabaAtiva === "google") {
    await carregarGoogle();
  } else {
    await carregarMeta();
  }
}

function montarSeletorPeriodo(onChange) {
  const grupo = el("div", { class: "flex gap-2 flex-wrap" });
  for (const p of PERIODOS) {
    grupo.append(
      el(
        "button",
        {
          type: "button",
          class: pillClasse(p.id === periodoAtivo),
          onclick: async () => {
            if (periodoAtivo === p.id || carregando) return;
            periodoAtivo = p.id;
            await onChange();
          },
        },
        p.rotulo,
      ),
    );
  }
  return grupo;
}

function cardKpi(rotulo, valor) {
  return el(
    "article",
    { class: `${CLASSE_PAINEL} flex flex-col gap-1.5 min-w-0` },
    el(
      "span",
      { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
      rotulo,
    ),
    el(
      "span",
      { class: "font-display text-2xl font-semibold text-tinta truncate" },
      valor,
    ),
  );
}

function celula(texto, classe = "") {
  return el(
    "td",
    { class: `px-3 py-2.5 text-sm text-tinta whitespace-nowrap ${classe}` },
    texto,
  );
}

function cabecalhoTabela(colunas) {
  return el(
    "thead",
    {},
    el(
      "tr",
      { class: "border-b border-linha text-left" },
      ...colunas.map((h) =>
        el(
          "th",
          {
            class:
              "px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-cinza font-medium",
          },
          h,
        ),
      ),
    ),
  );
}

function badgeStatus(status) {
  return el(
    "span",
    {
      class: `inline-block font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${statusClasse(status)}`,
    },
    rotuloStatus(status),
  );
}

function agruparAnunciosPorCampanha(linhasAd) {
  const map = new Map();
  for (const l of linhasAd || []) {
    const cid = l.campaign_id ? String(l.campaign_id) : null;
    if (!cid) continue;
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push({
      id: l.ad_id,
      name: l.ad_name,
      adset_id: l.adset_id,
      adset_name: l.adset_name,
      spend: l.spend,
      impressions: l.impressions,
      clicks: l.clicks,
      ctr: l.ctr,
      cpc: l.cpc,
      cpm: l.cpm,
      reach: l.reach,
      resultado: l.resultado,
      resultado_tipo: l.resultado_tipo,
      cpa: l.cpa,
      video_plays: l.video_plays,
      video_3s: l.video_3s,
      video_2s: l.video_2s,
      video_thruplay: l.video_thruplay,
      video_avg_time: l.video_avg_time,
      video_p25: l.video_p25,
      video_p50: l.video_p50,
      video_p75: l.video_p75,
      video_p100: l.video_p100,
      video_p25_pct: l.video_p25_pct,
      video_p50_pct: l.video_p50_pct,
      video_p75_pct: l.video_p75_pct,
      video_p100_pct: l.video_p100_pct,
      video_thruplay_pct: l.video_thruplay_pct,
    });
  }
  for (const ads of map.values()) {
    ads.sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
  }
  return map;
}

/** @type {import('chart.js').Chart | null} */
let chartRetencaoAnuncio = null;

function fecharModalAnuncio() {
  if (chartRetencaoAnuncio) {
    chartRetencaoAnuncio.destroy();
    chartRetencaoAnuncio = null;
  }
  $("#tf-modal-anuncio")?.remove();
  document.removeEventListener("keydown", onEscModalAnuncio);
}

function onEscModalAnuncio(e) {
  if (e.key === "Escape") fecharModalAnuncio();
}

function anuncioTemVideo(ad) {
  return (
    ad?.video_3s != null ||
    ad?.video_plays != null ||
    ad?.video_thruplay != null ||
    ad?.video_p25 != null ||
    ad?.video_avg_time != null
  );
}

function pct3sDoAnuncio(ad) {
  if (ad.video_3s == null) return null;
  const base = ad.video_plays > 0 ? ad.video_plays : null;
  if (base) return (ad.video_3s / base) * 100;
  // Sem plays, 3s é a referência Meta de “video view” — mostra 100 no ponto 3s se só houver esse dado.
  return ad.video_3s > 0 ? 100 : 0;
}

function abrirModalAnuncio(ad) {
  fecharModalAnuncio();

  const titulo = ad.name || ad.id || "Anúncio";
  const canvas = el("canvas", {
    id: "tf-chart-retencao",
    "aria-label": "Gráfico de retenção de vídeo",
  });

  const kpisVideo = el(
    "div",
    {
      class:
        "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5",
    },
    cardKpi("Visualizações 3s", formatarNumero(ad.video_3s)),
    cardKpi("ThruPlay", formatarNumero(ad.video_thruplay)),
    cardKpi("Tempo médio", formatarSegundos(ad.video_avg_time)),
    cardKpi("Retenção 25%", formatarPct(ad.video_p25_pct)),
    cardKpi("Retenção 100%", formatarPct(ad.video_p100_pct)),
  );

  const pontosRetencao = anuncioTemVideo(ad)
    ? [
        { rotulo: "Início", valor: 100 },
        { rotulo: "3s", valor: pct3sDoAnuncio(ad) },
        { rotulo: "25%", valor: ad.video_p25_pct },
        { rotulo: "50%", valor: ad.video_p50_pct },
        { rotulo: "75%", valor: ad.video_p75_pct },
        { rotulo: "100%", valor: ad.video_p100_pct },
      ].filter((p) => p.valor != null)
    : [];

  const areaGrafico =
    pontosRetencao.length >= 2
      ? el("div", { class: "relative h-64 w-full mb-2" }, canvas)
      : el(
          "p",
          { class: `${CLASSE_VAZIO} mb-2` },
          anuncioTemVideo(ad)
            ? "Há métricas de vídeo, mas não o suficiente para montar a curva de retenção."
            : "Sem métricas de vídeo neste período (anúncio sem vídeo ou sem reproduções).",
        );

  const painel = el(
    "div",
    {
      class:
        "bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-6",
      onclick: (e) => e.stopPropagation(),
    },
    el(
      "div",
      { class: "flex items-start justify-between gap-3 mb-4" },
      el(
        "div",
        { class: "min-w-0" },
        el(
          "p",
          {
            class:
              "font-mono text-[11px] uppercase tracking-wider text-cinza mb-1",
          },
          ad.adset_name ? `Conjunto · ${ad.adset_name}` : "Anúncio",
        ),
        el(
          "h2",
          {
            id: "tf-modal-anuncio-titulo",
            class: "font-display text-xl font-semibold text-tinta truncate",
          },
          titulo,
        ),
      ),
      el(
        "button",
        {
          type: "button",
          class:
            "shrink-0 w-9 h-9 rounded-full border border-linha flex items-center justify-center text-cinza hover:text-tinta hover:border-cinza-claro transition-colors",
          "aria-label": "Fechar",
          onclick: () => fecharModalAnuncio(),
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:x",
          class: "text-[16px]",
          "aria-hidden": "true",
        }),
      ),
    ),
    el(
      "div",
      {
        class:
          "grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5",
      },
      cardKpi("Gasto", formatarMoeda(ad.spend)),
      cardKpi("Impressões", formatarNumero(ad.impressions)),
      cardKpi("Cliques", formatarNumero(ad.clicks)),
      cardKpi("CTR", formatarPct(ad.ctr)),
    ),
    el(
      "h3",
      { class: "font-display text-base font-semibold text-tinta mb-3" },
      "Retenção de vídeo",
    ),
    kpisVideo,
    areaGrafico,
    el(
      "p",
      { class: "font-mono text-[11px] text-cinza mt-1" },
      "Curva em % das reproduções (início = 100%). 3s = video views · ThruPlay = ≥15s ou até o fim.",
    ),
  );

  const overlay = el(
    "div",
    {
      id: "tf-modal-anuncio",
      class:
        "fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/55 backdrop-blur-sm",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "tf-modal-anuncio-titulo",
      onclick: () => fecharModalAnuncio(),
    },
    painel,
  );

  document.body.append(overlay);
  document.addEventListener("keydown", onEscModalAnuncio);

  if (pontosRetencao.length < 2 || typeof Chart === "undefined") return;

  chartRetencaoAnuncio = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: pontosRetencao.map((p) => p.rotulo),
      datasets: [
        {
          label: "Retenção",
          data: pontosRetencao.map((p) => Number(p.valor)),
          borderColor: "#0E8A76",
          backgroundColor: "rgba(14, 138, 118, 0.18)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#0E8A76",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${formatarDecimal(ctx.parsed.y, 1)}% das reproduções`,
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            callback: (v) => `${v}%`,
            color: "#6B7585",
          },
          grid: { color: "rgba(213, 219, 229, 0.7)" },
        },
        x: {
          ticks: { color: "#6B7585" },
          grid: { display: false },
        },
      },
    },
  });
}

function montarLinhasAnuncios(anuncios) {
  const wrap = el("div", { class: "px-3 py-3 bg-fundo/80" });
  if (!anuncios.length) {
    wrap.append(
      el(
        "p",
        { class: "text-sm text-cinza px-1" },
        "Nenhum anúncio com dados neste período.",
      ),
    );
    return wrap;
  }

  const thead = cabecalhoTabela([
    "Anúncio",
    "Conjunto",
    "Gasto",
    "Impressões",
    "Cliques",
    "CTR",
    "CPC",
  ]);
  const tbody = el("tbody", {});
  for (const ad of anuncios) {
    tbody.append(
      el(
        "tr",
        {
          class:
            "group border-b border-linha/50 last:border-0 cursor-pointer transition-colors hover:bg-vekta-suave",
          title: "Ver retenção e detalhes do anúncio",
          onclick: () => abrirModalAnuncio(ad),
        },
        el(
          "td",
          { class: "px-3 py-2.5 text-sm text-tinta whitespace-nowrap" },
          el(
            "span",
            {
              class:
                "inline-flex items-center gap-1.5 font-medium text-vekta max-w-[220px]",
            },
            el(
              "span",
              { class: "truncate group-hover:underline underline-offset-2" },
              ad.name || ad.id || "—",
            ),
            el("iconify-icon", {
              noobserver: "",
              icon: "lucide:chart-line",
              class:
                "text-[13px] shrink-0 opacity-55 group-hover:opacity-100 transition-opacity",
              "aria-hidden": "true",
            }),
          ),
        ),
        celula(ad.adset_name || "—", "text-cinza max-w-[160px] truncate"),
        celula(formatarMoeda(ad.spend)),
        celula(formatarNumero(ad.impressions)),
        celula(formatarNumero(ad.clicks)),
        celula(formatarPct(ad.ctr)),
        celula(formatarMoeda(ad.cpc)),
      ),
    );
  }

  wrap.append(
    el(
      "div",
      { class: "overflow-x-auto rounded-lg border border-linha/80 bg-superficie" },
      el(
        "table",
        { class: "w-full min-w-[720px] border-collapse" },
        thead,
        tbody,
      ),
    ),
  );
  return wrap;
}

function montarTabelaCampanhas(linhas, { anunciosPorCampanha = null } = {}) {
  if (!linhas.length) {
    return el(
      "p",
      { class: CLASSE_VAZIO },
      "Nenhuma campanha com dados neste período.",
    );
  }

  const comAnuncios = anunciosPorCampanha instanceof Map;
  const thead = cabecalhoTabela([
    "Campanha",
    "Status",
    "Objetivo",
    "Gasto",
    "Impressões",
    "Cliques",
    "CTR",
    "CPC",
  ]);

  const tbody = el("tbody", {});
  for (const row of linhas) {
    const status = row.effective_status || row.status;
    const campanhaId = row.id != null ? String(row.id) : null;
    const anuncios =
      comAnuncios && campanhaId
        ? anunciosPorCampanha.get(campanhaId) || []
        : [];
    const temAnuncios = comAnuncios && anuncios.length > 0;
    const expandida =
      temAnuncios && campanhaId && campanhasExpandidas.has(campanhaId);

    const nomeCampanha = row.name || row.campaign_name || "—";
    const celulaNome = temAnuncios
      ? el(
          "td",
          { class: "px-3 py-2.5 text-sm text-tinta whitespace-nowrap" },
          el(
            "button",
            {
              type: "button",
              class:
                "inline-flex items-center gap-1.5 max-w-[260px] text-left font-medium hover:text-vekta transition-colors",
              "aria-expanded": String(expandida),
              title: expandida
                ? "Ocultar anúncios"
                : `Ver ${anuncios.length} anúncio${anuncios.length === 1 ? "" : "s"}`,
              onclick: () => {
                if (campanhasExpandidas.has(campanhaId)) {
                  campanhasExpandidas.delete(campanhaId);
                } else {
                  campanhasExpandidas.add(campanhaId);
                }
                rerenderTabelaMeta();
              },
            },
            el("iconify-icon", {
              noobserver: "",
              icon: expandida ? "lucide:chevron-down" : "lucide:chevron-right",
              class: "text-[14px] text-cinza shrink-0",
              "aria-hidden": "true",
            }),
            el("span", { class: "truncate" }, nomeCampanha),
            el(
              "span",
              {
                class:
                  "shrink-0 font-mono text-[10px] uppercase tracking-wider text-cinza font-normal",
              },
              `(${anuncios.length})`,
            ),
          ),
        )
      : celula(nomeCampanha, "font-medium max-w-[220px] truncate");

    tbody.append(
      el(
        "tr",
        {
          class: `border-b border-linha/70 hover:bg-fundo/60 ${expandida ? "bg-fundo/40" : ""}`,
        },
        celulaNome,
        el("td", { class: "px-3 py-2.5" }, badgeStatus(status)),
        celula(rotuloObjetivo(row.objective)),
        celula(formatarMoeda(row.spend)),
        celula(formatarNumero(row.impressions)),
        celula(formatarNumero(row.clicks)),
        celula(formatarPct(row.ctr)),
        celula(formatarMoeda(row.cpc)),
      ),
    );

    if (expandida) {
      tbody.append(
        el(
          "tr",
          { class: "border-b border-linha/70 last:border-0" },
          el("td", { colspan: "8", class: "p-0" }, montarLinhasAnuncios(anuncios)),
        ),
      );
    }
  }

  return el(
    "div",
    {
      ...(comAnuncios ? { id: "tf-tabela-campanhas-meta" } : {}),
      class: `${CLASSE_PAINEL} overflow-x-auto p-0`,
    },
    el("table", { class: "w-full min-w-[720px] border-collapse" }, thead, tbody),
  );
}

/** Dados do último render Meta — para reabrir anúncios sem novo fetch. */
let ultimoRenderMeta = null;

function rerenderTabelaMeta() {
  if (!ultimoRenderMeta) return;
  const host = $("#tf-tabela-campanhas-meta");
  if (!host) return;
  const nova = montarTabelaCampanhas(ultimoRenderMeta.rows, {
    anunciosPorCampanha: ultimoRenderMeta.anunciosPorCampanha,
  });
  host.replaceWith(nova);
}

function mesclarCampanhasComInsights(campanhas, insightsLinhas) {
  const porId = new Map();
  for (const l of insightsLinhas || []) {
    if (l.campaign_id) porId.set(String(l.campaign_id), l);
  }

  const vistos = new Set();
  const rows = [];

  for (const c of campanhas || []) {
    const insight = porId.get(String(c.id));
    vistos.add(String(c.id));
    rows.push({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effective_status: c.effective_status,
      spend: insight?.spend ?? null,
      impressions: insight?.impressions ?? null,
      clicks: insight?.clicks ?? null,
      ctr: insight?.ctr ?? null,
      cpc: insight?.cpc ?? null,
      cpm: insight?.cpm ?? null,
      reach: insight?.reach ?? null,
      resultado: insight?.resultado ?? null,
      resultado_tipo: insight?.resultado_tipo ?? null,
      cpa: insight?.cpa ?? null,
    });
  }

  for (const l of insightsLinhas || []) {
    const id = l.campaign_id ? String(l.campaign_id) : null;
    if (!id || vistos.has(id)) continue;
    rows.push({
      id,
      name: l.campaign_name,
      campaign_name: l.campaign_name,
      objective: null,
      status: null,
      effective_status: null,
      spend: l.spend,
      impressions: l.impressions,
      clicks: l.clicks,
      ctr: l.ctr,
      cpc: l.cpc,
      cpm: l.cpm,
      reach: l.reach,
      resultado: l.resultado,
      resultado_tipo: l.resultado_tipo,
      cpa: l.cpa,
    });
  }

  rows.sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
  return rows;
}

function renderPainel(plataforma, { conta, insights, campanhas, anuncios = null }) {
  const painelId =
    plataforma === "google" ? "#tf-painel-google" : "#tf-painel-meta";
  const painel = $(painelId);
  if (!painel) return;
  painel.innerHTML = "";

  moedaConta = conta?.currency || "BRL";
  const totais = insights?.totais || {};
  const rows = mesclarCampanhasComInsights(campanhas, insights?.linhas);
  const anunciosPorCampanha =
    plataforma === "meta" && Array.isArray(anuncios)
      ? agruparAnunciosPorCampanha(anuncios)
      : null;
  const onPeriodo =
    plataforma === "google" ? () => carregarGoogle() : () => carregarMeta();

  const campanhasComAds = rows.map((c) => ({
    ...c,
    anuncios:
      anunciosPorCampanha && c.id != null
        ? anunciosPorCampanha.get(String(c.id)) || []
        : undefined,
  }));

  ultimoSnapshot = {
    plataforma,
    periodo: periodoAtivo,
    periodoRotulo: ROTULOS_PERIODO[periodoAtivo] || periodoAtivo,
    geradoEm: new Date().toISOString(),
    conta,
    totais,
    campanhas: campanhasComAds,
  };
  atualizarBotaoAnalise();

  if (plataforma === "meta" && anunciosPorCampanha) {
    ultimoRenderMeta = { rows, anunciosPorCampanha };
  } else {
    ultimoRenderMeta = null;
  }

  const cabecalho = el(
    "div",
    {
      class: `${CLASSE_PAINEL} mb-5 flex flex-wrap items-start justify-between gap-4`,
    },
    el(
      "div",
      { class: "min-w-0" },
      el(
        "p",
        {
          class:
            "font-mono text-[11px] uppercase tracking-wider text-cinza mb-1",
        },
        "Conta de anúncios",
      ),
      el(
        "h2",
        { class: "font-display text-xl font-semibold text-tinta truncate" },
        conta?.name || "—",
      ),
      el(
        "p",
        { class: "text-sm text-cinza mt-1" },
        [conta?.id, conta?.currency, conta?.timezone_name]
          .filter(Boolean)
          .join(" · ") || "—",
      ),
    ),
    montarSeletorPeriodo(onPeriodo),
  );

  const kpis = el(
    "div",
    {
      class:
        "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-5",
    },
    cardKpi("Gasto", formatarMoeda(totais.spend)),
    cardKpi("Impressões", formatarNumero(totais.impressions)),
    cardKpi("Cliques", formatarNumero(totais.clicks)),
    cardKpi("CTR", formatarPct(totais.ctr)),
    cardKpi("CPC", formatarMoeda(totais.cpc)),
    cardKpi("CPM", formatarMoeda(totais.cpm)),
    cardKpi(
      plataforma === "google" ? "Conversões" : "Alcance",
      plataforma === "google"
        ? formatarDecimal(totais.resultado, 2)
        : formatarNumero(totais.reach),
    ),
  );

  if (plataforma !== "google" && totais.resultado != null) {
    kpis.append(
      cardKpi(
        totais.resultado_tipo
          ? `Resultado (${totais.resultado_tipo.replace(/_/g, " ")})`
          : "Resultado",
        formatarNumero(totais.resultado),
      ),
    );
    if (totais.cpa != null) {
      kpis.append(cardKpi("CPA", formatarMoeda(totais.cpa)));
    }
  }

  if (plataforma === "google" && totais.cpa != null) {
    kpis.append(cardKpi("CPA", formatarMoeda(totais.cpa)));
  }

  const totalAnuncios = anunciosPorCampanha
    ? [...anunciosPorCampanha.values()].reduce((n, ads) => n + ads.length, 0)
    : 0;

  const tituloTabela = el(
    "div",
    { class: "flex items-center justify-between gap-3 mb-3" },
    el(
      "h3",
      { class: "font-display text-base font-semibold text-tinta" },
      "Campanhas",
    ),
    el(
      "span",
      { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
      plataforma === "meta" && totalAnuncios
        ? `${(campanhas || []).length} campanhas · ${totalAnuncios} anúncios`
        : `${(campanhas || []).length} listadas`,
    ),
  );

  const dica =
    plataforma === "meta" && totalAnuncios
      ? el(
          "p",
          { class: "text-sm text-cinza mb-3" },
          "Clique na campanha para listar os anúncios · clique no anúncio para ver retenção de vídeo.",
        )
      : null;

  painel.append(
    cabecalho,
    kpis,
    tituloTabela,
    ...(dica ? [dica] : []),
    montarTabelaCampanhas(rows, { anunciosPorCampanha }),
  );
  animarEntrada(painel.querySelectorAll("article, table, h3"));
}

function renderMeta(dados) {
  renderPainel("meta", dados);
}

function renderGoogle(dados) {
  renderPainel("google", dados);
}

function montarPedidoAnalise(snapshot) {
  const conta = snapshot.conta || {};
  const totais = snapshot.totais || {};
  const slug = slugConta(conta.name, conta.id);
  const data = dataHojeIso();
  const plataforma = snapshot.plataforma === "google" ? "google" : "meta";
  const pasta = plataforma === "google" ? "google-ads" : "meta-ads";
  const nomePlataforma = plataforma === "google" ? "Google Ads" : "Meta Ads";
  const caminho = `saidas/analises/${pasta}/${slug}/analise-${data}.md`;

  const linhasCampanha = (snapshot.campanhas || [])
    .map((c) => {
      const status = rotuloStatus(c.effective_status || c.status);
      return `| ${c.name || c.campaign_name || c.id || "—"} | ${status} | ${rotuloObjetivo(c.objective)} | ${c.spend ?? "—"} | ${c.impressions ?? "—"} | ${c.clicks ?? "—"} | ${c.ctr ?? "—"} | ${c.cpc ?? "—"} | ${c.reach ?? "—"} | ${c.resultado ?? "—"} | ${c.cpa ?? "—"} |`;
    })
    .join("\n");

  const linhasAnuncio = (snapshot.campanhas || [])
    .flatMap((c) => {
      const campanhaNome = c.name || c.campaign_name || c.id || "—";
      return (c.anuncios || []).map((ad) => {
        return `| ${campanhaNome} | ${ad.adset_name || "—"} | ${ad.name || ad.id || "—"} | ${ad.spend ?? "—"} | ${ad.impressions ?? "—"} | ${ad.clicks ?? "—"} | ${ad.ctr ?? "—"} | ${ad.cpc ?? "—"} | ${ad.resultado ?? "—"} | ${ad.cpa ?? "—"} |`;
      });
    })
    .join("\n");

  const secoesAnuncios =
    plataforma === "meta"
      ? [
          "",
          `## Anúncios (nível ad)`,
          `| Campanha | Conjunto | Anúncio | Spend | Impressões | Cliques | CTR | CPC | Resultado | CPA |`,
          `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
          linhasAnuncio ||
            "| — | — | — | — | — | — | — | — | — | — |",
        ]
      : [];

  return [
    `Gere uma análise das campanhas ${nomePlataforma} com base **somente** nos dados abaixo.`,
    "Não invente nem estime métricas ausentes.",
    "",
    `Salve o relatório em Markdown em: \`${caminho}\``,
    "Ao terminar, emita o bloco `vekta-arquivo` com esse caminho.",
    plataforma === "meta"
      ? "Inclua: resumo executivo, leitura dos KPIs, campanhas e anúncios que se destacam (positivos e negativos), e 3–5 recomendações práticas (sem criar/editar ads)."
      : "Inclua: resumo executivo, leitura dos KPIs, campanhas que se destacam (positivas e negativas), e 3–5 recomendações práticas (sem criar/editar ads).",
    "",
    `## Conta`,
    `- Nome: ${conta.name || "—"}`,
    `- ID: ${conta.id || "—"}`,
    `- Moeda: ${conta.currency || "—"}`,
    `- Fuso: ${conta.timezone_name || "—"}`,
    "",
    `## Período`,
    `- Preset: ${snapshot.periodo} (${snapshot.periodoRotulo || ""})`,
    `- Snapshot gerado em: ${snapshot.geradoEm || "—"}`,
    "",
    `## Totais da conta`,
    `- Gasto: ${totais.spend ?? "—"}`,
    `- Impressões: ${totais.impressions ?? "—"}`,
    `- Cliques: ${totais.clicks ?? "—"}`,
    `- CTR: ${totais.ctr ?? "—"}`,
    `- CPC: ${totais.cpc ?? "—"}`,
    `- CPM: ${totais.cpm ?? "—"}`,
    `- Alcance: ${totais.reach ?? "—"}`,
    `- Resultado (${totais.resultado_tipo || "n/d"}): ${totais.resultado ?? "—"}`,
    `- CPA: ${totais.cpa ?? "—"}`,
    `- Purchase ROAS: ${totais.purchase_roas ?? "—"}`,
    "",
    `## Campanhas (nível campaign)`,
    `| Campanha | Status | Objetivo | Spend | Impressões | Cliques | CTR | CPC | Alcance | Resultado | CPA |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
    linhasCampanha || "| — | — | — | — | — | — | — | — | — | — | — |",
    ...secoesAnuncios,
    "",
    "```json",
    JSON.stringify(snapshot, null, 2),
    "```",
  ].join("\n");
}

function mostrarChat() {
  const aside = $("#tf-chat");
  if (!aside) return;
  aside.classList.remove("hidden");
  aside.hidden = false;
  aside.scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("#tchat-entrada")?.focus();
}

function esconderChat() {
  const aside = $("#tf-chat");
  if (!aside) return;
  aside.classList.add("hidden");
  aside.hidden = true;
}

function gerarAnalise() {
  if (!ultimoSnapshot || ultimoSnapshot.plataforma !== subabaAtiva) {
    mostrarErro(
      subabaAtiva === "google"
        ? "Carregue os dados do Google Ads antes de gerar a análise."
        : "Carregue os dados do Meta Ads antes de gerar a análise.",
    );
    return;
  }
  if (chatOcupado) {
    mostrarErro("Aguarde o chat terminar a resposta atual.");
    return;
  }
  if (typeof enviarChatTexto !== "function") {
    mostrarErro("Chat ainda não está pronto.");
    return;
  }
  mostrarChat();
  const texto = montarPedidoAnalise(ultimoSnapshot);
  enviarChatTexto(texto);
}

async function carregarMeta() {
  setCarregando(true);
  mostrarErro("");
  fecharModalAnuncio();
  ultimoSnapshot = null;
  atualizarBotaoAnalise();
  const painel = $("#tf-painel-meta");
  if (painel) {
    painel.innerHTML = "";
    painel.append(
      el(
        "div",
        { class: CLASSE_PAINEL, role: "status", "aria-label": "Carregando" },
        el("p", { class: CLASSE_VAZIO }, "Carregando Meta Ads…"),
      ),
    );
  }

  try {
    const [conta, insights, campanhasResp, insightsAds] = await Promise.all([
      api("/api/trafego/meta/conta"),
      api(
        `/api/trafego/meta/insights?level=campaign&periodo=${encodeURIComponent(periodoAtivo)}`,
      ),
      api("/api/trafego/meta/campanhas"),
      api(
        `/api/trafego/meta/insights?level=ad&periodo=${encodeURIComponent(periodoAtivo)}`,
      ).catch((erroAd) => {
        console.warn("Falha ao carregar anúncios Meta:", erroAd);
        return { linhas: [] };
      }),
    ]);
    renderMeta({
      conta,
      insights,
      campanhas: campanhasResp?.campanhas || [],
      anuncios: insightsAds?.linhas || [],
    });
  } catch (erro) {
    mostrarErro(erro.message || "Falha ao carregar Meta Ads.");
    if (painel) {
      painel.innerHTML = "";
      painel.append(
        el(
          "p",
          { class: CLASSE_VAZIO },
          "Não foi possível carregar os dados do Meta Ads.",
        ),
      );
    }
  } finally {
    setCarregando(false);
  }
}

async function carregarGoogle() {
  setCarregando(true);
  mostrarErro("");
  ultimoSnapshot = null;
  atualizarBotaoAnalise();
  const painel = $("#tf-painel-google");
  if (painel) {
    painel.innerHTML = "";
    painel.append(
      el(
        "div",
        { class: CLASSE_PAINEL, role: "status", "aria-label": "Carregando" },
        el("p", { class: CLASSE_VAZIO }, "Carregando Google Ads…"),
      ),
    );
  }

  try {
    const [conta, insights, campanhasResp] = await Promise.all([
      api("/api/trafego/google/conta"),
      api(
        `/api/trafego/google/insights?periodo=${encodeURIComponent(periodoAtivo)}`,
      ),
      api("/api/trafego/google/campanhas"),
    ]);
    renderGoogle({
      conta,
      insights,
      campanhas: campanhasResp?.campanhas || [],
    });
  } catch (erro) {
    mostrarErro(erro.message || "Falha ao carregar Google Ads.");
    if (painel) {
      painel.innerHTML = "";
      painel.append(
        el(
          "p",
          { class: CLASSE_VAZIO },
          "Não foi possível carregar os dados do Google Ads.",
        ),
      );
    }
  } finally {
    setCarregando(false);
  }
}

async function carregarTudo() {
  if (!plataformaConfigurada(subabaAtiva)) {
    await aplicarVisibilidadeSubaba();
    return;
  }
  if (subabaAtiva === "google") {
    await carregarGoogle();
    return;
  }
  await carregarMeta();
}

// ==========================================================
// Chat tráfego (canal trafego — envelope /interface + contexto na 1ª msg)
// ==========================================================
function iniciarChatTrafego() {
  if (chatPronto) return;
  chatPronto = true;

  const mensagens = $("#tchat-mensagens");
  const rolagem = $("#tchat-rolagem");
  const entrada = $("#tchat-entrada");
  const botaoEnviar = $("#tchat-enviar");
  const botaoEnviarIcone = $("#tchat-enviar-icone");
  const botaoEnviarStop = $("#tchat-enviar-stop");
  const form = $("#tchat-form");

  let ocupado = false;
  let turnoAtual = null;

  function ajustarAltura() {
    entrada.style.height = "auto";
    entrada.style.height = `${Math.min(entrada.scrollHeight, 144)}px`;
  }

  function rolarFim() {
    rolagem.scrollTop = rolagem.scrollHeight;
  }

  function atualizarBotaoAcao() {
    const cancelar = ocupado;
    botaoEnviar.dataset.modo = cancelar ? "cancelar" : "enviar";
    botaoEnviar.title = cancelar ? "Cancelar" : "Enviar";
    botaoEnviar.setAttribute(
      "aria-label",
      cancelar ? "Cancelar geração" : "Enviar",
    );
    botaoEnviar.disabled = false;
    if (botaoEnviarIcone) botaoEnviarIcone.hidden = cancelar;
    if (botaoEnviarStop) botaoEnviarStop.hidden = !cancelar;
  }

  function definirOcupado(valor) {
    ocupado = valor;
    chatOcupado = valor;
    atualizarBotaoAcao();
    atualizarBotaoAnalise();
  }

  function cancelarGeracao() {
    if (!ocupado) return;
    socket.emit("chat:cancelar", { canal: CANAL });
  }

  function esconderBoasVindas() {
    $("#tchat-boasvindas")?.remove();
  }

  function adicionarUsuario(texto) {
    esconderBoasVindas();
    if (!texto) return;
    mensagens.append(
      el(
        "div",
        { class: "flex flex-col gap-1 items-end" },
        el(
          "div",
          {
            class:
              "bg-vekta text-white rounded-[16px_16px_4px_16px] px-3.5 py-2 max-w-[90%] whitespace-pre-wrap break-words text-sm",
          },
          texto,
        ),
      ),
    );
    rolarFim();
  }

  function garantirTurno() {
    if (turnoAtual) return turnoAtual;
    esconderBoasVindas();
    const corpo = el("div", { class: "markdown text-sm" });
    const chips = el("div", { class: "flex flex-wrap gap-1.5" });
    const digitando = el(
      "span",
      { class: "inline-flex gap-1 py-1" },
      el("span", {
        class: "w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho",
      }),
      el("span", {
        class:
          "w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho [animation-delay:150ms]",
      }),
      el("span", {
        class:
          "w-1.5 h-1.5 rounded-full bg-vekta animate-pulsinho [animation-delay:300ms]",
      }),
    );
    const balao = el(
      "div",
      {
        class:
          "bg-fundo border border-linha rounded-[16px_16px_16px_4px] px-3.5 py-2.5 max-w-[92%]",
      },
      corpo,
      digitando,
    );
    const msg = el(
      "div",
      { class: "flex flex-col gap-2 items-start" },
      chips,
      balao,
    );
    mensagens.append(msg);
    turnoAtual = {
      balao,
      corpo,
      chips,
      digitando,
      texto: "",
      blocosFechados: "",
    };
    rolarFim();
    return turnoAtual;
  }

  function renderizarTurno() {
    if (!turnoAtual) return;
    const completo = turnoAtual.blocosFechados + turnoAtual.texto;
    let visivel = analisarWidgets(completo).limpo;
    visivel = ocultarWidgetsEmStreaming(visivel);
    turnoAtual.corpo.innerHTML = md(visivel);
    rolarFim();
  }

  const opcoesPergunta = {
    estaOcupado: () => ocupado,
    onResponder: (texto) => {
      socket.emit("chat:enviar", {
        texto,
        anexos: [],
        canal: CANAL,
        pularSkill: true,
      });
    },
  };

  function fecharTurno() {
    turnoAtual?.digitando?.remove();
    turnoAtual = null;
  }

  function adicionarErro(texto) {
    fecharTurno();
    mensagens.append(
      el(
        "div",
        { class: "flex flex-col items-start" },
        el(
          "div",
          {
            class:
              "border border-alerta bg-alerta-suave text-alerta rounded-[16px_16px_16px_4px] px-3.5 py-2.5 max-w-[92%] text-sm",
          },
          texto,
        ),
      ),
    );
    rolarFim();
  }

  function enviar(textoForcado) {
    if (ocupado) return;
    const texto =
      textoForcado != null ? String(textoForcado) : entrada.value.trim();
    if (!texto) return;
    socket.emit("chat:enviar", { texto, anexos: [], canal: CANAL });
    entrada.value = "";
    ajustarAltura();
  }

  enviarChatTexto = (texto) => enviar(texto);

  socket.on("chat:evento", (evento) => {
    if ((evento.canal || "principal") !== CANAL) return;
    switch (evento.tipo) {
      case "usuario": {
        const bruto = evento.texto || "";
        const resumo =
          bruto.length > 280 || bruto.includes("## Campanhas")
            ? bruto.includes("Google Ads")
              ? "Gerar análise das campanhas Google Ads (dados do painel)."
              : "Gerar análise das campanhas Meta Ads (dados do painel)."
            : bruto;
        adicionarUsuario(resumo);
        break;
      }
      case "inicio":
        definirOcupado(true);
        garantirTurno();
        break;
      case "delta": {
        const turno = garantirTurno();
        turno.texto += evento.texto;
        renderizarTurno();
        break;
      }
      case "texto": {
        const turno = garantirTurno();
        turno.blocosFechados +=
          (turno.blocosFechados ? "\n\n" : "") + evento.texto;
        turno.texto = "";
        renderizarTurno();
        break;
      }
      case "ferramenta": {
        const turno = garantirTurno();
        turno.chips.append(
          el(
            "span",
            {
              class:
                "inline-flex items-center gap-1 font-mono text-[10px] text-cinza bg-superficie border border-dashed border-linha rounded-full px-2 py-0.5",
              title: evento.resumo || evento.nome,
            },
            el("b", { class: "text-vekta" }, evento.nome),
          ),
        );
        rolarFim();
        break;
      }
      case "fim":
        if (turnoAtual) {
          const textoFinal = turnoAtual.blocosFechados + turnoAtual.texto;
          const { limpo, perguntas, arquivos } = analisarWidgets(textoFinal);
          if (perguntas.length || arquivos.length) {
            if (!limpo) turnoAtual.balao.classList.add("hidden");
            const pai = turnoAtual.balao.parentElement;
            if (arquivos.length) anexarArquivos(pai, arquivos);
            if (perguntas.length)
              anexarPerguntas(pai, perguntas, opcoesPergunta);
            rolarFim();
          }
        }
        fecharTurno();
        definirOcupado(false);
        document.dispatchEvent(new CustomEvent("vekta-ai:producao-concluida"));
        break;
      case "cancelada":
        if (turnoAtual) {
          turnoAtual.balao.parentElement?.append(
            el(
              "span",
              { class: "font-mono text-[10px] text-cinza-claro" },
              "Cancelado",
            ),
          );
        }
        fecharTurno();
        definirOcupado(false);
        break;
      case "erro":
        adicionarErro(evento.texto);
        definirOcupado(false);
        break;
      case "encerrada":
        if (ocupado) {
          adicionarErro(
            "A sessão do Claude CLI foi encerrada. A próxima mensagem tenta retomá-la.",
          );
          definirOcupado(false);
        }
        break;
      case "reiniciada":
        fecharTurno();
        definirOcupado(false);
        mensagens.innerHTML = "";
        mensagens.append(
          el(
            "div",
            {
              id: "tchat-boasvindas",
              class:
                "flex-1 flex flex-col items-center justify-center text-center px-4 text-cinza",
            },
            el("iconify-icon", {
              noobserver: "",
              icon: "lucide:sparkles",
              class: "text-[28px] text-vekta mb-2",
              "aria-hidden": "true",
            }),
            el(
              "h2",
              { class: "font-display text-base text-tinta mb-1" },
              "Conversa nova",
            ),
            el(
              "p",
              { class: "text-sm" },
              "Peça outra análise de tráfego.",
            ),
          ),
        );
        break;
    }
  });

  socket.on("chat:estado", ({ ocupada, canal }) => {
    if ((canal || "principal") !== CANAL) return;
    definirOcupado(!!ocupada);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    enviar();
  });
  botaoEnviar.addEventListener("click", (e) => {
    if (!ocupado) return;
    e.preventDefault();
    cancelarGeracao();
  });
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  });
  entrada.addEventListener("input", ajustarAltura);
  $("#tchat-nova").addEventListener("click", () =>
    socket.emit("chat:nova-conversa", { canal: CANAL }),
  );
  $("#tchat-fechar")?.addEventListener("click", () => esconderChat());
}

export async function iniciar() {
  iniciarChatTrafego();

  if (!ouvintesProntos) {
    montarSubabas();
    $("#tf-atualizar")?.addEventListener("click", () => carregarTudo());
    $("#tf-gerar-analise")?.addEventListener("click", () => gerarAnalise());
    ouvintesProntos = true;
  } else {
    montarSubabas();
  }

  try {
    const [statusMeta, statusGoogle] = await Promise.all([
      api("/api/trafego/meta/status"),
      api("/api/trafego/google/status"),
    ]);
    statusMetaOk = Boolean(statusMeta?.configurado);
    statusGoogleOk = Boolean(statusGoogle?.configurado);
  } catch (erro) {
    console.error("Falha ao verificar status do Ads:", erro);
    statusMetaOk = false;
    statusGoogleOk = false;
    mostrarErro(erro.message || "Falha ao verificar configuração.");
  }

  await aplicarVisibilidadeSubaba();
}

export async function atualizar() {
  return iniciar();
}
