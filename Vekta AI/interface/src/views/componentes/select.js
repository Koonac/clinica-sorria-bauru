/**
 * Componente de select do Vekta — envolve o Slim Select mantendo o <select>
 * nativo como fonte de verdade.
 *
 * O Slim Select sincroniza `select.value` e dispara um `change` (com bubbles)
 * no próprio elemento original, então quem consome continua lendo `.value` e
 * ouvindo `change` como antes — nada muda para o código chamador.
 *
 * O dropdown é renderizado em `document.body` com posição fixa para não ser
 * cortado por containers com overflow (modais, tabelas). Isso exige limpeza:
 * chame `destruirSelectsEm(no)` ANTES de remover do DOM um trecho que contenha
 * selects, senão o dropdown aberto fica órfão na página.
 */
import SlimSelect from "/vendor/slimselect.es.js";
import { el } from "../.core/util.js";

/** Classe do <select> nativo — usada enquanto o Slim Select não assumiu. */
export const CLASSE_SELECT =
  "w-full rounded-xl border border-linha bg-fundo px-3 py-2 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vekta";

/** Acima disso, o campo de busca aparece sozinho. */
const LIMITE_BUSCA = 8;

/** Espera antes de consultar a API na busca remota, para não disparar por tecla. */
const ESPERA_BUSCA = 220;

/** Instâncias vivas, para poder limpar as órfãs. */
const instancias = new Set();

/** Selects criados mas ainda não anexados ao DOM. */
const pendentes = new Set();
let flushAgendado = false;

function preencher(select, opcoes, valor) {
  select.replaceChildren(
    ...opcoes.map((opcao) => {
      const opt = el("option", { value: String(opcao.value) }, opcao.label);
      if (String(opcao.value) === String(valor ?? "")) opt.selected = true;
      if (opcao.desabilitada) opt.disabled = true;
      return opt;
    }),
  );
}

/**
 * Agrupa as teclas digitadas numa consulta só: todas as chamadas em espera
 * resolvem com o resultado da última, sem promessa pendurada.
 */
function debouncarBusca(fn) {
  let timer = null;
  let aguardando = [];

  return (termo) =>
    new Promise((resolve, reject) => {
      aguardando.push({ resolve, reject });
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const lote = aguardando;
        aguardando = [];
        try {
          const resultado = await fn(termo);
          for (const p of lote) p.resolve(resultado);
        } catch (erro) {
          for (const p of lote) p.reject(erro);
        }
      }, ESPERA_BUSCA);
    });
}

/**
 * Busca no servidor. Reaproveita as opções "vazias" da lista base (ex.: "Sem
 * contato") e mantém o item já escolhido, que de outro modo sumiria da lista
 * quando não casasse com o termo — e levaria a seleção junto.
 */
function montarBuscaRemota(select, config) {
  return debouncarBusca(async (termo) => {
    const encontrados = await config.buscarOpcoes(String(termo || "").trim());
    const selecionado = select.value;
    const rotuloSelecionado = select.selectedOptions[0]?.textContent || "";

    const lista = [];

    if (
      selecionado &&
      !encontrados.some((opcao) => String(opcao.value) === selecionado)
    ) {
      lista.push({ value: selecionado, label: rotuloSelecionado });
    }
    lista.push(...encontrados);

    // A opção vazia ("Sem contato") volta pelo placeholder do Slim Select —
    // reinjetá-la aqui produziria uma entrada duplicada na lista.
    const vistos = new Set();
    return lista
      .filter((opcao) => {
        const chave = String(opcao.value);
        if (chave === "" || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      })
      .map((opcao) => ({
        text: opcao.label,
        value: String(opcao.value),
        selected: String(opcao.value) === selecionado,
      }));
  });
}

function aprimorar(select) {
  if (select.__vektaSelect || !select.isConnected) return;

  const config = select.__vektaConfig || {};
  const remota = typeof config.buscarOpcoes === "function";
  const total = select.options.length;
  // Busca remota sempre mostra o campo: o volume mora no servidor, não na lista.
  const mostrarBusca =
    remota || config.busca === true || (config.busca !== false && total > LIMITE_BUSCA);

  const instancia = new SlimSelect({
    select,
    settings: {
      showSearch: mostrarBusca,
      searchPlaceholder: "Buscar…",
      searchText: "Nada encontrado",
      searchingText: "Buscando…",
      placeholderText: config.placeholder || "Selecione",
      // Fixo e ancorado no body: não é cortado por modal/tabela com overflow.
      contentPosition: "fixed",
      contentLocation: document.body,
      openPosition: "auto",
      allowDeselect: false,
    },
    events: remota ? { search: montarBuscaRemota(select, config) } : {},
  });

  select.__vektaSelect = instancia;
  instancias.add(select);
}

/** Descarta instâncias cujo <select> já saiu do DOM (rede de segurança). */
function limparOrfaos() {
  for (const select of instancias) {
    if (select.isConnected) continue;
    try {
      select.__vektaSelect?.destroy();
    } catch {
      // instância já desmontada — nada a fazer
    }
    delete select.__vektaSelect;
    instancias.delete(select);
  }
}

/**
 * O Slim Select precisa do <select> já no DOM (ele insere o gatilho ao lado).
 * Como as páginas montam a árvore inteira e só depois anexam, adiamos o
 * aprimoramento para o próximo frame — quando o elemento já está conectado.
 */
function agendarFlush() {
  if (flushAgendado) return;
  flushAgendado = true;
  requestAnimationFrame(() => {
    flushAgendado = false;
    for (const select of pendentes) {
      if (!select.isConnected) continue; // ainda não anexado: tenta no próximo
      aprimorar(select);
      pendentes.delete(select);
    }
    if (pendentes.size > 0) agendarFlush();
    limparOrfaos();
  });
}

/**
 * Cria um select estilizado.
 *
 * @param {object} opcoes_
 * @param {Array<{value: string|number, label: string, desabilitada?: boolean}>} opcoes_.opcoes
 * @param {string|number} [opcoes_.valor] valor selecionado
 * @param {(valor: string) => void} [opcoes_.onChange] atalho para o evento `change`
 * @param {boolean|"auto"} [opcoes_.busca] mostra o campo de busca (auto: > 8 opções)
 * @param {(termo: string) => Promise<Array>} [opcoes_.buscarOpcoes] busca no servidor;
 *   liga o campo de busca sozinho e substitui o filtro local. Use quando a lista
 *   é paginada na API — filtrar só o que foi carregado esconderia o resto.
 * @param {string} [opcoes_.placeholder]
 * @param {object} [opcoes_.atributos] atributos extras do <select> (class, aria-label…)
 * @returns {HTMLSelectElement} o <select> nativo, já aprimorado
 */
export function criarSelect({
  opcoes = [],
  valor = "",
  onChange,
  busca = "auto",
  buscarOpcoes,
  placeholder = "",
  atributos = {},
} = {}) {
  const { class: classe, ...resto } = atributos;
  const select = el("select", { class: classe || CLASSE_SELECT, ...resto });

  preencher(select, opcoes, valor);
  select.__vektaBase = opcoes;
  select.__vektaConfig = { busca, buscarOpcoes, placeholder };

  if (onChange) select.addEventListener("change", () => onChange(select.value));

  pendentes.add(select);
  agendarFlush();
  return select;
}

/**
 * Troca as opções de um select já criado, preservando a seleção quando possível.
 * Necessário quando a lista depende de outro campo do formulário.
 */
export function definirOpcoes(select, opcoes, valor) {
  if (!select) return;
  const alvo = valor !== undefined ? valor : select.value;
  select.__vektaBase = opcoes;
  const instancia = select.__vektaSelect;

  if (!instancia) {
    preencher(select, opcoes, alvo);
    return;
  }

  instancia.setData(
    opcoes.map((opcao) => ({
      text: opcao.label,
      value: String(opcao.value),
      selected: String(opcao.value) === String(alvo ?? ""),
      disabled: Boolean(opcao.desabilitada),
    })),
  );
}

/**
 * Há algum dropdown aberto na tela?
 *
 * Use nos handlers de Escape de modais: o primeiro Esc deve fechar só o
 * dropdown, não o modal inteiro por baixo dele. IMPORTANTE: registre o handler
 * do modal na fase de **captura** (`addEventListener('keydown', fn, true)`),
 * senão o Slim Select já fechou o dropdown quando o evento chega ao document e
 * esta função responde `false`.
 */
export function haSelectAberto() {
  return Boolean(document.querySelector(".ss-content.ss-open"));
}

/**
 * Desmonta os selects dentro de `raiz` (inclusive ela mesma).
 * Chame antes de remover um modal do DOM — o dropdown vive no body e não sai junto.
 */
export function destruirSelectsEm(raiz) {
  if (!raiz) return;
  const alvos = raiz.tagName === "SELECT" ? [raiz] : [...raiz.querySelectorAll("select")];
  for (const select of alvos) {
    try {
      select.__vektaSelect?.destroy();
    } catch {
      // já desmontado
    }
    delete select.__vektaSelect;
    instancias.delete(select);
    pendentes.delete(select);
  }
}
