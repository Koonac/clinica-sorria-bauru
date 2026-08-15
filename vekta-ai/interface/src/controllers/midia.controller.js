/**
 * Listagem de imagens e vídeos produzidos (galeria).
 */
const { RAIZ } = require('../config');
const fsService = require('../services/fs.service');

function listar(_req, res) {
  res.json({ itens: fsService.listarMidia(RAIZ) });
}

module.exports = { listar };
