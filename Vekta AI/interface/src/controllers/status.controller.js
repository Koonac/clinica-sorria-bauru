/**
 * Estado geral do projeto: totais para o dashboard, árvore de pastas e tarefas.md.
 */
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('../config');
const fsService = require('../services/fs.service');

function status(_req, res) {
  const dna = fsService.lerDna(RAIZ);
  const marketing = fsService.arvore(RAIZ, 'marketing');
  const saidas = fsService.arvore(RAIZ, 'saidas');
  const midia = fsService.listarMidia(RAIZ);
  res.json({
    dnaInstalado: dna.existe && dna.arquivos.some((a) => a.preenchido),
    totais: {
      marketing: fsService.contarArquivos(marketing),
      saidas: fsService.contarArquivos(saidas),
      midia: midia.length,
    },
  });
}

function arvore(_req, res) {
  const projeto = fsService.arvoreProjeto(RAIZ);
  res.json({
    projeto,
    // Compatível com consumidores antigos
    marketing: fsService.arvore(RAIZ, 'marketing'),
    saidas: fsService.arvore(RAIZ, 'saidas'),
  });
}

function tarefas(_req, res) {
  const caminho = path.join(RAIZ, 'tarefas.md');
  const conteudo = fs.existsSync(caminho) ? fs.readFileSync(caminho, 'utf8') : null;
  res.json({ conteudo });
}

module.exports = { status, arvore, tarefas };
