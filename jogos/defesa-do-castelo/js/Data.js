/* ==========================================================================
   Data.js — somente configuração. Sem classes, sem Three.js.
   "O que existe?"

   Campos opcionais de cada modelo (ajuste aqui, sem mexer no código):
     scale     → escala aplicada ao seu .glb (padrão 1)
     yOffset   → sobe/desce o modelo (padrão 0)
     rotationY → gira o modelo em radianos, se ele não olhar para +Z (padrão 0)
     fallback  → forma simples usada enquanto o .glb não existir (graybox)

   Campo opcional das TORRES:
     upgrades: [ {cost, damage, range, cooldown, splash, ...}, ... ]
        → uma entrada por evolução (4 evoluções = 5 níveis no total).
          `cost` é o preço de ESSA evolução; os demais campos são os NOVOS valores
          absolutos do nível (o que não aparecer fica como estava).
          Campos aceitos: damage, range, cooldown, splash, maxPerTarget, projectileSpeed, slow, slowDuration.
          Em torres com `splash` (canhão), `damage` é o dano TOTAL do tiro, repartido do inimigo mais
          perto da torre para o mais longe; `maxPerTarget` é o máximo que o tiro tira de CADA inimigo
          (0 ou ausente = sem limite). O que sobrar depois de todos atingidos é descartado.
        Modelo por nível (opcional): `model: "arquivo.glb"` (em assets/models/structures/)
          troca o .glb da torre ao chegar nesse nível; vale também para os níveis seguintes
          até outro `model` aparecer. Também aceita scale, yOffset, rotationY e fallback
          (o que não for informado volta ao padrão: scale 1, yOffset 0, rotationY 0).
          SEM `model`, a torre continua no mesmo .glb e só cresce (GAME_CONFIG.upgradeGrowth por nível).
     threat: { weight } → "peso" da construção para o caminho dos inimigos.
        O raio de influência é automático: o mesmo alcance da torre (combat.range).
        weight = custo extra máximo (junto da torre); cai até 0 na borda do alcance.
                 Uma célula comum custa 1, então weight 2 = "passar colado custa 3x".
                 0 ou sem o campo = o inimigo ignora a torre; negativo = atrai.

                 Se o modelo novo ficar grande ou pequeno demais, ajuste no próprio item:

                js
                { model: "tower_archer_lv5.glb", scale: 1.2, yOffset: 0, rotationY: 0, cost: 260, ... }
                scale: tamanho do modelo.
                yOffset: sobe ou desce o modelo.
                rotationY: gira o modelo, se ele não olhar para a frente.

   VIDA DAS CONSTRUÇÕES (torres e muros): `health` no item; cada evolução pode trazer um novo `health`
   (valor absoluto do nível). Os inimigos quebram construções.
   REPARO: custo = (tudo que foi investido na construção) × repairRate × (fração de vida que falta).
   Ou seja, `repairRate` é o preço de um reparo de 0% → 100% como fração do investido
   (0.4 = 40%). Padrão em GAME_CONFIG.repairRate; cada construção pode ter o seu `repairRate`.

   COMPORTAMENTO DOS INIMIGOS contra construções (campos em ENEMIES):
     structurePreference → 0 a 1.
        0   = ignora construções; só quebra o que BLOQUEIA o melhor caminho (e só se for mais barato que desviar).
        0.5 = ataca torres que estiverem perto dele, priorizando as mais relevantes para o caminho.
        1   = "caçador": vai atrás de torres de qualquer distância (as mais relevantes primeiro)
              e só depois segue para o castelo.
        MUROS nunca são alvo por si só: só são quebrados quando atrapalham o caminho (até o castelo ou
        até uma torre-alvo) e quebrar compensa mais do que desviar.
     attack.structureDamage → dano por golpe contra construções (padrão = attack.damage).

   MINA (campo `mining: { amount, interval }`): não ataca; a cada `interval` segundos entrega `amount` moedas.
   Cada evolução pode trazer novos `amount` e/ou `interval` (valores absolutos do nível), além de cost/health/model.
   A produção só começa depois da obra e continua durante as ondas.

   BARRIL DE PÓLVORA (campos `hidden: true` e `trap: { damage, radius, triggerRadius }`): armadilha de uso único.
   Os inimigos não a enxergam: ela nunca é alvo, não pesa no caminho (`threat`) e não bloqueia a passagem.
   Quando um inimigo chega a `triggerRadius` (unidades 3D) do barril, ele explode: `damage` para todo inimigo
   dentro de `radius` (mesma animação de explosão do canhão) e o barril some, sem reembolso.
   O barril só fica armado depois da obra.

   INIMIGOS E ONDAS INFINITAS: as ondas não são mais escritas à mão; o WaveSystem (Systems.js) monta cada
   onda sozinho a partir de ENEMIES. Os inimigos são ordenados do mais fraco ao mais forte (nível 1, 2, 3…)
   pelo campo `tier` (menor = mais fraco; opcional: sem ele vale a `health`). Dentro da onda, a ordem de nascimento é aleatória. Basta acrescentar
   um inimigo novo em ENEMIES para ele entrar na conta. Os números ficam em ENDLESS (mais abaixo).

   TORRE DE RESTAURAÇÃO (campo `heal: { range, amount, interval }`): não ataca. Liga um laser contínuo na construção
   mais ferida dentro de `range` (a de menor fração de vida tem prioridade) e, a cada `interval` segundos, devolve
   `amount` de vida a ela. Cada evolução traz novos `healRange`, `healAmount` e/ou `healInterval` (valores absolutos
   do nível): mais vida por pulso, em pulsos mais rápidos e com mais alcance. Cura por segundo = amount ÷ interval.
   A torre não cura a si mesma.
   SUPERAQUECIMENTO: a torre tem uma barra de energia (0 a 1). Curando, ela gasta energia: `duration` = segundos
   de cura contínua a partir da energia cheia. Sem alvo (em repouso) ou superaquecida, ela recupera: `recharge` =
   segundos para ir de 0 a 100%. Zerou a energia = superaquece: o laser desliga e só volta quando a energia chegar a
   `resume` (fração 0-1). Em repouso a energia sobe mesmo sem ter esgotado. Abaixo de 30% o laser vai ficando transparente.
   `color` = cor do laser no nível. Evoluções: healDuration, healRecharge, healColor.

   TEMPO DE OBRA: toda construção leva `buildTime` segundos para ficar pronta (padrão em GAME_CONFIG.buildTime;
   cada item de TOWERS pode ter o seu). Durante a obra ela aparece com andaime, não ataca, não evolui
   e os muros ainda não se ligam. 0 = constrói na hora. As animações ficam em Vfx.js.
   ESCOMBROS: ao desabar, os pedaços usam as cores do modelo. Se o seu .glb usa textura (cor lida = branca),
   defina no item `debrisColors: [0x8e949b, 0x6d5a45]` para escolher as cores.
   ========================================================================== */

const withIds = (obj) => {
  for (const [key, value] of Object.entries(obj)) value.id = key;
  return obj;
};

export const GAME_CONFIG = {
  startCoins: 500,
  refundRate: 0.5,                   // fração do custo devolvida ao demolir uma construção
  repairRate: 0.4,                   // preço de reparar 100% da vida, como fração do investido (veja o topo do arquivo)
  upgradeGrowth: 0.06,               // quanto a torre cresce por nível quando a evolução NÃO tem .glb próprio (6%)
  undoLimit: 4,                      // quantas construções AINDA EM OBRA podem ser desfeitas (reembolso total)
  buildTime: 4,                      // segundos de obra de uma construção nova (cada item de TOWERS pode ter o seu `buildTime`)

  // Vibração (celulares com suporte; iPhone/Safari não suporta). vibrate = ms, ou [vibra, pausa, vibra, ...].
  // minGap = intervalo mínimo (ms) entre duas vibrações do mesmo tipo.
  haptics: {
    enabled: true,
    patterns: {
      tap:             { vibrate: 12 },                              // qualquer botão
      cell:            { vibrate: 10 },                              // trocar de célula ao arrastar uma construção
      castleHit:       { vibrate: [70, 40, 110], minGap: 400 },      // castelo levando dano
      castleDestroyed: { vibrate: [150, 60, 150, 60, 350] }          // castelo destruído
    }
  },
  castleHealth: 100,

  // ÁREA DE CONSTRUÇÃO: só dá para construir até `buildRadius` células (raio) de distância do castelo
  // ou de qualquer construção já existente. A área cresce conforme o jogador constrói.
  buildRadius: 4,

  // RENDA DO CASTELO: o castelo gera moedas sozinho, bem menos que uma mina (nível 1 = 10 moedas / 6 s).
  // É a rede de segurança: mesmo sem moedas e sem minas, o jogador acaba juntando o suficiente para comprar uma torre.
  //   amount   → moedas por entrega
  //   interval → segundos entre entregas (2 a cada 4 s = 0,5 moeda/s: uma torre de 100 em ~3 min)
  castleIncome: { amount: 2, interval: 4 },

  // TORRE DE RESTAURAÇÃO — estabilidade do laser:
  //   linger → segundos que o laser continua ligado numa construção que foi atacada há pouco, mesmo com a vida cheia.
  //            Evita o liga/desliga quando o inimigo bate, a torre cura, a vida enche e o inimigo bate de novo.
  //            Durante a espera a energia não gasta nem recarrega; ela só gasta quando há vida para curar.
  healer: { linger: 2.5 },

  // Ondas automáticas: a 1ª começa após firstWaveDelay (tempo extra para o jogador montar a defesa).
  // As seguintes esperam firstDelay + delayStep × número da onda (8s, 9s, 10s…).
  // Nos últimos countdownFrom segundos aparece 3, 2, 1.
  // maxDelay = teto da espera entre ondas (sem ele a espera cresceria para sempre nas ondas infinitas).
  waveTiming: { firstWaveDelay: 20, firstDelay: 7, delayStep: 1, maxDelay: 20, countdownFrom: 3 },
  cellSize: 2,                       // tamanho de uma célula em unidades 3D

  // Escala GLOBAL por categoria, aplicada por cima do `scale` de cada modelo (1 = tamanho original).
  // Diminua para um visual menos poluído; só muda o desenho: alcance, colisão e jogabilidade não mudam.
  // O castelo fica fora (veja GAME_CONFIG.castle.scale para ele).
  modelScale: { enemies: 0.75, structures: 0.8 },

  // COLISÃO ENTRE INIMIGOS: eles se empurram para não ficarem empilhados no mesmo ponto.
  //   radius          → raio do "corpo" (unidades 3D). 0.5 = diâmetro 1 → cabem ~4 inimigos numa célula de 2×2.
  //                     Cada inimigo pode ter o seu em ENEMIES (campo `collisionRadius`).
  //   iterations      → passadas de correção por frame (mais = multidão mais firme, custa um pouco mais).
  //   strength        → fração da sobreposição corrigida por passada (0 a 1; menor = mais macio).
  //   maxPush         → velocidade máxima do empurrão (unidades/s); evita tremedeira e "teleporte".
  //   stationaryShare → quanto quem está atacando cede ao ser empurrado (0 = nunca sai do lugar, 1 = igual a quem anda).
  //   laneJitter      → variação lateral (± metade disto) da linha de cada inimigo; pequena = fila indiana, grande = bando.
  //   maxReach        → alcance máximo de golpe, medido até a BORDA do alvo (unidades 3D). 1 célula = 2, então
  //                     1.6 = só encostado (inclusive na diagonal). O alcance do inimigo (attack.range) nunca passa disso.
  //   queueReach      → alcance EXTRA, em células, de quem está na fila (0 = sem bônus; recomendado).
  //   flankDelay      → s que um inimigo fica na fila, sem alcance, antes de procurar outro lado do alvo para atacar.
  // ALVOS: quantos inimigos podem atacar a MESMA construção ao mesmo tempo (torres, minas E muros no caminho).
  // Quem sobra vai para o 2º melhor alvo, depois o 3º… ou, se a construção é um muro no caminho, procura outro
  // trecho para atravessar (sem alvo livre, segue para o castelo; o castelo não tem limite).
  //   maxPerTarget → máximo de inimigos por construção (grupo de rota tem 5: use 5 para o grupo inteiro ir ao mesmo alvo).
  //   crowdCost    → custo extra (em "células") por inimigo que já ataca uma construção, na hora de traçar o caminho:
  //                  quanto maior, mais cedo os inimigos desviam para outro trecho de muro.
  //   groupBonus   → multiplicador na nota de um alvo que colegas do MESMO grupo já escolheram (1 = sem efeito).
  targeting: { maxPerTarget: 4, groupBonus: 1.5, crowdCost: 3 },
  collision: { enabled: true, radius: 0.5, iterations: 2, strength: 0.6, maxPush: 5, stationaryShare: 0.15, laneJitter: 0.2, maxReach: 1.6, queueReach: 0, flankDelay: 0.5 },
  defaultMap: "meadow",

  // Moldura decorativa ao redor do mapa: células com objetos que não dá para atravessar (só visual),
  // para o jogador nunca ver o "fim" do mundo ao diminuir o zoom ou arrastar a câmera.
  //   cells         → quantas células de moldura em cada lado (aumente se ainda aparecer o fundo liso)
  //   densityNear   → chance (0 a 1) de uma célula colada no mapa ter objeto
  //   densityFar    → chance nas células mais distantes (a densidade sobe suavemente até aqui)
  //   weights       → proporção entre os tipos (chaves de GAME_CONFIG.environment)
  //   seed          → mesmo número = mesma moldura sempre; mude para sortear outra
  //   height        → RELEVO: a moldura vira colinas/montanhas, bem mais alta que o chão jogável
  //     firstStep   → altura só da 1ª fileira, colada no mapa (o degrau que marca o limite)
  //     edge        → altura de onde a subida começa (2ª fileira em diante)
  //     peak        → altura nas fileiras mais distantes
  //     jitter      → irregularidade do relevo (0 = degraus certinhos)
  //     frontScale  → multiplica a altura do lado de baixo (perto da câmera) para não esconder o mapa; 1 = igual
  //     treeLine    → acima dessa fração da altura máxima só há pedras (0 a 1)
  //     snowLine    → a partir dessa fração o topo fica com neve (0 a 1; 1 = sem neve)
  mapBorder: {
    enabled: true,
    cells: 16,
    densityNear: 0.45,
    densityFar: 0.85,
    weights: { tree: 0.6, rock: 0.2, bush: 0.2 },
    seed: 1234,
    height: { firstStep: 0.65, edge: 1.1, peak: 7, jitter: 0.5, frontScale: 0.55, treeLine: 0.6, snowLine: 0.8 }
  },

  // Cristal da torre de restauração: objeto do modelo (.glb ou graybox) cujo nome contém `name`. O Scene.js controla
  // SÓ a rotação, o tamanho e a transparência dele, de acordo com a energia da torre (some enquanto superaquecida).
  crystal: {
    name: "cristal",    // trecho do nome do objeto no .glb (maiúsculas/minúsculas não importam)
    spin: 1.4,          // rad/s: rotação infinita em torno do eixo Y local do cristal
    wobble: 0.14,       // rad: inclinação que oscila (efeito de gravitar)
    bob: 0.07,          // altura (unidades do modelo) da flutuação para cima e para baixo
    bobSpeed: 2.0,      // rad/s da flutuação
    minScale: 0.35,     // tamanho com energia perto de 0 (energia 100% = tamanho original do modelo)
    minOpacity: 0.3,    // opacidade com energia perto de 0 (energia 100% = opaco)
    fade: 7             // velocidade de aparecer/sumir (maior = mais rápido)
  },

  paths: {
    models: "assets/models/",        // + categoria/arquivo.glb
    icons: "assets/icons/",          // ícones opcionais dos cards
    buildIcon: "icon_build.webp"      // ícone do botão redondo de construções (assets/icons/); sem ele aparece "F"
  },

  castle: {
    model: "castle_main.glb",        // assets/models/structures/
    scale: 1, yOffset: 0, rotationY: 0,
    fallback: { shape: "castle" }
  },

  // assets/models/environment/
  environment: {
    tree:      { model: "environment_tree.glb",       scale: 1, yOffset: 0, fallback: { shape: "tree" } },
    rock:      { model: "environment_rock.glb",       scale: 1, yOffset: 0, fallback: { shape: "rock" } },
    bush:      { model: "environment_bush.glb",       scale: 1, yOffset: 0, fallback: { shape: "bush" } },
    bridge:    { model: "environment_bridge.glb",     scale: 1, yOffset: 0, fallback: { shape: "bridge" } },
    waterEdge: { model: "environment_water_edge.glb", scale: 1, yOffset: 0, fallback: { shape: "none" } }
  },

  // assets/models/effects/
  effects: {
    arrow:     { model: "fx_arrow.glb",             scale: 1, fallback: { shape: "arrow" } },
    cannon:    { model: "fx_cannon_projectile.glb", scale: 1, fallback: { shape: "cannonball" } },
    explosion: { model: "fx_explosion.glb",         scale: 1, duration: 0.55, fallback: { shape: "explosion" } },
    hit:       { model: "fx_hit.glb",               scale: 1, duration: 0.22, fallback: { shape: "hit" } }
  }
};

// assets/models/enemies/
export const ENEMIES = withIds({
  goblin: {
    name: "Goblin",
    tier: 2,
    model: "enemy_goblin.glb",
    health: 100,
    speed: 2.2,
    reward: 10,
    barHeight: 1.5,
    attack: { damage: 4, structureDamage: 6, range: 1.2, cooldown: 1 },
    structurePreference: 0.2,
    fallback: { shape: "capsule", color: 0x6aa84f, radius: 0.3, height: 0.95 }
  },
  goblin_runner: {
    name: "Goblin Corredor",
    tier: 1,                             // nível nas ondas infinitas (1 = mais fraco; veja ENDLESS)
    model: "enemy_goblin_runner.glb",
    health: 65,
    speed: 4.2,
    reward: 10,
    barHeight: 1.3,
    attack: { damage: 1, structureDamage: 3, range: 3, cooldown: 0.8 },
    structurePreference: 0,
    fallback: { shape: "capsule", color: 0xc9d94a, radius: 0.24, height: 0.8 }
  },
  orc: {
    name: "Orc",
    tier: 3,
    model: "enemy_orc.glb",
    health: 250,
    speed: 1.3,
    reward: 15,
    barHeight: 2.1,
    attack: { damage: 12, structureDamage: 25, range: 1.5, cooldown: 1.2 },
    structurePreference: 0.6,
    fallback: { shape: "capsule", color: 0x4d6b3a, radius: 0.5, height: 1.55 }
  },
  orc2: {
    name: "Orc2",
    tier: 4,
    model: "enemy_orc.glb",
    health: 400,
    speed: 1.3,
    reward: 20,
    barHeight: 2.1,
    attack: { damage: 12, structureDamage: 30, range: 1.5, cooldown: 1.2 },
    structurePreference: 1,
    fallback: { shape: "capsule", color: 0x4d6bff, radius: 0.6, height: 1.55 }
  },
  // ---- tiers 5 a 10: cada um é mais difícil de matar que o anterior (vida × velocidade cresce a cada tier) ----
  troll: {
    name: "Troll",
    tier: 5,
    model: "enemy_troll.glb",
    health: 650,
    speed: 1.5,
    reward: 28,
    barHeight: 2.4,
    attack: { damage: 18, structureDamage: 40, range: 1.8, cooldown: 1.2 },
    structurePreference: 0.7,
    fallback: { shape: "capsule", color: 0x7a6a8a, radius: 0.62, height: 1.8 }
  },
  lobo_sombrio: {                        // rápido E resistente: passa pelo fogo das torres em pouco tempo
    name: "Lobo Sombrio",
    tier: 6,
    model: "enemy_dire_wolf.glb",
    health: 700,
    speed: 2.6,
    reward: 36,
    barHeight: 1.6,
    attack: { damage: 10, structureDamage: 22, range: 1.4, cooldown: 0.7 },
    structurePreference: 0.3,
    fallback: { shape: "capsule", color: 0x3b3f4a, radius: 0.42, height: 1.0 }
  },
  ogro: {
    name: "Ogro",
    tier: 7,
    model: "enemy_ogre.glb",
    health: 1700,
    speed: 1.3,
    reward: 50,
    barHeight: 2.8,
    attack: { damage: 30, structureDamage: 80, range: 2.0, cooldown: 1.6 },
    structurePreference: 1,              // caçador: vai atrás das torres
    fallback: { shape: "capsule", color: 0x9a6b3d, radius: 0.8, height: 2.1 }
  },
  cavaleiro_negro: {
    name: "Cavaleiro Negro",
    tier: 8,
    model: "enemy_black_knight.glb",
    health: 2200,
    speed: 1.9,
    reward: 70,
    barHeight: 2.5,
    attack: { damage: 28, structureDamage: 55, range: 1.6, cooldown: 1.0 },
    structurePreference: 0.5,
    fallback: { shape: "capsule", color: 0x23262e, radius: 0.55, height: 1.7 }
  },
  golem: {                               // lento, enorme e devastador contra construções
    name: "Golem",
    tier: 9,
    model: "enemy_golem.glb",
    health: 4800,
    speed: 1.1,
    reward: 100,
    barHeight: 3.2,
    attack: { damage: 45, structureDamage: 160, range: 2.2, cooldown: 2.0 },
    structurePreference: 1,
    fallback: { shape: "capsule", color: 0x8a8f99, radius: 1.0, height: 2.6 }
  },
  senhor_da_guerra: {
    name: "Senhor da Guerra",
    tier: 10,
    model: "enemy_warlord.glb",
    health: 7000,
    speed: 1.6,
    reward: 150,
    barHeight: 3.4,
    attack: { damage: 60, structureDamage: 120, range: 2.5, cooldown: 1.2 },
    structurePreference: 0.8,
    fallback: { shape: "capsule", color: 0x8c1c24, radius: 0.85, height: 2.4 }
  }
});

// assets/models/structures/
export const TOWERS = withIds({
  archer: {
    name: "Torre de Arqueiro",
    model: "Torre_Nv1.glb",
    icon: "icon_tower_archer.webp",   // opcional: assets/icons/
    cost: 100,
    buildTime: 4,                        // segundos de obra
    health: 100,
    repairRate: 0.4,                     // reparo total = 40% do investido (ex.: 40 moedas no nível 1)
    footprint: { width: 1, height: 1 },
    muzzleHeight: 2.6,
    threat: { weight: 2 },               // ← peso da Torre de Arqueiro
    upgrades: [                          // níveis 2 a 5
      // model: "tower_archer_lv2.glb",   ← opcional: modelo deste nível (veja o topo do arquivo)
      { model: "Torre_Nv2.glb",cost: 200,  damage: 30, range: 8.0, cooldown: 0.60, health: 150 },
      { model: "Torre_Nv3.glb",cost: 500, damage: 45, range: 8.5, cooldown: 0.45, health: 300 },
      { model: "Torre_Nv4.glb",cost: 1500, damage: 95, range: 9.0, cooldown: 0.35, health: 450 },
      { model: "Torre_Nv5.glb",cost: 2500, damage: 130, range: 10, cooldown: 0.25, health: 600 }
    ],
    fallback: { shape: "archerTower" },
    combat: { damage: 15, range: 7.5, cooldown: 0.7, projectile: "arrow", projectileSpeed: 22, splash: 0, arc: 0.3 }
  },
  cannon: {
    name: "Canhão",
    model: "Canhao_Nv1.glb",
    icon: "icon_tower_cannon.webp",
    cost: 300,
    buildTime: 6,
    health: 100,
    repairRate: 0.4,
    footprint: { width: 1, height: 1 },
    muzzleHeight: 1.3,
    threat: { weight: 4 },               // ← peso do Canhão
    upgrades: [                          // níveis 2 a 5
      // model: "tower_cannon_lv2.glb",   ← opcional: modelo deste nível
      { model: "Canhao_Nv2.glb", cost: 500, damage: 250,  maxPerTarget: 50,  range: 6.8, cooldown: 2.0, splash: 2.6, health: 150 },
      { model: "Canhao_Nv3.glb",cost: 1000, damage: 375,  maxPerTarget: 75,  range: 7.1, cooldown: 1.9, splash: 2.8, health: 300 },
      { model: "Canhao_Nv4.glb",cost: 2000, damage: 875, maxPerTarget: 175, range: 7.4, cooldown: 1.8, splash: 3.0, health: 450 },
      { model: "Canhao_Nv5.glb",cost: 3500, damage: 1250, maxPerTarget: 250, range: 7.8, cooldown: 1.2, splash: 3.2, health: 600 }
    ],
    fallback: { shape: "cannon" },
    combat: { damage: 225, maxPerTarget: 45, range: 6.5, cooldown: 2.1, projectile: "cannon", projectileSpeed: 11, splash: 2.4, arc: 2.2 }
  },

  // MURO: não tem `combat`, então não ataca. O campo `wall` faz o muro se ligar aos muros vizinhos
  // (as 8 células ao redor, inclusive diagonais) com um segmento entre os dois postes.
  //   model → o poste (1 por célula).  wall.link → o segmento entre dois postes.
  //   wall.link.model (opcional) → .glb do segmento em assets/models/structures/. Modele com 1 célula
  //     (2 unidades) de comprimento ao longo do eixo +Z; ele é esticado para o tamanho real da ligação
  //     (use modelLength se o seu .glb tiver outro comprimento).
  //   wall.link.fallback → cor/altura/espessura do segmento enquanto o .glb não existir.
  // EVOLUÇÕES: cada entrada de `upgrades` aceita, além de cost/health:
  //   model: "arquivo.glb"  → novo modelo do POSTE neste nível (vale para os próximos até outro aparecer);
  //   link: { model, fallback: {...}, scale, modelLength } → novo visual do SEGMENTO (o par usa o visual
  //     do muro de menor nível entre os dois);
  //   fallback: { shape: "wallPost", color } → cor do poste no graybox (sem .glb).
  wall: {
    name: "Muro",
    description: "Não ataca. Liga-se aos muros vizinhos.",
    model: "Muro_Nv1.glb",
    icon: "icon_tower_wall.webp",
    cost: 35,
    buildTime: 1.5,                      // muros ficam prontos rápido
    health: 70,
    repairRate: 0.3,                     // muros são mais baratos de reparar
    footprint: { width: 1, height: 1 },
    muzzleHeight: 1.4,                   // posiciona o menu de contexto e a barra de vida
    fallback: { shape: "wallPost", color: 0x8e949b },
    wall: {
      link: {
        model: "wall_segment.glb",
        scale: 1, modelLength: 2,
        fallback: { color: 0x8e949b, height: 1.0, thickness: 0.55 }
      }
    },
    upgrades: [                          // níveis 2 a 5
      // model: "tower_wall_lv2.glb", link: { model: "wall_segment_lv2.glb" },   ← opcional
      { model: "Muro_Nv2.glb",cost: 25, health: 100,  fallback: { shape: "wallPost", color: 0x98a8a0 }, link: {model: "wall_segment2.glb", fallback: { color: 0x98a8a0, height: 1.05, thickness: 0.58 } } },
      { model: "Muro_Nv3.glb",cost: 50, health: 150,  fallback: { shape: "wallPost", color: 0x7f9fc4 }, link: {model: "wall_segment3.glb", fallback: { color: 0x7f9fc4, height: 1.1,  thickness: 0.62 } } },
      { model: "Muro_Nv4.glb",cost: 100, health: 250,  fallback: { shape: "wallPost", color: 0x9b7fc4 }, link: {model: "wall_segment4.glb", fallback: { color: 0x9b7fc4, height: 1.15, thickness: 0.66 } } },
      { model: "Muro_Nv5.glb",cost: 120, health: 400, fallback: { shape: "wallPost", color: 0xc9a64a }, link: {model: "wall_segment5.glb", fallback: { color: 0xc9a64a, height: 1.2,  thickness: 0.7 } } }
    ]
  },

  // BARRIL DE PÓLVORA: não tem `combat` nem `threat`. `hidden` o torna invisível para a IA dos inimigos;
  // `trap` define a explosão (uso único). Modelo opcional: assets/models/structures/Barril_Nv1.glb.
  barrel: {
    name: "Barril de Pólvora",
    description: "Armadilha oculta: explode uma vez quando um inimigo chega perto.",
    model: "Barril_Nv1.glb",
    icon: "icon_tower_barrel.webp",
    cost: 150,
    buildTime: 2,
    health: 30,
    footprint: { width: 1, height: 1 },
    muzzleHeight: 1.0,
    hidden: true,                          // os inimigos não o encontram, não o atacam e passam por cima
    trap: { damage: 220, radius: 3.4, triggerRadius: 1.1 },
    fallback: { shape: "barrel" }
  },

  // TORRE DE RESTAURAÇÃO: não tem `combat`. `heal` define alcance (unidades 3D), vida por pulso e segundos entre pulsos.
  // Modelos opcionais em assets/models/structures/ (Restauracao_Nv1.glb … Restauracao_Nv5.glb).
  restorer: {
    name: "Torre de Restauração",
    description: "Não ataca. Laser que cura a construção mais ferida ao alcance.",
    model: "Restauracao_Nv1.glb",
    icon: "icon_tower_restorer.webp",
    cost: 250,
    buildTime: 5,
    health: 80,
    repairRate: 0.4,
    footprint: { width: 1, height: 1 },
    muzzleHeight: 2.4,                   // de onde sai o laser; também posiciona o menu e a barra de vida
    heal: { range: 6, amount: 3, interval: 0.5, duration: 8, recharge: 12, resume: 0.5, color: 0x57d98a },   // nível 1: 6 vida/s, 8 s de cura, 12 s para recarregar
    fallback: { shape: "restorer", color: 0x57d98a },
    upgrades: [                          // níveis 2 a 5
      { model: "Restauracao_Nv2.glb", cost: 300,  health: 120, healRange: 7,  healAmount: 5,  healInterval: 0.45, healDuration: 10, healRecharge: 10, healColor: 0x6fe3a0, fallback: { shape: "restorer", color: 0x6fe3a0 } },   // ≈ 11 vida/s
      { model: "Restauracao_Nv3.glb", cost: 700,  health: 200, healRange: 8,  healAmount: 8,  healInterval: 0.40, healDuration: 13, healRecharge: 8, healColor: 0x5ec8ff, fallback: { shape: "restorer", color: 0x5ec8ff } },   // 20 vida/s
      { model: "Restauracao_Nv4.glb", cost: 1500, health: 300, healRange: 9,  healAmount: 12, healInterval: 0.30, healDuration: 17, healRecharge: 6, healColor: 0xffc83d , fallback: { shape: "restorer", color: 0xffc83d } },   // 40 vida/s
      { model: "Restauracao_Nv5.glb", cost: 2800, health: 450, healRange: 10, healAmount: 18, healInterval: 0.25, healDuration: 24, healRecharge: 4, healColor: 0xc77dff, fallback: { shape: "restorer", color: 0xc77dff  } }    // 72 vida/s
    ]
  },

  // MINA: não tem `combat`; só gera moedas. mining.amount = moedas por entrega, mining.interval = segundos entre entregas.
  // Modelos opcionais em assets/models/structures/ (Mina_Nv1.glb … Mina_Nv5.glb) e ícone em assets/icons/.
  mine: {
    name: "Mina",
    description: "Não ataca. Produz moedas de tempo em tempo.",
    model: "Mina_Nv1.glb",
    icon: "icon_tower_mine.webp",
    cost: 120,
    buildTime: 5,
    health: 50,
    repairRate: 0.4,
    footprint: { width: 1, height: 1 },
    muzzleHeight: 1.6,                   // posiciona o menu, a barra de vida e o "+moedas"
    mining: { amount: 10, interval: 6 },  // nível 1: ≈ 0,8 moeda/s
    fallback: { shape: "mine", color: 0x8d7b68 },
    upgrades: [                          // níveis 2 a 5
      { model: "Mina_Nv2.glb", cost: 250, health: 75,  amount: 15,  interval: 6, fallback: { shape: "mine", color: 0x9aa0a6 } },
      { model: "Mina_Nv3.glb", cost: 750, health: 150,  amount: 25, interval: 5, fallback: { shape: "mine", color: 0x7f9fc4 } },
      { model: "Mina_Nv4.glb", cost: 1500, health: 300, amount: 35, interval: 5, fallback: { shape: "mine", color: 0x9b7fc4 } },
      { model: "Mina_Nv5.glb", cost: 3000, health: 400, amount: 50, interval: 4, fallback: { shape: "mine", color: 0xc9a64a } }
    ]
  }
});

// ONDAS INFINITAS (o objetivo é sobreviver o máximo de tempo possível).
// Receita da onda n, com os inimigos ordenados do mais fraco (nível 1) ao mais forte:
//   nível 1 → n inimigos
//   nível k → floor((n - 1) / groupSize^(k-1)) inimigos   (k ≥ 2)
// Com groupSize 3: ondas 1-3 = 1, 2, 3 do nível 1; onda 4 = 4×N1 + 1×N2; onda 7 = 7×N1 + 2×N2;
// onda 10 = 10×N1 + 3×N2 + 1×N3; onda 28 = 28×N1 + 9×N2 + 3×N3 + 1×N4 … e assim por diante.
export const ENDLESS = {
  groupSize: 2,                                          // base do ritmo de crescimento: tier k ganha +1 inimigo a cada (groupSize + k) ondas
  tierGap: { first: 2, step: 1 },                        // ondas entre um tier novo e o seguinte: começa em `first` e soma `step` a cada tier (2, 3, 4, 5…)
  spawnInterval: { start: 1, min: 0.1, decay: 0.80 }, // segundos entre inimigos: start × decay^(onda-1), nunca abaixo de min
  bonus: { base: 5, perWave: 2 }                        // moedas ao vencer a onda n: base + perWave × n
};

export const MAPS = {
  meadow: {
    name: "Campina",
    layout: [
      "#RS----------SR#",
      "#---------------",
      "------###@-R-@--",
      "##--##R####@--##",
      "~~B~~~~~~~~~B~~~",
      "#.TT..###@..TT.#",
      "#.TT..@R##..TT.#",
      "#.TT...##...TT.#",
      "#..TT..##..TT..#",
      "#..TT......TT..#",
      "#...TTTTTTTT...#",
      "#..TT......TT..#",
      "#..TT.......TT.#",
      "#..TT.......TT.#",
      "#.TT........TT.#",
      "#.TT........TT.#",
      "#.TT.......TT..#",
      "#..TT.......TT.#",
      "#.TT........TT.#",
      "#.TT........TT.#",
      "#.TT........TT.#",
      "#..TT......TT..#",
      "#...TT....TT...#",
      "#....TTTTTT....#",
      "#......CC......#",
      "#R.....CC.....R#"
    ]
  }
};

/* ==========================================================================
   ÁUDIO — somente configuração (o motor está em Audio.js, a reação aos eventos em Sfx.js).

   Cada som tem um ID (a chave de `sounds`). O ID é também o NOME DO ARQUIVO:
     assets/audio/sfx/arrow_shoot.ogg          (um arquivo)
     assets/audio/sfx/arrow_shoot_1.ogg  _2 _3 (variações: o jogo sorteia uma a cada disparo)
   Rode `node tools/make-audio-manifest.mjs` depois de adicionar/trocar arquivos: ele gera
   assets/audio/manifest.json (a lista que o jogo lê). Sem arquivo, toca a receita `synth`.
   As subpastas não importam; só o nome do arquivo.

   Campos de cada som:
     bus         "sfx" (padrão, mundo do jogo) | "ui" (interface; continua tocando com o jogo pausado)
     gain        volume base (0 a 1+)
     cooldown    ms mínimos entre dois toques do mesmo som (evita metralhadora de sons iguais)
     maxVoices   quantas cópias podem tocar ao mesmo tempo (as extras são ignoradas)
     priority    2 = nunca é cortado pelo limite global de vozes
     alcance     fração do volume mantida com o zoom mais LONGE (0 = some, 1 = igual). Padrão em `foco`
     vary        false = sem variação aleatória de tom/volume (use em sons de interface)
     pitch       [min, max] multiplicador aleatório de tom (padrão em `defaults`)
     synth       receita do som graybox (veja Synth.js)
   ========================================================================== */
export const AUDIO = {
  basePath: "assets/audio/",
  manifest: "manifest.json",
  formats: ["ogg", "mp3", "m4a", "wav"],   // ordem de preferência quando o mesmo som existe em mais de um formato
  volumes: { master: 0.8, sfx: 1, music: 0.5 },   // padrões; o jogador muda no menu de pausa (fica salvo no navegador)
  maxVoices: 40,                                  // limite global de sons simultâneos

  // FOCO / ZOOM: o que está longe do que o jogador olha fica mais baixo.
  //   Com zoom perto, só se ouve bem o que está na tela (o resto some rápido); com zoom longe, tudo na tela
  //   continua audível, porém mais baixo.
  //   queda        → quanto o volume cai do centro (1) até a borda da tela
  //   foraPerto    → velocidade com que o som some depois da borda da tela, com zoom PERTO (maior = some mais rápido)
  //   foraLonge    → o mesmo, com zoom LONGE
  //   alcancePadrao→ fração do volume mantida com o zoom mais longe (0 = some, 1 = não muda).
  //                  Cada som pode ter o seu campo `alcance` (passos: baixo; explosões: alto).
  foco: { queda: 0.3, foraPerto: 2.6, foraLonge: 1.2, alcancePadrao: 0.6 },
  defaults: { cooldown: 0, maxVoices: 8, pitch: [0.94, 1.06], volume: [0.88, 1] },

  // Música: nome da situação → ID do arquivo em assets/audio/music/ (sem arquivo = silêncio).
  music: { menu: "musica_menu", preparo: "musica_preparo", batalha: "musica_batalha" },

  // Passos: distância (unidades 3D) entre dois passos, por porte do inimigo.
  strides: { small: 1.1, medium: 1.6, big: 2.2 },

  // Inimigos: `size` define passo/voz (small | medium | big; sem ele vale a vida do inimigo),
  // `pitch` deixa a voz mais aguda (>1) ou grave (<1), `stride` ajusta o ritmo dos passos.
  enemies: {
    goblin:          { size: "small",  pitch: 1.0 },
    goblin_runner:   { size: "small",  pitch: 1.3, stride: 1.0 },
    orc:             { size: "medium", pitch: 1.0 },
    orc2:            { size: "medium", pitch: 0.88 },
    troll:           { size: "medium", pitch: 0.75, stride: 1.9 },
    lobo_sombrio:    { size: "small",  pitch: 0.65, stride: 1.2 },
    ogro:            { size: "big",    pitch: 1.0 },
    cavaleiro_negro: { size: "medium", pitch: 0.7 },
    golem:           { size: "big",    pitch: 0.7, stride: 2.4 },
    senhor_da_guerra:{ size: "big",    pitch: 0.85 }
  },

  // Sons por porte de inimigo.
  enemySounds: {
    small:  { step: "passo_leve",  voice: "voz_pequeno",  attack: "ataque_pequeno",  death: "morte_pequeno" },
    medium: { step: "passo_medio", voice: "voz_medio", attack: "ataque_medio", death: "morte_medio" },
    big:    { step: "passo_pesado",  voice: "voz_grande",    attack: "ataque_grande",    death: "morte_grande", spawn: "voz_grande" }
  },

  // Projéteis (chave = `projectile` da torre): som do disparo e do impacto.
  projectiles: {
    arrow:  { shoot: "flecha_disparo",  impact: "flecha_impacto" },
    cannon: { shoot: "canhao_disparo", impact: "canhao_explosao" }
  },

  // Construções (chave = id em TOWERS). Tudo opcional; `built` padrão = "obra_pronta".
  //   built → obra pronta   produce → mina entregou moedas   loop → som contínuo (laser)
  //   overheat / ready → torre de restauração superaqueceu / voltou   explode → armadilha
  towers: {
    archer:   { built: "obra_pronta" },
    cannon:   { built: "obra_pronta" },
    wall:     { built: "obra_pronta" },
    mine:     { built: "obra_pronta", produce: "mina_moedas" },
    restorer: { built: "obra_pronta_magica", loop: "cura_laser", overheat: "cura_superaquece", ready: "cura_pronta" },
    barrel:   { built: "obra_pronta", explode: "barril_explosao" }
  },

  sounds: {
    /* ------------------------------ interface ------------------------------ */
    ui_clique:   { bus: "ui", gain: 0.5, vary: false, cooldown: 30, synth: { dur: 0.08, layers: [
      { w: "triangle", f: [1000, 650], t: 0.07, a: 0.001, g: 0.8 },
      { w: "noise", flt: "highpass", f: [5000], t: 0.02, a: 0.001, g: 0.25 }] } },
    ui_tique:    { bus: "ui", gain: 0.22, vary: false, cooldown: 45, synth: { dur: 0.04, layers: [
      { w: "sine", f: [1500, 1200], t: 0.035, a: 0.001, g: 0.8 }] } },
    ui_selecionar:  { bus: "ui", gain: 0.45, vary: false, synth: { dur: 0.22, layers: [
      { w: "sine", f: [660], t: 0.12, g: 0.8 }, { w: "sine", f: [990], t0: 0.06, t: 0.14, g: 0.7 }] } },
    ui_abrir:    { bus: "ui", gain: 0.4, vary: false, synth: { dur: 0.16, layers: [
      { w: "triangle", f: [350, 700], t: 0.14, g: 0.8 },
      { w: "noise", flt: "bandpass", f: [1500, 3500], q: 2, t: 0.1, g: 0.2 }] } },
    ui_fechar:   { bus: "ui", gain: 0.4, vary: false, synth: { dur: 0.16, layers: [
      { w: "triangle", f: [700, 350], t: 0.14, g: 0.8 },
      { w: "noise", flt: "bandpass", f: [3500, 1500], q: 2, t: 0.1, g: 0.2 }] } },
    ui_erro:   { bus: "ui", gain: 0.4, vary: false, cooldown: 180, synth: { dur: 0.27, layers: [
      { w: "square", f: [200], flt: "lowpass", ff: [900], t: 0.09, g: 0.6 },
      { w: "square", f: [150], flt: "lowpass", ff: [900], t0: 0.11, t: 0.14, g: 0.6 }] } },
    ui_pausar:   { bus: "ui", gain: 0.4, vary: false, synth: { dur: 0.18, layers: [
      { w: "sine", f: [520, 300], t: 0.16, g: 0.8 }] } },
    ui_continuar:  { bus: "ui", gain: 0.4, vary: false, synth: { dur: 0.18, layers: [
      { w: "sine", f: [300, 520], t: 0.16, g: 0.8 }] } },
    contagem_bip: { bus: "ui", gain: 0.5, vary: false, synth: { dur: 0.2, layers: [
      { w: "sine", f: [880], t: 0.18, a: 0.005, g: 0.9 }, { w: "triangle", f: [1760], t: 0.1, g: 0.25 }] } },
    moeda_castelo: { alcance: 0.3, gain: 0.3, cooldown: 200, synth: { dur: 0.2, layers: [
      { w: "sine", f: [1760], t: 0.12, g: 0.8 }, { w: "sine", f: [2349], t0: 0.05, t: 0.14, g: 0.6 }] } },

    /* ------------------------------ ondas e fim ------------------------------ */
    onda_inicio: { bus: "ui", gain: 0.7, vary: false, priority: 2, synth: { dur: 1.5, layers: [
      { w: "sawtooth", f: [110], flt: "lowpass", ff: [500, 1400], t: 1.3, a: 0.12, g: 0.8, vib: [5, 2] },
      { w: "sawtooth", f: [165], flt: "lowpass", ff: [600, 1500], t0: 0.25, t: 1.15, a: 0.1, g: 0.6, vib: [5, 3] },
      { w: "sawtooth", f: [220], flt: "lowpass", ff: [700, 1600], t0: 0.5, t: 0.9, a: 0.1, g: 0.4 }] } },
    onda_vencida: { bus: "ui", gain: 0.5, vary: false, priority: 2, synth: { dur: 1.2, layers: [
      { w: "triangle", f: [523], t: 0.5, g: 0.7 }, { w: "triangle", f: [659], t0: 0.1, t: 0.5, g: 0.7 },
      { w: "triangle", f: [784], t0: 0.2, t: 0.5, g: 0.7 }, { w: "triangle", f: [1047], t0: 0.3, t: 0.8, g: 0.8 }] } },
    fim_de_jogo:  { bus: "ui", gain: 0.7, vary: false, priority: 2, synth: { dur: 2.2, layers: [
      { w: "sawtooth", f: [196, 49], flt: "lowpass", ff: [900, 150], t: 1.9, a: 0.05, g: 0.8 },
      { w: "sawtooth", f: [147, 37], flt: "lowpass", ff: [700, 120], t: 1.9, a: 0.05, g: 0.6 },
      { w: "sine", f: [60, 30], t: 2.0, g: 0.8 }] } },
    recorde:     { bus: "ui", gain: 0.5, vary: false, priority: 2, synth: { dur: 1.5, layers: [
      { w: "triangle", f: [523], t: 0.4, g: 0.7 }, { w: "triangle", f: [659], t0: 0.12, t: 0.4, g: 0.7 },
      { w: "triangle", f: [784], t0: 0.24, t: 0.4, g: 0.7 }, { w: "triangle", f: [1047], t0: 0.36, t: 0.4, g: 0.7 },
      { w: "sine", f: [1319], t0: 0.48, t: 0.9, g: 0.8 }] } },

    /* ------------------------------ castelo ------------------------------ */
    castelo_dano: { alcance: 1, gain: 0.8, cooldown: 150, maxVoices: 4, synth: { dur: 0.5, layers: [
      { w: "sine", f: [90, 35], t: 0.4, g: 1 },
      { w: "noise", flt: "lowpass", f: [1200, 150], t: 0.35, g: 0.8 },
      { w: "triangle", f: [300, 120], t: 0.15, g: 0.4 }] } },
    castelo_destruido: { alcance: 1, gain: 1, priority: 2, vary: false, synth: { dur: 2.4, layers: [
      { w: "noise", flt: "lowpass", f: [2500, 50], t: 2.2, a: 0.01, g: 1 },
      { w: "sine", f: [80, 20], t: 2.0, g: 1 },
      { w: "noise", flt: "bandpass", f: [900, 400], q: 1, t0: 0.5, t: 0.4, g: 0.6 },
      { w: "noise", flt: "bandpass", f: [900, 400], q: 1, t0: 0.9, t: 0.4, g: 0.5 },
      { w: "noise", flt: "bandpass", f: [900, 400], q: 1, t0: 1.3, t: 0.4, g: 0.4 }] } },
    castelo_alarme: { bus: "ui", gain: 0.3, vary: false, synth: { dur: 0.5, layers: [
      { w: "square", f: [740], flt: "lowpass", ff: [1500], t: 0.12, g: 0.6 },
      { w: "square", f: [740], flt: "lowpass", ff: [1500], t0: 0.2, t: 0.12, g: 0.6 }] } },

    /* ------------------------------ projéteis e explosões ------------------------------ */
    flecha_disparo: { alcance: 0.3, gain: 0.5, cooldown: 25, maxVoices: 6, synth: { dur: 0.22, layers: [
      { w: "noise", flt: "bandpass", f: [3500, 900], q: 1.5, t: 0.15, g: 0.7 },
      { w: "triangle", f: [700, 180], t: 0.12, a: 0.002, g: 0.6 }] } },
    flecha_impacto:   { alcance: 0.25, gain: 0.45, cooldown: 20, maxVoices: 6, synth: { dur: 0.14, layers: [
      { w: "noise", flt: "lowpass", f: [2500, 600], t: 0.08, g: 0.7 },
      { w: "sine", f: [220, 90], t: 0.1, g: 0.8 }] } },
    canhao_disparo: { alcance: 0.8, gain: 0.9, cooldown: 60, maxVoices: 4, synth: { dur: 0.7, layers: [
      { w: "sine", f: [160, 38], t: 0.5, a: 0.002, g: 1 },
      { w: "noise", flt: "lowpass", f: [2500, 150], t: 0.55, a: 0.002, g: 0.8 },
      { w: "sawtooth", f: [90, 35], flt: "lowpass", ff: [400, 200], t: 0.3, g: 0.3 }] } },
    canhao_explosao: { alcance: 0.9, gain: 0.9, cooldown: 50, maxVoices: 4, synth: { dur: 1.0, layers: [
      { w: "noise", flt: "lowpass", f: [1800, 90], t: 0.9, a: 0.003, g: 1 },
      { w: "sine", f: [110, 28], t: 0.8, g: 1 },
      { w: "noise", flt: "bandpass", f: [3000, 1000], q: 0.8, t: 0.2, g: 0.4 }] } },
    barril_explosao: { alcance: 1, gain: 1, cooldown: 80, maxVoices: 3, priority: 2, synth: { dur: 1.4, layers: [
      { w: "noise", flt: "lowpass", f: [2200, 70], t: 1.2, a: 0.002, g: 1 },
      { w: "sine", f: [95, 22], t: 1.1, g: 1 },
      { w: "noise", flt: "bandpass", f: [3500, 1200], q: 0.8, t: 0.25, g: 0.5 }] } },

    /* ------------------------------ construções ------------------------------ */
    construir_posicionar: { gain: 0.6, cooldown: 60, synth: { dur: 0.3, layers: [
      { w: "sine", f: [130, 45], t: 0.22, g: 1 },
      { w: "noise", flt: "lowpass", f: [900, 200], t: 0.15, g: 0.7 },
      { w: "triangle", f: [320, 200], t0: 0.02, t: 0.08, g: 0.5 }] } },
    obra_martelada: { alcance: 0.15, gain: 0.45, cooldown: 80, maxVoices: 3, synth: { dur: 0.16, layers: [
      { w: "noise", flt: "bandpass", f: [2800, 1800], q: 3, t: 0.04, a: 0.001, g: 0.9 },
      { w: "triangle", f: [1100, 550], t: 0.07, g: 0.6 },
      { w: "sine", f: [200, 110], t: 0.1, g: 0.8 }] } },
    obra_pronta: { alcance: 0.4, gain: 0.6, cooldown: 60, maxVoices: 4, synth: { dur: 0.6, layers: [
      { w: "sine", f: [90, 50], t: 0.2, g: 1 },
      { w: "triangle", f: [523], t0: 0.1, t: 0.35, g: 0.6 },
      { w: "triangle", f: [784], t0: 0.2, t: 0.38, g: 0.5 }] } },
    obra_pronta_magica: { alcance: 0.4, gain: 0.55, cooldown: 60, maxVoices: 3, synth: { dur: 0.9, layers: [
      { w: "sine", f: [659], vib: [6, 6], t: 0.5, g: 0.7 },
      { w: "sine", f: [880], vib: [6, 6], t0: 0.08, t: 0.55, g: 0.6 },
      { w: "sine", f: [1318], vib: [7, 8], t0: 0.16, t: 0.7, g: 0.45 }] } },
    evoluir: { gain: 0.6, cooldown: 100, priority: 2, synth: { dur: 1.0, layers: [
      { w: "sine", f: [392], t: 0.3, g: 0.7 }, { w: "sine", f: [523], t0: 0.1, t: 0.3, g: 0.7 },
      { w: "sine", f: [659], t0: 0.2, t: 0.3, g: 0.7 }, { w: "sine", f: [784], t0: 0.3, t: 0.4, g: 0.8 },
      { w: "triangle", f: [1568], t0: 0.4, t: 0.55, g: 0.4 }] } },
    reparar: { gain: 0.55, cooldown: 100, synth: { dur: 0.75, layers: [
      { w: "triangle", f: [2400], t: 0.1, g: 0.6 }, { w: "triangle", f: [3000], t0: 0.18, t: 0.1, g: 0.5 },
      { w: "sine", f: [400, 1400], t0: 0.3, t: 0.35, g: 0.5 },
      { w: "noise", flt: "highpass", f: [6000], t0: 0.3, t: 0.1, g: 0.2 }] } },
    desfazer: { gain: 0.4, vary: false, synth: { dur: 0.26, layers: [{ w: "sine", f: [600, 250], t: 0.24, g: 0.8 }] } },
    demolir: { alcance: 0.5, gain: 0.7, cooldown: 60, maxVoices: 4, synth: { dur: 0.9, layers: [
      { w: "noise", flt: "lowpass", f: [1400, 120], t: 0.8, a: 0.003, g: 0.9 },
      { w: "noise", flt: "bandpass", f: [800, 500], q: 1, t0: 0.15, t: 0.2, g: 0.6 },
      { w: "noise", flt: "bandpass", f: [800, 500], q: 1, t0: 0.3, t: 0.2, g: 0.5 },
      { w: "sine", f: [90, 40], t: 0.4, g: 0.9 }] } },
    construcao_destruida: { alcance: 0.9, gain: 0.9, cooldown: 60, maxVoices: 4, synth: { dur: 1.3, layers: [
      { w: "noise", flt: "lowpass", f: [2200, 80], t: 1.2, a: 0.003, g: 1 },
      { w: "sine", f: [100, 28], t: 1.0, g: 1 },
      { w: "noise", flt: "bandpass", f: [900, 400], q: 1, t0: 0.35, t: 0.25, g: 0.6 },
      { w: "noise", flt: "bandpass", f: [900, 400], q: 1, t0: 0.6, t: 0.25, g: 0.5 }] } },
    mina_moedas: { alcance: 0.3, gain: 0.55, cooldown: 60, maxVoices: 4, synth: { dur: 0.45, layers: [
      { w: "sine", f: [1568], t: 0.25, g: 0.8 }, { w: "sine", f: [2093], t0: 0.07, t: 0.3, g: 0.7 },
      { w: "noise", flt: "highpass", f: [7000], t: 0.03, g: 0.2 }] } },
    cura_laser: { alcance: 0.3, gain: 0.3, maxVoices: 6, cooldown: 0, vary: false, synth: { dur: 1, loop: true, layers: [
      { w: "sine", f: [200], g: 0.5 }, { w: "sine", f: [301], g: 0.35 }, { w: "sine", f: [1200], g: 0.08 }] } },
    cura_superaquece: { gain: 0.6, cooldown: 300, synth: { dur: 0.7, layers: [
      { w: "noise", flt: "highpass", f: [5000, 400], t: 0.5, g: 0.6 },
      { w: "sine", f: [300, 70], t: 0.6, g: 0.7 }] } },
    cura_pronta: { gain: 0.4, cooldown: 300, synth: { dur: 0.3, layers: [{ w: "sine", f: [500, 900], t: 0.25, g: 0.8 }] } },

    /* ------------------------------ inimigos ------------------------------ */
    passo_leve:  { alcance: 0.1, gain: 0.22, cooldown: 35, maxVoices: 6, synth: { dur: 0.08, layers: [
      { w: "noise", flt: "bandpass", f: [2200, 1200], q: 1, t: 0.05, g: 0.7 }, { w: "sine", f: [140, 90], t: 0.06, g: 0.5 }] } },
    passo_medio: { alcance: 0.2, gain: 0.35, cooldown: 45, maxVoices: 5, synth: { dur: 0.12, layers: [
      { w: "noise", flt: "lowpass", f: [900, 300], t: 0.09, g: 0.8 }, { w: "sine", f: [100, 60], t: 0.1, g: 0.9 }] } },
    passo_pesado:  { alcance: 0.35, gain: 0.55, cooldown: 60, maxVoices: 4, synth: { dur: 0.3, layers: [
      { w: "sine", f: [70, 32], t: 0.25, g: 1 }, { w: "noise", flt: "lowpass", f: [450, 100], t: 0.2, g: 0.6 }] } },
    voz_pequeno:  { alcance: 0.1, gain: 0.4, cooldown: 120, maxVoices: 4, synth: { dur: 0.22, layers: [
      { w: "sawtooth", f: [480, 260], flt: "bandpass", ff: [1500, 900], q: 2, vib: [18, 25], t: 0.2, g: 0.9 }] } },
    voz_medio: { alcance: 0.25, gain: 0.5, cooldown: 150, maxVoices: 3, synth: { dur: 0.35, layers: [
      { w: "sawtooth", f: [140, 85], flt: "lowpass", ff: [900, 500], t: 0.32, g: 1 },
      { w: "noise", flt: "bandpass", f: [700, 500], q: 2, t: 0.2, g: 0.3 }] } },
    voz_grande:    { alcance: 0.7, gain: 0.65, cooldown: 250, maxVoices: 2, synth: { dur: 0.9, layers: [
      { w: "sawtooth", f: [80, 48], flt: "lowpass", ff: [500, 250], vib: [9, 5], t: 0.85, a: 0.05, g: 1 },
      { w: "sawtooth", f: [83, 50], flt: "lowpass", ff: [500, 250], t: 0.85, a: 0.05, g: 0.6 },
      { w: "noise", flt: "lowpass", f: [600, 200], t: 0.6, g: 0.4 }] } },
    ataque_pequeno:  { alcance: 0.1, gain: 0.35, cooldown: 100, maxVoices: 3, synth: { dur: 0.15, layers: [
      { w: "sawtooth", f: [600, 400], flt: "bandpass", ff: [1800, 1200], q: 2, t: 0.13, g: 0.9 }] } },
    ataque_medio: { alcance: 0.2, gain: 0.45, cooldown: 120, maxVoices: 3, synth: { dur: 0.25, layers: [
      { w: "sawtooth", f: [160, 100], flt: "lowpass", ff: [1100, 600], t: 0.22, g: 1 }] } },
    ataque_grande:    { alcance: 0.5, gain: 0.6, cooldown: 180, maxVoices: 2, synth: { dur: 0.4, layers: [
      { w: "sawtooth", f: [90, 55], flt: "lowpass", ff: [600, 300], t: 0.36, g: 1 },
      { w: "noise", flt: "lowpass", f: [500, 150], t: 0.25, g: 0.4 }] } },
    morte_pequeno:  { alcance: 0.2, gain: 0.45, cooldown: 80, maxVoices: 4, synth: { dur: 0.45, layers: [
      { w: "sawtooth", f: [700, 150], flt: "bandpass", ff: [2000, 400], q: 2, t: 0.4, g: 1 }] } },
    morte_medio: { alcance: 0.35, gain: 0.55, cooldown: 100, maxVoices: 3, synth: { dur: 0.7, layers: [
      { w: "sawtooth", f: [200, 50], flt: "lowpass", ff: [1000, 200], t: 0.65, g: 1 },
      { w: "noise", flt: "lowpass", f: [800, 150], t: 0.4, g: 0.3 }] } },
    morte_grande:    { alcance: 0.7, gain: 0.75, cooldown: 150, maxVoices: 2, synth: { dur: 1.1, layers: [
      { w: "sawtooth", f: [100, 28], flt: "lowpass", ff: [600, 120], t: 1.0, g: 1 },
      { w: "noise", flt: "lowpass", f: [700, 80], t: 0.8, g: 0.5 },
      { w: "sine", f: [60, 25], t: 0.9, g: 0.9 }] } },
    golpe_construcao:       { alcance: 0.3, gain: 0.5, cooldown: 30, maxVoices: 5, synth: { dur: 0.22, layers: [
      { w: "noise", flt: "bandpass", f: [1100, 350], q: 1.2, t: 0.14, g: 0.8 }, { w: "sine", f: [170, 60], t: 0.18, g: 0.9 }] } },
    golpe_construcao_pesado: { alcance: 0.5, gain: 0.8, cooldown: 60, maxVoices: 3, synth: { dur: 0.4, layers: [
      { w: "noise", flt: "lowpass", f: [1500, 150], t: 0.3, g: 0.9 }, { w: "sine", f: [120, 40], t: 0.35, g: 1 },
      { w: "noise", flt: "bandpass", f: [2500, 800], q: 1, t: 0.08, g: 0.5 }] } }
  }
};