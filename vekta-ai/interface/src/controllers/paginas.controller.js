/**
 * Lista as páginas da interface para a navegação data-driven do front.
 */
const { VIEWS_DIR } = require('../config');
const paginasService = require('../services/paginas.service');

function listar(_req, res) {
  res.json({ paginas: paginasService.listarPaginas(VIEWS_DIR) });
}

module.exports = { listar };
