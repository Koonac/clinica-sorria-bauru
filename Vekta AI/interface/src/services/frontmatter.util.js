/**
 * Parser mínimo do frontmatter YAML usado em agents/skills: pares "chave: valor"
 * de uma linha só, escalares multilinha (`>`, `>-`, `|`, `|-`) e listas simples
 * ("chave:" seguida de linhas "  - item").
 * Compartilhado entre agentes.service.js e skills.service.js.
 */
function parseFrontmatter(conteudo) {
  const bloco = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(conteudo);
  if (!bloco) return { meta: {}, corpo: conteudo.trim() };

  const meta = {};
  let chaveAtual = null;
  /** @type {'folded' | 'literal' | null} */
  let modoBloco = null;
  const linhasBloco = [];

  function finalizarBloco() {
    if (!chaveAtual || !modoBloco) return;
    const bruto = linhasBloco.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
    if (modoBloco === 'folded') {
      // YAML `>`: quebras simples viram espaço; linhas em branco separam parágrafos.
      meta[chaveAtual] = bruto
        .split(/\n{2,}/)
        .map((paragrafo) => paragrafo.replace(/\n/g, ' ').replace(/ +/g, ' ').trim())
        .filter(Boolean)
        .join('\n\n');
    } else {
      meta[chaveAtual] = bruto;
    }
    modoBloco = null;
    linhasBloco.length = 0;
  }

  function indentacao(linha) {
    const m = /^( *)/.exec(linha);
    return m ? m[1].length : 0;
  }

  let indentBloco = null;

  for (const linha of bloco[1].split(/\r?\n/)) {
    if (modoBloco) {
      if (linha === '' || indentacao(linha) > 0) {
        if (linha !== '' && indentBloco == null) indentBloco = indentacao(linha);
        const cortar = indentBloco != null ? indentBloco : 2;
        linhasBloco.push(linha.length >= cortar ? linha.slice(cortar) : linha.trimStart());
        continue;
      }
      finalizarBloco();
      indentBloco = null;
    }

    const itemDeLista = /^\s+-\s+(.*)$/.exec(linha);
    if (itemDeLista && chaveAtual) {
      if (!Array.isArray(meta[chaveAtual])) meta[chaveAtual] = [];
      meta[chaveAtual].push(itemDeLista[1].trim());
      continue;
    }

    const par = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(linha);
    if (par) {
      chaveAtual = par[1];
      const valor = par[2].trim();
      if (valor === '>' || valor === '>-' || valor === '>+') {
        modoBloco = 'folded';
        linhasBloco.length = 0;
        indentBloco = null;
      } else if (valor === '|' || valor === '|-' || valor === '|+') {
        modoBloco = 'literal';
        linhasBloco.length = 0;
        indentBloco = null;
      } else {
        meta[chaveAtual] = valor;
      }
    }
  }
  finalizarBloco();

  return { meta, corpo: conteudo.slice(bloco[0].length).trim() };
}

function listaDeString(valor) {
  return typeof valor === 'string' && valor
    ? valor.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
}

module.exports = { parseFrontmatter, listaDeString };
