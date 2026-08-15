/**
 * API do site embutido na aba Site (preview + rebuild).
 */
const siteService = require('../services/site.service');

function obter(_req, res) {
  res.json(siteService.status());
}

async function build(_req, res) {
  try {
    const resultado = await siteService.build();
    if (!resultado.ok) {
      const status = resultado.erro && !resultado.codigo ? 400 : 500;
      return res.status(status).json(resultado);
    }
    return res.json(resultado);
  } catch (erro) {
    return res.status(500).json({
      ok: false,
      codigo: null,
      stdout: '',
      stderr: '',
      erro: erro.message || String(erro),
    });
  }
}

module.exports = { obter, build };
