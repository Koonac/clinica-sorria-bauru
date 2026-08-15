/**
 * Página Agents WhatsApp — cards com CRUD + ativar (um ativo por vez).
 */
import {
  $,
  el,
  api,
  CLASSE_PAINEL,
  CLASSE_BOTAO,
  CLASSE_BOTAO_PRIMARIO,
  animarEntrada,
  PODE_ANIMAR,
} from "../.core/util.js";
import {
  criarSelect,
  definirOpcoes,
  destruirSelectsEm,
  haSelectAberto,
} from "../componentes/select.js";

const CLASSE_INPUT =
  "w-full rounded-xl border border-linha bg-fundo px-3 py-2 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta";

let iniciado = false;
/** @type {Array<Record<string, unknown>>} */
let agents = [];
/** @type {HTMLElement | null} */
let modalEl = null;
/** @type {number | null} */
let editandoId = null;

function setStatus(texto) {
  const alvo = $("#awa-status");
  if (alvo) alvo.textContent = texto || "";
}

function selectDe(opcoes, valorAtual, atributos = {}, extras = {}) {
  return criarSelect({
    opcoes,
    valor: valorAtual,
    atributos: { class: CLASSE_INPUT, ...atributos },
    ...extras,
  });
}

function fecharModal() {
  if (modalEl) destruirSelectsEm(modalEl);
  modalEl?.remove();
  modalEl = null;
  editandoId = null;
  document.removeEventListener("keydown", onEscModal, true);
}

function onEscModal(e) {
  if (e.key !== "Escape") return;
  if (haSelectAberto()) return;
  fecharModal();
}

/**
 * @param {Record<string, unknown> | null} agent
 */
async function abrirModal(agent = null) {
  fecharModal();
  editandoId = agent?.id != null ? Number(agent.id) : null;
  const modeloAtual = String(agent?.model || "");

  const inputNome = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    placeholder: "Nome (ex.: SDR Qualificação)",
    value: String(agent?.name || ""),
  });
  const inputPrompt = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[10rem] resize-y`,
    placeholder: "System prompt — tom, regras, quando mover/agendar/escalar…",
  });
  inputPrompt.value = String(agent?.system_prompt || "");

  const selectModelo = selectDe(
    [{ value: "", label: "Carregando modelos…", desabilitada: true }],
    "",
    { "aria-label": "Modelo OpenRouter" },
    { busca: true, placeholder: "Selecione um modelo" },
  );
  const infoModelo = el(
    "p",
    { class: "text-xs text-cinza" },
    "Carregando modelos do OpenRouter…",
  );

  const inputDebounce = el("input", {
    type: "number",
    class: CLASSE_INPUT,
    min: "3",
    max: "60",
    value: String(agent?.debounce_seconds ?? 10),
  });

  const erroEl = el("p", { class: "hidden text-sm text-alerta", role: "alert" });
  const btnSalvar = el(
    "button",
    { type: "button", class: CLASSE_BOTAO_PRIMARIO },
    editandoId ? "Salvar" : "Criar",
  );
  const btnCancelar = el("button", { type: "button", class: CLASSE_BOTAO }, "Cancelar");

  btnCancelar.addEventListener("click", fecharModal);
  btnSalvar.addEventListener("click", async () => {
    erroEl.classList.add("hidden");
    const name = inputNome.value.trim();
    const system_prompt = inputPrompt.value.trim();
    const model = String(selectModelo.value || "").trim();
    const debounce_seconds = Number(inputDebounce.value || 10);
    if (!name) {
      erroEl.textContent = "Informe o nome do agent.";
      erroEl.classList.remove("hidden");
      return;
    }
    btnSalvar.disabled = true;
    try {
      const body = {
        name,
        system_prompt: system_prompt || null,
        model: model || null,
        debounce_seconds: Number.isFinite(debounce_seconds) ? debounce_seconds : 10,
      };
      if (editandoId) {
        await api(`/api/crm/agents/${editandoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/crm/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      fecharModal();
      await carregar();
    } catch (erro) {
      erroEl.textContent = erro.message || "Falha ao salvar.";
      erroEl.classList.remove("hidden");
      btnSalvar.disabled = false;
    }
  });

  const painel = el(
    "div",
    {
      class: "bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 space-y-4",
      onclick: (e) => e.stopPropagation(),
    },
    el(
      "div",
      { class: "flex items-start justify-between gap-3" },
      el(
        "div",
        {},
        el("p", { class: "font-mono text-[11px] uppercase tracking-wider text-vekta mb-1" }, "whatsapp"),
        el(
          "h2",
          { class: "font-display text-xl font-semibold tracking-tight" },
          editandoId ? "Editar agent" : "Novo agent",
        ),
      ),
      el(
        "button",
        {
          type: "button",
          class: "inline-flex items-center justify-center w-8 h-8 rounded-full text-cinza hover:bg-fundo hover:text-tinta",
          "aria-label": "Fechar",
          onclick: fecharModal,
        },
        el("iconify-icon", { noobserver: "", icon: "lucide:x", class: "text-lg" }),
      ),
    ),
    el(
      "label",
      { class: "block space-y-1.5" },
      el("span", { class: "text-sm font-medium text-tinta" }, "Nome"),
      inputNome,
    ),
    el(
      "label",
      { class: "block space-y-1.5" },
      el("span", { class: "text-sm font-medium text-tinta" }, "System prompt"),
      inputPrompt,
    ),
    el(
      "label",
      { class: "block space-y-1.5" },
      el("span", { class: "text-sm font-medium text-tinta" }, "Modelo OpenRouter"),
      selectModelo,
      infoModelo,
    ),
    el(
      "label",
      { class: "block space-y-1.5" },
      el("span", { class: "text-sm font-medium text-tinta" }, "Debounce (segundos)"),
      inputDebounce,
    ),
    erroEl,
    el("div", { class: "flex flex-wrap gap-2 justify-end pt-1" }, btnCancelar, btnSalvar),
  );

  modalEl = el(
    "div",
    {
      class: "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-sm",
      role: "dialog",
      "aria-modal": "true",
      onclick: fecharModal,
    },
    painel,
  );
  document.body.append(modalEl);
  document.addEventListener("keydown", onEscModal, true);
  inputNome.focus();

  try {
    const res = await api("/api/crm/campaigns/openrouter-models?tools=1");
    const models = res?.data?.models || [];
    const opcoes = [
      { value: "", label: "Padrão do servidor" },
      ...models.map((m) => ({
        value: m.id,
        label: m.label || m.name || m.id,
      })),
    ];
    if (modeloAtual && !opcoes.some((o) => o.value === modeloAtual)) {
      opcoes.splice(1, 0, { value: modeloAtual, label: modeloAtual });
    }
    definirOpcoes(selectModelo, opcoes, modeloAtual || "");
    infoModelo.textContent = `${models.length} modelo${models.length === 1 ? "" : "s"} com tools — use a busca para filtrar`;
  } catch (erro) {
    definirOpcoes(
      selectModelo,
      [
        { value: "", label: "Padrão do servidor" },
        ...(modeloAtual ? [{ value: modeloAtual, label: modeloAtual }] : []),
        { value: "__fail", label: "Falha ao carregar lista", desabilitada: true },
      ],
      modeloAtual || "",
    );
    infoModelo.textContent = erro.message || "Falha ao listar modelos";
  }
}

/**
 * @param {Record<string, unknown>} agent
 */
function montarCard(agent) {
  const ativo = Boolean(agent.is_active);
  const prompt = String(agent.system_prompt || "").trim();

  const btnEditar = el("button", { type: "button", class: CLASSE_BOTAO }, "Editar");
  btnEditar.addEventListener("click", () => abrirModal(agent));

  const btnToggle = el(
    "button",
    { type: "button", class: ativo ? CLASSE_BOTAO : CLASSE_BOTAO_PRIMARIO },
    ativo ? "Desativar" : "Ativar",
  );
  btnToggle.addEventListener("click", async () => {
    btnToggle.disabled = true;
    try {
      const path = ativo
        ? `/api/crm/agents/${agent.id}/deactivate`
        : `/api/crm/agents/${agent.id}/activate`;
      await api(path, { method: "POST" });
      await carregar();
    } catch (erro) {
      setStatus(erro.message || "Falha ao alterar status.");
      btnToggle.disabled = false;
    }
  });

  const btnExcluir = el("button", { type: "button", class: CLASSE_BOTAO }, "Excluir");
  btnExcluir.addEventListener("click", async () => {
    if (!window.confirm(`Excluir o agent "${agent.name}"?`)) return;
    try {
      await api(`/api/crm/agents/${agent.id}`, { method: "DELETE" });
      await carregar();
    } catch (erro) {
      setStatus(erro.message || "Falha ao excluir.");
    }
  });

  return el(
    "article",
    {
      class: `${CLASSE_PAINEL} flex flex-col gap-3 ${
        ativo ? "ring-1 ring-vekta/40 border-vekta/30" : ""
      }`,
    },
    el(
      "div",
      { class: "flex items-start justify-between gap-3" },
      el(
        "div",
        { class: "min-w-0" },
        el("h2", { class: "font-display text-lg font-semibold truncate" }, String(agent.name || "Sem nome")),
        el(
          "p",
          { class: "text-xs text-cinza mt-1" },
          [
            `debounce ${agent.debounce_seconds ?? 10}s`,
            agent.model ? String(agent.model) : "modelo padrão",
          ].join(" · "),
        ),
      ),
      el(
        "span",
        {
          class: `shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            ativo ? "bg-vekta text-white" : "bg-fundo border border-linha text-cinza"
          }`,
        },
        ativo ? "ativo" : "inativo",
      ),
    ),
    el(
      "p",
      { class: "text-sm text-cinza line-clamp-4 whitespace-pre-wrap flex-1" },
      prompt || "Sem system prompt — defina um antes de ativar.",
    ),
    el("div", { class: "flex flex-wrap gap-2 mt-auto pt-1" }, btnEditar, btnToggle, btnExcluir),
  );
}

function renderGrade() {
  const grade = $("#awa-grade");
  const vazio = $("#awa-vazio");
  if (!grade || !vazio) return;

  grade.replaceChildren();
  vazio.classList.toggle("hidden", agents.length > 0);
  grade.classList.toggle("hidden", agents.length === 0);

  if (agents.length === 0) {
    setStatus("");
    return;
  }

  const ativo = agents.find((a) => a.is_active);
  setStatus(
    ativo
      ? `Ativo: ${ativo.name}`
      : `${agents.length} agent${agents.length === 1 ? "" : "s"} · nenhum ativo`,
  );

  grade.append(...agents.map(montarCard));
  if (PODE_ANIMAR) {
    animarEntrada(grade.children, {
      translateY: [10, 0],
      duration: 320,
      delay: typeof anime !== "undefined" ? anime.stagger(40) : 0,
    });
  }
}

async function carregar() {
  setStatus("Carregando…");
  try {
    const resp = await api("/api/crm/agents");
    agents = Array.isArray(resp.data) ? resp.data : [];
    renderGrade();
  } catch (erro) {
    agents = [];
    renderGrade();
    setStatus(erro.message || "Falha ao carregar agents.");
  }
}

function ligarUi() {
  if (iniciado) return;
  iniciado = true;
  $("#awa-novo")?.addEventListener("click", () => abrirModal(null));
}

export async function iniciar() {
  ligarUi();
  await carregar();
}

export async function atualizar() {
  ligarUi();
  await carregar();
}
