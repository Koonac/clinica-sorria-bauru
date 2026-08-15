# Vekta Ai

**Gerente de Operações de IA** instalado dentro de uma empresa. Recebe pedidos do usuário, decide qual especialista acionar e entrega o resultado — com base no contexto da marca (pasta `.dna`).

Hoje a frente mais madura é **marketing** (estratégia, copy, criativos, sites, SEO, Instagram). As pastas `financeiro/` e `rh/` já existem para frentes futuras.

---

## O que é

O Vekta Ai não “faz tudo sozinho”: ele **coordena especialistas**.

| Tipo | Exemplos | Como é acionado |
| --- | --- | --- |
| **Skills** | designer, redator, planner, video-maker, SEO, Instagram… | Via Claude (skill em `.claude/skills/`) |
| **Agente** | desenvolvedor (sites, landing pages, e-commerces) | Via Agent (`desenvolvedor`) |

Cada entrega vai para pastas do projeto (`marketing/`, `saidas/`, etc.). O contexto da empresa fica em `.dna/` — sem isso, o sistema pede a skill `/instalar` antes de produzir.

### Pasta `.dna` (contexto da empresa)

Fonte canônica do negócio:

- `sobre.md` — quem é a empresa, produto, preços, diferenciais
- `metas.md` — objetivos e KPIs
- `publico_alvo.md` — para quem vende
- `identidade_visual.md` — cores, tipografia, logo, tom de voz
- `logos/` — arquivos de logo aprovados

### Estrutura principal

```
.dna/                 # contexto da empresa
.claude/              # skills, agents e memória do Vekta
interface/            # painel web / app desktop
materiais/            # insumos brutos (fotos, docs)
marketing/            # peças e conteúdo produzidos
financeiro/           # reservado (sem especialista ainda)
rh/                   # reservado (sem especialista ainda)
saidas/               # SEO, análises de redes, entregas avulsas
tarefas.md            # pipeline de tarefas
```

---

## Como funciona

1. Você faz um pedido (ex.: “criar um post”, “montar a landing”, “analisar o Instagram”).
2. O Vekta lê o `.dna` relevante e, se houver, a estratégia em `marketing/estrategia/`.
3. Aciona a skill ou o agente certo (às vezes em sequência — ex.: redator → designer).
4. Salva o resultado nas pastas de output e reporta o caminho.

Na primeira vez (ou se o `.dna` estiver vazio), use a skill **`/instalar`** para coletar o contexto da empresa. Para consolidar aprendizados novos no `.dna`, use **`/atualizar`**.

---

## Pré-requisitos

- [Node.js](https://nodejs.org) e npm
- [Claude Code / Claude CLI](https://claude.ai/code) instalado e autenticado (`claude` no PATH)
- (Opcional, só para a interface web) arquivo `interface/.env` — veja `interface/README.md`

---

## Como rodar localmente

Há três formas. Escolha conforme o uso.

### 1. Terminal — comando `claude`

Na **raiz do projeto**:

```bash
claude
```

Abre o Claude Code no repositório. O Vekta opera via `CLAUDE.md` e as skills em `.claude/skills/`. Ideal para quem já usa o CLI e quer pedir entregas direto no chat do terminal.

### 2. Interface web — `npm run dev`

Painel no navegador (chat, DNA, galeria, explorador de pastas).

```bash
cd interface
npm install
cp .env.example .env
```

Edite `interface/.env` com usuário, senha e um `VEKTA_AI_SESSION_SECRET`. Depois:

```bash
npm run dev
```

Abra [http://localhost:4680](http://localhost:4680) e faça login.

Detalhes de autenticação, produção (`npm start`) e variáveis: [interface/README.md](interface/README.md).

### 3. App desktop — `iniciar-vekta.vbs` (Windows)

Abre o Vekta Ai como aplicativo Electron, **sem** janela preta do console.

1. Vá até a pasta `interface/`
2. Dê duplo clique em **`iniciar-vekta.vbs`**

O script chama `iniciar-vekta.bat` em segundo plano: instala dependências se necessário e sobe `npm run electron`. Na primeira abertura pode demorar (download do Electron / `npm install`).

Se algo falhar de forma invisível, rode `iniciar-vekta.bat` direto (aí o console aparece) ou veja `interface/_erro-inicializacao.log`.

> O atalho `Iniciar.lnk` na raiz (quando existir) aponta para o mesmo `.vbs`.

---

## Skills principais

| Skill | Uso |
| --- | --- |
| `/instalar` | Primeira configuração — cria e preenche o `.dna` |
| `/atualizar` | Grava aprendizados do chat no `.dna` / memória |
| `planner` | Estratégia e campanhas |
| `redator` | Copy (posts, e-mails, roteiros, anúncios) |
| `designer` | Peças visuais (posts, criativos, impressos) |
| `video-maker` | Vídeos animados (Reels, intros…) |
| `desenvolvedor` | Sites e landing pages |
| `seo-specialist` | SEO em site já existente |
| `instagram-analyst` / `instagram-publish` | Métricas e publicação no Instagram |

A lista completa está em `.claude/skills/`.

---

## Documentação relacionada

- [CLAUDE.md](CLAUDE.md) — regras de operação do Vekta Ai (como o agente deve se comportar)
- [interface/README.md](interface/README.md) — stack, auth e scripts da interface
