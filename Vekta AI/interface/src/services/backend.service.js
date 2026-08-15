/**
 * Cliente do backend Laravel: repassa chamadas autenticadas por token de serviço.
 * Cada domínio (crm, finance…) monta o próprio service fino em cima deste.
 */
const { BACKEND } = require('../config');

function configurado() {
  return Boolean(BACKEND.url && BACKEND.apiToken && String(BACKEND.apiToken).trim());
}

function erroNaoConfigurado(rotulo) {
  const err = new Error(
    `${rotulo} não configurado. Defina BACKEND_URL e BACKEND_API_TOKEN em interface/.env.`,
  );
  err.codigo = 'nao_configurado';
  err.status = 503;
  return err;
}

/**
 * Encaminha uma requisição para /api/v1/<dominio>/<caminho> no backend.
 * Repassa querystring e corpo JSON; devolve o corpo já parseado.
 * `rotulo` só aparece nas mensagens de erro mostradas ao usuário.
 */
async function encaminhar({
  dominio,
  rotulo = 'Backend',
  metodo = 'GET',
  caminho = '',
  query = {},
  corpo = null,
}) {
  if (!configurado()) throw erroNaoConfigurado(rotulo);

  const url = new URL(
    `${BACKEND.url}/api/v1/${dominio}/${String(caminho).replace(/^\/+/, '')}`,
  );
  for (const [chave, valor] of Object.entries(query || {})) {
    if (valor !== undefined && valor !== null && valor !== '') {
      url.searchParams.set(chave, String(valor));
    }
  }

  const opcoes = {
    method: metodo,
    headers: {
      Authorization: `Bearer ${BACKEND.apiToken}`,
      Accept: 'application/json',
    },
  };
  if (corpo !== null && metodo !== 'GET') {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(url, opcoes);
  } catch (rede) {
    const err = new Error(`${rotulo} inacessível (${BACKEND.url}): ${rede.message}`);
    err.codigo = 'backend_indisponivel';
    err.status = 502;
    throw err;
  }

  const json = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const err = new Error(json.message || json.erro || `Backend retornou ${resposta.status}`);
    err.codigo = resposta.status === 422 ? 'validacao' : 'backend_erro';
    err.status = resposta.status;
    if (json.errors) err.detalhes = json.errors;
    throw err;
  }

  return json;
}

module.exports = { configurado, encaminhar };
