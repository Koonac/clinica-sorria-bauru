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

const CLASSE_INPUT =
  "w-full rounded-xl border border-linha bg-fundo px-3 py-2 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta";

const CLASSE_TH =
  "px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-cinza font-medium text-left whitespace-nowrap";

const STATUS_CAMPANHA = {
  draft: { rotulo: "Rascunho", classe: "bg-fundo text-cinza" },
  queued: { rotulo: "Na fila", classe: "bg-amber-50 text-amber-800" },
  running: { rotulo: "Em execução", classe: "bg-sky-50 text-sky-800" },
  paused: { rotulo: "Pausada", classe: "bg-amber-50 text-amber-800" },
  completed: { rotulo: "Concluída", classe: "bg-emerald-50 text-emerald-800" },
  cancelled: { rotulo: "Cancelada", classe: "bg-fundo text-cinza" },
  failed: { rotulo: "Falhou", classe: "bg-red-50 text-red-700" },
};

const STATUS_DEST = {
  pending: { rotulo: "Pendente", classe: "text-cinza" },
  sending: { rotulo: "Enviando", classe: "text-sky-700" },
  sent: { rotulo: "Enviado", classe: "text-emerald-700" },
  failed: { rotulo: "Falhou", classe: "text-red-600" },
  skipped: { rotulo: "Ignorado", classe: "text-cinza" },
};

const EDITAVEIS = new Set(["draft", "paused", "cancelled", "failed", "completed"]);
const ATIVAS = new Set(["queued", "running"]);

let iniciado = false;
let vista = "lista"; // lista | detalhe
let campanhaId = null;
let campanha = null;
let lista = [];
let carregando = false;
let gerandoIa = false;
let pollTimer = null;
let whatsappOk = false;
let modalEl = null;

// ==========================================================
// Helpers
// ==========================================================

function setStatus(texto) {
  const alvo = $("#camp-status");
  if (alvo) alvo.textContent = texto || "";
}

function blocoSkeleton(classe) {
  return el("div", { class: `skeleton ${classe}`, "aria-hidden": "true" });
}

function renderSkeletonLista() {
  const host = $("#camp-conteudo");
  if (!host) return;
  host.replaceChildren(
    el(
      "div",
      {
        class: `${CLASSE_PAINEL} p-0 overflow-hidden`,
        role: "status",
        "aria-label": "Carregando campanhas",
      },
      el(
        "div",
        { class: "px-4 py-3 border-b border-linha flex gap-4" },
        blocoSkeleton("h-3 w-24"),
        blocoSkeleton("h-3 w-16"),
        blocoSkeleton("h-3 w-20"),
        blocoSkeleton("h-3 w-28"),
      ),
      ...Array.from({ length: 6 }, () =>
        el(
          "div",
          { class: "px-4 py-3.5 border-b border-linha/60 last:border-0 flex gap-4 items-center" },
          blocoSkeleton("h-4 w-40"),
          blocoSkeleton("h-5 w-20 rounded-full"),
          blocoSkeleton("h-4 w-16"),
          blocoSkeleton("h-4 w-28"),
        ),
      ),
    ),
  );
}

function renderSkeletonDetalhe() {
  const host = $("#camp-conteudo");
  if (!host) return;
  host.replaceChildren(
    el(
      "div",
      {
        class: "space-y-4",
        role: "status",
        "aria-label": "Carregando campanha",
      },
      el(
        "div",
        { class: "flex justify-end gap-2" },
        blocoSkeleton("h-9 w-24 rounded-full"),
        blocoSkeleton("h-9 w-24 rounded-full"),
      ),
      el(
        "div",
        { class: "grid gap-4 md:grid-cols-2" },
        el(
          "div",
          { class: `${CLASSE_PAINEL} space-y-3` },
          blocoSkeleton("h-5 w-36"),
          blocoSkeleton("h-4 w-full"),
          blocoSkeleton("h-4 w-3/4"),
          blocoSkeleton("h-4 w-1/2"),
        ),
        el(
          "div",
          { class: `${CLASSE_PAINEL} space-y-3` },
          blocoSkeleton("h-5 w-44"),
          blocoSkeleton("h-16 w-full rounded-xl"),
          blocoSkeleton("h-16 w-full rounded-xl"),
        ),
      ),
      el(
        "div",
        { class: `${CLASSE_PAINEL} p-0 overflow-hidden` },
        el(
          "div",
          { class: "px-5 py-3 border-b border-linha flex justify-between" },
          blocoSkeleton("h-5 w-40"),
          blocoSkeleton("h-8 w-32 rounded-full"),
        ),
        ...Array.from({ length: 5 }, () =>
          el(
            "div",
            { class: "px-5 py-3 border-b border-linha/60 last:border-0 flex gap-3" },
            blocoSkeleton("h-4 w-28"),
            blocoSkeleton("h-4 w-24"),
            blocoSkeleton("h-4 flex-1"),
            blocoSkeleton("h-4 w-20"),
          ),
        ),
      ),
    ),
  );
}

function badgeStatus(status, mapa) {
  const info = mapa[status] || { rotulo: status || "—", classe: "bg-fundo text-cinza" };
  return el(
    "span",
    {
      class: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.classe}`,
    },
    info.rotulo,
  );
}

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isEditable(c) {
  return c && EDITAVEIS.has(c.status);
}

function canStart(c) {
  return c && ["draft", "paused", "cancelled", "failed", "completed"].includes(c.status);
}

function canPause(c) {
  return c && ATIVAS.has(c.status);
}

function canCancel(c) {
  return c && !["completed", "cancelled"].includes(c.status);
}

function pararPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function iniciarPoll() {
  pararPoll();
  if (!campanha || !ATIVAS.has(campanha.status)) return;
  pollTimer = setInterval(() => {
    void carregarDetalhe(campanhaId, { silencioso: true });
  }, 2000);
}

function fecharModal() {
  if (gerandoIa) return;
  if (modalEl) {
    // O dropdown do select vive no body: precisa ser desmontado antes de remover o modal.
    destruirSelectsEm(modalEl);
    modalEl.remove();
    modalEl = null;
  }
  document.removeEventListener("keydown", onEscModal, true);
}

function onEscModal(e) {
  if (e.key !== "Escape") return;
  // Dropdown aberto consome o Esc: fecha só ele, não o modal por baixo.
  if (haSelectAberto()) return;
  fecharModal();
}

function abrirModal({ eyebrow, titulo, subtitulo, conteudo, maxW = "max-w-2xl" }) {
  fecharModal();
  const painel = el(
    "div",
    {
      class: `bg-superficie border border-linha rounded-2xl shadow-xl w-full ${maxW} max-h-[90vh] overflow-y-auto p-5 sm:p-6`,
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
        el("h2", { class: "font-display text-xl font-semibold tracking-tight" }, titulo),
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

  modalEl = el(
    "div",
    {
      class:
        "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4",
      onclick: fecharModal,
    },
    painel,
  );
  document.body.append(modalEl);
  // Captura: o Slim Select fecha o dropdown antes do bubble; sem isso o Esc fecha o modal junto.
  document.addEventListener("keydown", onEscModal, true);
}

/** Atalho para o select Vekta, com a classe padrão dos campos da página. */
function selectDe(opcoes, valorAtual, atributos = {}, extras = {}) {
  return criarSelect({
    opcoes,
    valor: valorAtual,
    atributos: { class: CLASSE_INPUT, ...atributos },
    ...extras,
  });
}

function campoLabel(rotulo, input, dica = null) {
  return el(
    "label",
    { class: "block space-y-1.5" },
    el("span", { class: "text-sm font-medium text-tinta" }, rotulo),
    input,
    dica == null
      ? null
      : dica.nodeType
        ? dica
        : el("span", { class: "text-xs text-cinza" }, dica),
  );
}

/** Botão visual que dispara um <input type="file"> escondido. */
function botaoArquivo({ rotulo, accept, onchange, classe = CLASSE_BOTAO, icone = "lucide:upload" }) {
  const input = el("input", {
    type: "file",
    accept,
    class: "sr-only",
    tabIndex: -1,
    "aria-hidden": "true",
    onchange: (e) => {
      onchange?.(e.target.files?.[0] || null);
      e.target.value = "";
    },
  });
  const btn = el(
    "button",
    {
      type: "button",
      class: classe,
      onclick: () => input.click(),
    },
    el("iconify-icon", { noobserver: "", icon: icone, class: "text-[15px]", "aria-hidden": "true" }),
    rotulo,
  );
  return el("span", { class: "inline-flex items-center" }, input, btn);
}

function atualizarHeader() {
  const titulo = $("#camp-titulo");
  const sub = $("#camp-subtitulo");
  const voltar = $("#camp-voltar");
  const nova = $("#camp-nova");

  if (vista === "detalhe" && campanha) {
    if (titulo) titulo.textContent = campanha.name || "Campanha";
    if (sub) {
      sub.textContent = `${campanha.sent_count || 0} / ${campanha.total_recipients || 0} enviados${
        campanha.failed_count ? ` · ${campanha.failed_count} falhas` : ""
      }`;
    }
    voltar?.classList.remove("hidden");
    nova?.classList.add("hidden");
  } else {
    if (titulo) titulo.textContent = "Campanhas";
    if (sub) {
      sub.textContent = "Disparo em massa via WhatsApp — destinatários avulsos ou por CSV.";
    }
    voltar?.classList.add("hidden");
    nova?.classList.remove("hidden");
  }
}

// ==========================================================
// API
// ==========================================================

async function checarWhatsapp() {
  try {
    const res = await api("/api/crm/whatsapp");
    const data = res?.data || res;
    whatsappOk = (data?.status || "").toLowerCase() === "connected";
  } catch {
    whatsappOk = false;
  }
}

async function carregarLista({ silencioso = false } = {}) {
  if (!silencioso) {
    setStatus("Carregando campanhas…");
    renderSkeletonLista();
  }
  try {
    const res = await api("/api/crm/campaigns");
    lista = res?.data || [];
    if (vista === "lista") renderLista();
    if (!silencioso) setStatus(lista.length ? `${lista.length} campanha(s)` : "");
  } catch (erro) {
    if (!silencioso) setStatus(erro.message || "Falha ao listar campanhas");
    if (vista === "lista") {
      const host = $("#camp-conteudo");
      if (host) {
        host.replaceChildren(
          el("p", { class: "text-sm text-alerta" }, erro.message || "Falha ao carregar."),
        );
      }
    }
  }
}

async function carregarDetalhe(id, { silencioso = false } = {}) {
  if (!id) return;
  if (!silencioso) {
    setStatus("Carregando campanha…");
    vista = "detalhe";
    campanhaId = id;
    atualizarHeader();
    renderSkeletonDetalhe();
  }
  try {
    const res = await api(`/api/crm/campaigns/${encodeURIComponent(id)}`);
    campanha = res?.data || res;
    campanhaId = campanha.id;
    vista = "detalhe";
    atualizarHeader();
    renderDetalhe();
    iniciarPoll();
    if (!silencioso) setStatus("");
  } catch (erro) {
    if (!silencioso) setStatus(erro.message || "Falha ao carregar campanha");
  }
}

async function acaoCampanha(acao) {
  if (!campanhaId) return;
  setStatus(`${acao}…`);
  try {
    await api(`/api/crm/campaigns/${encodeURIComponent(campanhaId)}/${acao}`, {
      method: "POST",
    });
    await carregarDetalhe(campanhaId);
  } catch (erro) {
    setStatus(erro.message || `Falha ao ${acao}`);
  }
}

// ==========================================================
// Lista
// ==========================================================

function renderLista() {
  const host = $("#camp-conteudo");
  if (!host) return;
  pararPoll();

  if (!lista.length) {
    host.replaceChildren(
      el(
        "div",
        { class: `${CLASSE_PAINEL} text-center py-12` },
        el("p", { class: CLASSE_VAZIO }, "Nenhuma campanha ainda."),
        el(
          "button",
          {
            type: "button",
            class: `${CLASSE_BOTAO_PRIMARIO} mt-4`,
            onclick: () => abrirModalNova(),
          },
          "Criar primeira campanha",
        ),
      ),
    );
    return;
  }

  const tabela = el(
    "div",
    { class: `${CLASSE_PAINEL} p-0 overflow-hidden` },
    el(
      "div",
      { class: "overflow-x-auto" },
      el(
        "table",
        { class: "w-full min-w-[640px] text-sm text-left" },
        el(
          "thead",
          {},
          el(
            "tr",
            { class: "border-b border-linha" },
            el("th", { class: CLASSE_TH }, "Nome"),
            el("th", { class: CLASSE_TH }, "Status"),
            el("th", { class: CLASSE_TH }, "Progresso"),
            el("th", { class: CLASSE_TH }, "Atualizado"),
          ),
        ),
        el(
          "tbody",
          {},
          ...lista.map((c) =>
            el(
              "tr",
              {
                class:
                  "border-b border-linha last:border-0 hover:bg-fundo/60 cursor-pointer transition-colors",
                onclick: () => void carregarDetalhe(c.id),
              },
              el(
                "td",
                { class: "px-4 py-3 font-medium text-tinta" },
                c.name || "—",
              ),
              el("td", { class: "px-4 py-3" }, badgeStatus(c.status, STATUS_CAMPANHA)),
              el(
                "td",
                { class: "px-4 py-3 text-cinza" },
                `${c.sent_count || 0}/${c.total_recipients || 0}`,
                c.failed_count
                  ? el("span", { class: "text-red-600 ml-1" }, `(${c.failed_count} falhas)`)
                  : null,
              ),
              el(
                "td",
                { class: "px-4 py-3 text-cinza whitespace-nowrap" },
                formatarData(c.updated_at),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  host.replaceChildren(tabela);
}

// ==========================================================
// Detalhe
// ==========================================================

function renderDetalhe() {
  const host = $("#camp-conteudo");
  if (!host || !campanha) return;

  const acoes = el("div", { class: "flex flex-wrap items-center gap-2" });
  if (canStart(campanha)) {
    acoes.append(
      el(
        "button",
        {
          type: "button",
          class: CLASSE_BOTAO_PRIMARIO,
          onclick: () => {
            if (!whatsappOk) {
              setStatus("WhatsApp desconectado — conecte nas configurações do CRM.");
              return;
            }
            void acaoCampanha("start");
          },
        },
        campanha.status === "paused" ? "Retomar" : "Iniciar",
      ),
    );
  }
  if (canPause(campanha)) {
    acoes.append(
      el(
        "button",
        { type: "button", class: CLASSE_BOTAO, onclick: () => void acaoCampanha("pause") },
        "Pausar",
      ),
    );
  }
  if (canCancel(campanha)) {
    acoes.append(
      el(
        "button",
        {
          type: "button",
          class: `${CLASSE_BOTAO} text-red-700 border-red-200 hover:border-red-300`,
          onclick: () => void acaoCampanha("cancel"),
        },
        "Cancelar",
      ),
    );
  }

  const editable = isEditable(campanha);

  const config = el(
    "div",
    { class: CLASSE_PAINEL },
    el(
      "div",
      { class: "flex items-center justify-between gap-3 mb-3" },
      el("h3", { class: "font-display text-lg font-semibold" }, "Configurações"),
      badgeStatus(campanha.status, STATUS_CAMPANHA),
    ),
    el(
      "dl",
      { class: "grid grid-cols-2 gap-x-4 gap-y-2 text-sm" },
      el("dt", { class: "text-cinza" }, "Intervalo entre contatos"),
      el("dd", {}, `${campanha.delay_between_contacts_sec ?? 45}s`),
      el("dt", { class: "text-cinza" }, "Variação aleatória"),
      el("dd", {}, `${campanha.delay_jitter_sec ?? 15}s`),
      el("dt", { class: "text-cinza" }, "Início"),
      el("dd", {}, formatarData(campanha.started_at)),
      el("dt", { class: "text-cinza" }, "Conclusão"),
      el("dd", {}, formatarData(campanha.completed_at)),
    ),
    !whatsappOk
      ? el(
          "p",
          { class: "mt-3 text-xs text-amber-700" },
          "WhatsApp desconectado. Conecte na aba CRM antes de iniciar.",
        )
      : null,
  );

  const msgs = campanha.messages || [];
  const sequencia = el(
    "div",
    { class: CLASSE_PAINEL },
    el("h3", { class: "font-display text-lg font-semibold mb-3" }, "Sequência padrão"),
    msgs.length
      ? el(
          "ol",
          { class: "space-y-3" },
          ...msgs.map((msg, i) =>
            el(
              "li",
              { class: "rounded-xl bg-fundo p-3 text-sm" },
              el(
                "div",
                { class: "mb-1 text-xs text-cinza" },
                `Mensagem ${i + 1}`,
                i < msgs.length - 1 ? ` · +${msg.delay_after_sec || 0}s` : "",
              ),
              el("pre", { class: "whitespace-pre-wrap font-sans text-tinta" }, msg.message_body),
            ),
          ),
        )
      : el("p", { class: CLASSE_VAZIO }, "Sem mensagens na sequência."),
    el(
      "p",
      { class: "mt-2 text-xs text-cinza" },
      "Placeholders: {{nome}}, {{contato}}. Anotações do CSV nunca são enviadas.",
    ),
  );

  const recipients = campanha.recipients || [];
  const toolbar = el("div", { class: "flex flex-wrap items-center gap-2" });
  if (editable) {
    toolbar.append(
      el(
        "button",
        {
          type: "button",
          class: CLASSE_BOTAO_PRIMARIO,
          onclick: () => abrirModalDestinatario(),
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:user-plus",
          class: "text-[15px]",
          "aria-hidden": "true",
        }),
        "Adicionar",
      ),
      botaoArquivo({
        rotulo: "Importar CSV",
        accept: ".csv,text/csv",
        onchange: (file) => void importarCsv(file),
      }),
    );
    if (recipients.length) {
      toolbar.append(
        el(
          "button",
          {
            type: "button",
            class: CLASSE_BOTAO,
            onclick: () => abrirModalIa(),
          },
          "Gerar com IA",
        ),
      );
    }
  }

  const destHeader = el(
    "div",
    {
      class:
        "flex flex-wrap items-center justify-between gap-2 border-b border-linha px-5 py-3",
    },
    el(
      "h3",
      { class: "font-display text-lg font-semibold" },
      "Destinatários ",
      el("span", { class: "text-cinza font-normal text-sm" }, `(${recipients.length})`),
    ),
    toolbar,
  );

  const rows = recipients.length
    ? recipients.map((r) =>
        el(
          "tr",
          { class: "border-t border-linha" },
          el("td", { class: "px-3 py-2 text-tinta" }, r.full_name || "—"),
          el("td", { class: "px-3 py-2 text-cinza" }, r.phone),
          el(
            "td",
            {
              class: "max-w-[180px] truncate px-3 py-2 text-cinza",
              title: r.notes || "",
            },
            r.notes || "—",
          ),
          el(
            "td",
            { class: "px-3 py-2 text-xs max-w-[280px]" },
            r.use_custom_message
              ? el(
                  "div",
                  { class: "space-y-1" },
                  el(
                    "span",
                    { class: "font-medium text-sky-800" },
                    `Personalizada (${(r.custom_sequence || []).length})`,
                  ),
                  ...(r.custom_sequence || []).slice(0, 2).map((m, i) =>
                    el(
                      "p",
                      {
                        class: "text-tinta whitespace-pre-wrap line-clamp-2",
                        title: m.message_body || "",
                      },
                      m.message_body || "",
                    ),
                  ),
                  (r.custom_sequence || []).length > 2
                    ? el(
                        "span",
                        { class: "text-cinza" },
                        `+${(r.custom_sequence || []).length - 2} mensagem(ns)`,
                      )
                    : null,
                )
              : el("span", { class: "text-cinza" }, "Padrão"),
          ),
          el("td", { class: "px-3 py-2" }, badgeStatus(r.status, STATUS_DEST)),
          el(
            "td",
            {
              class: "max-w-[160px] truncate px-3 py-2 text-xs text-red-600",
              title: r.error_message || "",
            },
            r.error_message || "",
          ),
          editable
            ? el(
                "td",
                { class: "px-3 py-2" },
                el(
                  "button",
                  {
                    type: "button",
                    class: `${CLASSE_BOTAO} px-3 py-1 text-xs`,
                    onclick: () => abrirModalMensagem(r),
                  },
                  "Editar",
                ),
              )
            : null,
        ),
      )
    : [
        el(
          "tr",
          {},
          el(
            "td",
            {
              colspan: editable ? 7 : 6,
              class: "px-3 py-8 text-center text-cinza",
            },
            "Adicione destinatários individualmente ou importe um CSV",
          ),
        ),
      ];

  const dest = el(
    "div",
    { class: `${CLASSE_PAINEL} p-0 overflow-hidden` },
    destHeader,
    el(
      "p",
      { class: "border-b border-linha px-5 py-2 text-xs text-cinza" },
      "Anotações são internas e nunca são enviadas. CSV: colunas nome, contato/telefone, anotações (substitui a lista).",
    ),
    el(
      "div",
      { class: "overflow-x-auto" },
      el(
        "table",
        { class: "w-full min-w-[760px] text-left text-sm" },
        el(
          "thead",
          { class: "bg-fundo text-cinza" },
          el(
            "tr",
            {},
            el("th", { class: "px-3 py-2 font-medium" }, "Nome"),
            el("th", { class: "px-3 py-2 font-medium" }, "Contato"),
            el("th", { class: "px-3 py-2 font-medium" }, "Anotações"),
            el("th", { class: "px-3 py-2 font-medium" }, "Mensagem"),
            el("th", { class: "px-3 py-2 font-medium" }, "Status"),
            el("th", { class: "px-3 py-2 font-medium" }, "Erro"),
            editable ? el("th", { class: "px-3 py-2 font-medium" }, "") : null,
          ),
        ),
        el("tbody", {}, ...rows),
      ),
    ),
  );

  host.replaceChildren(
    el("div", { class: "flex flex-wrap justify-end gap-2 mb-4" }, acoes),
    el("div", { class: "grid gap-4 md:grid-cols-2 mb-4" }, config, sequencia),
    dest,
  );
}

async function importarCsv(file) {
  if (!file || !campanhaId) return;
  setStatus("Importando CSV…");
  try {
    const csv_content = await file.text();
    await api(`/api/crm/campaigns/${encodeURIComponent(campanhaId)}/import-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv_content }),
    });
    await carregarDetalhe(campanhaId);
    setStatus("CSV importado");
  } catch (erro) {
    setStatus(erro.message || "Falha ao importar CSV");
  }
}

// ==========================================================
// Modais
// ==========================================================

function criarEditorSequencia(msgsIniciais = [{ message_body: "", delay_after_sec: 10 }]) {
  const estado = msgsIniciais.map((m) => ({
    message_body: m.message_body || "",
    delay_after_sec: m.delay_after_sec ?? 10,
  }));
  if (!estado.length) estado.push({ message_body: "", delay_after_sec: 10 });

  const host = el("div", { class: "space-y-3" });

  function render() {
    host.replaceChildren(
      ...estado.map((msg, i) => {
        const ta = el("textarea", {
          class: `${CLASSE_INPUT} min-h-[80px]`,
          rows: 3,
          placeholder: "Olá {{nome}}! …",
          value: msg.message_body,
          oninput: (e) => {
            estado[i].message_body = e.target.value;
          },
        });
        const delay = el("input", {
          type: "number",
          min: "0",
          class: CLASSE_INPUT,
          value: String(msg.delay_after_sec ?? 10),
          oninput: (e) => {
            estado[i].delay_after_sec = Number(e.target.value) || 0;
          },
        });
        return el(
          "div",
          { class: "rounded-xl border border-linha p-3 space-y-2" },
          el(
            "div",
            { class: "flex items-center justify-between" },
            el("span", { class: "text-xs font-mono text-cinza" }, `Mensagem ${i + 1}`),
            estado.length > 1
              ? el(
                  "button",
                  {
                    type: "button",
                    class: "text-xs text-red-600",
                    onclick: () => {
                      estado.splice(i, 1);
                      render();
                    },
                  },
                  "Remover",
                )
              : null,
          ),
          ta,
          i < estado.length
            ? campoLabel("Delay após (s)", delay)
            : null,
        );
      }),
      el(
        "button",
        {
          type: "button",
          class: CLASSE_BOTAO,
          onclick: () => {
            estado.push({ message_body: "", delay_after_sec: 10 });
            render();
          },
        },
        "Adicionar mensagem",
      ),
    );
  }

  render();
  return {
    el: host,
    getMessages: () =>
      estado
        .map((m) => ({
          message_body: (m.message_body || "").trim(),
          delay_after_sec: Number(m.delay_after_sec) || 0,
        }))
        .filter((m) => m.message_body),
  };
}

function abrirModalDestinatario() {
  if (!campanhaId) return;

  const nome = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    placeholder: "Ex.: Maria Silva",
  });
  const telefone = el("input", {
    type: "tel",
    class: CLASSE_INPUT,
    placeholder: "11999999999 ou 5511999999999",
  });
  const notas = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[72px]`,
    rows: 3,
    placeholder: "Contexto interno (nunca é enviado no WhatsApp)",
  });
  const erroEl = el("p", { class: "text-sm text-alerta hidden", role: "alert" });
  const btnSalvar = el("button", { type: "submit", class: CLASSE_BOTAO_PRIMARIO }, "Adicionar");

  const form = el(
    "form",
    {
      class: "space-y-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        const phone = telefone.value.trim();
        if (!phone) {
          erroEl.textContent = "Informe o telefone / WhatsApp.";
          erroEl.classList.remove("hidden");
          return;
        }
        btnSalvar.disabled = true;
        try {
          await api(`/api/crm/campaigns/${encodeURIComponent(campanhaId)}/recipients`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              full_name: nome.value.trim() || null,
              phone,
              notes: notas.value.trim() || null,
            }),
          });
          fecharModal();
          await carregarDetalhe(campanhaId);
          setStatus("Destinatário adicionado");
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao adicionar destinatário";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    campoLabel("Nome", nome),
    campoLabel("Telefone / WhatsApp", telefone, "DDD + número; o DDI 55 é adicionado automaticamente."),
    campoLabel("Anotações (opcional)", notas),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-2" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      btnSalvar,
    ),
  );

  abrirModal({
    eyebrow: "destinatário",
    titulo: "Adicionar destinatário",
    subtitulo: "Inclui um contato na lista sem substituir os demais.",
    conteudo: form,
    maxW: "max-w-lg",
  });
  telefone.focus();
}

function abrirModalNova() {
  const nome = el("input", {
    type: "text",
    class: CLASSE_INPUT,
    placeholder: "Ex.: Black Friday — follow-up",
  });
  const delay = el("input", {
    type: "number",
    min: "0",
    class: CLASSE_INPUT,
    value: "45",
  });
  const jitter = el("input", {
    type: "number",
    min: "0",
    class: CLASSE_INPUT,
    value: "15",
  });
  const seq = criarEditorSequencia([{ message_body: "", delay_after_sec: 10 }]);
  let csvFile = null;
  const csvRotulo = el("span", { class: "text-xs text-cinza" }, "Nenhum arquivo escolhido");
  const csvPicker = botaoArquivo({
    rotulo: "Escolher CSV",
    accept: ".csv,text/csv",
    onchange: (file) => {
      csvFile = file;
      csvRotulo.textContent = file ? file.name : "Nenhum arquivo escolhido";
    },
  });
  const erroEl = el("p", { class: "text-sm text-alerta hidden" });

  const form = el(
    "div",
    { class: "space-y-4" },
    campoLabel("Nome da campanha", nome),
    el(
      "div",
      { class: "grid grid-cols-2 gap-3" },
      campoLabel("Intervalo entre contatos (s)", delay),
      campoLabel("Jitter aleatório (s)", jitter),
    ),
    el("div", {}, el("p", { class: "text-sm font-medium mb-2" }, "Sequência"), seq.el),
    el(
      "div",
      { class: "space-y-1.5" },
      el("span", { class: "text-sm font-medium text-tinta" }, "CSV opcional (nome, contato, anotações)"),
      el("div", { class: "flex flex-wrap items-center gap-3" }, csvPicker, csvRotulo),
    ),
    erroEl,
    el(
      "div",
      { class: "flex justify-end gap-2 pt-2" },
      el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
      el(
        "button",
        {
          type: "button",
          class: CLASSE_BOTAO_PRIMARIO,
          onclick: async () => {
            const messages = seq.getMessages();
            if (!nome.value.trim()) {
              erroEl.textContent = "Informe o nome.";
              erroEl.classList.remove("hidden");
              return;
            }
            if (!messages.length) {
              erroEl.textContent = "Adicione ao menos uma mensagem.";
              erroEl.classList.remove("hidden");
              return;
            }
            try {
              setStatus("Criando campanha…");
              const res = await api("/api/crm/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: nome.value.trim(),
                  delay_between_contacts_sec: Number(delay.value) || 45,
                  delay_jitter_sec: Number(jitter.value) || 15,
                  messages,
                }),
              });
              const criada = res?.data;
              if (csvFile && criada?.id) {
                const csv_content = await csvFile.text();
                await api(`/api/crm/campaigns/${criada.id}/import-csv`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ csv_content }),
                });
              }
              fecharModal();
              await carregarDetalhe(criada.id);
            } catch (erro) {
              erroEl.textContent = erro.message || "Falha ao criar";
              erroEl.classList.remove("hidden");
            }
          },
        },
        "Criar",
      ),
    ),
  );

  abrirModal({
    eyebrow: "whatsapp",
    titulo: "Nova campanha",
    subtitulo: "Defina a sequência. Destinatários podem entrar depois (avulso ou CSV).",
    conteudo: form,
    maxW: "max-w-3xl",
  });
}

function abrirModalMensagem(recipient) {
  let mode = recipient.use_custom_message ? "custom" : "campaign";
  const erroEl = el("p", { class: "text-sm text-alerta hidden" });
  const seqHost = el("div");
  let seqEditor = null;

  const select = selectDe(
    [
      { value: "campaign", label: "Padrão da campanha" },
      { value: "custom", label: "Personalizada" },
    ],
    mode,
    {},
    {
      onChange: (valor) => {
        mode = valor;
        renderBody();
      },
    },
  );

  function renderBody() {
    if (mode === "campaign") {
      const msgs = campanha.messages || [];
      seqHost.replaceChildren(
        el(
          "p",
          { class: "text-sm text-cinza mb-2" },
          "Este contato receberá a sequência padrão da campanha:",
        ),
        ...msgs.map((msg, i) =>
          el(
            "div",
            { class: "rounded-xl border border-linha p-3 text-sm mb-2" },
            el("div", { class: "text-xs text-cinza mb-1" }, `Mensagem ${i + 1}`),
            el("pre", { class: "whitespace-pre-wrap font-sans" }, msg.message_body),
          ),
        ),
      );
      seqEditor = null;
    } else {
      const inicial =
        (recipient.custom_sequence && recipient.custom_sequence.length
          ? recipient.custom_sequence
          : (campanha.messages || []).map((m) => ({
              message_body: m.message_body,
              delay_after_sec: m.delay_after_sec,
            }))) || [{ message_body: "", delay_after_sec: 10 }];
      seqEditor = criarEditorSequencia(inicial);
      seqHost.replaceChildren(
        el(
          "div",
          { class: "flex gap-2 mb-2" },
          el(
            "button",
            {
              type: "button",
              class: CLASSE_BOTAO,
              onclick: async () => {
                try {
                  await api(
                    `/api/crm/campaigns/${campanhaId}/recipients/${recipient.id}/apply-default`,
                    { method: "POST" },
                  );
                  const res = await api(`/api/crm/campaigns/${campanhaId}`);
                  campanha = res?.data;
                  const atualizado = (campanha.recipients || []).find((r) => r.id === recipient.id);
                  if (atualizado) {
                    recipient = atualizado;
                    mode = "custom";
                    select.__vektaSelect?.setSelected?.("custom");
                    select.value = "custom";
                    renderBody();
                  }
                } catch (erro) {
                  erroEl.textContent = erro.message || "Falha";
                  erroEl.classList.remove("hidden");
                }
              },
            },
            "Copiar padrão da campanha",
          ),
        ),
        seqEditor.el,
      );
    }
  }

  renderBody();

  abrirModal({
    eyebrow: "destinatário",
    titulo: `Mensagem — ${recipient.full_name || recipient.phone}`,
    subtitulo: recipient.notes ? `Anotações: ${recipient.notes}` : null,
    conteudo: el(
      "div",
      { class: "space-y-4" },
      campoLabel("Tipo de mensagem", select),
      seqHost,
      erroEl,
      el(
        "div",
        { class: "flex justify-end gap-2" },
        el("button", { type: "button", class: CLASSE_BOTAO, onclick: fecharModal }, "Cancelar"),
        el(
          "button",
          {
            type: "button",
            class: CLASSE_BOTAO_PRIMARIO,
            onclick: async () => {
              try {
                const body =
                  mode === "custom"
                    ? {
                        use_custom_message: true,
                        custom_message: seqEditor?.getMessages() || [],
                      }
                    : { use_custom_message: false };
                if (mode === "custom" && !(body.custom_message || []).length) {
                  erroEl.textContent = "Informe ao menos uma mensagem.";
                  erroEl.classList.remove("hidden");
                  return;
                }
                await api(
                  `/api/crm/campaigns/${campanhaId}/recipients/${recipient.id}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  },
                );
                fecharModal();
                await carregarDetalhe(campanhaId);
              } catch (erro) {
                erroEl.textContent = erro.message || "Falha ao salvar";
                erroEl.classList.remove("hidden");
              }
            },
          },
          "Salvar",
        ),
      ),
    ),
    maxW: "max-w-3xl",
  });
}

async function abrirModalIa() {
  const prompt = el("textarea", {
    class: `${CLASSE_INPUT} min-h-[120px]`,
    rows: 5,
    placeholder:
      "Escreva o system prompt. A IA receberá nome e anotações de cada destinatário.",
  });
  const selectModelo = selectDe(
    [{ value: "", label: "Carregando modelos…", desabilitada: true }],
    "",
    { "aria-label": "Modelo OpenRouter" },
    { busca: true, placeholder: "Selecione um modelo" },
  );
  const erroEl = el("p", { class: "text-sm text-alerta hidden" });
  const infoEl = el("p", { class: "text-xs text-cinza" }, "Carregando modelos do OpenRouter…");

  const loadingEl = el(
    "div",
    {
      class:
        "hidden absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-superficie/85 backdrop-blur-[2px]",
      role: "status",
      "aria-live": "polite",
    },
    el("div", {
      class:
        "h-9 w-9 rounded-full border-2 border-linha border-t-vekta animate-spin",
      "aria-hidden": "true",
    }),
    el("p", { class: "font-display text-sm font-medium text-tinta" }, "Gerando mensagens…"),
    el(
      "p",
      { class: "text-xs text-cinza text-center max-w-xs px-4" },
      "A IA está personalizando a sequência de cada destinatário. Isso pode levar alguns minutos.",
    ),
  );

  const btnCancelar = el(
    "button",
    { type: "button", class: CLASSE_BOTAO, onclick: fecharModal },
    "Cancelar",
  );
  const btnGerar = el(
    "button",
    { type: "button", class: CLASSE_BOTAO_PRIMARIO },
    "Gerar",
  );

  function setGerando(ativo) {
    gerandoIa = ativo;
    prompt.disabled = ativo;
    selectModelo.disabled = ativo;
    btnCancelar.disabled = ativo;
    btnGerar.disabled = ativo;
    loadingEl.classList.toggle("hidden", !ativo);
    btnGerar.replaceChildren(
      ...(ativo
        ? [
            el("div", {
              class: "h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin",
              "aria-hidden": "true",
            }),
            "Gerando…",
          ]
        : ["Gerar"]),
    );
  }

  btnGerar.addEventListener("click", async () => {
    if (gerandoIa) return;
    if (!prompt.value.trim() || !selectModelo.value) {
      erroEl.textContent = "Informe prompt e modelo.";
      erroEl.classList.remove("hidden");
      return;
    }
    erroEl.classList.add("hidden");
    setGerando(true);
    setStatus("Gerando mensagens com IA…");
    try {
      const res = await api(`/api/crm/campaigns/${campanhaId}/generate-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: prompt.value.trim(),
          model: selectModelo.value,
        }),
      });
      gerandoIa = false;
      fecharModal();
      await carregarDetalhe(campanhaId);
      const d = res?.data;
      setStatus(
        d
          ? `IA: ${d.generated}/${d.total} geradas${d.failed_count ? `, ${d.failed_count} falhas` : ""}`
          : "Mensagens geradas",
      );
    } catch (erro) {
      setGerando(false);
      erroEl.textContent = erro.message || "Falha na geração";
      erroEl.classList.remove("hidden");
      setStatus(erro.message || "Falha na geração com IA");
    }
  });

  try {
    const res = await api("/api/crm/campaigns/openrouter-models");
    const models = res?.data?.models || [];
    const opcoes = models.map((m) => ({
      value: m.id,
      label: m.label || m.name || m.id,
    }));
    definirOpcoes(selectModelo, opcoes, opcoes[0]?.value || "");
    infoEl.textContent = `${models.length} modelo${models.length === 1 ? "" : "s"} — use a busca para filtrar`;
  } catch (erro) {
    definirOpcoes(
      selectModelo,
      [{ value: "", label: "Falha ao carregar", desabilitada: true }],
      "",
    );
    infoEl.textContent = erro.message || "Falha ao listar modelos";
  }

  abrirModal({
    eyebrow: "ia",
    titulo: "Gerar mensagens com IA",
    subtitulo: "Uma requisição OpenRouter por destinatário. Quebras de linha viram mensagens.",
    conteudo: el(
      "div",
      { class: "relative space-y-4 min-h-[12rem]" },
      loadingEl,
      campoLabel("Modelo", selectModelo, infoEl),
      campoLabel("System prompt", prompt),
      erroEl,
      el("div", { class: "flex justify-end gap-2" }, btnCancelar, btnGerar),
    ),
    maxW: "max-w-2xl",
  });
}

// ==========================================================
// Ciclo de vida
// ==========================================================

function irParaLista() {
  vista = "lista";
  campanha = null;
  campanhaId = null;
  pararPoll();
  atualizarHeader();
  void carregarLista();
}

async function refrescar() {
  await checarWhatsapp();
  if (vista === "detalhe" && campanhaId) await carregarDetalhe(campanhaId);
  else await carregarLista();
}

export function iniciar() {
  if (iniciado) {
    void refrescar();
    return;
  }
  iniciado = true;

  $("#camp-nova")?.addEventListener("click", () => abrirModalNova());
  $("#camp-voltar")?.addEventListener("click", () => irParaLista());
  $("#camp-atualizar")?.addEventListener("click", () => void refrescar());

  atualizarHeader();
  void refrescar();
}

export function atualizar() {
  void refrescar();
}
