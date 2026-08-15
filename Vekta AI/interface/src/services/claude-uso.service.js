/**
 * Consulta limites de plano (/usage) e janela de contexto (/context)
 * via Claude CLI one-shot (--print + --output-format json).
 *
 * Não consome turno de modelo (num_turns: 0) — só lê estado local/API.
 */
const { spawn } = require('child_process');
const { RAIZ } = require('../config');

const CACHE_MS = 45_000;
const CACHE_CONTEXTO_MS = 3 * 60_000; // contexto muda pouco entre turnos — cache mais longo
const TIMEOUT_MS = 45_000;

let cacheLimites = null;
let cacheContexto = new Map(); // chave: sessaoId || '_'
let prometeLimites = null;
const prometeContexto = new Map();
/** Último contexto válido de qualquer sessão — fallback instantâneo no modal. */
let ultimoContexto = null;

/** Roda `claude -p <prompt>` e devolve o campo `result` do envelope JSON. */
function rodarPrompt(prompt, { retomarSessaoId = null } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--output-format', 'json', prompt];
    if (retomarSessaoId) args.push('--resume', retomarSessaoId);

    const proc = spawn('claude', args, {
      cwd: RAIZ,
      shell: true,
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* já morto */ }
      reject(new Error('Timeout ao consultar o Claude CLI.'));
    }, TIMEOUT_MS);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (erro) => {
      clearTimeout(timer);
      reject(erro);
    });
    proc.on('close', (codigo) => {
      clearTimeout(timer);
      const limpa = stdout.trim();
      // Pode haver avisos no stderr; o JSON útil está no stdout.
      let evento = null;
      // Às vezes o shell mistura linhas — pega o último objeto JSON parseável.
      for (const linha of limpa.split('\n').reverse()) {
        const t = linha.trim();
        if (!t.startsWith('{')) continue;
        try {
          evento = JSON.parse(t);
          break;
        } catch { /* tenta próxima */ }
      }
      if (!evento) {
        // stdout inteiro pode ser um único JSON (sem newline)
        try { evento = JSON.parse(limpa); } catch { /* ignore */ }
      }
      if (!evento || evento.type !== 'result') {
        const msg = stderr.trim() || `Claude CLI saiu com código ${codigo}`;
        reject(new Error(msg.slice(0, 300)));
        return;
      }
      if (evento.is_error || evento.subtype !== 'success') {
        reject(new Error(evento.result || evento.subtype || 'Falha no Claude CLI'));
        return;
      }
      resolve(String(evento.result || ''));
    });
  });
}

function parsePct(s) {
  const n = Number(String(s).replace('%', '').trim());
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

/** Converte "9.2k" / "241" / "967k" em número de tokens. */
function parseTokens(s) {
  const t = String(s || '').trim().toLowerCase().replace(/,/g, '');
  const m = t.match(/^([\d.]+)\s*([km])?$/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === 'k') n *= 1000;
  if (m[2] === 'm') n *= 1_000_000;
  return Math.round(n);
}

/**
 * Extrai sessão 5h + semanal do texto de /usage.
 * Ex.: "Current session: 55% used · resets Jul 24, 3:49pm (...)"
 */
function parsearLimites(texto) {
  const sessaoM = texto.match(
    /Current session:\s*(\d+(?:\.\d+)?)%\s*used\s*[·•.\-–—]\s*resets\s+([^\n]+)/i,
  );
  const semanalM = texto.match(
    /Current week[^:\n]*:\s*(\d+(?:\.\d+)?)%\s*used\s*[·•.\-–—]\s*resets\s+([^\n]+)/i,
  );
  return {
    sessao: sessaoM
      ? { usadoPct: parsePct(sessaoM[1]), reiniciaTexto: sessaoM[2].trim() }
      : null,
    semanal: semanalM
      ? { usadoPct: parsePct(semanalM[1]), reiniciaTexto: semanalM[2].trim() }
      : null,
    bruto: texto,
    atualizadoEm: new Date().toISOString(),
  };
}

const CORES_CATEGORIA = {
  'system prompt': '#e8955a',
  'system tools': '#5b8def',
  'system tools (deferred)': '#7aa2f7',
  'custom agents': '#0e8a76',
  'memory files': '#d4a017',
  skills: '#9b6bff',
  messages: '#e85a5a',
  'autocompact buffer': '#6ec6d9',
  'free space': '#3a3f4b',
  'mcp tools': '#5b8def',
};

const NOME_CATEGORIA_PT = {
  'system prompt': 'Prompt do sistema',
  'system tools': 'Ferramentas do sistema',
  'system tools (deferred)': 'Ferramentas (adiadas)',
  'custom agents': 'Agentes customizados',
  'memory files': 'Arquivos de memória',
  skills: 'Skills',
  messages: 'Mensagens',
  'autocompact buffer': 'Buffer de autocompact',
  'free space': 'Espaço livre',
  'mcp tools': 'Ferramentas MCP',
};

function corDaCategoria(nome) {
  const chave = String(nome || '').trim().toLowerCase();
  return CORES_CATEGORIA[chave] || '#8890a1';
}

function nomeCategoriaPt(nome) {
  const chave = String(nome || '').trim().toLowerCase();
  return NOME_CATEGORIA_PT[chave] || nome;
}

/**
 * Extrai modelo, totais e categorias do markdown de /context.
 */
function parsearContexto(texto) {
  const modeloM = texto.match(/\*\*Model:\*\*\s*([^\n*]+)/i);
  const tokensM = texto.match(
    /\*\*Tokens:\*\*\s*([\d.,]+k?m?)\s*\/\s*([\d.,]+k?m?)\s*\((\d+(?:\.\d+)?)%\)/i,
  );

  const categorias = [];
  const linhas = texto.split('\n');
  let naTabela = false;
  for (const linha of linhas) {
    const limpa = linha.trim();
    if (/^\|\s*Category\s*\|/i.test(limpa)) {
      naTabela = true;
      continue;
    }
    if (naTabela && /^\|[\s-|]+\|$/.test(limpa)) continue; // separador
    if (naTabela && limpa.startsWith('|')) {
      const cols = limpa.split('|').map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        const nome = cols[0];
        const tokens = parseTokens(cols[1]);
        const pct = parsePct(cols[2]);
        if (nome && tokens != null && pct != null) {
          categorias.push({
            nome: nomeCategoriaPt(nome),
            nomeOriginal: nome,
            tokens,
            tokensTexto: cols[1],
            usadoPct: pct,
            cor: corDaCategoria(nome),
          });
        }
      }
      continue;
    }
    if (naTabela && limpa && !limpa.startsWith('|')) naTabela = false;
  }

  return {
    modelo: modeloM ? modeloM[1].trim() : null,
    tokensUsados: tokensM ? parseTokens(tokensM[1]) : null,
    tokensTotal: tokensM ? parseTokens(tokensM[2]) : null,
    tokensTexto: tokensM ? `${tokensM[1]} / ${tokensM[2]}` : null,
    usadoPct: tokensM ? parsePct(tokensM[3]) : null,
    categorias,
    atualizadoEm: new Date().toISOString(),
  };
}

async function obterLimites({ forcar = false } = {}) {
  if (!forcar && cacheLimites && Date.now() - cacheLimites._ts < CACHE_MS) {
    return cacheLimites.dados;
  }
  if (prometeLimites) return prometeLimites;

  prometeLimites = (async () => {
    const texto = await rodarPrompt('/usage');
    const dados = parsearLimites(texto);
    cacheLimites = { dados, _ts: Date.now() };
    return dados;
  })();

  try {
    return await prometeLimites;
  } finally {
    prometeLimites = null;
  }
}

async function obterContexto({ sessaoId = null, forcar = false } = {}) {
  const chave = sessaoId || '_';
  const cached = cacheContexto.get(chave);
  if (!forcar && cached && Date.now() - cached._ts < CACHE_CONTEXTO_MS) {
    return cached.dados;
  }
  // Snapshot recente de qualquer chave: responde na hora e atualiza em background.
  if (!forcar && ultimoContexto && Date.now() - ultimoContexto._ts < CACHE_CONTEXTO_MS) {
    if (!prometeContexto.has(chave)) {
      obterContexto({ sessaoId, forcar: true }).catch(() => {});
    }
    return ultimoContexto.dados;
  }
  if (prometeContexto.has(chave)) return prometeContexto.get(chave);

  const p = (async () => {
    try {
      // Sem --resume: um único spawn do CLI (~1–3s). O breakdown de overhead
      // (prompt, tools, skills, memory) já cobre o modal informativo.
      const texto = await rodarPrompt('/context');
      const dados = parsearContexto(texto);
      const entrada = { dados, _ts: Date.now() };
      cacheContexto.set(chave, entrada);
      ultimoContexto = entrada;
      return dados;
    } catch (erro) {
      if (ultimoContexto) return ultimoContexto.dados;
      throw erro;
    }
  })();

  prometeContexto.set(chave, p);
  try {
    return await p;
  } finally {
    prometeContexto.delete(chave);
  }
}

/** Devolve cache em memória sem disparar o CLI (ou null). */
function peekContexto(sessaoId = null) {
  const chave = sessaoId || '_';
  const cached = cacheContexto.get(chave);
  if (cached) return cached.dados;
  return ultimoContexto?.dados || null;
}

/** Atualiza cache de limites a partir de um rate_limit_event do stream. */
function aplicarRateLimitEvent(info) {
  if (!info || typeof info !== 'object') return null;
  const tipo = String(info.rateLimitType || info.rate_limit_type || '');
  const util = info.utilization;
  if (typeof util !== 'number' || !Number.isFinite(util)) return null;

  const usadoPct = Math.round(Math.max(0, Math.min(1, util)) * 100);
  let reiniciaTexto = null;
  const resetsAt = info.resetsAt || info.resets_at;
  if (typeof resetsAt === 'number' && resetsAt > 0) {
    reiniciaTexto = new Date(resetsAt * 1000).toLocaleString('pt-BR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const base = cacheLimites?.dados || {
    sessao: null,
    semanal: null,
    bruto: '',
    atualizadoEm: new Date().toISOString(),
  };
  const dados = { ...base, atualizadoEm: new Date().toISOString() };

  if (tipo === 'five_hour' || tipo.includes('five_hour') || tipo.includes('5h')) {
    dados.sessao = { usadoPct, reiniciaTexto: reiniciaTexto || dados.sessao?.reiniciaTexto || '' };
  } else if (tipo.includes('seven_day') || tipo.includes('7d') || tipo.includes('week')) {
    dados.semanal = { usadoPct, reiniciaTexto: reiniciaTexto || dados.semanal?.reiniciaTexto || '' };
  } else {
    return null;
  }

  cacheLimites = { dados, _ts: Date.now() };
  return dados;
}

module.exports = {
  obterLimites,
  obterContexto,
  peekContexto,
  aplicarRateLimitEvent,
  parsearLimites,
  parsearContexto,
};
