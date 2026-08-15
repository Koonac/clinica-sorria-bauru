/**
 * Gera public/vendor/lucide-preload.js com o subconjunto de ícones lucide
 * usados em qualquer .html/.js dentro de public/ e src/views/ (window.IconifyPreload),
 * para o iconify-icon renderizar offline sem baixar o pacote inteiro.
 *
 * Varre as duas árvores inteiras (exceto public/vendor/, que é gerado/terceiros) —
 * dev-friendly: novo ícone em qualquer página entra no preload sozinho,
 * sem lista manual de arquivos para manter.
 *
 * Uso: node scripts/build-lucide-preload.js [--watch]
 */
const fs = require('fs');
const path = require('path');

const INTERFACE_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(INTERFACE_DIR, 'public');
const VIEWS_DIR = path.join(INTERFACE_DIR, 'src', 'views');
const DESTINO = path.join(PUBLIC_DIR, 'vendor', 'lucide-preload.js');
const EXTENSOES_FONTE = new Set(['.html', '.js']);

function listarArquivosFonte(dir) {
  const resultado = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'vendor') continue; // libs de terceiros e saída gerada, não são fonte
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      resultado.push(...listarArquivosFonte(caminho));
    } else if (EXTENSOES_FONTE.has(path.extname(entrada.name))) {
      resultado.push(caminho);
    }
  }
  return resultado;
}

function gerar() {
  const lucide = require('@iconify-json/lucide/icons.json');
  const conteudoFontes = [...listarArquivosFonte(PUBLIC_DIR), ...listarArquivosFonte(VIEWS_DIR)]
    .map((caminho) => fs.readFileSync(caminho, 'utf8'))
    .join('\n');
  const usados = new Set([...conteudoFontes.matchAll(/lucide:([a-z0-9-]+)/g)].map((m) => m[1]));

  const icons = {};
  const aliases = {};
  for (const nome of usados) {
    if (lucide.icons[nome]) {
      icons[nome] = lucide.icons[nome];
    } else if (lucide.aliases && lucide.aliases[nome]) {
      aliases[nome] = lucide.aliases[nome];
      const pai = lucide.aliases[nome].parent;
      if (lucide.icons[pai]) icons[pai] = lucide.icons[pai];
    }
  }
  const colecao = { prefix: lucide.prefix, icons, aliases, width: lucide.width, height: lucide.height };

  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, `window.IconifyPreload = [${JSON.stringify(colecao)}];\n`);
  console.log(`lucide-preload: ${usados.size} ícone(s)`);
}

gerar();

if (process.argv.includes('--watch')) {
  function aoMudar(_evento, nomeArquivo) {
    if (!nomeArquivo) return;
    const partes = nomeArquivo.split(path.sep).join('/').split('/');
    if (partes[0] === 'vendor') return;
    if (!EXTENSOES_FONTE.has(path.extname(nomeArquivo))) return;
    try { gerar(); } catch (erro) { console.error('lucide-preload:', erro.message); }
  }
  fs.watch(PUBLIC_DIR, { recursive: true }, aoMudar);
  fs.watch(VIEWS_DIR, { recursive: true }, aoMudar);
  console.log('lucide-preload: observando alterações...');
}
