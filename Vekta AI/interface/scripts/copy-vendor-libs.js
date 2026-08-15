/**
 * Copia bibliotecas de frontend do node_modules para public/vendor/, para
 * serem servidas como arquivo estático pelo Express — sem CDN, sem rota
 * dedicada. Roda automaticamente depois de "npm install" (postinstall).
 */
const fs = require('fs');
const path = require('path');

const DESTINO_DIR = path.resolve(__dirname, '..', 'public', 'vendor');

const chartDistDir = path.dirname(require.resolve('chart.js'));
const slimSelectDistDir = path.dirname(require.resolve('slim-select'));

const LIBS = [
  { origem: require.resolve('marked/marked.min.js'), destino: 'marked.min.js' },
  { origem: require.resolve('iconify-icon/dist/iconify-icon.min.js'), destino: 'iconify-icon.min.js' },
  { origem: require.resolve('animejs/lib/anime.min.js'), destino: 'anime.min.js' },
  { origem: path.join(chartDistDir, 'chart.umd.min.js'), destino: 'chart.umd.min.js' },
  // ESM (não global): importado direto por src/views/componentes/select.js.
  { origem: path.join(slimSelectDistDir, 'slimselect.es.js'), destino: 'slimselect.es.js' },
  { origem: path.join(slimSelectDistDir, 'slimselect.css'), destino: 'slimselect.css' },
];

fs.mkdirSync(DESTINO_DIR, { recursive: true });
for (const lib of LIBS) {
  fs.copyFileSync(lib.origem, path.join(DESTINO_DIR, lib.destino));
  console.log(`vendor: ${lib.destino}`);
}
