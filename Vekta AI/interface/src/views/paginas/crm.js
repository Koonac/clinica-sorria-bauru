/**
 * Aba CRM — Dashboard, kanban de Leads/Negócios e Contatos,
 * colunas coloridas + DnD, modais com abas Dados / Histórico / Notas.
 */
import {
  $,
  el,
  api,
  CLASSE_BOTAO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_PAINEL,
  CLASSE_VAZIO,
  animarEntrada,
} from "../.core/util.js";
import {
  criarSelect,
  destruirSelectsEm,
  haSelectAberto,
} from "../componentes/select.js";

/** Status analítico do estágio (flags exclusivas no backend). */
const STATUS_ESTAGIO = [
  { value: "open", label: "Em aberto" },
  { value: "in_progress", label: "Em andamento" },
  { value: "won", label: "Ganho" },
  { value: "lost", label: "Perdido" },
];

function statusDoEstagio(stage) {
  if (!stage) return "open";
  if (stage.is_won) return "won";
  if (stage.is_lost) return "lost";
  if (stage.is_in_progress) return "in_progress";
  return "open";
}

function estagioTerminal(stage) {
  return Boolean(stage?.is_won || stage?.is_lost);
}

function estagioPerdido(stage) {
  return Boolean(stage?.is_lost);
}

const TIPOS_ACTIVITY = {
  note: { rotulo: "Nota", icone: "lucide:sticky-note" },
  call: { rotulo: "Ligação", icone: "lucide:phone" },
  whatsapp: { rotulo: "WhatsApp", icone: "lucide:message-circle" },
  email: { rotulo: "E-mail", icone: "lucide:mail" },
  task: { rotulo: "Tarefa", icone: "lucide:check-square" },
  stage_change: { rotulo: "Mudança de estágio", icone: "lucide:arrow-right-left" },
};

const CLASSE_INPUT =
  "w-full rounded-xl border border-linha bg-fundo px-3 py-2 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta";

/** Quantos cards renderizar por vez em cada coluna do kanban. */
const LIMITE_CARDS_COLUNA = 20;

const moedaBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

let iniciado = false;
let vista = "dashboard"; // dashboard | leads | negocios | contatos
let estagios = []; // stages kind=deal (modais de negócio)
let estagiosLeads = []; // stages kind=lead
let origens = [];
let carregando = false;
let buscaContatosTimer = null;
let buscaContatosAtual = "";
let buscaLeadsTimer = null;
let buscaLeadsAtual = "";
let buscaNegociosTimer = null;
let buscaNegociosAtual = "";
/** @type {ReturnType<typeof setInterval> | null} */
let whatsappPollTimer = null;
/** Último QR exibido — evita remount/piscada no poll. */
let whatsappUltimoQrSrc = null;
/** @type {"geral"|"whatsapp"} */
let configSecaoAtiva = "geral";
let configModalAberto = false;


/** @type {import('chart.js').Chart | null} */
let chartLeadsPorDia = null;
/** @type {import('chart.js').Chart | null} */
let chartPipelineLeads = null;
/** @type {import('chart.js').Chart | null} */
let chartPipelineDeals = null;

const DIAS_GRAFICO_LEADS = 30;

let sortableColunasLeads = null;
const sortablesCardsLeads = new Map();
let sortableColunasDeals = null;
const sortablesCardsDeals = new Map();

function formatarValor(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? moedaBRL.format(n) : "—";
}

function formatarData(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Extrai next_pending_task do payload (snake ou camel). */
function proximaTarefaDe(entidade) {
  return entidade?.next_pending_task || entidade?.nextPendingTask || null;
}

/**
 * Dias até a próxima tarefa (cards do kanban + modal).
 * Atrasada → dias 0. Hoje (ainda no prazo) → 0. Futuro → N dias civis.
 * @returns {{ dias: number, atrasada: boolean, texto: string } | null}
 */
function rotuloProximaTarefa(dueAt) {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDias = Math.round((inicioDue - inicioHoje) / 86400000);

  if (due.getTime() < agora.getTime()) {
    return { dias: 0, atrasada: true, texto: "Tarefa atrasada" };
  }
  if (diffDias === 0) {
    return { dias: 0, atrasada: false, texto: "Tarefa hoje" };
  }
  if (diffDias === 1) {
    return { dias: 1, atrasada: false, texto: "Tarefa em 1 dia" };
  }
  return {
    dias: diffDias,
    atrasada: false,
    texto: `Tarefa em ${diffDias} dias`,
  };
}

/** Dias civis desde o cadastro (created_at). */
function diasDesdeCadastro(createdAt) {
  if (!createdAt) return null;
  const criado = new Date(createdAt);
  if (Number.isNaN(criado.getTime())) return null;

  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioCriado = new Date(
    criado.getFullYear(),
    criado.getMonth(),
    criado.getDate(),
  );
  return Math.max(0, Math.round((inicioHoje - inicioCriado) / 86400000));
}

/** Chip compacto: número + ícone. */
function chipDiasIcone({ dias, icone, atrasada = false, title = "" }) {
  return el(
    "span",
    {
      class: `inline-flex items-center gap-1 font-mono text-xs tabular-nums leading-none ${
        atrasada ? "text-alerta" : "text-cinza"
      }`,
      title,
    },
    String(dias),
    el("iconify-icon", {
      noobserver: "",
      icon: icone,
      class: "text-[15px]",
      "aria-hidden": "true",
    }),
  );
}

/**
 * Rodapé do card: origem à esquerda, dias (tarefa/cadastro) à direita.
 * @param {object} entidade
 * @param {{ comCadastro?: boolean, origem?: string | null }} [opcoes]
 */
function metaDiasCard(entidade, opcoes = {}) {
  const chips = [];

  const tarefa = proximaTarefaDe(entidade);
  const rotuloTarefa = rotuloProximaTarefa(tarefa?.due_at);
  if (rotuloTarefa) {
    chips.push(
      chipDiasIcone({
        dias: rotuloTarefa.dias,
        icone: "lucide:clock",
        atrasada: rotuloTarefa.atrasada,
        title: [tarefa.title, rotuloTarefa.texto].filter(Boolean).join(" · "),
      }),
    );
  }

  if (opcoes.comCadastro) {
    const diasCadastro = diasDesdeCadastro(entidade?.created_at);
    if (diasCadastro != null) {
      chips.push(
        chipDiasIcone({
          dias: diasCadastro,
          icone: "lucide:calendar-days",
          title: entidade.created_at
            ? `Cadastrado em ${formatarData(entidade.created_at)}`
            : "Dias desde o cadastro",
        }),
      );
    }
  }

  const origem = opcoes.origem
    ? el(
        "span",
        {
          class:
            "text-[10px] font-mono text-cinza bg-superficie/80 px-1.5 py-0.5 rounded truncate min-w-0",
          title: opcoes.origem,
        },
        opcoes.origem,
      )
    : null;

  if (!origem && !chips.length) return null;

  return el(
    "div",
    { class: "flex items-center justify-between gap-2 mt-1 min-w-0" },
    origem || el("span", { class: "min-w-0" }),
    chips.length
      ? el(
          "div",
          { class: "flex items-center gap-2.5 flex-none" },
          ...chips,
        )
      : null,
  );
}

/** Linhas de WhatsApp / Instagram no card do kanban. */
function linhasCanalCard({ mobile, instagram }) {
  const nos = [];
  if (mobile) {
    nos.push(
      el(
        "p",
        {
          class: "text-[11px] text-cinza truncate flex items-center gap-1 min-w-0",
          title: mobile,
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:phone",
          class: "text-[12px] flex-none",
          "aria-hidden": "true",
        }),
        el("span", { class: "truncate" }, mobile),
      ),
    );
  }
  if (instagram) {
    nos.push(
      el(
        "p",
        {
          class: "text-[11px] text-cinza truncate flex items-center gap-1 min-w-0",
          title: instagram,
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:instagram",
          class: "text-[12px] flex-none",
          "aria-hidden": "true",
        }),
        el("span", { class: "truncate" }, instagram),
      ),
    );
  }
  return nos;
}

/**
 * Modal rápido para criar tarefa vinculada a lead ou deal.
 * @param {{ lead_id?: number, deal_id?: number }} vinculo
 * @param {{ contexto?: string }} [opcoes]
 */
function abrirModalNovaTarefa(vinculo, opcoes = {}) {
  const inputTitulo = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    required: "required",
    placeholder: "Título da tarefa",
  });
  const inputDesc = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[3rem] resize-y`,
    placeholder: "Descrição (opcional)",
  });
  const inputDue = el("input", {
    type: "datetime-local",
    class: CLASSE_INPUT,
    required: "required",
  });
  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    "Criar tarefa",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        const title = inputTitulo.value.trim();
        const dueLocal = inputDue.value;
        if (!title || !dueLocal) {
          erroEl.textContent = "Informe título e data/hora.";
          erroEl.classList.remove("hidden");
          return;
        }
        btnSalvar.disabled = true;
        try {
          await api("/api/crm/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: inputDesc.value.trim() || null,
              due_at: new Date(dueLocal).toISOString(),
              ...vinculo,
            }),
          });
          fecharModal();
          await carregarVista();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao criar tarefa";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    opcoes.contexto
      ? el(
          "p",
          { class: "text-xs text-cinza bg-fundo rounded-xl px-3 py-2" },
          opcoes.contexto,
        )
      : null,
    campoLabel("Título", inputTitulo),
    campoLabel("Descrição", inputDesc),
    campoLabel("Data e hora", inputDue),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-1" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      btnSalvar,
    ),
  );

  abrirModal({
    eyebrow: "CRM · Tarefa",
    titulo: "Nova tarefa",
    conteudo: form,
  });
  inputTitulo.focus();
}

/** Botão no card que abre o modal de nova tarefa (não abre o detalhe). */
function botaoNovaTarefaCard(vinculo, contexto) {
  return el(
    "button",
    {
      type: "button",
      class:
        "crm-btn-card-acao inline-flex items-center justify-center w-7 h-7 rounded-lg text-cinza hover:bg-superficie hover:text-vekta transition-colors flex-none",
      title: "Nova tarefa",
      "aria-label": "Nova tarefa",
      onclick: (e) => {
        e.stopPropagation();
        e.preventDefault();
        abrirModalNovaTarefa(vinculo, { contexto });
      },
      onpointerdown: (e) => e.stopPropagation(),
      onmousedown: (e) => e.stopPropagation(),
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:calendar-plus",
      class: "text-[15px]",
      "aria-hidden": "true",
    }),
  );
}

/**
 * Modal rápido para criar anotação (activity note) vinculada a lead ou deal.
 * @param {{ lead_id?: number, deal_id?: number }} vinculo
 * @param {{ contexto?: string }} [opcoes]
 */
function abrirModalNovaNota(vinculo, opcoes = {}) {
  const inputNota = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[5rem] resize-y`,
    required: "required",
    placeholder: "Escrever uma anotação…",
  });
  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    "Salvar anotação",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        const corpo = inputNota.value.trim();
        if (!corpo) {
          erroEl.textContent = "Escreva a anotação.";
          erroEl.classList.remove("hidden");
          return;
        }
        btnSalvar.disabled = true;
        try {
          await api("/api/crm/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "note", body: corpo, ...vinculo }),
          });
          fecharModal();
          await carregarVista();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar anotação";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    opcoes.contexto
      ? el(
          "p",
          { class: "text-xs text-cinza bg-fundo rounded-xl px-3 py-2" },
          opcoes.contexto,
        )
      : null,
    campoLabel("Anotação", inputNota),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-1" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      btnSalvar,
    ),
  );

  abrirModal({
    eyebrow: "CRM · Anotação",
    titulo: "Nova anotação",
    conteudo: form,
  });
  inputNota.focus();
}

/** Botão no card que abre o modal de nova anotação. */
function botaoNovaNotaCard(vinculo, contexto) {
  return el(
    "button",
    {
      type: "button",
      class:
        "crm-btn-card-acao inline-flex items-center justify-center w-7 h-7 rounded-lg text-cinza hover:bg-superficie hover:text-vekta transition-colors flex-none",
      title: "Nova anotação",
      "aria-label": "Nova anotação",
      onclick: (e) => {
        e.stopPropagation();
        e.preventDefault();
        abrirModalNovaNota(vinculo, { contexto });
      },
      onpointerdown: (e) => e.stopPropagation(),
      onmousedown: (e) => e.stopPropagation(),
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:sticky-note",
      class: "text-[15px]",
      "aria-hidden": "true",
    }),
  );
}

/** Grupo de ações rápidas no canto do card. */
function acoesRapidasCard(vinculo, contexto) {
  return el(
    "div",
    { class: "flex items-center gap-0.5 flex-none" },
    botaoNovaNotaCard(vinculo, contexto),
    botaoNovaTarefaCard(vinculo, contexto),
  );
}

function setStatus(texto) {
  const no = $("#crm-status");
  if (no) no.textContent = texto || "";
}

function mostrarSetup(setup) {
  $("#crm-setup")?.classList.toggle("hidden", !setup);
  $("#crm-painel")?.classList.toggle("hidden", setup);
  $("#crm-acoes")?.classList.toggle("hidden", setup);
}

// ==========================================================
// Skeleton de carregamento
// ==========================================================

function blocoSkeleton(classe) {
  return el("div", { class: `skeleton ${classe}`, "aria-hidden": "true" });
}

function renderSkeletonDashboard() {
  const kpisEl = $("#crm-dashboard-kpis");
  const funilEl = $("#crm-dashboard-funil");
  const chartEl = $("#crm-dashboard-leads-chart");
  const pipeLeadsEl = $("#crm-dashboard-pipeline-leads");
  const pipeDealsEl = $("#crm-dashboard-pipeline-deals");
  const estagiosEl = $("#crm-dashboard-estagios");
  if (kpisEl) {
    kpisEl.innerHTML = "";
    kpisEl.setAttribute("role", "status");
    kpisEl.setAttribute("aria-label", "Carregando indicadores");
    for (let i = 0; i < 6; i++) {
      kpisEl.append(
        el(
          "article",
          { class: `${CLASSE_PAINEL} flex flex-col gap-2 min-w-0` },
          blocoSkeleton("h-3 w-16"),
          blocoSkeleton("h-7 w-20"),
        ),
      );
    }
  }
  if (funilEl) {
    funilEl.innerHTML = "";
    funilEl.setAttribute("role", "status");
    funilEl.setAttribute("aria-label", "Carregando funil");
    funilEl.append(
      el(
        "div",
        { class: "px-5 pt-5 pb-2 flex items-start gap-3" },
        blocoSkeleton("w-10 h-10 rounded-xl"),
        el(
          "div",
          { class: "flex flex-col gap-2 pt-1" },
          blocoSkeleton("h-5 w-48"),
          blocoSkeleton("h-3 w-56"),
        ),
      ),
      el("div", { class: "px-6 pb-2" }, blocoSkeleton("h-3 w-full mb-3"), blocoSkeleton("h-28 w-full rounded-xl"), blocoSkeleton("h-5 w-full mt-2")),
      el(
        "div",
        { class: "mx-5 mb-5 mt-2 pt-4 border-t border-linha grid grid-cols-3 gap-4" },
        ...Array.from({ length: 3 }, () =>
          el("div", { class: "flex flex-col gap-2" }, blocoSkeleton("h-3 w-24"), blocoSkeleton("h-6 w-14")),
        ),
      ),
    );
  }
  if (chartEl) {
    destruirChartsDashboard();
    chartEl.innerHTML = "";
    chartEl.setAttribute("role", "status");
    chartEl.setAttribute("aria-label", "Carregando gráfico");
    chartEl.append(
      el(
        "div",
        { class: "px-4 pt-4 pb-2" },
        blocoSkeleton("h-5 w-52"),
      ),
      el(
        "div",
        { class: "px-4 pb-4" },
        blocoSkeleton("h-52 w-full rounded-xl"),
      ),
    );
  }
  for (const painel of [pipeLeadsEl, pipeDealsEl]) {
    if (!painel) continue;
    painel.innerHTML = "";
    painel.setAttribute("role", "status");
    painel.setAttribute("aria-label", "Carregando pipeline");
    painel.append(
      el("div", { class: "px-4 pt-4 pb-2" }, blocoSkeleton("h-5 w-40")),
      el("div", { class: "px-4 pb-4" }, blocoSkeleton("h-52 w-full rounded-xl")),
    );
  }
  if (estagiosEl) {
    estagiosEl.innerHTML = "";
    estagiosEl.setAttribute("role", "status");
    estagiosEl.setAttribute("aria-label", "Carregando pipeline");
    estagiosEl.append(
      el(
        "div",
        { class: "px-4 pt-4 pb-2" },
        blocoSkeleton("h-5 w-44"),
      ),
      el(
        "div",
        { class: "px-4 pb-4 flex flex-col gap-3" },
        ...Array.from({ length: 5 }, () =>
          el(
            "div",
            { class: "flex items-center gap-4" },
            blocoSkeleton("h-4 w-28"),
            blocoSkeleton("h-4 w-10"),
            blocoSkeleton("h-4 w-20 ml-auto"),
          ),
        ),
      ),
    );
  }
}

function renderSkeletonKanban(seletor) {
  const kanban = $(seletor);
  if (!kanban) return;
  kanban.innerHTML = "";
  kanban.setAttribute("role", "status");
  kanban.setAttribute("aria-label", "Carregando quadro");
  for (let c = 0; c < 4; c++) {
    const cards = el("div", {
      class: "flex flex-col gap-2 min-h-0 flex-1 overflow-hidden",
    });
    for (let i = 0; i < 2 + (c % 2); i++) {
      cards.append(
        el(
          "div",
          {
            class:
              "rounded-xl p-3 flex flex-col gap-2 border border-linha/60 bg-superficie/40",
          },
          blocoSkeleton("h-4 w-40"),
          blocoSkeleton("h-3 w-28"),
        ),
      );
    }
    kanban.append(
      el(
        "div",
        {
          class:
            "flex-none w-72 h-full min-h-0 bg-fundo/60 border border-linha rounded-2xl p-3 flex flex-col gap-2",
        },
        el(
          "div",
          { class: "flex items-center justify-between gap-2 px-1 pb-1 shrink-0" },
          el(
            "div",
            { class: "flex items-center gap-2" },
            blocoSkeleton("w-2.5 h-2.5 rounded-full"),
            blocoSkeleton("h-4 w-24"),
          ),
          blocoSkeleton("h-3 w-5"),
        ),
        cards,
      ),
    );
  }
}

function renderSkeletonContatos() {
  const lista = $("#crm-contatos-lista");
  if (!lista) return;
  lista.innerHTML = "";
  lista.setAttribute("role", "status");
  lista.setAttribute("aria-label", "Carregando contatos");
  lista.append(
    el(
      "div",
      { class: "px-4 py-3 border-b border-linha flex gap-6" },
      ...["w-20", "w-16", "w-24", "w-28", "w-24", "w-20"].map((w) =>
        blocoSkeleton(`h-3 ${w}`),
      ),
    ),
    ...Array.from({ length: 8 }, () =>
      el(
        "div",
        { class: "px-4 py-3.5 border-b border-linha/50 last:border-0 flex gap-6" },
        ...["w-28", "w-20", "w-24", "w-32", "w-24", "w-16"].map((w) =>
          blocoSkeleton(`h-3.5 ${w}`),
        ),
      ),
    ),
  );
}

function mostrarSkeletonVista() {
  if (vista === "dashboard") renderSkeletonDashboard();
  else if (vista === "leads") renderSkeletonKanban("#crm-kanban-leads");
  else if (vista === "negocios") renderSkeletonKanban("#crm-kanban-negocios");
  else if (vista === "contatos") renderSkeletonContatos();
}

/** Escurece ~20% o hex e devolve fundo translúcido + borda esquerda. */
function estiloCardCor(hex) {
  const n = String(hex || "#6b7280").replace("#", "");
  if (n.length !== 6) {
    return {
      background: "rgba(107, 114, 128, 0.18)",
      borderLeft: "3px solid #6b7280",
    };
  }
  const r = Math.max(0, Math.round(parseInt(n.slice(0, 2), 16) * 0.8));
  const g = Math.max(0, Math.round(parseInt(n.slice(2, 4), 16) * 0.8));
  const b = Math.max(0, Math.round(parseInt(n.slice(4, 6), 16) * 0.8));
  return {
    background: `rgba(${r}, ${g}, ${b}, 0.18)`,
    borderLeft: `3px solid #${n}`,
  };
}

function campoLabel(texto, input) {
  return el(
    "label",
    { class: "flex flex-col gap-1.5 text-sm" },
    el("span", { class: "font-medium text-tinta" }, texto),
    input,
  );
}

/** Atalho para o componente de select, com a classe padrão dos campos da página. */
function selectDe(opcoes, valorAtual, atributos = {}) {
  return criarSelect({
    opcoes,
    valor: valorAtual,
    atributos: { class: CLASSE_INPUT, ...atributos },
  });
}

function pillToggle(ativo) {
  return ativo ? "bg-vekta text-white" : "text-tinta hover:bg-fundo";
}

// ==========================================================
// Vista
// ==========================================================

function aplicarVista() {
  $("#crm-vista-dashboard")?.classList.toggle("hidden", vista !== "dashboard");
  $("#crm-vista-leads")?.classList.toggle("hidden", vista !== "leads");
  $("#crm-vista-negocios")?.classList.toggle("hidden", vista !== "negocios");
  $("#crm-vista-contatos")?.classList.toggle("hidden", vista !== "contatos");

  $("#crm-novo-lead")?.classList.toggle("hidden", vista !== "leads");

  for (const [id, nome] of [
    ["crm-ver-dashboard", "dashboard"],
    ["crm-ver-leads", "leads"],
    ["crm-ver-negocios", "negocios"],
    ["crm-ver-contatos", "contatos"],
  ]) {
    const btn = $(`#${id}`);
    if (!btn) continue;
    btn.className = `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${pillToggle(vista === nome)}`;
    btn.setAttribute("aria-selected", String(vista === nome));
  }
}

async function trocarVista(nova) {
  vista = nova;
  aplicarVista();
  await carregarVista();
}

async function carregarVista() {
  if (vista === "dashboard") await carregarDashboard();
  else if (vista === "leads") await carregarKanbanLeads();
  else if (vista === "negocios") await carregarPipeline();
  else if (vista === "contatos") await carregarContatos(buscaContatosAtual);
}

async function carregarReferencias() {
  const [respEstagiosDeal, respEstagiosLead, respOrigens] = await Promise.all([
    api("/api/crm/pipeline-stages?kind=deal"),
    api("/api/crm/pipeline-stages?kind=lead"),
    api("/api/crm/sources"),
  ]);
  estagios = respEstagiosDeal.data || [];
  estagiosLeads = respEstagiosLead.data || [];
  origens = respOrigens.data || [];
}

// ==========================================================
// Dashboard
// ==========================================================

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

function destruirChartLeads() {
  if (chartLeadsPorDia) {
    chartLeadsPorDia.destroy();
    chartLeadsPorDia = null;
  }
}

function destruirChartsPipeline() {
  if (chartPipelineLeads) {
    chartPipelineLeads.destroy();
    chartPipelineLeads = null;
  }
  if (chartPipelineDeals) {
    chartPipelineDeals.destroy();
    chartPipelineDeals = null;
  }
}

function destruirChartsDashboard() {
  destruirChartLeads();
  destruirChartsPipeline();
}

function rotuloDiaCurto(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Gráfico de linha: quantidade de cards por estágio do pipeline.
 * @returns {import('chart.js').Chart | null}
 */
function renderizarGraficoPipeline({
  seletor,
  titulo,
  stages,
  chaveItens,
  rotuloItem,
  canvasId,
}) {
  const painel = $(seletor);
  if (!painel) return null;
  painel.innerHTML = "";
  painel.removeAttribute("role");
  painel.removeAttribute("aria-label");

  const lista = Array.isArray(stages) ? stages : [];
  const totais = lista.map((st) => (st[chaveItens] || []).length);
  const total = totais.reduce((s, n) => s + n, 0);
  const cores = lista.map((st) => st.color || "#6b7280");

  painel.append(
    el(
      "div",
      {
        class:
          "px-4 pt-4 pb-1 flex items-baseline justify-between gap-3 flex-wrap",
      },
      el(
        "h2",
        { class: "font-display text-lg font-semibold tracking-tight" },
        titulo,
      ),
      el(
        "p",
        { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
        `${total} ${rotuloItem}${total === 1 ? "" : "s"}`,
      ),
    ),
  );

  if (!lista.length) {
    painel.append(
      el(
        "p",
        { class: `${CLASSE_VAZIO} px-5 py-4` },
        "Nenhum estágio no pipeline.",
      ),
    );
    return null;
  }

  if (typeof Chart === "undefined") {
    painel.append(
      el(
        "p",
        { class: `${CLASSE_VAZIO} px-5 py-4` },
        "Chart.js não está disponível.",
      ),
    );
    return null;
  }

  const wrap = el("div", { class: "relative h-56 w-full px-3 pb-4" });
  const canvas = el("canvas", {
    id: canvasId,
    "aria-label": titulo,
  });
  wrap.append(canvas);
  painel.append(wrap);

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: lista.map((st) => st.name || "—"),
      datasets: [
        {
          label: rotuloItem === "lead" ? "Leads" : "Negócios",
          data: totais,
          borderColor: "#0e8a76",
          backgroundColor: "rgba(14, 138, 118, 0.16)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: cores,
          pointBorderColor: cores,
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#14161c",
          borderColor: "#23262f",
          borderWidth: 1,
          titleColor: "#eef0f4",
          bodyColor: "#8890a1",
          padding: 10,
          callbacks: {
            label: (item) => {
              const n = Number(item.raw) || 0;
              return n === 1
                ? `1 ${rotuloItem}`
                : `${n} ${rotuloItem}s`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#565d6d",
            font: { size: 10 },
            maxRotation: 45,
            autoSkip: false,
          },
          grid: { display: false },
          border: { color: "#23262f" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#565d6d",
            font: { size: 11 },
            precision: 0,
            stepSize: 1,
          },
          grid: { color: "rgba(35, 38, 47, 0.7)" },
          border: { color: "#23262f" },
        },
      },
    },
  });
}

function renderizarGraficosPipeline(stagesLead, stagesDeal) {
  destruirChartsPipeline();
  chartPipelineLeads = renderizarGraficoPipeline({
    seletor: "#crm-dashboard-pipeline-leads",
    titulo: "Pipeline de leads",
    stages: stagesLead,
    chaveItens: "leads",
    rotuloItem: "lead",
    canvasId: "crm-chart-pipeline-leads",
  });
  chartPipelineDeals = renderizarGraficoPipeline({
    seletor: "#crm-dashboard-pipeline-deals",
    titulo: "Pipeline de negócios",
    stages: stagesDeal,
    chaveItens: "deals",
    rotuloItem: "negócio",
    canvasId: "crm-chart-pipeline-deals",
  });
}

/**
 * Formata percentual do funil (1 casa quando necessário).
 */
function formatarPctFunil(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "0%";
  const arred = Math.round(n * 10) / 10;
  return Number.isInteger(arred) ? `${arred}%` : `${arred.toFixed(1)}%`;
}

/**
 * Funil horizontal estilo conversão: jornada do lead até o ganho.
 * Contagens cumulativas (alcançou esta etapa ou além) para o afunilamento.
 */
function renderizarFunilLeads(stagesLead, totalConvertidos = 0) {
  const painel = $("#crm-dashboard-funil");
  if (!painel) return;
  painel.innerHTML = "";
  painel.removeAttribute("role");
  painel.removeAttribute("aria-label");

  const stages = Array.isArray(stagesLead) ? [...stagesLead] : [];
  stages.sort((a, b) => (a.position || 0) - (b.position || 0));

  const convertidos = Number(totalConvertidos) || 0;
  const passosBase = stages
    .filter((st) => !st.is_lost)
    .map((st) => ({
      nome: st.name || "—",
      total: (st.leads || []).length,
    }));

  if (convertidos > 0 || !stages.some((st) => st.is_won && !st.is_lost)) {
    passosBase.push({ nome: "Ganhos", total: convertidos });
  } else {
    const ganhosEmStage = stages
      .filter((st) => st.is_won)
      .reduce((s, st) => s + (st.leads || []).length, 0);
    if (!passosBase.some((p) => /ganho/i.test(p.nome))) {
      passosBase.push({ nome: "Ganhos", total: ganhosEmStage + convertidos });
    }
  }

  const n = passosBase.length;
  // Cumulativo: quem chegou pelo menos até esta etapa (próprios + posteriores).
  const cumulativos = passosBase.map((_, i) =>
    passosBase.slice(i).reduce((s, p) => s + p.total, 0),
  );
  const totalEntrada = cumulativos[0] || 0;
  const totalGanhos = cumulativos[n - 1] || 0;
  const pctGeral =
    totalEntrada > 0 ? (totalGanhos / totalEntrada) * 100 : 0;

  painel.append(
    el(
      "div",
      { class: "px-5 pt-5 pb-2 flex items-start gap-3" },
      el(
        "div",
        {
          class:
            "flex-none w-10 h-10 rounded-xl bg-vekta-suave border border-linha flex items-center justify-center text-vekta",
          "aria-hidden": "true",
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:filter",
          class: "text-xl",
        }),
      ),
      el(
        "div",
        { class: "min-w-0 pt-0.5" },
        el(
          "h2",
          { class: "font-display text-lg font-semibold tracking-tight text-tinta" },
          "Funil de Conversão",
        ),
        el(
          "p",
          {
            class:
              "font-mono text-[10px] uppercase tracking-widest text-cinza mt-0.5",
          },
          "Jornada do lead até o ganho",
        ),
      ),
    ),
  );

  if (n === 0 || totalEntrada === 0) {
    painel.append(
      el(
        "p",
        { class: `${CLASSE_VAZIO} px-5 py-8` },
        "Nenhum lead no funil ainda.",
      ),
    );
    return;
  }

  const W = 840;
  const H = 168;
  const padX = 28;
  const padY = 18;
  const usableW = W - padX * 2;
  const midY = H / 2;
  const maxHalf = (H - padY * 2) / 2;
  const minHalf = 3;

  const xs = passosBase.map((_, i) =>
    n === 1 ? W / 2 : padX + (usableW * i) / (n - 1),
  );
  const halfs = cumulativos.map((c) => {
    if (totalEntrada <= 0) return minHalf;
    const ratio = c / totalEntrada;
    return Math.max(minHalf, maxHalf * Math.max(ratio, c > 0 ? 0.06 : 0));
  });

  // Contorno superior e inferior (suave entre os pontos).
  const topPts = xs.map((x, i) => ({ x, y: midY - halfs[i] }));
  const botPts = xs.map((x, i) => ({ x, y: midY + halfs[i] }));

  let dFunil = `M ${topPts[0].x} ${topPts[0].y}`;
  for (let i = 0; i < topPts.length - 1; i++) {
    const p0 = topPts[i];
    const p1 = topPts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    dFunil += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  dFunil += ` L ${botPts[botPts.length - 1].x} ${botPts[botPts.length - 1].y}`;
  for (let i = botPts.length - 1; i > 0; i--) {
    const p0 = botPts[i];
    const p1 = botPts[i - 1];
    const cx = (p0.x + p1.x) / 2;
    dFunil += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  dFunil += " Z";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "w-full h-auto block");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const defs = document.createElementNS(svgNS, "defs");
  const grad = document.createElementNS(svgNS, "linearGradient");
  grad.setAttribute("id", "crm-funil-grad");
  grad.setAttribute("x1", "0%");
  grad.setAttribute("y1", "0%");
  grad.setAttribute("x2", "100%");
  grad.setAttribute("y2", "0%");
  for (const [off, cor] of [
    ["0%", "#2dd4bf"],
    ["45%", "#14b8a6"],
    ["100%", "#0e8a76"],
  ]) {
    const stop = document.createElementNS(svgNS, "stop");
    stop.setAttribute("offset", off);
    stop.setAttribute("stop-color", cor);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", dFunil);
  path.setAttribute("fill", "url(#crm-funil-grad)");
  path.setAttribute("opacity", "0.95");
  svg.appendChild(path);

  // Divisores pontilhados + % dentro do funil
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1) {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", String(xs[i]));
      line.setAttribute("x2", String(xs[i]));
      line.setAttribute("y1", String(midY - halfs[i] - 6));
      line.setAttribute("y2", String(midY + halfs[i] + 6));
      line.setAttribute("stroke", "rgba(238, 240, 244, 0.4)");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("stroke-dasharray", "3 5");
      svg.appendChild(line);
    }

    const pctDoInicio =
      totalEntrada > 0 ? (cumulativos[i] / totalEntrada) * 100 : 0;
    const texto = document.createElementNS(svgNS, "text");
    texto.setAttribute("x", String(xs[i]));
    texto.setAttribute("y", String(midY));
    texto.setAttribute("text-anchor", "middle");
    texto.setAttribute("dominant-baseline", "middle");
    texto.setAttribute("fill", "#ffffff");
    texto.setAttribute("font-size", halfs[i] < 14 ? "13" : i === 0 || i === n - 1 ? "22" : "18");
    texto.setAttribute("font-weight", "700");
    texto.setAttribute("font-family", "ui-sans-serif, system-ui, sans-serif");
    // Se a fatia ficou muito fina, sobe o % para ficar legível
    if (halfs[i] < 10) {
      texto.setAttribute("y", String(midY - halfs[i] - 14));
      texto.setAttribute("fill", "#eef0f4");
      texto.setAttribute("font-size", "14");
    }
    texto.textContent = formatarPctFunil(pctDoInicio);
    svg.appendChild(texto);
  }

  const colsStyle = `grid-template-columns: repeat(${n}, minmax(0, 1fr))`;

  // Colunas: rótulo cima / SVG / número baixo — alinhadas por estágio
  const grade = el("div", {
    class: "px-4 sm:px-6 pt-3 pb-2",
  });

  const rotulos = el("div", {
    class: "grid gap-1 mb-1",
    style: colsStyle,
  });
  for (let i = 0; i < n; i++) {
    const alinhamento =
      i === 0 ? "text-left" : i === n - 1 ? "text-right" : "text-center";
    rotulos.append(
      el(
        "p",
        {
          class: `font-mono text-[10px] sm:text-[11px] uppercase tracking-wider text-cinza truncate ${alinhamento}`,
          title: passosBase[i].nome,
        },
        i === 0 ? `/ ${passosBase[i].nome}` : passosBase[i].nome,
      ),
    );
  }

  const numeros = el("div", {
    class: "grid gap-1 mt-1",
    style: colsStyle,
  });
  for (let i = 0; i < n; i++) {
    const alinhamento =
      i === 0 ? "text-left" : i === n - 1 ? "text-right" : "text-center";
    numeros.append(
      el(
        "p",
        {
          class: `font-display text-base sm:text-lg font-semibold text-tinta tabular-nums ${alinhamento}`,
          title: `${cumulativos[i]} lead${cumulativos[i] === 1 ? "" : "s"} chegaram até aqui`,
        },
        String(cumulativos[i]),
      ),
    );
  }

  grade.append(rotulos, svg, numeros);
  painel.append(grade);

  // Taxas entre etapas (rodapé)
  const taxas = [];
  for (let i = 0; i < n - 1; i++) {
    const de = cumulativos[i];
    const para = cumulativos[i + 1];
    const pct = de > 0 ? (para / de) * 100 : 0;
    taxas.push({
      rotulo: `${passosBase[i].nome} → ${passosBase[i + 1].nome}`,
      pct,
    });
  }
  if (n > 2) {
    taxas.push({
      rotulo: `${passosBase[0].nome} → ${passosBase[n - 1].nome}`,
      pct: pctGeral,
    });
  }

  const taxasExibir =
    taxas.length <= 4
      ? taxas
      : [...taxas.slice(0, Math.min(3, n - 1)), taxas[taxas.length - 1]].filter(
          (t, idx, arr) => arr.findIndex((x) => x.rotulo === t.rotulo) === idx,
        );

  const rodape = el("div", {
    class: "mx-5 mb-5 mt-2 pt-4 border-t border-linha grid gap-4",
    style: `grid-template-columns: repeat(${Math.min(taxasExibir.length, 4)}, minmax(0, 1fr))`,
  });

  for (const taxa of taxasExibir) {
    rodape.append(
      el(
        "div",
        { class: "min-w-0 flex flex-col gap-1" },
        el(
          "p",
          {
            class:
              "font-mono text-[10px] uppercase tracking-wider text-cinza truncate",
            title: taxa.rotulo,
          },
          taxa.rotulo,
        ),
        el(
          "p",
          {
            class:
              "font-display text-xl font-semibold text-vekta tabular-nums",
          },
          formatarPctFunil(taxa.pct),
        ),
      ),
    );
  }

  painel.append(rodape);
  animarEntrada([grade, rodape]);
}

function renderizarGraficoLeadsPorDia(serie) {
  const painel = $("#crm-dashboard-leads-chart");
  if (!painel) return;
  destruirChartLeads();
  painel.innerHTML = "";
  painel.removeAttribute("role");
  painel.removeAttribute("aria-label");

  const pontos = Array.isArray(serie) ? serie : [];
  const totalPeriodo = pontos.reduce((s, p) => s + (Number(p.total) || 0), 0);

  painel.append(
    el(
      "div",
      { class: "px-4 pt-4 pb-1 flex items-baseline justify-between gap-3 flex-wrap" },
      el(
        "h2",
        { class: "font-display text-lg font-semibold tracking-tight" },
        "Leads por dia",
      ),
      el(
        "p",
        { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
        `últimos ${DIAS_GRAFICO_LEADS} dias · ${totalPeriodo} lead${totalPeriodo === 1 ? "" : "s"}`,
      ),
    ),
  );

  if (typeof Chart === "undefined") {
    painel.append(
      el(
        "p",
        { class: `${CLASSE_VAZIO} px-5 py-4` },
        "Chart.js não está disponível.",
      ),
    );
    return;
  }

  const wrap = el("div", { class: "relative h-56 w-full px-3 pb-4" });
  const canvas = el("canvas", {
    id: "crm-chart-leads-dia",
    "aria-label": "Leads criados por dia",
  });
  wrap.append(canvas);
  painel.append(wrap);

  chartLeadsPorDia = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: pontos.map((p) => rotuloDiaCurto(p.date)),
      datasets: [
        {
          label: "Leads",
          data: pontos.map((p) => Number(p.total) || 0),
          borderColor: "#0e8a76",
          backgroundColor: "rgba(14, 138, 118, 0.18)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#0e8a76",
          pointBorderColor: "#0e8a76",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#14161c",
          borderColor: "#23262f",
          borderWidth: 1,
          titleColor: "#eef0f4",
          bodyColor: "#8890a1",
          padding: 10,
          callbacks: {
            title: (itens) => {
              const i = itens[0]?.dataIndex;
              const ponto = pontos[i];
              if (!ponto?.date) return "";
              const d = new Date(`${ponto.date}T12:00:00`);
              return d.toLocaleDateString("pt-BR", {
                weekday: "short",
                day: "2-digit",
                month: "long",
              });
            },
            label: (item) => {
              const n = Number(item.raw) || 0;
              return n === 1 ? "1 lead" : `${n} leads`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#565d6d",
            font: { size: 10 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          grid: { display: false },
          border: { color: "#23262f" },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#565d6d",
            font: { size: 11 },
            precision: 0,
            stepSize: 1,
          },
          grid: { color: "rgba(35, 38, 47, 0.7)" },
          border: { color: "#23262f" },
        },
      },
    },
  });
}

async function carregarDashboard() {
  if (carregando) return;
  carregando = true;
  setStatus("Carregando dashboard…");
  renderSkeletonDashboard();

  const kpisEl = $("#crm-dashboard-kpis");
  const chartEl = $("#crm-dashboard-leads-chart");
  const estagiosEl = $("#crm-dashboard-estagios");

  try {
    const [respContatos, respPipelineDeal, respPipelineLead, respLeadsDia, respConvertidos] =
      await Promise.all([
        api("/api/crm/contacts"),
        api("/api/crm/pipeline?kind=deal"),
        api("/api/crm/pipeline?kind=lead"),
        api(`/api/crm/stats/leads-por-dia?dias=${DIAS_GRAFICO_LEADS}`).catch(
          () => ({ data: [] }),
        ),
        api("/api/crm/leads?status=converted").catch(() => ({
          data: [],
          total: 0,
          meta: { total: 0 },
        })),
      ]);

    const totalContatos = Number(
      respContatos.total ?? respContatos.meta?.total ?? (respContatos.data || []).length,
    );

    const stagesLead = respPipelineLead.data || [];
    const totalLeadsPipeline = stagesLead.reduce(
      (s, st) => s + (st.leads?.length || 0),
      0,
    );
    const totalConvertidos = Number(
      respConvertidos.total ??
        respConvertidos.meta?.total ??
        (respConvertidos.data || []).length,
    );
    const totalLeads = totalLeadsPipeline + totalConvertidos;

    const stages = respPipelineDeal.data || [];
    const todosDeals = stages.flatMap((st) =>
      (st.deals || []).map((d) => ({ ...d, stage: st })),
    );
    const abertos = todosDeals.filter((d) => !estagioTerminal(d.stage));
    const ganhos = todosDeals.filter((d) => d.stage?.is_won);
    const perdidos = todosDeals.filter((d) => d.stage?.is_lost);
    const valorPipeline = abertos.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const valorGanhos = ganhos.reduce((s, d) => s + (Number(d.value) || 0), 0);

    if (kpisEl) {
      kpisEl.innerHTML = "";
      kpisEl.removeAttribute("role");
      kpisEl.removeAttribute("aria-label");
      kpisEl.append(
        cardKpi("Contatos", String(totalContatos)),
        cardKpi("Leads", String(totalLeads)),
        cardKpi("Negócios abertos", String(abertos.length)),
        cardKpi("Valor do pipeline", formatarValor(valorPipeline)),
        cardKpi(
          "Ganhos",
          `${ganhos.length} · ${formatarValor(valorGanhos)}`,
        ),
        cardKpi("Perdidos", String(perdidos.length)),
      );
      animarEntrada(kpisEl.children);
    }

    renderizarFunilLeads(stagesLead, totalConvertidos);
    renderizarGraficoLeadsPorDia(respLeadsDia.data || []);
    renderizarGraficosPipeline(stagesLead, stages);

    if (estagiosEl) {
      estagiosEl.innerHTML = "";
      estagiosEl.removeAttribute("role");
      estagiosEl.removeAttribute("aria-label");
      if (!stages.length) {
        estagiosEl.append(
          el("p", { class: `${CLASSE_VAZIO} px-5 py-4` }, "Nenhum estágio no pipeline."),
        );
      } else {
        const thead = el(
          "thead",
          {},
          el(
            "tr",
            { class: "border-b border-linha text-left" },
            ...["Estágio", "Negócios", "Valor"].map((h) =>
              el(
                "th",
                {
                  class:
                    "px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-cinza font-medium",
                },
                h,
              ),
            ),
          ),
        );
        const tbody = el("tbody", {});
        for (const stage of stages) {
          const deals = stage.deals || [];
          const valor = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
          tbody.append(
            el(
              "tr",
              { class: "border-b border-linha/50 last:border-0" },
              el(
                "td",
                { class: "px-4 py-3 text-sm text-tinta" },
                el(
                  "span",
                  { class: "inline-flex items-center gap-2" },
                  el("span", {
                    class: "inline-block w-2.5 h-2.5 rounded-full flex-none",
                    style: { background: stage.color || "#6b7280" },
                    "aria-hidden": "true",
                  }),
                  stage.name || "—",
                ),
              ),
              el(
                "td",
                { class: "px-4 py-3 text-sm text-tinta whitespace-nowrap" },
                String(deals.length),
              ),
              el(
                "td",
                { class: "px-4 py-3 text-sm text-tinta whitespace-nowrap font-mono" },
                formatarValor(valor),
              ),
            ),
          );
        }
        estagiosEl.append(
          el(
            "div",
            { class: "px-4 pt-4 pb-2" },
            el(
              "h2",
              { class: "font-display text-lg font-semibold tracking-tight" },
              "Valor por estágio (negócios)",
            ),
          ),
          el("div", { class: "overflow-x-auto" }, el("table", { class: "w-full" }, thead, tbody)),
        );
      }
    }

    setStatus(
      `Pipeline · ${formatarValor(valorPipeline)} · ${totalContatos} contato${totalContatos === 1 ? "" : "s"}`,
    );
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar dashboard");
    destruirChartsDashboard();
    if (kpisEl) {
      kpisEl.innerHTML = "";
      kpisEl.removeAttribute("role");
      kpisEl.removeAttribute("aria-label");
      kpisEl.append(
        el("p", { class: CLASSE_VAZIO }, "Não foi possível carregar os indicadores."),
      );
    }
    if (chartEl) {
      chartEl.innerHTML = "";
      chartEl.removeAttribute("role");
      chartEl.removeAttribute("aria-label");
      chartEl.append(
        el("p", { class: `${CLASSE_VAZIO} px-5 py-4` }, "Não foi possível carregar o gráfico."),
      );
    }
    for (const id of [
      "#crm-dashboard-pipeline-leads",
      "#crm-dashboard-pipeline-deals",
    ]) {
      const painel = $(id);
      if (!painel) continue;
      painel.innerHTML = "";
      painel.removeAttribute("role");
      painel.removeAttribute("aria-label");
      painel.append(
        el(
          "p",
          { class: `${CLASSE_VAZIO} px-5 py-4` },
          "Não foi possível carregar o pipeline.",
        ),
      );
    }
    if (estagiosEl) {
      estagiosEl.innerHTML = "";
      estagiosEl.removeAttribute("role");
      estagiosEl.removeAttribute("aria-label");
    }
  } finally {
    carregando = false;
  }
}

// ==========================================================
// Contatos
// ==========================================================

function textoOuTraco(valor) {
  const t = valor == null ? "" : String(valor).trim();
  return t || "—";
}

function telefoneContato(c) {
  return c.mobile || c.phone || "";
}

async function carregarContatos(search = "") {
  if (carregando) return;
  carregando = true;
  setStatus("Carregando contatos…");
  renderSkeletonContatos();
  const lista = $("#crm-contatos-lista");

  try {
    const q = search.trim();
    const caminho = q
      ? `/api/crm/contacts?search=${encodeURIComponent(q)}`
      : "/api/crm/contacts";
    const resp = await api(caminho);
    const contatos = resp.data || [];
    const total = Number(resp.total ?? resp.meta?.total ?? contatos.length);
    renderizarTabelaContatos(contatos);
    if (q) {
      setStatus(
        total === 1
          ? `1 contato encontrado`
          : `${total} contatos encontrados`,
      );
    } else {
      setStatus(total === 1 ? "1 contato" : `${total} contatos`);
    }
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar contatos");
    if (lista) {
      lista.innerHTML = "";
      lista.removeAttribute("role");
      lista.removeAttribute("aria-label");
      lista.append(
        el("p", { class: `${CLASSE_VAZIO} px-5 py-4` }, "Não foi possível carregar os contatos."),
      );
    }
  } finally {
    carregando = false;
  }
}

function renderizarTabelaContatos(contatos) {
  const lista = $("#crm-contatos-lista");
  if (!lista) return;
  lista.innerHTML = "";
  lista.removeAttribute("role");
  lista.removeAttribute("aria-label");

  if (!contatos.length) {
    lista.append(
      el(
        "p",
        { class: `${CLASSE_VAZIO} px-5 py-6 text-center` },
        "Nenhum contato encontrado.",
      ),
    );
    return;
  }

  const colunas = ["Nome", "Cargo", "Empresa", "E-mail", "Telefone", "Instagram"];
  const thead = el(
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
              "px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-cinza font-medium",
          },
          h,
        ),
      ),
    ),
  );

  const tbody = el("tbody", {});
  for (const contato of contatos) {
    tbody.append(
      el(
        "tr",
        {
          class:
            "group border-b border-linha/50 last:border-0 cursor-pointer transition-colors hover:bg-vekta-suave",
          title: "Ver detalhes do contato",
          onclick: () => abrirModalContato(contato),
        },
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta font-medium whitespace-nowrap" },
          textoOuTraco(contato.name),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-cinza whitespace-nowrap" },
          textoOuTraco(contato.job_title),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta whitespace-nowrap" },
          textoOuTraco(contato.organization?.name),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta whitespace-nowrap" },
          textoOuTraco(contato.email),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-tinta whitespace-nowrap font-mono" },
          textoOuTraco(telefoneContato(contato)),
        ),
        el(
          "td",
          { class: "px-4 py-3 text-sm text-cinza whitespace-nowrap" },
          textoOuTraco(contato.instagram),
        ),
      ),
    );
  }

  lista.append(
    el("div", { class: "overflow-x-auto" }, el("table", { class: "w-full" }, thead, tbody)),
  );
}

function linhaInfo(rotulo, valor) {
  return el(
    "div",
    { class: "flex flex-col gap-0.5 min-w-0" },
    el(
      "span",
      { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
      rotulo,
    ),
    el("span", { class: "text-sm text-tinta break-words" }, textoOuTraco(valor)),
  );
}

function abrirModalContato(contato) {
  const org = contato.organization;
  const conteudo = el(
    "div",
    { class: "flex flex-col gap-5" },
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-4" },
      linhaInfo("Nome", contato.name),
      linhaInfo("Cargo", contato.job_title),
      linhaInfo("E-mail", contato.email),
      linhaInfo("Telefone", contato.phone),
      linhaInfo("Celular", contato.mobile),
      linhaInfo("WhatsApp JID", contato.whatsapp_jid),
      linhaInfo("Instagram", contato.instagram),
      linhaInfo(
        "Criado em",
        contato.created_at ? formatarData(contato.created_at) : "",
      ),
      linhaInfo(
        "Atualizado em",
        contato.updated_at ? formatarData(contato.updated_at) : "",
      ),
    ),
    el(
      "div",
      { class: "rounded-xl border border-linha bg-fundo px-4 py-3" },
      el(
        "p",
        { class: "font-mono text-[11px] uppercase tracking-wider text-cinza mb-2" },
        "Observações",
      ),
      el(
        "p",
        { class: "text-sm text-tinta whitespace-pre-wrap break-words" },
        textoOuTraco(contato.notes),
      ),
    ),
    el(
      "div",
      { class: "rounded-xl border border-linha bg-fundo px-4 py-3 flex flex-col gap-3" },
      el(
        "p",
        { class: "font-mono text-[11px] uppercase tracking-wider text-cinza" },
        "Empresa",
      ),
      org
        ? el(
            "div",
            { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
            linhaInfo("Nome", org.name),
            linhaInfo("Website", org.website),
            linhaInfo("Instagram", org.instagram),
            linhaInfo("Setor", org.industry),
            linhaInfo("Cidade", org.city),
            linhaInfo("Notas", org.notes),
          )
        : el("p", { class: "text-sm text-cinza" }, "Sem empresa vinculada."),
    ),
  );

  abrirModal({
    eyebrow: "CRM · Contato",
    titulo: contato.name || "Contato",
    conteudo,
  });
}

function onBuscaContatosInput(e) {
  const valor = e.target.value || "";
  clearTimeout(buscaContatosTimer);
  buscaContatosTimer = setTimeout(() => {
    buscaContatosAtual = valor;
    if (vista === "contatos") carregarContatos(buscaContatosAtual);
  }, 300);
}

function onBuscaLeadsInput(e) {
  const valor = e.target.value || "";
  clearTimeout(buscaLeadsTimer);
  buscaLeadsTimer = setTimeout(() => {
    buscaLeadsAtual = valor;
    if (vista === "leads") carregarKanbanLeads(buscaLeadsAtual);
  }, 300);
}

function onBuscaNegociosInput(e) {
  const valor = e.target.value || "";
  clearTimeout(buscaNegociosTimer);
  buscaNegociosTimer = setTimeout(() => {
    buscaNegociosAtual = valor;
    if (vista === "negocios") carregarPipeline(buscaNegociosAtual);
  }, 300);
}

// ==========================================================
// Menus flutuantes
// ==========================================================

function fecharMenuFlutuante() {
  $("#crm-menu-flutuante")?.remove();
}

function itemMenu(rotulo, onclick, perigo = false) {
  return el(
    "button",
    {
      type: "button",
      class: `w-full text-left px-3.5 py-2 hover:bg-fundo transition-colors ${
        perigo ? "text-alerta" : "text-tinta"
      }`,
      onclick: (e) => {
        e.stopPropagation();
        fecharMenuFlutuante();
        onclick();
      },
    },
    rotulo,
  );
}

function abrirMenu(ancora, itens) {
  fecharMenuFlutuante();
  const menu = el(
    "div",
    {
      id: "crm-menu-flutuante",
      class:
        "fixed z-[60] bg-superficie border border-linha rounded-xl shadow-lg py-1 min-w-[12rem] text-sm",
    },
    ...itens,
  );
  document.body.append(menu);
  const rect = ancora.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, rect.right - 180)}px`;
  setTimeout(() => {
    document.addEventListener("click", fecharMenuFlutuante, { once: true });
  }, 0);
}

// ==========================================================
// Kanban de Leads (um quadro fixo)
// ==========================================================

/**
 * Preenche a lista com até `LIMITE_CARDS_COLUNA` itens e, se houver mais,
 * um botão "Mostrar mais" que revela o próximo lote.
 */
function preencherListaPaginada(lista, itens, montarCard) {
  let mostrado = 0;
  let btnMais = null;

  function anexarLote() {
    const fim = Math.min(mostrado + LIMITE_CARDS_COLUNA, itens.length);
    for (let i = mostrado; i < fim; i++) {
      const card = montarCard(itens[i]);
      if (btnMais) lista.insertBefore(card, btnMais);
      else lista.append(card);
    }
    mostrado = fim;
    sincronizarBotao();
  }

  function sincronizarBotao() {
    btnMais?.remove();
    btnMais = null;
    if (mostrado >= itens.length) return;
    const restantes = itens.length - mostrado;
    btnMais = el(
      "button",
      {
        type: "button",
        class:
          "crm-mostrar-mais w-full shrink-0 rounded-xl border border-dashed border-linha px-3 py-2.5 text-xs font-medium text-cinza hover:border-vekta hover:text-vekta transition-colors",
        onclick: (e) => {
          e.stopPropagation();
          anexarLote();
        },
      },
      restantes === 1
        ? "Mostrar mais · 1 restante"
        : `Mostrar mais · ${restantes} restantes`,
    );
    lista.append(btnMais);
  }

  anexarLote();
}

/** Ctrl no Windows/Linux; Meta (Cmd) no Mac — tecla do MultiDrag do Sortable. */
const MULTI_DRAG_KEY = /Mac|iPhone|iPad|iPod/i.test(
  `${navigator.platform || ""} ${navigator.userAgent || ""}`,
)
  ? "META"
  : "CTRL";

/** Cards envolvidos no drop (MultiDrag usa `items`; caso contrário, só `item`). */
function cardsDoEvento(evt) {
  if (Array.isArray(evt?.items) && evt.items.length > 0) return evt.items;
  return evt?.item ? [evt.item] : [];
}

function limparSelecaoCardsKanban() {
  document.querySelectorAll(".crm-card-selecionado").forEach((card) => {
    if (typeof Sortable !== "undefined" && Sortable.utils?.deselect) {
      try {
        Sortable.utils.deselect(card);
        return;
      } catch (_) {
        /* fallback abaixo */
      }
    }
    card.classList.remove("crm-card-selecionado");
  });
}

/**
 * Clique normal abre o detalhe; Ctrl/Cmd só seleciona (MultiDrag).
 * Marca no pointerdown porque o Sortable pode engolir o estado do
 * modificador no click seguinte.
 */
function ligarCliqueCardKanban(cardEl, abrirFn) {
  let bloqueadoPorModificador = false;

  cardEl.addEventListener("pointerdown", (e) => {
    bloqueadoPorModificador = Boolean(e.ctrlKey || e.metaKey);
  });

  cardEl.addEventListener("click", (e) => {
    const comModificador =
      e.ctrlKey || e.metaKey || bloqueadoPorModificador;
    bloqueadoPorModificador = false;
    if (comModificador) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    limparSelecaoCardsKanban();
    abrirFn();
  });
}

/** Recoloca o card na lista/posição original após falha ou cancelamento. */
function reverterCardKanban(evt) {
  const { from, item, oldIndex } = evt;
  if (!from || !item) return;
  const filhos = from.children;
  if (oldIndex == null || oldIndex >= filhos.length) {
    from.appendChild(item);
  } else {
    from.insertBefore(item, filhos[oldIndex]);
  }
}

/**
 * Recoloca vários cards nas posições originais (MultiDrag / oldIndicies).
 * Se não houver índices confiáveis, devolve false para o caller recarregar.
 */
function reverterCardsKanban(evt) {
  const cards = cardsDoEvento(evt);
  if (cards.length <= 1) {
    reverterCardKanban(evt);
    return true;
  }
  const pares = (evt.oldIndicies || [])
    .map((info) => ({
      el: info.multiDragElement,
      index: info.index,
    }))
    .filter((p) => p.el && p.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (pares.length !== cards.length || !evt.from) return false;

  for (const { el, index } of pares) {
    const ref = evt.from.children[index];
    if (ref && ref !== el) evt.from.insertBefore(el, ref);
    else if (!ref) evt.from.appendChild(el);
  }
  return true;
}

function corDaListaStage(listaEl) {
  return listaEl?.dataset?.stageColor || "#6b7280";
}

function aplicarCorCard(cardEl, cor) {
  if (!cardEl) return;
  const estilo = estiloCardCor(cor);
  cardEl.style.background = estilo.background;
  cardEl.style.borderLeft = estilo.borderLeft;
}

function colunaDaLista(listaEl) {
  return listaEl?.closest?.("[data-stage-id]") || null;
}

/**
 * Atualiza contagem e total monetário da coluna por delta (colunas podem
 * estar paginadas — não recalcular a partir do DOM).
 */
function ajustarMetadadosColuna(colunaEl, deltaCards, deltaValor = 0) {
  if (!colunaEl) return;
  const countAtual = Number(colunaEl.dataset.count) || 0;
  const valorAtual = Number(colunaEl.dataset.valorTotal) || 0;
  const novoCount = Math.max(0, countAtual + deltaCards);
  const novoValor = Math.max(0, valorAtual + deltaValor);
  colunaEl.dataset.count = String(novoCount);
  colunaEl.dataset.valorTotal = String(novoValor);

  const contador = colunaEl.querySelector(".crm-coluna-count");
  if (contador) contador.textContent = String(novoCount);

  let totalEl = colunaEl.querySelector(".crm-coluna-valor");
  if (novoValor > 0) {
    if (!totalEl) {
      const lista = colunaEl.querySelector("[data-lista-stage]");
      totalEl = el("p", {
        class: "crm-coluna-valor font-mono text-[11px] text-cinza px-1 -mt-1 shrink-0",
      });
      if (lista) colunaEl.insertBefore(totalEl, lista);
      else colunaEl.append(totalEl);
    }
    totalEl.textContent = formatarValor(novoValor);
  } else if (totalEl) {
    totalEl.remove();
  }
}

function aplicarMoveOtimistaUi(evt) {
  const cards = cardsDoEvento(evt);
  const colunaOrigem = colunaDaLista(evt.from);
  const colunaDestino = colunaDaLista(evt.to);
  const corOrigem = corDaListaStage(evt.from);
  const corDestino = corDaListaStage(evt.to);
  let valor = 0;
  for (const card of cards) {
    valor += Number(card?.dataset?.value) || 0;
    aplicarCorCard(card, corDestino);
  }
  ajustarMetadadosColuna(colunaOrigem, -cards.length, -valor);
  ajustarMetadadosColuna(colunaDestino, cards.length, valor);
  return { colunaOrigem, colunaDestino, valor, corOrigem, cards };
}

function reverterMoveOtimistaUi(evt, meta) {
  const cards = meta?.cards || cardsDoEvento(evt);
  const ok = reverterCardsKanban(evt);
  if (!meta) return ok;
  const cor = meta.corOrigem || corDaListaStage(evt.from);
  for (const card of cards) aplicarCorCard(card, cor);
  ajustarMetadadosColuna(meta.colunaDestino, -cards.length, -meta.valor);
  ajustarMetadadosColuna(meta.colunaOrigem, cards.length, meta.valor);
  return ok;
}

function marcarCardEmMovimento(cardEl, ativo) {
  if (!cardEl) return;
  if (ativo) {
    cardEl.dataset.moving = "1";
    cardEl.style.pointerEvents = "none";
    cardEl.style.opacity = "0.85";
  } else {
    delete cardEl.dataset.moving;
    cardEl.style.pointerEvents = "";
    cardEl.style.opacity = "";
  }
}

/**
 * Opções comuns do Sortable nas listas de cards (leads/negócios),
 * com MultiDrag (Ctrl/Cmd + clique para selecionar vários).
 */
function opcoesSortableCards({ group, draggable, onMoverLote, recarregar }) {
  return {
    group,
    animation: 150,
    ghostClass: "opacity-40",
    draggable,
    filter: ".crm-mostrar-mais, .crm-btn-card-acao",
    multiDrag: true,
    multiDragKey: MULTI_DRAG_KEY,
    selectedClass: "crm-card-selecionado",
    onEnd: async (evt) => {
      if (evt.from === evt.to) return;

      const cards = cardsDoEvento(evt);
      const stageDestino = Number(evt.to.dataset.listaStage);
      if (!stageDestino || !cards.length) return;

      const meta = aplicarMoveOtimistaUi(evt);
      for (const card of cards) marcarCardEmMovimento(card, true);

      const perdidoDestino = evt.to.dataset.stageLost === "1";
      const perdidoOrigem = evt.from.dataset.stageLost === "1";
      const payload = { stage_id: stageDestino };

      try {
        if (perdidoDestino && !perdidoOrigem) {
          const motivo = await pedirMotivoPerda();
          if (!motivo) {
            const ok = reverterMoveOtimistaUi(evt, meta);
            if (!ok && typeof recarregar === "function") await recarregar();
            return;
          }
          payload.lost_reason = motivo;
        }

        await Promise.all(cards.map((card) => onMoverLote(card, payload)));
        limparSelecaoCardsKanban();
      } catch (erro) {
        setStatus(erro.message || "Falha ao mover card(s)");
        const ok = reverterMoveOtimistaUi(evt, meta);
        if (!ok && typeof recarregar === "function") await recarregar();
      } finally {
        for (const card of cards) marcarCardEmMovimento(card, false);
      }
    },
  };
}

function destruirSortablesLeads() {
  sortableColunasLeads?.destroy();
  sortableColunasLeads = null;
  for (const s of sortablesCardsLeads.values()) s.destroy();
  sortablesCardsLeads.clear();
}

async function carregarKanbanLeads(search = buscaLeadsAtual) {
  if (carregando) return;
  carregando = true;
  setStatus("Carregando leads…");
  destruirSortablesLeads();
  renderSkeletonKanban("#crm-kanban-leads");
  try {
    const q = String(search || "").trim();
    const caminhoPipeline = q
      ? `/api/crm/pipeline?kind=lead&search=${encodeURIComponent(q)}`
      : "/api/crm/pipeline?kind=lead";
    const [pipeline, stages] = await Promise.all([
      api(caminhoPipeline),
      api("/api/crm/pipeline-stages?kind=lead"),
    ]);
    estagiosLeads = stages.data || [];
    const stagesData = pipeline.data || [];
    renderizarKanbanLeads(stagesData);
    const total = stagesData.reduce(
      (s, st) => s + (st.leads?.length || 0),
      0,
    );
    if (q) {
      setStatus(total === 1 ? "1 lead encontrado" : `${total} leads encontrados`);
    } else {
      setStatus(total === 1 ? "1 lead" : `${total} leads`);
    }
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar leads");
    renderizarKanbanLeads([]);
  } finally {
    carregando = false;
  }
}

function renderizarKanbanLeads(stages) {
  const kanban = $("#crm-kanban-leads");
  if (!kanban) return;
  kanban.innerHTML = "";
  kanban.removeAttribute("role");
  kanban.removeAttribute("aria-label");

  for (const stage of stages) {
    kanban.append(montarColunaLead(stage));
  }

  kanban.append(
    el(
      "button",
      {
        type: "button",
        class:
          "flex-none w-64 self-start h-fit border border-dashed border-linha rounded-2xl px-4 py-6 text-sm text-cinza hover:border-vekta hover:text-vekta transition-colors",
        onclick: () => abrirModalColunaLead(null),
      },
      el("iconify-icon", { noobserver: "", icon: "lucide:plus", class: "text-lg mb-1" }),
      el("span", { class: "block" }, "Nova coluna"),
    ),
  );

  if (typeof Sortable !== "undefined") {
    sortableColunasLeads = Sortable.create(kanban, {
      animation: 150,
      draggable: "[data-stage-id]",
      handle: ".crm-coluna-handle",
      ghostClass: "opacity-40",
      filter: "button",
      onEnd: async () => {
        const ordered_ids = [...kanban.querySelectorAll("[data-stage-id]")].map(
          (n) => Number(n.dataset.stageId),
        );
        try {
          await api("/api/crm/pipeline-stages/order", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "lead", ordered_ids }),
          });
        } catch (erro) {
          setStatus(erro.message || "Falha ao reordenar colunas");
          await carregarKanbanLeads();
        }
      },
    });
  }

  animarEntrada(kanban.querySelectorAll("[data-stage-id]"));
}

function montarColunaLead(stage) {
  const leads = stage.leads || [];
  const cor = stage.color || "#6b7280";
  const totalValor = leads.reduce((soma, l) => soma + (Number(l.value) || 0), 0);

  const lista = el("div", {
    class: "flex flex-col gap-2 min-h-0 flex-1 overflow-y-auto",
    "data-lista-stage": String(stage.id),
    "data-stage-lost": stage.is_lost ? "1" : "0",
    "data-stage-color": cor,
  });

  preencherListaPaginada(lista, leads, (lead) => cartaoLead(lead, cor));

  const header = el(
    "div",
    {
      class:
        "crm-coluna-handle shrink-0 flex items-center justify-between gap-2 px-1 pb-1 cursor-grab active:cursor-grabbing",
    },
    el(
      "div",
      { class: "flex items-center gap-2 min-w-0" },
      el("span", {
        class: "w-2.5 h-2.5 rounded-full flex-none",
        style: `background:${cor}`,
      }),
      el("h3", { class: "font-display text-sm font-semibold truncate" }, stage.name),
    ),
    el(
      "div",
      { class: "flex items-center gap-1 flex-none" },
      el(
        "span",
        { class: "crm-coluna-count font-mono text-[11px] text-cinza" },
        String(leads.length),
      ),
      el(
        "button",
        {
          type: "button",
          class:
            "inline-flex items-center justify-center w-6 h-6 rounded-full text-cinza hover:bg-superficie hover:text-tinta",
          title: "Opções da coluna",
          onclick: (e) => {
            e.stopPropagation();
            abrirMenu(e.currentTarget, [
              itemMenu("Editar coluna…", () => abrirModalColunaLead(stage)),
              itemMenu(
                "Excluir",
                async () => {
                  if (!confirm(`Excluir a coluna "${stage.name}"? Só funciona se estiver vazia.`))
                    return;
                  try {
                    await api(`/api/crm/pipeline-stages/${stage.id}`, { method: "DELETE" });
                    await carregarKanbanLeads();
                  } catch (erro) {
                    setStatus(erro.message || "Falha ao excluir coluna");
                  }
                },
                true,
              ),
            ]);
          },
        },
        el("iconify-icon", { noobserver: "", icon: "lucide:ellipsis", class: "text-sm" }),
      ),
    ),
  );

  const colunaEl = el(
    "div",
    {
      class:
        "flex-none w-72 h-full min-h-0 bg-fundo/60 border border-linha rounded-2xl p-3 flex flex-col gap-2",
      "data-stage-id": String(stage.id),
      "data-count": String(leads.length),
      "data-valor-total": String(totalValor),
      style: `border-top: 3px solid ${cor}`,
    },
    header,
    totalValor > 0
      ? el(
          "p",
          {
            class: "crm-coluna-valor font-mono text-[11px] text-cinza px-1 -mt-1 shrink-0",
          },
          formatarValor(totalValor),
        )
      : null,
    lista,
  );

  if (typeof Sortable !== "undefined") {
    const s = Sortable.create(
      lista,
      opcoesSortableCards({
        group: "crm-leads",
        draggable: "[data-lead-id]",
        recarregar: () => carregarKanbanLeads(),
        onMoverLote: (card, payload) => {
          const leadId = Number(card.dataset.leadId);
          if (!leadId) return Promise.resolve();
          return api(`/api/crm/leads/${leadId}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        },
      }),
    );
    sortablesCardsLeads.set(stage.id, s);
  }

  return colunaEl;
}

function cartaoLead(lead, cor) {
  const estilo = estiloCardCor(cor);
  const card = el(
    "div",
    {
      class:
        "rounded-xl p-3 flex flex-col gap-1 cursor-grab active:cursor-grabbing shadow-sm hover:brightness-95 transition-[filter] border border-transparent",
      style: `background:${estilo.background}; border-left:${estilo.borderLeft}`,
      "data-lead-id": String(lead.id),
      "data-value": String(Number(lead.value) || 0),
      role: "button",
      tabindex: "0",
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          limparSelecaoCardsKanban();
          abrirModalLead(lead.id);
        }
      },
    },
    el(
      "div",
      { class: "flex items-start justify-between gap-2" },
      el(
        "p",
        { class: "text-sm font-medium text-tinta leading-snug min-w-0" },
        lead.name,
      ),
      acoesRapidasCard(
        { lead_id: lead.id },
        `Lead: ${lead.name || lead.title || `#${lead.id}`}`,
      ),
    ),
    el(
      "p",
      { class: "text-xs text-cinza truncate" },
      lead.organization_name || lead.email || "—",
    ),
    ...linhasCanalCard({
      mobile: lead.mobile,
      instagram: lead.instagram,
    }),
    lead.value != null
      ? el(
          "p",
          { class: "text-xs font-mono text-tinta tabular-nums" },
          formatarValor(lead.value),
        )
      : null,
    metaDiasCard(lead, {
      comCadastro: true,
      origem: lead.source?.name || null,
    }),
  );
  ligarCliqueCardKanban(card, () => abrirModalLead(lead.id));
  return card;
}

function abrirModalColunaLead(stage) {
  const editando = Boolean(stage);
  const inputNome = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    value: stage?.name || "",
    required: "required",
    placeholder: "Nome da coluna",
  });
  const inputCor = el("input", {
    type: "color",
    class: "w-14 h-10 rounded-xl border border-linha bg-fundo cursor-pointer p-1",
    value: stage?.color || "#3b82f6",
  });
  const selectStatus = selectDe(STATUS_ESTAGIO, statusDoEstagio(stage));
  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    editando ? "Salvar" : "Criar coluna",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        const payload = {
          name: inputNome.value.trim(),
          color: inputCor.value,
          status: selectStatus.value,
        };
        if (!payload.name) {
          erroEl.textContent = "Informe o nome.";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
          return;
        }
        try {
          if (editando) {
            await api(`/api/crm/pipeline-stages/${stage.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } else {
            await api("/api/crm/pipeline-stages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, kind: "lead" }),
            });
          }
          fecharModal();
          await carregarKanbanLeads();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar coluna";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    campoLabel("Nome", inputNome),
    el(
      "div",
      { class: "grid grid-cols-[auto_1fr] gap-3 items-end" },
      campoLabel("Cor", inputCor),
      campoLabel("Status", selectStatus),
    ),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-1" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      btnSalvar,
    ),
  );

  abrirModal({
    eyebrow: "CRM · Coluna",
    titulo: editando ? "Editar coluna" : "Nova coluna",
    conteudo: form,
  });
  inputNome.focus();
}

// ==========================================================
// Kanban de Negócios (pipeline colorido)
// ==========================================================

function destruirSortablesDeals() {
  sortableColunasDeals?.destroy();
  sortableColunasDeals = null;
  for (const s of sortablesCardsDeals.values()) s.destroy();
  sortablesCardsDeals.clear();
}

async function carregarPipeline(search = buscaNegociosAtual) {
  if (carregando) return;
  carregando = true;
  setStatus("Carregando negócios…");
  destruirSortablesDeals();
  renderSkeletonKanban("#crm-kanban-negocios");
  try {
    const q = String(search || "").trim();
    const caminhoPipeline = q
      ? `/api/crm/pipeline?kind=deal&search=${encodeURIComponent(q)}`
      : "/api/crm/pipeline?kind=deal";
    const [pipeline, stages] = await Promise.all([
      api(caminhoPipeline),
      api("/api/crm/pipeline-stages?kind=deal"),
    ]);
    estagios = stages.data || [];
    const stagesData = pipeline.data || [];
    renderizarKanbanNegocios(stagesData);
    const total = stagesData.reduce(
      (soma, st) => soma + (st.deals?.length || 0),
      0,
    );
    if (q) {
      setStatus(
        total === 1 ? "1 negócio encontrado" : `${total} negócios encontrados`,
      );
    } else {
      setStatus(total === 1 ? "1 negócio" : `${total} negócios`);
    }
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar negócios");
    renderizarKanbanNegocios([]);
  } finally {
    carregando = false;
  }
}

function renderizarKanbanNegocios(stages) {
  const kanban = $("#crm-kanban-negocios");
  if (!kanban) return;
  kanban.innerHTML = "";
  kanban.removeAttribute("role");
  kanban.removeAttribute("aria-label");

  for (const stage of stages) {
    kanban.append(montarColunaDeal(stage));
  }

  kanban.append(
    el(
      "button",
      {
        type: "button",
        class:
          "flex-none w-64 self-start h-fit border border-dashed border-linha rounded-2xl px-4 py-6 text-sm text-cinza hover:border-vekta hover:text-vekta transition-colors",
        onclick: () => abrirModalEstagio(null),
      },
      el("iconify-icon", { noobserver: "", icon: "lucide:plus", class: "text-lg mb-1" }),
      el("span", { class: "block" }, "Nova coluna"),
    ),
  );

  if (typeof Sortable !== "undefined") {
    sortableColunasDeals = Sortable.create(kanban, {
      animation: 150,
      draggable: "[data-stage-id]",
      handle: ".crm-coluna-handle",
      ghostClass: "opacity-40",
      filter: "button",
      onEnd: async () => {
        const ordered_ids = [...kanban.querySelectorAll("[data-stage-id]")].map(
          (n) => Number(n.dataset.stageId),
        );
        try {
          await api("/api/crm/pipeline-stages/order", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "deal", ordered_ids }),
          });
        } catch (erro) {
          setStatus(erro.message || "Falha ao reordenar estágios");
          await carregarPipeline();
        }
      },
    });
  }

  animarEntrada(kanban.querySelectorAll("[data-stage-id]"));
}

function montarColunaDeal(stage) {
  const deals = stage.deals || [];
  const cor = stage.color || "#6b7280";
  const totalValor = deals.reduce((soma, d) => soma + (Number(d.value) || 0), 0);

  const lista = el("div", {
    class: "flex flex-col gap-2 min-h-0 flex-1 overflow-y-auto",
    "data-lista-stage": String(stage.id),
    "data-stage-lost": stage.is_lost ? "1" : "0",
    "data-stage-color": cor,
  });

  preencherListaPaginada(lista, deals, (deal) => cartaoDeal(deal, cor));

  const header = el(
    "div",
    {
      class:
        "crm-coluna-handle shrink-0 flex items-center justify-between gap-2 px-1 pb-1 cursor-grab active:cursor-grabbing",
    },
    el(
      "div",
      { class: "flex items-center gap-2 min-w-0" },
      el("span", {
        class: "w-2.5 h-2.5 rounded-full flex-none",
        style: `background:${cor}`,
      }),
      el("h3", { class: "font-display text-sm font-semibold truncate" }, stage.name),
    ),
    el(
      "div",
      { class: "flex items-center gap-1 flex-none" },
      el(
        "span",
        { class: "crm-coluna-count font-mono text-[11px] text-cinza" },
        String(deals.length),
      ),
      el(
        "button",
        {
          type: "button",
          class:
            "inline-flex items-center justify-center w-6 h-6 rounded-full text-cinza hover:bg-superficie hover:text-tinta",
          title: "Opções do estágio",
          onclick: (e) => {
            e.stopPropagation();
            abrirMenu(e.currentTarget, [
              itemMenu("Editar estágio…", () => abrirModalEstagio(stage)),
              itemMenu(
                "Excluir",
                async () => {
                  if (!confirm(`Excluir o estágio "${stage.name}"? Só funciona se estiver vazio.`))
                    return;
                  try {
                    await api(`/api/crm/pipeline-stages/${stage.id}`, { method: "DELETE" });
                    await carregarPipeline();
                  } catch (erro) {
                    setStatus(erro.message || "Falha ao excluir estágio");
                  }
                },
                true,
              ),
            ]);
          },
        },
        el("iconify-icon", { noobserver: "", icon: "lucide:ellipsis", class: "text-sm" }),
      ),
    ),
  );

  const colunaEl = el(
    "div",
    {
      class:
        "flex-none w-72 h-full min-h-0 bg-fundo/60 border border-linha rounded-2xl p-3 flex flex-col gap-2",
      "data-stage-id": String(stage.id),
      "data-count": String(deals.length),
      "data-valor-total": String(totalValor),
      style: `border-top: 3px solid ${cor}`,
    },
    header,
    totalValor > 0
      ? el(
          "p",
          {
            class: "crm-coluna-valor font-mono text-[11px] text-cinza px-1 -mt-1 shrink-0",
          },
          formatarValor(totalValor),
        )
      : null,
    lista,
  );

  if (typeof Sortable !== "undefined") {
    const s = Sortable.create(
      lista,
      opcoesSortableCards({
        group: "crm-deals",
        draggable: "[data-deal-id]",
        recarregar: () => carregarPipeline(),
        onMoverLote: (card, payload) => {
          const dealId = Number(card.dataset.dealId);
          if (!dealId) return Promise.resolve();
          return api(`/api/crm/deals/${dealId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        },
      }),
    );
    sortablesCardsDeals.set(stage.id, s);
  }

  return colunaEl;
}

function cartaoDeal(deal, cor) {
  const estilo = estiloCardCor(cor);
  const mobile = deal.contact?.mobile || deal.contact?.phone || "";
  const instagram = deal.contact?.instagram || "";
  const card = el(
    "div",
    {
      class:
        "rounded-xl p-3 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing shadow-sm hover:brightness-95 transition-[filter] border border-transparent",
      style: `background:${estilo.background}; border-left:${estilo.borderLeft}`,
      "data-deal-id": String(deal.id),
      "data-value": String(Number(deal.value) || 0),
      role: "button",
      tabindex: "0",
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          limparSelecaoCardsKanban();
          abrirModalDeal(deal.id);
        }
      },
    },
    el(
      "div",
      { class: "flex items-start justify-between gap-2" },
      el(
        "p",
        { class: "text-sm font-medium text-tinta leading-snug min-w-0" },
        deal.title,
      ),
      acoesRapidasCard(
        { deal_id: deal.id },
        `Negócio: ${deal.title || `#${deal.id}`}`,
      ),
    ),
    el(
      "p",
      { class: "text-xs text-cinza truncate" },
      deal.contact?.name || "Sem contato",
    ),
    ...linhasCanalCard({ mobile, instagram }),
    el(
      "span",
      { class: "font-mono text-xs text-tinta/80" },
      deal.value != null ? formatarValor(deal.value) : "",
    ),
    metaDiasCard(deal, {
      comCadastro: true,
      origem: deal.source?.name || null,
    }),
  );
  ligarCliqueCardKanban(card, () => abrirModalDeal(deal.id));
  return card;
}

function abrirModalEstagio(stage) {
  const editando = Boolean(stage);
  const inputNome = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    value: stage?.name || "",
    required: "required",
    placeholder: "Nome do estágio",
  });
  const inputCor = el("input", {
    type: "color",
    class: "w-14 h-10 rounded-xl border border-linha bg-fundo cursor-pointer p-1",
    value: stage?.color || "#6b7280",
  });
  const selectStatus = selectDe(STATUS_ESTAGIO, statusDoEstagio(stage));
  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    editando ? "Salvar" : "Criar estágio",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        const payload = {
          name: inputNome.value.trim(),
          color: inputCor.value,
          status: selectStatus.value,
        };
        if (!payload.name) {
          erroEl.textContent = "Informe o nome.";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
          return;
        }
        try {
          if (editando) {
            await api(`/api/crm/pipeline-stages/${stage.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } else {
            await api("/api/crm/pipeline-stages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, kind: "deal" }),
            });
          }
          fecharModal();
          await carregarPipeline();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar estágio";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    campoLabel("Nome", inputNome),
    el(
      "div",
      { class: "grid grid-cols-[auto_1fr] gap-3 items-end" },
      campoLabel("Cor", inputCor),
      campoLabel("Status", selectStatus),
    ),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-1" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      btnSalvar,
    ),
  );

  abrirModal({
    eyebrow: "CRM · Estágio",
    titulo: editando ? "Editar coluna" : "Nova coluna",
    conteudo: form,
  });
  inputNome.focus();
}

// ==========================================================
// Modais base + abas
// ==========================================================

let aoFecharModal = null;

function fecharModal() {
  const modal = $("#crm-modal");
  // O dropdown do select vive no body: precisa ser desmontado antes de remover o modal.
  destruirSelectsEm(modal);
  modal?.remove();
  document.removeEventListener("keydown", onEscModal, true);
  const cb = aoFecharModal;
  aoFecharModal = null;
  cb?.();
}

function onEscModal(e) {
  if (e.key !== "Escape") return;
  // Dropdown aberto consome o Esc: fecha só ele, não o modal por baixo.
  if (haSelectAberto()) return;
  fecharModal();
}

function abrirModal({ eyebrow, titulo, subtitulo, conteudo, tamanho = "normal" }) {
  fecharModal();
  const grande = tamanho === "grande";
  const painel = el(
    "div",
    {
      class: grande
        ? "bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-[min(1100px,96vw)] h-[min(90vh,900px)] flex flex-col overflow-hidden"
        : "bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-6",
      onclick: (e) => e.stopPropagation(),
    },
    el(
      "div",
      {
        class: grande
          ? "shrink-0 flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-linha"
          : "flex items-start justify-between gap-3 mb-4",
      },
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
            id: "crm-modal-titulo",
            class: "font-display text-xl font-semibold tracking-tight flex items-baseline gap-2 flex-wrap",
          },
          ...(Array.isArray(titulo) ? titulo : [titulo]),
        ),
        subtitulo
          ? el("p", { class: "text-xs text-cinza mt-1.5" }, subtitulo)
          : null,
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
    grande
      ? el(
          "div",
          { class: "flex-1 min-h-0 flex flex-col overflow-hidden p-5 sm:p-6" },
          conteudo,
        )
      : conteudo,
  );

  document.body.append(
    el(
      "div",
      {
        id: "crm-modal",
        class:
          "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "crm-modal-titulo",
        onclick: fecharModal,
      },
      painel,
    ),
  );
  document.addEventListener("keydown", onEscModal, true);
}

function montarAbasModal({
  abaDados,
  activities,
  tasks: tasksIniciais,
  vinculo,
  aoRegistrar,
  motivoPerda,
  chat = null,
}) {
  let abaAtiva = "dados";
  let tasks = Array.isArray(tasksIniciais) ? [...tasksIniciais] : [];
  const mostrarPerda = motivoPerda !== undefined;
  const mostrarChat = Boolean(chat?.whatsapp_jid);
  const painelDados = el("div", { class: "flex flex-col flex-1 min-h-0" }, abaDados);
  const painelHistorico = el("div", { class: "hidden flex flex-col flex-1 min-h-0 overflow-y-auto gap-3" });
  const painelNotas = el("div", { class: "hidden flex flex-col flex-1 min-h-0 gap-3" });
  const painelTarefas = el("div", { class: "hidden flex flex-col flex-1 min-h-0 gap-3" });
  const painelChat = mostrarChat
    ? el("div", { class: "hidden flex flex-col flex-1 min-h-0 gap-3" })
    : null;
  const painelPerda = mostrarPerda
    ? el(
        "div",
        { class: "hidden flex flex-col flex-1 min-h-0 overflow-y-auto gap-3" },
        el(
          "div",
          { class: "rounded-xl border border-linha bg-fundo px-4 py-3" },
          el(
            "p",
            { class: "font-mono text-[11px] uppercase tracking-wider text-cinza mb-2" },
            "Motivo da perda",
          ),
          el(
            "p",
            { class: "text-sm text-tinta whitespace-pre-wrap" },
            motivoPerda?.trim() || "Nenhum motivo registrado.",
          ),
        ),
      )
    : null;

  const historico = (activities || []).filter((a) => a.type !== "note");
  const notas = (activities || []).filter((a) => a.type === "note");

  function renderLista(alvo, itens, vazio) {
    alvo.innerHTML = "";
    if (!itens.length) {
      alvo.append(el("p", { class: "text-xs text-cinza-claro" }, vazio));
      return;
    }
    for (const atividade of itens) {
      const tipo = TIPOS_ACTIVITY[atividade.type] || TIPOS_ACTIVITY.note;
      alvo.append(
        el(
          "div",
          { class: "flex gap-2.5 items-start" },
          el(
            "span",
            {
              class:
                "flex-none inline-flex items-center justify-center w-7 h-7 rounded-full bg-vekta-suave text-vekta mt-0.5",
            },
            el("iconify-icon", { noobserver: "", icon: tipo.icone, class: "text-sm" }),
          ),
          el(
            "div",
            { class: "min-w-0 flex-1" },
            el("p", { class: "text-sm text-tinta" }, atividade.subject || tipo.rotulo),
            atividade.body
              ? el("p", { class: "text-xs text-cinza whitespace-pre-wrap" }, atividade.body)
              : null,
            el(
              "p",
              { class: "font-mono text-[10px] text-cinza-claro mt-0.5" },
              formatarData(atividade.created_at),
            ),
          ),
        ),
      );
    }
  }

  renderLista(painelHistorico, historico, "Nenhum evento no histórico.");

  const listaNotas = el("div", { class: "flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5" });
  renderLista(listaNotas, notas, "Nenhuma nota ainda.");
  const inputNota = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[3rem] resize-none`,
    placeholder: "Escrever uma nota…",
  });
  const erroNota = el("p", { class: "hidden text-xs text-alerta", role: "alert" });
  const btnNota = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO_PRIMARIO} shrink-0 px-4 py-2`,
      onclick: async () => {
        const corpo = inputNota.value.trim();
        if (!corpo) return;
        btnNota.disabled = true;
        erroNota.classList.add("hidden");
        try {
          await api("/api/crm/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "note", body: corpo, ...vinculo }),
          });
          await aoRegistrar();
        } catch (erro) {
          erroNota.textContent = erro.message || "Falha ao registrar nota";
          erroNota.classList.remove("hidden");
          btnNota.disabled = false;
        }
      },
    },
    "Salvar nota",
  );
  painelNotas.append(
    listaNotas,
    erroNota,
    el(
      "div",
      { class: "shrink-0 flex items-end gap-2 pt-3 border-t border-linha" },
      el("div", { class: "flex-1 min-w-0" }, inputNota),
      btnNota,
    ),
  );

  // —— Aba Tarefas ——
  const listaTarefas = el("div", { class: "flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5" });
  const erroTarefa = el("p", { class: "hidden text-xs text-alerta", role: "alert" });
  const inputTituloTarefa = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    placeholder: "Título da tarefa",
    required: "required",
  });
  const inputDescTarefa = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[2.5rem] resize-y`,
    placeholder: "Descrição (opcional)",
  });
  const inputDueTarefa = el("input", {
    type: "datetime-local",
    class: CLASSE_INPUT,
    required: "required",
  });

  function ordenarTasks(lista) {
    return [...lista].sort((a, b) => {
      const aDone = a.done_at ? 1 : 0;
      const bDone = b.done_at ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(a.due_at) - new Date(b.due_at);
    });
  }

  function renderListaTarefas() {
    listaTarefas.innerHTML = "";
    const ordenadas = ordenarTasks(tasks);
    if (!ordenadas.length) {
      listaTarefas.append(
        el("p", { class: "text-xs text-cinza-claro" }, "Nenhuma tarefa ainda."),
      );
      return;
    }
    for (const tarefa of ordenadas) {
      const concluida = Boolean(tarefa.done_at);
      const rotulo = rotuloProximaTarefa(tarefa.due_at);
      const btnToggle = el(
        "button",
        {
          type: "button",
          class: `${CLASSE_BOTAO} text-xs px-2.5 py-1`,
          title: concluida ? "Reabrir" : "Concluir",
          onclick: async () => {
            btnToggle.disabled = true;
            try {
              const resp = await api(`/api/crm/tasks/${tarefa.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ done: !concluida }),
              });
              const atualizada = resp.data;
              tasks = tasks.map((t) => (t.id === atualizada.id ? atualizada : t));
              renderListaTarefas();
            } catch (erro) {
              erroTarefa.textContent = erro.message || "Falha ao atualizar tarefa";
              erroTarefa.classList.remove("hidden");
              btnToggle.disabled = false;
            }
          },
        },
        concluida ? "Reabrir" : "Concluir",
      );
      const btnExcluir = el(
        "button",
        {
          type: "button",
          class: `${CLASSE_BOTAO} text-xs px-2.5 py-1 text-alerta border-alerta/40`,
          title: "Excluir",
          onclick: async () => {
            if (!confirm("Excluir esta tarefa?")) return;
            btnExcluir.disabled = true;
            try {
              await api(`/api/crm/tasks/${tarefa.id}`, { method: "DELETE" });
              tasks = tasks.filter((t) => t.id !== tarefa.id);
              renderListaTarefas();
            } catch (erro) {
              erroTarefa.textContent = erro.message || "Falha ao excluir tarefa";
              erroTarefa.classList.remove("hidden");
              btnExcluir.disabled = false;
            }
          },
        },
        "Excluir",
      );

      listaTarefas.append(
        el(
          "div",
          {
            class: `rounded-xl border border-linha bg-fundo px-3 py-2.5 flex flex-col gap-1 ${
              concluida ? "opacity-60" : ""
            }`,
          },
          el(
            "div",
            { class: "flex items-start justify-between gap-2" },
            el(
              "p",
              {
                class: `text-sm text-tinta font-medium min-w-0 ${
                  concluida ? "line-through" : ""
                }`,
              },
              tarefa.title,
            ),
            el("div", { class: "flex gap-1.5 flex-none" }, btnToggle, btnExcluir),
          ),
          tarefa.description
            ? el(
                "p",
                { class: "text-xs text-cinza whitespace-pre-wrap" },
                tarefa.description,
              )
            : null,
          el(
            "p",
            {
              class: `font-mono text-[10px] mt-0.5 ${
                !concluida && rotulo?.atrasada ? "text-alerta" : "text-cinza-claro"
              }`,
            },
            [
              formatarData(tarefa.due_at),
              !concluida && rotulo ? `· ${rotulo.texto}` : null,
              concluida ? "· Concluída" : null,
            ]
              .filter(Boolean)
              .join(" "),
          ),
        ),
      );
    }
  }

  const btnCriarTarefa = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO_PRIMARIO} text-xs px-3 py-1.5`,
      onclick: async () => {
        erroTarefa.classList.add("hidden");
        const title = inputTituloTarefa.value.trim();
        const dueLocal = inputDueTarefa.value;
        if (!title || !dueLocal) {
          erroTarefa.textContent = "Informe título e data/hora.";
          erroTarefa.classList.remove("hidden");
          return;
        }
        btnCriarTarefa.disabled = true;
        try {
          const due = new Date(dueLocal);
          const resp = await api("/api/crm/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: inputDescTarefa.value.trim() || null,
              due_at: due.toISOString(),
              ...vinculo,
            }),
          });
          tasks = [...tasks, resp.data];
          inputTituloTarefa.value = "";
          inputDescTarefa.value = "";
          inputDueTarefa.value = "";
          renderListaTarefas();
        } catch (erro) {
          erroTarefa.textContent = erro.message || "Falha ao criar tarefa";
          erroTarefa.classList.remove("hidden");
        } finally {
          btnCriarTarefa.disabled = false;
        }
      },
    },
    "Adicionar tarefa",
  );

  renderListaTarefas();
  painelTarefas.append(
    listaTarefas,
    el(
      "div",
      { class: "shrink-0 flex flex-col gap-2 pt-3 border-t border-linha" },
      el(
        "div",
        { class: "grid grid-cols-1 sm:grid-cols-2 gap-2" },
        campoLabel("Título", inputTituloTarefa),
        campoLabel("Data e hora", inputDueTarefa),
      ),
      campoLabel("Descrição", inputDescTarefa),
      erroTarefa,
      el("div", { class: "flex justify-end" }, btnCriarTarefa),
    ),
  );

  // —— Aba Chat WhatsApp ——
  let chatCarregado = false;
  const listaChat = el("div", {
    class:
      "flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 rounded-xl border border-linha bg-fundo p-3",
  });
  const erroChat = el("p", { class: "hidden text-xs text-alerta shrink-0", role: "alert" });
  const inputChat = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[2.75rem] max-h-28 resize-none`,
    rows: "1",
    placeholder: chat?.whatsapp_jid
      ? "Escrever mensagem…"
      : "Sem JID WhatsApp neste card — não é possível enviar.",
  });
  if (!chat?.whatsapp_jid) inputChat.setAttribute("disabled", "disabled");

  function bolhaChat(msg) {
    const outbound = msg.direction === "outbound";
    const quando = formatarData(msg.wa_timestamp || msg.created_at);
    return el(
      "div",
      { class: `flex ${outbound ? "justify-end" : "justify-start"}` },
      el(
        "div",
        {
          class: `max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
            outbound
              ? "bg-vekta text-white rounded-br-md"
              : "bg-superficie border border-linha text-tinta rounded-bl-md"
          }`,
        },
        el(
          "p",
          { class: "whitespace-pre-wrap break-words" },
          msg.body || (msg.has_media ? "[mídia]" : ""),
        ),
        el(
          "p",
          {
            class: `font-mono text-[10px] mt-1 ${outbound ? "text-white/70" : "text-cinza-claro"}`,
          },
          quando,
        ),
      ),
    );
  }

  async function carregarChat() {
    if (!painelChat) return;
    erroChat.classList.add("hidden");
    listaChat.replaceChildren(
      el("p", { class: "text-xs text-cinza-claro self-center py-6" }, "Carregando conversa…"),
    );
    try {
      const params = new URLSearchParams();
      if (chat.lead_id) params.set("lead_id", String(chat.lead_id));
      if (chat.deal_id) params.set("deal_id", String(chat.deal_id));
      if (chat.whatsapp_jid) params.set("jid", chat.whatsapp_jid);
      const resp = await api(`/api/crm/whatsapp/messages?${params.toString()}`);
      const msgs = Array.isArray(resp.data) ? resp.data : [];
      listaChat.replaceChildren();
      if (!msgs.length) {
        listaChat.append(
          el(
            "p",
            { class: "text-xs text-cinza-claro self-center py-6" },
            "Nenhuma mensagem WhatsApp para este card ainda.",
          ),
        );
      } else {
        for (const msg of msgs) listaChat.append(bolhaChat(msg));
        listaChat.scrollTop = listaChat.scrollHeight;
      }
      chatCarregado = true;
    } catch (erro) {
      listaChat.replaceChildren();
      erroChat.textContent = erro.message || "Falha ao carregar chat";
      erroChat.classList.remove("hidden");
    }
  }

  const btnEnviarChat = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO_PRIMARIO} shrink-0 px-4 py-2 self-end`,
      onclick: async () => {
        const texto = inputChat.value.trim();
        if (!texto || !chat?.whatsapp_jid) return;
        erroChat.classList.add("hidden");
        btnEnviarChat.disabled = true;
        try {
          await api("/api/crm/whatsapp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: chat.whatsapp_jid,
              message: texto,
              contact_name: chat.contact_name || null,
            }),
          });
          inputChat.value = "";
          await carregarChat();
        } catch (erro) {
          erroChat.textContent = erro.message || "Falha ao enviar";
          erroChat.classList.remove("hidden");
        } finally {
          btnEnviarChat.disabled = !chat?.whatsapp_jid;
        }
      },
    },
    "Enviar",
  );
  if (!chat?.whatsapp_jid) btnEnviarChat.disabled = true;

  if (painelChat) {
    painelChat.append(
      el(
        "div",
        { class: "shrink-0 flex items-center justify-between gap-2" },
        el(
          "p",
          { class: "text-sm text-cinza truncate" },
          chat.whatsapp_jid
            ? `Conversa · ${chat.whatsapp_jid}`
            : "Sem vínculo WhatsApp neste card.",
        ),
        el(
          "button",
          {
            type: "button",
            class: `${CLASSE_BOTAO} text-xs px-2.5 py-1 inline-flex items-center gap-1`,
            onclick: () => carregarChat(),
          },
          el("iconify-icon", {
            noobserver: "",
            icon: "lucide:refresh-cw",
            class: "text-[13px]",
            "aria-hidden": "true",
          }),
          "Atualizar",
        ),
      ),
      listaChat,
      erroChat,
      el(
        "div",
        { class: "shrink-0 flex items-end gap-2 pt-3 border-t border-linha" },
        el("div", { class: "flex-1 min-w-0" }, inputChat),
        btnEnviarChat,
      ),
    );
  }

  const btnDados = el("button", { type: "button", role: "tab" }, "Dados");
  const btnHist = el("button", { type: "button", role: "tab" }, "Histórico");
  const btnNotas = el("button", { type: "button", role: "tab" }, "Notas");
  const btnTarefas = el("button", { type: "button", role: "tab" }, "Tarefas");
  const btnChat = mostrarChat
    ? el("button", { type: "button", role: "tab" }, "Chat")
    : null;
  const btnPerda = mostrarPerda
    ? el("button", { type: "button", role: "tab" }, "Perda")
    : null;

  function syncAbas() {
    const abas = [
      [btnDados, "dados"],
      [btnHist, "historico"],
      [btnNotas, "notas"],
      [btnTarefas, "tarefas"],
    ];
    if (btnChat) abas.push([btnChat, "chat"]);
    if (btnPerda) abas.push([btnPerda, "perda"]);
    for (const [btn, nome] of abas) {
      btn.className = `px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${pillToggle(abaAtiva === nome)}`;
      btn.setAttribute("aria-selected", String(abaAtiva === nome));
    }
    painelDados.classList.toggle("hidden", abaAtiva !== "dados");
    painelHistorico.classList.toggle("hidden", abaAtiva !== "historico");
    painelNotas.classList.toggle("hidden", abaAtiva !== "notas");
    painelTarefas.classList.toggle("hidden", abaAtiva !== "tarefas");
    if (painelChat) painelChat.classList.toggle("hidden", abaAtiva !== "chat");
    if (painelPerda) painelPerda.classList.toggle("hidden", abaAtiva !== "perda");
  }

  btnDados.onclick = () => {
    abaAtiva = "dados";
    syncAbas();
  };
  btnHist.onclick = () => {
    abaAtiva = "historico";
    syncAbas();
  };
  btnNotas.onclick = () => {
    abaAtiva = "notas";
    syncAbas();
  };
  btnTarefas.onclick = () => {
    abaAtiva = "tarefas";
    syncAbas();
  };
  if (btnChat) {
    btnChat.onclick = () => {
      abaAtiva = "chat";
      syncAbas();
      if (!chatCarregado) void carregarChat();
    };
  }
  if (btnPerda) {
    btnPerda.onclick = () => {
      abaAtiva = "perda";
      syncAbas();
    };
  }
  syncAbas();

  return el(
    "div",
    { class: "flex flex-col flex-1 min-h-0 gap-3 h-full" },
    el(
      "div",
      {
        class:
          "shrink-0 inline-flex self-start items-center rounded-full border border-linha bg-fundo p-1 flex-wrap gap-0.5",
        role: "tablist",
      },
      btnDados,
      btnHist,
      btnNotas,
      btnTarefas,
      btnChat,
      btnPerda,
    ),
    painelDados,
    painelHistorico,
    painelNotas,
    painelTarefas,
    painelChat,
    painelPerda,
  );
}

/** Modal para informar motivo da perda. Resolve com o texto ou null se cancelar. */
function pedirMotivoPerda() {
  return new Promise((resolve) => {
    let concluido = false;
    const concluir = (valor) => {
      if (concluido) return;
      concluido = true;
      aoFecharModal = null;
      fecharModal();
      resolve(valor);
    };

    const textarea = el("textarea", {
      class: `${CLASSE_INPUT} min-h-[5rem] resize-y`,
      placeholder: "Por que este card foi perdido?",
      required: "required",
    });
    const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
    const btnConfirmar = el(
      "button",
      { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
      "Confirmar perda",
    );

    const form = el(
      "form",
      {
        class: "flex flex-col gap-4",
        onsubmit: (e) => {
          e.preventDefault();
          const motivo = textarea.value.trim();
          if (!motivo) {
            erroEl.textContent = "Informe o motivo da perda.";
            erroEl.classList.remove("hidden");
            return;
          }
          concluir(motivo.slice(0, 190));
        },
      },
      el(
        "p",
        { class: "text-sm text-cinza" },
        "Ao mover para uma coluna do tipo Perdido, registre o motivo. Isso ajuda nas análises futuras.",
      ),
      campoLabel("Motivo da perda", textarea),
      erroEl,
      el(
        "div",
        { class: "flex justify-end gap-2 pt-1" },
        el(
          "button",
          {
            type: "button",
            class: CLASSE_BOTAO,
            onclick: () => concluir(null),
          },
          "Cancelar",
        ),
        btnConfirmar,
      ),
    );

    // Abrir primeiro (fecha modal anterior sem callback), depois registrar cancelamento.
    abrirModal({
      eyebrow: "CRM · Perda",
      titulo: "Motivo da perda",
      conteudo: form,
    });
    aoFecharModal = () => concluir(null);
    textarea.focus();
  });
}

// ==========================================================
// Modal novo lead / detalhe lead / deal
// ==========================================================

function abrirModalNovoLead() {
  const inputs = {
    name: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      required: "required",
      placeholder: "Nome da pessoa",
    }),
    title: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      placeholder: "Ex.: João — WhatsApp (opcional)",
    }),
    email: el("input", { type: "email", class: CLASSE_INPUT, placeholder: "email@exemplo.com" }),
    mobile: el("input", { type: "text", class: CLASSE_INPUT, placeholder: "(14) 99999-9999" }),
    instagram: el("input", { type: "text", class: CLASSE_INPUT, placeholder: "@perfil" }),
    organization_name: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      placeholder: "Nome da empresa (opcional)",
    }),
    value: el("input", {
      type: "number",
      step: "0.01",
      min: "0",
      class: CLASSE_INPUT,
      placeholder: "0,00",
    }),
    source_id: selectDe(
      [{ value: "", label: "Sem origem" }, ...origens.map((s) => ({ value: s.id, label: s.name }))],
      "",
    ),
  };

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el("button", { type: "submit", class: CLASSE_BOTAO_PRIMARIO }, "Criar lead");

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
            name: inputs.name.value.trim(),
            title: inputs.title.value.trim() || undefined,
            email: inputs.email.value.trim() || undefined,
            mobile: inputs.mobile.value.trim() || undefined,
            instagram: inputs.instagram.value.trim() || undefined,
            organization_name: inputs.organization_name.value.trim() || undefined,
            value: inputs.value.value === "" ? undefined : Number(inputs.value.value),
            source_id: inputs.source_id.value || undefined,
          };
          if (!payload.name) throw new Error("Informe o nome.");
          await api("/api/crm/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          fecharModal();
          vista = "leads";
          aplicarVista();
          await carregarKanbanLeads();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao criar lead";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    campoLabel("Nome", inputs.name),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("E-mail", inputs.email),
      campoLabel("Celular / WhatsApp", inputs.mobile),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("Instagram", inputs.instagram),
      campoLabel("Origem", inputs.source_id),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("Empresa", inputs.organization_name),
      campoLabel("Valor (R$)", inputs.value),
    ),
    campoLabel("Título do lead", inputs.title),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-1" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      btnSalvar,
    ),
  );

  abrirModal({ eyebrow: "CRM", titulo: "Novo lead", conteudo: form });
  inputs.name.focus();
}

async function abrirModalLead(id) {
  let lead;
  try {
    lead = (await api(`/api/crm/leads/${id}`)).data;
  } catch (erro) {
    setStatus(erro.message || "Falha ao abrir lead");
    return;
  }

  const convertido = lead.status === "converted";
  const inputs = {
    name: el("input", { type: "text", class: CLASSE_INPUT, value: lead.name || "" }),
    email: el("input", { type: "email", class: CLASSE_INPUT, value: lead.email || "" }),
    mobile: el("input", { type: "text", class: CLASSE_INPUT, value: lead.mobile || "" }),
    instagram: el("input", { type: "text", class: CLASSE_INPUT, value: lead.instagram || "" }),
    organization_name: el("input", {
      type: "text",
      class: CLASSE_INPUT,
      value: lead.organization_name || "",
    }),
    value: el("input", {
      type: "number",
      step: "0.01",
      min: "0",
      class: CLASSE_INPUT,
      value: lead.value != null ? String(lead.value) : "",
      placeholder: "0,00",
    }),
    source_id: selectDe(
      [{ value: "", label: "Sem origem" }, ...origens.map((s) => ({ value: s.id, label: s.name }))],
      lead.source_id ?? "",
    ),
  };
  if (convertido) {
    for (const input of Object.values(inputs)) input.setAttribute("disabled", "disabled");
  }

  const corStatus = lead.stage?.color || "#6b7280";
  const nomeStatus = lead.stage?.name || (convertido ? "Convertido" : null);
  const badgeStatus = nomeStatus
    ? el(
        "span",
        {
          class:
            "inline-flex items-center gap-1 font-sans font-normal text-[10px] leading-none text-cinza",
          title: nomeStatus,
        },
        el("span", {
          class: "w-1.5 h-1.5 rounded-full flex-none",
          style: `background:${corStatus}; box-shadow:0 0 6px ${corStatus}, 0 0 10px ${corStatus}55`,
        }),
        nomeStatus,
      )
    : null;

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el("button", { type: "submit", class: CLASSE_BOTAO_PRIMARIO }, "Salvar");
  const btnExcluir = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} text-alerta border-alerta/40`,
      onclick: async () => {
        const nome = lead.title || lead.name || `#${lead.id}`;
        if (!confirm(`Excluir o lead "${nome}"? Esta ação não pode ser desfeita.`)) return;
        btnExcluir.disabled = true;
        erroEl.classList.add("hidden");
        try {
          await api(`/api/crm/leads/${lead.id}`, { method: "DELETE" });
          fecharModal();
          await carregarKanbanLeads();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao excluir lead";
          erroEl.classList.remove("hidden");
          btnExcluir.disabled = false;
        }
      },
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:trash-2",
      class: "text-[15px]",
    }),
    "Excluir",
  );
  const btnConverter = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} border-vekta text-vekta hover:bg-vekta-suave`,
      onclick: async () => {
        btnConverter.disabled = true;
        erroEl.classList.add("hidden");
        try {
          const valorLead =
            inputs.value.value === "" ? lead.value : Number(inputs.value.value);
          await api(`/api/crm/leads/${lead.id}/convert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              value: valorLead == null || Number.isNaN(Number(valorLead)) ? null : Number(valorLead),
            }),
          });
          fecharModal();
          await trocarVista("negocios");
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao converter lead";
          erroEl.classList.remove("hidden");
          btnConverter.disabled = false;
        }
      },
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:git-branch-plus",
      class: "text-[15px]",
    }),
    "Converter em negócio",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col flex-1 min-h-0 gap-0",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        try {
          await api(`/api/crm/leads/${lead.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: inputs.name.value.trim(),
              email: inputs.email.value.trim() || null,
              mobile: inputs.mobile.value.trim() || null,
              instagram: inputs.instagram.value.trim() || null,
              organization_name: inputs.organization_name.value.trim() || null,
              value: inputs.value.value === "" ? null : Number(inputs.value.value),
              source_id: inputs.source_id.value || null,
            }),
          });
          fecharModal();
          await carregarVista();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar lead";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    el(
      "div",
      { class: "flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pr-0.5" },
      convertido
        ? el(
            "p",
            { class: "text-xs text-cinza bg-fundo rounded-xl px-3 py-2" },
            "Lead convertido — os dados agora vivem no negócio e no contato.",
          )
        : null,
      campoLabel("Nome", inputs.name),
      el(
        "div",
        { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
        campoLabel("E-mail", inputs.email),
        campoLabel("Celular / WhatsApp", inputs.mobile),
      ),
      el(
        "div",
        { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
        campoLabel("Instagram", inputs.instagram),
        campoLabel("Empresa", inputs.organization_name),
      ),
      el(
        "div",
        { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
        campoLabel("Origem", inputs.source_id),
        campoLabel("Valor (R$)", inputs.value),
      ),
    ),
    el(
      "div",
      { class: "shrink-0 flex flex-col gap-2 pt-3 border-t border-linha" },
      erroEl,
      convertido
        ? el(
            "div",
            { class: "flex flex-wrap items-center gap-2 justify-between" },
            btnExcluir,
            el(
              "div",
              { class: "flex gap-2 ml-auto" },
              el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Fechar"),
            ),
          )
        : el(
            "div",
            { class: "flex flex-wrap items-center gap-2 justify-between" },
            el("div", { class: "flex flex-wrap gap-2" }, btnExcluir, btnConverter),
            el(
              "div",
              { class: "flex gap-2 ml-auto" },
              el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
              btnSalvar,
            ),
          ),
    ),
  );

  abrirModal({
    eyebrow: "CRM · Lead",
    titulo: [lead.title || lead.name, badgeStatus],
    subtitulo: lead.created_at
      ? `Criado em ${formatarData(lead.created_at)}`
      : null,
    tamanho: "grande",
    conteudo: montarAbasModal({
      abaDados: form,
      activities: lead.activities,
      tasks: lead.tasks,
      vinculo: { lead_id: lead.id },
      aoRegistrar: () => abrirModalLead(lead.id),
      motivoPerda: estagioPerdido(lead.stage) ? lead.lost_reason || "" : undefined,
      chat: {
        lead_id: lead.id,
        whatsapp_jid: lead.whatsapp_jid || null,
        contact_name: lead.name || null,
      },
    }),
  });
}

async function abrirModalDeal(id) {
  let deal;
  try {
    deal = (await api(`/api/crm/deals/${id}`)).data;
  } catch (erro) {
    setStatus(erro.message || "Falha ao abrir negócio");
    return;
  }

  const inputs = {
    title: el("input", { type: "text", class: CLASSE_INPUT, value: deal.title || "" }),
    value: el("input", {
      type: "number",
      step: "0.01",
      min: "0",
      class: CLASSE_INPUT,
      value: deal.value != null ? String(deal.value) : "",
      placeholder: "0,00",
    }),
    stage_id: selectDe(
      estagios.map((s) => ({ value: s.id, label: s.name })),
      deal.stage_id,
    ),
    expected_close_on: el("input", {
      type: "date",
      class: CLASSE_INPUT,
      value: deal.expected_close_on ? String(deal.expected_close_on).slice(0, 10) : "",
    }),
  };

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el("button", { type: "submit", class: CLASSE_BOTAO_PRIMARIO }, "Salvar");
  const btnExcluir = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} text-alerta border-alerta/40`,
      onclick: async () => {
        const nome = deal.title || `#${deal.id}`;
        if (!confirm(`Excluir o negócio "${nome}"? Esta ação não pode ser desfeita.`)) return;
        btnExcluir.disabled = true;
        erroEl.classList.add("hidden");
        try {
          await api(`/api/crm/deals/${deal.id}`, { method: "DELETE" });
          fecharModal();
          await carregarPipeline();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao excluir negócio";
          erroEl.classList.remove("hidden");
          btnExcluir.disabled = false;
        }
      },
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:trash-2",
      class: "text-[15px]",
    }),
    "Excluir",
  );

  const form = el(
    "form",
    {
      class: "flex flex-col flex-1 min-h-0 gap-0",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        const stageId = Number(inputs.stage_id.value);
        const stageDestino = estagios.find((s) => Number(s.id) === stageId);
        const payload = {
          title: inputs.title.value.trim(),
          value: inputs.value.value === "" ? null : Number(inputs.value.value),
          stage_id: stageId,
          expected_close_on: inputs.expected_close_on.value || null,
        };

        if (
          estagioPerdido(stageDestino) &&
          !estagioPerdido(deal.stage) &&
          Number(deal.stage_id) !== stageId
        ) {
          const motivo = await pedirMotivoPerda();
          if (!motivo) {
            btnSalvar.disabled = false;
            return;
          }
          payload.lost_reason = motivo;
        }

        try {
          await api(`/api/crm/deals/${deal.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          fecharModal();
          await carregarPipeline();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar negócio";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    el(
      "div",
      { class: "flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pr-0.5" },
      el(
        "p",
        { class: "text-xs text-cinza bg-fundo rounded-xl px-3 py-2" },
        [
          deal.contact?.name ? `Contato: ${deal.contact.name}` : null,
          deal.organization?.name ? `Empresa: ${deal.organization.name}` : null,
          deal.closed_at ? `Fechado em ${formatarData(deal.closed_at)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Sem vínculos",
      ),
      campoLabel("Título", inputs.title),
      el(
        "div",
        { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
        campoLabel("Valor (R$)", inputs.value),
        campoLabel("Estágio", inputs.stage_id),
      ),
      campoLabel("Previsão de fechamento", inputs.expected_close_on),
    ),
    el(
      "div",
      { class: "shrink-0 flex flex-col gap-2 pt-3 border-t border-linha" },
      erroEl,
      el(
        "div",
        { class: "flex flex-wrap items-center gap-2 justify-between" },
        btnExcluir,
        el(
          "div",
          { class: "flex gap-2 ml-auto" },
          el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
          btnSalvar,
        ),
      ),
    ),
  );

  const corStatus = deal.stage?.color || "#6b7280";
  const badgeStatus = deal.stage?.name
    ? el(
        "span",
        {
          class:
            "inline-flex items-center gap-1 font-sans font-normal text-[10px] leading-none text-cinza",
          title: deal.stage.name,
        },
        el("span", {
          class: "w-1.5 h-1.5 rounded-full flex-none",
          style: `background:${corStatus}; box-shadow:0 0 6px ${corStatus}, 0 0 10px ${corStatus}55`,
        }),
        deal.stage.name,
      )
    : null;

  abrirModal({
    eyebrow: "CRM · Negócio",
    titulo: [deal.title, badgeStatus],
    subtitulo: deal.created_at
      ? `Criado em ${formatarData(deal.created_at)}`
      : null,
    tamanho: "grande",
    conteudo: montarAbasModal({
      abaDados: form,
      activities: deal.activities,
      tasks: deal.tasks,
      vinculo: { deal_id: deal.id },
      aoRegistrar: () => abrirModalDeal(deal.id),
      motivoPerda: estagioPerdido(deal.stage) ? deal.lost_reason || "" : undefined,
      chat: {
        deal_id: deal.id,
        lead_id: deal.lead_id || null,
        whatsapp_jid: deal.whatsapp_jid || deal.contact?.whatsapp_jid || null,
        contact_name: deal.contact?.name || deal.title || null,
      },
    }),
  });
}

// ==========================================================
// Configurações (modal) + WhatsApp
// ==========================================================

const ROTULOS_STATUS_WA = {
  disconnected: "Desconectado",
  connecting: "Conectando…",
  connected: "Conectado",
  error: "Erro",
};

function pararPollWhatsapp() {
  if (whatsappPollTimer) {
    clearInterval(whatsappPollTimer);
    whatsappPollTimer = null;
  }
}

async function atualizarQrWhatsappInPlace() {
  const slot = $("#crm-whatsapp-qr-slot");
  if (!slot) return;
  try {
    const qrResp = await api("/api/crm/whatsapp/qrcode");
    const qr = qrResp?.data?.qr;
    if (!qr) return;
    const src = String(qr).startsWith("data:")
      ? String(qr)
      : `data:image/png;base64,${qr}`;
    if (src === whatsappUltimoQrSrc) return;
    whatsappUltimoQrSrc = src;
    const img = slot.querySelector("img");
    if (img) {
      img.src = src;
    } else {
      slot.replaceChildren(
        el("img", {
          src,
          alt: "QR Code WhatsApp",
          class: "max-w-[220px] w-full h-auto rounded-lg",
        }),
      );
    }
  } catch {
    // QR ainda indisponível — mantém o que estiver na tela.
  }
}

function iniciarPollWhatsapp() {
  pararPollWhatsapp();
  whatsappPollTimer = setInterval(async () => {
    if (!configModalAberto || configSecaoAtiva !== "whatsapp") {
      pararPollWhatsapp();
      return;
    }
    try {
      const resp = await api("/api/crm/whatsapp/status");
      const estado = resp.data || {};
      const status = estado.status || "disconnected";

      // Só remonta o painel quando o status muda (ex.: connected).
      // Enquanto connecting, atualiza o QR in-place só se a imagem mudou.
      if (status !== "connecting") {
        whatsappUltimoQrSrc = null;
        await renderWhatsappPainel(estado);
        pararPollWhatsapp();
        return;
      }

      await atualizarQrWhatsappInPlace();
    } catch {
      // Ignora falhas transitórias no poll.
    }
  }, 4000);
}

function badgeStatusWhatsapp(status) {
  const s = status || "disconnected";
  const cores = {
    connected: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    connecting: "bg-amber-500/15 text-amber-800 border-amber-500/30",
    error: "bg-red-500/15 text-red-700 border-red-500/30",
    disconnected: "bg-cinza/10 text-cinza border-linha",
  };
  return el(
    "span",
    {
      class: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cores[s] || cores.disconnected}`,
    },
    el("span", {
      class: `size-1.5 rounded-full ${s === "connected" ? "bg-emerald-500" : s === "connecting" ? "bg-amber-500" : s === "error" ? "bg-red-500" : "bg-cinza"}`,
    }),
    ROTULOS_STATUS_WA[s] || s,
  );
}

async function renderConfigSecao(conteudoEl) {
  const conteudo = conteudoEl || $("#crm-config-conteudo") || $("#config-modal-conteudo");
  if (!conteudo) return;

  if (configSecaoAtiva === "geral") {
    conteudo.replaceChildren(
      el(
        "div",
        { class: "max-w-lg space-y-2" },
        el("h3", { class: "font-display text-lg font-semibold text-tinta" }, "Geral"),
        el(
          "p",
          { class: "text-sm text-cinza" },
          "Configurações gerais do CRM em breve.",
        ),
      ),
    );
    return;
  }

  conteudo.replaceChildren(
    el(
      "div",
      { id: "crm-whatsapp-painel", class: "max-w-xl space-y-5" },
      el("div", { class: "animate-pulse space-y-4" },
        el("div", { class: "h-5 w-40 rounded bg-linha" }),
        el("div", { class: "h-10 w-full rounded-xl bg-linha" }),
        el("div", { class: "h-10 w-full rounded-xl bg-linha" }),
      ),
    ),
  );

  try {
    if (!estagiosLeads.length) await carregarReferencias();
    const resp = await api("/api/crm/whatsapp/status");
    await renderWhatsappPainel(resp.data || {});
  } catch (erro) {
    const painel = $("#crm-whatsapp-painel");
    if (painel) {
      painel.replaceChildren(
        el("p", { class: "text-sm text-alerta" }, erro.message || "Falha ao carregar WhatsApp."),
      );
    }
  }
}

/**
 * Renderiza uma seção de config do CRM dentro do modal global de Configurações.
 * @param {'geral' | 'whatsapp'} secao
 * @param {HTMLElement} container
 */
export async function renderizarSecaoConfig(secao, container) {
  configSecaoAtiva = secao === "whatsapp" ? "whatsapp" : "geral";
  configModalAberto = true;
  if (configSecaoAtiva !== "whatsapp") pararPollWhatsapp();
  await renderConfigSecao(container);
}

/** Encerra estado do painel de config CRM (poll do WhatsApp etc.). */
export function encerrarConfig() {
  configModalAberto = false;
  pararPollWhatsapp();
  // Os selects desta seção são removidos junto com o modal global de Configurações.
  destruirSelectsEm($("#config-modal-conteudo"));
}

/**
 * @param {Record<string, unknown>} estado
 * @param {{ silencioso?: boolean }} [opcoes]
 */
async function renderWhatsappPainel(estado, opcoes = {}) {
  const painel = $("#crm-whatsapp-painel");
  if (!painel) return;

  // Remount completo: limpa cache do QR para a próxima carga.
  if (!opcoes.silencioso) whatsappUltimoQrSrc = null;

  const status = String(estado.status || "disconnected");
  const inputUser = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    value: String(estado.whatsapp_api_username || ""),
    autocomplete: "username",
    placeholder: "Usuário Basic Auth da WhatsApp API",
  });
  const inputPass = el("input", {
    type: "password",
    class: CLASSE_INPUT,
    value: "",
    autocomplete: "current-password",
    placeholder: estado.has_credentials ? "•••••••• (deixe em branco para manter)" : "Senha Basic Auth",
  });
  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const msgEl = el("p", { class: "hidden text-sm text-emerald-700", role: "status" });

  const selectColuna = selectDe(
    [
      { value: "", label: "Primeira coluna (padrão)" },
      ...estagiosLeads.map((s) => ({ value: String(s.id), label: s.name })),
    ],
    estado.default_lead_stage_id != null ? String(estado.default_lead_stage_id) : "",
  );

  const btnSalvarCred = el("button", { type: "button", class: CLASSE_BOTAO }, "Salvar credenciais");
  const btnConectar = el(
    "button",
    { type: "button", class: CLASSE_BOTAO_PRIMARIO },
    status === "connecting" ? "Reconectar" : "Conectar",
  );
  const btnDesconectar = el("button", { type: "button", class: CLASSE_BOTAO }, "Desconectar");
  btnDesconectar.disabled = status === "disconnected";
  const btnStatus = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} inline-flex items-center gap-1.5`,
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:refresh-cw",
      class: "text-[15px]",
      "aria-hidden": "true",
    }),
    "Consultar status",
  );
  const btnSalvarSettings = el("button", { type: "button", class: CLASSE_BOTAO }, "Salvar coluna");

  btnSalvarCred.addEventListener("click", async () => {
    erroEl.classList.add("hidden");
    msgEl.classList.add("hidden");
    const username = inputUser.value.trim();
    const password = inputPass.value;
    if (!username || !password) {
      erroEl.textContent = "Informe usuário e senha da API.";
      erroEl.classList.remove("hidden");
      return;
    }
    btnSalvarCred.disabled = true;
    try {
      const resp = await api("/api/crm/whatsapp/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp_api_username: username,
          whatsapp_api_password: password,
        }),
      });
      msgEl.textContent = "Credenciais salvas.";
      msgEl.classList.remove("hidden");
      inputPass.value = "";
      await renderWhatsappPainel(resp.data || {});
    } catch (erro) {
      erroEl.textContent = erro.message || "Falha ao salvar.";
      erroEl.classList.remove("hidden");
    } finally {
      btnSalvarCred.disabled = false;
    }
  });

  btnSalvarSettings.addEventListener("click", async () => {
    erroEl.classList.add("hidden");
    msgEl.classList.add("hidden");
    btnSalvarSettings.disabled = true;
    try {
      const valor = selectColuna.value;
      const resp = await api("/api/crm/whatsapp/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_lead_stage_id: valor ? Number(valor) : null,
        }),
      });
      msgEl.textContent = "Coluna padrão salva.";
      msgEl.classList.remove("hidden");
      await renderWhatsappPainel(resp.data || {});
    } catch (erro) {
      erroEl.textContent = erro.message || "Falha ao salvar coluna.";
      erroEl.classList.remove("hidden");
    } finally {
      btnSalvarSettings.disabled = false;
    }
  });

  btnStatus.addEventListener("click", async () => {
    erroEl.classList.add("hidden");
    msgEl.classList.add("hidden");
    btnStatus.disabled = true;
    try {
      const resp = await api("/api/crm/whatsapp/status");
      msgEl.textContent = `Status atualizado: ${ROTULOS_STATUS_WA[resp.data?.status] || resp.data?.status || "—"}`;
      msgEl.classList.remove("hidden");
      await renderWhatsappPainel(resp.data || {});
      if (resp.data?.status === "connecting") iniciarPollWhatsapp();
    } catch (erro) {
      erroEl.textContent = erro.message || "Falha ao consultar status.";
      erroEl.classList.remove("hidden");
    } finally {
      btnStatus.disabled = false;
    }
  });

  btnConectar.addEventListener("click", async () => {
    erroEl.classList.add("hidden");
    msgEl.classList.add("hidden");
    btnConectar.disabled = true;
    try {
      if (inputUser.value.trim() && inputPass.value) {
        await api("/api/crm/whatsapp/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            whatsapp_api_username: inputUser.value.trim(),
            whatsapp_api_password: inputPass.value,
          }),
        });
        inputPass.value = "";
      }
      const resp = await api("/api/crm/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      msgEl.textContent = resp.message || "Conexão iniciada.";
      msgEl.classList.remove("hidden");
      await renderWhatsappPainel(resp.data || {});
      iniciarPollWhatsapp();
    } catch (erro) {
      erroEl.textContent = erro.message || "Falha ao conectar.";
      erroEl.classList.remove("hidden");
    } finally {
      btnConectar.disabled = false;
    }
  });

  btnDesconectar.addEventListener("click", async () => {
    erroEl.classList.add("hidden");
    msgEl.classList.add("hidden");
    btnDesconectar.disabled = true;
    pararPollWhatsapp();
    try {
      const resp = await api("/api/crm/whatsapp/disconnect", { method: "DELETE" });
      msgEl.textContent = resp.message || "Desconectado.";
      msgEl.classList.remove("hidden");
      await renderWhatsappPainel(resp.data || {});
    } catch (erro) {
      erroEl.textContent = erro.message || "Falha ao desconectar.";
      erroEl.classList.remove("hidden");
    } finally {
      btnDesconectar.disabled = false;
    }
  });

  const metaLinhas = [
    el(
      "div",
      { class: "flex flex-wrap items-center justify-between gap-3" },
      el("h3", { class: "font-display text-lg font-semibold text-tinta" }, "WhatsApp"),
      el(
        "div",
        { class: "flex flex-wrap items-center gap-2" },
        badgeStatusWhatsapp(status),
        status === "connected" && estado.is_business
          ? el(
              "span",
              {
                class:
                  "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-sky-500/15 text-sky-800 border-sky-500/30",
              },
              "Business · labels sync",
            )
          : null,
        btnStatus,
      ),
    ),
    el(
      "p",
      { class: "text-sm text-cinza" },
      "Use o usuário e senha Basic Auth da WhatsApp-api. Ao conectar, escaneie o QR no celular.",
    ),
  ];

  if (estado.phone) {
    metaLinhas.push(
      el(
        "p",
        { class: "text-sm text-tinta" },
        el("span", { class: "text-cinza" }, "Conta: "),
        String(estado.phone),
        estado.is_business
          ? el("span", { class: "text-cinza" }, " (WhatsApp Business)")
          : null,
      ),
    );
  }
  if (estado.session_id) {
    metaLinhas.push(
      el("p", { class: "text-xs font-mono text-cinza truncate" }, `session: ${estado.session_id}`),
    );
  }

  const formSettings = el(
    "div",
    { class: "space-y-3 pt-2 border-t border-linha" },
    el("h4", { class: "text-sm font-medium text-tinta" }, "Novos leads"),
    el(
      "p",
      { class: "text-sm text-cinza" },
      "Escolha em qual coluna do kanban de leads entram os contatos cadastrados automaticamente pelo WhatsApp.",
    ),
    campoLabel("Coluna dos novos leads", selectColuna),
    el("div", { class: "flex flex-wrap gap-2" }, btnSalvarSettings),
  );

  const formCred = el(
    "div",
    { class: "space-y-3" },
    el("h4", { class: "text-sm font-medium text-tinta" }, "Credenciais da API"),
    campoLabel("Usuário", inputUser),
    campoLabel("Senha", inputPass),
    el("div", { class: "flex flex-wrap gap-2" }, btnSalvarCred, btnConectar, btnDesconectar),
    erroEl,
    msgEl,
  );

  const filhos = [...metaLinhas, formSettings, formCred];

  let qrBox = null;
  if (status === "connecting" || estado.has_qr) {
    qrBox = el(
      "div",
      { class: "space-y-2 pt-2 border-t border-linha" },
      el("h4", { class: "text-sm font-medium text-tinta" }, "QR Code"),
      el("p", { class: "text-sm text-cinza" }, "Abra o WhatsApp no celular e escaneie o código."),
      el(
        "div",
        {
          class:
            "flex items-center justify-center min-h-[220px] rounded-xl border border-linha bg-fundo p-4",
          id: "crm-whatsapp-qr-slot",
        },
        el("p", { class: "text-sm text-cinza" }, "Carregando QR…"),
      ),
    );
    filhos.push(qrBox);
  }

  painel.replaceChildren(...filhos);

  if (status === "connecting") {
    if (!whatsappPollTimer) iniciarPollWhatsapp();
  } else if (status === "connected" || status === "disconnected" || status === "error") {
    pararPollWhatsapp();
  }

  if (qrBox) {
    try {
      const qrResp = await api("/api/crm/whatsapp/qrcode");
      const qr = qrResp?.data?.qr;
      const slot = $("#crm-whatsapp-qr-slot");
      if (slot) {
        if (qr) {
          const src = String(qr).startsWith("data:")
            ? String(qr)
            : `data:image/png;base64,${qr}`;
          whatsappUltimoQrSrc = src;
          slot.replaceChildren(
            el("img", {
              src,
              alt: "QR Code WhatsApp",
              class: "max-w-[220px] w-full h-auto rounded-lg",
            }),
          );
        } else {
          slot.replaceChildren(
            el("p", { class: "text-sm text-cinza" }, "QR ainda não disponível. Aguarde…"),
          );
        }
      }
    } catch (erro) {
      const slot = $("#crm-whatsapp-qr-slot");
      if (slot) {
        slot.replaceChildren(
          el("p", { class: "text-sm text-cinza" }, erro.message || "QR indisponível."),
        );
      }
    }
  }
}

// ==========================================================
// Bootstrap
// ==========================================================

function ligarControles() {
  $("#crm-ver-dashboard")?.addEventListener("click", () => trocarVista("dashboard"));
  $("#crm-ver-leads")?.addEventListener("click", () => trocarVista("leads"));
  $("#crm-ver-negocios")?.addEventListener("click", () => trocarVista("negocios"));
  $("#crm-ver-contatos")?.addEventListener("click", () => trocarVista("contatos"));
  $("#crm-novo-lead")?.addEventListener("click", abrirModalNovoLead);
  $("#crm-atualizar")?.addEventListener("click", () => carregarVista());
  $("#crm-contatos-busca")?.addEventListener("input", onBuscaContatosInput);
  $("#crm-leads-busca")?.addEventListener("input", onBuscaLeadsInput);
  $("#crm-negocios-busca")?.addEventListener("input", onBuscaNegociosInput);
}

export async function iniciar() {
  if (!iniciado) {
    ligarControles();
    iniciado = true;
  }
  // UI pronta na hora — o roteador só libera a aba depois que iniciar() resolve,
  // então dados da API sobem em background para o skeleton aparecer de verdade.
  mostrarSetup(false);
  aplicarVista();
  mostrarSkeletonVista();
  setStatus("Carregando…");

  void (async () => {
    try {
      const status = await api("/api/crm/status");
      if (!status.configurado) {
        mostrarSetup(true);
        return;
      }
      await carregarReferencias();
      await carregarVista();
    } catch (erro) {
      mostrarSetup(true);
      setStatus(erro.message || "Falha ao verificar o backend do CRM");
    }
  })();
}

export async function atualizar() {
  return iniciar();
}
