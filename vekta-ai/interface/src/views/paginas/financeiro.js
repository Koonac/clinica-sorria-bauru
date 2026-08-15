import {
  $,
  el,
  api,
  CLASSE_PAINEL,
  CLASSE_BOTAO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_VAZIO,
} from "../.core/util.js";
import {
  criarSelect,
  definirOpcoes,
  destruirSelectsEm,
  haSelectAberto,
} from "../componentes/select.js";

// ==========================================================
// Constantes e estado
// ==========================================================

const CLASSE_INPUT =
  "w-full rounded-xl border border-linha bg-fundo px-3 py-2 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta";

const CLASSE_TH =
  "px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-cinza font-medium text-left whitespace-nowrap";

const CLASSE_ICONE_ACAO =
  "inline-flex items-center justify-center w-8 h-8 rounded-full text-cinza transition-colors hover:bg-fundo hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta disabled:opacity-45";

const moedaBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Versão curta para os ticks do gráfico (R$ 12,5 mil). */
const moedaCurta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Rótulos por direção — evita `if (direcao === ...)` espalhado pela tela. */
const DIRECOES = {
  payable: {
    vista: "pagar",
    titulo: "Conta a pagar",
    plural: "contas a pagar",
    parte: "Fornecedor",
    tipoConta: "despesa",
    acaoBaixa: "Pagar",
    icone: "lucide:arrow-up-right",
  },
  receivable: {
    vista: "receber",
    titulo: "Conta a receber",
    plural: "contas a receber",
    parte: "Cliente",
    tipoConta: "receita",
    acaoBaixa: "Receber",
    icone: "lucide:arrow-down-left",
  },
};

const DIRECAO_POR_VISTA = { pagar: "payable", receber: "receivable" };

/**
 * Paleta dos gráficos, validada para a superfície escura dos painéis (#14161c):
 * banda de luminosidade, piso de croma, separação para daltonismo e contraste.
 * `pagar` é um passo mais escuro do laranja da marca — o token --color-alerta
 * (#e8955a) é claro demais para virar preenchimento neste fundo.
 */
const VIZ = {
  receber: "#0e8a76",
  pagar: "#cf7433",
  saldo: "#5b8def",
  neutro: "#8890a1",
  superficie: "#14161c",
  tinta: "#eef0f4",
  cinza: "#8890a1",
  muted: "#565d6d",
  eixo: "#23262f",
  grade: "rgba(255, 255, 255, 0.06)",
};

let iniciado = false;
let vista = "dashboard";
let carregando = false;
let dashboardRenderizado = false;
/** Instâncias do Chart.js por container, para destruir antes de redesenhar. */
const charts = new Map();

/** Shell (filtros + tabela) de cada direção, montado uma vez e reaproveitado. */
const shells = { payable: null, receivable: null };

/** Filtros correntes por direção. */
const filtros = {
  payable: { search: "", status: "", due_from: "", due_to: "", page: 1 },
  receivable: { search: "", status: "", due_from: "", due_to: "", page: 1 },
};

let contasCache = [];
let arvoreCache = [];
const colapsadas = new Set();
let vinculosCrm = null; // { contatos, deals } — carregado sob demanda no modal

// ==========================================================
// Helpers de formatação
// ==========================================================

function setStatus(texto) {
  const alvo = $("#fin-status");
  if (alvo) alvo.textContent = texto || "";
}

function formatarValor(valor) {
  return moedaBRL.format(Number(valor) || 0);
}

/** Datas do backend vêm como YYYY-MM-DD; o meio-dia evita virar o dia por fuso. */
function formatarData(iso) {
  if (!iso) return "—";
  const data = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-BR");
}

function rotuloMes(ym) {
  const data = new Date(`${ym}-01T12:00:00`);
  if (Number.isNaN(data.getTime())) return ym;
  return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function hojeISO() {
  const agora = new Date();
  const off = agora.getTimezoneOffset() * 60000;
  return new Date(agora.getTime() - off).toISOString().slice(0, 10);
}

function textoOuTraco(valor) {
  const texto = String(valor ?? "").trim();
  return texto || "—";
}

function situacaoDe(lancamento) {
  if (lancamento.status === "canceled") return "canceled";
  if (lancamento.status === "paid") return "paid";
  return lancamento.overdue ? "overdue" : "pending";
}

function chipStatus(lancamento) {
  const estilos = {
    paid: ["Pago", "bg-vekta-suave text-vekta"],
    overdue: ["Vencido", "bg-alerta-suave text-alerta"],
    pending: ["Pendente", "border border-linha text-cinza"],
    canceled: ["Cancelado", "border border-linha text-cinza-claro"],
  };
  const [rotulo, classe] = estilos[situacaoDe(lancamento)];
  return el(
    "span",
    {
      class: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${classe}`,
    },
    rotulo,
  );
}

function campoLabel(texto, input) {
  return el(
    "label",
    { class: "flex flex-col gap-1.5 text-sm" },
    el("span", { class: "font-medium text-tinta" }, texto),
    input,
  );
}

/**
 * Atalho para o componente de select, com a classe padrão dos campos da página.
 * `extras` repassa opções do componente (busca, buscarOpcoes, placeholder).
 */
function selectDe(opcoes, valorAtual, atributos = {}, extras = {}) {
  return criarSelect({
    opcoes,
    valor: valorAtual,
    atributos: { class: CLASSE_INPUT, ...atributos },
    ...extras,
  });
}

function pillToggle(ativo) {
  return ativo ? "bg-vekta text-white" : "text-tinta hover:bg-fundo";
}

function tituloPainel(texto, complemento) {
  return el(
    "div",
    { class: "flex items-baseline justify-between gap-3 px-5 pt-4 pb-3" },
    el("h2", { class: "font-display text-base font-semibold tracking-tight" }, texto),
    complemento ? el("p", { class: "text-xs text-cinza" }, complemento) : null,
  );
}

function botaoIcone(icone, titulo, aoClicar, classeExtra = "") {
  return el(
    "button",
    {
      type: "button",
      class: `${CLASSE_ICONE_ACAO} ${classeExtra}`,
      title: titulo,
      "aria-label": titulo,
      onclick: (e) => {
        e.stopPropagation();
        aoClicar(e);
      },
    },
    el("iconify-icon", { noobserver: "", icon: icone, class: "text-[15px]" }),
  );
}

// ==========================================================
// Skeletons
// ==========================================================

function blocoSkeleton(classe) {
  return el("div", { class: `skeleton ${classe}`, "aria-hidden": "true" });
}

function renderSkeletonDashboard() {
  const kpis = $("#fin-kpis");
  if (kpis) {
    kpis.replaceChildren(
      ...Array.from({ length: 5 }, () =>
        el(
          "article",
          { class: `${CLASSE_PAINEL} flex flex-col gap-2 min-w-0` },
          blocoSkeleton("h-3 w-24"),
          blocoSkeleton("h-7 w-28"),
        ),
      ),
    );
  }
  destruirCharts();
  for (const [id, altura] of [
    ["#fin-grafico-fluxo", "h-64"],
    ["#fin-grafico-previsto", "h-56"],
    ["#fin-grafico-situacao", "h-56"],
  ]) {
    $(id)?.replaceChildren(
      el("div", { class: "px-5 pt-4 pb-2" }, blocoSkeleton("h-5 w-52")),
      el("div", { class: "px-5 pb-5" }, blocoSkeleton(`${altura} w-full rounded-xl`)),
    );
  }
  for (const id of ["#fin-proximos", "#fin-por-conta"]) {
    $(id)?.replaceChildren(
      el("div", { class: "px-5 pt-4 pb-2" }, blocoSkeleton("h-5 w-40")),
      el(
        "div",
        { class: "px-5 pb-5 flex flex-col gap-3" },
        ...Array.from({ length: 4 }, () => blocoSkeleton("h-9 w-full")),
      ),
    );
  }
}

function renderSkeletonLinhas(corpo, colunas) {
  corpo.replaceChildren(
    ...Array.from({ length: 6 }, () =>
      el(
        "tr",
        { class: "border-b border-linha/50 last:border-0" },
        ...Array.from({ length: colunas }, () =>
          el("td", { class: "px-4 py-3" }, blocoSkeleton("h-4 w-full")),
        ),
      ),
    ),
  );
}

function renderSkeletonContas() {
  $("#fin-vista-contas")?.replaceChildren(
    el(
      "div",
      { class: "bg-superficie border border-linha rounded-2xl shadow-sm p-5 flex flex-col gap-3" },
      ...Array.from({ length: 7 }, () => blocoSkeleton("h-9 w-full")),
    ),
  );
}

// ==========================================================
// Vista
// ==========================================================

function aplicarVista() {
  for (const nome of ["dashboard", "pagar", "receber", "contas"]) {
    $(`#fin-vista-${nome}`)?.classList.toggle("hidden", vista !== nome);
    const aba = $(`#fin-ver-${nome}`);
    if (aba) {
      aba.className = `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${pillToggle(
        vista === nome,
      )}`;
      aba.setAttribute("aria-selected", String(vista === nome));
    }
  }
  const rotulo = $("#fin-novo-rotulo");
  if (rotulo) rotulo.textContent = vista === "contas" ? "Nova conta" : "Novo lançamento";
}

function trocarVista(nome) {
  if (vista === nome) return;
  vista = nome;
  aplicarVista();
  void carregarVista();
}

function mostrarSkeletonVista() {
  if (vista === "dashboard") renderSkeletonDashboard();
  else if (vista === "contas") renderSkeletonContas();
  else {
    const direcao = DIRECAO_POR_VISTA[vista];
    renderSkeletonLinhas(garantirShell(direcao).corpo, 7);
  }
}

async function carregarVista() {
  if (carregando) return;
  carregando = true;
  try {
    if (vista === "dashboard") await carregarDashboard();
    else if (vista === "contas") await carregarContas();
    else await carregarLancamentos(DIRECAO_POR_VISTA[vista]);
  } finally {
    carregando = false;
  }
}

// ==========================================================
// Dashboard
// ==========================================================

function destruirCharts() {
  for (const chart of charts.values()) chart.destroy();
  charts.clear();
}

/** Tooltip, legenda e eixos são iguais em todos os gráficos — definidos uma vez. */
const TOOLTIP_VIZ = {
  backgroundColor: VIZ.superficie,
  borderColor: VIZ.eixo,
  borderWidth: 1,
  titleColor: VIZ.tinta,
  bodyColor: VIZ.cinza,
  padding: 10,
  displayColors: true,
  boxWidth: 8,
  boxHeight: 8,
  usePointStyle: true,
};

const LEGENDA_VIZ = {
  display: true,
  position: "bottom",
  labels: {
    color: VIZ.cinza,
    boxWidth: 8,
    boxHeight: 8,
    padding: 14,
    usePointStyle: true,
    pointStyle: "circle",
    font: { size: 11 },
  },
};

/** Eixo de valores em R$ — grade em hairline sólido, nunca tracejado. */
function eixoValor(extra = {}) {
  return {
    beginAtZero: true,
    ticks: {
      color: VIZ.muted,
      font: { size: 10 },
      callback: (valor) => moedaCurta.format(valor),
    },
    grid: { color: VIZ.grade, drawTicks: false },
    border: { color: VIZ.eixo },
    ...extra,
  };
}

function eixoCategoria(extra = {}) {
  return {
    ticks: { color: VIZ.muted, font: { size: 10 } },
    grid: { display: false },
    border: { color: VIZ.eixo },
    ...extra,
  };
}

/**
 * Prepara o painel: título + canvas. Devolve o contexto, ou null quando não há
 * dado — nesse caso o painel já fica com o estado vazio explicativo.
 */
function prepararGrafico(seletor, { titulo, apoio, vazio, temDado, altura = "h-56" }) {
  const painel = $(seletor);
  if (!painel) return null;

  charts.get(seletor)?.destroy();
  charts.delete(seletor);
  painel.replaceChildren(tituloPainel(titulo, apoio));

  if (!temDado) {
    painel.append(el("p", { class: `${CLASSE_VAZIO} px-5 pb-5` }, vazio));
    return null;
  }

  const canvas = el("canvas", { "aria-label": titulo });
  painel.append(el("div", { class: `relative ${altura} w-full px-3 pb-4` }, canvas));
  return { canvas, seletor };
}

function registrarChart(alvo, config) {
  const chart = new Chart(alvo.canvas.getContext("2d"), config);
  charts.set(alvo.seletor, chart);
  return chart;
}

function cartaoKpi({ rotulo, valor, apoio, cor }) {
  return el(
    "article",
    { class: `${CLASSE_PAINEL} flex flex-col gap-1 min-w-0` },
    el(
      "p",
      { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
      rotulo,
    ),
    el(
      "p",
      { class: `font-display text-2xl font-semibold tracking-tight ${cor || "text-tinta"}` },
      formatarValor(valor),
    ),
    apoio ? el("p", { class: "text-xs text-cinza" }, apoio) : null,
  );
}

async function carregarDashboard() {
  setStatus("Carregando indicadores…");
  const vistaEl = $("#fin-vista-dashboard");

  // Skeleton só na primeira carga; num refresh o conteúdo antigo fica esmaecido
  // no lugar, sem piscar nem pular o layout.
  if (dashboardRenderizado) vistaEl?.classList.add("opacity-50");
  else renderSkeletonDashboard();

  try {
    const resumo = await api("/api/finance/stats/overview");
    renderizarKpis(resumo.kpis || {});
    renderizarGraficoFluxo(resumo.serie || []);
    renderizarGraficoPrevisto(resumo.previsto || []);
    renderizarGraficoSituacao(resumo.kpis || {});
    renderizarProximos(resumo.proximos || []);
    renderizarPorConta(resumo.por_conta || []);
    dashboardRenderizado = true;
    setStatus("");
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar o dashboard");
    destruirCharts();
    dashboardRenderizado = false;
    $("#fin-kpis")?.replaceChildren(
      el("p", { class: CLASSE_VAZIO }, "Não foi possível carregar os indicadores."),
    );
    for (const id of [
      "#fin-grafico-fluxo",
      "#fin-grafico-previsto",
      "#fin-grafico-situacao",
      "#fin-proximos",
      "#fin-por-conta",
    ]) {
      $(id)?.replaceChildren();
    }
  } finally {
    vistaEl?.classList.remove("opacity-50");
  }
}

function renderizarKpis(kpis) {
  const vencidos = Number(kpis.vencidos_pagar || 0) + Number(kpis.vencidos_receber || 0);
  const saldo = Number(kpis.saldo_mes || 0);

  $("#fin-kpis")?.replaceChildren(
    cartaoKpi({
      rotulo: "A pagar em aberto",
      valor: kpis.a_pagar_aberto,
      apoio: `${formatarValor(kpis.vencidos_pagar)} vencidos`,
    }),
    cartaoKpi({
      rotulo: "A receber em aberto",
      valor: kpis.a_receber_aberto,
      apoio: `${formatarValor(kpis.vencidos_receber)} vencidos`,
    }),
    cartaoKpi({
      rotulo: "Vencidos (total)",
      valor: vencidos,
      cor: vencidos > 0 ? "text-alerta" : "text-tinta",
      apoio: vencidos > 0 ? "Exige atenção" : "Nada vencido",
    }),
    cartaoKpi({
      rotulo: "Recebido no mês",
      valor: kpis.recebido_mes,
      apoio: `${formatarValor(kpis.pago_mes)} pagos`,
    }),
    cartaoKpi({
      rotulo: "Saldo do mês",
      valor: saldo,
      cor: saldo < 0 ? "text-alerta" : "text-vekta",
      apoio: "Recebido − pago",
    }),
  );
}

/**
 * Fluxo de caixa realizado: barras de recebido/pago mais a linha do saldo do mês.
 * As três séries estão em R$, então dividem um único eixo — nada de segundo eixo Y.
 */
function renderizarGraficoFluxo(serie) {
  const temMovimento = serie.some(
    (ponto) => Number(ponto.receber) > 0 || Number(ponto.pagar) > 0,
  );
  const alvo = prepararGrafico("#fin-grafico-fluxo", {
    titulo: "Fluxo de caixa realizado",
    apoio: `Últimos ${serie.length} meses`,
    temDado: temMovimento,
    vazio:
      "Nenhuma baixa registrada no período — o gráfico aparece quando houver pagamentos ou recebimentos.",
    altura: "h-64",
  });
  if (!alvo) return;

  const saldos = serie.map(
    (ponto) => (Number(ponto.receber) || 0) - (Number(ponto.pagar) || 0),
  );

  registrarChart(alvo, {
    type: "bar",
    data: {
      labels: serie.map((ponto) => rotuloMes(ponto.month)),
      datasets: [
        {
          label: "Recebido",
          data: serie.map((ponto) => Number(ponto.receber) || 0),
          backgroundColor: VIZ.receber,
          borderRadius: 4,
          borderSkipped: "bottom",
          maxBarThickness: 26,
        },
        {
          label: "Pago",
          data: serie.map((ponto) => Number(ponto.pagar) || 0),
          backgroundColor: VIZ.pagar,
          borderRadius: 4,
          borderSkipped: "bottom",
          maxBarThickness: 26,
        },
        {
          type: "line",
          label: "Saldo do mês",
          data: saldos,
          borderColor: VIZ.saldo,
          backgroundColor: VIZ.saldo,
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: VIZ.saldo,
          // Anel de 2px na cor da superfície, para o ponto não colar na barra.
          pointBorderColor: VIZ.superficie,
          pointBorderWidth: 2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: LEGENDA_VIZ,
        tooltip: {
          ...TOOLTIP_VIZ,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatarValor(item.raw)}`,
          },
        },
      },
      scales: { x: eixoCategoria(), y: eixoValor() },
    },
  });
}

/** Previsto: olha para frente, agrupado pelo mês de vencimento. */
function renderizarGraficoPrevisto(previsto) {
  const temDado = previsto.some(
    (ponto) => Number(ponto.receber) > 0 || Number(ponto.pagar) > 0,
  );
  const alvo = prepararGrafico("#fin-grafico-previsto", {
    titulo: "Previsto por vencimento",
    apoio: `Próximos ${previsto.length} meses`,
    temDado,
    vazio: "Nenhum lançamento com vencimento nos próximos meses.",
  });
  if (!alvo) return;

  registrarChart(alvo, {
    type: "line",
    data: {
      labels: previsto.map((ponto) => rotuloMes(ponto.month)),
      datasets: [
        {
          label: "A receber",
          data: previsto.map((ponto) => Number(ponto.receber) || 0),
          borderColor: VIZ.receber,
          backgroundColor: "rgba(14, 138, 118, 0.12)",
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: VIZ.receber,
          pointBorderColor: VIZ.superficie,
          pointBorderWidth: 2,
        },
        {
          label: "A pagar",
          data: previsto.map((ponto) => Number(ponto.pagar) || 0),
          borderColor: VIZ.pagar,
          backgroundColor: "rgba(207, 116, 51, 0.12)",
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: VIZ.pagar,
          pointBorderColor: VIZ.superficie,
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: LEGENDA_VIZ,
        tooltip: {
          ...TOOLTIP_VIZ,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatarValor(item.raw)}`,
          },
        },
      },
      scales: { x: eixoCategoria(), y: eixoValor() },
    },
  });
}

/**
 * Situação do que está em aberto: barra empilhada horizontal por direção.
 * O vencido leva a cor de atenção; o que está em dia fica em cinza de contexto
 * (ênfase — o que importa aqui é o vencido).
 */
function renderizarGraficoSituacao(kpis) {
  const emDiaPagar = Math.max(
    0,
    (Number(kpis.a_pagar_aberto) || 0) - (Number(kpis.vencidos_pagar) || 0),
  );
  const emDiaReceber = Math.max(
    0,
    (Number(kpis.a_receber_aberto) || 0) - (Number(kpis.vencidos_receber) || 0),
  );
  const total =
    emDiaPagar +
    emDiaReceber +
    (Number(kpis.vencidos_pagar) || 0) +
    (Number(kpis.vencidos_receber) || 0);

  const alvo = prepararGrafico("#fin-grafico-situacao", {
    titulo: "Situação do que está em aberto",
    apoio: "Em dia x vencido",
    temDado: total > 0,
    vazio: "Nada em aberto — todos os lançamentos estão baixados.",
  });
  if (!alvo) return;

  registrarChart(alvo, {
    type: "bar",
    data: {
      labels: ["A pagar", "A receber"],
      datasets: [
        {
          label: "Em dia",
          data: [emDiaPagar, emDiaReceber],
          backgroundColor: VIZ.neutro,
          // Borda na cor da superfície = respiro de 2px entre os segmentos.
          borderColor: VIZ.superficie,
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 34,
        },
        {
          label: "Vencido",
          data: [Number(kpis.vencidos_pagar) || 0, Number(kpis.vencidos_receber) || 0],
          backgroundColor: VIZ.pagar,
          borderColor: VIZ.superficie,
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: LEGENDA_VIZ,
        tooltip: {
          ...TOOLTIP_VIZ,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatarValor(item.raw)}`,
          },
        },
      },
      scales: {
        x: { stacked: true, ...eixoValor() },
        y: { stacked: true, ...eixoCategoria() },
      },
    },
  });
}

function renderizarProximos(lancamentos) {
  const painel = $("#fin-proximos");
  if (!painel) return;
  painel.replaceChildren(tituloPainel("Próximos vencimentos", "7 dias"));

  if (lancamentos.length === 0) {
    painel.append(
      el("p", { class: `${CLASSE_VAZIO} px-5 pb-5` }, "Nada vencendo nos próximos 7 dias."),
    );
    return;
  }

  painel.append(
    el(
      "ul",
      { class: "px-5 pb-4 flex flex-col" },
      ...lancamentos.map((lancamento) => {
        const meta = DIRECOES[lancamento.direction];
        return el(
          "li",
          {
            class:
              "flex items-center gap-3 py-2.5 border-b border-linha/50 last:border-0 min-w-0",
          },
          el("iconify-icon", {
            noobserver: "",
            icon: meta.icone,
            class: `text-base shrink-0 ${
              lancamento.direction === "payable" ? "text-alerta" : "text-vekta"
            }`,
            "aria-hidden": "true",
          }),
          el(
            "div",
            { class: "min-w-0 flex-1" },
            el(
              "p",
              { class: "text-sm text-tinta font-medium truncate" },
              lancamento.description,
            ),
            el(
              "p",
              { class: "text-xs text-cinza" },
              `${formatarData(lancamento.due_date)} · ${textoOuTraco(
                lancamento.contact?.name || lancamento.party_name,
              )}`,
            ),
          ),
          el(
            "span",
            { class: "text-sm font-medium text-tinta whitespace-nowrap" },
            formatarValor(lancamento.amount),
          ),
          chipStatus(lancamento),
        );
      }),
    ),
  );
}

function renderizarPorConta(linhas) {
  const painel = $("#fin-por-conta");
  if (!painel) return;
  painel.replaceChildren(tituloPainel("Realizado por conta", "Maiores primeiro"));

  if (linhas.length === 0) {
    painel.append(
      el(
        "p",
        { class: `${CLASSE_VAZIO} px-5 pb-5` },
        "Sem baixas vinculadas a contas do plano de contas ainda.",
      ),
    );
    return;
  }

  const maior = Math.max(...linhas.map((linha) => Number(linha.total) || 0), 1);

  painel.append(
    el(
      "ul",
      { class: "px-5 pb-4 flex flex-col" },
      ...linhas.map((linha) => {
        const total = Number(linha.total) || 0;
        const receita = linha.type === "receita";
        return el(
          "li",
          { class: "py-2.5 border-b border-linha/50 last:border-0" },
          el(
            "div",
            { class: "flex items-center gap-3 mb-1.5 min-w-0" },
            el(
              "span",
              { class: "font-mono text-[11px] text-cinza shrink-0" },
              linha.code,
            ),
            el("span", { class: "text-sm text-tinta truncate flex-1" }, linha.name),
            el(
              "span",
              { class: "text-sm font-medium text-tinta whitespace-nowrap" },
              formatarValor(total),
            ),
          ),
          el(
            "div",
            { class: "h-1.5 rounded-full bg-fundo overflow-hidden" },
            el("div", {
              class: `h-full rounded-full ${receita ? "bg-vekta" : "bg-alerta"}`,
              style: `width: ${Math.max(2, (total / maior) * 100)}%`,
            }),
          ),
        );
      }),
    ),
  );
}

// ==========================================================
// Lançamentos (a pagar / a receber)
// ==========================================================

/** Monta uma vez a barra de filtros + tabela de uma direção e guarda as referências. */
function garantirShell(direcao) {
  if (shells[direcao]) return shells[direcao];

  const meta = DIRECOES[direcao];
  const estado = filtros[direcao];

  const busca = el("input", {
    type: "search",
    class: `${CLASSE_INPUT} pl-9`,
    placeholder: "Buscar descrição, contato ou documento…",
    "aria-label": `Buscar em ${meta.plural}`,
  });
  let timerBusca = null;
  busca.addEventListener("input", () => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      estado.search = busca.value.trim();
      estado.page = 1;
      void carregarLancamentos(direcao);
    }, 300);
  });

  const status = selectDe(
    [
      { value: "", label: "Todos os status" },
      { value: "pending", label: "Pendentes" },
      { value: "overdue", label: "Vencidos" },
      { value: "paid", label: meta.acaoBaixa === "Pagar" ? "Pagos" : "Recebidos" },
      { value: "canceled", label: "Cancelados" },
    ],
    estado.status,
    { "aria-label": "Filtrar por status" },
  );
  status.addEventListener("change", () => {
    estado.status = status.value;
    estado.page = 1;
    void carregarLancamentos(direcao);
  });

  // Largura vem do wrapper na linha de filtros: `w-auto` não vence o `w-full`
  // do CLASSE_INPUT (no Tailwind quem decide é a ordem no CSS gerado, não a da string).
  const de = el("input", {
    type: "date",
    class: CLASSE_INPUT,
    "aria-label": "Vencimento a partir de",
  });
  const ate = el("input", {
    type: "date",
    class: CLASSE_INPUT,
    "aria-label": "Vencimento até",
  });
  for (const campo of [de, ate]) {
    campo.addEventListener("change", () => {
      estado.due_from = de.value;
      estado.due_to = ate.value;
      estado.page = 1;
      void carregarLancamentos(direcao);
    });
  }

  const limpar = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: () => {
        busca.value = "";
        status.value = "";
        de.value = "";
        ate.value = "";
        Object.assign(estado, { search: "", status: "", due_from: "", due_to: "", page: 1 });
        void carregarLancamentos(direcao);
      },
    },
    "Limpar",
  );

  const corpo = el("tbody");
  const rodape = el("div", {
    class: "flex items-center justify-between gap-3 px-4 py-3 border-t border-linha",
  });

  const raiz = el(
    "div",
    { class: "flex flex-col gap-3.5" },
    el(
      "div",
      { class: "flex flex-wrap items-center gap-2" },
      el(
        "label",
        { class: "relative flex-1 min-w-[240px]" },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:search",
          class:
            "absolute left-3 top-1/2 -translate-y-1/2 text-cinza text-[15px] pointer-events-none",
          "aria-hidden": "true",
        }),
        busca,
      ),
      // Cada controle ganha um wrapper com largura fixa; o campo preenche 100% dele
      // (o gatilho do Slim Select também ocupa 100% do pai).
      el("div", { class: "w-44 shrink-0" }, status),
      el("div", { class: "w-40 shrink-0" }, de),
      el("span", { class: "text-sm text-cinza shrink-0" }, "até"),
      el("div", { class: "w-40 shrink-0" }, ate),
      limpar,
    ),
    el(
      "div",
      { class: "bg-superficie border border-linha rounded-2xl shadow-sm overflow-hidden" },
      el(
        "div",
        { class: "overflow-x-auto" },
        el(
          "table",
          { class: "w-full" },
          el(
            "thead",
            {},
            el(
              "tr",
              { class: "border-b border-linha" },
              el("th", { class: CLASSE_TH }, "Vencimento"),
              el("th", { class: CLASSE_TH }, "Descrição"),
              el("th", { class: CLASSE_TH }, meta.parte),
              el("th", { class: CLASSE_TH }, "Conta"),
              el("th", { class: `${CLASSE_TH} text-right` }, "Valor"),
              el("th", { class: CLASSE_TH }, "Status"),
              el("th", { class: `${CLASSE_TH} text-right` }, "Ações"),
            ),
          ),
          corpo,
        ),
      ),
      rodape,
    ),
  );

  $(`#fin-vista-${meta.vista}`)?.replaceChildren(raiz);
  shells[direcao] = { raiz, corpo, rodape, campos: { busca, status, de, ate } };
  return shells[direcao];
}

async function carregarLancamentos(direcao) {
  const meta = DIRECOES[direcao];
  const estado = filtros[direcao];
  const shell = garantirShell(direcao);

  setStatus(`Carregando ${meta.plural}…`);
  renderSkeletonLinhas(shell.corpo, 7);

  const parametros = new URLSearchParams({ direction: direcao, page: String(estado.page) });
  // "Vencido" é derivado no backend: vira o filtro `overdue`, não um status.
  if (estado.status === "overdue") parametros.set("overdue", "1");
  else if (estado.status) parametros.set("status", estado.status);
  for (const chave of ["search", "due_from", "due_to"]) {
    if (estado[chave]) parametros.set(chave, estado[chave]);
  }

  try {
    const resposta = await api(`/api/finance/entries?${parametros}`);
    renderizarLinhas(direcao, resposta.data || []);
    renderizarRodape(direcao, resposta);
    const total = Number(resposta.total ?? (resposta.data || []).length);
    setStatus(total === 1 ? `1 lançamento` : `${total} lançamentos`);
  } catch (erro) {
    setStatus(erro.message || `Falha ao carregar ${meta.plural}`);
    shell.corpo.replaceChildren(
      el(
        "tr",
        {},
        el(
          "td",
          { colspan: "7", class: `${CLASSE_VAZIO} px-4 py-6 text-center` },
          "Não foi possível carregar os lançamentos.",
        ),
      ),
    );
    shell.rodape.replaceChildren();
  }
}

function renderizarLinhas(direcao, lancamentos) {
  const meta = DIRECOES[direcao];
  const { corpo } = garantirShell(direcao);

  if (lancamentos.length === 0) {
    corpo.replaceChildren(
      el(
        "tr",
        {},
        el(
          "td",
          { colspan: "7", class: `${CLASSE_VAZIO} px-4 py-8 text-center` },
          `Nenhuma conta a ${direcao === "payable" ? "pagar" : "receber"} com esses filtros.`,
        ),
      ),
    );
    return;
  }

  corpo.replaceChildren(
    ...lancamentos.map((lancamento) => {
      const pago = lancamento.status === "paid";
      const parcela =
        lancamento.installment_total > 1
          ? el(
              "span",
              {
                class:
                  "ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md bg-fundo border border-linha font-mono text-[10px] text-cinza align-middle",
              },
              `${lancamento.installment_number}/${lancamento.installment_total}`,
            )
          : null;

      return el(
        "tr",
        {
          class:
            "group border-b border-linha/50 last:border-0 cursor-pointer transition-colors hover:bg-vekta-suave",
          onclick: () => abrirModalLancamento({ lancamento }),
        },
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta whitespace-nowrap" },
          formatarData(lancamento.due_date),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta font-medium min-w-[200px]" },
          lancamento.description,
          parcela,
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-cinza whitespace-nowrap" },
          textoOuTraco(lancamento.contact?.name || lancamento.party_name),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-cinza whitespace-nowrap" },
          lancamento.account
            ? `${lancamento.account.code} · ${lancamento.account.name}`
            : "—",
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta font-medium text-right whitespace-nowrap" },
          formatarValor(lancamento.amount),
        ),
        el("td", { class: "px-4 py-3" }, chipStatus(lancamento)),
        el(
          "td",
          { class: "px-4 py-3" },
          el(
            "div",
            { class: "flex items-center justify-end gap-1" },
            pago
              ? botaoIcone("lucide:undo-2", "Estornar baixa", () =>
                  estornar(direcao, lancamento),
                )
              : botaoIcone(
                  "lucide:circle-check",
                  `${meta.acaoBaixa} — dar baixa`,
                  () => abrirModalBaixa(direcao, lancamento),
                  "hover:text-vekta",
                ),
            botaoIcone("lucide:trash-2", "Excluir", () => excluir(direcao, lancamento), "hover:text-alerta"),
          ),
        ),
      );
    }),
  );
}

function renderizarRodape(direcao, resposta) {
  const { rodape } = garantirShell(direcao);
  const estado = filtros[direcao];
  const pagina = Number(resposta.current_page || 1);
  const ultima = Number(resposta.last_page || 1);
  const total = Number(resposta.total || 0);

  const irPara = (destino) => {
    estado.page = destino;
    void carregarLancamentos(direcao);
  };

  rodape.replaceChildren(
    el(
      "p",
      { class: "text-xs text-cinza" },
      total === 0 ? "Nenhum lançamento" : `Página ${pagina} de ${ultima} · ${total} no total`,
    ),
    el(
      "div",
      { class: "flex items-center gap-2" },
      Object.assign(
        el(
          "button",
          {
            type: "button",
            class: CLASSE_BOTAO,
            onclick: () => irPara(pagina - 1),
          },
          "Anterior",
        ),
        { disabled: pagina <= 1 },
      ),
      Object.assign(
        el(
          "button",
          {
            type: "button",
            class: CLASSE_BOTAO,
            onclick: () => irPara(pagina + 1),
          },
          "Próxima",
        ),
        { disabled: pagina >= ultima },
      ),
    ),
  );
}

async function estornar(direcao, lancamento) {
  setStatus("Estornando baixa…");
  try {
    await api(`/api/finance/entries/${lancamento.id}/settle`, { method: "DELETE" });
    await carregarLancamentos(direcao);
  } catch (erro) {
    setStatus(erro.message || "Falha ao estornar a baixa");
  }
}

async function excluir(direcao, lancamento) {
  const parcelado = lancamento.installment_total > 1;
  const aviso = parcelado
    ? `Excluir a parcela ${lancamento.installment_number}/${lancamento.installment_total} de "${lancamento.description}"? As outras parcelas continuam.`
    : `Excluir o lançamento "${lancamento.description}"?`;
  if (!window.confirm(aviso)) return;

  setStatus("Excluindo…");
  try {
    await api(`/api/finance/entries/${lancamento.id}`, { method: "DELETE" });
    await carregarLancamentos(direcao);
  } catch (erro) {
    setStatus(erro.message || "Falha ao excluir o lançamento");
  }
}

// ==========================================================
// Plano de contas
// ==========================================================

async function carregarContas() {
  setStatus("Carregando plano de contas…");
  renderSkeletonContas();
  try {
    const [arvore, planas] = await Promise.all([
      api("/api/finance/accounts?tree=1"),
      api("/api/finance/accounts"),
    ]);
    contasCache = planas.data || [];
    arvoreCache = arvore.data || [];
    renderizarArvoreContas(arvoreCache);
    setStatus(
      contasCache.length === 1 ? "1 conta" : `${contasCache.length} contas`,
    );
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar o plano de contas");
    $("#fin-vista-contas")?.replaceChildren(
      el("p", { class: CLASSE_VAZIO }, "Não foi possível carregar o plano de contas."),
    );
  }
}

function renderizarArvoreContas(raizes) {
  const alvo = $("#fin-vista-contas");
  if (!alvo) return;

  if (raizes.length === 0) {
    alvo.replaceChildren(
      el(
        "div",
        { class: "bg-superficie border border-linha rounded-2xl shadow-sm text-center py-14 px-6" },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:list-tree",
          class: "text-4xl text-vekta mb-3",
          "aria-hidden": "true",
        }),
        el(
          "h2",
          { class: "font-display text-xl text-tinta mb-2" },
          "Plano de contas vazio",
        ),
        el(
          "p",
          { class: "text-sm text-cinza mb-4" },
          "Crie a primeira conta ou rode o seeder: php artisan db:seed --class=FinanceSeeder",
        ),
        el(
          "button",
          { type: "button", class: CLASSE_BOTAO_PRIMARIO, onclick: () => abrirModalConta({}) },
          "Nova conta",
        ),
      ),
    );
    return;
  }

  const lista = el("div", { class: "flex flex-col" });
  for (const raiz of raizes) lista.append(...linhasConta(raiz, 0));

  alvo.replaceChildren(
    el(
      "div",
      { class: "bg-superficie border border-linha rounded-2xl shadow-sm overflow-hidden" },
      lista,
    ),
  );
}

function linhasConta(conta, nivel) {
  const filhos = conta.children || [];
  const temFilhos = filhos.length > 0;
  const recolhida = colapsadas.has(conta.id);
  const receita = conta.type === "receita";

  const alternador = temFilhos
    ? el(
        "button",
        {
          type: "button",
          class:
            "inline-flex items-center justify-center w-6 h-6 rounded-md text-cinza hover:text-tinta hover:bg-fundo shrink-0",
          "aria-label": recolhida ? "Expandir" : "Recolher",
          "aria-expanded": String(!recolhida),
          onclick: (e) => {
            e.stopPropagation();
            if (recolhida) colapsadas.delete(conta.id);
            else colapsadas.add(conta.id);
            renderizarArvoreContas(arvoreCache); // só redesenha: a árvore já está em memória
          },
        },
        el("iconify-icon", {
          noobserver: "",
          icon: recolhida ? "lucide:chevron-right" : "lucide:chevron-down",
          class: "text-[15px]",
        }),
      )
    : el("span", { class: "w-6 shrink-0", "aria-hidden": "true" });

  const linha = el(
    "div",
    {
      class:
        "flex items-center gap-3 px-4 py-2.5 border-b border-linha/50 last:border-0 transition-colors hover:bg-vekta-suave min-w-0",
      style: `padding-left: ${1 + nivel * 1.5}rem`,
    },
    alternador,
    el("span", { class: "font-mono text-[11px] text-cinza shrink-0 w-14" }, conta.code),
    el(
      "span",
      {
        class: `text-sm truncate flex-1 ${
          conta.active ? "text-tinta" : "text-cinza-claro line-through"
        } ${nivel === 0 ? "font-medium" : ""}`,
      },
      conta.name,
    ),
    el(
      "span",
      {
        class: `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
          receita ? "bg-vekta-suave text-vekta" : "bg-alerta-suave text-alerta"
        }`,
      },
      receita ? "Receita" : "Despesa",
    ),
    el(
      "div",
      { class: "flex items-center gap-1 shrink-0" },
      botaoIcone("lucide:plus", "Nova subconta", () =>
        abrirModalConta({ pai: conta }),
      ),
      botaoIcone("lucide:pencil", "Editar conta", () => abrirModalConta({ conta })),
      botaoIcone("lucide:trash-2", "Excluir conta", () => excluirConta(conta), "hover:text-alerta"),
    ),
  );

  const linhas = [linha];
  if (temFilhos && !recolhida) {
    for (const filho of filhos) linhas.push(...linhasConta(filho, nivel + 1));
  }
  return linhas;
}

async function excluirConta(conta) {
  if (!window.confirm(`Excluir a conta "${conta.code} — ${conta.name}"?`)) return;
  setStatus("Excluindo conta…");
  try {
    await api(`/api/finance/accounts/${conta.id}`, { method: "DELETE" });
    await carregarContas();
  } catch (erro) {
    // O backend recusa (422) contas com subcontas ou lançamentos — a mensagem já explica.
    setStatus(erro.message || "Falha ao excluir a conta");
  }
}

/** Opções de select do plano de contas, com o código como prefixo. */
async function opcoesContas(tipo) {
  if (contasCache.length === 0) {
    const resposta = await api("/api/finance/accounts");
    contasCache = resposta.data || [];
  }
  return contasCache
    .filter((conta) => (tipo ? conta.type === tipo : true))
    .filter((conta) => conta.active !== false)
    .map((conta) => ({ value: conta.id, label: `${conta.code} — ${conta.name}` }));
}

// ==========================================================
// Modal base
// ==========================================================

function fecharModal() {
  const modal = $("#fin-modal");
  // O dropdown do select vive no body: precisa ser desmontado antes de remover o modal.
  destruirSelectsEm(modal);
  modal?.remove();
  document.removeEventListener("keydown", onEscModal, true);
}

function onEscModal(e) {
  if (e.key !== "Escape") return;
  // Dropdown aberto consome o Esc: fecha só ele, não o modal por baixo.
  if (haSelectAberto()) return;
  fecharModal();
}

function abrirModal({ eyebrow, titulo, subtitulo, conteudo }) {
  fecharModal();
  const painel = el(
    "div",
    {
      class:
        "bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6",
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
          { class: "font-mono text-[11px] uppercase tracking-wider text-cinza mb-1" },
          eyebrow,
        ),
        el(
          "h2",
          {
            id: "fin-modal-titulo",
            class: "font-display text-xl font-semibold tracking-tight",
          },
          titulo,
        ),
        subtitulo ? el("p", { class: "text-xs text-cinza mt-1.5" }, subtitulo) : null,
      ),
      el(
        "button",
        {
          type: "button",
          class:
            "inline-flex items-center justify-center w-8 h-8 rounded-full text-cinza hover:bg-fundo hover:text-tinta",
          "aria-label": "Fechar",
          onclick: fecharModal,
        },
        el("iconify-icon", { noobserver: "", icon: "lucide:x", class: "text-lg" }),
      ),
    ),
    conteudo,
  );

  document.body.append(
    el(
      "div",
      {
        id: "fin-modal",
        class:
          "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "fin-modal-titulo",
        onclick: fecharModal,
      },
      painel,
    ),
  );
  document.addEventListener("keydown", onEscModal, true);
}

/** Rodapé padrão dos formulários: parágrafo de erro + Cancelar/Salvar. */
function rodapeFormulario(erroEl, botaoSalvar) {
  return [
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-1" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      botaoSalvar,
    ),
  ];
}

// ==========================================================
// Formulários
// ==========================================================

/**
 * Busca contatos no CRM (a API pagina em 50, então filtrar só o que já foi
 * carregado esconderia o resto da base).
 */
async function buscarContatosCrm(termo) {
  try {
    const caminho = termo
      ? `/api/crm/contacts?search=${encodeURIComponent(termo)}`
      : "/api/crm/contacts";
    const resposta = await api(caminho);
    return (resposta.data || []).map((contato) => ({
      value: contato.id,
      label: contato.name,
    }));
  } catch {
    return [];
  }
}

/** Idem para negócios. */
async function buscarNegociosCrm(termo) {
  try {
    const caminho = termo
      ? `/api/crm/deals?search=${encodeURIComponent(termo)}`
      : "/api/crm/deals";
    const resposta = await api(caminho);
    return (resposta.data || []).map((deal) => ({
      value: deal.id,
      label: deal.title,
    }));
  } catch {
    return [];
  }
}

/**
 * Garante que o vínculo já salvo apareça na lista. A API pagina em 50, então ao
 * editar um lançamento antigo o contato/negócio pode estar fora da primeira
 * página — sem isso o campo abriria vazio e salvar apagaria o vínculo.
 */
function comVinculoAtual(opcoes, idAtual, rotuloAtual) {
  if (!idAtual) return opcoes;
  if (opcoes.some((opcao) => String(opcao.value) === String(idAtual))) return opcoes;
  return [{ value: idAtual, label: rotuloAtual || `#${idAtual}` }, ...opcoes];
}

/** Contatos e negócios do CRM para vincular ao lançamento (opcional). */
async function carregarVinculosCrm() {
  if (vinculosCrm) return vinculosCrm;
  try {
    const [contatos, deals] = await Promise.all([
      api("/api/crm/contacts"),
      api("/api/crm/deals"),
    ]);
    vinculosCrm = { contatos: contatos.data || [], deals: deals.data || [] };
  } catch {
    // CRM desligado ou indisponível: o lançamento segue só com o nome livre.
    vinculosCrm = { contatos: [], deals: [] };
  }
  return vinculosCrm;
}

async function abrirModalLancamento({ lancamento = null, direcao = "payable" } = {}) {
  const edicao = Boolean(lancamento);
  let direcaoAtual = edicao ? lancamento.direction : direcao;
  const meta = DIRECOES[direcaoAtual];

  let contas = [];
  let crm = { contatos: [], deals: [] };
  try {
    [contas, crm] = await Promise.all([
      opcoesContas(meta.tipoConta),
      carregarVinculosCrm(),
    ]);
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar o plano de contas");
    return;
  }

  const inputs = {
    description: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      required: "required",
      placeholder: "Ex.: Aluguel do escritório",
      value: lancamento?.description || "",
    }),
    amount: el("input", {
      type: "number",
      step: "0.01",
      min: "0.01",
      class: CLASSE_INPUT,
      required: "required",
      value: lancamento ? String(Number(lancamento.amount)) : "",
    }),
    due_date: el("input", {
      type: "date",
      class: CLASSE_INPUT,
      required: "required",
      value: lancamento?.due_date?.slice(0, 10) || hojeISO(),
    }),
    account_id: selectDe(
      [{ value: "", label: "Sem conta" }, ...contas],
      lancamento?.account_id ?? "",
      {},
      // Plano de contas cresce: busca sempre visível, mesmo com poucas contas hoje.
      { busca: true },
    ),
    party_name: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      placeholder: `Nome do ${meta.parte.toLowerCase()}`,
      value: lancamento?.party_name || "",
    }),
    contact_id: selectDe(
      [
        { value: "", label: "Sem contato" },
        ...comVinculoAtual(
          crm.contatos.map((c) => ({ value: c.id, label: c.name })),
          lancamento?.contact_id,
          lancamento?.contact?.name,
        ),
      ],
      lancamento?.contact_id ?? "",
      {},
      { buscarOpcoes: buscarContatosCrm },
    ),
    deal_id: selectDe(
      [
        { value: "", label: "Sem negócio" },
        ...comVinculoAtual(
          crm.deals.map((d) => ({ value: d.id, label: d.title })),
          lancamento?.deal_id,
          lancamento?.deal?.title,
        ),
      ],
      lancamento?.deal_id ?? "",
      {},
      { buscarOpcoes: buscarNegociosCrm },
    ),
    document: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      placeholder: "NF, boleto…",
      value: lancamento?.document || "",
    }),
    installments: el("input", {
      type: "number",
      min: "1",
      max: "60",
      step: "1",
      class: CLASSE_INPUT,
      value: "1",
    }),
    notes: el("textarea", { class: `${CLASSE_INPUT} min-h-[72px]`, rows: "3" }),
  };
  inputs.notes.value = lancamento?.notes || "";

  // Rótulo da parte muda com a direção, então precisa de referência própria.
  const rotuloParte = el("span", { class: "font-medium text-tinta" }, meta.parte);
  const campoParte = el(
    "label",
    { class: "flex flex-col gap-1.5 text-sm" },
    rotuloParte,
    inputs.party_name,
  );

  // Seletor de direção: só na criação (a direção é imutável depois).
  const chavesDirecao = Object.keys(DIRECOES);
  const classePill = (ativo) =>
    `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${pillToggle(ativo)}`;

  const botoesDirecao = chavesDirecao.map((chave) =>
    el(
      "button",
      {
        type: "button",
        class: classePill(chave === direcaoAtual),
        onclick: () => void trocarDirecao(chave),
      },
      DIRECOES[chave].titulo,
    ),
  );

  /** Troca a direção no lugar, sem descartar o que já foi digitado. */
  async function trocarDirecao(chave) {
    if (chave === direcaoAtual) return;
    direcaoAtual = chave;
    const info = DIRECOES[chave];

    rotuloParte.textContent = info.parte;
    inputs.party_name.placeholder = `Nome do ${info.parte.toLowerCase()}`;
    botoesDirecao.forEach((botao, i) => {
      botao.className = classePill(chavesDirecao[i] === chave);
    });

    // O plano de contas é filtrado por tipo, então o select tem que ser refeito.
    const selecionado = inputs.account_id.value;
    const novas = await opcoesContas(info.tipoConta);
    definirOpcoes(
      inputs.account_id,
      [{ value: "", label: "Sem conta" }, ...novas],
      selecionado,
    );
  }

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    edicao ? "Salvar" : "Criar lançamento",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        try {
          const payload = {
            description: inputs.description.value.trim(),
            amount: Number(inputs.amount.value),
            due_date: inputs.due_date.value,
            account_id: inputs.account_id.value ? Number(inputs.account_id.value) : null,
            contact_id: inputs.contact_id.value ? Number(inputs.contact_id.value) : null,
            deal_id: inputs.deal_id.value ? Number(inputs.deal_id.value) : null,
            party_name: inputs.party_name.value.trim() || null,
            document: inputs.document.value.trim() || null,
            notes: inputs.notes.value.trim() || null,
          };
          if (!payload.description) throw new Error("Informe a descrição.");
          if (!(payload.amount > 0)) throw new Error("Informe um valor maior que zero.");
          if (!payload.due_date) throw new Error("Informe o vencimento.");

          if (edicao) {
            await api(`/api/finance/entries/${lancamento.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } else {
            const parcelas = Math.max(1, Number(inputs.installments.value) || 1);
            await api("/api/finance/entries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...payload,
                direction: direcaoAtual,
                installments: parcelas,
              }),
            });
          }

          fecharModal();
          vista = DIRECOES[direcaoAtual].vista;
          aplicarVista();
          await carregarLancamentos(direcaoAtual);
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar o lançamento";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    edicao
      ? null
      : el(
          "div",
          { class: "inline-flex items-center rounded-full border border-linha bg-fundo p-1 self-start" },
          ...botoesDirecao,
        ),
    campoLabel("Descrição", inputs.description),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("Valor (R$)", inputs.amount),
      campoLabel("Vencimento", inputs.due_date),
    ),
    campoLabel("Conta do plano de contas", inputs.account_id),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoParte,
      campoLabel("Contato do CRM", inputs.contact_id),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("Negócio do CRM", inputs.deal_id),
      campoLabel("Documento", inputs.document),
    ),
    edicao
      ? null
      : el(
          "div",
          { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
          campoLabel("Nº de parcelas", inputs.installments),
          el(
            "p",
            { class: "text-xs text-cinza self-end pb-2.5" },
            "Acima de 1, gera parcelas mensais a partir do vencimento.",
          ),
        ),
    campoLabel("Observações", inputs.notes),
    ...rodapeFormulario(erroEl, btnSalvar),
  );

  abrirModal({
    eyebrow: "Financeiro",
    titulo: edicao ? "Editar lançamento" : `Novo lançamento`,
    subtitulo: edicao
      ? `${DIRECOES[lancamento.direction].titulo}${
          lancamento.installment_total > 1
            ? ` · parcela ${lancamento.installment_number}/${lancamento.installment_total}`
            : ""
        }`
      : null,
    conteudo: form,
  });
  inputs.description.focus();
}

function abrirModalBaixa(direcao, lancamento) {
  const meta = DIRECOES[direcao];

  const inputs = {
    paid_at: el("input", {
      type: "date",
      class: CLASSE_INPUT,
      required: "required",
      value: hojeISO(),
    }),
    payment_method: selectDe(
      [
        { value: "", label: "Não informar" },
        { value: "pix", label: "Pix" },
        { value: "boleto", label: "Boleto" },
        { value: "cartao", label: "Cartão" },
        { value: "transferencia", label: "Transferência" },
        { value: "dinheiro", label: "Dinheiro" },
      ],
      lancamento.payment_method || "",
    ),
  };

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    `Confirmar ${meta.acaoBaixa.toLowerCase()}`,
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        try {
          await api(`/api/finance/entries/${lancamento.id}/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paid_at: `${inputs.paid_at.value}T12:00:00`,
              payment_method: inputs.payment_method.value || null,
            }),
          });
          fecharModal();
          await carregarLancamentos(direcao);
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao dar baixa";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    el(
      "div",
      { class: `${CLASSE_PAINEL} flex items-baseline justify-between gap-3` },
      el("span", { class: "text-sm text-cinza" }, "Valor"),
      el(
        "span",
        { class: "font-display text-xl font-semibold text-tinta" },
        formatarValor(lancamento.amount),
      ),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel(`Data d${direcao === "payable" ? "o pagamento" : "o recebimento"}`, inputs.paid_at),
      campoLabel("Forma de pagamento", inputs.payment_method),
    ),
    ...rodapeFormulario(erroEl, btnSalvar),
  );

  abrirModal({
    eyebrow: "Financeiro",
    titulo: `${meta.acaoBaixa} lançamento`,
    subtitulo: `${lancamento.description} · vence ${formatarData(lancamento.due_date)}`,
    conteudo: form,
  });
  inputs.paid_at.focus();
}

async function abrirModalConta({ conta = null, pai = null } = {}) {
  const edicao = Boolean(conta);
  try {
    if (contasCache.length === 0) await opcoesContas();
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar o plano de contas");
    return;
  }

  const tipoPadrao = conta?.type || pai?.type || "despesa";

  const opcoesPai = [
    { value: "", label: "Sem conta pai (raiz)" },
    ...contasCache
      .filter((c) => !edicao || c.id !== conta.id)
      .map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
  ];

  const inputs = {
    code: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      required: "required",
      placeholder: "Ex.: 2.2.1",
      value: conta?.code || "",
    }),
    name: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      required: "required",
      placeholder: "Ex.: Anúncios",
      value: conta?.name || "",
    }),
    type: selectDe(
      [
        { value: "despesa", label: "Despesa" },
        { value: "receita", label: "Receita" },
      ],
      tipoPadrao,
    ),
    parent_id: selectDe(opcoesPai, conta?.parent_id ?? pai?.id ?? "", {}, { busca: true }),
    active: selectDe(
      [
        { value: "1", label: "Ativa" },
        { value: "0", label: "Inativa" },
      ],
      conta ? (conta.active ? "1" : "0") : "1",
    ),
  };

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    edicao ? "Salvar" : "Criar conta",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        try {
          const payload = {
            code: inputs.code.value.trim(),
            name: inputs.name.value.trim(),
            type: inputs.type.value,
            parent_id: inputs.parent_id.value ? Number(inputs.parent_id.value) : null,
            active: inputs.active.value === "1",
          };
          if (!payload.code) throw new Error("Informe o código.");
          if (!payload.name) throw new Error("Informe o nome.");

          await api(
            edicao ? `/api/finance/accounts/${conta.id}` : "/api/finance/accounts",
            {
              method: edicao ? "PATCH" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

          fecharModal();
          contasCache = [];
          vista = "contas";
          aplicarVista();
          await carregarContas();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar a conta";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-3 gap-3" },
      campoLabel("Código", inputs.code),
      el("div", { class: "sm:col-span-2" }, campoLabel("Nome", inputs.name)),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("Tipo", inputs.type),
      campoLabel("Situação", inputs.active),
    ),
    campoLabel("Conta pai", inputs.parent_id),
    ...rodapeFormulario(erroEl, btnSalvar),
  );

  abrirModal({
    eyebrow: "Plano de contas",
    titulo: edicao ? "Editar conta" : "Nova conta",
    subtitulo: pai ? `Subconta de ${pai.code} — ${pai.name}` : null,
    conteudo: form,
  });
  inputs.code.focus();
}

// ==========================================================
// Bootstrap
// ==========================================================

function mostrarSetup(mostrar) {
  $("#fin-setup")?.classList.toggle("hidden", !mostrar);
  $("#fin-painel")?.classList.toggle("hidden", mostrar);
  $("#fin-acoes")?.classList.toggle("hidden", mostrar);
}

function ligarControles() {
  $("#fin-ver-dashboard")?.addEventListener("click", () => trocarVista("dashboard"));
  $("#fin-ver-pagar")?.addEventListener("click", () => trocarVista("pagar"));
  $("#fin-ver-receber")?.addEventListener("click", () => trocarVista("receber"));
  $("#fin-ver-contas")?.addEventListener("click", () => trocarVista("contas"));
  $("#fin-atualizar")?.addEventListener("click", () => {
    contasCache = [];
    vinculosCrm = null;
    void carregarVista();
  });
  $("#fin-novo")?.addEventListener("click", () => {
    if (vista === "contas") void abrirModalConta({});
    else void abrirModalLancamento({ direcao: DIRECAO_POR_VISTA[vista] || "payable" });
  });
}

export async function iniciar() {
  if (!iniciado) {
    ligarControles();
    iniciado = true;
  }

  mostrarSetup(false);
  aplicarVista();
  mostrarSkeletonVista();
  setStatus("Carregando…");

  // Fire-and-forget: o roteador só libera a aba quando iniciar() resolve.
  void (async () => {
    try {
      const status = await api("/api/finance/status");
      if (!status.configurado) {
        mostrarSetup(true);
        return;
      }
      await carregarVista();
    } catch (erro) {
      mostrarSetup(true);
      setStatus(erro.message || "Falha ao falar com o backend");
    }
  })();
}

export async function atualizar() {
  return iniciar();
}
