/**
 * Fábrica dos handlers de proxy para os domínios do backend Laravel.
 * Cada controller de domínio (CRM, financeiro…) declara suas rotas com o `proxy`
 * devolvido aqui, em vez de repetir o mesmo try/catch em cada handler.
 */

/**
 * @param {object} service - service do domínio (precisa expor `encaminhar` e `configurado`).
 * @param {string} tag - prefixo dos logs de erro inesperado (ex.: 'crm').
 */
function criarProxy(service, tag) {
  function responderErro(res, erro) {
    const statusCode = erro.status || 500;
    const corpo = {
      erro: erro.message || 'Falha ao consultar o backend.',
      codigo: erro.codigo || 'erro_interno',
    };
    if (erro.detalhes) corpo.detalhes = erro.detalhes;
    if (!erro.codigo || erro.codigo === 'erro_interno') {
      console.error(`[${tag}]`, erro);
    }
    return res.status(statusCode).json(corpo);
  }

  /** Monta um handler que repassa a chamada ao backend. */
  function proxy(metodo, montarCaminho, statusOk) {
    return async (req, res) => {
      try {
        const dados = await service.encaminhar({
          metodo,
          caminho: montarCaminho(req),
          query: req.query,
          corpo: ['POST', 'PATCH', 'PUT'].includes(metodo) ? req.body || {} : null,
        });
        const codigo = statusOk || (metodo === 'POST' ? 201 : 200);
        return res.status(codigo).json(dados);
      } catch (erro) {
        return responderErro(res, erro);
      }
    };
  }

  /** Handler de `GET /api/<dominio>/status`: diz se o backend está configurado. */
  function status(_req, res) {
    res.json({ configurado: service.configurado() });
  }

  return { proxy, responderErro, status };
}

module.exports = { criarProxy };
