/**
 * Leitura e escrita do sistema de arquivos do Vekta Ai:
 * árvore de pastas do workspace, arquivos do .dna e varredura de mídia.
 */
const fs = require('fs');
const path = require('path');

const EXTENSOES_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const EXTENSOES_VIDEO = new Set(['.mp4', '.webm', '.mov']);
const IGNORAR = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', 'build']);

const ARQUIVOS_DNA = [
  { nome: 'sobre.md', titulo: 'Sobre a empresa', descricao: 'História, posicionamento, produto/serviço, preços e diferenciais.' },
  { nome: 'metas.md', titulo: 'Metas', descricao: 'Objetivos e metas de crescimento, incluindo KPIs.' },
  { nome: 'publico_alvo.md', titulo: 'Público-alvo', descricao: 'Perfis, dores e características de quem compra.' },
  { nome: 'identidade_visual.md', titulo: 'Identidade visual', descricao: 'Paleta (hex), tipografia, regras do logo e tom de voz.' },
];

function dentroDe(raiz, alvo) {
  const rel = path.relative(raiz, alvo);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Resolve um caminho relativo vindo do cliente, garantindo que fica dentro da raiz. */
function resolverSeguro(raiz, relativo) {
  const absoluto = path.resolve(raiz, relativo);
  if (!dentroDe(raiz, absoluto)) throw new Error('Caminho fora da raiz do projeto.');
  return absoluto;
}

/** Árvore recursiva de uma pasta (para o dashboard). */
function arvore(raiz, relativo, profundidadeMax = 6) {
  const absoluto = path.join(raiz, relativo);
  if (!fs.existsSync(absoluto)) return null;

  function visitar(dir, profundidade) {
    const nome = path.basename(dir);
    const no = {
      nome,
      caminho: path.relative(raiz, dir).split(path.sep).join('/'),
      tipo: 'pasta',
      filhos: [],
    };
    if (profundidade >= profundidadeMax) return no;

    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return no;
    }
    entradas.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    for (const entrada of entradas) {
      // Pastas com ponto (.core, .dna…) entram na árvore; arquivos ocultos (.env) não.
      if (IGNORAR.has(entrada.name)) continue;
      if (entrada.name.startsWith('.') && !entrada.isDirectory()) continue;
      const caminhoFilho = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        no.filhos.push(visitar(caminhoFilho, profundidade + 1));
      } else {
        let stat = null;
        try { stat = fs.statSync(caminhoFilho); } catch { /* inacessível */ }
        no.filhos.push({
          nome: entrada.name,
          caminho: path.relative(raiz, caminhoFilho).split(path.sep).join('/'),
          tipo: 'arquivo',
          extensao: path.extname(entrada.name).toLowerCase(),
          tamanho: stat ? stat.size : 0,
          modificado: stat ? stat.mtimeMs : 0,
        });
      }
    }
    return no;
  }

  return visitar(absoluto, 0);
}

function contarArquivos(no) {
  if (!no) return 0;
  if (no.tipo === 'arquivo') return 1;
  return (no.filhos || []).reduce((total, filho) => total + contarArquivos(filho), 0);
}

/** Estado dos arquivos do .dna, incluindo conteúdo, para a aba DNA. */
function lerDna(raiz) {
  const pastaDna = path.join(raiz, '.dna');
  const existe = fs.existsSync(pastaDna);

  const arquivos = ARQUIVOS_DNA.map((def) => {
    const caminho = path.join(pastaDna, def.nome);
    let conteudo = null;
    let modificado = 0;
    if (fs.existsSync(caminho)) {
      conteudo = fs.readFileSync(caminho, 'utf8');
      try { modificado = fs.statSync(caminho).mtimeMs; } catch { /* ok */ }
    }
    return { ...def, existe: conteudo !== null, preenchido: !!(conteudo && conteudo.trim()), conteudo, modificado };
  });

  const pastaLogos = path.join(pastaDna, 'logos');
  let logos = [];
  if (fs.existsSync(pastaLogos)) {
    logos = fs.readdirSync(pastaLogos)
      .filter((nome) => EXTENSOES_IMAGEM.has(path.extname(nome).toLowerCase()))
      .map((nome) => ({ nome, caminho: `.dna/logos/${nome}` }));
  }

  return { existe, arquivos, logos };
}

/** Grava um dos arquivos canônicos do .dna (whitelist — nada além deles). */
function salvarDna(raiz, nome, conteudo) {
  if (!ARQUIVOS_DNA.some((def) => def.nome === nome)) {
    throw new Error(`Arquivo não permitido: ${nome}`);
  }
  const pastaDna = path.join(raiz, '.dna');
  fs.mkdirSync(pastaDna, { recursive: true });
  fs.writeFileSync(path.join(pastaDna, nome), conteudo, 'utf8');
}

/** Varre as pastas de saída atrás de imagens e vídeos (para a galeria). */
function listarMidia(raiz) {
  const bases = ['marketing', 'saidas', 'materiais'];
  const itens = [];

  function varrer(dir) {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      if (IGNORAR.has(entrada.name) || entrada.name.startsWith('.')) continue;
      const caminho = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        varrer(caminho);
        continue;
      }
      const ext = path.extname(entrada.name).toLowerCase();
      const ehImagem = EXTENSOES_IMAGEM.has(ext);
      const ehVideo = EXTENSOES_VIDEO.has(ext);
      if (!ehImagem && !ehVideo) continue;
      let stat = null;
      try { stat = fs.statSync(caminho); } catch { /* inacessível */ }
      const relativo = path.relative(raiz, caminho).split(path.sep).join('/');
      itens.push({
        nome: entrada.name,
        caminho: relativo,
        tipo: ehVideo ? 'video' : 'imagem',
        tamanho: stat ? stat.size : 0,
        modificado: stat ? stat.mtimeMs : 0,
      });
    }
  }

  for (const base of bases) {
    const absoluto = path.join(raiz, base);
    if (fs.existsSync(absoluto)) varrer(absoluto);
  }
  itens.sort((a, b) => b.modificado - a.modificado);
  return itens;
}

const EXTENSOES_TEXTO = new Set([
  '.md', '.txt', '.html', '.css', '.js', '.json', '.csv', '.xml', '.svg',
]);

/** Conteúdo de um arquivo de texto do projeto (preview no dashboard). */
function lerArquivoTexto(raiz, relativo) {
  const absoluto = resolverSeguro(raiz, relativo);
  const ext = path.extname(absoluto).toLowerCase();
  if (!EXTENSOES_TEXTO.has(ext)) throw new Error('Tipo de arquivo não é texto editável.');
  const stat = fs.statSync(absoluto);
  if (stat.size > 1024 * 1024) throw new Error('Arquivo grande demais para preview.');
  return fs.readFileSync(absoluto, 'utf8');
}

/** Grava um arquivo de texto do projeto (edição no dashboard). */
function salvarArquivoTexto(raiz, relativo, conteudo) {
  const absoluto = resolverSeguro(raiz, relativo);
  const ext = path.extname(absoluto).toLowerCase();
  if (!EXTENSOES_TEXTO.has(ext)) throw new Error('Tipo de arquivo não é texto editável.');
  if (!fs.existsSync(absoluto) || !fs.statSync(absoluto).isFile()) {
    throw new Error('Arquivo não encontrado.');
  }
  const texto = String(conteudo ?? '');
  if (Buffer.byteLength(texto, 'utf8') > 1024 * 1024) {
    throw new Error('Conteúdo grande demais para salvar.');
  }
  fs.writeFileSync(absoluto, texto, 'utf8');
  return { modificado: fs.statSync(absoluto).mtimeMs };
}

/** Remove um arquivo do projeto (preview/mídia na Visão geral). */
function excluirArquivo(raiz, relativo) {
  const absoluto = resolverSeguro(raiz, relativo);
  if (!fs.existsSync(absoluto) || !fs.statSync(absoluto).isFile()) {
    throw new Error('Arquivo não encontrado.');
  }
  fs.unlinkSync(absoluto);
  return { ok: true, caminho: String(relativo || '').split('\\').join('/') };
}

/**
 * Pastas de infraestrutura — não entram no explorador da Visão geral.
 * Espelha RAIZES_NAO_SERVIVEIS do controller de arquivos.
 */
const RAIZES_NAO_SERVIVEIS = new Set(['.claude', '.scripts', 'interface']);

/** Pastas canônicas (CLAUDE.md) — stubs na árvore quando ainda não existem no disco. */
const PASTAS_CANONICAS = ['.dna', 'materiais', 'marketing', 'financeiro', 'rh', 'saidas'];

/** Subpastas canônicas — aparecem mesmo quando ainda não existem no disco. */
const SUBPASTAS_ESPERADAS = {
  '.dna': ['logos'],
  marketing: [
    'estrategia',
    'redes-sociais',
    'criativos',
    'impressos',
    'identidade-visual',
    'emails',
    'roteiros-video',
    'anuncios-texto',
    'videos',
    'sites',
  ],
  saidas: ['seo', 'analises'],
};

function stubPasta(caminho) {
  return {
    nome: path.basename(caminho),
    caminho,
    tipo: 'pasta',
    filhos: [],
    ausente: true,
  };
}

/** Garante que as subpastas canônicas apareçam na árvore (stubs se ausentes). */
function completarSubpastas(no) {
  const esperadas = SUBPASTAS_ESPERADAS[no.caminho];
  if (!esperadas) return no;

  const filhos = [...(no.filhos || [])];
  const presentes = new Set(filhos.map((f) => f.nome));
  for (const nome of esperadas) {
    if (presentes.has(nome)) continue;
    filhos.push(stubPasta(`${no.caminho}/${nome}`));
  }
  filhos.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'pasta' ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return { ...no, filhos };
}

function ordenarFilhos(filhos) {
  filhos.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'pasta' ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return filhos;
}

/**
 * Árvore da raiz do projeto: tudo que existir no disco (pastas novas inclusas),
 * exceto RAIZES_NAO_SERVIVEIS / IGNORAR; stubs das pastas canônicas ausentes.
 */
function arvoreProjeto(raiz) {
  const filhos = [];
  const vistos = new Set();

  let entradas = [];
  try {
    entradas = fs.readdirSync(raiz, { withFileTypes: true });
  } catch {
    entradas = [];
  }

  for (const entrada of entradas) {
    if (IGNORAR.has(entrada.name)) continue;
    if (RAIZES_NAO_SERVIVEIS.has(entrada.name)) continue;
    if (entrada.name.startsWith('.') && !entrada.isDirectory()) continue;
    // Pastas ocultas que não são canônicas (.git já está em IGNORAR)
    if (entrada.name.startsWith('.') && !PASTAS_CANONICAS.includes(entrada.name)) continue;

    vistos.add(entrada.name);
    const absoluto = path.join(raiz, entrada.name);

    if (entrada.isDirectory()) {
      const no = arvore(raiz, entrada.name);
      if (no) filhos.push(completarSubpastas(no));
      continue;
    }

    let stat = null;
    try { stat = fs.statSync(absoluto); } catch { /* ok */ }
    filhos.push({
      nome: entrada.name,
      caminho: entrada.name,
      tipo: 'arquivo',
      extensao: path.extname(entrada.name).toLowerCase(),
      tamanho: stat ? stat.size : 0,
      modificado: stat ? stat.mtimeMs : 0,
    });
  }

  for (const pasta of PASTAS_CANONICAS) {
    if (vistos.has(pasta)) continue;
    filhos.push(completarSubpastas(stubPasta(pasta)));
  }

  return {
    nome: path.basename(raiz) || 'projeto',
    caminho: '',
    tipo: 'pasta',
    filhos: ordenarFilhos(filhos),
  };
}

module.exports = {
  ARQUIVOS_DNA,
  EXTENSOES_IMAGEM,
  EXTENSOES_VIDEO,
  EXTENSOES_TEXTO,
  RAIZES_NAO_SERVIVEIS,
  PASTAS_CANONICAS,
  resolverSeguro,
  arvore,
  arvoreProjeto,
  contarArquivos,
  lerDna,
  salvarDna,
  listarMidia,
  lerArquivoTexto,
  salvarArquivoTexto,
  excluirArquivo,
};
