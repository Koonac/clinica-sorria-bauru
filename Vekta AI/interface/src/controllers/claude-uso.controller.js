/**
 * Endpoints de limites de plano (/usage) e janela de contexto (/context).
 */
const claudeUso = require('../services/claude-uso.service');

async function limites(req, res) {
  try {
    const forcar = String(req.query.forcar || '') === '1';
    const dados = await claudeUso.obterLimites({ forcar });
    res.json(dados);
  } catch (erro) {
    res.status(502).json({ erro: erro.message || 'Falha ao ler limites de uso.' });
  }
}

async function contexto(req, res) {
  try {
    const forcar = String(req.query.forcar || '') === '1';
    const sessaoId = String(req.query.sessaoId || '').trim() || null;
    if (String(req.query.cache || '') === '1') {
      const dados = claudeUso.peekContexto(sessaoId);
      if (!dados) return res.status(204).end();
      return res.json(dados);
    }
    const dados = await claudeUso.obterContexto({ sessaoId, forcar });
    res.json(dados);
  } catch (erro) {
    // Se o CLI falhar mas ainda houver cache, entrega o cache.
    const sessaoId = String(req.query.sessaoId || '').trim() || null;
    const fallback = claudeUso.peekContexto(sessaoId);
    if (fallback) return res.json(fallback);
    res.status(502).json({ erro: erro.message || 'Falha ao ler janela de contexto.' });
  }
}

module.exports = { limites, contexto };
