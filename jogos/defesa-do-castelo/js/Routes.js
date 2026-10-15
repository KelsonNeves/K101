/* ==========================================================================
   Routes.js — planejamento de rotas dos inimigos.
   "Qual caminho vale mais a pena para este tipo de inimigo AGORA?"

   Como funciona:
   1. CANDIDATAS: gera várias rotas diferentes até o castelo (A* com "personalidades":
      equilibrada, quebra-muro, evita-construção, ignora-torres, cautelosa, exploradoras).
      Rotas quase iguais às já aceitas são descartadas.
   2. SIMULAÇÃO: "anda" cada rota com o inimigo, célula por célula, somando o dano das torres
      que o alcançam e o tempo parado quebrando construções. Resultado = dano que o inimigo
      consegue causar em você ANTES de morrer (construções quebradas, ponderadas por valor,
      + dano no castelo se chegar lá).
   3. NOTA: dano esperado × variedade:
        - "tédio": rotas que o jogo já usou nas últimas ondas valem menos;
        - "calor": rotas onde inimigos desse tipo morreram de verdade valem menos;
        - ruído leve: o 2º/3º melhor às vezes passa à frente.
   4. GRUPOS: cada grupo de até `groupSize` inimigos da mesma classe (e do mesmo spawn) anda
      junto na MESMA rota; o grupo seguinte vai para a 2ª melhor, depois a 3ª, e assim por diante.
   Não cria nem move nada: só devolve listas de células.
   ========================================================================== */
import { ENEMIES } from "./Data.js";

export const ROUTING = {
  groupSize: 5,           // inimigos da mesma classe que andam juntos (em fila) na mesma rota; o grupo seguinte pega outra rota
  candidates: 7,          // quantas rotas diferentes tentar gerar (máx. = nº de PRESETS)
  usedPenalty: 1.5,       // custo extra por célula já usada por outra candidata (força desvios)
  dupSimilarity: 0.88,    // rotas com mais que isso de células em comum com outra são descartadas
  focus: 0.3,             // quanto o fogo das torres se divide num grupo (torre de alvo único)
  breakers: 3,            // quantos do grupo batem na mesma construção ao mesmo tempo (máx.)
  castleWindow: 12,       // s: quanto tempo de ataque ao castelo conta na nota
  castleValue: 5,         // dano no castelo vale ×5 o dano numa construção
  scoreNoise: 0.25,       // ±25% de sorte na nota (varia a cada onda)
  boredom: 0.8,           // quanto repetir rota recente reduz a nota
  boredomDecay: 0.5,      // a cada onda a memória de "rota usada" cai para 50%
  heatWeight: 0.35,       // quanto as mortes reais numa rota reduzem a nota
  heatDecay: 0.9,         // a cada onda a memória de mortes cai para 70%
  maxDetour: 1.4,         // rota mais longa que (mais curta × isto + detourSlack) é descartada: nada de dar a volta no mapa
  detourSlack: 4,         // células de folga somadas ao limite acima
  value: { attack: 1.6, heal: 1.4, mine: 1.3, wall: 0.5, other: 1 }   // valor de 1 ponto de vida destruído, por tipo
};

// Cada preset muda como o A* enxerga a rota: breach = peso de quebrar construções,
// danger = peso do perigo das torres, noise = ruído por célula (rotas "exploradoras").
const PRESETS = [
  { breach: 1,   danger: 1 },                  // equilibrada
  { breach: 0.4, danger: 1 },                  // quebra-tudo: atravessa muros sem medo
  { breach: 2.5, danger: 1 },                  // evita construções
  { breach: 1,   danger: 0 },                  // ignora torres (corrida)
  { breach: 1,   danger: 3 },                  // cautelosa: foge do alcance das torres
  { breach: 1,   danger: 1,   noise: 3 },      // exploradora 1
  { breach: 0.6, danger: 0.5, noise: 3 }       // exploradora 2
];

const hash = (a, b, c) => { const h = Math.sin((a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453); return h - Math.floor(h); };

export class RoutePlanner {
  constructor({ map, entities }) {
    this.map = map;
    this.entities = entities;
    this.expected = {};          // tipo → tamanho esperado do grupo nesta onda
    this.cache = new Map();      // "tipo:row,col" → rotas ordenadas da melhor para a pior
    this.groups = new Map();     // "tipo:row,col" → { rank, count } do grupo em formação
    this.use = new Map();        // tipo → Float32Array (memória de rotas usadas)
    this.heat = new Map();       // tipo → Float32Array (memória de mortes)
    this.seed = Math.random() * 1000;
  }

  field(store, type) {
    let f = store.get(type);
    if (!f) { f = new Float32Array(this.map.rows * this.map.cols); store.set(type, f); }
    return f;
  }

  // Construções mudaram: as rotas precisam ser refeitas (acontece sob demanda).
  invalidate() { this.cache.clear(); }

  // Início de onda: fixa o tamanho dos grupos, "esquece" um pouco do passado e sorteia nova sorte.
  startWave(composition) {
    this.expected = {};
    for (const { id, count } of composition) if (count > 0) this.expected[id] = Math.min(ROUTING.groupSize, count);
    this.groups.clear();
    for (const f of this.use.values()) for (let i = 0; i < f.length; i++) f[i] *= ROUTING.boredomDecay;
    for (const f of this.heat.values()) for (let i = 0; i < f.length; i++) f[i] *= ROUTING.heatDecay;
    this.seed = Math.random() * 1000;
    this.cache.clear();
  }

  // Um inimigo morreu de verdade aqui: essa região é perigosa para o tipo dele.
  recordDeath(e) {
    const { row, col } = this.map.worldToGrid(e.position);
    const heat = this.field(this.heat, e.type);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!this.map.getCell(row + dr, col + dc)) continue;
        heat[(row + dr) * this.map.cols + (col + dc)] += dr || dc ? 0.4 : 1;
      }
    }
  }

  // Dá ao inimigo recém-criado um lugar no grupo (e, portanto, a posição na lista de rotas).
  assign(e, cell) {
    const key = `${e.type}:${cell.row},${cell.col}`;
    let g = this.groups.get(key);
    if (!g) { g = { rank: 0, count: 0 }; this.groups.set(key, g); }
    if (g.count >= ROUTING.groupSize) { g.rank++; g.count = 0; }
    g.count++;
    e.routeKey = key;
    e.routeRank = g.rank;
    e.routeStart = { row: cell.row, col: cell.col };

    const route = this.routeOf(e);
    if (route) {                                   // memória de "tédio"
      const use = this.field(this.use, e.type);
      for (const c of route) use[c.row * this.map.cols + c.col] += 1 / ROUTING.groupSize;
    }
  }

  routeOf(e) {
    if (!e.routeKey || !e.routeStart) return null;
    const ranked = this.ranked(e.type, e.routeStart);
    return ranked.length ? ranked[e.routeRank % ranked.length].cells : null;
  }

  // Células (começando na posição atual) para seguir a rota do inimigo, ou null.
  pathFor(e, cell) {
    const route = this.routeOf(e);
    if (!route) return null;
    let bi = -1, bd = Infinity;
    route.forEach((rc, i) => {
      const d = Math.max(Math.abs(rc.row - cell.row), Math.abs(rc.col - cell.col));
      if (d <= bd) { bd = d; bi = i; }             // empate → célula mais adiante
    });
    let path;
    if (bd === 0) path = route.slice(bi);
    else if (bd <= 1) path = [cell, ...route.slice(bi)];
    else {
      const j = Math.min(route.length - 1, bi + 2);  // fora da rota (ela mudou): volta até ela
      const back = this.map.findPath(cell, route[j], { structureCost: this.breach(ENEMIES[e.type], 1) });
      path = back ? back.concat(route.slice(j + 1)) : null;
    }
    return this.saneOrDirect(e, cell, path, bd > 1);
  }

  // Trava anti-"rota maluca": se seguir a rota do grupo obriga a dar uma volta enorme comparada ao
  // caminho direto (voltar até a ponte, cruzar o mapa para a outra ponte…), usa o caminho direto.
  saneOrDirect(e, cell, path, offRoute) {
    const near = this.castleCells().reduce((m, c) => Math.min(m, Math.max(Math.abs(c.row - cell.row), Math.abs(c.col - cell.col))), Infinity);
    const suspicious = !path || offRoute || path.length > near * 2 + 8;   // só paga o A* extra quando há suspeita
    if (!suspicious) return path;
    const direct = this.map.findPath(cell, null, { structureCost: this.breach(ENEMIES[e.type], 1) });
    if (!direct) return path;
    if (!path || path.length > direct.length * ROUTING.maxDetour + ROUTING.detourSlack) return direct;
    return path;
  }

  castleCells() { return this.map.castleCells; }

  /* ----------------------------- geração ----------------------------- */
  ranked(type, start) {
    const key = `${type}:${start.row},${start.col}`;
    let list = this.cache.get(key);
    if (!list) { list = this.build(type, start); this.cache.set(key, list); }
    return list;
  }

  breach(data, mult) {
    const cs = this.map.cellSize;
    const dps = Math.max(0.1, (data.attack.structureDamage ?? data.attack.damage) / Math.max(0.1, data.attack.cooldown));
    const secondsPerCell = cs / Math.max(0.1, data.speed);
    return (cell) => {
      const t = cell.occupant;
      if (!t || !t.alive || t.hidden) return 0;
      return Math.max(0.5, (t.health / dps) / secondsPerCell * mult);
    };
  }

  build(type, start) {
    const data = ENEMIES[type];
    if (!data) return [];
    const cols = this.map.cols;
    const g = this.expected[type] ?? 1;
    const used = new Map();
    const cands = [];

    PRESETS.slice(0, ROUTING.candidates).forEach((preset, idx) => {
      const cellCost = (cell) =>
        cell.danger * (preset.danger - 1)
        + (used.get(cell.row * cols + cell.col) ?? 0) * ROUTING.usedPenalty
        + (preset.noise ? preset.noise * hash(this.seed, cell.row, cell.col + idx * 17) : 0);
      const cells = this.map.findPath(start, null, { structureCost: this.breach(data, preset.breach), cellCost });
      if (!cells) return;
      const set = new Set(cells.map((c) => c.row * cols + c.col));
      const dup = cands.some((o) => {
        let shared = 0;
        for (const c of o.cells) if (set.has(c.row * cols + c.col)) shared++;
        return shared / Math.max(o.cells.length, cells.length) > ROUTING.dupSimilarity;
      });
      if (dup) return;
      for (const k of set) used.set(k, (used.get(k) ?? 0) + 1);
      cands.push({ cells, preset });
    });

    if (cands.length > 1) {                        // descarta rotas absurdamente mais longas que a mais curta
      const shortest = Math.min(...cands.map((c) => c.cells.length));
      const limit = shortest * ROUTING.maxDetour + ROUTING.detourSlack;
      for (let i = cands.length - 1; i >= 0; i--) if (cands[i].cells.length > limit) cands.splice(i, 1);
    }

    const use = this.field(this.use, type), heat = this.field(this.heat, type);
    const towers = this.shooters();
    cands.forEach((c, i) => {
      c.damage = this.evaluate(c.cells, data, g, towers);
      let u = 0, h = 0;
      for (const cell of c.cells) { const k = cell.row * cols + cell.col; u += use[k]; h += heat[k]; }
      u /= c.cells.length; h /= c.cells.length;
      const luck = 1 - ROUTING.scoreNoise + 2 * ROUTING.scoreNoise * hash(this.seed, i, 3.3);
      c.score = (c.damage + 1) * luck / ((1 + ROUTING.boredom * u) * (1 + ROUTING.heatWeight * h));
    });
    return cands.sort((a, b) => b.score - a.score);
  }

  /* ---------------------------- simulação ---------------------------- */
  shooters() {
    return this.entities.towers.filter((t) => t.alive && t.attacks && t.built && !t.hidden);
  }

  structValue(t) {
    const v = ROUTING.value;
    return t.mining ? v.mine : t.attacks ? v.attack : t.healer ? v.heal : t.wall ? v.wall : v.other;
  }

  // Dano (ponderado) que UM inimigo do grupo consegue causar ao longo da rota antes de morrer.
  evaluate(cells, data, g, towers) {
    const map = this.map, cs = map.cellSize;
    const atk = data.attack;
    const cd = Math.max(0.1, atk.cooldown);
    const structDps = (atk.structureDamage ?? atk.damage) / cd * Math.min(g, ROUTING.breakers);
    const castleDps = atk.damage / cd;
    const share = 1 / (1 + (g - 1) * ROUTING.focus);

    const pressureAt = (c) => {
      const p = map.gridToWorld(c.row, c.col);
      let sum = 0;
      for (const t of towers) {
        if (Math.hypot(t.position.x - p.x, t.position.z - p.z) > t.range) continue;
        sum += (t.damage / Math.max(0.1, t.cooldown)) * (t.splash > 0 ? 1 : share);
      }
      return sum;
    };

    let hp = data.health, dealt = 0;
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1], cur = cells[i];
      const cell = map.getCell(cur.row, cur.col);
      const occ = cell.occupant && cell.occupant.alive && !cell.occupant.hidden ? cell.occupant : null;

      if (occ) {                                   // parado em `prev`, quebrando a construção
        const press = pressureAt(prev);
        const duration = occ.health / structDps;
        const tDie = press > 0 ? hp / press : Infinity;
        const v = this.structValue(occ);
        if (tDie <= duration) return dealt + v * structDps * tDie;   // morre no meio da quebra
        dealt += v * occ.health;
        hp -= press * duration;
      }
      if (cell.type === "castle") break;

      const diag = cur.row !== prev.row && cur.col !== prev.col;
      const walk = cs * (diag ? 1.414 : 1) / Math.max(0.1, data.speed * cell.speedFactor);
      hp -= pressureAt(cur) * walk;
      if (hp <= 0) return dealt;                   // morreu a caminho
    }

    const press = pressureAt(cells[cells.length - 1]);        // chegou ao castelo
    const tDie = press > 0 ? hp / press : Infinity;
    return dealt + ROUTING.castleValue * castleDps * Math.min(tDie, ROUTING.castleWindow);
  }
}