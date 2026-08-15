/**
 * Automação Instagram — webhook/lista na subaba + builder na página Fluxos IG.
 */
import {
  $,
  el,
  api,
  CLASSE_PAINEL,
  CLASSE_BOTAO,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_VAZIO,
  animarEntrada,
} from "../.core/util.js";
import { criarSelect, destruirSelectsEm } from "../componentes/select.js";

const TIPOS_NO = [
  { id: "trigger", rotulo: "Trigger", icone: "lucide:zap" },
  { id: "mensagem", rotulo: "Mensagem", icone: "lucide:message-square" },
  { id: "condicao", rotulo: "Condição", icone: "lucide:git-branch" },
  { id: "delay", rotulo: "Delay", icone: "lucide:timer" },
  { id: "tag", rotulo: "Tag", icone: "lucide:tag" },
  { id: "aguardar_resposta", rotulo: "Aguardar", icone: "lucide:message-circle" },
  { id: "fim", rotulo: "Fim", icone: "lucide:flag" },
];

const LABEL_TIPO = Object.fromEntries(TIPOS_NO.map((t) => [t.id, t.rotulo]));

const NODE_W = 188;
const NODE_HANDLE_BASE_Y = 40;

/** @type {{ config: any, eventos: any[], fluxos: any[], fluxo: any | null, selecionado: string | null, ligandoDe: any, linkDrag: any, pan: {x:number,y:number}, zoom: number, dirty: boolean, drag: any, panDrag: any, mostrarConfigWebhook: boolean }} */
const estado = {
  config: null,
  eventos: [],
  fluxos: [],
  fluxo: null,
  selecionado: null,
  ligandoDe: null,
  linkDrag: null,
  pan: { x: 40, y: 40 },
  zoom: 1,
  dirty: false,
  drag: null,
  panDrag: null,
  mostrarConfigWebhook: false,
};

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.15;
const CHAVE_FLUXO_ABERTO = "ig-fluxo-aberto-id";

function uid(prefixo = "n") {
  return `${prefixo}-${Math.random().toString(36).slice(2, 9)}`;
}

function dadosPadrao(tipo) {
  switch (tipo) {
    case "trigger":
      return { evento: "message", palavras: [], qualquer: true, payload: "", media_id: "" };
    case "mensagem":
      return { texto: "", quick_replies: [], botoes: [] };
    case "condicao":
      return { operador: "contem", valor: "" };
    case "delay":
      return { quantidade: 5, unidade: "segundos" };
    case "tag":
      return { tag: "", acao: "adicionar" };
    case "aguardar_resposta":
      return { rotas: [] };
    case "fim":
      return {};
    default:
      return {};
  }
}

function resumoNo(no) {
  const d = no.dados || {};
  if (no.tipo === "trigger") {
    if (d.evento === "comment") {
      if (d.qualquer) return d.media_id ? `Comentário qualquer (${d.media_id})` : "Qualquer comentário";
      if ((d.palavras || []).length) return `Comentário: ${(d.palavras || []).join(", ")}`;
      return "Comentário (post/Reel)";
    }
    if (d.qualquer) return "Qualquer mensagem";
    if ((d.palavras || []).length) return `Keywords: ${(d.palavras || []).join(", ")}`;
    if (d.payload) return `Payload: ${d.payload}`;
    return d.evento || "trigger";
  }
  if (no.tipo === "mensagem") return (d.texto || "Sem texto").slice(0, 48);
  if (no.tipo === "condicao") return `${d.operador || "contem"} “${d.valor || ""}”`;
  if (no.tipo === "delay") return `${d.quantidade || 0} ${d.unidade || "s"}`;
  if (no.tipo === "tag") return `${d.acao || "add"}: ${d.tag || ""}`;
  if (no.tipo === "aguardar_resposta") return "Espera resposta";
  if (no.tipo === "fim") return "Encerra fluxo";
  return no.tipo;
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function campoLabel(texto, input) {
  return el(
    "label",
    { class: "flex flex-col gap-1 text-sm text-tinta" },
    el("span", { class: "text-cinza text-xs font-medium" }, texto),
    input,
  );
}

function inputBase(attrs = {}) {
  return el("input", {
    class:
      "w-full px-3 py-2 border border-linha rounded-xl bg-fundo text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vekta",
    ...attrs,
  });
}

function textareaBase(attrs = {}, valor = "") {
  const t = el(
    "textarea",
    {
      class:
        "w-full px-3 py-2 border border-linha rounded-xl bg-fundo text-sm text-tinta min-h-[88px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vekta",
      ...attrs,
    },
    valor,
  );
  return t;
}

function selectBase(opcoes, valor, onChange) {
  return criarSelect({
    opcoes: opcoes.map((o) => ({ value: o.id, label: o.rotulo })),
    valor,
    onChange,
    atributos: {
      class:
        "w-full px-3 py-2 border border-linha rounded-xl bg-fundo text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vekta",
    },
  });
}

function checklistItem(ok, texto) {
  return el(
    "li",
    { class: "flex items-start gap-2 text-sm" },
    el("iconify-icon", {
      noobserver: "",
      icon: ok ? "lucide:check-circle-2" : "lucide:circle",
      class: `text-base mt-0.5 shrink-0 ${ok ? "text-vekta" : "text-cinza-claro"}`,
      "aria-hidden": "true",
    }),
    el("span", { class: ok ? "text-tinta" : "text-cinza" }, texto),
  );
}

function formatarLinhaEventoWebhook(ev) {
  const quando = ev.recebido_em || "?";
  const e = ev.payload?.evento;
  if (!e) {
    const motivo = ev.payload?.motivo || (ev.payload?.ignorado ? "ignorado" : "?");
    const field = ev.payload?.field || "";
    return `${quando} · ${motivo}${field ? ` · ${field}` : ""}`;
  }
  const quem = e.username ? `@${e.username}` : e.igsid || "";
  const texto = String(e.texto || "").slice(0, 40);
  const dup = ev.payload?.duplicado ? " · dup" : "";
  return `${quando} · ${e.tipo || "?"}${dup} · ${quem} · ${texto}`;
}

function renderConfigWebhook(container) {
  const cfg = estado.config || {};
  const hash = String(cfg.hash || "").trim();
  const token = String(cfg.verify_token || "").trim();
  const urlCompleta = cfg.callback_url || "";
  const urlExibida = urlCompleta
    || (hash
      ? `(defina META_PUBLIC_BASE_URL) /api/instagram/webhook/${hash}`
      : "(gere um hash)");

  const caixaUrl = inputBase({
    type: "text",
    readonly: "",
    value: urlExibida,
  });
  const caixaHash = inputBase({
    type: "text",
    readonly: "",
    value: hash || "(ainda não gerado)",
  });
  const caixaToken = inputBase({
    type: "text",
    readonly: "",
    value: token || "(defina META_WEBHOOK_VERIFY_TOKEN no .env)",
  });

  const msg = el("p", { class: "text-sm text-cinza mt-2 hidden", id: "ig-auto-msg" });

  const btnGerar = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const botao = ev.currentTarget;
        botao.disabled = true;
        try {
          const r = await api("/api/instagram/automacao/config/gerar-hash", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          estado.config = r.config;
          await renderAutomacao();
          // Mensagem no elemento NOVO (o antigo some no rebuild).
          const m = $("#ig-auto-msg");
          if (m) {
            m.textContent = r.config?.hash
              ? "Hash gerado. Cole a Callback URL e o Verify Token no App Dashboard."
              : "Resposta sem hash — tente de novo ou confira o .env / disco.";
            m.classList.remove("hidden");
          }
        } catch (e) {
          const m = $("#ig-auto-msg") || msg;
          m.textContent = e.message || "Falha ao gerar hash.";
          m.classList.remove("hidden");
          botao.disabled = false;
        }
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:key-round", class: "text-[15px]", "aria-hidden": "true" }),
    hash ? "Regenerar hash" : "Gerar hash",
  );

  const toggleAtivo = el("input", {
    type: "checkbox",
    class: "accent-[var(--cor-vekta,#0e8a76)]",
    onchange: async (e) => {
      try {
        const r = await api("/api/instagram/automacao/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ativo: e.target.checked }),
        });
        estado.config = r.config;
      } catch (err) {
        const m = $("#ig-auto-msg") || msg;
        m.textContent = err.message;
        m.classList.remove("hidden");
      }
    },
  });
  toggleAtivo.checked = cfg.ativo !== false;

  const btnCopiarUrl = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: async () => {
        const texto = urlCompleta || (hash ? `/api/instagram/webhook/${hash}` : "");
        if (texto && (await copiar(texto))) {
          const m = $("#ig-auto-msg") || msg;
          m.textContent = urlCompleta
            ? "Callback URL copiada."
            : "Path copiado — complete com META_PUBLIC_BASE_URL (HTTPS).";
          m.classList.remove("hidden");
        }
      },
    },
    "Copiar URL",
  );
  if (!hash) btnCopiarUrl.disabled = true;

  const btnCopiarHash = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: async () => {
        if (hash && (await copiar(hash))) {
          const m = $("#ig-auto-msg") || msg;
          m.textContent = "Hash copiado.";
          m.classList.remove("hidden");
        }
      },
    },
    "Copiar hash",
  );
  if (!hash) btnCopiarHash.disabled = true;

  const btnCopiarToken = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: async () => {
        if (token && (await copiar(token))) {
          const m = $("#ig-auto-msg") || msg;
          m.textContent = "Verify Token copiado.";
          m.classList.remove("hidden");
        }
      },
    },
    "Copiar token",
  );
  if (!token) btnCopiarToken.disabled = true;

  const btnInscrever = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO_PRIMARIO,
      onclick: async () => {
        try {
          btnInscrever.disabled = true;
          const r = await api("/api/instagram/automacao/config/inscrever", { method: "POST" });
          estado.config = r.config;
          const m = $("#ig-auto-msg") || msg;
          m.textContent = "Conta inscrita nos campos de webhook (subscribed_apps).";
          m.classList.remove("hidden");
        } catch (e) {
          const m = $("#ig-auto-msg") || msg;
          m.textContent = e.message;
          m.classList.remove("hidden");
        } finally {
          btnInscrever.disabled = false;
        }
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:radio", class: "text-[15px]", "aria-hidden": "true" }),
    "Inscrever campos na Meta",
  );

  const eventos = (estado.eventos || []).slice(0, 8);
  const listaEventos =
    eventos.length === 0
      ? el("p", { class: CLASSE_VAZIO }, "Nenhum evento recebido ainda.")
      : el(
          "ul",
          { class: "flex flex-col gap-2 max-h-40 overflow-y-auto" },
          ...eventos.map((ev) =>
            el(
              "li",
              { class: "text-xs font-mono text-cinza border border-linha rounded-lg px-3 py-2 bg-fundo" },
              formatarLinhaEventoWebhook(ev),
            ),
          ),
        );

  container.append(
    el(
      "div",
      { class: `${CLASSE_PAINEL} mb-5` },
      el("h3", { class: "font-display text-lg text-tinta mb-1" }, "Webhook Meta"),
      el(
        "p",
        { class: "text-sm text-cinza mb-4 max-w-3xl" },
        "Publique a Callback URL abaixo no App Dashboard (Webhooks → Instagram). O hash na URL protege o path; o Verify Token vem de META_WEBHOOK_VERIFY_TOKEN no .env. App precisa estar Live e com HTTPS público.",
      ),
      el(
        "div",
        { class: "grid gap-4 md:grid-cols-2" },
        el(
          "div",
          { class: "flex flex-col gap-3" },
          campoLabel("Callback URL", caixaUrl),
          el("div", { class: "flex flex-wrap gap-2" }, btnCopiarUrl, btnGerar),
          campoLabel("Hash (path do webhook)", caixaHash),
          el("div", { class: "flex flex-wrap gap-2" }, btnCopiarHash),
          campoLabel("Verify Token", caixaToken),
          el("div", { class: "flex flex-wrap gap-2" }, btnCopiarToken, btnInscrever),
          el(
            "label",
            { class: "inline-flex items-center gap-2 text-sm text-tinta mt-1" },
            toggleAtivo,
            "Automação ativa (processar DMs e comentários)",
          ),
          msg,
        ),
        el(
          "div",
          {},
          el("p", { class: "text-xs font-medium text-cinza mb-2" }, "Checklist"),
          el(
            "ul",
            { class: "flex flex-col gap-2 mb-4" },
            checklistItem(cfg.access_token_ok, "META_ACCESS_TOKEN configurado"),
            checklistItem(cfg.app_secret_ok, "META_APP_SECRET (assinatura X-Hub-Signature-256)"),
            checklistItem(cfg.public_base_url_ok, "META_PUBLIC_BASE_URL HTTPS público"),
            checklistItem(Boolean(cfg.hash), "Hash do webhook gerado"),
            checklistItem(cfg.verify_token_ok, "META_WEBHOOK_VERIFY_TOKEN no .env"),
            checklistItem(
              Array.isArray(cfg.subscribed_fields) && cfg.subscribed_fields.includes("comments"),
              "Field comments na inscrição (comentário → DM)",
            ),
          ),
          el(
            "ol",
            { class: "text-xs text-cinza list-decimal pl-4 space-y-1.5" },
            el("li", {}, "App Dashboard → Webhooks → Callback URL + Verify Token"),
            el(
              "li",
              {},
              "Subscribe: messages, messaging_postbacks, messaging_seen, comments",
            ),
            el("li", {}, "Permissão instagram_business_manage_comments (Private Reply)"),
            el("li", {}, "Clique em “Inscrever campos na Meta” de novo se comments era novo"),
            el("li", {}, "Teste: DM ou comentário no post/Reel com fluxo ativo"),
          ),
        ),
      ),
      el("h4", { class: "text-sm font-medium text-tinta mt-5 mb-2" }, "Últimos eventos"),
      listaEventos,
    ),
  );
}

function handlesDoTipo(tipo) {
  if (tipo === "condicao") return ["sim", "nao"];
  if (tipo === "aguardar_resposta") return ["default", "senao"];
  if (tipo === "fim") return [];
  return ["default"];
}

function desenharArestas(svg, fluxo) {
  // Mantém <defs> (marker da seta); remove só paths/labels.
  for (const child of [...svg.children]) {
    if (child.tagName.toLowerCase() === "defs") continue;
    child.remove();
  }
  const nosMap = Object.fromEntries((fluxo.nos || []).map((n) => [n.id, n]));

  for (const a of fluxo.arestas || []) {
    const de = nosMap[a.de];
    const para = nosMap[a.para];
    if (!de || !para) continue;

    const handles = handlesDoTipo(de.tipo);
    const handle = String(a.handle || "default");
    const idx = Math.max(0, handles.indexOf(handle));
    const total = Math.max(1, handles.length);
    const spread = total > 1 ? 14 : 0;
    const offsetY = total > 1 ? (idx - (total - 1) / 2) * (spread + 10) : 0;

    // Coordenadas no "mundo" (sem pan/zoom — o transform do world aplica).
    const x1 = de.x + NODE_W;
    const y1 = de.y + NODE_HANDLE_BASE_Y + offsetY;
    const x2 = para.x;
    const y2 = para.y + NODE_HANDLE_BASE_Y;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const dx = Math.max(48, Math.abs(x2 - x1) / 2);
    path.setAttribute(
      "d",
      `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#71717a");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("marker-end", "url(#ig-arrow)");
    svg.appendChild(path);

    if (handle && handle !== "default") {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String((x1 + x2) / 2));
      text.setAttribute("y", String((y1 + y2) / 2 - 6));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "ig-flow-edge-label");
      text.textContent = handle;
      svg.appendChild(text);
    }
  }
}

function renderProps(container, no) {
  // O painel é redesenhado a cada seleção: desmonta os selects antes de descartar.
  destruirSelectsEm(container);
  container.innerHTML = "";
  if (!no) {
    container.append(el("p", { class: CLASSE_VAZIO }, "Selecione um nó no canvas."));
    return;
  }

  const d = no.dados || (no.dados = dadosPadrao(no.tipo));
  const titulo = el("h4", { class: "font-medium text-tinta mb-3" }, LABEL_TIPO[no.tipo] || no.tipo);

  const campos = [];

  if (no.tipo === "trigger") {
    const ehComment = (d.evento || "message") === "comment";
    campos.push(
      campoLabel(
        "Evento",
        selectBase(
          [
            { id: "message", rotulo: "Mensagem (DM)" },
            { id: "comment", rotulo: "Comentário (post/Reel)" },
            { id: "postback", rotulo: "Postback" },
            { id: "quick_reply", rotulo: "Quick reply" },
            { id: "ice_breaker", rotulo: "Ice breaker" },
          ],
          d.evento || "message",
          (v) => {
            d.evento = v;
            if (v === "comment" && d.qualquer === undefined) d.qualquer = true;
            estado.dirty = true;
            marcarDirty();
            atualizarResumoCard(no);
            if (propsEl) renderProps(propsEl, no);
          },
        ),
      ),
    );
    const chk = el("input", {
      type: "checkbox",
      onchange: (e) => {
        d.qualquer = e.target.checked;
        estado.dirty = true;
        marcarDirty();
        atualizarResumoCard(no);
      },
    });
    chk.checked = Boolean(d.qualquer);
    campos.push(
      el(
        "label",
        { class: "inline-flex items-center gap-2 text-sm" },
        chk,
        ehComment ? "Qualquer comentário" : "Qualquer mensagem",
      ),
    );
    const palavras = inputBase({
      type: "text",
      value: (d.palavras || []).join(", "),
      placeholder: ehComment ? "quero, link, preço" : "oi, preço, orçamento",
      oninput: (e) => {
        d.palavras = e.target.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        d.qualquer = false;
        estado.dirty = true;
        marcarDirty();
        atualizarResumoCard(no);
      },
    });
    campos.push(campoLabel("Palavras-chave (vírgula)", palavras));

    if (ehComment) {
      campos.push(
        campoLabel(
          "Media ID (opcional — filtrar post/Reel)",
          inputBase({
            type: "text",
            value: d.media_id || "",
            placeholder: "ID da mídia no Instagram",
            oninput: (e) => {
              d.media_id = e.target.value.trim();
              estado.dirty = true;
              marcarDirty();
              atualizarResumoCard(no);
            },
          }),
        ),
      );
      campos.push(
        el(
          "p",
          { class: "text-xs text-cinza" },
          "A 1ª mensagem do fluxo sai como Private Reply (DM). Requer field comments + permissão manage_comments.",
        ),
      );
    } else {
      campos.push(
        campoLabel(
          "Payload (postback/QR)",
          inputBase({
            type: "text",
            value: d.payload || "",
            oninput: (e) => {
              d.payload = e.target.value;
              estado.dirty = true;
              marcarDirty();
            },
          }),
        ),
      );
    }
  }

  if (no.tipo === "mensagem") {
    const ta = textareaBase(
      {
        oninput: (e) => {
          d.texto = e.target.value;
          estado.dirty = true;
          marcarDirty();
          atualizarResumoCard(no);
        },
      },
      d.texto || "",
    );
    campos.push(campoLabel("Texto", ta));

    const qrInput = inputBase({
      type: "text",
      value: (d.quick_replies || []).map((q) => q.title).join(" | "),
      placeholder: "Opção A | Opção B",
      oninput: (e) => {
        d.quick_replies = e.target.value
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((title) => ({ content_type: "text", title, payload: title }));
        estado.dirty = true;
        marcarDirty();
      },
    });
    campos.push(campoLabel("Quick replies (separe com |)", qrInput));

    const btnInput = inputBase({
      type: "text",
      value: (d.botoes || []).map((b) => b.title).join(" | "),
      placeholder: "Botão 1 | Botão 2 (até 3)",
      oninput: (e) => {
        d.botoes = e.target.value
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((title) => ({ type: "postback", title, payload: title }));
        estado.dirty = true;
        marcarDirty();
      },
    });
    campos.push(campoLabel("Botões postback (até 3, |)", btnInput));
  }

  if (no.tipo === "condicao") {
    campos.push(
      campoLabel(
        "Operador",
        selectBase(
          [
            { id: "contem", rotulo: "Contém" },
            { id: "igual", rotulo: "Igual" },
            { id: "regex", rotulo: "Regex" },
          ],
          d.operador || "contem",
          (v) => {
            d.operador = v;
            estado.dirty = true;
            marcarDirty();
          },
        ),
      ),
    );
    campos.push(
      campoLabel(
        "Valor",
        inputBase({
          type: "text",
          value: d.valor || "",
          oninput: (e) => {
            d.valor = e.target.value;
            estado.dirty = true;
            marcarDirty();
            atualizarResumoCard(no);
          },
        }),
      ),
    );
    campos.push(
      el("p", { class: "text-xs text-cinza" }, "Conecte as saídas “sim” e “nao” pelos handles do nó."),
    );
  }

  if (no.tipo === "delay") {
    campos.push(
      campoLabel(
        "Quantidade",
        inputBase({
          type: "number",
          min: "1",
          value: String(d.quantidade || 5),
          oninput: (e) => {
            d.quantidade = Number(e.target.value) || 1;
            estado.dirty = true;
            marcarDirty();
            atualizarResumoCard(no);
          },
        }),
      ),
    );
    campos.push(
      campoLabel(
        "Unidade",
        selectBase(
          [
            { id: "segundos", rotulo: "Segundos" },
            { id: "minutos", rotulo: "Minutos" },
          ],
          d.unidade || "segundos",
          (v) => {
            d.unidade = v;
            estado.dirty = true;
            marcarDirty();
            atualizarResumoCard(no);
          },
        ),
      ),
    );
  }

  if (no.tipo === "tag") {
    campos.push(
      campoLabel(
        "Tag",
        inputBase({
          type: "text",
          value: d.tag || "",
          oninput: (e) => {
            d.tag = e.target.value;
            estado.dirty = true;
            marcarDirty();
            atualizarResumoCard(no);
          },
        }),
      ),
    );
    campos.push(
      campoLabel(
        "Ação",
        selectBase(
          [
            { id: "adicionar", rotulo: "Adicionar" },
            { id: "remover", rotulo: "Remover" },
          ],
          d.acao || "adicionar",
          (v) => {
            d.acao = v;
            estado.dirty = true;
            marcarDirty();
          },
        ),
      ),
    );
  }

  if (no.tipo === "aguardar_resposta") {
    campos.push(
      el(
        "p",
        { class: "text-xs text-cinza mb-2" },
        "Conecte saídas com handle = palavra-chave ou payload. Use “senao” para fallback.",
      ),
    );
  }

  const btnExcluir = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} text-alerta border-alerta/40 mt-4`,
      onclick: () => {
        if (!estado.fluxo) return;
        estado.fluxo.nos = estado.fluxo.nos.filter((n) => n.id !== no.id);
        estado.fluxo.arestas = estado.fluxo.arestas.filter(
          (a) => a.de !== no.id && a.para !== no.id,
        );
        estado.selecionado = null;
        estado.dirty = true;
        marcarDirty();
        redesenharCanvas();
        renderProps(container, null);
      },
    },
    "Excluir nó",
  );

  container.append(titulo, ...campos, btnExcluir);
}

let propsEl = null;
let canvasMount = null;
let dirtyLabel = null;
let stageListenersProntos = false;

function marcarDirty() {
  if (dirtyLabel) {
    dirtyLabel.textContent = estado.dirty ? "Alterações não salvas" : "Salvo";
    dirtyLabel.className = `text-xs ${estado.dirty ? "text-alerta" : "text-cinza"}`;
  }
}

function pontoHandleSaida(no, handle) {
  const handles = handlesDoTipo(no.tipo);
  const h = String(handle || "default");
  const idx = Math.max(0, handles.indexOf(h));
  const total = Math.max(1, handles.length);
  const spread = total > 1 ? 14 : 0;
  const offsetY = total > 1 ? (idx - (total - 1) / 2) * (spread + 10) : 0;
  return {
    x: no.x + NODE_W,
    y: no.y + NODE_HANDLE_BASE_Y + offsetY,
  };
}

function aplicarTransformWorld() {
  const world = canvasMount?.querySelector(".ig-flow-world");
  if (!world) return;
  const z = estado.zoom;
  world.style.transform = `translate(${estado.pan.x}px, ${estado.pan.y}px) scale(${z})`;
  const label = canvasMount?.querySelector(".ig-flow-zoom-label");
  if (label) label.textContent = `${Math.round(z * 100)}%`;
}

function setZoom(novo) {
  estado.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(novo) || 1));
  aplicarTransformWorld();
}

function coordsNoWorld(clientX, clientY) {
  const stage = canvasMount?.querySelector(".ig-flow-stage");
  if (!stage) return { x: 0, y: 0 };
  const rect = stage.getBoundingClientRect();
  const z = estado.zoom || 1;
  return {
    x: (clientX - rect.left - estado.pan.x) / z,
    y: (clientY - rect.top - estado.pan.y) / z,
  };
}

function limparLinhaTemp(svg) {
  svg?.querySelector("#ig-temp-link")?.remove();
}

function desenharLinhaTemp(svg, x1, y1, x2, y2) {
  if (!svg) return;
  limparLinhaTemp(svg);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("id", "ig-temp-link");
  const dx = Math.max(48, Math.abs(x2 - x1) / 2);
  path.setAttribute(
    "d",
    `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--color-vekta, #0e8a76)");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-dasharray", "6 4");
  path.setAttribute("pointer-events", "none");
  svg.appendChild(path);
}

function redesenharSoArestas() {
  if (!canvasMount || !estado.fluxo) return;
  const svg = canvasMount.querySelector(".ig-flow-edges");
  if (!svg) return;
  desenharArestas(svg, estado.fluxo);
  if (estado.linkDrag) {
    desenharLinhaTemp(
      svg,
      estado.linkDrag.x1,
      estado.linkDrag.y1,
      estado.linkDrag.x2,
      estado.linkDrag.y2,
    );
  }
}

function atualizarPosicaoCard(no) {
  const card = canvasMount?.querySelector(`.ig-flow-node[data-id="${no.id}"]`);
  if (!card) return;
  card.style.left = `${no.x}px`;
  card.style.top = `${no.y}px`;
}

function atualizarResumoCard(no) {
  const body = canvasMount?.querySelector(`.ig-flow-node[data-id="${no.id}"] .ig-flow-node__body`);
  if (body) body.textContent = resumoNo(no);
}

function atualizarSelecaoVisual() {
  if (!canvasMount) return;
  for (const card of canvasMount.querySelectorAll(".ig-flow-node")) {
    const id = card.getAttribute("data-id");
    card.classList.toggle("is-selected", id === estado.selecionado);
    card.classList.toggle("is-linking", estado.linkDrag?.deId === id || estado.ligandoDe?.id === id);
  }
  for (const btn of canvasMount.querySelectorAll(".ig-flow-handle")) {
    const card = btn.closest(".ig-flow-node");
    const id = card?.getAttribute("data-id");
    const h = btn.getAttribute("data-handle");
    const ativo =
      (estado.linkDrag?.deId === id && estado.linkDrag?.handle === h)
      || (estado.ligandoDe?.id === id && estado.ligandoDe?.handle === h);
    btn.classList.toggle("is-active", Boolean(ativo));
  }
}

function conectarNos(deId, handle, paraId) {
  if (!estado.fluxo || deId === paraId) return false;
  const fluxo = estado.fluxo;
  fluxo.arestas = fluxo.arestas || [];
  fluxo.arestas = fluxo.arestas.filter(
    (a) => !(a.de === deId && String(a.handle || "default") === String(handle || "default")),
  );
  fluxo.arestas.push({
    id: uid("e"),
    de: deId,
    para: paraId,
    handle: handle || "default",
  });
  estado.dirty = true;
  marcarDirty();
  return true;
}

function encerrarLinkDrag(alvoId) {
  const link = estado.linkDrag;
  estado.linkDrag = null;
  estado.ligandoDe = null;
  if (link && alvoId && alvoId !== link.deId) {
    conectarNos(link.deId, link.handle, alvoId);
  }
  redesenharSoArestas();
  atualizarSelecaoVisual();
}

function onPointerMoveGlobal(e) {
  if (estado.panDrag) {
    estado.pan.x = estado.panDrag.sx + (e.clientX - estado.panDrag.ox);
    estado.pan.y = estado.panDrag.sy + (e.clientY - estado.panDrag.oy);
    aplicarTransformWorld();
    return;
  }

  if (estado.drag && estado.fluxo) {
    const no = estado.fluxo.nos.find((n) => n.id === estado.drag.id);
    if (no) {
      const z = estado.zoom || 1;
      no.x = estado.drag.sx + (e.clientX - estado.drag.ox) / z;
      no.y = estado.drag.sy + (e.clientY - estado.drag.oy) / z;
      estado.dirty = true;
      marcarDirty();
      atualizarPosicaoCard(no);
      redesenharSoArestas();
    }
    return;
  }

  if (estado.linkDrag && canvasMount) {
    const pt = coordsNoWorld(e.clientX, e.clientY);
    estado.linkDrag.x2 = pt.x;
    estado.linkDrag.y2 = pt.y;
    const svg = canvasMount.querySelector(".ig-flow-edges");
    desenharLinhaTemp(
      svg,
      estado.linkDrag.x1,
      estado.linkDrag.y1,
      estado.linkDrag.x2,
      estado.linkDrag.y2,
    );

    const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".ig-flow-node");
    for (const card of canvasMount.querySelectorAll(".ig-flow-node")) {
      card.classList.toggle(
        "is-drop-target",
        Boolean(sob && card === sob && card.getAttribute("data-id") !== estado.linkDrag.deId),
      );
    }
  }
}

function onPointerUpGlobal(e) {
  if (estado.linkDrag) {
    const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".ig-flow-node");
    const alvoId = sob?.getAttribute("data-id") || null;
    if (canvasMount) {
      for (const card of canvasMount.querySelectorAll(".ig-flow-node.is-drop-target")) {
        card.classList.remove("is-drop-target");
      }
    }
    encerrarLinkDrag(alvoId);
  }
  estado.drag = null;
  estado.panDrag = null;
  if (canvasMount) canvasMount.classList.remove("is-panning");
}

function garantirListenersGlobais() {
  if (stageListenersProntos) return;
  document.addEventListener("mousemove", onPointerMoveGlobal);
  document.addEventListener("mouseup", onPointerUpGlobal);
  stageListenersProntos = true;
}

function redesenharCanvas() {
  if (!canvasMount || !estado.fluxo) return;
  garantirListenersGlobais();
  const fluxo = estado.fluxo;
  const svg = canvasMount.querySelector(".ig-flow-edges");
  const layer = canvasMount.querySelector(".ig-flow-nodes");
  if (!svg || !layer) return;

  desenharArestas(svg, fluxo);
  if (estado.linkDrag) {
    desenharLinhaTemp(
      svg,
      estado.linkDrag.x1,
      estado.linkDrag.y1,
      estado.linkDrag.x2,
      estado.linkDrag.y2,
    );
  }

  layer.innerHTML = "";

  for (const no of fluxo.nos || []) {
    const selecionado = estado.selecionado === no.id;
    const ligando =
      estado.linkDrag?.deId === no.id || estado.ligandoDe?.id === no.id;
    const saidas = handlesDoTipo(no.tipo);

    const handlesEl = el("div", { class: "ig-flow-node__handles" });
    for (const h of saidas) {
      const ativo =
        (estado.linkDrag?.deId === no.id && estado.linkDrag?.handle === h)
        || (estado.ligandoDe?.id === no.id && estado.ligandoDe?.handle === h);
      const btn = el(
        "button",
        {
          type: "button",
          class: `ig-flow-handle${ativo ? " is-active" : ""}`,
          title: `Arraste para conectar (${h})`,
          "data-handle": h,
          "aria-label": `Handle de saída ${h}`,
        },
        el("span", { class: "ig-flow-handle__label" }, h),
      );
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const origem = pontoHandleSaida(no, h);
        const pt = coordsNoWorld(e.clientX, e.clientY);
        estado.drag = null;
        estado.ligandoDe = { id: no.id, handle: h };
        estado.linkDrag = {
          deId: no.id,
          handle: h,
          x1: origem.x,
          y1: origem.y,
          x2: pt.x,
          y2: pt.y,
        };
        atualizarSelecaoVisual();
        redesenharSoArestas();
      });
      handlesEl.append(btn);
    }

    const card = el(
      "div",
      {
        class: `ig-flow-node${selecionado ? " is-selected" : ""}${ligando ? " is-linking" : ""}`,
        style: `left:${no.x}px;top:${no.y}px`,
        "data-id": no.id,
      },
      el("span", { class: "ig-flow-port-in", "aria-hidden": "true" }),
      el(
        "div",
        { class: "ig-flow-node__head" },
        el("iconify-icon", {
          noobserver: "",
          icon: TIPOS_NO.find((t) => t.id === no.tipo)?.icone || "lucide:box",
          class: "text-sm",
          "aria-hidden": "true",
        }),
        el("span", {}, LABEL_TIPO[no.tipo] || no.tipo),
      ),
      el("p", { class: "ig-flow-node__body" }, resumoNo(no)),
      handlesEl,
    );

    card.addEventListener("mousedown", (e) => {
      if (e.target.closest(".ig-flow-handle")) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Se estava no modo click-to-connect legado
      if (estado.ligandoDe && !estado.linkDrag && estado.ligandoDe.id !== no.id) {
        conectarNos(estado.ligandoDe.id, estado.ligandoDe.handle, no.id);
        estado.ligandoDe = null;
        estado.selecionado = no.id;
        if (propsEl) renderProps(propsEl, no);
        redesenharCanvas();
        return;
      }

      estado.selecionado = no.id;
      estado.drag = {
        id: no.id,
        ox: e.clientX,
        oy: e.clientY,
        sx: no.x,
        sy: no.y,
      };
      atualizarSelecaoVisual();
      if (propsEl) renderProps(propsEl, no);
    });

    layer.append(card);
  }
}

function montarBuilder(container, opcoes = {}) {
  const fullPage = Boolean(opcoes.fullPage);
  const fluxo = estado.fluxo;
  if (!fluxo) {
    container.append(
      el(
        "div",
        { class: `${CLASSE_PAINEL}${fullPage ? " ig-flow-page-empty" : ""}` },
        el("p", { class: CLASSE_VAZIO }, "Selecione ou crie um fluxo para editar."),
      ),
    );
    return;
  }

  dirtyLabel = el("span", { class: "text-xs text-cinza" }, "Salvo");
  marcarDirty();

  const nomeInput = inputBase({
    type: "text",
    value: fluxo.nome || "",
    oninput: (e) => {
      fluxo.nome = e.target.value;
      estado.dirty = true;
      marcarDirty();
    },
  });

  const btnSalvar = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO_PRIMARIO,
      onclick: async () => {
        try {
          const r = await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(fluxo.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fluxo),
          });
          estado.fluxo = r.fluxo;
          estado.dirty = false;
          marcarDirty();
          await carregarFluxosLista();
        } catch (e) {
          alert(e.message);
        }
      },
    },
    "Salvar fluxo",
  );

  const btnAtivar = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: async () => {
        try {
          if (estado.dirty) {
            await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(fluxo.id)}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fluxo),
            });
          }
          const r = await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(fluxo.id)}/ativar`, {
            method: "POST",
          });
          estado.fluxo = r.fluxo;
          estado.fluxos = r.fluxos || estado.fluxos;
          estado.dirty = false;
          marcarDirty();
          if (fullPage) await renderPaginaFluxos();
          else await renderAutomacao();
        } catch (e) {
          alert(e.message);
        }
      },
    },
    fluxo.ativo ? "Reativar" : "Ativar fluxo",
  );

  const btnExcluir = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} text-alerta`,
      title: "Excluir fluxo",
      onclick: async () => {
        const ok = await excluirFluxoPorId(fluxo.id);
        if (!ok) return;
        if (fullPage) await renderPaginaFluxos();
        else await renderAutomacao();
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:trash-2", class: "text-[15px]", "aria-hidden": "true" }),
    "Excluir",
  );

  const zoomLabel = el("span", { class: "ig-flow-zoom-label text-xs font-mono text-cinza min-w-12 text-center" }, `${Math.round(estado.zoom * 100)}%`);
  const btnZoomOut = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      title: "Diminuir zoom",
      onclick: () => setZoom(estado.zoom - ZOOM_STEP),
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:zoom-out", class: "text-[15px]", "aria-hidden": "true" }),
  );
  const btnZoomIn = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      title: "Aumentar zoom",
      onclick: () => setZoom(estado.zoom + ZOOM_STEP),
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:zoom-in", class: "text-[15px]", "aria-hidden": "true" }),
  );
  const btnZoomReset = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      title: "Resetar zoom e pan",
      onclick: () => {
        estado.pan = { x: 40, y: 40 };
        setZoom(1);
      },
    },
    "Reset",
  );

  const paleta = el(
    "div",
    { class: "ig-flow-palette" },
    ...TIPOS_NO.map((t) =>
      el(
        "button",
        {
          type: "button",
          class: "ig-flow-palette__item",
          title: `Adicionar ${t.rotulo}`,
          onclick: () => {
            const rect = canvasMount?.getBoundingClientRect();
            const pt = coordsNoWorld((rect?.left || 0) + 140, (rect?.top || 0) + 140);
            const no = {
              id: uid("n"),
              tipo: t.id,
              x: pt.x + Math.random() * 40,
              y: pt.y + Math.random() * 40,
              dados: dadosPadrao(t.id),
            };
            fluxo.nos.push(no);
            estado.selecionado = no.id;
            estado.dirty = true;
            marcarDirty();
            redesenharCanvas();
            if (propsEl) renderProps(propsEl, no);
          },
        },
        el("iconify-icon", { noobserver: "", icon: t.icone, class: "text-base", "aria-hidden": "true" }),
        t.rotulo,
      ),
    ),
  );

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ig-flow-edges");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `<marker id="ig-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#a1a1aa"/></marker>`;
  svg.appendChild(defs);

  const nodesLayer = el("div", { class: "ig-flow-nodes" });
  const world = el("div", { class: "ig-flow-world" }, svg, nodesLayer);
  const stage = el("div", { class: "ig-flow-stage", tabindex: "0" }, world);

  stage.addEventListener("mousedown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target.closest?.(".ig-flow-node") || e.target.closest?.(".ig-flow-handle")) return;
    e.preventDefault();
    estado.drag = null;
    estado.linkDrag = null;
    estado.panDrag = {
      ox: e.clientX,
      oy: e.clientY,
      sx: estado.pan.x,
      sy: estado.pan.y,
    };
    canvasMount?.classList.add("is-panning");
  });
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoom(estado.zoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP));
      return;
    }
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    estado.pan.x -= dx;
    estado.pan.y -= dy;
    aplicarTransformWorld();
  }, { passive: false });
  stage.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      stage.dataset.space = "1";
    }
  });
  stage.addEventListener("keyup", (e) => {
    if (e.code === "Space") delete stage.dataset.space;
  });

  propsEl = el("div", { class: "ig-flow-props" });
  canvasMount = el(
    "div",
    { class: `ig-flow-canvas${fullPage ? " ig-flow-canvas--page" : ""}` },
    stage,
  );

  const toolbar = el(
    "div",
    { class: "flex flex-wrap items-center gap-2 mb-3" },
    campoLabel("Nome do fluxo", nomeInput),
    btnSalvar,
    btnAtivar,
    btnExcluir,
    dirtyLabel,
    fluxo.ativo
      ? el("span", { class: "text-xs px-2 py-1 rounded-full bg-vekta-suave text-vekta" }, "Ativo")
      : el("span", { class: "text-xs px-2 py-1 rounded-full bg-fundo text-cinza border border-linha" }, "Inativo"),
    el("div", { class: "flex items-center gap-1 ml-auto" }, btnZoomOut, zoomLabel, btnZoomIn, btnZoomReset),
  );

  container.append(
    el(
      "div",
      { class: `${CLASSE_PAINEL}${fullPage ? " ig-flow-page-panel" : ""}` },
      fullPage
        ? null
        : el("h3", { class: "font-display text-lg text-tinta mb-3" }, "Builder de fluxos"),
      toolbar,
      el(
        "div",
        { class: `ig-flow-layout${fullPage ? " ig-flow-layout--page" : ""}` },
        paleta,
        canvasMount,
        propsEl,
      ),
      el(
        "div",
        {
          class: `ig-flow-hints text-xs text-cinza ${fullPage ? "mt-2 shrink-0" : "mt-3"}`,
        },
        el(
          "span",
          { class: "ig-flow-hints__item", title: "Clique e arraste o fundo vazio" },
          el("iconify-icon", { noobserver: "", icon: "lucide:hand", class: "text-[13px]", "aria-hidden": "true" }),
          "Arrastar fundo · mover tela",
        ),
        el(
          "span",
          { class: "ig-flow-hints__item", title: "Clique e arraste um bloco" },
          el("iconify-icon", { noobserver: "", icon: "lucide:move", class: "text-[13px]", "aria-hidden": "true" }),
          "Arrastar nó · reposicionar",
        ),
        el(
          "span",
          { class: "ig-flow-hints__item", title: "Arraste o círculo verde até outro nó" },
          el("iconify-icon", { noobserver: "", icon: "lucide:circle-dot", class: "text-[13px] text-vekta", "aria-hidden": "true" }),
          "Verde · conectar",
        ),
        el(
          "span",
          { class: "ig-flow-hints__item", title: "Roda do mouse ou trackpad" },
          el("iconify-icon", { noobserver: "", icon: "lucide:mouse", class: "text-[13px]", "aria-hidden": "true" }),
          "Scroll · mover",
        ),
        el(
          "span",
          { class: "ig-flow-hints__item" },
          el("iconify-icon", { noobserver: "", icon: "lucide:arrow-left-right", class: "text-[13px]", "aria-hidden": "true" }),
          "Shift+scroll · lados",
        ),
        el(
          "span",
          { class: "ig-flow-hints__item" },
          el("iconify-icon", { noobserver: "", icon: "lucide:zoom-in", class: "text-[13px]", "aria-hidden": "true" }),
          "Ctrl+scroll · zoom",
        ),
      ),
    ),
  );

  aplicarTransformWorld();
  redesenharCanvas();
  const sel = fluxo.nos.find((n) => n.id === estado.selecionado) || fluxo.nos[0] || null;
  if (sel) {
    estado.selecionado = sel.id;
    renderProps(propsEl, sel);
  } else {
    renderProps(propsEl, null);
  }
}

async function carregarFluxosLista() {
  const r = await api("/api/instagram/automacao/fluxos");
  estado.fluxos = r.fluxos || [];
}

/** @returns {Promise<boolean>} true se excluiu */
async function excluirFluxoPorId(id) {
  if (!id) return false;
  if (!confirm("Excluir este fluxo? Esta ação não pode ser desfeita.")) return false;
  try {
    await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (estado.fluxo?.id === id) {
      estado.fluxo = null;
      estado.selecionado = null;
      estado.dirty = false;
    }
    if (sessionStorage.getItem(CHAVE_FLUXO_ABERTO) === id) {
      sessionStorage.removeItem(CHAVE_FLUXO_ABERTO);
    }
    await carregarFluxosLista();
    return true;
  } catch (e) {
    alert(e.message || "Falha ao excluir fluxo.");
    return false;
  }
}

/** @returns {Promise<boolean>} true se ativou */
async function ativarFluxoPorId(id) {
  if (!id) return false;
  try {
    const r = await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(id)}/ativar`, {
      method: "POST",
    });
    if (estado.fluxo?.id === id && r.fluxo) estado.fluxo = r.fluxo;
    if (Array.isArray(r.fluxos)) estado.fluxos = r.fluxos;
    else await carregarFluxosLista();
    return true;
  } catch (e) {
    alert(e.message || "Falha ao ativar fluxo.");
    return false;
  }
}

function renderListaFluxos(container) {
  const lista = estado.fluxos || [];
  const items =
    lista.length === 0
      ? [el("p", { class: CLASSE_VAZIO }, "Nenhum fluxo ainda.")]
      : lista.map((f) =>
          el(
            "div",
            { class: `ig-flow-list-item${f.ativo ? " is-active" : ""}` },
            el(
              "div",
              { class: "flex flex-col gap-0.5 min-w-0" },
              el("span", { class: "font-medium truncate" }, f.nome || f.id),
              el(
                "span",
                { class: `text-xs ${f.ativo ? "text-vekta" : "text-cinza"}` },
                f.ativo ? "ativo" : "inativo",
              ),
            ),
            el(
              "div",
              { class: "ig-flow-list-item__actions" },
              f.ativo
                ? el(
                    "span",
                    {
                      class: "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-vekta",
                      title: "Fluxo ativo na automação",
                    },
                    el("iconify-icon", { noobserver: "", icon: "lucide:check-circle-2", class: "text-[15px]", "aria-hidden": "true" }),
                    "Ativo",
                  )
                : el(
                    "button",
                    {
                      type: "button",
                      class: CLASSE_BOTAO,
                      title: "Ativar este fluxo",
                      onclick: async () => {
                        const ok = await ativarFluxoPorId(f.id);
                        if (ok) await renderAutomacao();
                      },
                    },
                    el("iconify-icon", { noobserver: "", icon: "lucide:power", class: "text-[15px]", "aria-hidden": "true" }),
                    "Ativar",
                  ),
              el(
                "button",
                {
                  type: "button",
                  class: CLASSE_BOTAO_PRIMARIO,
                  onclick: async () => {
                    try {
                      sessionStorage.setItem(CHAVE_FLUXO_ABERTO, f.id);
                      estado.fluxo = (
                        await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(f.id)}`)
                      ).fluxo;
                      estado.selecionado = null;
                      estado.dirty = false;
                      const { irParaPagina } = await import("../.core/roteador.js");
                      await irParaPagina("instagram-fluxos");
                    } catch (e) {
                      alert(e.message);
                    }
                  },
                },
                "Abrir",
              ),
              el(
                "button",
                {
                  type: "button",
                  class: `${CLASSE_BOTAO} text-alerta`,
                  title: "Excluir fluxo",
                  "aria-label": `Excluir ${f.nome || f.id}`,
                  onclick: async () => {
                    const ok = await excluirFluxoPorId(f.id);
                    if (ok) await renderAutomacao();
                  },
                },
                el("iconify-icon", { noobserver: "", icon: "lucide:trash-2", class: "text-[15px]", "aria-hidden": "true" }),
              ),
            ),
          ),
        );

  const abrirPaginaFluxos = async (fluxoId = null) => {
    const { irParaPagina } = await import("../.core/roteador.js");
    if (fluxoId) {
      sessionStorage.setItem(CHAVE_FLUXO_ABERTO, fluxoId);
      estado.fluxo = (
        await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(fluxoId)}`)
      ).fluxo;
      estado.selecionado = null;
      estado.dirty = false;
    }
    await irParaPagina("instagram-fluxos");
  };

  const btnCriar = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO_PRIMARIO,
      onclick: async () => {
        try {
          const r = await api("/api/instagram/automacao/fluxos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome: "Novo fluxo" }),
          });
          await carregarFluxosLista();
          await abrirPaginaFluxos(r.fluxo.id);
        } catch (e) {
          alert(e.message);
        }
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:plus", class: "text-[15px]", "aria-hidden": "true" }),
    "Criar fluxo",
  );

  const btnAbrirBuilder = el(
    "button",
    {
      type: "button",
      class: CLASSE_BOTAO,
      onclick: async () => {
        try {
          const ativo = estado.fluxos?.find((x) => x.ativo);
          const id =
            ativo?.id ||
            sessionStorage.getItem(CHAVE_FLUXO_ABERTO) ||
            estado.fluxos?.[0]?.id ||
            null;
          if (!id) {
            await abrirPaginaFluxos(null);
            return;
          }
          await abrirPaginaFluxos(id);
        } catch (e) {
          alert(e.message);
        }
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:git-branch", class: "text-[15px]", "aria-hidden": "true" }),
    "Abrir builder",
  );

  const btnConfig = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO}${estado.mostrarConfigWebhook ? " border-vekta text-vekta" : ""}`,
      title: estado.mostrarConfigWebhook ? "Ocultar configuração do webhook" : "Configuração do webhook (dev)",
      "aria-pressed": estado.mostrarConfigWebhook ? "true" : "false",
      onclick: async () => {
        estado.mostrarConfigWebhook = !estado.mostrarConfigWebhook;
        await renderAutomacao();
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:settings", class: "text-[15px]", "aria-hidden": "true" }),
    "Configuração",
  );

  container.append(
    el(
      "div",
      { class: `${CLASSE_PAINEL} mb-5` },
      el(
        "div",
        { class: "flex flex-wrap items-center justify-between gap-3 mb-3" },
        el("h3", { class: "font-display text-lg text-tinta" }, "Fluxos"),
        el("div", { class: "flex flex-wrap items-center gap-2" }, btnConfig, btnAbrirBuilder, btnCriar),
      ),
      el(
        "p",
        { class: "text-sm text-cinza mb-3" },
        "Crie, ative ou abra o builder em tela cheia. O destaque marca o fluxo ativo.",
      ),
      el("div", { class: "ig-flow-list" }, ...items),
    ),
  );
}

export async function renderAutomacao() {
  const painel = $("#ig-painel-automacao");
  if (!painel) return;
  painel.innerHTML = "";

  if (estado.mostrarConfigWebhook) renderConfigWebhook(painel);
  renderListaFluxos(painel);

  animarEntrada(painel.querySelectorAll(`.${CLASSE_PAINEL.split(" ")[0]}, .bg-superficie`));
}

export async function renderPaginaFluxos() {
  const raiz = $("#ig-fluxos-raiz");
  if (!raiz) return;
  raiz.innerHTML = "";

  const sidebar = el("aside", { class: "ig-fluxos-sidebar" });
  const main = el("div", { class: "ig-fluxos-main min-w-0 flex-1" });

  const btnVoltar = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO} w-full justify-center mb-2`,
      onclick: async () => {
        const { irParaPagina } = await import("../.core/roteador.js");
        await irParaPagina("instagram");
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:arrow-left", class: "text-[15px]", "aria-hidden": "true" }),
    "Voltar ao Instagram",
  );

  const btnNovo = el(
    "button",
    {
      type: "button",
      class: `${CLASSE_BOTAO_PRIMARIO} w-full justify-center mb-3`,
      onclick: async () => {
        const r = await api("/api/instagram/automacao/fluxos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: "Novo fluxo" }),
        });
        estado.fluxo = r.fluxo;
        estado.selecionado = null;
        estado.dirty = false;
        sessionStorage.setItem(CHAVE_FLUXO_ABERTO, r.fluxo.id);
        await carregarFluxosLista();
        await renderPaginaFluxos();
      },
    },
    el("iconify-icon", { noobserver: "", icon: "lucide:plus", class: "text-[15px]", "aria-hidden": "true" }),
    "Novo fluxo",
  );

  sidebar.append(el("h2", { class: "font-display text-base text-tinta mb-2" }, "Fluxos"), btnVoltar, btnNovo);

  for (const f of estado.fluxos || []) {
    sidebar.append(
      el(
        "div",
        { class: `ig-flow-list-item${estado.fluxo?.id === f.id ? " is-active" : ""}` },
        el(
          "button",
          {
            type: "button",
            class: "ig-flow-list-item__open min-w-0 flex-1 text-left",
            onclick: async () => {
              const r = await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(f.id)}`);
              estado.fluxo = r.fluxo;
              estado.selecionado = null;
              estado.dirty = false;
              sessionStorage.setItem(CHAVE_FLUXO_ABERTO, f.id);
              await renderPaginaFluxos();
            },
          },
          el("span", { class: "font-medium truncate block" }, f.nome || f.id),
          el(
            "span",
            { class: `text-xs ${f.ativo ? "text-vekta" : "text-cinza"}` },
            f.ativo ? "ativo" : "inativo",
          ),
        ),
        el(
          "button",
          {
            type: "button",
            class: `${CLASSE_BOTAO} text-alerta shrink-0 !px-2 !py-1.5`,
            title: "Excluir fluxo",
            "aria-label": `Excluir ${f.nome || f.id}`,
            onclick: async () => {
              const ok = await excluirFluxoPorId(f.id);
              if (ok) await renderPaginaFluxos();
            },
          },
          el("iconify-icon", { noobserver: "", icon: "lucide:trash-2", class: "text-[15px]", "aria-hidden": "true" }),
        ),
      ),
    );
  }

  raiz.append(sidebar, main);
  montarBuilder(main, { fullPage: true });
}

export async function carregarAutomacao() {
  const [cfg] = await Promise.all([
    api("/api/instagram/automacao/config"),
    carregarFluxosLista(),
  ]);
  estado.config = cfg.config;
  estado.eventos = cfg.eventos || [];
  await renderAutomacao();
}

export async function carregarPaginaFluxos() {
  await carregarFluxosLista();
  const idSalvo = sessionStorage.getItem(CHAVE_FLUXO_ABERTO);
  if (idSalvo) {
    try {
      estado.fluxo = (await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(idSalvo)}`)).fluxo;
    } catch {
      sessionStorage.removeItem(CHAVE_FLUXO_ABERTO);
      estado.fluxo = null;
    }
  }
  if (!estado.fluxo && estado.fluxos.length) {
    try {
      estado.fluxo = (
        await api(`/api/instagram/automacao/fluxos/${encodeURIComponent(estado.fluxos[0].id)}`)
      ).fluxo;
      sessionStorage.setItem(CHAVE_FLUXO_ABERTO, estado.fluxo.id);
    } catch {
      estado.fluxo = null;
    }
  }
  await renderPaginaFluxos();
}
