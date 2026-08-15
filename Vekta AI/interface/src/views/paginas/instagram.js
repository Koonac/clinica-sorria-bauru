/* Página: Instagram — perfil estilo mobile + métricas com Chart.js. */
import {
  $,
  el,
  api,
  CLASSE_PAINEL,
  CLASSE_VAZIO,
  animarEntrada,
} from "../.core/util.js";
import { carregarAutomacao } from "./instagram-automacao.js";

const SUBABAS = [
  { id: "perfil", rotulo: "Perfil" },
  { id: "metricas", rotulo: "Métricas" },
  { id: "agendar", rotulo: "Agendar" },
  { id: "automacao", rotulo: "Automação" },
];

const PERIODOS = [
  { id: "day", rotulo: "Dia" },
  { id: "week", rotulo: "Semana" },
  { id: "days_28", rotulo: "28 dias" },
];

const ROTULOS_METRICA = {
  reach: "Alcance",
  follower_count: "Novos seguidores",
  profile_views: "Visitas ao perfil",
  views: "Visualizações",
  accounts_engaged: "Contas engajadas",
  total_interactions: "Interações totais",
  follows_and_unfollows: "Follows / Unfollows",
  follows: "Novos follows",
  unfollows: "Unfollows",
  online_followers: "Seguidores online (pico)",
};

const CORES_CHART = {
  reach: { border: "#0e8a76", fill: "rgba(14, 138, 118, 0.18)" },
  views: { border: "#5b8def", fill: "rgba(91, 141, 239, 0.18)" },
  profile_views: { border: "#e8955a", fill: "rgba(232, 149, 90, 0.18)" },
  follower_count: { border: "#c084fc", fill: "rgba(192, 132, 252, 0.18)" },
  accounts_engaged: { border: "#34d399", fill: "rgba(52, 211, 153, 0.25)" },
  total_interactions: { border: "#60a5fa", fill: "rgba(96, 165, 250, 0.25)" },
  follows_and_unfollows: {
    border: "#f472b6",
    fill: "rgba(244, 114, 182, 0.25)",
  },
  online_followers: { border: "#fbbf24", fill: "rgba(251, 191, 36, 0.25)" },
};

/** Só estas entram em gráfico de linha (quando houver série diária). */
const METRICAS_COM_SERIE = ["reach", "profile_views", "follower_count"];

let subabaAtiva = "perfil";
let periodoAtivo = "day";
let carregando = false;
let metricasCarregadas = false;
let agendamentosCarregados = false;
let automacaoCarregada = false;
let ouvintesProntos = false;
/** @type {import('chart.js').Chart[]} */
let chartInstancias = [];
/** Cleanup do viewer de stories aberto (ESC / fechar). */
let fecharViewerStories = null;

const STORY_DURACAO_IMG_MS = 5000;

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
  return n.toLocaleString("pt-BR");
}

function formatarData(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

/** Chave estável por dia (evita colisão no eixo X do gráfico). */
function chaveDia(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  } catch {
    return String(iso);
  }
}

function tipoConta(tipo) {
  if (!tipo) return null;
  if (tipo === "Media_Creator") return "Creator";
  if (tipo === "Business") return "Business";
  return tipo;
}

function mostrarErro(mensagem) {
  const no = $("#ig-erro");
  if (!no) return;
  if (!mensagem) {
    no.classList.add("hidden");
    no.textContent = "";
    return;
  }
  no.textContent = mensagem;
  no.classList.remove("hidden");
}

function destruirCharts() {
  for (const c of chartInstancias) {
    try {
      c.destroy();
    } catch {
      /* ignore */
    }
  }
  chartInstancias = [];
}

function setCarregando(ativo) {
  carregando = ativo;
  const botao = $("#ig-atualizar");
  if (botao) {
    botao.disabled = ativo;
    botao.classList.toggle("opacity-60", ativo);
    const icone = botao.querySelector("iconify-icon");
    if (icone) icone.classList.toggle("animate-spin", ativo);
  }
  if (ativo) mostrarErro("");
}

function montarSubabas() {
  const container = $("#ig-subabas");
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

async function trocarSubaba(id) {
  if (subabaAtiva === id) return;
  subabaAtiva = id;
  montarSubabas();
  $("#ig-painel-perfil")?.classList.toggle("hidden", id !== "perfil");
  $("#ig-painel-metricas")?.classList.toggle("hidden", id !== "metricas");
  $("#ig-painel-agendar")?.classList.toggle("hidden", id !== "agendar");
  $("#ig-painel-automacao")?.classList.toggle("hidden", id !== "automacao");
  if (id === "metricas" && !metricasCarregadas) {
    await carregarMetricas();
  } else if (id === "agendar" && !agendamentosCarregados) {
    await carregarAgendamentos();
  } else if (id === "automacao" && !automacaoCarregada) {
    await carregarAbaAutomacao();
  }
}

function blocoSkeleton(classe) {
  return el("div", { class: `ig-skeleton ${classe}`, "aria-hidden": "true" });
}

function renderSkeletonPerfil() {
  const painel = $("#ig-painel-perfil");
  painel.innerHTML = "";
  const phone = el(
    "div",
    { class: "ig-phone", role: "status", "aria-label": "Carregando perfil" },
    el(
      "div",
      {
        class:
          "flex items-center justify-between px-5 sm:px-6 h-14 border-b border-linha",
      },
      blocoSkeleton("h-5 w-36 rounded-md"),
      blocoSkeleton("h-6 w-16 rounded-full"),
    ),
    el(
      "div",
      { class: "px-5 sm:px-6 pt-6 pb-4" },
      el(
        "div",
        { class: "flex items-center gap-5 sm:gap-8" },
        blocoSkeleton("w-24 h-24 sm:w-28 sm:h-28 rounded-full shrink-0"),
        el(
          "div",
          { class: "flex-1 grid grid-cols-3 gap-2 text-center" },
          ...[0, 1, 2].map(() =>
            el(
              "div",
              { class: "flex flex-col items-center gap-1.5" },
              blocoSkeleton("h-5 w-12"),
              blocoSkeleton("h-3 w-14"),
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "mt-5 space-y-2" },
        blocoSkeleton("h-4 w-40"),
        blocoSkeleton("h-3.5 w-28"),
      ),
    ),
    el(
      "div",
      { class: "grid grid-cols-3 gap-px bg-linha border-t border-linha" },
      ...Array.from({ length: 9 }, () =>
        blocoSkeleton("aspect-square rounded-none"),
      ),
    ),
  );
  painel.append(phone);
}

function renderSkeletonMetricas() {
  const painel = $("#ig-painel-metricas");
  destruirCharts();
  painel.innerHTML = "";
  painel.append(
    el(
      "div",
      {
        class: "flex flex-wrap items-center justify-between gap-3 mb-5",
        role: "status",
        "aria-label": "Carregando métricas",
      },
      blocoSkeleton("h-6 w-40"),
      el(
        "div",
        { class: "flex gap-2" },
        blocoSkeleton("h-8 w-16 rounded-full"),
        blocoSkeleton("h-8 w-20 rounded-full"),
        blocoSkeleton("h-8 w-20 rounded-full"),
      ),
    ),
    el(
      "div",
      { class: "grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5" },
      ...Array.from({ length: 4 }, () =>
        el(
          "div",
          { class: `${CLASSE_PAINEL} flex flex-col gap-2` },
          blocoSkeleton("h-3 w-20"),
          blocoSkeleton("h-8 w-16"),
        ),
      ),
    ),
    el(
      "div",
      { class: "grid grid-cols-1 lg:grid-cols-2 gap-3.5" },
      ...Array.from({ length: 4 }, () =>
        el(
          "div",
          { class: CLASSE_PAINEL },
          blocoSkeleton("h-4 w-36 mb-4"),
          blocoSkeleton("h-48 w-full rounded-xl"),
        ),
      ),
    ),
  );
}

function iconeTipoMidia(tipo) {
  if (tipo === "VIDEO" || tipo === "REELS") return "lucide:clapperboard";
  if (tipo === "CAROUSEL_ALBUM") return "lucide:layers";
  return null;
}

function thumbMidia(item) {
  const src = item.thumbnail_url || item.media_url || "";
  const tipo = item.media_type || "IMAGE";
  const icone = iconeTipoMidia(tipo);
  const capa = src
    ? el("img", {
        src,
        alt: item.caption ? String(item.caption).slice(0, 80) : "Publicação",
        class: "w-full h-full object-cover",
        loading: "lazy",
      })
    : el(
        "div",
        {
          class:
            "w-full h-full flex items-center justify-center bg-fundo text-cinza",
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:image-off",
          class: "text-xl",
        }),
      );

  return el(
    "a",
    {
      href: item.permalink || "#",
      target: "_blank",
      rel: "noopener noreferrer",
      class:
        "relative aspect-square bg-fundo overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-vekta",
      title: item.caption || tipo,
    },
    capa,
    icone
      ? el(
          "span",
          { class: "absolute top-1.5 right-1.5 text-white drop-shadow" },
          el("iconify-icon", {
            noobserver: "",
            icon: icone,
            class: "text-[14px]",
            "aria-hidden": "true",
          }),
        )
      : null,
  );
}

function avatarPerfil(p, username, { comStories = false, onAbrirStories = null } = {}) {
  const imgClass =
    "ig-avatar-img w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover shrink-0";
  const fallback = el(
    "div",
    {
      class:
        "ig-avatar-fallback w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-linha bg-fundo flex items-center justify-center shrink-0 text-cinza",
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:user",
      class: "text-4xl",
    }),
  );
  const foto = p.profile_picture_url
    ? el("img", {
        src: p.profile_picture_url,
        alt: `@${username}`,
        class: `${imgClass}${comStories ? "" : " ring-1 ring-linha"}`,
      })
    : fallback;

  if (!comStories || typeof onAbrirStories !== "function") return foto;

  return el(
    "button",
    {
      type: "button",
      class: "ig-story-ring shrink-0",
      title: "Ver stories",
      "aria-label": `Ver stories de @${username}`,
      onclick: onAbrirStories,
    },
    foto,
  );
}

function abrirViewerStories(stories, { username, avatarUrl } = {}) {
  if (!Array.isArray(stories) || stories.length === 0) return;
  if (typeof fecharViewerStories === "function") fecharViewerStories();

  let indice = 0;
  let timerImg = null;
  let videoEl = null;
  const total = stories.length;

  const overlay = el("div", {
    class: "ig-story-viewer",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": `Stories de @${username || "conta"}`,
  });

  const frame = el("div", { class: "ig-story-viewer__frame" });
  const progress = el("div", { class: "ig-story-viewer__progress" });
  const barras = stories.map(() => {
    const fill = el("div", { class: "ig-story-viewer__bar-fill" });
    const bar = el("div", { class: "ig-story-viewer__bar" }, fill);
    progress.append(bar);
    return { bar, fill };
  });

  const mediaHost = el("div", { class: "ig-story-viewer__media" });

  const avatarMini = avatarUrl
    ? el("img", {
        src: avatarUrl,
        alt: "",
        class: "w-8 h-8 rounded-full object-cover ring-1 ring-white/40",
      })
    : el(
        "div",
        {
          class:
            "w-8 h-8 rounded-full bg-white/15 flex items-center justify-center",
        },
        el("iconify-icon", {
          noobserver: "",
          icon: "lucide:user",
          class: "text-sm text-white",
        }),
      );

  const btnFechar = el(
    "button",
    {
      type: "button",
      class:
        "w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10",
      "aria-label": "Fechar stories",
      onclick: () => fechar(),
    },
    el("iconify-icon", {
      noobserver: "",
      icon: "lucide:x",
      class: "text-xl",
    }),
  );

  const header = el(
    "div",
    { class: "ig-story-viewer__header" },
    avatarMini,
    el(
      "div",
      { class: "min-w-0" },
      el(
        "p",
        { class: "text-sm font-semibold truncate drop-shadow" },
        username || "conta",
      ),
      el("p", { class: "text-[11px] text-white/70", id: "ig-story-tempo" }, ""),
    ),
    btnFechar,
  );

  const nav = el(
    "div",
    { class: "ig-story-viewer__nav" },
    el("button", {
      type: "button",
      "aria-label": "Story anterior",
      onclick: (e) => {
        e.stopPropagation();
        anterior();
      },
    }),
    el("button", {
      type: "button",
      "aria-label": "Próximo story",
      onclick: (e) => {
        e.stopPropagation();
        proximo();
      },
    }),
  );

  frame.append(progress, header, mediaHost, nav);
  overlay.append(frame);
  document.body.append(overlay);

  function limparTimer() {
    if (timerImg) {
      clearTimeout(timerImg);
      timerImg = null;
    }
    if (videoEl) {
      videoEl.onended = null;
      videoEl.onloadedmetadata = null;
      videoEl.pause?.();
      videoEl = null;
    }
  }

  function atualizarBarras(modo = "imagem", duracaoMs = STORY_DURACAO_IMG_MS) {
    barras.forEach(({ bar, fill }, i) => {
      bar.classList.remove("is-done", "is-active");
      fill.style.animation = "none";
      fill.style.width = i < indice ? "100%" : "0%";
      if (i < indice) {
        bar.classList.add("is-done");
      } else if (i === indice && modo === "imagem") {
        // força restart da animação CSS
        void fill.offsetWidth;
        fill.style.width = "";
        fill.style.animation = "";
        fill.style.animationDuration = `${duracaoMs}ms`;
        bar.classList.add("is-active");
      }
    });
  }

  function fechar() {
    limparTimer();
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    if (fecharViewerStories === fechar) fecharViewerStories = null;
  }

  function onKey(e) {
    if (e.key === "Escape") fechar();
    else if (e.key === "ArrowRight") proximo();
    else if (e.key === "ArrowLeft") anterior();
  }

  function anterior() {
    if (indice <= 0) {
      fechar();
      return;
    }
    indice -= 1;
    mostrarAtual();
  }

  function proximo() {
    if (indice >= total - 1) {
      fechar();
      return;
    }
    indice += 1;
    mostrarAtual();
  }

  function mostrarAtual() {
    limparTimer();
    const item = stories[indice];
    const tipo = item.media_type || "IMAGE";
    const src = item.media_url || item.thumbnail_url || "";
    mediaHost.innerHTML = "";

    const tempoEl = overlay.querySelector("#ig-story-tempo");
    if (tempoEl) tempoEl.textContent = formatarData(item.timestamp);

    if (!src) {
      mediaHost.append(
        el(
          "p",
          { class: "text-white/70 text-sm px-6 text-center" },
          "Mídia indisponível",
        ),
      );
      atualizarBarras("imagem", STORY_DURACAO_IMG_MS);
      timerImg = setTimeout(proximo, STORY_DURACAO_IMG_MS);
      return;
    }

    if (tipo === "VIDEO") {
      atualizarBarras("video");
      const video = document.createElement("video");
      video.src = src;
      video.playsInline = true;
      video.autoplay = true;
      video.controls = false;
      video.className = "w-full h-full object-contain";
      videoEl = video;
      mediaHost.append(video);
      video.onended = () => proximo();
      video.onloadedmetadata = () => {
        const dur = Number(video.duration);
        if (Number.isFinite(dur) && dur > 0) {
          const fill = barras[indice].fill;
          const bar = barras[indice].bar;
          fill.style.animation = "none";
          void fill.offsetWidth;
          fill.style.animation = "";
          fill.style.animationDuration = `${dur * 1000}ms`;
          bar.classList.add("is-active");
        }
      };
      video.play().catch(() => {});
    } else {
      mediaHost.append(
        el("img", {
          src,
          alt: item.caption ? String(item.caption).slice(0, 80) : "Story",
          class: "w-full h-full object-contain",
        }),
      );
      atualizarBarras("imagem", STORY_DURACAO_IMG_MS);
      timerImg = setTimeout(proximo, STORY_DURACAO_IMG_MS);
    }
  }

  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) fechar();
  });
  fecharViewerStories = fechar;
  mostrarAtual();
}

function estatistica(valor, rotulo) {
  return el(
    "div",
    { class: "flex flex-col items-center min-w-0" },
    el(
      "span",
      {
        class:
          "font-semibold text-lg sm:text-xl text-tinta tabular-nums leading-tight",
      },
      formatarNumero(valor),
    ),
    el("span", { class: "text-[13px] text-cinza leading-tight mt-1" }, rotulo),
  );
}

function renderPerfil(dados) {
  const painel = $("#ig-painel-perfil");
  painel.innerHTML = "";
  const p = dados.perfil || {};
  const midias = Array.isArray(dados.midias) ? dados.midias : [];
  const stories = Array.isArray(dados.stories) ? dados.stories : [];
  const tipo = tipoConta(p.account_type);
  const username = p.username || "conta";
  const temStories = stories.length > 0;

  const topo = el(
    "div",
    {
      class: "flex items-center gap-3 px-5 sm:px-6 h-14 border-b border-linha",
    },
    el(
      "span",
      {
        class:
          "font-semibold text-lg sm:text-xl tracking-tight truncate flex-1",
      },
      username,
    ),
    tipo
      ? el(
          "span",
          {
            class:
              "shrink-0 font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-vekta-suave text-vekta",
          },
          tipo,
        )
      : null,
  );

  const avatar = avatarPerfil(p, username, {
    comStories: temStories,
    onAbrirStories: () =>
      abrirViewerStories(stories, {
        username,
        avatarUrl: p.profile_picture_url,
      }),
  });

  const info = el(
    "div",
    { class: "px-5 sm:px-6 pt-6 pb-4" },
    el(
      "div",
      { class: "flex items-center gap-5 sm:gap-8" },
      avatar,
      el(
        "div",
        { class: "flex-1 grid grid-cols-3 gap-2" },
        estatistica(p.media_count, "publicações"),
        estatistica(p.followers_count, "seguidores"),
        estatistica(p.follows_count, "seguindo"),
      ),
    ),
    el(
      "div",
      { class: "mt-5" },
      p.name
        ? el(
            "p",
            { class: "text-base font-semibold text-tinta leading-snug" },
            p.name,
          )
        : null,
      el("p", { class: "text-sm text-cinza mt-1" }, `@${username}`),
      temStories
        ? el(
            "button",
            {
              type: "button",
              class:
                "mt-2 text-sm text-vekta hover:underline underline-offset-2",
              onclick: () =>
                abrirViewerStories(stories, {
                  username,
                  avatarUrl: p.profile_picture_url,
                }),
            },
            `${stories.length} stor${stories.length === 1 ? "y" : "ies"} ativo${stories.length === 1 ? "" : "s"}`,
          )
        : null,
    ),
  );

  const abasGrade = el(
    "div",
    { class: "flex items-center justify-center border-t border-linha h-12" },
    el(
      "div",
      {
        class:
          "flex items-center gap-2 text-vekta border-t-2 border-vekta -mt-px px-4 h-full",
      },
      el("iconify-icon", {
        noobserver: "",
        icon: "lucide:grid-3x3",
        class: "text-[18px]",
        "aria-hidden": "true",
      }),
      el(
        "span",
        { class: "font-mono text-[11px] uppercase tracking-widest" },
        "Publicações",
      ),
    ),
  );

  const grade = el("div", { class: "grid grid-cols-3 gap-px bg-linha" });
  if (midias.length === 0) {
    grade.append(
      el(
        "div",
        {
          class:
            "col-span-3 bg-superficie py-16 text-center text-cinza text-sm",
        },
        "Nenhuma publicação recente",
      ),
    );
  } else {
    for (const item of midias) grade.append(thumbMidia(item));
  }

  const phone = el("div", { class: "ig-phone" }, topo, info, abasGrade, grade);
  painel.append(phone);
  animarEntrada([phone]);
}

function valorMetrica(item) {
  if (!item) return null;
  if (item.total_value?.value != null) return item.total_value.value;
  const values = item.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  if (item.name === "follower_count") {
    return values.reduce((acc, v) => acc + (Number(v.value) || 0), 0);
  }
  const ultimo = values[values.length - 1];
  return ultimo?.value ?? null;
}

function serieMetrica(item) {
  if (!Array.isArray(item?.values) || item.values.length === 0) return [];
  return item.values
    .map((v) => ({
      valor: v.value,
      fim: v.end_time || null,
      chave: chaveDia(v.end_time),
    }))
    .filter((v) => v.valor != null);
}

function montarSeletorPeriodo() {
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
            metricasCarregadas = false;
            await carregarMetricas();
          },
        },
        p.rotulo,
      ),
    );
  }
  return grupo;
}

function opcoesLinha({ legenda = true } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: legenda,
        position: "bottom",
        labels: {
          color: "#8890a1",
          boxWidth: 12,
          padding: 14,
          font: { family: "'Instrument Sans', sans-serif", size: 12 },
        },
      },
      tooltip: {
        backgroundColor: "#14161c",
        borderColor: "#23262f",
        borderWidth: 1,
        titleColor: "#eef0f4",
        bodyColor: "#8890a1",
        padding: 10,
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#565d6d",
          font: { size: 11 },
          maxRotation: 45,
          minRotation: 0,
        },
        grid: { color: "rgba(35, 38, 47, 0.7)" },
        border: { color: "#23262f" },
      },
      y: {
        ticks: {
          color: "#565d6d",
          font: { size: 11 },
          callback: (v) => formatarNumero(v),
        },
        grid: { color: "rgba(35, 38, 47, 0.7)" },
        border: { color: "#23262f" },
        beginAtZero: true,
      },
    },
  };
}

function registrarChart(chart) {
  if (chart) chartInstancias.push(chart);
  return chart;
}

function painelChart(titulo, canvasId, altura = "h-52") {
  return el(
    "article",
    { class: CLASSE_PAINEL },
    el("h4", { class: "font-display text-base font-semibold mb-3" }, titulo),
    el(
      "div",
      { class: `relative ${altura} w-full` },
      el("canvas", { id: canvasId, "aria-label": titulo }),
    ),
  );
}

function pontosDaSerie(item) {
  return serieMetrica(item);
}

function montarLinha(canvas, item, nome) {
  if (typeof Chart === "undefined" || !canvas || !item) return null;
  const pontos = pontosDaSerie(item);
  if (pontos.length < 2) return null;
  const cor = CORES_CHART[nome] || CORES_CHART.reach;
  return registrarChart(
    new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: pontos.map((p) => formatarData(p.fim) || p.chave),
        datasets: [
          {
            label: ROTULOS_METRICA[nome] || nome,
            data: pontos.map((p) => p.valor),
            borderColor: cor.border,
            backgroundColor: cor.fill,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: opcoesLinha({ legenda: false }),
    }),
  );
}

function montarComparacaoBarras(canvas, totais) {
  if (typeof Chart === "undefined" || !canvas) return null;
  const nomes = [
    "reach",
    "profile_views",
    "views",
    "follower_count",
    "accounts_engaged",
    "total_interactions",
  ];
  const presentes = nomes.filter((n) => totais[n] != null);
  if (presentes.length < 2) return null;
  return registrarChart(
    new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: presentes.map((n) => ROTULOS_METRICA[n] || n),
        datasets: [
          {
            label: "Total no período",
            data: presentes.map((n) => totais[n]),
            backgroundColor: presentes.map(
              (n) => (CORES_CHART[n] || CORES_CHART.reach).fill,
            ),
            borderColor: presentes.map(
              (n) => (CORES_CHART[n] || CORES_CHART.reach).border,
            ),
            borderWidth: 1.5,
            borderRadius: 8,
          },
        ],
      },
      options: opcoesLinha({ legenda: false }),
    }),
  );
}

function montarComparacaoRadar(canvas, totais) {
  if (typeof Chart === "undefined" || !canvas) return null;
  const nomes = [
    "reach",
    "profile_views",
    "views",
    "accounts_engaged",
    "total_interactions",
  ];
  const presentes = nomes.filter(
    (n) => totais[n] != null && Number(totais[n]) >= 0,
  );
  if (presentes.length < 3) return null;

  const max = Math.max(...presentes.map((n) => Number(totais[n]) || 0), 1);
  return registrarChart(
    new Chart(canvas.getContext("2d"), {
      type: "radar",
      data: {
        labels: presentes.map((n) => ROTULOS_METRICA[n] || n),
        datasets: [
          {
            label: "Proporção no período",
            data: presentes.map((n) =>
              Math.round((Number(totais[n]) / max) * 100),
            ),
            borderColor: "#0e8a76",
            backgroundColor: "rgba(14, 138, 118, 0.22)",
            pointBackgroundColor: presentes.map(
              (n) => (CORES_CHART[n] || CORES_CHART.reach).border,
            ),
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
              label: (ctx) => {
                const nome = presentes[ctx.dataIndex];
                const bruto = totais[nome];
                return `${ROTULOS_METRICA[nome]}: ${formatarNumero(bruto)} (${Math.round(ctx.raw)}% do pico)`;
              },
            },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            grid: { color: "rgba(35, 38, 47, 0.9)" },
            angleLines: { color: "rgba(35, 38, 47, 0.9)" },
            pointLabels: {
              color: "#8890a1",
              font: { size: 11, family: "'Instrument Sans', sans-serif" },
            },
          },
        },
      },
    }),
  );
}

function montarLinhaCombinada(canvas, seriesMap) {
  if (typeof Chart === "undefined" || !canvas) return null;
  const seriesOk = METRICAS_COM_SERIE.map((nome) => ({
    nome,
    pontos: pontosDaSerie(seriesMap[nome]),
  })).filter((s) => s.pontos.length >= 2);
  if (seriesOk.length < 2) return null;

  const chaves = [];
  const visto = new Set();
  for (const s of seriesOk) {
    for (const p of s.pontos) {
      if (p.chave && !visto.has(p.chave)) {
        visto.add(p.chave);
        chaves.push({ chave: p.chave, fim: p.fim });
      }
    }
  }
  chaves.sort((a, b) => String(a.chave).localeCompare(String(b.chave)));

  return registrarChart(
    new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: chaves.map((c) => formatarData(c.fim) || c.chave),
        datasets: seriesOk.map((s) => {
          const mapa = new Map(s.pontos.map((p) => [p.chave, p.valor]));
          const cor = CORES_CHART[s.nome] || CORES_CHART.reach;
          return {
            label: ROTULOS_METRICA[s.nome] || s.nome,
            data: chaves.map((c) =>
              mapa.has(c.chave) ? mapa.get(c.chave) : null,
            ),
            borderColor: cor.border,
            backgroundColor: "transparent",
            fill: false,
            tension: 0.35,
            pointRadius: 2,
            spanGaps: true,
          };
        }),
      },
      options: opcoesLinha({ legenda: true }),
    }),
  );
}

function valorCard(dados, nome, porNome) {
  if (dados.totais && dados.totais[nome] != null) return dados.totais[nome];
  if (dados.series && dados.series[nome])
    return valorMetrica(dados.series[nome]);
  return valorMetrica(porNome.get(nome));
}

function formatarPct(variacao) {
  if (!variacao) return "—";
  if (variacao.novo) return "novo";
  if (variacao.pct == null || Number.isNaN(Number(variacao.pct))) return "—";
  const n = Number(variacao.pct);
  const sinal = n > 0 ? "+" : "";
  return `${sinal}${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function classeVariacao(variacao) {
  if (!variacao) return "text-cinza";
  if (variacao.direcao === "alta" || variacao.novo) return "text-vekta";
  if (variacao.direcao === "baixa") return "text-alerta";
  return "text-cinza";
}

function seloVariacao(variacao) {
  const texto = formatarPct(variacao);
  if (texto === "—") return el("span", { class: "text-sm text-cinza" }, "—");
  const icone =
    variacao?.novo || variacao?.direcao === "alta"
      ? "lucide:trending-up"
      : variacao?.direcao === "baixa"
        ? "lucide:trending-down"
        : "lucide:minus";
  return el(
    "span",
    {
      class: `inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${classeVariacao(variacao)}`,
    },
    el("iconify-icon", {
      noobserver: "",
      icon: icone,
      class: "text-[14px]",
      "aria-hidden": "true",
    }),
    texto,
  );
}

function montarDonutViews(canvas, breakdown) {
  if (typeof Chart === "undefined" || !canvas || !breakdown) return null;
  const seg = Number(breakdown.followers) || 0;
  const nao = Number(breakdown.non_followers) || 0;
  if (seg + nao <= 0) return null;
  const total = breakdown.total ?? seg + nao;

  return registrarChart(
    new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Seguidores", "Não seguidores"],
        datasets: [
          {
            data: [seg, nao],
            backgroundColor: ["#E1306C", "#833AB4"],
            borderColor: "#14161c",
            borderWidth: 3,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#14161c",
            borderColor: "#23262f",
            borderWidth: 1,
            titleColor: "#eef0f4",
            bodyColor: "#8890a1",
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                const p =
                  total > 0
                    ? ((v / total) * 100).toFixed(1).replace(".", ",")
                    : "0";
                return ` ${ctx.label}: ${formatarNumero(v)} (${p}%)`;
              },
            },
          },
        },
      },
    }),
  );
}

function blocoDonutVisualizacoes(breakdown, variacao) {
  if (!breakdown || breakdown.total == null) return null;

  const seg = Number(breakdown.followers) || 0;
  const nao = Number(breakdown.non_followers) || 0;
  const total = breakdown.total;
  const temPartes = seg + nao > 0;
  const base = seg + nao || 1;
  const pctSeg = temPartes
    ? ((seg / base) * 100).toFixed(1).replace(".", ",")
    : null;
  const pctNao = temPartes
    ? ((nao / base) * 100).toFixed(1).replace(".", ",")
    : null;

  const wrap = el(
    "article",
    { class: `${CLASSE_PAINEL} mb-5` },
    el(
      "div",
      { class: "flex items-center justify-between gap-3 mb-4" },
      el(
        "h4",
        { class: "font-display text-base font-semibold" },
        "Visualizações",
      ),
      seloVariacao(variacao),
    ),
  );

  if (temPartes) {
    wrap.append(
      el(
        "div",
        { class: "relative mx-auto w-48 h-48 mb-5" },
        el("canvas", {
          id: "ig-donut-views",
          "aria-label": "Visualizações por tipo de audiência",
        }),
        el(
          "div",
          {
            class:
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4",
          },
          el("p", { class: "text-[11px] text-cinza" }, "Visualizações"),
          el(
            "p",
            {
              class:
                "font-display text-2xl font-semibold tabular-nums leading-tight",
            },
            formatarNumero(total),
          ),
        ),
      ),
    );
    wrap.append(
      el(
        "div",
        { class: "flex flex-col gap-2.5 border-t border-linha pt-4" },
        el(
          "div",
          { class: "flex items-center justify-between gap-3 text-sm" },
          el(
            "span",
            { class: "inline-flex items-center gap-2 text-tinta" },
            el("span", {
              class: "w-2.5 h-2.5 rounded-full shrink-0",
              style: "background:#E1306C",
            }),
            "Seguidores",
          ),
          el("span", { class: "tabular-nums text-cinza" }, `${pctSeg}%`),
        ),
        el(
          "div",
          { class: "flex items-center justify-between gap-3 text-sm" },
          el(
            "span",
            { class: "inline-flex items-center gap-2 text-tinta" },
            el("span", {
              class: "w-2.5 h-2.5 rounded-full shrink-0",
              style: "background:#833AB4",
            }),
            "Não seguidores",
          ),
          el("span", { class: "tabular-nums text-cinza" }, `${pctNao}%`),
        ),
      ),
    );
  } else {
    wrap.append(
      el(
        "div",
        { class: "text-center py-6" },
        el("p", { class: "text-[11px] text-cinza mb-1" }, "Visualizações"),
        el(
          "p",
          { class: "font-display text-3xl font-semibold tabular-nums" },
          formatarNumero(total),
        ),
        el(
          "p",
          { class: "text-xs text-cinza mt-2" },
          "Sem breakdown de seguidores nesta janela.",
        ),
      ),
    );
  }

  return wrap;
}

function blocoListaInsights(titulo, linhas) {
  const validas = linhas.filter((l) => l.valor != null);
  if (validas.length === 0) return null;

  const cards = validas.map((l) =>
    el(
      "article",
      { class: `${CLASSE_PAINEL} flex flex-col gap-3 min-w-0` },
      el(
        "div",
        { class: "flex items-start justify-between gap-2" },
        el("p", { class: "text-sm text-cinza leading-snug" }, l.rotulo),
        l.variacao
          ? seloVariacao(l.variacao)
          : el("span", { class: "text-sm text-cinza" }, ""),
      ),
      el(
        "p",
        {
          class:
            "font-display text-3xl font-semibold tabular-nums text-tinta leading-none",
        },
        formatarNumero(l.valor),
      ),
      l.detalhe
        ? el(
            "p",
            {
              class: "text-[11px] text-cinza-claro pt-2 border-t border-linha",
            },
            l.detalhe,
          )
        : null,
    ),
  );

  return el(
    "section",
    { class: "mb-5" },
    el("h4", { class: "font-display text-base font-semibold mb-4" }, titulo),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5" },
      ...cards,
    ),
  );
}

function blocoComparacaoMensal(comp) {
  if (!comp || !comp.variacoes || Object.keys(comp.variacoes).length === 0) {
    return el(
      "section",
      { class: "mb-5" },
      el(
        "h4",
        { class: "font-display text-base font-semibold mb-2" },
        "Mês atual vs mês passado",
      ),
      el(
        "p",
        { class: CLASSE_VAZIO },
        "Ainda sem dados suficientes para comparar os meses.",
      ),
    );
  }

  const cards = Object.entries(comp.variacoes).map(([nome, v]) =>
    el(
      "article",
      { class: `${CLASSE_PAINEL} flex flex-col gap-3 min-w-0` },
      el(
        "div",
        { class: "flex items-start justify-between gap-2" },
        el(
          "p",
          { class: "text-sm text-cinza leading-snug" },
          ROTULOS_METRICA[nome] || nome,
        ),
        seloVariacao(v),
      ),
      el(
        "p",
        {
          class:
            "font-display text-3xl font-semibold tabular-nums text-tinta leading-none",
        },
        formatarNumero(v.atual),
      ),
      el(
        "div",
        { class: "pt-2 border-t border-linha flex flex-col gap-1" },
        el(
          "p",
          { class: "text-[11px] text-cinza-claro" },
          `${comp.mes_atual?.rotulo || "Mês atual"}`,
        ),
        el(
          "p",
          { class: "text-xs text-cinza" },
          `vs ${comp.mes_passado?.rotulo || "mês passado"}: ${formatarNumero(v.passado)}`,
        ),
      ),
    ),
  );

  return el(
    "section",
    { class: "mb-5" },
    el(
      "h4",
      { class: "font-display text-base font-semibold mb-1" },
      "Mês atual vs mês passado",
    ),
    el(
      "p",
      { class: "text-xs text-cinza mb-4" },
      `Comparando ${comp.mes_atual?.rotulo || "mês atual"} com ${comp.mes_passado?.rotulo || "mês passado"}.`,
    ),
    el(
      "div",
      { class: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5" },
      ...cards,
    ),
  );
}

function temSerieGrafico(item) {
  return serieMetrica(item).length >= 2;
}

function renderMetricas(dados) {
  const painel = $("#ig-painel-metricas");
  destruirCharts();
  painel.innerHTML = "";

  const topo = el(
    "div",
    { class: "flex flex-wrap items-center justify-between gap-3 mb-5" },
    el(
      "div",
      {},
      el(
        "h3",
        { class: "font-display text-lg font-semibold" },
        "Métricas da conta",
      ),
      dados.dias
        ? el(
            "p",
            { class: "text-xs text-cinza mt-1" },
            `Período: últimos ${dados.dias} dia${dados.dias === 1 ? "" : "s"}`,
          )
        : null,
    ),
    montarSeletorPeriodo(),
  );
  painel.append(topo);

  const seriesMap = dados.series || {};
  const vars = dados.comparacao_mensal?.variacoes || {};
  const eng = dados.engajamento || {};
  const bd = dados.breakdowns || {};

  const donut = blocoDonutVisualizacoes(bd.views, vars.views);
  if (donut) {
    painel.append(donut);
    if (bd.views?.followers != null || bd.views?.non_followers != null) {
      montarDonutViews(document.getElementById("ig-donut-views"), bd.views);
    }
  }

  const listaPrincipal = blocoListaInsights(
    "Desempenho",
    [
      {
        rotulo: "Contas alcançadas",
        valor: dados.totais?.reach,
        variacao: vars.reach,
      },
      {
        rotulo: "Visitas ao perfil",
        valor: dados.totais?.profile_views,
        variacao: vars.profile_views,
      },
      {
        rotulo: "Visualizações",
        valor: dados.totais?.views,
        variacao: vars.views,
        detalhe: donut ? null : "Total no período",
      },
      {
        rotulo: "Contas engajadas",
        valor: eng.accounts_engaged ?? dados.totais?.accounts_engaged,
        variacao: vars.accounts_engaged,
      },
      {
        rotulo: "Interações",
        valor: eng.total_interactions ?? dados.totais?.total_interactions,
        variacao: vars.total_interactions,
      },
      {
        rotulo: "Novos seguidores",
        valor: dados.totais?.follower_count,
        variacao: null,
        detalhe:
          dados.followers_absoluto != null
            ? `Total atual: ${formatarNumero(dados.followers_absoluto)}`
            : null,
      },
      { rotulo: "Follows", valor: eng.follows, variacao: null },
      { rotulo: "Unfollows", valor: eng.unfollows, variacao: null },
      {
        rotulo: "Seguidores online (pico)",
        valor: eng.online_followers,
        variacao: null,
      },
    ].filter((l) => !(l.rotulo === "Visualizações" && donut)),
  );
  if (listaPrincipal) painel.append(listaPrincipal);

  painel.append(blocoComparacaoMensal(dados.comparacao_mensal));

  if (Array.isArray(dados.avisos) && dados.avisos.length) {
    const unicos = [
      ...new Set(
        dados.avisos.map((a) => ROTULOS_METRICA[a.metrica] || a.metrica),
      ),
    ];
  }

  const defsLinha = [
    { nome: "reach", titulo: "Alcance (dia a dia)", id: "ig-chart-reach" },
    {
      nome: "profile_views",
      titulo: "Visitas ao perfil",
      id: "ig-chart-profile",
    },
    {
      nome: "follower_count",
      titulo: "Novos seguidores",
      id: "ig-chart-followers",
    },
  ].filter((def) => temSerieGrafico(seriesMap[def.nome]));

  if (defsLinha.length) {
    const gradeLinhas = el("div", {
      class: `grid grid-cols-1 ${defsLinha.length > 1 ? "lg:grid-cols-2" : ""} gap-3.5 mb-3.5`,
    });
    for (const def of defsLinha) {
      gradeLinhas.append(painelChart(def.titulo, def.id));
    }
    painel.append(gradeLinhas);
    for (const def of defsLinha) {
      montarLinha(
        document.getElementById(def.id),
        seriesMap[def.nome],
        def.nome,
      );
    }
  }

  if (
    METRICAS_COM_SERIE.filter((n) => temSerieGrafico(seriesMap[n])).length >= 2
  ) {
    const artCombo = painelChart(
      "Séries sobrepostas",
      "ig-chart-combo",
      "h-56",
    );
    painel.append(el("div", { class: "mt-3.5" }, artCombo));
    montarLinhaCombinada(document.getElementById("ig-chart-combo"), seriesMap);
  }

  animarEntrada(painel.querySelectorAll(":scope > *"));
}

async function carregarPerfil() {
  setCarregando(true);
  renderSkeletonPerfil();
  try {
    const dados = await api("/api/instagram/perfil");
    renderPerfil(dados);
  } catch (erro) {
    mostrarErro(erro.message || "Falha ao carregar perfil.");
    $("#ig-painel-perfil").innerHTML = "";
    $("#ig-painel-perfil").append(
      el("p", { class: CLASSE_VAZIO }, "Não foi possível carregar o perfil."),
    );
  } finally {
    setCarregando(false);
  }
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const virgula = result.indexOf(",");
      resolve(virgula >= 0 ? result.slice(virgula + 1) : result);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** datetime-local (hora local) → ISO UTC. */
function localDatetimeParaUtcIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatarDateTimeLocal(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function rotuloTipoPublicacao(tipo) {
  if (tipo === "REELS") return "Reels";
  if (tipo === "STORIES") return "Story";
  if (tipo === "CAROUSEL") return "Carrossel";
  return "Post (imagem)";
}

function acceptParaTipo(tipo) {
  if (tipo === "REELS") return "video/mp4,video/quicktime,.mp4,.mov";
  if (tipo === "STORIES")
    return "image/jpeg,image/png,video/mp4,video/quicktime,.jpg,.jpeg,.png,.mp4,.mov";
  // IMAGE e CAROUSEL: só imagens
  return "image/jpeg,image/png,.jpg,.jpeg,.png";
}

function mimePadraoParaTipo(tipo, file) {
  if (file?.type) return file.type;
  if (tipo === "REELS") return "video/mp4";
  if (tipo === "STORIES") {
    const n = String(file?.name || "").toLowerCase();
    if (n.endsWith(".mp4") || n.endsWith(".mov")) return "video/mp4";
  }
  return "image/jpeg";
}

function cardAgendamento(item, { onCancelar } = {}) {
  const statusCores = {
    pendente: "text-vekta bg-vekta-suave",
    publicando: "text-amber-700 bg-amber-50",
    erro: "text-alerta bg-alerta/10",
  };
  const badge = el(
    "span",
    {
      class: `shrink-0 font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${statusCores[item.status] || "text-cinza bg-fundo"}`,
    },
    item.status || "—",
  );

  return el(
    "div",
    { class: `${CLASSE_PAINEL} flex flex-col gap-2` },
    el(
      "div",
      { class: "flex items-start justify-between gap-3" },
      el(
        "div",
        { class: "min-w-0" },
        el(
          "p",
          { class: "font-semibold text-tinta text-sm" },
          rotuloTipoPublicacao(item.tipo) +
            (item.tipo === "CAROUSEL" && Array.isArray(item.arquivos)
              ? ` · ${item.arquivos.length} imgs`
              : ""),
        ),
        el(
          "p",
          { class: "text-xs text-cinza mt-0.5" },
          formatarDateTimeLocal(item.agendado_para),
        ),
      ),
      badge,
    ),
    item.legenda
      ? el(
          "p",
          { class: "text-sm text-cinza line-clamp-2" },
          item.legenda,
        )
      : el("p", { class: "text-sm text-cinza-claro italic" }, "Sem legenda"),
    item.ultimo_erro
      ? el("p", { class: "text-xs text-alerta" }, item.ultimo_erro)
      : null,
    item.status === "pendente" || item.status === "erro"
      ? el(
          "button",
          {
            type: "button",
            class:
              "self-start mt-1 text-sm text-alerta hover:underline underline-offset-2",
            onclick: () => onCancelar?.(item.id),
          },
          "Cancelar",
        )
      : null,
  );
}

function cardLog(log) {
  return el(
    "div",
    { class: `${CLASSE_PAINEL} flex flex-col gap-1.5` },
    el(
      "div",
      { class: "flex items-start justify-between gap-3" },
      el(
        "p",
        { class: "font-semibold text-tinta text-sm" },
        rotuloTipoPublicacao(log.tipo),
      ),
      el(
        "span",
        {
          class:
            "shrink-0 font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full text-vekta bg-vekta-suave",
        },
        "enviado",
      ),
    ),
    el(
      "p",
      { class: "text-xs text-cinza" },
      `Enviado: ${formatarDateTimeLocal(log.enviado_em)}`,
    ),
    log.legenda
      ? el("p", { class: "text-sm text-cinza line-clamp-2" }, log.legenda)
      : null,
    log.api?.media_id
      ? el(
          "p",
          { class: "text-[11px] font-mono text-cinza-claro truncate" },
          `media_id: ${log.api.media_id}`,
        )
      : null,
  );
}

function renderAgendar(dados) {
  const painel = $("#ig-painel-agendar");
  painel.innerHTML = "";

  const publicOk = Boolean(dados?.public_base_url_ok);
  const fila = Array.isArray(dados?.fila) ? dados.fila : [];
  const logs = Array.isArray(dados?.logs) ? dados.logs : [];
  const pendentes = fila.filter((i) => i.status !== "erro");
  const erros = fila.filter((i) => i.status === "erro");

  let tipoAtivo = "IMAGE";
  /** @type {File[]} */
  let arquivosSelecionados = [];

  const avisoPublic =
    publicOk
      ? null
      : el(
          "div",
          {
            class:
              "mb-4 rounded-xl border border-alerta/40 bg-alerta/10 px-4 py-3 text-sm text-alerta",
            role: "status",
          },
          el(
            "p",
            { class: "font-medium" },
            "META_PUBLIC_BASE_URL não configurada",
          ),
          el(
            "p",
            { class: "mt-1 text-alerta/90" },
            "Você pode agendar, mas a publicação só funciona com uma URL HTTPS pública (túnel/domínio) que a Meta consiga alcançar. Defina em interface/.env e reinicie.",
          ),
        );

  const inputArquivo = el("input", {
    type: "file",
    id: "ig-ag-arquivo",
    class: "hidden",
    accept: acceptParaTipo("IMAGE"),
  });

  const labelArquivo = el(
    "span",
    { class: "text-sm text-cinza", id: "ig-ag-arquivo-nome" },
    "Nenhum arquivo",
  );

  const notaArquivo = el(
    "p",
    { class: "text-[11px] text-cinza mt-1 hidden", id: "ig-ag-nota-arquivo" },
    "Carrossel: selecione de 2 a 10 imagens (JPEG/PNG).",
  );

  const btnArquivo = el(
    "button",
    {
      type: "button",
      class:
        "px-3.5 py-1.5 rounded-full border border-linha bg-superficie text-sm hover:border-cinza-claro",
      onclick: () => inputArquivo.click(),
    },
    "Escolher arquivo",
  );

  function syncLabelArquivos() {
    if (arquivosSelecionados.length === 0) {
      labelArquivo.textContent = "Nenhum arquivo";
      return;
    }
    if (arquivosSelecionados.length === 1) {
      labelArquivo.textContent = arquivosSelecionados[0].name;
      return;
    }
    labelArquivo.textContent = `${arquivosSelecionados.length} imagens selecionadas`;
  }

  inputArquivo.addEventListener("change", () => {
    const lista = Array.from(inputArquivo.files || []);
    arquivosSelecionados =
      tipoAtivo === "CAROUSEL" ? lista.slice(0, 10) : lista.slice(0, 1);
    syncLabelArquivos();
  });

  const notaLegenda = el(
    "p",
    { class: "text-[11px] text-cinza mt-1 hidden", id: "ig-ag-nota-legenda" },
    "Stories não suportam legenda na API da Meta — o campo é ignorado.",
  );

  const textarea = el("textarea", {
    id: "ig-ag-legenda",
    rows: "4",
    maxlength: "2200",
    placeholder: "Legenda do post…",
    class:
      "w-full rounded-xl border border-linha bg-fundo px-3.5 py-2.5 text-sm text-tinta placeholder:text-cinza-claro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta resize-y min-h-[6rem]",
  });

  const inputQuando = el("input", {
    type: "datetime-local",
    id: "ig-ag-quando",
    class:
      "w-full rounded-xl border border-linha bg-fundo px-3.5 py-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta",
  });

  // Default: daqui a 1h
  const padrao = new Date(Date.now() + 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  inputQuando.value = `${padrao.getFullYear()}-${p(padrao.getMonth() + 1)}-${p(padrao.getDate())}T${p(padrao.getHours())}:${p(padrao.getMinutes())}`;

  const tipoBtns = el("div", { class: "flex gap-2 flex-wrap" });
  function syncTipo() {
    tipoBtns.innerHTML = "";
    for (const t of [
      { id: "IMAGE", rotulo: "Post (imagem)" },
      { id: "CAROUSEL", rotulo: "Carrossel" },
      { id: "REELS", rotulo: "Reels" },
      { id: "STORIES", rotulo: "Story" },
    ]) {
      tipoBtns.append(
        el(
          "button",
          {
            type: "button",
            class: pillClasse(t.id === tipoAtivo),
            onclick: () => {
              tipoAtivo = t.id;
              inputArquivo.accept = acceptParaTipo(t.id);
              if (t.id === "CAROUSEL") inputArquivo.setAttribute("multiple", "");
              else inputArquivo.removeAttribute("multiple");
              inputArquivo.value = "";
              arquivosSelecionados = [];
              syncLabelArquivos();
              notaArquivo.classList.toggle("hidden", t.id !== "CAROUSEL");
              notaLegenda.classList.toggle("hidden", t.id !== "STORIES");
              textarea.placeholder =
                t.id === "STORIES"
                  ? "Legenda (ignorada em Stories)…"
                  : "Legenda do post…";
              btnArquivo.textContent =
                t.id === "CAROUSEL" ? "Escolher imagens" : "Escolher arquivo";
              syncTipo();
            },
          },
          t.rotulo,
        ),
      );
    }
  }
  syncTipo();

  async function enviar(agora = false) {
    if (tipoAtivo === "CAROUSEL") {
      if (arquivosSelecionados.length < 2 || arquivosSelecionados.length > 10) {
        mostrarErro("Carrossel exige de 2 a 10 imagens.");
        return;
      }
    } else if (arquivosSelecionados.length === 0) {
      mostrarErro("Selecione um arquivo.");
      return;
    }

    const agendado_para = agora
      ? new Date().toISOString()
      : localDatetimeParaUtcIso(inputQuando.value);
    if (!agendado_para) {
      mostrarErro("Informe data e hora válidas.");
      return;
    }

    setCarregando(true);
    mostrarErro("");
    try {
      let corpoReq;
      if (tipoAtivo === "CAROUSEL") {
        const arquivos = [];
        for (const file of arquivosSelecionados) {
          arquivos.push({
            nome: file.name,
            mediaType: mimePadraoParaTipo(tipoAtivo, file),
            data: await arquivoParaBase64(file),
          });
        }
        corpoReq = {
          tipo: tipoAtivo,
          legenda: textarea.value || "",
          agendado_para,
          arquivos,
        };
      } else {
        const file = arquivosSelecionados[0];
        corpoReq = {
          tipo: tipoAtivo,
          legenda: textarea.value || "",
          agendado_para,
          arquivo: {
            nome: file.name,
            mediaType: mimePadraoParaTipo(tipoAtivo, file),
            data: await arquivoParaBase64(file),
          },
        };
      }

      const corpo = await api("/api/instagram/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoReq),
      });

      if (corpo.publicado) {
        mostrarErro("");
      } else if (corpo.publish_erro) {
        mostrarErro(corpo.publish_erro);
      }

      agendamentosCarregados = false;
      await carregarAgendamentos();
    } catch (erro) {
      mostrarErro(erro.message || "Falha ao agendar.");
    } finally {
      setCarregando(false);
    }
  }

  async function cancelar(id) {
    setCarregando(true);
    try {
      await api(`/api/instagram/agendamentos/${encodeURIComponent(id)}/cancelar`, {
        method: "POST",
      });
      agendamentosCarregados = false;
      await carregarAgendamentos();
    } catch (erro) {
      mostrarErro(erro.message || "Falha ao cancelar.");
    } finally {
      setCarregando(false);
    }
  }

  const form = el(
    "div",
    { class: `${CLASSE_PAINEL} mb-5` },
    el("h3", { class: "font-display text-lg text-tinta mb-4" }, "Novo agendamento"),
    el("p", { class: "text-xs text-cinza mb-2" }, "Tipo"),
    tipoBtns,
    el("p", { class: "text-xs text-cinza mt-4 mb-2" }, "Arquivo"),
    el("div", { class: "flex items-center gap-3 flex-wrap" }, btnArquivo, labelArquivo, inputArquivo),
    notaArquivo,
    el("p", { class: "text-xs text-cinza mt-4 mb-2" }, "Legenda"),
    textarea,
    notaLegenda,
    el("p", { class: "text-xs text-cinza mt-4 mb-2" }, "Data e hora"),
    inputQuando,
    el(
      "div",
      { class: "flex gap-2 flex-wrap mt-5" },
      el(
        "button",
        {
          type: "button",
          class:
            "px-4 py-2 rounded-full bg-vekta text-white text-sm font-medium hover:opacity-90 disabled:opacity-45",
          onclick: () => enviar(false),
        },
        "Agendar",
      ),
      el(
        "button",
        {
          type: "button",
          class:
            "px-4 py-2 rounded-full border border-linha bg-superficie text-sm font-medium hover:border-cinza-claro disabled:opacity-45",
          onclick: () => enviar(true),
        },
        "Publicar agora",
      ),
    ),
  );

  const secaoLista = (titulo, itens, vaziaMsg, renderItem) =>
    el(
      "section",
      { class: "mb-5" },
      el("h3", { class: "font-display text-base text-tinta mb-3" }, titulo),
      itens.length === 0
        ? el("p", { class: "text-sm text-cinza" }, vaziaMsg)
        : el(
            "div",
            { class: "grid grid-cols-1 md:grid-cols-2 gap-3.5" },
            ...itens.map(renderItem),
          ),
    );

  // append(null) vira o texto literal "null" no DOM — só incluir o aviso se existir.
  painel.append(
    ...(avisoPublic ? [avisoPublic] : []),
    form,
    secaoLista(
      "Na fila",
      pendentes,
      "Nenhum agendamento pendente.",
      (item) => cardAgendamento(item, { onCancelar: cancelar }),
    ),
    secaoLista(
      "Com erro",
      erros,
      "Nenhum item com erro.",
      (item) => cardAgendamento(item, { onCancelar: cancelar }),
    ),
    secaoLista("Histórico (enviados)", logs, "Nenhum envio registrado ainda.", cardLog),
  );

  animarEntrada(painel.querySelectorAll(":scope > *"));
}

async function carregarAgendamentos() {
  setCarregando(true);
  const painel = $("#ig-painel-agendar");
  painel.innerHTML = "";
  painel.append(
    el(
      "div",
      { class: CLASSE_PAINEL, role: "status", "aria-label": "Carregando" },
      blocoSkeleton("h-4 w-40 mb-4"),
      blocoSkeleton("h-24 w-full rounded-xl"),
    ),
  );
  try {
    const dados = await api("/api/instagram/agendamentos");
    renderAgendar(dados);
    agendamentosCarregados = true;
  } catch (erro) {
    mostrarErro(erro.message || "Falha ao carregar agendamentos.");
    painel.innerHTML = "";
    painel.append(
      el("p", { class: CLASSE_VAZIO }, "Não foi possível carregar os agendamentos."),
    );
  } finally {
    setCarregando(false);
  }
}

async function carregarMetricas() {
  setCarregando(true);
  renderSkeletonMetricas();
  try {
    const dados = await api(
      `/api/instagram/metricas?periodo=${encodeURIComponent(periodoAtivo)}`,
    );
    renderMetricas(dados);
    metricasCarregadas = true;
  } catch (erro) {
    mostrarErro(erro.message || "Falha ao carregar métricas.");
    destruirCharts();
    $("#ig-painel-metricas").innerHTML = "";
    $("#ig-painel-metricas").append(
      el("div", { class: "mb-5" }, montarSeletorPeriodo()),
      el(
        "p",
        { class: CLASSE_VAZIO },
        "Não foi possível carregar as métricas.",
      ),
    );
  } finally {
    setCarregando(false);
  }
}

async function carregarTudo() {
  metricasCarregadas = false;
  agendamentosCarregados = false;
  automacaoCarregada = false;
  if (subabaAtiva === "metricas") {
    await carregarMetricas();
  } else if (subabaAtiva === "agendar") {
    await carregarAgendamentos();
  } else if (subabaAtiva === "automacao") {
    await carregarAbaAutomacao();
  } else {
    await carregarPerfil();
  }
}

async function carregarAbaAutomacao() {
  setCarregando(true);
  try {
    await carregarAutomacao();
    automacaoCarregada = true;
    mostrarErro("");
  } catch (erro) {
    mostrarErro(erro.message || "Falha ao carregar automação.");
    const painel = $("#ig-painel-automacao");
    if (painel) {
      painel.innerHTML = "";
      painel.append(
        el("p", { class: CLASSE_VAZIO }, "Não foi possível carregar a automação."),
      );
    }
  } finally {
    setCarregando(false);
  }
}

export async function iniciar() {
  if (!ouvintesProntos) {
    montarSubabas();
    $("#ig-atualizar")?.addEventListener("click", () => carregarTudo());
    ouvintesProntos = true;
  } else {
    montarSubabas();
  }

  let status;
  try {
    status = await api("/api/instagram/status");
  } catch (erro) {
    console.error("Falha ao verificar status do Instagram:", erro);
    $("#ig-setup").classList.remove("hidden");
    $("#ig-conteudo").classList.add("hidden");
    mostrarErro(erro.message || "Falha ao verificar configuração.");
    return;
  }

  const ok = Boolean(status?.configurado);
  $("#ig-setup").classList.toggle("hidden", ok);
  $("#ig-conteudo").classList.toggle("hidden", !ok);
  if (!ok) {
    mostrarErro("");
    return;
  }

  await carregarTudo();
}

export async function atualizar() {
  return iniciar();
}
