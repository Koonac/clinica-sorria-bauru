/**
 * Watcher do sistema de arquivos → eventos de Socket.io.
 *
 * Observa as pastas onde o Vekta produz coisas e avisa o front em tempo real,
 * separando duas naturezas de mudança:
 *
 *   - DADOS (.dna, marketing/, saidas/, materiais/) → 'sistema:dados'
 *     O front re-lê e atualiza dashboard/DNA/galeria ao vivo.
 *   - PÁGINAS (src/views/paginas/) → 'sistema:paginas'
 *     Uma tela nova criada pelo Vekta se registra na navegação sem refresh.
 *
 * É o que torna a interface reativa ao disco em vez de depender só do fim de um
 * turno de chat para atualizar.
 */
const path = require('path');
const chokidar = require('chokidar');
const { RAIZ, VIEWS_DIR } = require('../config');

const IGNORAR = /(^|[\\/])(node_modules|\.git|\.venv|__pycache__|dist|build|dist-desktop)([\\/]|$)/;

/** Agrupa uma rajada de eventos (uma entrega gera vários writes) num único emit. */
function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/**
 * Inicia o watcher e liga os eventos ao `io`. Retorna o watcher (o chamador
 * fecha no desligamento). Pastas ainda inexistentes (ex.: .dna antes do /instalar)
 * são toleradas — o chokidar passa a emitir quando elas surgem.
 */
function iniciar(io) {
  const pastasDados = ['.dna', 'marketing', 'saidas', 'materiais', 'financeiro', 'rh'].map((p) => path.join(RAIZ, p));
  // tarefas.md na raiz também muda o workspace
  const arquivosRaiz = ['tarefas.md'].map((p) => path.join(RAIZ, p));
  const pastaPaginas = path.resolve(VIEWS_DIR, 'paginas');

  const avisarDados = debounce(() => io.emit('sistema:dados'), 250);
  const avisarPaginas = debounce(() => io.emit('sistema:paginas'), 250);

  const watcher = chokidar.watch([...pastasDados, ...arquivosRaiz, pastaPaginas], {
    ignored: (alvo) => IGNORAR.test(alvo),
    ignoreInitial: true, // não dispara para o que já existe no boot
    persistent: true,
    // Espera o arquivo parar de crescer antes de emitir — evita ler pela metade
    // um .html/.png que o Vekta ainda está gravando.
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('all', (_evento, alvo) => {
    if (path.resolve(alvo).startsWith(pastaPaginas)) avisarPaginas();
    else avisarDados();
  });
  watcher.on('error', (erro) => console.error('[watcher]', erro));

  return watcher;
}

module.exports = { iniciar };
