/**
 * Aba Agenda — calendário mensal (Google Calendar ou agenda local do site).
 */
import {
  $,
  el,
  api,
  CLASSE_BOTAO,
  CLASSE_BOTAO_PRIMARIO,
  animarEntrada,
} from "../.core/util.js";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

let mesVisivel = inicioDoMes(new Date());
let eventos = [];
let carregando = false;
let iniciado = false;
let ultimoProvedor = "local";

function inicioDoMes(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDataLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDataLocal(iso) {
  const [y, m, day] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
}

function adicionarDias(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Segunda = 0 … Domingo = 6 (grade pt-BR). */
function diaSemanaSegInicio(d) {
  return (d.getDay() + 6) % 7;
}

function intervaloDoMes(mes) {
  const inicioGrade = adicionarDias(mes, -diaSemanaSegInicio(mes));
  const fimMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const diasApos = 6 - diaSemanaSegInicio(fimMes);
  const fimGrade = adicionarDias(fimMes, diasApos + 1); // exclusivo (00:00 do dia seguinte)
  return { timeMin: inicioGrade.toISOString(), timeMax: fimGrade.toISOString(), inicioGrade };
}

function eventosNoDia(diaIso) {
  return eventos.filter((ev) => eventoCobreDia(ev, diaIso));
}

function eventoCobreDia(ev, diaIso) {
  if (ev.allDay) {
    const ini = String(ev.start || "").slice(0, 10);
    // Google: end.date é exclusivo em eventos de dia inteiro
    let fimExcl = String(ev.end || "").slice(0, 10);
    if (!fimExcl || fimExcl <= ini) {
      fimExcl = isoDataLocal(adicionarDias(parseDataLocal(ini), 1));
    }
    return diaIso >= ini && diaIso < fimExcl;
  }
  const ini = new Date(ev.start);
  const fim = new Date(ev.end || ev.start);
  if (Number.isNaN(ini.getTime())) return false;
  const diaIni = isoDataLocal(ini);
  const diaFim = Number.isNaN(fim.getTime()) ? diaIni : isoDataLocal(fim);
  // Evento que termina exatamente à meia-noite do dia seguinte ainda conta no dia inicial
  if (fim.getHours() === 0 && fim.getMinutes() === 0 && fim.getSeconds() === 0 && diaFim > diaIni) {
    return diaIso >= diaIni && diaIso < diaFim;
  }
  return diaIso >= diaIni && diaIso <= diaFim;
}

function formatarHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function rotuloEvento(ev) {
  if (ev.allDay) return ev.summary;
  const h = formatarHora(ev.start);
  return h ? `${h} ${ev.summary}` : ev.summary;
}

function setStatus(texto) {
  const no = $("#ag-status");
  if (no) no.textContent = texto || "";
}

function rotuloProvedor(provedor) {
  return provedor === "google" ? "google calendar" : "agenda do site";
}

function aplicarProvedor(provedor) {
  const origem = $("#ag-origem");
  if (origem) origem.textContent = rotuloProvedor(provedor);
}

async function carregarStatus() {
  const status = await api("/api/agenda/status");
  aplicarProvedor(status.provedor);
  return status;
}

async function carregarEventos() {
  if (carregando) return;
  carregando = true;
  setStatus("Carregando…");
  $("#ag-atualizar")?.setAttribute("disabled", "disabled");
  try {
    const { timeMin, timeMax } = intervaloDoMes(mesVisivel);
    const dados = await api(
      `/api/agenda/eventos?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
    );
    eventos = Array.isArray(dados.eventos) ? dados.eventos : [];
    if (dados.provedor) {
      ultimoProvedor = dados.provedor;
      aplicarProvedor(ultimoProvedor);
    }
    renderizarGrade();
    setStatus(
      eventos.length === 1
        ? "1 evento neste mês"
        : `${eventos.length} eventos neste mês`,
    );
  } catch (erro) {
    setStatus(erro.message || "Falha ao carregar eventos");
    eventos = [];
    renderizarGrade();
  } finally {
    carregando = false;
    $("#ag-atualizar")?.removeAttribute("disabled");
  }
}

function renderizarCabecalhoMes() {
  const titulo = $("#ag-mes-titulo");
  if (titulo) {
    titulo.textContent = `${MESES[mesVisivel.getMonth()]} ${mesVisivel.getFullYear()}`;
  }
}

function renderizarGrade() {
  renderizarCabecalhoMes();
  const grade = $("#ag-grade");
  if (!grade) return;
  grade.innerHTML = "";

  const { inicioGrade } = intervaloDoMes(mesVisivel);
  const hojeIso = isoDataLocal(new Date());
  const mesAtual = mesVisivel.getMonth();

  const cab = el(
    "div",
    {
      class:
        "grid grid-cols-7 border-b border-linha bg-fundo/60",
    },
    ...DIAS_SEMANA.map((d) =>
      el(
        "div",
        {
          class:
            "px-2 py-2.5 text-center font-mono text-[11px] uppercase tracking-wider text-cinza",
        },
        d,
      ),
    ),
  );
  grade.append(cab);

  const corpo = el("div", { class: "grid grid-cols-7" });
  for (let i = 0; i < 42; i++) {
    const dia = adicionarDias(inicioGrade, i);
    const diaIso = isoDataLocal(dia);
    const fora = dia.getMonth() !== mesAtual;
    const ehHoje = diaIso === hojeIso;
    const lista = eventosNoDia(diaIso);

    const celula = el("div", {
      class: [
        "min-h-[6.5rem] border-b border-r border-linha p-1.5 flex flex-col gap-0.5 transition-colors",
        fora ? "bg-fundo/40" : "bg-superficie",
        "hover:bg-vekta-suave/40 cursor-pointer",
        i % 7 === 6 ? "border-r-0" : "",
      ]
        .filter(Boolean)
        .join(" "),
      role: "button",
      tabindex: "0",
      "aria-label": `Dia ${dia.getDate()}`,
      onclick: () => abrirModalEvento({ modo: "criar", diaIso }),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          abrirModalEvento({ modo: "criar", diaIso });
        }
      },
    });

    const num = el(
      "div",
      {
        class: [
          "self-end mb-1 w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium",
          ehHoje
            ? "bg-vekta text-white"
            : fora
              ? "text-cinza-claro"
              : "text-tinta",
        ].join(" "),
      },
      String(dia.getDate()),
    );
    celula.append(num);

    const maxVisiveis = 3;
    for (const ev of lista.slice(0, maxVisiveis)) {
      celula.append(
        el(
          "button",
          {
            type: "button",
            class:
              "w-full text-left truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium bg-vekta-suave text-vekta hover:bg-vekta hover:text-white transition-colors",
            title: ev.summary,
            onclick: (e) => {
              e.stopPropagation();
              abrirModalEvento({ modo: "editar", evento: ev });
            },
          },
          rotuloEvento(ev),
        ),
      );
    }
    if (lista.length > maxVisiveis) {
      celula.append(
        el(
          "span",
          { class: "text-[10px] text-cinza px-1" },
          `+${lista.length - maxVisiveis} mais`,
        ),
      );
    }

    corpo.append(celula);
  }
  grade.append(corpo);
  animarEntrada(corpo.querySelectorAll("button, [role='button']"));
}

function fecharModalEvento() {
  $("#ag-modal-evento")?.remove();
  document.removeEventListener("keydown", onEscModalEvento);
}

function onEscModalEvento(e) {
  if (e.key === "Escape") fecharModalEvento();
}

function defaultsCriar(diaIso) {
  const base = diaIso || isoDataLocal(new Date());
  const inicio = `${base}T09:00`;
  const fim = `${base}T10:00`;
  return { summary: "", description: "", allDay: false, start: inicio, end: fim, diaIso: base };
}

function valoresDoEvento(ev) {
  if (ev.allDay) {
    const start = String(ev.start || "").slice(0, 10);
    let end = String(ev.end || "").slice(0, 10);
    // end exclusivo → mostrar o último dia inclusivo no formulário
    if (end && end > start) {
      end = isoDataLocal(adicionarDias(parseDataLocal(end), -1));
    } else {
      end = start;
    }
    return {
      summary: ev.summary || "",
      description: ev.description || "",
      allDay: true,
      start,
      end,
      id: ev.id,
    };
  }
  const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${isoDataLocal(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  return {
    summary: ev.summary || "",
    description: ev.description || "",
    allDay: false,
    start: toLocalInput(ev.start),
    end: toLocalInput(ev.end || ev.start),
    id: ev.id,
  };
}

function payloadDoForm(form) {
  const summary = form.summary.value.trim();
  const description = form.description.value.trim();
  const allDay = form.allDay.checked;
  let start = form.start.value;
  let end = form.end.value;

  if (allDay) {
    start = start.slice(0, 10);
    end = end.slice(0, 10);
    // Google exige end exclusivo
    const endExcl = isoDataLocal(adicionarDias(parseDataLocal(end), 1));
    return { summary, description, allDay: true, start, end: endExcl };
  }

  return {
    summary,
    description,
    allDay: false,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
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

const CLASSE_INPUT =
  "w-full rounded-xl border border-linha bg-fundo px-3 py-2 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta";

function abrirModalEvento({ modo, evento, diaIso }) {
  fecharModalEvento();
  const editando = modo === "editar" && evento;
  const vals = editando
    ? valoresDoEvento(evento)
    : defaultsCriar(diaIso);

  const inputSummary = el("input", {
    type: "text",
    name: "summary",
    class: CLASSE_INPUT,
    required: "required",
    value: vals.summary === "(Sem título)" ? "" : vals.summary,
    placeholder: "Título do evento",
    autocomplete: "off",
  });
  const inputDesc = el("textarea", {
    name: "description",
    class: `${CLASSE_INPUT} min-h-[5rem] resize-y`,
    placeholder: "Descrição (opcional)",
  });
  inputDesc.value = vals.description;

  const inputAllDay = el("input", {
    type: "checkbox",
    name: "allDay",
    class: "rounded border-linha text-vekta focus-visible:outline-vekta",
  });
  if (vals.allDay) inputAllDay.checked = true;

  const inputStart = el("input", {
    name: "start",
    class: CLASSE_INPUT,
    required: "required",
  });
  const inputEnd = el("input", {
    name: "end",
    class: CLASSE_INPUT,
    required: "required",
  });

  function syncTiposData() {
    const allDay = inputAllDay.checked;
    inputStart.type = allDay ? "date" : "datetime-local";
    inputEnd.type = allDay ? "date" : "datetime-local";
    if (allDay) {
      inputStart.value = String(inputStart.value || vals.start).slice(0, 10);
      inputEnd.value = String(inputEnd.value || vals.end).slice(0, 10);
    } else {
      const s = String(inputStart.value || vals.start);
      const e = String(inputEnd.value || vals.end);
      inputStart.value = s.length === 10 ? `${s}T09:00` : s.slice(0, 16);
      inputEnd.value = e.length === 10 ? `${e}T10:00` : e.slice(0, 16);
    }
  }
  syncTiposData();
  inputAllDay.addEventListener("change", syncTiposData);

  const erroEl = el("p", {
    class: "hidden text-sm text-alerta",
    role: "alert",
  });

  const btnSalvar = el(
    "button",
    { type: "submit", class: CLASSE_BOTAO_PRIMARIO },
    editando ? "Salvar" : "Criar evento",
  );
  const btnCancelar = el(
    "button",
    { type: "button", class: CLASSE_BOTAO, onclick: fecharModalEvento },
    "Cancelar",
  );
  const btnExcluir = editando
    ? el(
        "button",
        {
          type: "button",
          class: `${CLASSE_BOTAO} text-alerta border-alerta/40 hover:border-alerta`,
          onclick: async () => {
            if (!confirm("Excluir este evento? Esta ação não pode ser desfeita."))
              return;
            btnExcluir.disabled = true;
            try {
              await api(`/api/agenda/eventos/${encodeURIComponent(vals.id)}`, {
                method: "DELETE",
              });
              fecharModalEvento();
              await carregarEventos();
            } catch (erro) {
              erroEl.textContent = erro.message || "Falha ao excluir";
              erroEl.classList.remove("hidden");
              btnExcluir.disabled = false;
            }
          },
        },
        "Excluir",
      )
    : null;

  const form = el(
    "form",
    {
      class: "flex flex-col gap-4",
      onsubmit: async (e) => {
        e.preventDefault();
        erroEl.classList.add("hidden");
        btnSalvar.disabled = true;
        try {
          const payload = payloadDoForm(form);
          if (!payload.summary) throw new Error("Informe o título.");
          if (editando) {
            await api(`/api/agenda/eventos/${encodeURIComponent(vals.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } else {
            await api("/api/agenda/eventos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }
          fecharModalEvento();
          await carregarEventos();
        } catch (erro) {
          erroEl.textContent = erro.message || "Falha ao salvar";
          erroEl.classList.remove("hidden");
          btnSalvar.disabled = false;
        }
      },
    },
    campoLabel("Título", inputSummary),
    el(
      "label",
      { class: "inline-flex items-center gap-2 text-sm text-tinta cursor-pointer" },
      inputAllDay,
      el("span", {}, "Dia inteiro"),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
      campoLabel("Início", inputStart),
      campoLabel("Fim", inputEnd),
    ),
    campoLabel("Descrição", inputDesc),
    erroEl,
    el(
      "div",
      { class: "flex flex-wrap items-center gap-2 justify-between pt-1" },
      el("div", { class: "flex gap-2" }, btnExcluir),
      el("div", { class: "flex gap-2 ml-auto" }, btnCancelar, btnSalvar),
    ),
  );

  const painel = el(
    "div",
    {
      class:
        "bg-superficie border border-linha rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6",
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
          rotuloProvedor(ultimoProvedor),
        ),
        el(
          "h2",
          {
            id: "ag-modal-titulo",
            class: "font-display text-xl font-semibold tracking-tight",
          },
          editando ? "Editar evento" : "Novo evento",
        ),
      ),
      el(
        "button",
        {
          type: "button",
          class:
            "inline-flex items-center justify-center w-8 h-8 rounded-full text-cinza hover:bg-fundo hover:text-tinta",
          "aria-label": "Fechar",
          onclick: fecharModalEvento,
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:x",
          class: "text-lg",
        }),
      ),
    ),
    form,
  );

  const overlay = el(
    "div",
    {
      id: "ag-modal-evento",
      class:
        "fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/55 backdrop-blur-sm",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ag-modal-titulo",
      onclick: fecharModalEvento,
    },
    painel,
  );

  document.body.append(overlay);
  document.addEventListener("keydown", onEscModalEvento);
  inputSummary.focus();
}

function ligarControles() {
  $("#ag-mes-ant")?.addEventListener("click", async () => {
    mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() - 1, 1);
    await carregarEventos();
  });
  $("#ag-mes-prox")?.addEventListener("click", async () => {
    mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 1);
    await carregarEventos();
  });
  $("#ag-hoje")?.addEventListener("click", async () => {
    mesVisivel = inicioDoMes(new Date());
    await carregarEventos();
  });
  $("#ag-novo")?.addEventListener("click", () => {
    abrirModalEvento({ modo: "criar", diaIso: isoDataLocal(new Date()) });
  });
  $("#ag-atualizar")?.addEventListener("click", () => carregarEventos());
}

export async function iniciar() {
  if (!iniciado) {
    ligarControles();
    iniciado = true;
  }
  try {
    const status = await carregarStatus();
    ultimoProvedor = status.provedor || "local";
    await carregarEventos();
  } catch (erro) {
    aplicarProvedor("local");
    setStatus(erro.message || "Falha ao carregar a agenda");
    eventos = [];
    renderizarGrade();
  }
}

export async function atualizar() {
  return iniciar();
}
