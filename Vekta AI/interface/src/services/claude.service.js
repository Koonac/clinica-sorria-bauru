/**
 * Gerencia sessões vivas do Claude CLI usando o protocolo stream-json.
 *
 * Em vez de raspar o prompt interativo ("claude>") — que é frágil —, o CLI é
 * iniciado em modo --print com entrada e saída em JSON por linha (NDJSON):
 * o processo fica vivo, aceita várias mensagens de usuário pelo stdin e
 * sinaliza o fim de cada turno com um evento {"type":"result"}.
 */
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class SessaoClaude extends EventEmitter {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.cwd            Raiz do projeto (onde o Vekta Ai vive)
   * @param {string} [opcoes.permissionMode] default | acceptEdits | plan | bypassPermissions
   * @param {string} [opcoes.retomarSessaoId] Retoma uma sessão anterior do CLI
   */
  constructor(opcoes) {
    super();
    this.cwd = opcoes.cwd;
    this.permissionMode = opcoes.permissionMode || 'bypassPermissions';
    this.sessaoId = opcoes.retomarSessaoId || null;
    this.ocupada = false;
    this.encerrada = false;
    this._cancelada = false;
    this._restoStdout = '';

    const args = [
      '--print',
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--permission-mode', this.permissionMode,
    ];
    if (opcoes.retomarSessaoId) {
      args.push('--resume', opcoes.retomarSessaoId);
    }

    // shell: true resolve o claude.cmd no Windows e herda a autenticação do ambiente
    this.processo = spawn('claude', args, {
      cwd: this.cwd,
      shell: true,
      env: process.env,
      windowsHide: true,
    });

    this.processo.stdout.on('data', (dados) => this._aoReceberStdout(dados));
    this.processo.stderr.on('data', (dados) => {
      const texto = dados.toString().trim();
      if (texto) this.emit('stderr', texto);
    });
    this.processo.on('error', (erro) => {
      this.emit('erro', `Falha ao iniciar o Claude CLI: ${erro.message}`);
    });
    this.processo.on('close', (codigo) => {
      this.encerrada = true;
      this.ocupada = false;
      this.emit('fechada', {
        codigo,
        sessaoId: this.sessaoId,
        cancelada: this._cancelada,
      });
    });
  }

  _aoReceberStdout(dados) {
    this._restoStdout += dados.toString();
    const linhas = this._restoStdout.split('\n');
    this._restoStdout = linhas.pop(); // guarda linha incompleta para o próximo chunk

    for (const linha of linhas) {
      const limpa = linha.trim();
      if (!limpa) continue;
      let evento;
      try {
        evento = JSON.parse(limpa);
      } catch {
        continue; // linha que não é JSON (ruído do shell) é ignorada
      }
      this._processarEvento(evento);
    }
  }

  _processarEvento(evento) {
    // Mensagens de subagente (Agent) trazem parent_tool_use_id; na UI só
    // queremos o orquestrador — senão Bash/Read/Write e o "pensamento" do
    // desenvolvedor aparecem como se fossem a resposta do chat.
    if (evento.parent_tool_use_id || evento.parentToolUseId) return;

    switch (evento.type) {
      case 'system':
        if (evento.subtype === 'init') {
          this.sessaoId = evento.session_id;
          this.emit('sessao', { sessaoId: this.sessaoId, modelo: evento.model });
        }
        break;

      case 'stream_event': {
        // Deltas parciais do texto do assistente (streaming token a token)
        const ev = evento.event;
        if (ev && ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
          this.emit('delta', ev.delta.text);
        }
        break;
      }

      case 'assistant': {
        const blocos = (evento.message && evento.message.content) || [];
        for (const bloco of blocos) {
          if (bloco.type === 'text' && bloco.text) {
            this.emit('texto', bloco.text);
          } else if (bloco.type === 'tool_use') {
            this.emit('ferramenta', {
              nome: bloco.name,
              resumo: resumirInputDeFerramenta(bloco.name, bloco.input),
            });
          }
        }
        break;
      }

      case 'result':
        // Turno cancelado pelo usuário: ignora o result residual do CLI
        if (this._cancelada) break;
        this.ocupada = false;
        this.emit('fim', {
          ok: evento.subtype === 'success',
          erro: evento.subtype !== 'success' ? (evento.result || evento.subtype) : null,
          duracaoMs: evento.duration_ms,
          custoUsd: evento.total_cost_usd,
          sessaoId: evento.session_id || this.sessaoId,
        });
        break;

      case 'rate_limit_event': {
        const info = evento.rate_limit_info || evento.rateLimitInfo || null;
        if (info) this.emit('limite', info);
        break;
      }

      default:
        break; // eventos de tool_result etc. não precisam ir para a UI
    }
  }

  /**
   * Envia uma mensagem do usuário para a sessão viva.
   * @param {string} texto
   * @param {{categoria: 'imagem'|'pdf'|'texto', mediaType: string, sourceType: 'base64'|'text', data: string, nome?: string}[]} [anexos]
   *   Imagens (base64), PDFs (base64) ou .txt (texto puro), sem o prefixo data:URL.
   */
  enviar(texto, anexos = []) {
    if (this.encerrada) throw new Error('A sessão foi encerrada.');
    if (this.ocupada) throw new Error('O Vekta Ai ainda está respondendo a mensagem anterior.');
    this.ocupada = true;
    const conteudo = anexos.map((a) => {
      if (a.categoria === 'imagem') {
        return { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } };
      }
      // pdf ou texto: ambos são blocos "document" — só muda o source.type (base64 x text)
      const bloco = { type: 'document', source: { type: a.sourceType, media_type: a.mediaType, data: a.data } };
      if (a.nome) bloco.title = a.nome;
      return bloco;
    });
    if (texto) conteudo.push({ type: 'text', text: texto });
    const mensagem = {
      type: 'user',
      message: { role: 'user', content: conteudo },
    };
    this.processo.stdin.write(JSON.stringify(mensagem) + '\n');
  }

  /**
   * Interrompe o turno atual (mata o processo). O session_id é preservado
   * pelo GerenciadorDeSessoes para a próxima mensagem poder retomar (--resume).
   */
  cancelar() {
    if (this.encerrada || !this.ocupada) return false;
    this._cancelada = true;
    this.ocupada = false;
    this.emit('cancelada', { sessaoId: this.sessaoId });
    this._matarProcesso({ imediato: true });
    return true;
  }

  encerrar() {
    if (this.encerrada) return;
    this._matarProcesso({ imediato: false });
  }

  /** Encerra o stdin e mata o processo Claude (no Windows usa taskkill /T). */
  _matarProcesso({ imediato = false } = {}) {
    this.encerrada = true;
    try { this.processo.stdin.end(); } catch { /* já fechado */ }
    const proc = this.processo;
    const matar = () => {
      try {
        if (process.platform === 'win32' && proc.pid) {
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } else {
          proc.kill(imediato ? 'SIGKILL' : 'SIGTERM');
        }
      } catch { /* já morto */ }
    };
    if (imediato) matar();
    else setTimeout(matar, 3000);
  }
}

/** Resumo curto e legível do input de uma ferramenta, para exibir como chip no chat. */
function resumirInputDeFerramenta(nome, input) {
  if (!input || typeof input !== 'object') return '';
  const candidatos = [
    input.skill, input.description, input.file_path, input.path,
    input.pattern, input.command, input.url, input.prompt, input.query,
  ];
  const valor = candidatos.find((v) => typeof v === 'string' && v.trim());
  if (!valor) return '';
  return valor.length > 80 ? valor.slice(0, 77) + '…' : valor;
}

/**
 * Guarda uma sessão ativa por chave (a interface local usa uma sessão "principal",
 * mas o formato já suporta múltiplos usuários, como no exemplo original).
 */
class GerenciadorDeSessoes {
  constructor(opcoesPadrao) {
    this.opcoesPadrao = opcoesPadrao;
    this.sessoes = new Map();
    this.ultimaSessaoIdPorChave = new Map(); // permite --resume após queda do processo
  }

  obter(chave) {
    return this.sessoes.get(chave) || null;
  }

  /** Retorna a sessão viva da chave, criando (ou retomando) se necessário. */
  obterOuCriar(chave, { retomar = true } = {}) {
    const existente = this.sessoes.get(chave);
    if (existente && !existente.encerrada) return existente;

    const retomarSessaoId = retomar ? this.ultimaSessaoIdPorChave.get(chave) : null;
    const sessao = new SessaoClaude({ ...this.opcoesPadrao, retomarSessaoId });

    sessao.on('sessao', ({ sessaoId }) => this.ultimaSessaoIdPorChave.set(chave, sessaoId));
    sessao.on('fechada', () => {
      if (this.sessoes.get(chave) === sessao) this.sessoes.delete(chave);
    });

    this.sessoes.set(chave, sessao);
    return sessao;
  }

  /** Encerra a sessão atual e esquece o histórico (próxima conversa começa do zero). */
  reiniciar(chave) {
    const sessao = this.sessoes.get(chave);
    if (sessao) sessao.encerrar();
    this.sessoes.delete(chave);
    this.ultimaSessaoIdPorChave.delete(chave);
  }

  /**
   * Cancela o turno em andamento, mantendo o session_id para --resume.
   * @returns {boolean} true se havia um turno ativo para cancelar
   */
  cancelar(chave) {
    const sessao = this.sessoes.get(chave);
    if (!sessao || !sessao.ocupada) return false;
    if (sessao.sessaoId) this.ultimaSessaoIdPorChave.set(chave, sessao.sessaoId);
    return sessao.cancelar();
  }

  /** Esquece o id de uma sessão (ex.: após excluir o transcript do disco). */
  esquecerSessao(chave, sessaoId) {
    const id = String(sessaoId || '').trim();
    if (!id) return;
    if (this.ultimaSessaoIdPorChave.get(chave) === id) {
      this.ultimaSessaoIdPorChave.delete(chave);
    }
    const atual = this.sessoes.get(chave);
    if (atual && atual.sessaoId === id) {
      atual.encerrar();
      this.sessoes.delete(chave);
    }
  }

  /**
   * Troca a conversa ativa por uma sessão existente do Claude CLI (--resume).
   * @returns {SessaoClaude}
   */
  abrir(chave, sessaoId) {
    const id = String(sessaoId || '').trim();
    if (!id) throw new Error('ID de sessão inválido.');

    const atual = this.sessoes.get(chave);
    if (atual) atual.encerrar();
    this.sessoes.delete(chave);

    this.ultimaSessaoIdPorChave.set(chave, id);
    const sessao = new SessaoClaude({ ...this.opcoesPadrao, retomarSessaoId: id });

    sessao.on('sessao', ({ sessaoId: novoId }) => this.ultimaSessaoIdPorChave.set(chave, novoId));
    sessao.on('fechada', () => {
      if (this.sessoes.get(chave) === sessao) this.sessoes.delete(chave);
    });

    this.sessoes.set(chave, sessao);
    return sessao;
  }

  encerrarTodas() {
    for (const sessao of this.sessoes.values()) sessao.encerrar();
    this.sessoes.clear();
  }
}

module.exports = { SessaoClaude, GerenciadorDeSessoes };
