/**
 * Página WhatsApp — inbox de conversas, painel de lead/deal e toggle da IA.
 */
import { $, el, api } from "../.core/util.js";

const moedaBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

let iniciado = false;
let buscaWaChatsTimer = null;
let buscaWaChatsAtual = "";
/** @type {ReturnType<typeof setInterval> | null} */
let waInboxPollTimer = null;
/** @type {Array<Record<string, unknown>>} */
let waInboxChats = [];
/** @type {Record<string, unknown> | null} */
let waInboxChatAtivo = null;
let waInboxStatus = "disconnected";
/**
 * @type {Map<string, { jid: string, body: string, status: "pending"|"error", wa_timestamp: string, has_media?: boolean, preview?: string|null }>}
 */
const waInboxOtimistas = new Map();

/** @type {{ file: File, dataUrl: string, mimetype: string, filename: string } | null} */
let waInboxAnexo = null;

let painelCrmAberto = false;
/** @type {Record<string, unknown> | null} */
let leadPainel = null;
/** @type {Record<string, unknown> | null} */
let dealPainel = null;
let carregandoPainel = false;
let toggleIaEmAndamento = false;

function formatarValor(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? moedaBRL.format(n) : "—";
}

function formatarData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setStatus(texto) {
  const alvo = $("#wa-status");
  if (alvo) alvo.textContent = texto || "";
}

function blocoSkeleton(classe) {
  return el("div", { class: `skeleton ${classe}`, "aria-hidden": "true" });
}

function leadIdDoChat(chat = waInboxChatAtivo) {
  const id = chat?.lead_id ?? leadPainel?.id ?? null;
  return id != null ? Number(id) : null;
}

function iaPausada(lead = leadPainel) {
  return Boolean(lead?.whatsapp_agent_paused_at);
}

function pararPollWaInbox() {
  if (waInboxPollTimer) {
    clearInterval(waInboxPollTimer);
    waInboxPollTimer = null;
  }
}

function paginaWhatsappVisivel() {
  const aba = $("#aba-whatsapp");
  return Boolean(aba && !aba.classList.contains("hidden"));
}

function iniciarPollWaInbox() {
  pararPollWaInbox();
  waInboxPollTimer = setInterval(() => {
    if (!paginaWhatsappVisivel() || !waInboxChatAtivo?.whatsapp_jid) {
      return;
    }
    void carregarWaMensagens(String(waInboxChatAtivo.whatsapp_jid), {
      silencioso: true,
    });
    void carregarWaChats(buscaWaChatsAtual, { silencioso: true });
  }, 6000);
}

function tituloWaChat(chat) {
  if (!chat) return "Selecione uma conversa";
  return (
    chat.contact_name ||
    chat.phone_number ||
    String(chat.whatsapp_jid || "").replace(/@.*$/, "") ||
    "Conversa"
  );
}

function previewWaMsg(last) {
  if (!last) return "Sem mensagens";
  const prefixo = last.direction === "outbound" ? "Você: " : "";
  const corpo = last.body || (last.has_media ? "[mídia]" : "");
  return `${prefixo}${corpo}`.trim() || "—";
}

function bolhaWaInbox(msg) {
  const outbound = msg.direction === "outbound";
  const status = msg._status || "sent";
  const quando = formatarData(msg.wa_timestamp || msg.created_at) || "agora";
  const tempId = msg._tempId || null;

  let bolhaClass = outbound
    ? "bg-vekta text-white rounded-br-md"
    : "bg-superficie border border-linha text-tinta rounded-bl-md";
  if (status === "pending") {
    bolhaClass = "bg-vekta/55 text-white/90 rounded-br-md opacity-70";
  } else if (status === "error") {
    bolhaClass =
      "bg-alerta/90 text-white rounded-br-md border border-alerta";
  }

  const metaFilhos = [];
  if (status === "pending") {
    metaFilhos.push(
      el("iconify-icon", {
        noobserver: "",
        icon: "lucide:clock",
        class: "text-[11px] opacity-90",
        "aria-hidden": "true",
      }),
    );
  } else if (status === "error") {
    metaFilhos.push(
      el("iconify-icon", {
        noobserver: "",
        icon: "lucide:circle-alert",
        class: "text-[11px]",
        "aria-hidden": "true",
      }),
      el("span", {}, "falha"),
    );
  }
  metaFilhos.push(el("span", {}, quando));

  const attrs = {
    class: `flex ${outbound ? "justify-end" : "justify-start"}`,
  };
  if (tempId) attrs["data-wa-temp"] = tempId;
  if (status === "pending" || status === "error") {
    attrs["data-wa-optimistic"] = status;
  }

  const filhosBolha = [];
  const preview =
    (typeof msg.media?.data === "string" && msg.media.data.startsWith("data:")
      ? msg.media.data
      : null) ||
    (typeof msg._preview === "string" ? msg._preview : null);
  if (preview || msg.has_media) {
    if (preview) {
      filhosBolha.push(
        el("img", {
          src: preview,
          alt: msg.media?.filename || "Imagem",
          class: "mb-2 max-h-48 w-auto max-w-full rounded-lg object-cover",
        }),
      );
    } else {
      filhosBolha.push(
        el(
          "p",
          { class: "mb-1 text-xs opacity-80" },
          msg.media?.filename || "[imagem]",
        ),
      );
    }
  }
  if (msg.body) {
    filhosBolha.push(
      el("p", { class: "whitespace-pre-wrap break-words" }, msg.body),
    );
  } else if (!preview && !msg.has_media) {
    filhosBolha.push(el("p", { class: "whitespace-pre-wrap break-words" }, ""));
  }

  return el(
    "div",
    attrs,
    el(
      "div",
      { class: `max-w-[75%] rounded-2xl px-3 py-2 text-sm ${bolhaClass}` },
      ...filhosBolha,
      el(
        "p",
        {
          class: `font-mono text-[10px] mt-1 flex items-center justify-end gap-1 ${
            status === "error"
              ? "text-white/90"
              : outbound
                ? "text-white/70"
                : "text-cinza-claro"
          }`,
        },
        ...metaFilhos,
      ),
    ),
  );
}

function anexarWaOtimistasDoChat(painel, jid) {
  if (!painel || !jid) return;
  for (const [tempId, item] of waInboxOtimistas) {
    if (item.jid !== jid) continue;
    if (painel.querySelector(`[data-wa-temp="${tempId}"]`)) continue;
    painel.append(
      bolhaWaInbox({
        direction: "outbound",
        body: item.body,
        wa_timestamp: item.wa_timestamp,
        has_media: Boolean(item.has_media),
        _preview: item.preview || null,
        _status: item.status,
        _tempId: tempId,
      }),
    );
  }
}

function marcarWaOtimistaErro(tempId) {
  const item = waInboxOtimistas.get(tempId);
  if (!item) return;
  item.status = "error";
  waInboxOtimistas.set(tempId, item);
  const painel = $("#wa-chat-mensagens");
  const bolhaEl = painel?.querySelector(`[data-wa-temp="${tempId}"]`);
  if (!bolhaEl) return;
  const inner = bolhaEl.firstElementChild;
  const meta = inner?.querySelector("p.font-mono");
  const quando = formatarData(item.wa_timestamp) || "agora";
  bolhaEl.setAttribute("data-wa-optimistic", "error");
  if (inner) {
    inner.className =
      "max-w-[75%] rounded-2xl px-3 py-2 text-sm bg-alerta/90 text-white rounded-br-md border border-alerta";
  }
  if (meta) {
    meta.className =
      "font-mono text-[10px] mt-1 flex items-center justify-end gap-1 text-white/90";
    meta.replaceChildren(
      el("iconify-icon", {
        noobserver: "",
        icon: "lucide:circle-alert",
        class: "text-[11px]",
        "aria-hidden": "true",
      }),
      el("span", {}, "falha"),
      el("span", {}, quando),
    );
  }
}

function concluirWaOtimista(tempId) {
  waInboxOtimistas.delete(tempId);
  const painel = $("#wa-chat-mensagens");
  painel?.querySelector(`[data-wa-temp="${tempId}"]`)?.remove();
}

function atualizarWaAnexoPreview() {
  const wrap = $("#wa-chat-anexo-preview");
  const thumb = $("#wa-chat-anexo-thumb");
  const nome = $("#wa-chat-anexo-nome");
  if (!wrap || !thumb || !nome) return;
  if (!waInboxAnexo) {
    wrap.classList.add("hidden");
    wrap.classList.remove("flex");
    thumb.removeAttribute("src");
    nome.textContent = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.classList.add("flex");
  thumb.src = waInboxAnexo.dataUrl;
  nome.textContent = waInboxAnexo.filename;
}

function limparWaAnexo() {
  waInboxAnexo = null;
  const input = $("#wa-chat-anexo");
  if (input) input.value = "";
  atualizarWaAnexoPreview();
  atualizarWaComposer();
}

function atualizarWaComposer() {
  const conectado = waInboxStatus === "connected";
  const temChat = Boolean(waInboxChatAtivo?.whatsapp_jid);
  const input = $("#wa-chat-input");
  const btn = $("#wa-chat-enviar");
  const anexoBtn = $("#wa-chat-anexo-btn");
  if (input) {
    input.disabled = !conectado || !temChat;
    input.placeholder = !temChat
      ? "Selecione uma conversa…"
      : !conectado
        ? "WhatsApp desconectado — conecte nas configurações."
        : "Escrever mensagem…";
  }
  if (btn) btn.disabled = !conectado || !temChat;
  if (anexoBtn) anexoBtn.disabled = !conectado || !temChat;
}

function atualizarWaAviso() {
  const aviso = $("#wa-inbox-aviso");
  if (!aviso) return;
  if (waInboxStatus === "connected") {
    aviso.classList.add("hidden");
    aviso.textContent = "";
    return;
  }
  aviso.classList.remove("hidden");
  if (waInboxStatus === "connecting") {
    aviso.textContent =
      "WhatsApp conectando… Escaneie o QR nas configurações se necessário.";
  } else {
    aviso.textContent =
      "WhatsApp não está conectado. Abra as configurações do CRM para conectar antes de enviar mensagens.";
  }
}

function botaoHeaderIcone({ icon, label, ativo = false, disabled = false, onclick }) {
  return el(
    "button",
    {
      type: "button",
      title: label,
      "aria-label": label,
      "aria-pressed": String(ativo),
      disabled: disabled ? "" : undefined,
      class: `inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta disabled:opacity-40 ${
        ativo
          ? "border-vekta bg-vekta/15 text-vekta"
          : "border-linha bg-fundo text-cinza hover:text-tinta hover:bg-superficie"
      }`,
      onclick,
    },
    el("iconify-icon", {
      noobserver: "",
      icon,
      class: "text-[17px]",
      "aria-hidden": "true",
    }),
  );
}

function renderWaChatHeader(chat) {
  const header = $("#wa-chat-header");
  if (!header) return;
  if (!chat) {
    header.replaceChildren(
      el("p", { class: "text-sm text-cinza truncate" }, "Selecione uma conversa"),
    );
    return;
  }

  const sub = chat.phone_number || chat.whatsapp_jid || "";
  const leadId = leadIdDoChat(chat);
  const pausada = iaPausada();
  const temLead = leadId != null;

  header.replaceChildren(
    el(
      "div",
      { class: "min-w-0 flex-1" },
      el(
        "div",
        { class: "flex items-center gap-1.5 min-w-0" },
        el(
          "p",
          { class: "text-sm font-medium text-tinta truncate" },
          tituloWaChat(chat),
        ),
        botaoHeaderIcone({
          icon: "lucide:circle-help",
          label: painelCrmAberto
            ? "Fechar detalhes do contato"
            : "Ver detalhes do contato",
          ativo: painelCrmAberto,
          onclick: () => void alternarPainelCrm(),
        }),
      ),
      sub
        ? el(
            "p",
            { class: "font-mono text-[11px] text-cinza truncate" },
            String(sub),
          )
        : null,
    ),
    el(
      "div",
      { class: "shrink-0 flex items-center gap-2" },
      temLead
        ? el(
            "span",
            {
              class: `font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                pausada
                  ? "bg-alerta/15 text-alerta"
                  : "bg-vekta/15 text-vekta"
              }`,
            },
            pausada ? "IA pausada" : "IA ativa",
          )
        : null,
      botaoHeaderIcone({
        icon: pausada ? "lucide:bot-off" : "lucide:bot",
        label: !temLead
          ? "Sem lead vinculado — IA indisponível"
          : pausada
            ? "Reativar IA"
            : "Pausar IA",
        ativo: temLead && !pausada,
        disabled: !temLead || toggleIaEmAndamento,
        onclick: () => void alternarIaAgent(),
      }),
    ),
  );
}

function aplicarVisibilidadePainel() {
  const painel = $("#wa-painel-crm");
  if (!painel) return;
  painel.classList.toggle("hidden", !painelCrmAberto);
}

function linhaInfo(rotulo, valor) {
  if (valor == null || valor === "") return null;
  return el(
    "div",
    { class: "space-y-0.5" },
    el(
      "p",
      { class: "font-mono text-[10px] uppercase tracking-wider text-cinza" },
      rotulo,
    ),
    el("p", { class: "text-sm text-tinta break-words" }, String(valor)),
  );
}

function secaoPainel(titulo, ...filhos) {
  const itens = filhos.filter(Boolean);
  if (!itens.length) return null;
  return el(
    "section",
    { class: "space-y-2" },
    el("h3", { class: "text-sm font-medium text-tinta" }, titulo),
    el("div", { class: "space-y-3" }, ...itens),
  );
}

function cardAnotacao(atividade) {
  return el(
    "div",
    { class: "rounded-xl border border-linha bg-fundo px-3 py-2.5 space-y-1" },
    atividade.subject
      ? el("p", { class: "text-sm font-medium text-tinta" }, atividade.subject)
      : null,
    atividade.body
      ? el(
          "p",
          { class: "text-sm text-tinta whitespace-pre-wrap break-words" },
          atividade.body,
        )
      : null,
    el(
      "p",
      { class: "font-mono text-[10px] text-cinza-claro" },
      [
        formatarData(atividade.created_at),
        atividade.user?.name ? `· ${atividade.user.name}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );
}

function secaoAnotacoes(activities) {
  const notas = (Array.isArray(activities) ? activities : []).filter(
    (a) => a?.type === "note",
  );
  return el(
    "section",
    { class: "space-y-2" },
    el("h3", { class: "text-sm font-medium text-tinta" }, "Anotações"),
    notas.length
      ? el(
          "div",
          { class: "space-y-2" },
          ...notas.map((n) => cardAnotacao(n)),
        )
      : el("p", { class: "text-sm text-cinza" }, "Nenhuma anotação ainda."),
  );
}

function renderPainelCrm() {
  const conteudo = $("#wa-painel-conteudo");
  if (!conteudo) return;

  if (carregandoPainel) {
    conteudo.replaceChildren(
      el("p", { class: "text-sm text-cinza" }, "Carregando…"),
    );
    return;
  }

  if (!leadPainel && !dealPainel) {
    conteudo.replaceChildren(
      el(
        "p",
        { class: "text-sm text-cinza" },
        "Nenhum lead ou negócio vinculado a esta conversa.",
      ),
    );
    return;
  }

  const blocos = [];

  if (leadPainel) {
    const lead = leadPainel;
    blocos.push(
      secaoPainel(
        "Lead",
        linhaInfo("Nome", lead.name || lead.title),
        linhaInfo("Título", lead.title && lead.title !== lead.name ? lead.title : null),
        linhaInfo("Status", lead.status),
        linhaInfo("Estágio", lead.stage?.name),
        linhaInfo("Valor", lead.value != null ? formatarValor(lead.value) : null),
        linhaInfo("Telefone", lead.mobile),
        linhaInfo("E-mail", lead.email),
        linhaInfo("Instagram", lead.instagram),
        linhaInfo("Organização", lead.organization_name || lead.organization?.name),
        linhaInfo("Origem", lead.source?.name),
        linhaInfo("Responsável", lead.owner?.name),
        linhaInfo(
          "IA",
          lead.whatsapp_agent_paused_at
            ? `Pausada desde ${formatarData(lead.whatsapp_agent_paused_at)}`
            : "Ativa",
        ),
        lead.lost_reason ? linhaInfo("Motivo da perda", lead.lost_reason) : null,
      ),
    );
  }

  if (dealPainel) {
    const deal = dealPainel;
    blocos.push(
      secaoPainel(
        "Negócio",
        linhaInfo("Título", deal.title),
        linhaInfo("Estágio", deal.stage?.name),
        linhaInfo(
          "Valor",
          deal.value != null ? formatarValor(deal.value) : null,
        ),
        linhaInfo(
          "Probabilidade",
          deal.probability != null ? `${deal.probability}%` : null,
        ),
        linhaInfo(
          "Previsão de fechamento",
          deal.expected_close_on
            ? formatarData(deal.expected_close_on)
            : null,
        ),
        linhaInfo("Contato", deal.contact?.name),
        linhaInfo(
          "Organização",
          deal.organization?.name || deal.organization_name,
        ),
        linhaInfo("Origem", deal.source?.name),
        linhaInfo("Responsável", deal.owner?.name),
        deal.lost_reason ? linhaInfo("Motivo da perda", deal.lost_reason) : null,
      ),
    );
  }

  const activities =
    leadPainel?.activities || dealPainel?.activities || [];
  blocos.push(secaoAnotacoes(activities));

  conteudo.replaceChildren(...blocos.filter(Boolean));
}

async function carregarDadosPainel(chat = waInboxChatAtivo) {
  leadPainel = null;
  dealPainel = null;
  if (!chat) {
    renderPainelCrm();
    renderWaChatHeader(null);
    return;
  }

  const leadId = chat.lead_id != null ? Number(chat.lead_id) : null;
  const dealId = chat.deal_id != null ? Number(chat.deal_id) : null;

  if (!leadId && !dealId) {
    renderPainelCrm();
    renderWaChatHeader(chat);
    return;
  }

  carregandoPainel = true;
  renderPainelCrm();
  renderWaChatHeader(chat);

  try {
    const promessas = [];
    if (leadId) {
      promessas.push(
        api(`/api/crm/leads/${leadId}`).then((r) => {
          leadPainel = r?.data || null;
        }),
      );
    }
    if (dealId) {
      promessas.push(
        api(`/api/crm/deals/${dealId}`).then((r) => {
          dealPainel = r?.data || null;
        }),
      );
    }
    await Promise.all(promessas);

    if (!leadPainel && dealPainel?.lead_id) {
      try {
        const r = await api(`/api/crm/leads/${dealPainel.lead_id}`);
        leadPainel = r?.data || null;
      } catch {
        /* lead opcional via deal */
      }
    }
  } catch (erro) {
    if (painelCrmAberto) {
      const conteudo = $("#wa-painel-conteudo");
      conteudo?.replaceChildren(
        el(
          "p",
          { class: "text-sm text-alerta" },
          erro.message || "Falha ao carregar detalhes",
        ),
      );
    }
  } finally {
    carregandoPainel = false;
    renderPainelCrm();
    renderWaChatHeader(waInboxChatAtivo);
  }
}

async function alternarPainelCrm() {
  painelCrmAberto = !painelCrmAberto;
  aplicarVisibilidadePainel();
  renderWaChatHeader(waInboxChatAtivo);
  if (painelCrmAberto) {
    await carregarDadosPainel(waInboxChatAtivo);
  }
}

function fecharPainelCrm() {
  if (!painelCrmAberto) return;
  painelCrmAberto = false;
  aplicarVisibilidadePainel();
  renderWaChatHeader(waInboxChatAtivo);
}

async function alternarIaAgent() {
  const leadId = leadIdDoChat();
  if (!leadId || toggleIaEmAndamento) return;

  const pausada = iaPausada();
  const acao = pausada ? "resume" : "pause";
  toggleIaEmAndamento = true;
  renderWaChatHeader(waInboxChatAtivo);
  setStatus(pausada ? "Reativando IA…" : "Pausando IA…");

  try {
    const resp = await api(`/api/crm/leads/${leadId}/agent/${acao}`, {
      method: "POST",
    });
    leadPainel = resp?.data || leadPainel;
    if (leadPainel && waInboxChatAtivo) {
      waInboxChatAtivo = {
        ...waInboxChatAtivo,
        lead_id: leadPainel.id ?? waInboxChatAtivo.lead_id,
      };
    }
    renderPainelCrm();
    setStatus("");
  } catch (erro) {
    setStatus(erro.message || "Falha ao alterar IA");
  } finally {
    toggleIaEmAndamento = false;
    renderWaChatHeader(waInboxChatAtivo);
  }
}

function renderWaChatsLista() {
  const lista = $("#wa-chats-lista");
  if (!lista) return;
  lista.innerHTML = "";
  lista.setAttribute("role", "listbox");
  lista.setAttribute("aria-label", "Conversas WhatsApp");

  if (!waInboxChats.length) {
    lista.append(
      el(
        "p",
        { class: "text-sm text-cinza text-center px-4 py-10" },
        buscaWaChatsAtual
          ? "Nenhuma conversa encontrada."
          : "Nenhuma conversa ainda. Mensagens recebidas/enviadas pelo CRM aparecem aqui.",
      ),
    );
    return;
  }

  const jidAtivo = waInboxChatAtivo?.whatsapp_jid
    ? String(waInboxChatAtivo.whatsapp_jid)
    : "";

  for (const chat of waInboxChats) {
    const jid = String(chat.whatsapp_jid || "");
    const ativo = jid === jidAtivo;
    const initial = (tituloWaChat(chat) || "?").trim().charAt(0).toUpperCase();
    const btn = el(
      "button",
      {
        type: "button",
        role: "option",
        "aria-selected": String(ativo),
        class: `w-full text-left px-3 py-3 flex gap-3 border-b border-linha/40 transition-colors ${
          ativo ? "bg-vekta/15" : "hover:bg-fundo"
        }`,
        onclick: () => void selecionarWaChat(chat),
      },
      el(
        "span",
        {
          class:
            "shrink-0 w-10 h-10 rounded-full bg-superficie border border-linha flex items-center justify-center font-display text-sm text-tinta",
          "aria-hidden": "true",
        },
        initial,
      ),
      el(
        "span",
        { class: "flex-1 min-w-0 flex flex-col gap-0.5" },
        el(
          "span",
          { class: "flex items-baseline justify-between gap-2" },
          el(
            "span",
            { class: "text-sm font-medium text-tinta truncate" },
            tituloWaChat(chat),
          ),
          el(
            "span",
            { class: "font-mono text-[10px] text-cinza-claro shrink-0" },
            formatarData(
              chat.last_message?.wa_timestamp || chat.last_message?.created_at,
            ),
          ),
        ),
        el(
          "span",
          { class: "text-xs text-cinza truncate" },
          previewWaMsg(chat.last_message),
        ),
      ),
    );
    lista.append(btn);
  }
}

async function carregarWaChats(busca = "", { silencioso = false } = {}) {
  const lista = $("#wa-chats-lista");
  try {
    const q = busca.trim()
      ? `?search=${encodeURIComponent(busca.trim())}`
      : "";
    const resp = await api(`/api/crm/whatsapp/chats${q}`);
    waInboxChats = Array.isArray(resp.data) ? resp.data : [];
    renderWaChatsLista();
  } catch (erro) {
    if (!silencioso && lista) {
      lista.replaceChildren(
        el(
          "p",
          { class: "text-sm text-alerta text-center px-4 py-10" },
          erro.message || "Falha ao carregar conversas",
        ),
      );
    }
  }
}

async function carregarWaMensagens(jid, { silencioso = false } = {}) {
  const painel = $("#wa-chat-mensagens");
  const erroEl = $("#wa-chat-erro");
  if (!painel || !jid) return;
  if (erroEl && !silencioso) {
    erroEl.classList.add("hidden");
    erroEl.textContent = "";
  }
  if (!silencioso) {
    painel.replaceChildren(
      el(
        "p",
        { class: "text-sm text-cinza self-center m-auto" },
        "Carregando conversa…",
      ),
    );
  }
  try {
    const resp = await api(
      `/api/crm/whatsapp/messages?jid=${encodeURIComponent(jid)}`,
    );
    const msgs = Array.isArray(resp.data) ? resp.data : [];
    const vistos = new Set();
    const msgsUnicas = [];
    for (const msg of msgs) {
      const chave = msg.message_id
        ? `mid:${msg.message_id}`
        : `soft:${msg.direction || ""}|${msg.body ?? ""}|${msg.wa_timestamp || msg.created_at || ""}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      msgsUnicas.push(msg);
    }
    const noFundo =
      painel.scrollHeight - painel.scrollTop - painel.clientHeight < 80;
    const temOtimistas = [...waInboxOtimistas.values()].some((o) => o.jid === jid);
    painel.replaceChildren();
    if (!msgsUnicas.length && !temOtimistas) {
      painel.append(
        el(
          "p",
          { class: "text-sm text-cinza self-center m-auto" },
          "Nenhuma mensagem nesta conversa ainda.",
        ),
      );
    } else {
      for (const msg of msgsUnicas) painel.append(bolhaWaInbox(msg));
      anexarWaOtimistasDoChat(painel, jid);
      if (!silencioso || noFundo) painel.scrollTop = painel.scrollHeight;
    }
  } catch (erro) {
    if (!silencioso) {
      painel.replaceChildren();
      if (erroEl) {
        erroEl.textContent = erro.message || "Falha ao carregar mensagens";
        erroEl.classList.remove("hidden");
      }
    }
  }
}

async function selecionarWaChat(chat) {
  waInboxChatAtivo = chat;
  leadPainel = null;
  dealPainel = null;
  renderWaChatsLista();
  renderWaChatHeader(chat);
  atualizarWaComposer();
  await carregarWaMensagens(String(chat.whatsapp_jid));
  await carregarDadosPainel(chat);
  iniciarPollWaInbox();
}

async function enviarWaInbox(event) {
  event?.preventDefault?.();
  const input = $("#wa-chat-input");
  const erroEl = $("#wa-chat-erro");
  const painel = $("#wa-chat-mensagens");
  const texto = input?.value?.trim() || "";
  const jid = waInboxChatAtivo?.whatsapp_jid;
  const anexo = waInboxAnexo;
  if ((!texto && !anexo) || !jid || waInboxStatus !== "connected") return;

  if (erroEl) {
    erroEl.classList.add("hidden");
    erroEl.textContent = "";
  }
  if (input) input.value = "";
  const anexoEnvio = anexo;
  limparWaAnexo();

  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const agora = new Date().toISOString();
  waInboxOtimistas.set(tempId, {
    jid: String(jid),
    body: texto,
    status: "pending",
    wa_timestamp: agora,
    has_media: Boolean(anexoEnvio),
    preview: anexoEnvio?.dataUrl || null,
  });

  const bolha = bolhaWaInbox({
    direction: "outbound",
    body: texto,
    wa_timestamp: agora,
    has_media: Boolean(anexoEnvio),
    _preview: anexoEnvio?.dataUrl || null,
    _status: "pending",
    _tempId: tempId,
  });

  if (painel) {
    const vazio = painel.querySelector("p.text-cinza");
    if (vazio && painel.children.length === 1) painel.replaceChildren();
    painel.append(bolha);
    painel.scrollTop = painel.scrollHeight;
  }

  if (waInboxChatAtivo) {
    waInboxChatAtivo = {
      ...waInboxChatAtivo,
      last_message: {
        body: texto || (anexoEnvio ? "[imagem]" : ""),
        direction: "outbound",
        wa_timestamp: agora,
        has_media: Boolean(anexoEnvio),
      },
    };
    const idx = waInboxChats.findIndex((c) => c.whatsapp_jid === jid);
    if (idx >= 0) {
      waInboxChats[idx] = waInboxChatAtivo;
      const [item] = waInboxChats.splice(idx, 1);
      waInboxChats.unshift(item);
    }
    renderWaChatsLista();
  }

  atualizarWaComposer();
  if (input) input.focus();

  const payload = {
    to: jid,
    message: texto,
    contact_name: waInboxChatAtivo?.contact_name || null,
  };
  if (anexoEnvio) {
    const base64 = String(anexoEnvio.dataUrl).includes(",")
      ? String(anexoEnvio.dataUrl).split(",")[1]
      : String(anexoEnvio.dataUrl);
    payload.media = {
      mimetype: anexoEnvio.mimetype,
      data: base64,
      filename: anexoEnvio.filename,
    };
  }

  try {
    await api("/api/crm/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    concluirWaOtimista(tempId);
    if (waInboxChatAtivo?.whatsapp_jid === jid) {
      await carregarWaMensagens(String(jid), { silencioso: true });
    }
    void carregarWaChats(buscaWaChatsAtual, { silencioso: true });
  } catch (erro) {
    marcarWaOtimistaErro(tempId);
    if (erroEl) {
      erroEl.textContent = erro.message || "Falha ao enviar";
      erroEl.classList.remove("hidden");
    }
  }
}

function onBuscaWaChatsInput(event) {
  const valor = event.target?.value || "";
  buscaWaChatsAtual = valor;
  if (buscaWaChatsTimer) clearTimeout(buscaWaChatsTimer);
  buscaWaChatsTimer = setTimeout(() => {
    void carregarWaChats(buscaWaChatsAtual);
  }, 280);
}

function renderSkeletonWaInbox() {
  const lista = $("#wa-chats-lista");
  if (lista) {
    lista.innerHTML = "";
    lista.setAttribute("role", "status");
    lista.setAttribute("aria-label", "Carregando conversas");
    lista.append(
      ...Array.from({ length: 7 }, () =>
        el(
          "div",
          { class: "px-3 py-3 flex gap-3 border-b border-linha/40" },
          blocoSkeleton("h-10 w-10 rounded-full shrink-0"),
          el(
            "div",
            { class: "flex-1 min-w-0 flex flex-col gap-2 py-0.5" },
            blocoSkeleton("h-3.5 w-2/3"),
            blocoSkeleton("h-3 w-full"),
          ),
        ),
      ),
    );
  }
  const msgs = $("#wa-chat-mensagens");
  if (msgs) {
    msgs.replaceChildren(
      el("p", { class: "text-sm text-cinza self-center m-auto" }, "Carregando…"),
    );
  }
}

async function carregarWaInbox(busca = "") {
  setStatus("Carregando conversas…");
  renderSkeletonWaInbox();
  try {
    const statusResp = await api("/api/crm/whatsapp/status").catch(() =>
      api("/api/crm/whatsapp"),
    );
    waInboxStatus = statusResp?.data?.status || "disconnected";
    atualizarWaAviso();
    atualizarWaComposer();
    await carregarWaChats(busca);
    if (waInboxChatAtivo?.whatsapp_jid) {
      const ainda = waInboxChats.find(
        (c) => c.whatsapp_jid === waInboxChatAtivo.whatsapp_jid,
      );
      if (ainda) waInboxChatAtivo = ainda;
      renderWaChatHeader(waInboxChatAtivo);
      await carregarWaMensagens(String(waInboxChatAtivo.whatsapp_jid));
      await carregarDadosPainel(waInboxChatAtivo);
      iniciarPollWaInbox();
    } else {
      renderWaChatHeader(null);
      const msgs = $("#wa-chat-mensagens");
      msgs?.replaceChildren(
        el(
          "p",
          {
            class:
              "text-sm text-cinza self-center m-auto text-center px-6",
          },
          "Escolha uma conversa à esquerda para ver e enviar mensagens.",
        ),
      );
    }
    setStatus("");
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar inbox WhatsApp");
  }
}

function ligarControles() {
  $("#wa-chats-busca")?.addEventListener("input", onBuscaWaChatsInput);
  $("#wa-chat-form")?.addEventListener("submit", (e) => void enviarWaInbox(e));
  $("#wa-chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviarWaInbox(e);
    }
  });
  $("#wa-chat-anexo-btn")?.addEventListener("click", () => {
    $("#wa-chat-anexo")?.click();
  });
  $("#wa-chat-anexo-remover")?.addEventListener("click", () => limparWaAnexo());
  $("#wa-chat-anexo")?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    const erroEl = $("#wa-chat-erro");
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      if (erroEl) {
        erroEl.textContent = "Selecione apenas imagens.";
        erroEl.classList.remove("hidden");
      }
      limparWaAnexo();
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      if (erroEl) {
        erroEl.textContent = "Imagem muito grande (máx. 8MB).";
        erroEl.classList.remove("hidden");
      }
      limparWaAnexo();
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });
      waInboxAnexo = {
        file,
        dataUrl,
        mimetype: file.type || "image/jpeg",
        filename: file.name || "image.jpg",
      };
      if (erroEl) {
        erroEl.classList.add("hidden");
        erroEl.textContent = "";
      }
      atualizarWaAnexoPreview();
      atualizarWaComposer();
    } catch (erro) {
      limparWaAnexo();
      if (erroEl) {
        erroEl.textContent = erro.message || "Falha ao anexar imagem";
        erroEl.classList.remove("hidden");
      }
    }
  });
  $("#wa-painel-fechar")?.addEventListener("click", () => fecharPainelCrm());
}

export async function iniciar() {
  if (!iniciado) {
    ligarControles();
    iniciado = true;
  }
  aplicarVisibilidadePainel();
  await carregarWaInbox(buscaWaChatsAtual);
}

export async function atualizar() {
  if (!iniciado || !paginaWhatsappVisivel()) return;
  await carregarWaChats(buscaWaChatsAtual, { silencioso: true });
  if (waInboxChatAtivo?.whatsapp_jid) {
    await carregarWaMensagens(String(waInboxChatAtivo.whatsapp_jid), {
      silencioso: true,
    });
  }
}
