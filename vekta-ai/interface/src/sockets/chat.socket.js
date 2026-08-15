/**
 * Chat com o Vekta Ai via Socket.io: liga cada conexão à sessão viva do
 * Claude CLI (gerenciada pelo claude.service) e faz o broadcast dos eventos.
 *
 * Canais:
 *   - principal — chat geral
 *   - galeria   — chat da Galeria (peças visuais; também injeta /designer)
 *   - site      — chat da aba Site (alterações no site; contexto do path)
 *   - trafego   — chat da aba Tráfego (análise Meta/Google Ads → MD)
 *
 * O envelope de skills (/interface, e /designer na galeria) entra só na
 * primeira mensagem de cada conversa — nas seguintes o pedido vai puro.
 */
const { RAIZ, SITE } = require('../config');
const sessoesService = require('../services/sessoes.service');
const claudeUso = require('../services/claude-uso.service');
const anexosService = require('../services/anexos.service');

const CANAIS = new Set(['principal', 'galeria', 'site', 'trafego']);
const sessoesConectadas = new WeakSet();

const TIPOS_IMAGEM_ACEITOS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const CATEGORIAS_VALIDAS = new Set(['imagem', 'pdf', 'texto']);
const MAX_ANEXOS = 5;
const TAMANHO_MAX_BASE64 = 14 * 1024 * 1024; // ~10 MB decodificados (imagem ou PDF)
const TAMANHO_MAX_TEXTO = 2 * 1024 * 1024;   // 2 MB de texto puro

const SKILL_INTERFACE = 'interface';

/** Skill de especialista adicional por canal (sempre sob o envelope /interface). */
const SKILL_EXTRA_POR_CANAL = { galeria: 'designer' };

/** Canais que já receberam o envelope nesta conversa (não reinjeta). */
const envelopeAplicado = new Set();

function normalizarCanal(canal) {
  const c = String(canal || 'principal').trim().toLowerCase();
  return CANAIS.has(c) ? c : 'principal';
}

/** Bloco de contexto injetado na 1ª mensagem do canal site (não é slash-command). */
function contextoCanalSite() {
  const preview = SITE.relativo || '(não configurado)';
  const codigo = SITE.codigoRelativo || preview;
  const eDist = SITE.relativo && SITE.relativo.split('/').pop()?.toLowerCase() === 'dist';
  const linhas = [
    '[Contexto da aba Site]',
    `- Pasta de preview (o que o iframe exibe): ${preview}`,
    `- Pasta de código: ${codigo}`,
    '- Pedidos deste canal são sobre o site embutido: delegue ao agente `desenvolvedor`.',
  ];
  if (eDist) {
    linhas.push(
      '- O preview é a pasta `dist`: edite o código-fonte (não o dist) e rode `npm run build` no diretório de código antes de concluir.',
    );
  }
  return linhas.join('\n');
}

/** Bloco de contexto injetado na 1ª mensagem do canal tráfego. */
function contextoCanalTrafego() {
  return [
    '[Contexto da aba Tráfego]',
    '- Pedidos deste canal são sobre análise de campanhas pagas (Meta Ads / Google Ads).',
    '- Nunca invente métricas: use só os números que o usuário (ou o botão Gerar análise) enviou.',
    '- Ao gerar análise, grave um Markdown em `saidas/analises/meta-ads/<conta>/analise-AAAA-MM-DD.md` (ou pasta google-ads quando for o caso).',
    '- Ao final, emita o bloco `vekta-arquivo` com o caminho do MD gerado.',
    '- Não crie nem edite anúncios nesta etapa — só analise e recomende.',
  ].join('\n');
}

/**
 * Monta o texto enviado ao CLI.
 *
 * Com `injetarEnvelope`:
 *   /interface
 *   [/extra]          ← ex. /designer na galeria, se incluirSkillExtra
 *   [contexto site]   ← só no canal site
 *   <pedido do usuário>
 *
 * Sem envelope (mensagens seguintes da mesma conversa): só o pedido.
 *
 * `pularSkill` no cliente só omite a skill extra do canal — /interface
 * entra no envelope quando ele for aplicado.
 */
function prepararMensagem(canal, mensagem, temAnexos, {
  incluirSkillExtra = true,
  injetarEnvelope = true,
} = {}) {
  let texto = String(mensagem || '').trim();

  if (!texto && temAnexos) {
    if (canal === 'galeria') {
      texto = 'Analise o(s) anexo(s) e produza ou ajuste a peça visual.';
    } else if (canal === 'site') {
      texto = 'Analise o(s) anexo(s) e aplique o ajuste no site.';
    } else if (canal === 'trafego') {
      texto = 'Analise o(s) anexo(s) no contexto das campanhas de tráfego.';
    } else {
      texto = 'Analise o(s) anexo(s) e responda no contexto da interface.';
    }
  }
  if (!texto) return '';

  if (!injetarEnvelope) return texto;

  // Evita duplicar /interface se o usuário já digitou
  texto = texto.replace(new RegExp(`^\\/${SKILL_INTERFACE}\\b\\s*`, 'i'), '').trim();
  if (!texto && temAnexos) {
    if (canal === 'galeria') {
      texto = 'Analise o(s) anexo(s) e produza ou ajuste a peça visual.';
    } else if (canal === 'site') {
      texto = 'Analise o(s) anexo(s) e aplique o ajuste no site.';
    } else if (canal === 'trafego') {
      texto = 'Analise o(s) anexo(s) no contexto das campanhas de tráfego.';
    } else {
      texto = 'Analise o(s) anexo(s) e responda no contexto da interface.';
    }
  }
  if (!texto) return `/${SKILL_INTERFACE}`;

  const extra = incluirSkillExtra ? SKILL_EXTRA_POR_CANAL[canal] : null;
  if (extra) {
    const reExtra = new RegExp(`^\\/${extra}\\b`, 'i');
    if (!reExtra.test(texto)) {
      texto = `/${extra}\n\n${texto}`;
    }
  }

  if (canal === 'site') {
    texto = `${contextoCanalSite()}\n\n${texto}`;
  } else if (canal === 'trafego') {
    texto = `${contextoCanalTrafego()}\n\n${texto}`;
  }

  return `/${SKILL_INTERFACE}\n\n${texto}`;
}

/** Valida e normaliza a lista de anexos recebida do cliente (nunca confia no payload bruto). */
function normalizarAnexos(anexos) {
  if (!Array.isArray(anexos)) return [];
  const validos = [];
  for (const a of anexos) {
    if (!a || typeof a.mediaType !== 'string' || typeof a.data !== 'string') continue;
    if (!CATEGORIAS_VALIDAS.has(a.categoria)) continue;
    if (a.categoria === 'imagem' && !TIPOS_IMAGEM_ACEITOS.has(a.mediaType)) continue;
    if (a.categoria === 'pdf' && a.mediaType !== 'application/pdf') continue;
    if (a.categoria === 'texto' && a.mediaType !== 'text/plain') continue;

    const sourceType = a.categoria === 'texto' ? 'text' : 'base64';
    if (a.sourceType !== sourceType) continue;
    const limite = a.categoria === 'texto' ? TAMANHO_MAX_TEXTO : TAMANHO_MAX_BASE64;
    if (a.data.length > limite) continue;

    validos.push({
      categoria: a.categoria,
      mediaType: a.mediaType,
      sourceType,
      data: a.data,
      nome: typeof a.nome === 'string' ? a.nome.slice(0, 200) : '',
    });
    if (validos.length >= MAX_ANEXOS) break;
  }
  return validos;
}

/** Liga os eventos de uma sessão do CLI ao broadcast do Socket.io (uma vez por sessão). */
function conectarSessaoAoSocket(io, sessao, canal) {
  if (sessoesConectadas.has(sessao)) return;
  sessoesConectadas.add(sessao);

  sessao.on('sessao', ({ sessaoId, modelo }) => {
    io.emit('chat:evento', { canal, tipo: 'sessao', sessaoId, modelo });
  });
  sessao.on('delta', (texto) => {
    io.emit('chat:evento', { canal, tipo: 'delta', texto });
  });
  sessao.on('texto', (texto) => {
    io.emit('chat:evento', { canal, tipo: 'texto', texto });
  });
  sessao.on('ferramenta', ({ nome, resumo }) => {
    io.emit('chat:evento', { canal, tipo: 'ferramenta', nome, resumo });
  });
  sessao.on('fim', (info) => {
    io.emit('chat:evento', { canal, tipo: 'fim', ...info });
  });
  sessao.on('cancelada', (info) => {
    io.emit('chat:evento', { canal, tipo: 'cancelada', ...info });
  });
  sessao.on('limite', (info) => {
    const limites = claudeUso.aplicarRateLimitEvent(info);
    io.emit('chat:evento', {
      canal,
      tipo: 'limites',
      info,
      limites: limites || undefined,
    });
  });
  sessao.on('erro', (texto) => {
    io.emit('chat:evento', { canal, tipo: 'erro', texto });
  });
  sessao.on('stderr', (texto) => {
    console.error('[claude stderr]', texto);
  });
  sessao.on('fechada', ({ codigo, cancelada }) => {
    // Cancelamento já emitiu 'cancelada' — não alarme a UI como queda inesperada
    if (cancelada) return;
    io.emit('chat:evento', { canal, tipo: 'encerrada', codigo });
  });
}

function emitirEstado(socket, sessoes, canal) {
  const sessao = sessoes.obter(canal);
  socket.emit('chat:estado', {
    canal,
    ocupada: !!(sessao && sessao.ocupada),
    sessaoViva: !!(sessao && !sessao.encerrada),
  });
}

/** Registra os handlers de chat em todas as conexões do Socket.io. */
function registrar(io, sessoes) {
  io.on('connection', (socket) => {
    for (const canal of CANAIS) emitirEstado(socket, sessoes, canal);

    socket.on('chat:enviar', ({ texto, anexos, canal: canalBruto, pularSkill } = {}) => {
      const canal = normalizarCanal(canalBruto);
      const listaAnexos = normalizarAnexos(anexos);
      const mensagemDisplay = String(texto || '').trim();
      // pularSkill só omite a skill EXTRA do canal (/designer) no envelope.
      const incluirSkillExtra = !pularSkill;
      const injetarEnvelope = !envelopeAplicado.has(canal);
      let mensagem = prepararMensagem(canal, mensagemDisplay, listaAnexos.length > 0, {
        incluirSkillExtra,
        injetarEnvelope,
      });
      if (!mensagem && listaAnexos.length === 0) return;

      // Grava imagens/PDF em materiais/anexos/ e informa o path ao Claude (a UI
      // continua vendo só mensagemDisplay — a nota fica só no prompt do CLI).
      const anexosEmDisco = anexosService.salvarAnexos(RAIZ, listaAnexos);
      const notaAnexos = anexosService.notaParaClaude(anexosEmDisco);
      if (notaAnexos) {
        mensagem = mensagem ? `${mensagem}\n\n${notaAnexos}` : notaAnexos;
      }

      let sessao;
      try {
        sessao = sessoes.obterOuCriar(canal);
        conectarSessaoAoSocket(io, sessao, canal);
        sessao.enviar(mensagem, listaAnexos);
      } catch (erro) {
        socket.emit('chat:evento', { canal, tipo: 'erro', texto: erro.message });
        return;
      }
      if (injetarEnvelope) envelopeAplicado.add(canal);
      io.emit('chat:evento', {
        canal,
        tipo: 'usuario',
        texto: mensagemDisplay || (listaAnexos.length ? '(anexo)' : ''),
        anexos: listaAnexos,
      });
      io.emit('chat:evento', { canal, tipo: 'inicio' });
    });

    socket.on('chat:nova-conversa', ({ canal: canalBruto } = {}) => {
      const canal = normalizarCanal(canalBruto);
      envelopeAplicado.delete(canal);
      sessoes.reiniciar(canal);
      io.emit('chat:evento', { canal, tipo: 'reiniciada' });
    });

    socket.on('chat:cancelar', ({ canal: canalBruto } = {}) => {
      const canal = normalizarCanal(canalBruto);
      const ok = sessoes.cancelar(canal);
      if (!ok) {
        // Sem turno ativo: só garante que a UI saia do estado "pensando"
        socket.emit('chat:evento', { canal, tipo: 'cancelada', sessaoId: null });
      }
    });

    socket.on('chat:excluir-sessao', ({ sessaoId, canal: canalBruto } = {}) => {
      const canal = normalizarCanal(canalBruto);
      const id = String(sessaoId || '').trim();
      if (!id) {
        socket.emit('chat:evento', { canal, tipo: 'erro', texto: 'ID de sessão inválido.' });
        return;
      }

      try {
        sessoesService.excluirSessao(RAIZ, id);
        sessoes.esquecerSessao(canal, id);
        envelopeAplicado.delete(canal);
      } catch (erro) {
        socket.emit('chat:evento', { canal, tipo: 'erro', texto: erro.message });
        return;
      }

      io.emit('chat:evento', { canal, tipo: 'excluida', sessaoId: id });
    });

    socket.on('chat:abrir-sessao', ({ sessaoId, canal: canalBruto } = {}) => {
      const canal = normalizarCanal(canalBruto);
      const id = String(sessaoId || '').trim();
      if (!id) {
        socket.emit('chat:evento', { canal, tipo: 'erro', texto: 'ID de sessão inválido.' });
        return;
      }

      let mensagens;
      try {
        mensagens = sessoesService.lerTranscricao(RAIZ, id);
      } catch (erro) {
        socket.emit('chat:evento', { canal, tipo: 'erro', texto: erro.message });
        return;
      }

      try {
        const sessao = sessoes.abrir(canal, id);
        conectarSessaoAoSocket(io, sessao, canal);
        // Sessão já iniciada no transcript — não reinjeta o envelope.
        envelopeAplicado.add(canal);
      } catch (erro) {
        socket.emit('chat:evento', { canal, tipo: 'erro', texto: erro.message });
        return;
      }

      io.emit('chat:evento', { canal, tipo: 'aberta', sessaoId: id, mensagens });
    });
  });
}

module.exports = { registrar };
