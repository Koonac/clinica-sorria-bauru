/**
 * Estado e build do site configurado em VEKTA_SITE_DIR.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { SITE } = require('../config');

const URL_PREVIEW = '/site-preview/';

function temScriptBuild(codigoAbsoluto) {
  if (!codigoAbsoluto) return false;
  const pkgPath = path.join(codigoAbsoluto, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return !!(pkg.scripts && typeof pkg.scripts.build === 'string' && pkg.scripts.build.trim());
  } catch {
    return false;
  }
}

/** Snapshot para GET /api/site. */
function status() {
  const existe = !!(SITE.valido && SITE.absoluto && fs.existsSync(SITE.absoluto));
  const temBuild = existe && temScriptBuild(SITE.codigoAbsoluto);
  return {
    configurado: SITE.valido,
    existe,
    caminho: SITE.relativo,
    caminhoCodigo: SITE.codigoRelativo,
    temBuild,
    urlPreview: URL_PREVIEW,
  };
}

/**
 * Roda `npm run build` em SITE.codigoAbsoluto.
 * @returns {Promise<{ ok: boolean, codigo: number|null, stdout: string, stderr: string, erro?: string }>}
 */
function build() {
  const info = status();
  if (!info.configurado || !info.existe) {
    return Promise.resolve({
      ok: false,
      codigo: null,
      stdout: '',
      stderr: '',
      erro: 'Site não configurado ou pasta inexistente.',
    });
  }
  if (!info.temBuild) {
    return Promise.resolve({
      ok: false,
      codigo: null,
      stdout: '',
      stderr: '',
      erro: 'Não há script "build" em package.json neste diretório.',
    });
  }

  return new Promise((resolve) => {
    const filho = spawn('npm', ['run', 'build'], {
      cwd: SITE.codigoAbsoluto,
      shell: true,
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    filho.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    filho.on('error', (err) => {
      resolve({
        ok: false,
        codigo: null,
        stdout,
        stderr,
        erro: err.message || String(err),
      });
    });
    filho.on('close', (codigo) => {
      const ok = codigo === 0;
      resolve({
        ok,
        codigo,
        stdout,
        stderr,
        ...(ok ? {} : { erro: (stderr || stdout || `Build encerrou com código ${codigo}`).trim().slice(-500) }),
      });
    });
  });
}

module.exports = { status, build, URL_PREVIEW };
