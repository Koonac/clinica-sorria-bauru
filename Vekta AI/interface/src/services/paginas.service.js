/**
 * Descoberta data-driven das páginas da interface.
 *
 * Em vez de uma lista fixa de páginas no front, o servidor varre
 * src/views/paginas/ e monta a lista a partir dos arquivos presentes. Assim,
 * quando o Vekta cria uma tela nova (um par <nome>.html + <nome>.js), ela se
 * registra sozinha na navegação — sem editar roteador nem index.html.
 *
 * Cada página declara seus metadados num comentário no topo do seu .html:
 *
 *   <!--vekta-pagina
 *   { "titulo": "Galeria", "icone": "lucide:images", "ordem": 60 }
 *   -->
 *
 * Campos (todos opcionais, com fallback):
 *   - titulo: rótulo na navegação (default: nome do arquivo capitalizado)
 *   - icone: nome do ícone iconify/lucide (default: "lucide:square")
 *   - ordem: posição na navegação, menor primeiro (default: 999)
 *   - principal: true marca a página que abre primeiro (o Chat, hoje)
 *   - grupo: "config" tira da nav principal e coloca no menu da engrenagem;
 *     "oculto" mantém a página montável via roteador, sem aparecer em nav/config
 *   - descricao: texto de apoio no menu de configuração
 */
const fs = require('fs');
const path = require('path');
const { FEATURES } = require('../config');

const RE_META = /<!--\s*vekta-pagina\s*(\{[\s\S]*?\})\s*-->/;

/** Páginas ligadas a features do .env — se a flag estiver false, a aba não existe. */
const PAGINAS_POR_FEATURE = {
  instagram: ['instagram', 'instagram-fluxos'],
  crm: ['crm', 'campanhas', 'agent-whatsapp', 'whatsapp'],
  financeiro: ['financeiro'],
  site: ['site'],
  trafego: ['trafego'],
  agenda: ['agenda'],
};

function paginaHabilitada(nome) {
  for (const [feature, nomes] of Object.entries(PAGINAS_POR_FEATURE)) {
    if (nomes.includes(nome) && !FEATURES[feature]) return false;
  }
  return true;
}

function capitalizar(nome) {
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** Lê e parseia o bloco de metadados de um .html de página. Nunca lança: metadados
    ausentes ou inválidos caem nos defaults, para uma tela recém-criada não quebrar a nav. */
function lerMeta(caminhoHtml) {
  let bruto = '';
  try {
    bruto = fs.readFileSync(caminhoHtml, 'utf8');
  } catch {
    return {};
  }
  const casa = bruto.match(RE_META);
  if (!casa) return {};
  try {
    return JSON.parse(casa[1]);
  } catch {
    return {}; // JSON malformado no comentário — ignora e usa defaults
  }
}

/**
 * Lista as páginas disponíveis, ordenadas. Só inclui um nome que tenha o PAR
 * completo <nome>.html + <nome>.js — uma página pela metade (ainda sendo criada)
 * não aparece na navegação até estar montável.
 */
function listarPaginas(viewsDir) {
  const dirPaginas = path.join(viewsDir, 'paginas');
  let entradas;
  try {
    entradas = fs.readdirSync(dirPaginas);
  } catch {
    return [];
  }

  const paginas = [];
  for (const arquivo of entradas) {
    if (!arquivo.endsWith('.html')) continue;
    const nome = arquivo.slice(0, -'.html'.length);
    if (!fs.existsSync(path.join(dirPaginas, `${nome}.js`))) continue;
    if (!paginaHabilitada(nome)) continue;

    const meta = lerMeta(path.join(dirPaginas, arquivo));
    paginas.push({
      nome,
      titulo: typeof meta.titulo === 'string' ? meta.titulo : capitalizar(nome),
      icone: typeof meta.icone === 'string' ? meta.icone : 'lucide:square',
      ordem: Number.isFinite(meta.ordem) ? meta.ordem : 999,
      principal: meta.principal === true,
      grupo:
        meta.grupo === 'config' ? 'config' : meta.grupo === 'oculto' ? 'oculto' : 'nav',
      descricao: typeof meta.descricao === 'string' ? meta.descricao : '',
    });
  }

  paginas.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));

  // Páginas ocultas nunca são a principal (só acessíveis via roteador).
  for (const p of paginas) {
    if (p.grupo === 'oculto') p.principal = false;
  }

  // Garante exatamente uma página principal: se nenhuma se declarou, a primeira da nav assume.
  if (paginas.length && !paginas.some((p) => p.principal)) {
    const candidata = paginas.find((p) => p.grupo === 'nav') || paginas[0];
    if (candidata) candidata.principal = true;
  }
  return paginas;
}

module.exports = { listarPaginas };
