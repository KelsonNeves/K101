# Colheita Infinita — Documento Técnico do Jogo

*Versão 0.1 (primeiro documento) · base: Documento Técnico da Plataforma K101 v1.2 · slug: `colheita-infinita` · motor: Three.js 0.160.0 · hospedagem: GitHub Pages (k101.com.br)*

O nome e o slug são provisórios. Depois de publicado o slug não pode mudar (seção 2 do documento da plataforma), então decida antes de trocar o `status` do `game.json` para `published`.

## 1. Visão geral

**Colheita Infinita** é um jogo de fazenda 3D low poly, fácil, satisfatório e com fases infinitas. A grade da plantação fica no centro da tela. Em cada **dia** (30 s no início) o jogador faz três tarefas, só com o mouse (PC) ou com o toque (celular): **semear**, **aguar** e **colher**. A colheita vira dinheiro no fim do dia, e o dinheiro compra habilidades numa **árvore que cresce conforme as escolhas do jogador**. O objetivo é evoluir o máximo possível e ganhar cada vez mais.

Pilares de design:

1. **Cada gesto tem resposta imediata**: anel de raio, partículas, números flutuantes e som a cada ciclo da ferramenta.
2. **Tudo é raio e tempo**: o jogador melhora porque a ferramenta cobre mais células e repete mais rápido.
3. **Dias curtos, evolução visível**: em 30 s dá para fazer um ou dois ciclos completos; cada habilidade comprada muda a sensação do dia seguinte.
4. **Dados separados do código**: plantas, habilidades e balanceamento ficam em arquivos de dados que você edita sem mexer na lógica.

### Glossário

| Termo | Significado |
| --- | --- |
| **Grade** | O campo de plantio no centro da tela (começa 6×6, cresce com habilidades). |
| **Célula** | Um quadrado 1×1 da grade; guarda no máximo uma planta. |
| **Ferramenta** | Semear (uma por tipo de semente), aguar e colher. |
| **Raio** | Alcance da ferramenta, em células, ao redor do cursor. |
| **Ciclo** | O tempo que a ferramenta leva para disparar de novo (ex.: 1 s). Mostrado como anel que enche. |
| **Dia** | Uma rodada (30 s iniciais). |
| **Habilidade / nó** | Uma célula da árvore de habilidades (ícone, custo, efeito). |

## 2. Decisões tomadas e valores iniciais

O pedido deixou alguns pontos em aberto. Estas foram as decisões; todas são ajustáveis nos arquivos indicados.

| Tema | Decisão | Onde ajustar |
| --- | --- | --- |
| Campo a cada dia | A grade começa **vazia** em todo dia. Planta não colhida até o fim do dia é perdida (não rende dinheiro). | `Game.startDay()` |
| Crescimento | A planta só cresce **depois de aguada** (uma rega por planta). 5 estágios, cada um ocupa 25% do tempo de crescimento. | `Crops.js` (`growTime`) |
| Raio | Medido em células a partir do cursor. O centro do círculo é livre (não encaixa na grade). Uma célula é alvo se o **centro dela** está dentro do círculo. | `Data.js` |
| Ciclo | Cada grupo de ferramenta (semear, aguar, colher) tem seu **próprio** tempo de espera. Clicar várias vezes ou segurar respeita o mesmo tempo. O ciclo só é gasto se houver pelo menos um alvo válido no círculo. | `Game.tryFire()` |
| Sementes | Grátis na v1 (`seedCost: 0`); o campo já existe para balancear depois. | `Crops.js` |
| Menu radial | **Não pausa** o relógio do dia (trocar de ferramenta rápido é habilidade). Existe uma flag para câmera lenta. | `Data.js` (`RADIAL_TIME_SCALE`) |
| Anel no toque | Aparece ao tocar e segurar, **40 px acima do dedo** para o dedo não esconder o círculo. Pode ser 0. | `Data.js` (`TOUCH_OFFSET_PX`) |
| Cores | Cores do **mundo 3D** ficam em `Data.js` (`PALETTE`). Cores da **interface** (HUD, menu radial, árvore, popups) vêm só de `/shared/tema.css`. | `Data.js` / `tema.css` |
| Orientação | `landscape`. A câmera se ajusta sozinha também em celular na vertical. | `game.json` |

Valores iniciais (todos em `BASE_STATS`, seção 12):

| Estatística | Início | Limite |
| --- | --- | --- |
| Duração do dia | 30 s | máx. 90 s |
| Raio de semear / aguar / colher | 1,5 células | máx. 4 |
| Ciclo de semear / aguar / colher | 1,0 s | mín. 0,25 s |
| Grade | 6×6 | máx. 12×12 |
| Velocidade de crescimento | ×1 | máx. ×3 |
| Multiplicador de valor | ×1 | sem limite |
| Planta inicial | Trigo (6 s para amadurecer, vale 2) |  |

## 3. Integração com a plataforma K101

Tudo aqui segue o manifesto (seção 9 do documento da plataforma). O jogo é um site estático independente dentro de `jogos/colheita-infinita/`.

### 3.1 Link e ficha do jogo

Endereço: `https://k101.com.br/jogos/colheita-infinita/` (com barra no final; caminhos internos sempre relativos).

Campos do `game.json` (todos obrigatórios, exceto `screenshots`):

| Campo | Valor |
| --- | --- |
| `id` | `colheita-infinita` (igual ao nome da pasta) |
| `title` | Colheita Infinita |
| `tagline` | Plante, regue e colha em dias de 30 segundos. Evolua sem parar. |
| `description` | Texto do popup do catálogo; aceita `\n` para quebra de linha. |
| `cover` / `icon` | `cover.webp` (640×360) / `icon.webp` (256×256) |
| `version` | `0.1.0` |
| `status` | `draft` até os assets e as `prints/` estarem prontos; depois `published` |
| `tags` | fazenda, relaxante, low poly, 3D |
| `platforms` | desktop, mobile |
| `orientation` | landscape |
| `approxDownloadMB` | 4 (reavaliar no fim; three.js vem de CDN) |
| `sdk` | 1 |
| `ads` | `interstitial: true`, `rewarded: false`, `banner: [loading, end-screen]` |
| `menuSafeTop` | 52 |

Depois de qualquer mudança no `game.json` ou em `prints/`: `node tools/make-catalog.mjs`.

### 3.2 Modelo do `index.html`

Segue o modelo da seção 9.2 do manifesto. Pontos importantes: tela de carregamento no HTML estático (aparece antes de qualquer JavaScript pesado), `importmap` **antes** do SDK, e o SDK como módulo.

```html
<!DOCTYPE html>
<html lang='pt-BR'>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'>
  <title>COLHEITA INFINITA — K101</title>
  <meta name='k101-game' content='colheita-infinita'>
  <meta name='k101-safe-top' content='52'>

  <link rel='canonical' href='https://k101.com.br/jogos/colheita-infinita/'>
  <meta property='og:type' content='website'>
  <meta property='og:title' content='Colheita Infinita'>
  <meta property='og:description' content='Plante, regue e colha em dias de 30 segundos.'>
  <meta property='og:image' content='https://k101.com.br/jogos/colheita-infinita/cover.webp'>
  <meta property='og:url' content='https://k101.com.br/jogos/colheita-infinita/'>

  <link rel='icon' href='/favicon.ico'>
  <link rel='stylesheet' href='/shared/tema.css'>
  <link rel='stylesheet' href='css/style.css'>
  <link rel='stylesheet' href='css/hud.css'>
  <link rel='stylesheet' href='css/tree.css'>

  <script type='importmap'>
  { 'imports': {
      'three': 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
      'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/' } }
  </script>
  <!-- SDK da plataforma: DEPOIS do importmap -->
  <script type='module' src='/shared/k101.js'></script>
</head>
<body>
  <canvas id='c'></canvas>

  <!-- Telas (z-index 20 no máximo; o menu K101 fica acima) -->
  <div id='ov-loading' class='ov'>        <!-- visível desde o primeiro byte -->
    <h1>COLHEITA INFINITA</h1>
    <p id='loading-text'>Carregando plantações…</p>
    <div class='bar'><div id='loading-fill'></div></div>
    <div data-k101-slot='loading'></div>   <!-- altura fixa reservada p/ banner futuro -->
  </div>
  <div id='ov-error' class='ov' hidden>…mensagem + Tentar de novo + link /…</div>
  <div id='ov-title' class='ov' hidden>…Jogar / Continuar · Novo jogo…</div>
  <div id='ov-pause' class='ov' hidden>…Continuar…</div>
  <div id='ov-summary' class='ov' hidden>…resumo do dia + data-k101-slot='end-screen'…</div>
  <div id='ov-skills' class='ov' hidden>…árvore de habilidades…</div>

  <div id='hud' hidden>…tempo, dia, dinheiro do dia…</div>
  <button id='tool-btn' hidden aria-label='Ferramentas'></button>   <!-- só no toque -->
  <div id='radial' hidden></div>
  <img id='cursor-icon' alt='' hidden>                              <!-- só com mouse -->

  <script type='module' src='js/main.js'></script>
</body>
</html>
```

Regras de camada: overlays e HUD com `z-index` até 20; menu radial e botão de ferramenta até 30; nada acima de `2147483000` (o menu da plataforma).

### 3.3 Eventos da plataforma (obrigatório)

O jogo ouve os eventos pelo `window`, exatamente como o Defesa do Castelo (seção 10.2 do documento da plataforma). A pausa precisa ser segura em qualquer estado (carregando, título, dia, resumo, árvore).

```js
// Game.js
installPlatform() {
  const on = (name, fn) => window.addEventListener(`k101:${name}`, fn);
  this.muteSources = new Set();
  const mute = (src, active) => {
    active ? this.muteSources.add(src) : this.muteSources.delete(src);
    Sound.setExternalMute(this.muteSources.size > 0);   // só religa quando ninguém pede silêncio
  };
  on('ad:start',     () => { this.pause(); mute('ad', true); });
  on('ad:end',       () => mute('ad', false));          // segue pausado até o jogador voltar
  on('exit:open',    () => { this.pause(); mute('exit', true); });
  on('exit:cancel',  () => mute('exit', false));        // segue pausado
  on('exit:confirm', () => this.save.write());          // SÓ código síncrono
  on('fullscreen:change', () => this.scene.resize());
}
```

Reforço no loop: `if (window.K101?.blocked) return;`. Pausa extra, só deste jogo: ao esconder a aba (`visibilitychange`) o jogo pausa sozinho. Enquanto estiver pausado, o relógio do dia, os ciclos e o crescimento das plantas **não andam**.

### 3.4 Anúncios

Regras do manifesto (seção 8.3): nunca durante a jogabilidade, sempre depois de uma ação do jogador, e o jogo não controla a frequência.

| Ponto | Chamada | Quando |
| --- | --- | --- |
| Entrada | `K101?.ads?.checkEntryAd?.()` | Logo depois do jogador tocar em **Jogar/Continuar** na tela de título. O SDK decide se mostra (1ª abertura e depois a cada 3). |
| Fim do dia (opcional) | `K101?.ads?.request?.('interstitial', { reason: 'next-day' })` | Só ao tocar em **Próximo dia**. **Deixe desligado na v1**: o `request()` atual não limita a frequência e dias de 30 s gerariam anúncio demais. Ligue quando a plataforma ganhar intervalo mínimo. |
| Banners | `data-k101-slot='loading'` e `data-k101-slot='end-screen'` | Faixas de altura fixa na tela de carregamento e no resumo do dia. Nunca no HUD, na árvore ou perto do botão de ferramenta. |
| Recompensa (v2) | `request('rewarded', { reward: 'double-harvest' })` | Botão opcional no resumo: assistir para dobrar a colheita do dia. Só pagar se `rewarded === true`. |

Sempre use `window.K101?.…`: o jogo precisa rodar mesmo se o SDK não carregar. Se o anúncio demorar, não bloqueie: use um limite de 3 s e siga.

### 3.5 Diferenças entre o `k101.js` enviado e o documento da plataforma

O `k101.js` que você enviou está **à frente** do documento v1.2. Vale atualizar o documento:

- `ads.checkEntryAd()` e a chave global `k101_global_game_opens` do `localStorage` (a única chave sem prefixo de slug; é da plataforma) não estão documentados.
- `ads.enabled` aparece como `true`, mas `request()` ainda só devolve `{ shown: false }` e **não emite** `ad:start`/`ad:end`. O jogo deve ouvir esses eventos mesmo assim, para continuar certo quando a rede de anúncios entrar.
- `ads.slot()` não existe no arquivo atual. Chame sempre como `K101?.ads?.slot?.('loading')`.

### 3.6 Convivência no domínio

- `localStorage`: toda chave começa com `colheita-infinita:` (`colheita-infinita:save`, `colheita-infinita:audio`).
- Three.js fixado em `0.160.0` via jsDelivr (mesma versão do Defesa do Castelo).
- Nada de CSS que mexa no menu ou no popup de saída (Shadow DOM) e nada de `<a href='/'>` ou `location.href` para sair: se o jogo ganhar um botão próprio de sair, use `K101.confirmExit()`.
- Interface com as variáveis do tema: `var(--btn1-fundo)`, `var(--background2)`, `var(--borda)`, `var(--raio-card)`, `var(--fonte)`. Nenhum `#hex` na interface.

## 4. Estrutura de pastas

```text
jogos/colheita-infinita/
├─ index.html            ← carregamento + HTML de todas as telas (OBRIGATÓRIO)
├─ game.json             ← ficha para o catálogo (OBRIGATÓRIO)
├─ cover.webp            ← 16:9, 640×360, ≤ 80 KB
├─ icon.webp             ← 256×256, ≤ 40 KB
├─ prints/               ← 01.webp … (2 a 8 telas reais, 1280×720)
├─ css/
│  ├─ style.css          ← base, overlays e telas (título, pausa, resumo)
│  ├─ hud.css            ← HUD, botão de ferramenta, menu radial, cursor
│  └─ tree.css           ← tela da árvore de habilidades
├─ js/
│  ├─ main.js            ← entrada: carrega assets, mostra progresso, cria o Game
│  ├─ Game.js            ← estados, loop, ciclo das ferramentas, installPlatform()
│  ├─ Data.js            ← constantes, BASE_STATS, LIMITS, PALETTE, TOOLS
│  ├─ Crops.js           ← catálogo de plantas (DADOS)
│  ├─ Skills.js          ← árvore de habilidades (DADOS: o arquivo que você edita)
│  ├─ Stats.js           ← aplica as habilidades sobre BASE_STATS
│  ├─ SkillTree.js       ← tela da árvore (desenho, pan, compra)
│  ├─ Grid.js            ← células e regras de estado
│  ├─ Scene.js           ← renderer, câmera, luzes, chão, encaixe da grade
│  ├─ Plants.js          ← carrega .glb e desenha as plantas (InstancedMesh)
│  ├─ Cursor.js          ← anel de raio (3D) + ícone da ferramenta (DOM)
│  ├─ Input.js           ← mouse e toque unificados
│  ├─ RadialMenu.js      ← menu radial (PC e celular)
│  ├─ UI.js              ← HUD, telas, resumo do dia
│  ├─ Vfx.js             ← partículas e números flutuantes
│  ├─ Save.js            ← localStorage com prefixo do slug
│  ├─ Audio.js  Sfx.js  Synth.js   ← copiados do Defesa do Castelo
│  └─ Debug.js           ← só carrega com ?debug (vitrine dos 5 estágios)
└─ assets/
   ├─ models/
   │  ├─ plants/         ← UM .glb por planta, com os 5 estágios (seção 5)
   │  └─ props/          ← (opcional) celeiro, cerca, pedras, árvores de cenário
   ├─ icons/
   │  ├─ crops/          ← <idDaPlanta>.webp (semente/planta)
   │  ├─ tools/          ← water.webp, harvest.webp
   │  ├─ skills/         ← <idDaHabilidade>.webp  +  _missing.webp
   │  └─ coin.webp
   └─ audio/             ← .ogg/.mp3 + manifest.json (gerado)
```

Na raiz do site entra uma ferramenta nova: `tools/check-glb.mjs` (seção 5.7). Mantenha a caixa dos nomes idêntica aos `import`s (o GitHub Pages diferencia maiúsculas).

## 5. Pipeline de assets: o arquivo .glb de cada planta

### 5.1 A regra principal

**Uma planta = um arquivo `.glb` com os 5 estágios dentro.** O arquivo se chama `<idDaPlanta>.glb` (o mesmo `id` de `Crops.js`, minúsculo e sem acento: `trigo.glb`, `milho.glb`, `cenoura.glb`) e fica em `assets/models/plants/`. Vantagens: uma requisição por planta, materiais compartilhados entre estágios e um único validador.

### 5.2 Hierarquia obrigatória dentro do arquivo

A cena do .glb tem **exatamente cinco nós raiz** (Empties no Blender), com estes nomes:

| Nó raiz | Estágio | O que mostrar |
| --- | --- | --- |
| `stage_1` | Semeada | Montinho de terra com a semente ou um brotinho minúsculo. |
| `stage_2` | Broto | Duas folhinhas. |
| `stage_3` | Jovem | Planta com metade do tamanho final, ainda verde. |
| `stage_4` | Quase pronta | Tamanho quase final; fruto ou espiga começando. |
| `stage_5` | Madura | Forma final, **cor de pronta para colher** (precisa ser inconfundível). |

Dentro de cada `stage_N` ficam as malhas (uma ou mais, nomes livres, sem acentos). Os cinco estágios ficam **empilhados no mesmo ponto** (não os espalhe lado a lado): o jogo mostra só o estágio atual da célula.

```text
Cena
├─ stage_1  (Empty)  └─ terra, semente
├─ stage_2  (Empty)  └─ folha_a, folha_b
├─ stage_3  (Empty)  └─ caule, folhas
├─ stage_4  (Empty)  └─ caule, folhas, fruto
└─ stage_5  (Empty)  └─ caule, folhas, fruto_maduro
```

### 5.3 Medidas e orientação

- **Escala:** 1 unidade do Blender = 1 célula. A célula é 1×1; a planta ocupa no máximo **0,8 × 0,8** na base, para não encostar na vizinha.
- **Origem:** centro da base da planta, no chão: ponto (0, 0, 0). Nada pode ficar abaixo de y = 0.
- **Altura:** estágio 5 com até **1,2**. Em geral cada estágio é do mesmo tamanho ou maior que o anterior.
- **Transformações aplicadas:** nas malhas, `Ctrl+A → Todas as transformações`. Os cinco Empties `stage_N` ficam com posição 0, rotação 0 e escala 1 (o validador reprova se não estiverem).
- **Simetria:** o jogo gira cada planta por um ângulo aleatório em Y e varia a escala em ±5%, para o campo não parecer carimbado. Evite modelos com frente definida.
- **Eixos:** exportar com **+Y para cima** (padrão do exportador glTF do Blender).

### 5.4 Orçamento low poly

| Item | Limite |
| --- | --- |
| Triângulos por estágio | até 400 (estágios 1 e 2: até 60) |
| Triângulos por arquivo (5 estágios) | até 1.500 |
| Peso do arquivo | até 80 KB |
| Texturas | **nenhuma** |
| Animações, armaduras, shape keys, câmeras, luzes | **nenhuma** |

### 5.5 Materiais e visual

- Só **cor sólida**: Principled BSDF com *Base Color*; Metallic 0, Roughness 1. Sem imagens.
- Reaproveite nomes de material entre estágios (`plant_green`, `plant_stem`, `wheat_gold`): o arquivo fica menor e o jogo reaproveita o material.
- O jogo **troca** cada material por um `MeshLambertMaterial` com `flatShading`, mantendo só a cor. Portanto o brilho e a suavização do Blender não importam; modele pensando em facetas.
- Garanta contraste entre o estágio 4 e o 5: o jogador precisa reconhecer a planta pronta de longe e em tela pequena.

### 5.6 Exportação no Blender (4.x)

1. Organize uma coleção por planta com os cinco Empties; faça cada malha filha do seu `stage_N`.
2. Selecione tudo da coleção e use *File → Export → glTF 2.0 (.glb/.gltf)*.
3. **Format:** glTF Binary (.glb). **Include:** *Selected Objects*; desmarque câmeras e luzes. **Transform:** +Y Up.
4. **Data → Mesh:** *Apply Modifiers* ligado; UVs, vertex colors e normais personalizadas desligados. **Materials:** Export. **Images:** None. **Animation:** desligado. **Compression:** desligado.
5. Salve em `assets/models/plants/<id>.glb` e rode o validador.

Os nomes das opções mudam um pouco entre versões do Blender; o que vale é o contrato das seções 5.2 a 5.5.

### 5.7 Validador (`tools/check-glb.mjs`)

Lê o cabeçalho do .glb (sem dependências) e confere nós, transformações, triângulos, texturas e peso. Rode antes de cada commit de modelos: `node tools/check-glb.mjs jogos/colheita-infinita`.

```js
// Valida os .glb das plantas.  node tools/check-glb.mjs jogos/<slug>
import { readdir, readFile } from 'node:fs/promises';

const game = process.argv[2];
if (!game) { console.error('Uso: node tools/check-glb.mjs jogos/<slug>'); process.exit(1); }
const dir = `${game}/assets/models/plants`;
const LIMIT = { stageTris: 400, totalTris: 1500, kb: 80 };
let bad = 0;
const fail = (f, msg) => { bad++; console.error(`✗ ${f}: ${msg}`); };

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um .glb');
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}
function trisOfMesh(g, mi) {
  let t = 0;
  for (const p of g.meshes[mi].primitives) {
    if ((p.mode ?? 4) !== 4) continue;
    const acc = p.indices !== undefined ? g.accessors[p.indices] : g.accessors[p.attributes.POSITION];
    t += acc.count / 3;
  }
  return t;
}
function walk(g, ni, acc) {
  const n = g.nodes[ni];
  if (n.mesh !== undefined) { acc.meshes++; acc.tris += trisOfMesh(g, n.mesh); }
  for (const c of n.children ?? []) walk(g, c, acc);
}
const near = (arr, ref) => !arr || arr.every((v, i) => Math.abs(v - ref[i]) < 1e-4);

for (const f of (await readdir(dir)).filter((x) => x.endsWith('.glb'))) {
  const buf = await readFile(`${dir}/${f}`);
  let g;
  try { g = readGlb(buf); } catch (e) { fail(f, e.message); continue; }
  const roots = g.scenes[g.scene ?? 0].nodes ?? [];
  const byName = Object.fromEntries(roots.map((i) => [g.nodes[i].name, i]));
  let total = 0;
  for (let s = 1; s <= 5; s++) {
    const i = byName[`stage_${s}`];
    if (i === undefined) { fail(f, `faltou o nó raiz stage_${s}`); continue; }
    const n = g.nodes[i];
    if (!near(n.translation, [0, 0, 0]) || !near(n.scale, [1, 1, 1]) || !near(n.rotation, [0, 0, 0, 1]))
      fail(f, `stage_${s} precisa ter posição 0, rotação 0 e escala 1`);
    const acc = { tris: 0, meshes: 0 };
    walk(g, i, acc);
    if (!acc.meshes) fail(f, `stage_${s} não tem malha`);
    if (acc.tris > LIMIT.stageTris) fail(f, `stage_${s}: ${acc.tris} triângulos (máx. ${LIMIT.stageTris})`);
    total += acc.tris;
  }
  const extras = roots.filter((i) => !/^stage_[1-5]$/.test(g.nodes[i].name));
  if (extras.length) fail(f, `nós raiz fora do padrão: ${extras.map((i) => g.nodes[i].name).join(', ')}`);
  if (total > LIMIT.totalTris) fail(f, `${total} triângulos no arquivo (máx. ${LIMIT.totalTris})`);
  if (g.images?.length) fail(f, 'tem textura (use só cor sólida)');
  if (g.animations?.length || g.skins?.length) fail(f, 'tem animação ou armadura');
  const kb = Math.round(buf.length / 1024);
  if (kb > LIMIT.kb) fail(f, `${kb} KB (máx. ${LIMIT.kb})`);
  if (!bad) console.log(`✓ ${f}: ${total} triângulos, ${kb} KB`);
}
console.log(bad ? `${bad} problema(s).` : 'Tudo certo.');
process.exit(bad ? 1 : 0);
```

### 5.8 Demais assets

| Asset | Formato | Observação |
| --- | --- | --- |
| Ícone de planta/semente | WebP com transparência, 128×128, ≤ 10 KB | `assets/icons/crops/<id>.webp`; usado no menu radial, no cursor e no resumo do dia. |
| Ícones de ferramenta | WebP, 128×128 | `water.webp`, `harvest.webp` em `assets/icons/tools/`; viram o ícone do cursor. |
| Ícones de habilidade | WebP, 128×128, ≤ 12 KB | `assets/icons/skills/<idDaHabilidade>.webp`. Falta de arquivo cai em `_missing.webp` (com aviso no console). |
| Cenário (opcional) | `.glb` com uma só peça na origem | `assets/models/props/`. Fora da grade, nunca dentro. Mesmas regras de escala e orçamento. |
| Áudio | `.ogg` + `.mp3` | `node tools/make-audio-manifest.mjs jogos/colheita-infinita`. Na v1 os efeitos podem ser sintetizados por `Synth.js`, sem arquivos. |

## 6. Arquitetura do código

### 6.1 Estados do jogo

| Estado | O que acontece | Próximo |
| --- | --- | --- |
| `LOADING` | Carrega os `.glb`, ícones e áudio; a barra mostra progresso real. Falha: mensagem + Tentar de novo + link para `/`. | `TITLE` |
| `TITLE` | Botão **Jogar** (ou **Continuar** + **Novo jogo** se houver save). O toque libera áudio e chama o anúncio de entrada. | `DAY` |
| `DAY` | O dia corre: relógio, ferramentas, crescimento, colheita. | `SUMMARY` quando o tempo zera |
| `SUMMARY` | Mostra o somatório da colheita e o dinheiro recebido. Botão **Continuar**. | `SKILLS` |
| `SKILLS` | Árvore de habilidades; em baixo o botão **Próximo dia**. | `DAY` (dia + 1) |

`paused` é uma bandeira à parte (não um estado): vale em qualquer um deles. `pause()` pode ser chamado a qualquer momento sem efeito colateral; só mostra o overlay de pausa quando o estado é `DAY`.

### 6.2 Responsabilidades

| Módulo | Faz | Não faz |
| --- | --- | --- |
| `Game.js` | Máquina de estados, loop, ciclo das ferramentas, relógio, pausa, ponte com `window.K101`. | Desenhar nada. |
| `Grid.js` | Dados das células e transições (semear, regar, crescer, colher). Sem Three.js. | Saber de tela, mouse ou som. |
| `Scene.js` + `Plants.js` | Tudo que é 3D: câmera, luzes, solo, plantas instanciadas. | Regra de jogo. |
| `Input.js` + `Cursor.js` + `RadialMenu.js` | Mouse, toque, anel de raio e menu radial. Só entregam «onde está o ponteiro» e «está segurando?». | Decidir se a ferramenta dispara. |
| `Stats.js` | Calcula os números do jogador a partir das habilidades compradas. | Interface. |
| `Skills.js` / `Crops.js` / `Data.js` | **Somente dados.** | Lógica. |
| `UI.js` / `SkillTree.js` | HTML das telas, HUD, resumo e árvore. | Regras de compra além de chamar `game.buy(id)`. |

### 6.3 Loop principal

```js
// Game.js
start() { this.scene.renderer.setAnimationLoop((t) => this.tick(t)); }

tick(t) {
  const dt = Math.min(0.05, (t - (this.last ?? t)) / 1000);
  this.last = t;
  const frozen = this.paused || window.K101?.blocked;
  if (this.state === 'DAY' && !frozen) this.updateDay(dt * this.timeScale());
  this.cursor.update(this);          // posição, anel e progresso (não depende do dt do dia)
  this.vfx.update(dt);
  this.scene.render();
}

updateDay(dt) {
  this.timeLeft -= dt;
  for (const g of ['plant', 'water', 'harvest']) this.cd[g] = Math.max(0, this.cd[g] - dt);
  this.grid.update(dt, this.S);
  if (this.input.holding) this.tryFire();      // segurar = repetir assim que o ciclo termina
  this.plants.update(this.grid.cells);
  this.ui.hudTick(this);
  if (this.timeLeft <= 0) this.endDay();
}
```

O limite de `dt` em 50 ms evita saltos quando a aba volta de um congelamento.

## 7. Regras do jogo

### 7.1 A célula e seus estados

Cada célula é um objeto simples: `{ col, row, x, z, state, crop, t, stage, pop, rot, size }`. Os estados formam uma linha reta:

| `state` | Significa | Visual | Ferramenta que age |
| --- | --- | --- | --- |
| `empty` | Terra vazia | Solo arado | **Semear** |
| `dry` | Semente plantada, sem água | Estágio 1, solo seco | **Aguar** |
| `growing` | Aguada, crescendo | Estágios 1 a 4, solo molhado | nenhuma |
| `ripe` | Pronta | Estágio 5 | **Colher** |

Ao colher a célula volta a `empty` e pode ser semeada de novo no mesmo dia. Esclarecimento sobre a tabela da seção 2: os estágios 1 a 4 ocupam 25% cada do `growTime`; o estágio 5 é o resultado (planta pronta).

```js
// Grid.js (trecho)
sow(c, cropId) { Object.assign(c, { state: 'dry', crop: cropId, t: 0, stage: 1, pop: 0.4 }); }
water(c)       { c.state = 'growing'; c.pop = 0.8; }

update(dt, S) {
  for (const c of this.cells) {
    if (c.state === 'growing') {
      c.t += dt * S.growthSpeed;
      const p = c.t / CROPS[c.crop].growTime;          // 0..1
      const stage = p >= 1 ? 5 : 1 + Math.floor(p * 4);
      if (stage !== c.stage) { c.stage = stage; c.pop = 0.6; }   // «pop» de crescimento
      if (p >= 1) c.state = 'ripe';
    }
    if (c.pop < 1) c.pop = Math.min(1, c.pop + dt * 4);
  }
}
```

### 7.2 Raio e ciclo da ferramenta

- O **raio** é em células (1 célula = 1 unidade do mundo). O centro do círculo é o ponto do chão sob o cursor, sem encaixar na grade.
- Uma célula entra no disparo se **o centro dela** está a uma distância menor ou igual ao raio. Com raio 1,5 isso costuma dar de 5 a 9 células.
- Cada grupo (`plant`, `water`, `harvest`) tem um contador `cd` e o ciclo total `cdTotal`. O anel enche com `1 - cd / cdTotal`.
- Clique solto e segurar usam o mesmo caminho: `onPress()` tenta disparar na hora e, enquanto o botão/dedo segue pressionado, o `updateDay` tenta de novo a cada quadro. Se o ciclo não terminou, nada acontece (clicar mais rápido não acelera).
- **Sem alvo = sem gasto**: se nenhuma célula do círculo é válida para a ferramenta atual, o ciclo não reinicia e o anel continua cheio.
- Trocar de ferramenta não zera os ciclos dos outros grupos.

```js
// Game.js
tryFire() {
  if (this.state !== 'DAY' || this.paused) return false;
  const sel = this.selection;                       // { tool: 'plant', crop: 'trigo' }
  const tool = TOOLS[sel.tool], group = tool.group;
  if (this.cd[group] > 0) return false;             // ainda no ciclo
  const p = this.cursor.worldPoint;                 // ponto do chão sob o cursor (ou null)
  if (!p) return false;
  const targets = this.grid
    .cellsInCircle(p.x, p.z, this.S[group].radius)
    .filter((c) => tool.canTarget(c, this));
  if (!targets.length) return false;               // sem alvo: não gasta o ciclo
  for (const c of targets) tool.apply(c, this);
  this.cd[group] = this.cdTotal[group] = this.S[group].cooldown;
  this.vfx.burst(p, tool.vfx, targets.length);
  Sound.play?.(tool.sfx);
  return true;
}

// Grid.js
cellsInCircle(x, z, r) {
  const r2 = r * r, out = [];
  for (const c of this.cells) {
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz <= r2) out.push(c);
  }
  return out;                                      // máx. 144 células: varrer todas é barato
}
```

### 7.3 Ferramentas (`Data.js`)

```js
export const TOOLS = {
  plant:   { group: 'plant',   sfx: 'plant',   vfx: 'dirt',
             canTarget: (c) => c.state === 'empty',
             apply: (c, g) => g.grid.sow(c, g.selection.crop) },
  water:   { group: 'water',   sfx: 'water',   vfx: 'drops', icon: 'assets/icons/tools/water.webp',
             canTarget: (c) => c.state === 'dry',
             apply: (c, g) => g.grid.water(c) },
  harvest: { group: 'harvest', sfx: 'harvest', vfx: 'leaves', icon: 'assets/icons/tools/harvest.webp',
             canTarget: (c) => c.state === 'ripe',
             apply: (c, g) => g.harvestCell(c) }
};
```

Semear é uma ferramenta só, com a **semente selecionada** em `selection.crop`; no menu radial cada semente desbloqueada aparece como um item. O ícone de uma semente vem de `assets/icons/crops/<id>.webp`.

### 7.4 O dia e a economia

1. `startDay()`: limpa a grade (com o tamanho atual de `S.grid`), zera ciclos e colheita do dia, `timeLeft = S.dayLength`, refaz o encaixe da câmera. Contagem 3-2-1 antes de começar.
2. Durante o dia, `harvestCell(c)` soma em `dayHarvest[crop]` a quantidade e o valor (`crop.value * S.valueMult`) e mostra o número flutuante. O dinheiro **não entra na hora**: o HUD mostra «colhido hoje».
3. Aos 5 s finais o relógio pulsa. Em 0, as ferramentas param, aparece «Fim do dia!» por 1 s e o resumo abre.
4. Resumo: uma linha por planta colhida (ícone, quantidade, valor) e o total. O dinheiro sobe animado até o total («contagem») e só então o botão **Continuar** fica ativo. `money += total`, salva e vai para a árvore.
5. Na árvore o jogador compra habilidades (`game.buy(id)`), e **Próximo dia** chama `startDay()` com `day + 1`.

Recorde (melhor dia) e dia atual ficam no save. Não há derrota: o pior dia rende zero e ainda dá para tentar de novo no dia seguinte.

## 8. Entrada: PC e celular

Um único `Input.js` com **Pointer Events** no `<canvas>` cobre mouse e toque. O tipo vem de `e.pointerType`, então aparelhos híbridos funcionam: o último tipo usado decide a interface (cursor de PC ou botão inferior).

### 8.1 Comportamento

|  | PC (mouse) | Celular (toque) |
| --- | --- | --- |
| Ponteiro | Cursor do sistema escondido (`cursor: none`). Ícone da ferramenta atual segue o mouse, com o anel de raio ao redor, **sempre visível**. | Anel aparece quando o dedo **toca e segura**, e some ao soltar. Fica 40 px acima do dedo. |
| Usar a ferramenta | Botão **esquerdo**: clicar ou segurar e arrastar. | Tocar ou segurar e arrastar o dedo. |
| Trocar de ferramenta | Botão **direito** abre o menu radial em volta do cursor. Teclas `1` a `9` escolhem pela ordem do menu (opcional). | **Botão inferior central** com o ícone da ferramenta atual; ao tocar abre o menu radial na posição dele, em leque para cima. |
| Anel de ciclo | Cada ciclo preenche a circunferência do anel até fechar. Cheio = pronto. | Igual. |
| Menu de contexto do sistema | Bloqueado no canvas (`contextmenu` + `preventDefault`). | Bloqueado (evita o menu de segurar). |

Regras de visibilidade do anel: PC: sobre o canvas, estado `DAY`, jogo sem pausa e menu radial fechado. Celular: apenas enquanto há um dedo pressionado.

### 8.2 `Input.js` (núcleo)

```js
import { TOUCH_OFFSET_PX } from './Data.js';

export class Input {
  constructor(canvas, game) {
    this.pos = { x: 0, y: 0 };   // onde o círculo deve ficar na tela (px)
    this.inside = false;         // mouse sobre o canvas
    this.holding = false;        // botão esquerdo ou dedo pressionado
    this.type = 'mouse';         // último tipo usado: 'mouse' ou 'touch'
    this.activeId = null;        // ignora o segundo dedo

    canvas.style.touchAction = 'none';
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      this.type = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (this.activeId !== null) return;
      this.setPos(e);
      if (game.radial.isOpen) return;
      if (this.type === 'mouse' && e.button === 2) {        // direito: menu radial em volta do cursor
        game.radial.open(e.clientX, e.clientY, 'around');
        return;
      }
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.activeId = e.pointerId;
      this.inside = true;
      this.holding = true;
      game.tryFire();                                       // dispara já, se o ciclo permitir
    });

    canvas.addEventListener('pointermove', (e) => {
      this.type = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (this.type === 'mouse') this.inside = true;
      if (this.activeId === null || e.pointerId === this.activeId) this.setPos(e);
    });

    const release = (e) => {
      if (e.pointerId !== this.activeId) return;
      this.activeId = null;
      this.holding = false;
      if (this.type === 'touch') this.inside = false;       // anel some ao soltar o dedo
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.inside = false; });
    window.addEventListener('blur', () => { this.holding = false; this.activeId = null; });
  }

  setPos(e) {
    this.pos.x = e.clientX;
    this.pos.y = e.clientY - (this.type === 'touch' ? TOUCH_OFFSET_PX : 0);
  }
}
```

O `Cursor.update()` converte `input.pos` em ponto do chão com um raio da câmera contra o plano `y = 0`:

```js
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();

groundPoint(px, py, camera) {
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? hit : null;   // null se apontar para o céu
}
```

### 8.3 Anel de raio com «carregando» (`Cursor.js`)

O anel é uma malha **no chão** (assim a perspectiva faz o círculo parecer deitado sobre as células) e o preenchimento é feito num shader simples. Tamanho = raio em unidades do mundo; cor = cor da ferramenta (`PALETTE`) misturada com `--cor1` lida do tema.

```js
const ringGeo = new THREE.RingGeometry(0.94, 1.0, 96);       // fino; escala = raio
const ringMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uProgress: { value: 1 }, uColor: { value: new THREE.Color() } },
  vertexShader: `
    varying vec2 vP;
    void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    varying vec2 vP; uniform float uProgress; uniform vec3 uColor;
    void main() {
      float a = atan(vP.x, vP.y);                            // 0 no topo, sentido horário
      float f = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;   // 0..1 ao redor do círculo
      float on = step(f, uProgress);
      gl_FragColor = vec4(uColor, mix(0.25, 0.95, on));      // trilho fraco + trecho cheio
    }`
});
const ring = new THREE.Mesh(ringGeo, ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.06;
// Disco suave por baixo: CircleGeometry(1, 64) com MeshBasicMaterial transparente, opacity 0.12
```

Por quadro: `ring.scale.setScalar(S[group].radius)`, `ring.position.set(p.x, 0.06, p.z)`, `uProgress = 1 - cd / cdTotal`. Quando o anel fecha (pronto) ele dá um pequeno pulso de escala (1 → 1,06 → 1 em 150 ms). Extra recomendado: as células dentro do círculo que **seriam afetadas** ganham um brilho leve no solo (`instanceColor` mais claro), para o jogador ver exatamente o que vai acontecer.

O ícone da ferramenta é um `<img id='cursor-icon'>` (40 px, `pointer-events: none`, `position: fixed`) movido por `transform: translate3d(x, y, 0)` com `translate(-50%, -50%)`, escondido no celular.

### 8.4 Menu radial (`RadialMenu.js`)

- É HTML (não 3D): botões redondos de 56 px com `<img>` e rótulo curto, posicionados em círculo. Estilo só com o tema: `background: var(--background2)`, `border: var(--borda)`, hover/selecionado com `var(--cor3)` e `var(--borda-hover)`.
- Itens: uma entrada por semente desbloqueada, mais **Aguar** e **Colher**. O item da seleção atual fica destacado.
- Abre com animação (cada item sai do centro, 60 ms de atraso entre eles). Com o menu aberto o anel some e as ferramentas não disparam.
- **Fechar:** escolher um item, clicar/tocar no fundo transparente, `Esc` ou abrir o popup de saída.
- **PC:** ao soltar o botão direito sobre um item, ele é escolhido (gesto rápido de segurar, arrastar e soltar); se soltar sem item, o menu fica aberto e o clique esquerdo escolhe.

```js
// layout(n, mode): devolve o ângulo de cada item
//   'around' (PC):     círculo completo, 1º item no topo
//   'fan' (celular):   leque de -160° a -20° (só para cima, o botão está na borda de baixo)
layout(n, mode) {
  const R = Math.max(76, 30 * n);
  const angles = Array.from({ length: n }, (_, i) =>
    mode === 'fan'
      ? (n === 1 ? -90 : -160 + (140 * i) / (n - 1))
      : -90 + (360 * i) / n);
  return { R, angles };
}
// posição do item: (cx + R*cos(a), cy + R*sin(a)); no PC o centro (cx, cy) é limitado
// para o círculo inteiro caber na tela (margem de 40 px).
```

O botão inferior do celular (`#tool-btn`) fica centrado, 64 px, acima de `env(safe-area-inset-bottom)`; mostra o ícone da ferramenta atual e um anel fino com o ciclo do grupo atual (reaproveita o progresso do cursor).

## 9. A cena 3D (`Scene.js`, `Plants.js`)

### 9.1 Câmera

Perspectiva, `fov 35`, inclinada **55°** olhando para o centro da grade. Ao iniciar o dia, ao redimensionar e ao mudar a tela cheia (`fullscreen:change`) a distância é recalculada para a grade inteira caber, com folga para o HUD:

```js
fit(cols, rows) {
  const w = cols + 1.4, d = rows + 1.4;                    // grade + margem em células
  const tilt = THREE.MathUtils.degToRad(55);
  const vFov = THREE.MathUtils.degToRad(this.camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
  const needH = (w / 2) / Math.tan(hFov / 2);
  const needV = ((d * Math.sin(tilt)) / 2 + 0.6) / Math.tan(vFov / 2);
  this.targetDist = Math.max(needH, needV) * 1.15;        // 15% de ar para o HUD
  // por quadro: dist += (targetDist - dist) * 0.1   (a grade «cresce» suavemente)
  // posição = (0, sin(tilt), cos(tilt)) * dist; lookAt(0, 0, 0)
}
```

### 9.2 Luz, chão e solo

- Luzes: `HemisphereLight` (céu/chão, 0,9) e uma `DirectionalLight` (1,1) com sombra de 1024 px cobrindo a grade máxima. Sombra desligada em celular de entrada (flag de qualidade). Opcional: a cor da luz vai de manhã clara a fim de tarde alaranjada ao longo dos 30 s.
- Chão: um plano grande verde (`PALETTE.grass`) sob tudo.
- Solo: **uma** `InstancedMesh` de `BoxGeometry(0.94, 0.1, 0.94)` com capacidade `MAX_COLS * MAX_ROWS` e `instanceColor`: `PALETTE.soilEmpty` para `empty` e `dry`, `PALETTE.soilWet` para `growing` e `ripe`. A cor muda no mesmo quadro em que o estado muda.
- Posição da célula `(col, row)`: `x = (col - (cols - 1) / 2) * CELL`, `z = (row - (rows - 1) / 2) * CELL`, com `CELL = 1`. A grade fica sempre centrada na origem.
- Renderer: `antialias: true` no PC, `setPixelRatio(min(devicePixelRatio, 2))` (1,5 no celular), `outputColorSpace = SRGBColorSpace`.

### 9.3 Plantas: carregar e desenhar (`Plants.js`)

Os `.glb` são lidos **uma vez** no carregamento; de cada estágio guardamos geometria, cor e a matriz de cada malha. As plantas do campo são desenhadas com `InstancedMesh`, uma por (planta, estágio, malha), com capacidade para a grade máxima. Como há no máximo 144 células, as instâncias são **reconstruídas todo quadro**: simples e sem bug de contagem.

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadCropModels(crops, manager) {
  const loader = new GLTFLoader(manager);
  const models = {};
  await Promise.all(crops.map(async (crop) => {
    const gltf = await loader.loadAsync(`assets/models/plants/${crop.id}.glb`);
    gltf.scene.updateMatrixWorld(true);
    const stages = [];
    for (let s = 1; s <= 5; s++) {
      const root = gltf.scene.getObjectByName(`stage_${s}`);
      if (!root) throw new Error(`${crop.id}.glb: falta o nó stage_${s}`);
      const parts = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        parts.push({
          geometry: o.geometry,
          material: new THREE.MeshLambertMaterial({ color: o.material.color, flatShading: true }),
          matrix: o.matrixWorld.clone()          // posição da malha dentro do estágio
        });
      });
      stages.push(parts);
    }
    models[crop.id] = stages;                // models[id][0..4] = lista de partes
  }));
  return models;
}

export class PlantRenderer {
  constructor(scene, models, capacity) {
    this.models = models;
    this.pools = {};                         // pools[id][estágio] = [InstancedMesh por parte]
    for (const [id, stages] of Object.entries(models)) {
      this.pools[id] = stages.map((parts) => parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, capacity);
        im.count = 0; im.castShadow = true; im.frustumCulled = false;
        scene.add(im);
        return im;
      }));
    }
    this.base = new THREE.Matrix4(); this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.sc = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  update(cells) {
    for (const stages of Object.values(this.pools)) for (const list of stages) for (const im of list) im.count = 0;
    for (const c of cells) {
      if (!c.crop) continue;
      const parts = this.models[c.crop][c.stage - 1];
      const pool = this.pools[c.crop][c.stage - 1];
      this.pos.set(c.x, 0, c.z);
      this.q.setFromAxisAngle(this.up, c.rot);
      this.sc.setScalar(c.size * c.pop);                 // «pop» ao semear e ao mudar de estágio
      this.base.compose(this.pos, this.q, this.sc);
      parts.forEach((p, i) => {
        this.m.multiplyMatrices(this.base, p.matrix);
        pool[i].setMatrixAt(pool[i].count++, this.m);
      });
    }
    for (const stages of Object.values(this.pools)) for (const list of stages) for (const im of list) im.instanceMatrix.needsUpdate = true;
  }
}
```

Se um `.glb` estiver errado, o erro cita o arquivo e o nó que falta e cai na tela de falha de carregamento (seção 6.1). Com `?debug`, o `Debug.js` mostra todas as plantas com os 5 estágios lado a lado para você conferir cada modelo novo.

## 10. Telas e HUD

Todas as telas são HTML sobre o canvas (`.ov`, `z-index` até 20) e usam só variáveis do tema. Elementos do topo respeitam `var(--k101-safe-top, 0px)` (o menu da plataforma ocupa o centro superior).

| Tela | Conteúdo e regras |
| --- | --- |
| **Carregamento** (`#ov-loading`) | Estática no HTML: título, texto, barra (`#loading-fill`) e o espaço `data-k101-slot='loading'` com altura fixa (90 px). A barra reflete o progresso real do `LoadingManager` (modelos) mais o áudio. |
| **Título** (`#ov-title`) | **Jogar** (sem save) ou **Continuar · Dia N** + **Novo jogo** (com save; pede confirmação em popup próprio com BTN2/BTN3). O toque libera o áudio e chama o anúncio de entrada (seção 3.4). Dica de uma linha sobre a logo do menu pedir confirmação ao sair. |
| **HUD do dia** (`#hud`) | Esquerda: barra de tempo com segundos. Direita: «colhido hoje» em moedas. Abaixo da reserva do menu, no centro: pastilha **DIA N**. Nada importante no centro superior. No PC, canto inferior esquerdo: nome da ferramenta e a dica «Botão direito: ferramentas» (some depois da 1ª troca). |
| **Contagem** | 3-2-1 antes de cada dia (respeita `--k101-safe-top`). |
| **Pausa** (`#ov-pause`) | Aparece por anúncio, popup de saída cancelado, aba oculta ou tecla `P`/`Esc` (PC). **Continuar** retoma. |
| **Resumo do dia** (`#ov-summary`) | Título «Dia N concluído»; lista (ícone da planta × quantidade = valor); total; «Dinheiro recebido» com contagem animada; melhor dia; faixa `data-k101-slot='end-screen'` (90 px, fixa); botão **Continuar** (ativo após a contagem; tocar na tela acelera a contagem). |
| **Árvore** (`#ov-skills`) | Seção 11. Tela cheia, sem anúncios. |

A entrada de teclado só vale na `DAY`: `1`..`9` trocam a ferramenta pela ordem do menu radial, `P` pausa. O menu da plataforma não usa teclas, então não há conflito; com o popup de saída aberto nenhuma tecla chega ao jogo.

## 11. Árvore de habilidades

### 11.1 Regras visuais (o que o jogador vê)

1. Ao abrir a árvore pela primeira vez existe **uma única célula no centro**, a raiz, com custo 0. O jogador toca e desbloqueia de graça.
2. **Só aparece** uma célula se ela é a raiz ou se **o pai dela já foi desbloqueado**. O resto da árvore não existe na tela (nem silhuetas).
3. Ao desbloquear uma célula, os filhos dela nascem ao lado, ligados por linhas que se desenham a partir do pai. A árvore vai se montando conforme as escolhas.
4. Cada célula mostra ícone, nome curto e preço. Estados: **desbloqueada** (com selo), **disponível e acessível** (borda de destaque) e **disponível sem dinheiro suficiente** (apagada; mostra quanto falta).
5. Fluxo da tela: topo com dinheiro e dia; centro com a árvore (arrastar para mover; roda do mouse ou botões +/− para o zoom; botão de recentralizar); acima do rodapé um painel com a célula selecionada (nome, descrição, efeito, preço e botão **Desbloquear**); e no rodapé o botão **Próximo dia**.

### 11.2 Modelo de dados

A árvore é uma **lista plana** de nós em `Skills.js`. Quem manda na forma é o campo `parent` (liga cada nó ao anterior); a posição na tela vem de `at: [x, y]`, em unidades de célula (x para a direita, y para baixo, raiz em `[0, 0]`). Mover ou criar uma célula é mudar essas duas coisas.

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | texto | Único, minúsculo, sem acento. Vira o nome do ícone (`assets/icons/skills/<id>.webp` se `icon` faltar). |
| `parent` | id ou `null` | Pai na árvore. Só a raiz tem `null`. |
| `at` | `[x, y]` | Posição em unidades de célula. Duas células não podem ocupar o mesmo ponto. |
| `name` | texto | Nome curto. |
| `desc` | texto (opcional) | Descrição. Se faltar, o jogo gera uma a partir dos efeitos. |
| `icon` | arquivo `.webp` | Arquivo dentro de `assets/icons/skills/`. |
| `cost` | número | Preço em moedas (0 = grátis). |
| `effects` | lista | O que a habilidade faz (11.4). |

### 11.3 `Skills.js` (exemplo funcional)

```js
// Skills.js — DADOS da árvore. Edite aqui para criar, mover ou remover habilidades.
import { STAT_KEYS } from './Data.js';

export const TREE = { spacing: 150, nodeSize: 84 };   // px por unidade de «at»

// Atalho: cria uma fila de níveis encadeados (I, II, III…); cada nível é filho do anterior.
// O 1º nível nasce em `at` e os seguintes andam `step` a cada nível.
function chain({ id, parent, at, step, name, desc, icon, costs, effects }) {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  return costs.map((cost, i) => ({
    id: `${id}-${i + 1}`,
    parent: i === 0 ? parent : `${id}-${i}`,
    at: [at[0] + step[0] * i, at[1] + step[1] * i],
    name: `${name} ${ROMAN[i]}`,
    desc, icon, cost, effects
  }));
}

export const SKILLS = [
  // RAIZ: a única habilidade visível no começo. Custo 0 = de graça.
  { id: 'raiz', parent: null, at: [0, 0], name: 'Mãos na terra', icon: 'raiz.webp', cost: 0,
    desc: 'Sua jornada começa aqui. As colheitas valem 10% mais.',
    effects: [{ stat: 'valueMult', mul: 1.1 }] },

  // NORTE — semear
  ...chain({ id: 'semear-raio', parent: 'raiz', at: [0, -1], step: [0, -1], name: 'Semeadura ampla',
    icon: 'semear-raio.webp', costs: [20, 45, 90, 180], effects: [{ stat: 'plant.radius', add: 0.25 }] }),
  ...chain({ id: 'semear-ciclo', parent: 'semear-raio-1', at: [1, -1], step: [1, 0], name: 'Semeadura rápida',
    icon: 'semear-ciclo.webp', costs: [30, 60, 120], effects: [{ stat: 'plant.cooldown', mul: 0.9 }] }),

  // LESTE — aguar
  ...chain({ id: 'agua-raio', parent: 'raiz', at: [1, 0], step: [1, 0], name: 'Regador amplo',
    icon: 'agua-raio.webp', costs: [20, 45, 90, 180], effects: [{ stat: 'water.radius', add: 0.25 }] }),
  ...chain({ id: 'agua-ciclo', parent: 'agua-raio-1', at: [1, 1], step: [1, 0], name: 'Regador rápido',
    icon: 'agua-ciclo.webp', costs: [30, 60, 120], effects: [{ stat: 'water.cooldown', mul: 0.9 }] }),
  ...chain({ id: 'crescer', parent: 'agua-ciclo-1', at: [1, 2], step: [0, 1], name: 'Terra fértil',
    desc: 'As plantas crescem 15% mais rápido.',
    icon: 'crescer.webp', costs: [40, 90, 200], effects: [{ stat: 'growthSpeed', mul: 1.15 }] }),

  // SUL — colher
  ...chain({ id: 'colher-raio', parent: 'raiz', at: [0, 1], step: [0, 1], name: 'Foice larga',
    icon: 'colher-raio.webp', costs: [20, 45, 90, 180], effects: [{ stat: 'harvest.radius', add: 0.25 }] }),
  ...chain({ id: 'colher-ciclo', parent: 'colher-raio-1', at: [-1, 1], step: [-1, 0], name: 'Foice rápida',
    icon: 'colher-ciclo.webp', costs: [30, 60, 120], effects: [{ stat: 'harvest.cooldown', mul: 0.9 }] }),
  ...chain({ id: 'dia-longo', parent: 'colher-ciclo-1', at: [-1, 2], step: [0, 1], name: 'Dia mais longo',
    desc: 'O dia dura 5 segundos a mais.',
    icon: 'dia-longo.webp', costs: [50, 120, 260], effects: [{ stat: 'dayLength', add: 5 }] }),

  // OESTE — terra e plantas
  ...chain({ id: 'terra-grade', parent: 'raiz', at: [-1, 0], step: [-1, 0], name: 'Mais terra',
    desc: 'A grade ganha 1 coluna e 1 linha.',
    icon: 'terra-grade.webp', costs: [40, 100, 220, 450, 900],
    effects: [{ stat: 'grid.cols', add: 1 }, { stat: 'grid.rows', add: 1 }] }),
  { id: 'milho', parent: 'terra-grade-1', at: [-1, -1], name: 'Milho', icon: 'milho.webp', cost: 60,
    desc: 'Libera a semente de milho (vale mais que o trigo).', effects: [{ unlock: 'crop', id: 'milho' }] },
  { id: 'cenoura', parent: 'milho', at: [-2, -1], name: 'Cenoura', icon: 'cenoura.webp', cost: 150,
    effects: [{ unlock: 'crop', id: 'cenoura' }] },
  { id: 'tomate', parent: 'cenoura', at: [-3, -1], name: 'Tomate', icon: 'tomate.webp', cost: 320,
    effects: [{ unlock: 'crop', id: 'tomate' }] },
  ...chain({ id: 'preco', parent: 'milho', at: [-1, -2], step: [0, -1], name: 'Preço justo',
    desc: 'As colheitas valem 15% mais.',
    icon: 'preco.webp', costs: [80, 200], effects: [{ stat: 'valueMult', mul: 1.15 }] })
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
```

### 11.4 Efeitos

| Efeito | Exemplo | O que faz |
| --- | --- | --- |
| Soma | `{ stat: 'plant.radius', add: 0.25 }` | Soma ao valor-base. |
| Multiplica | `{ stat: 'plant.cooldown', mul: 0.9 }` | Multiplica (0,9 = 10% mais rápido). |
| Libera planta | `{ unlock: 'crop', id: 'milho' }` | Passa a aparecer no menu radial; precisa existir em `Crops.js` e ter `milho.glb`. |

Cada habilidade pode ter vários efeitos. O cálculo é independente da ordem: para cada estatística, `(base + soma de todos os add) × produto de todos os mul`, e depois o resultado é limitado por `LIMITS`. As estatísticas válidas são as de `BASE_STATS` (12.1); para criar uma nova (por exemplo, chance de colheita em dobro) basta acrescentá-la lá e usar `game.S.<nome>` na regra.

```js
// Stats.js
import { BASE_STATS, LIMITS, START_CROPS } from './Data.js';
import { SKILL_BY_ID } from './Skills.js';

const get = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

export function computeStats(ownedIds) {
  const add = {}, mul = {}, crops = new Set(START_CROPS);
  for (const id of ownedIds) {
    for (const e of SKILL_BY_ID[id].effects) {
      if (e.unlock === 'crop') crops.add(e.id);
      else if (e.add !== undefined) add[e.stat] = (add[e.stat] ?? 0) + e.add;
      else if (e.mul !== undefined) mul[e.stat] = (mul[e.stat] ?? 1) * e.mul;
    }
  }
  const S = structuredClone(BASE_STATS);
  for (const key of STAT_KEYS) {
    let v = (get(BASE_STATS, key) + (add[key] ?? 0)) * (mul[key] ?? 1);
    const [lo, hi] = LIMITS[key] ?? [-Infinity, Infinity];
    set(S, key, Math.min(hi, Math.max(lo, v)));
  }
  S.unlockedCrops = [...crops];
  return S;
}
```

### 11.5 Validador da árvore

Roda sempre no carregamento (e imprime no console), para um erro de digitação não virar uma árvore quebrada. Confere: id repetido, mais de uma raiz, pai que não existe, ciclo, duas células na mesma posição, custo inválido, efeito desconhecido, planta liberada que não existe em `Crops.js` e ícone ausente (aviso).

```js
export function validateSkills(list, crops) {
  const errs = [], byId = new Map(), at = new Map();
  for (const s of list) {
    if (byId.has(s.id)) errs.push(`id repetido: ${s.id}`);
    byId.set(s.id, s);
    const key = s.at.join(',');
    if (at.has(key)) errs.push(`${s.id} e ${at.get(key)} estão na mesma posição (${key})`);
    at.set(key, s.id);
    if (!Number.isFinite(s.cost) || s.cost < 0) errs.push(`${s.id}: custo inválido`);
    if (!s.effects?.length) errs.push(`${s.id}: sem efeitos`);
    for (const e of s.effects ?? []) {
      if (e.unlock === 'crop' ? !crops[e.id] : !STAT_KEYS.includes(e.stat))
        errs.push(`${s.id}: efeito inválido ${JSON.stringify(e)}`);
    }
  }
  const roots = list.filter((s) => s.parent === null);
  if (roots.length !== 1) errs.push(`precisa de exatamente 1 raiz (há ${roots.length})`);
  for (const s of list) {
    if (s.parent !== null && !byId.has(s.parent)) errs.push(`${s.id}: pai inexistente (${s.parent})`);
    let n = s, steps = 0;
    while (n && n.parent !== null && steps++ < 1000) n = byId.get(n.parent);
    if (steps >= 1000) errs.push(`${s.id}: ciclo na árvore`);
  }
  errs.forEach((m) => console.error('[Skills]', m));
  return errs;
}
```

### 11.6 Tela da árvore (`SkillTree.js`)

```js
// Regra de visibilidade (a única que decide o que aparece):
const isOwned   = (g, s) => g.owned.has(s.id);
const isVisible = (g, s) => s.parent === null || g.owned.has(s.parent);

// Compra (Game.js)
buy(id) {
  const s = SKILL_BY_ID[id];
  if (!s || this.owned.has(id) || !isVisible(this, s) || this.money < s.cost) return false;
  const before = new Set(visibleIds(this));
  this.money -= s.cost;
  this.owned.add(id);
  this.S = computeStats(this.owned);          // vale a partir do próximo dia
  this.save.write();
  this.ui.skills.refresh({ born: visibleIds(this).filter((v) => !before.has(v)), from: id });
  Sound.play?.('unlock');
  return true;
}
```

- **Desenho:** um contêiner `#tree-world` (posição relativa, movido por `transform: translate(x, y) scale(z)`) com um `<svg>` de linhas por baixo e um `<button class='node'>` por célula visível, em `left/top = at * TREE.spacing`. As linhas ligam cada nó visível ao pai.
- **Animação de nascimento:** os filhos novos (`born`) entram com escala 0 → 1 e a linha se desenha por `stroke-dashoffset`, ambos partindo do pai. Com `prefers-reduced-motion` aparecem direto.
- **Pan e zoom:** Pointer Events no `viewport` (arrastar), roda do mouse e botões +/− (limites 0,6 a 1,4). Ao abrir, a visão centraliza nos nós disponíveis; após uma compra, desliza até enquadrar os filhos novos.
- **Seleção:** tocar numa célula a seleciona e preenche o painel inferior. **Desbloquear** chama `game.buy(id)`; sem dinheiro, o botão fica desativado e diz quanto falta.
- **Textos:** se `desc` faltar, o painel gera «+0,25 Raio de semear» ou «−10% Ciclo de semear» a partir dos efeitos e de `STAT_LABELS` (Data.js).
- **Acessibilidade:** os nós são botões focaveis, com `aria-label` no formato «Nome, preço, estado». As cores vêm do tema (`--btn1-fundo`, `--borda`, `--cor1` para o destaque de disponível).

### 11.7 Receita: criar uma nova célula

1. Desenhe o ícone (`128×128`, WebP) e salve em `assets/icons/skills/<id>.webp`.
2. Em `Skills.js`, acrescente o objeto (ou uma `chain`) com `id`, `parent` (célula que a abre), `at` (livre, sem repetir ponto), `name`, `cost` e `effects`.
3. Se o efeito usa uma estatística nova: acrescente em `BASE_STATS`, `LIMITS` e `STAT_LABELS` (Data.js) e use `game.S.<nome>` na regra.
4. Se libera uma planta: acrescente em `Crops.js`, o `.glb` (seção 5) e o ícone em `assets/icons/crops/`.
5. Abra o jogo: o validador (11.5) avisa no console de qualquer erro.

## 12. Arquivos de dados

### 12.1 `Data.js`

```js
export const CELL = 1;
export const MAX_COLS = 12, MAX_ROWS = 12;           // capacidade das InstancedMesh
export const TOUCH_OFFSET_PX = 40;                   // anel acima do dedo (0 = exatamente no dedo)
export const RADIAL_TIME_SCALE = 1;                 // 1 = relógio normal com o menu aberto; 0.25 = câmera lenta
export const START_CROPS = ['trigo'];

export const BASE_STATS = {
  dayLength: 30,
  plant:   { radius: 1.5, cooldown: 1.0 },
  water:   { radius: 1.5, cooldown: 1.0 },
  harvest: { radius: 1.5, cooldown: 1.0 },
  grid:    { cols: 6, rows: 6 },
  growthSpeed: 1,
  valueMult: 1
};
// Todos os caminhos numéricos de BASE_STATS, ex.: 'plant.radius' (gerado, não editar)
export const STAT_KEYS = ['dayLength', 'plant.radius', 'plant.cooldown', 'water.radius', 'water.cooldown',
  'harvest.radius', 'harvest.cooldown', 'grid.cols', 'grid.rows', 'growthSpeed', 'valueMult'];

export const LIMITS = {                              // [mínimo, máximo]
  dayLength: [10, 90],
  'plant.radius': [0.5, 4], 'water.radius': [0.5, 4], 'harvest.radius': [0.5, 4],
  'plant.cooldown': [0.25, 5], 'water.cooldown': [0.25, 5], 'harvest.cooldown': [0.25, 5],
  'grid.cols': [3, MAX_COLS], 'grid.rows': [3, MAX_ROWS],
  growthSpeed: [0.25, 3], valueMult: [0.1, 100000]
};

export const STAT_LABELS = {                        // usado nos textos automáticos da árvore
  dayLength: 'Duração do dia (s)', 'plant.radius': 'Raio de semear', 'water.radius': 'Raio de aguar',
  'harvest.radius': 'Raio de colher', 'plant.cooldown': 'Ciclo de semear', 'water.cooldown': 'Ciclo de aguar',
  'harvest.cooldown': 'Ciclo de colher', 'grid.cols': 'Colunas', 'grid.rows': 'Linhas',
  growthSpeed: 'Velocidade de crescimento', valueMult: 'Valor da colheita'
};

export const PALETTE = {                            // cores do MUNDO 3D (a interface usa tema.css)
  grass: 0x6fae4a, soilEmpty: 0x7a5230, soilWet: 0x4d321c, sky: 0xbfe3f5,
  ring: { plant: 0x9be564, water: 0x58b8ff, harvest: 0xffd24a }
};
// TOOLS: ver seção 7.3
```

### 12.2 `Crops.js`

```js
// Para criar uma planta: uma linha aqui + assets/models/plants/<id>.glb + assets/icons/crops/<id>.webp
// + uma habilidade em Skills.js que a libere (ou coloque o id em START_CROPS).
export const CROPS = {
  trigo:   { id: 'trigo',   name: 'Trigo',   growTime: 6,  value: 2,  seedCost: 0 },
  milho:   { id: 'milho',   name: 'Milho',   growTime: 8,  value: 4,  seedCost: 0 },
  cenoura: { id: 'cenoura', name: 'Cenoura', growTime: 10, value: 7,  seedCost: 0 },
  tomate:  { id: 'tomate',  name: 'Tomate',  growTime: 12, value: 11, seedCost: 0 }
};
```

Balanceamento de partida: com a grade 6×6 (36 células), raio 1,5 e ciclo de 1 s, cada ferramenta cobre cerca de 7 células por ciclo. Em 30 s dá para semear, aguar e colher o campo mais ou menos uma vez e meia com trigo (cerca de 70 a 100 moedas por dia). A primeira compra (20 moedas) deve ser possível já ao fim do dia 1.

## 13. Save, áudio e efeitos

**Save** (`Save.js`): uma chave, `colheita-infinita:save`, com `{ v: 1, day, money, owned: [ids], best: { earned, day } }`. Leitura e escrita dentro de `try/catch` (modo privado ou cota cheia não podem travar o jogo). Salva ao fechar o resumo, a cada compra e em `exit:confirm` (código síncrono). Ids de habilidade que não existem mais são ignorados na leitura, para a árvore poder ser editada sem invalidar saves. O dia em andamento não é salvo: ao voltar, recomeça o dia atual.

**Áudio:** copie `Audio.js`, `Sfx.js` e `Synth.js` do Defesa do Castelo e troque o prefixo da chave para `colheita-infinita:audio`. Eventos de som: `plant`, `water`, `harvest`, `coin` (a cada número do resumo), `tick` (5 s finais), `dayEnd`, `unlock`, `click`. Na v1 todos podem sair do `Synth.js`. `Sound.setExternalMute` é o que anúncio e popup de saída usam (seção 3.3).

**Efeitos (`Vfx.js`):** pequenos cubos coloridos como partículas (combinam com o low poly): terra ao semear, gotas ao aguar, folhas ao colher. Um **único** número flutuante por ciclo de colheita com o valor total (evita poluição quando 9 células são colhidas de uma vez). Sacudida leve da câmera desligada em `prefers-reduced-motion`.

## 14. Desempenho, celular e acessibilidade

| Item | Regra |
| --- | --- |
| Chamadas de desenho | Plantas: no máximo (nº de plantas × 5 estágios × malhas por estágio) `InstancedMesh`; solo: 1; chão: 1. Meta: menos de 60 chamadas por quadro. |
| Qualidade | Flag `low` (celular de entrada ou `(pointer: coarse)` com tela pequena): sem sombra, `pixelRatio` 1,5, sem antialias. |
| Peso | Meta de `approxDownloadMB` ≤ 4 (modelos < 80 KB cada, ícones < 12 KB). Three.js e fontes vêm de CDN. |
| Toque | `touch-action: none` no canvas; `overscroll-behavior: none` e `user-select: none` no `body`; `-webkit-touch-callout: none`. Nada depende de hover. Alvos de toque ≥ 44 px. |
| Áreas seguras | `env(safe-area-inset-*)` no HUD, no botão inferior e no rodapé da árvore. |
| iPhone | Sem tela cheia (o SDK esconde o botão): o jogo não depende dela. |
| Mudança de tela | `resize`, `orientationchange` e `fullscreen:change` refazem renderer, câmera e posição do anel. |
| Movimento | `prefers-reduced-motion`: sem pop de crescimento, sem pulso do anel, árvore sem animação de nascimento. |
| Contraste e foco | Texto e botões pelas variáveis do tema; `outline: var(--foco)` em todo controle; rótulos `aria-label` em português. |

## 15. Checklist de conformidade com o manifesto K101

**Estrutura (9.1)**

- [ ] Pasta `jogos/colheita-infinita/` e `index.html` já mostrando o carregamento.
- [ ] `game.json` válido; `cover.webp` (640×360), `icon.webp` (256×256) e `prints/` com 2 a 8 imagens 1280×720.
- [ ] Caminhos relativos (exceto `/shared/...`); nomes de arquivo idênticos aos `import`s.
- [ ] Funciona sem o SDK (`window.K101?.…` em tudo).

**Menu flutuante e saída (9.3)**

- [ ] Nada importante no centro superior; `var(--k101-safe-top)` no HUD e na contagem.
- [ ] Nenhum `z-index` acima de `2147483000`.
- [ ] `exit:open` pausa e silencia; `exit:cancel` restaura o áudio e mantém pausado; `exit:confirm` só com código síncrono.
- [ ] Pausa de anúncio e de saída coexistem (`muteSources`).
- [ ] `if (window.K101?.blocked) return;` no loop; sem popup de saída próprio; sem `location.href` para sair.
- [ ] `fullscreen:change` refaz o tamanho do canvas.

**Anúncios (9.4)**

- [ ] Ouve `ad:start`/`ad:end`; anúncio de entrada só depois do toque em Jogar/Continuar.
- [ ] Faixas fixas para `loading` e `end-screen`; nenhuma sobre HUD, árvore ou botões de ação.

**Convivência (9.5)**

- [ ] Todas as chaves do `localStorage` começam com `colheita-infinita:`.
- [ ] Three.js `0.160.0` fixo; sem `latest`.
- [ ] Interface sem cores escritas à mão: só variáveis do `tema.css`.
- [ ] Toque com um dedo, sem hover obrigatório, área segura respeitada; áudio, vibração e tela cheia são opcionais.

## 16. Plano de execução (marcos)

Use **modelos provisórios** no começo: em desenvolvimento, se um `.glb` não existir, `loadCropModels` gera 5 caixas coloridas de alturas crescentes com os mesmos nós `stage_1..5`. Assim a programação não espera a arte.

| Marco | Entrega | Pronto quando |
| --- | --- | --- |
| **M0** | Pasta do jogo, `index.html`, `game.json` (`draft`), SDK, carregamento e título. | O link `/jogos/colheita-infinita/` abre, mostra a barra e o menu da plataforma funciona. |
| **M1** | Cena: câmera encaixada, solo instanciado, plantas provisórias, `Debug.js`. | A grade aparece centrada em PC e celular (retrato e paisagem). |
| **M2** | `Grid`, ferramentas, ciclo, anel com carregamento, `Input` de PC. | Semear, aguar e colher funcionam com mouse, clicando ou segurando, respeitando o ciclo. |
| **M3** | Menu radial de PC, toque, botão inferior e leque no celular. | Troca de ferramenta nos dois modos, sem disparo acidental. |
| **M4** | Relógio do dia, HUD, resumo, dinheiro, pausa e `installPlatform()`. | Um dia completo termina no resumo; popup de saída pausa e silencia. |
| **M5** | `Skills.js`, `Stats.js`, `SkillTree.js`, validador, save. | A árvore nasce só com a raiz, cresce a cada compra e os efeitos mudam o dia seguinte. |
| **M6** | Modelos `.glb` reais (e validador), ícones, áudio, partículas, polimento. | `check-glb.mjs` sem erros e 60 fps em celular médio. |
| **M7** | `cover`, `icon`, `prints/`, anúncios de entrada, `status: published`, `make-catalog.mjs`. | Passa pelo checklist da seção 15 e pelos testes abaixo. |

Testes de aceitação (M7): PC (Chrome e Firefox) e celular (Android Chrome e iPhone Safari); abrir o popup de saída no meio do dia (pausa, **Cancelar** mantém pausado, **Sair** volta ao catálogo); esconder a aba; girar o celular; abrir em aba anônima pelo link direto; DevTools → Rede: o catálogo não baixa nada do jogo.

## 17. Pendências e ideias para as próximas versões

- **Decisões em aberto:** nome e slug definitivos; se as sementes passarão a ter custo; se o campo deve manter as plantas entre dias (hoje ele zera); se o menu radial deve deixar o tempo em câmera lenta.
- **Assets a produzir:** 4 plantas iniciais (`trigo`, `milho`, `cenoura`, `tomate`) com 5 estágios cada; ícones de plantas, ferramentas e habilidades; `cover`, `icon` e `prints/`; logo (`/shared/img/logo-icone.svg`, já usada pelo menu).
- **Atualizar o documento da plataforma** com `checkEntryAd()`, `ads.slot` ausente e a emissão de `ad:start`/`ad:end` (seção 3.5 deste documento).
- **Ideias futuras:** *rewarded* para dobrar a colheita; eventos do dia (chuva que rega sozinha, praga); novas ferramentas (adubo, espantalho); ajudantes automáticos desbloqueáveis; cenário decorativo que evolui com a fazenda; ranking de melhor dia.
