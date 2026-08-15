/**
 * Leitura/escrita das skills do Vekta Ai (.claude/skills/), uma subpasta por
 * skill com um SKILL.md, para a página Skills e o chat.
 */
const fs = require("fs");
const path = require("path");
const { parseFrontmatter } = require("./frontmatter.util");

// Skills que não devem aparecer na interface (chat e página de Skills).
// São skills de infraestrutura, usadas internamente por outras skills e não
// acionadas diretamente pelo usuário. Comparação pelo nome da pasta e do frontmatter.
const SKILLS_OCULTAS = new Set([
  "html-to-image",
  "html-to-video",
  "image-to-pdf",
  "interface",
  "",
]);

function dirSkills(raiz) {
  return path.join(raiz, ".claude", "skills");
}

function caminhoSkill(raiz, pasta) {
  return path.join(dirSkills(raiz), pasta, "SKILL.md");
}

/** Resolve pasta da skill pelo nome da pasta ou pelo `name` do frontmatter. */
function resolverPastaSkill(raiz, nome) {
  const dir = dirSkills(raiz);
  if (!fs.existsSync(dir)) throw new Error("Pasta de skills não encontrada.");

  const direto = path.join(dir, nome);
  if (fs.existsSync(path.join(direto, "SKILL.md"))) return nome;

  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entrada.isDirectory() || SKILLS_OCULTAS.has(entrada.name)) continue;
    const arquivo = path.join(dir, entrada.name, "SKILL.md");
    if (!fs.existsSync(arquivo)) continue;
    const { meta } = parseFrontmatter(fs.readFileSync(arquivo, "utf8"));
    if ((meta.name || entrada.name) === nome) return entrada.name;
  }
  throw new Error(`Skill "${nome}" não encontrada.`);
}

function listarSkills(raiz) {
  const dir = dirSkills(raiz);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .filter((entrada) => !SKILLS_OCULTAS.has(entrada.name))
    .map((entrada) => {
      const absoluto = caminhoSkill(raiz, entrada.name);
      if (!fs.existsSync(absoluto)) return null;
      const texto = fs.readFileSync(absoluto, "utf8");
      const { meta, corpo } = parseFrontmatter(texto);
      return {
        nome: meta.name || entrada.name,
        pasta: entrada.name,
        descricao: meta.description || "",
        corpo,
        conteudo: texto,
        caminho: path.relative(raiz, absoluto).split(path.sep).join("/"),
      };
    })
    .filter(Boolean)
    .filter((skill) => !SKILLS_OCULTAS.has(skill.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function obterSkill(raiz, nome) {
  const pasta = resolverPastaSkill(raiz, nome);
  const absoluto = caminhoSkill(raiz, pasta);
  const texto = fs.readFileSync(absoluto, "utf8");
  const { meta, corpo } = parseFrontmatter(texto);
  return {
    nome: meta.name || pasta,
    pasta,
    descricao: meta.description || "",
    corpo,
    conteudo: texto,
    caminho: path.relative(raiz, absoluto).split(path.sep).join("/"),
  };
}

function salvarSkill(raiz, nome, conteudo) {
  const pasta = resolverPastaSkill(raiz, nome);
  const absoluto = caminhoSkill(raiz, pasta);
  fs.writeFileSync(absoluto, String(conteudo ?? ""), "utf8");
  return obterSkill(raiz, pasta);
}

module.exports = { listarSkills, obterSkill, salvarSkill };
