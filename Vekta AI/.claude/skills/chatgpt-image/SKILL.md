---
name: chatgpt-image
description: Gera uma imagem por IA usando a sessão web logada do ChatGPT, automatizada via Playwright (modo headed; headless é bloqueado pelo Cloudflare), através de .scripts/chatgpt-image.py. Use sempre que o designer (ou o usuário diretamente) precisar de uma imagem gerada por IA. Não decide quando usar imagem de IA versus CSS puro — isso é do designer.
---

# /chatgpt-image — Geração de imagem via ChatGPT (Playwright)

Esta skill gera uma imagem por IA reaproveitando a **sessão web já logada do ChatGPT**, automatizada via Playwright, através de `.scripts/chatgpt-image.py`. É a fonte usada pela skill `designer` quando o usuário escolhe gerar por IA um **fundo/textura/objeto** ou o **criativo inteiro** (ver modos em `.claude/skills/designer/SKILL.md` — "Imagens por IA"). Esta skill só executa o prompt que receber; quem decide o modo e monta o prompt é o `designer`.

**Rode sempre em modo headed** (o default do script) — o modo headless é bloqueado pelo Cloudflare da chatgpt.com (ver "Limites"). Num servidor sem monitor, use Xvfb (seção "Rodando num servidor sem monitor"), não a flag `--headless`.

## Pré-requisitos

- Python 3. O script auto-instala `playwright` e baixa o Chromium na primeira execução, se faltarem.
- **Sessão logada** no perfil persistente `.playwright-profile/` (na raiz do projeto). Se ainda não existir ou tiver expirado, rode o script (modo default, headed) e faça login manual na janela que abrir — depois disso o login fica salvo nesse perfil.
- Nenhum outro processo pode estar usando esse mesmo perfil ao mesmo tempo (ver "Limites").

## Como rodar

A partir da raiz do projeto:

```bash
python .scripts/chatgpt-image.py --prompt "<descrição da imagem>" --output "<caminho/saida.png>"
```

Sem nenhuma flag de modo já abre o Chromium visível — é o comportamento correto e esperado.

Argumentos:
- `--prompt` / `-p` (obrigatório): descrição da imagem a gerar, em linguagem natural — igual ao que se digitaria no chat. **Repetível** (ver "Gerando várias imagens — um chat só" abaixo).
- `--output` / `-o` (obrigatório): caminho do PNG de saída. Pastas faltando são criadas automaticamente. Repetível, na mesma ordem dos `--prompt`.
- `--profile-dir` (opcional, default `.playwright-profile`): pasta do perfil persistente (cookies/login). **Não é portável entre sistemas operacionais** (ver "Limites").
- `--headless` (**não usar contra chatgpt.com** — existe só para depuração/outros domínios): roda headless de verdade; contra chatgpt.com o Cloudflare bloqueia com um desafio e a geração nunca completa.
- `--timeout` (opcional, ms, default `120000`): tempo máximo de espera **por imagem**.

## Gerando várias imagens — um chat só

Quando uma demanda pede **mais de uma imagem** (ex.: os 5-8 slides de um carrossel, ou qualquer peça com múltiplos criativos), **nunca** rode o script uma vez por imagem — cada execução abre e fecha o navegador, e ir para `https://chatgpt.com/` sempre começa um chat novo. Isso gera um chat por imagem, sem contexto entre elas, e é mais lento (reabre o Chromium a cada vez).

Em vez disso, **repita `--prompt`/`--output` numa única chamada** — o script abre o navegador uma vez, manda todos os prompts em sequência **no mesmo chat**, aguarda cada imagem terminar antes de mandar a próxima, e só fecha o navegador no final:

```bash
python .scripts/chatgpt-image.py \
  --prompt "<descrição da imagem 1>" --output "materiais/slide-1.png" \
  --prompt "<descrição da imagem 2>" --output "materiais/slide-2.png" \
  --prompt "<descrição da imagem 3>" --output "materiais/slide-3.png"
```

Regra prática: **uma demanda (uma sessão do Claude trabalhando numa peça) = uma chamada do script = um chat**, com todos os prompts daquela peça na mesma chamada. Só abra um chat novo (nova chamada do script) para uma demanda diferente.

### Rodando num servidor sem monitor (VPS/Docker Linux) sem janela visível

Como `--headless` é bloqueado (ver abaixo), a forma correta de rodar sem exibir nenhuma janela é um **display virtual (Xvfb)** — o Chromium roda em modo não-headless de verdade (passa despercebido pelo Cloudflare), só que sem monitor físico nem remoto por trás:

```bash
sudo apt-get install -y xvfb
python -m playwright install-deps   # garante libs de sistema (fontes, libgbm etc.) que faltam em imagem mínima
xvfb-run -a python .scripts/chatgpt-image.py --prompt "<descrição>" --output "<saida.png>"
```

Isso é diferente de tentar mascarar/forjar o fingerprint do Chromium headless para enganar a detecção do Cloudflare — não implementamos esse caminho aqui.

**Importante:** o Xvfb resolve a exibição, mas **não cria sessão nenhuma sozinho** — o perfil (`--profile-dir`) ainda precisa chegar até esse ambiente já autenticado. Veja "Provisionando um ambiente novo" abaixo.

### Exemplo

```bash
python .scripts/chatgpt-image.py -p "foto realista de uma xícara de café em cima de madeira, luz natural" -o "materiais/fundo-cafe.png"
```

## Como o script funciona (resumo)

1. Abre um **contexto persistente** do Chromium (`launch_persistent_context`, headed por padrão) apontando para `--profile-dir`, reaproveitando os cookies de sessão já salvos ali — sem isso, o ChatGPT abriria deslogado a cada execução.
2. Navega para `https://chatgpt.com/`. Se detectar a página de desafio do Cloudflare ou o botão "Entrar"/"Log in" (sessão não autenticada), para com uma mensagem explicando o que fazer.
3. Digita o `--prompt` na caixa de mensagem e envia (`Enter`).
4. Escuta as respostas de rede da página (`page.on("response")`) e captura os bytes da imagem quando a URL bate com o endpoint de conteúdo do ChatGPT (`/backend-api/estuary/content`) e o `content-type` é imagem — em vez de baixar por uma segunda requisição HTTP fora do navegador (que exigiria repassar cookies/assinatura da URL manualmente).
5. Espera o bloco `<img alt="Imagem gerada: ...">` (ou `"Generated image..."`, se a UI vier em inglês) aparecer no DOM como confirmação de que a geração terminou, e grava os bytes capturados em `--output`.

## Provisionando um ambiente novo (Docker/VPS) do zero

Um `.playwright-profile/` vazio não serve — a sessão precisa ser criada por um login manual, e **isso não pode ser feito às pressas num container/VPS sem GUI própria** (numa VPS a porta de um VNC também não estaria publicamente acessível por padrão, então essa não é uma alternativa viável ali). O caminho é logar em outro lugar e transplantar o perfil já autenticado:

1. **Faça o login numa máquina Linux com tela de verdade e navegador comum (não Playwright)** — no Windows, o jeito mais fácil é usar o **WSL2** (Windows 11 já mostra janelas gráficas de apps Linux nativamente via WSLg, sem precisar de Xvfb/VNC):
   ```bash
   sudo apt update && sudo apt install -y chromium-browser
   mkdir -p ~/chatgpt-profile
   chromium-browser --user-data-dir=$HOME/chatgpt-profile --no-first-run https://chatgpt.com
   ```
   Faça o login completo na janela que abrir (usuário/senha, ou "Continuar com o Google" — ver por quê isso importa em "Limites").
2. **Empacote esse perfil** depois de fechar o navegador:
   ```bash
   cd ~ && tar -czf /tmp/chatgpt-profile.tar.gz chatgpt-profile
   ```
3. **Leve esse `.tar.gz` até o ambiente de destino** (Docker/VPS) e extraia **substituindo** o `--profile-dir` de lá (pare qualquer processo que já esteja com esse perfil aberto antes, senão a extração esbarra em "arquivo ocupado"):
   ```bash
   tar xzf chatgpt-profile.tar.gz
   rm -rf .playwright-profile
   mv chatgpt-profile .playwright-profile
   ```
4. Rode o script normalmente no destino (headed + Xvfb se não houver monitor).

Isso só funciona **dentro da mesma família de SO** (Linux → Linux) — ver "Limites" sobre por que Windows → Linux (ou vice-versa) não funciona.

Mesmo com tudo certo, **o OpenAI pode ainda desconfiar** de uma sessão usada de repente num IP de datacenter diferente de onde o login foi feito, e pedir reverificação — não há garantia total, só testando no ambiente real.

## Convenção de output

Esta skill não decide sozinha onde salvar — depende de quem a aciona:

- Quando usada **pelo `designer`**, o PNG vai para `materiais/` (insumos brutos), com nome descritivo — seja fundo/textura/objeto (ex. `materiais/fundo-cafe.png`) ou criativo inteiro (ex. `materiais/criativo-promo-verao.png`), para depois ser embutido no HTML da peça (no modo criativo inteiro, só com overlay da logo).
- Quando usada de forma **avulsa** (pedido direto do usuário, sem destino a uma peça específica), salve em `saidas/` com nome descritivo.

## Limites

- **Headless não funciona aqui — confirmado, não é hipótese.** Com `--headless`, o Cloudflare da chatgpt.com serve uma página de desafio ("Um momento…"/"Just a moment…", Cloudflare Turnstile) em vez do app, mesmo com sessão/cookies válidos — a caixa de mensagem nunca aparece e o script falha por timeout. O default (sem flag) já é headed de verdade — em servidor sem monitor, use Xvfb (seção acima), não a flag `--headless`.
- **Perfis não são portáveis entre sistemas operacionais diferentes.** O Chromium criptografa o valor dos cookies usando o cofre de credenciais do SO onde roda (DPAPI no Windows; keyring/fallback no Linux). Um perfil logado no Windows não abre sessão nenhuma num Chromium Linux (e vice-versa) — os bytes até copiam, mas o valor descriptografa como lixo. Um perfil só é reaproveitável dentro da **mesma família de SO** de onde foi criado (ver "Provisionando um ambiente novo").
- **Login via Google (OAuth) é bloqueado quando o navegador é automatizado.** O Google detecta sinais de automação (Playwright/Selenium/CDP) especificamente durante o handshake de login e recusa ("This browser or app may not be secure"). Isso não é algo a contornar mascarando fingerprint — é um controle de segurança deliberado do Google. Soluções legítimas: (a) login por e-mail/senha na conta, se disponível; ou (b) fazer o login inicial com um navegador genuíno, não controlado por Playwright (ver "Provisionando um ambiente novo") — uma vez que a sessão já existe, ler o perfil depois via Playwright funciona normalmente, pois o Google só verifica automação no momento do handshake, não em sessões já estabelecidas.
- **Depende de sessão web pessoal.** Automatizar a interface do ChatGPT foge do uso pretendido dos Termos de Serviço para uso programático/desatendido — adequado para geração pontual/supervisionada, não para um pipeline de produção rodando sem acompanhamento num servidor.
- **Perfil persistente é exclusivo de um processo por vez.** Se o servidor MCP do Playwright (usado interativamente) estiver com uma aba aberta apontando para o mesmo `--profile-dir`, o script vai falhar ao tentar abrir o contexto (ou, no Windows, um `rm`/`mv` nessa pasta esbarra em "arquivo ocupado" enquanto o Chrome do MCP estiver de pé). Feche a sessão interativa antes (ou aponte `--profile-dir` para um perfil separado, sabendo que aí precisa logar de novo nele).
- **Sessão pode expirar, ser invalidada ou resetada sem aviso** (troca de IP/servidor, logout remoto, verificação de segurança do provedor, ou até uma atualização do `npx @playwright/mcp@latest` migrando o perfil para um Chromium mais novo). Quando isso acontecer, o script para com uma mensagem pedindo login manual — não tenta contornar bloqueio/CAPTCHA.
- **Não decide quando usar imagem de IA.** A escolha entre CSS puro ou imagem gerada por IA é do especialista que aciona esta skill (hoje, o `designer`) — aqui só se documenta e executa a geração em si.
