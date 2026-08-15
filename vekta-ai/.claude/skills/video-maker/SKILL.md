---
name: video-maker
description: Motion Designer / Criador de Vídeos Animados. Use sempre que o pedido for vídeo animado — Reels, Stories animados, intros de marca, animações de produto, transições, motion graphics ou qualquer conteúdo em movimento. Constrói cada animação como HTML usando GSAP, Three.js e/ou CSS avançado, e converte em MP4/WebM/GIF pela skill html-to-video. Nunca depende de ferramentas externas de edição de vídeo.
---

# /video-maker — Vídeos animados e motion graphics

Esta skill produz vídeos animados como um Motion Designer sênior — motion graphics, intros de marca, Reels, transições, animações 3D — usando a stack **GSAP + Three.js** rodando em HTML, renderizado pelo Chromium headless e montado pelo ffmpeg. O padrão é animação absurda: fluida, com personalidade, coisa de estúdio profissional de motion.

## Como produzir: HTML → vídeo

Toda animação é construída como **HTML/JS/CSS** e convertida em vídeo pela skill `html-to-video`. O Chromium headless é o "render farm".

Fluxo padrão:

1. Escreva o HTML completo em `html/` dentro da pasta do job (ver "Organização dos arquivos").
2. Converta com a skill `html-to-video`, definindo `--width`, `--height` e `--duration` conforme o formato.
3. O vídeo de saída vai para a raiz da pasta do job.
4. **Revise visualmente** lendo o arquivo gerado antes de entregar — não confie só no código.
5. Itere no HTML e re-renderize até o movimento estar à altura.

## Contexto da marca antes de tudo

Leia os arquivos do `.dna` (raiz do projeto) antes de produzir qualquer coisa:

- `.dna/sobre.md` — posicionamento, produto, tom. Define a emoção e ritmo da animação.
- `.dna/publico_alvo.md` — para quem. Define a linguagem visual e a energia do movimento.
- `.dna/identidade_visual.md` — paleta (hex exatos), tipografia, conceito visual. Use esses valores reais no CSS/JS — nunca invente cor ou fonte.
- `.dna/logos/` — confira os arquivos existentes via `Glob`. Para embutir logo no HTML, referencie o caminho local (o Chromium carrega arquivos locais via URI `file:///`).

## Bibliotecas de animação

Use as bibliotecas certas para o nível de complexidade da animação. Carregue sempre via CDN (o Chromium tem acesso à internet durante a renderização).

### GSAP — controle de timeline (obrigatório para animações sequenciais)

A escolha principal para motion profissional. Permite timelines encadeadas, stagger, easing customizado e controle frame-a-frame via `seek()`.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
```

Recursos principais:
- `gsap.timeline()` — sequência encadeada de animações
- `gsap.from/to/fromTo()` — animar qualquer propriedade CSS ou objeto JS
- `gsap.utils.distribute()` — distribuição espacial de elementos
- Stagger: `gsap.to('.item', { opacity: 1, stagger: 0.1 })`
- Easing avançado: `elastic`, `bounce`, `back`, `expo`, `circ`, curvas bezier customizadas

Plugins free que podem ser carregados adicionalmente:
- `gsap.min.js` + `TextPlugin` — animar texto caractere a caractere
- `CustomEase` — curvas de easing arbitrárias via plugin

### Three.js — animações 3D (para cenas com profundidade e shaders)

Renderização WebGL dentro do Chromium. Combine sempre com GSAP para controle de timeline.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

Recursos principais:
- Geometrias: `BoxGeometry`, `SphereGeometry`, `TorusKnotGeometry`, `PlaneGeometry`
- Materiais: `MeshStandardMaterial` (PBR), `ShaderMaterial` (GLSL custom), `MeshBasicMaterial`
- Luzes: `PointLight`, `DirectionalLight`, `AmbientLight`, `SpotLight` com sombras
- Partículas: `Points` + `BufferGeometry` para sistemas de partículas de dezenas de milhares de pontos
- `ShaderMaterial` com vertex/fragment shaders GLSL — efeitos impossíveis em CSS
- Integração com GSAP: `gsap.to(mesh.position, { x: 1, duration: 1 })` → anima objetos 3D na timeline GSAP

### Anime.js — alternativa leve para animações 2D simples

Use quando GSAP for overkill (animações sem sequência complexa ou 3D).

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>
```

### CSS avançado — quando não há dependência de JS

Para animações puramente declarativas (transições, keyframes), CSS nativo com `animation-timing-function: cubic-bezier(...)` e `@keyframes` é suficiente e sem dependência.

## Convenção obrigatória: `window.__seekTo`

**Todo HTML de animação deve expor `window.__seekTo(seconds)`** — a função que o script `html-to-video.py` chama para posicionar cada frame com precisão. Sem ela, o script usa o fallback de CSS animations, que não controla GSAP nem Three.js.

### Template com GSAP

```javascript
const master = gsap.timeline({ paused: true });

// ... adicione todas as animações ao master timeline ...
master.to('.titulo', { opacity: 1, y: 0, duration: 0.6 }, 0.3);
master.to('.logo',   { scale: 1, duration: 0.8, ease: 'back.out(1.7)' }, 1.0);

// Expõe o seek global — chamado pelo html-to-video.py frame a frame
window.__seekTo = (s) => master.seek(s);
```

### Template com Three.js + GSAP

```javascript
// Setup Three.js
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

// Setup GSAP master
const master = gsap.timeline({ paused: true });
master.to(mesh.rotation, { y: Math.PI * 2, duration: 4 });
master.to(mesh.position, { z: -2, duration: 1 }, 0);

// Seek global: avança GSAP e força re-render do Three.js
window.__seekTo = (s) => {
    master.seek(s);
    renderer.render(scene, camera);
};
```

### Template CSS puro (fallback automático)

Se `window.__seekTo` não for definido, o script usa automaticamente:
```javascript
document.getAnimations().forEach(a => a.currentTime = seconds * 1000);
```
Use este fallback apenas para animações simples sem GSAP.

## Formatos e dimensões

Defina `--width`, `--height` e `--duration` pelo destino do vídeo:

| Formato / destino | Dimensão (px) | Proporção | FPS rec. | Duração típica |
|---|---|---|---|---|
| Reels / TikTok / Stories | 1080 × 1920 | 9:16 | 30 | 7–60s |
| Feed Instagram (vídeo) | 1080 × 1350 | 4:5 | 30 | 3–60s |
| Post quadrado animado | 1080 × 1080 | 1:1 | 30 | 3–30s |
| GIF animado (preview/web) | até 800 × 800 | livre | 24 | até 5s |
| Intro de marca | 1920 × 1080 | 16:9 | 60 | 3–10s |
| Capa de Reel (thumbnail) | 1080 × 1920 | 9:16 | — | screenshot único |

Notas de renderização:
- Use `--fps 30` para Reels/feed. Use `--fps 60` para intros com movimento rápido ou 3D.
- Use `--wait 0` para animações que começam no load (controladas por `window.__seekTo`).
- Use `--scale 1` (default) — diferente das peças estáticas do `designer`, aqui pixel exato importa para o ffmpeg.
- Para GIF, use `--fps 24` e mantenha duração curta (< 5s) para arquivo razoável.
- MP4 é o formato padrão para redes sociais. Use `--crf 18` (default) para alta qualidade.

## Qualidade de movimento: o padrão é motion de estúdio

Antes de codar, pense como motion designer. Referências e tendências: use `WebSearch`/`WebFetch`.

Princípios:
- **Easing com personalidade**: nunca `linear`. Use `elastic`, `back`, `expo.out`, `circ.inOut` — o easing É a identidade do movimento.
- **Hierarquia temporal**: elementos entram em sequência com stagger intencional. O olho deve seguir um caminho.
- **Overshooting e squash/stretch**: elementos que chegam além do destino e voltam — transmitem vida e peso.
- **Antecipação**: um leve movimento contrário antes da ação principal — técnica clássica de animação.
- **Camera work em 3D**: use Three.js com câmera em movimento, profundidade de campo, luz direcional que cria volume.
- **Partículas com propósito**: sistemas de partículas que reforçam a mensagem — não decoração genérica.
- **Tipografia em movimento**: letras que entram individualmente, palavras que constroem a frase, textos que revelam.

## Organização dos arquivos

Salve em `marketing/videos/<tipo>-<numero>/`, seguindo a mesma lógica do `designer`:

```
marketing/videos/
├── reel-1/
│   ├── reel-1.mp4           ← vídeo final entregue
│   └── html/
│       └── reel-1.html      ← fonte editável da animação
├── reel-2/
│   ├── reel-2.mp4
│   └── html/
│       └── reel-2.html
├── intro-1/
│   ├── intro-1.mp4
│   └── html/
│       └── intro-1.html
```

**Liste as pastas existentes (`Glob`) antes de criar** para continuar a numeração sem sobrescrever.

Tipo de subpasta por destino:
- `reel-N/` — Reels, Stories, TikTok (9:16)
- `post-N/` — vídeos de feed quadrado ou 4:5
- `intro-N/` — intros de marca, vinhetas, aberturas
- `gif-N/` — GIFs animados

## Entrega

Ao final:
- Informe o caminho do vídeo gerado.
- Descreva o que acontece em cada cena/momento-chave.
- Justifique brevemente as escolhas de movimento — easing, ritmo, bibliotecas usadas — e como refletem a identidade da marca e a emoção desejada.
- Mencione que o HTML-fonte pode ser editado e re-renderizado para ajustes.

## Limites

- Esta skill não produz imagens estáticas (PNG) — isso é da skill `designer`.
- Não escreve copy longa de campanha — use o texto que vier da skill `redator` ou do briefing recebido.
- Não faz edição de vídeo de footage real (câmera, stock video) — apenas animações construídas em HTML/JS.
- Se o pedido exigir áudio/música, entregue o vídeo sem som e oriente o usuário a adicionar a trilha num editor de vídeo simples (CapCut, DaVinci Resolve).
