/**
 * Leitura dos agents do Vekta Ai (.claude/agents/), um .md por agent, para a página Agents.
 */
const fs = require('fs');
const path = require('path');
const { parseFrontmatter, listaDeString } = require('./frontmatter.util');

function listarAgentes(raiz) {
  const dir = path.join(raiz, '.claude', 'agents');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && entrada.name.endsWith('.md'))
    .map((entrada) => {
      const caminho = path.join(dir, entrada.name);
      const { meta } = parseFrontmatter(fs.readFileSync(caminho, 'utf8'));
      return {
        nome: meta.name || path.basename(entrada.name, '.md'),
        descricao: meta.description || '',
        modelo: meta.model || null,
        cor: meta.color || null,
        ferramentas: listaDeString(meta.tools),
        skills: Array.isArray(meta.skills) ? meta.skills : [],
        caminho: path.relative(raiz, caminho).split(path.sep).join('/'),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

module.exports = { listarAgentes };
