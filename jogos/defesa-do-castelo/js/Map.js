/* ==========================================================================
   Map.js — espaço lógico: grid, células, parser, conversões, A*, validação.
   "Em que espaço isso acontece?"
   Não cria torres, não move inimigos, não dá moedas.
   ========================================================================== */
import { TOWERS, GAME_CONFIG } from "./Data.js";

const SYMBOLS = {
  ".": { type: "ground", walkable: true,  buildable: true  },
  "-": { type: "ground-unbuildable", walkable: true,  buildable: false  },
  "#": { type: "tree",   walkable: false, buildable: false },
  "R": { type: "rock",   walkable: false, buildable: false },
  "@": { type: "bush",   walkable: false, buildable: false },
  "~": { type: "water",  walkable: false, buildable: false },
  "B": { type: "bridge", walkable: true,  buildable: false },
  "S": { type: "spawn",  walkable: true,  buildable: false },
  "C": { type: "castle", walkable: true,  buildable: false },
  "T": { type: "trilha",    walkable: true,  buildable: true, cost: 0.5, speedFactor: 1.3 },
  "M": { type: "mud",    walkable: true,  buildable: false, cost: 2, speedFactor: 0.5 }
};

class Cell {
  constructor(row, col, def) {
    this.row = row;
    this.col = col;
    this.type = def.type;
    this.walkable = def.walkable;
    this.buildable = def.buildable;
    this.cost = def.cost ?? 1;                // custo para o pathfinding (lama = 2)
    this.speedFactor = def.speedFactor ?? 1;  // multiplicador de velocidade de quem pisa aqui
    this.danger = 0;                          // custo extra por estar perto de torres (GameMap.rebuildDanger)
    this.occupant = null;     // estrutura que ocupa a célula
  }
  // Construção oculta (barril) não bloqueia: os inimigos andam por cima como se não existisse.
  get blocked() { return !this.walkable || (this.occupant !== null && !this.occupant.hidden); }
}

class Grid {
  constructor(layout) {
    this.rows = layout.length;
    this.cols = layout[0].length;
    this.cells = layout.map((line, row) =>
      [...line].map((ch, col) => new Cell(row, col, SYMBOLS[ch] ?? SYMBOLS["."]))
    );
  }
  inBounds(row, col) { return row >= 0 && col >= 0 && row < this.rows && col < this.cols; }
  get(row, col) { return this.inBounds(row, col) ? this.cells[row][col] : null; }
}

class Pathfinding {
  constructor(grid) { this.grid = grid; }

  // A* em 8 direções, sem "cortar quina". Retorna [{row,col}] ou null.
  // opts.structureCost(cell) → custo extra para atravessar uma célula ocupada por uma construção
  // (o inimigo vai ter que quebrá-la). Sem essa função, construções bloqueiam como antes.
  find(start, goals, opts = {}) {
    const grid = this.grid;
    const through = opts.structureCost;
    const extra = opts.cellCost;      // custo extra por célula (usado pelo RoutePlanner para gerar rotas diferentes)
    const goalKeys = new Set(goals.map((g) => g.row * grid.cols + g.col));
    // O castelo só pode ser o DESTINO: nunca se atravessa por dentro dele para chegar a outro lugar.
    const castleGoal = goals.some((g) => grid.get(g.row, g.col)?.type === "castle");
    const key = (r, c) => r * grid.cols + c;
    const h = (r, c) => {
      let best = Infinity;
      for (const g of goals) {
        const dx = Math.abs(g.col - c), dy = Math.abs(g.row - r);
        best = Math.min(best, Math.max(dx, dy) + 0.414 * Math.min(dx, dy));
      }
      return best;
    };

    const open = [{ r: start.row, c: start.col, g: 0, f: h(start.row, start.col) }];
    const gScore = new Map([[key(start.row, start.col), 0]]);
    const cameFrom = new Map();
    const closed = new Set();

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.r, cur.c);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (goalKeys.has(ck)) {
        const path = [{ row: cur.r, col: cur.c }];
        let k = ck;
        while (cameFrom.has(k)) {
          k = cameFrom.get(k);
          path.push({ row: Math.floor(k / grid.cols), col: k % grid.cols });
        }
        return path.reverse();
      }

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = cur.r + dr, nc = cur.c + dc;
          const cell = grid.get(nr, nc);
          if (!cell || !cell.walkable || (!through && cell.occupant !== null && !cell.occupant.hidden)) continue;
          if (cell.type === "castle" && !goalKeys.has(nr * grid.cols + nc)) continue;   // castelo não é passagem
          if (dr && dc) {
            const a = grid.get(cur.r + dr, cur.c), b = grid.get(cur.r, cur.c + dc);
            if (!a || !b || a.blocked || b.blocked) continue;
            if (!castleGoal && (a.type === "castle" || b.type === "castle")) continue;   // nem cortando a quina do castelo
          }
          const nk = key(nr, nc);
          if (closed.has(nk)) continue;
          // custo do passo = terreno + perigo das torres próximas (nunca abaixo de 0.1)
          const breach = through && cell.occupant && !cell.occupant.hidden ? through(cell) : 0;   // custo de quebrar a construção
          const ng = cur.g + (dr && dc ? 1.414 : 1) * Math.max(0.1, cell.cost + cell.danger + breach + (extra ? extra(cell) : 0));
          if (ng < (gScore.get(nk) ?? Infinity)) {
            gScore.set(nk, ng);
            cameFrom.set(nk, ck);
            open.push({ r: nr, c: nc, g: ng, f: ng + h(nr, nc) });
          }
        }
      }
    }
    return null;
  }
}

class PlacementValidator {
  constructor(map) { this.map = map; }

  validate(type, row, col) {
    const map = this.map;
    const data = TOWERS[type];
    if (!data) return { ok: false, reason: "Estrutura desconhecida" };

    const cells = map.getFootprintCells(row, col, data.footprint);
    if (!cells) return { ok: false, reason: "Fora do mapa" };
    if (cells.some((c) => !c.buildable)) return { ok: false, reason: "Não dá para construir aqui" };
    if (cells.some((c) => c.occupant)) return { ok: false, reason: "Já existe uma estrutura aqui" };
    if (cells.some((c) => !map.inBuildZone(c.row, c.col))) return { ok: false, reason: "Muito longe da área construída" };

    // Não existe mais a regra de "caminho sempre livre": os inimigos quebram construções para passar.
    return { ok: true, reason: "" };
  }
}

export class GameMap {
  constructor(layout, cellSize = GAME_CONFIG.cellSize) {
    this.cellSize = cellSize;
    this.grid = new Grid(layout);
    this.rows = this.grid.rows;
    this.cols = this.grid.cols;
    this.width = this.cols * cellSize;
    this.height = this.rows * cellSize;

    this.pathfinding = new Pathfinding(this.grid);
    this.validator = new PlacementValidator(this);
    this.threats = [];      // torres que influenciam o caminho dos inimigos

    this.spawns = [];
    this.castleCells = [];
    for (const row of this.grid.cells) {
      for (const cell of row) {
        if (cell.type === "spawn") this.spawns.push({ row: cell.row, col: cell.col });
        if (cell.type === "castle") this.castleCells.push(cell);
      }
    }
    this.zoneVersion = 0;
    this.rebuildZone();
  }

  // Área onde se pode construir: raio `buildRadius` (células) ao redor do castelo e de toda construção existente.
  rebuildZone() {
    const R = GAME_CONFIG.buildRadius ?? 4;
    const zone = new Uint8Array(this.rows * this.cols);
    const mark = (row, col) => {
      for (let r = row - R; r <= row + R; r++) {
        for (let c = col - R; c <= col + R; c++) {
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          if (Math.hypot(r - row, c - col) <= R) zone[r * this.cols + c] = 1;
        }
      }
    };
    for (const c of this.castleCells) mark(c.row, c.col);
    for (const line of this.grid.cells) for (const c of line) if (c.occupant) mark(c.row, c.col);
    this.zone = zone;
    this.zoneVersion++;
  }

  inBuildZone(row, col) { return this.zone[row * this.cols + col] === 1; }

  // Centros (3D) das células livres onde dá para construir agora: construíveis, vazias e dentro da área.
  buildSpots() {
    const out = [];
    for (const line of this.grid.cells) {
      for (const c of line) {
        if (!c.buildable || c.occupant || !this.inBuildZone(c.row, c.col)) continue;
        out.push(this.gridToWorld(c.row, c.col));
      }
    }
    return out;
  }

  getCell(row, col) { return this.grid.get(row, col); }

  worldToGrid({ x, z }) {
    return {
      row: Math.floor((z + this.height / 2) / this.cellSize),
      col: Math.floor((x + this.width / 2) / this.cellSize)
    };
  }

  // Centro 3D da célula (ou do conjunto de células de um footprint).
  gridToWorld(row, col, footprint = { width: 1, height: 1 }) {
    return {
      x: (col + footprint.width / 2) * this.cellSize - this.width / 2,
      z: (row + footprint.height / 2) * this.cellSize - this.height / 2
    };
  }

  getFootprintCells(row, col, footprint) {
    const cells = [];
    for (let r = 0; r < footprint.height; r++) {
      for (let c = 0; c < footprint.width; c++) {
        const cell = this.getCell(row + r, col + c);
        if (!cell) return null;
        cells.push(cell);
      }
    }
    return cells;
  }

  canBuild(type, row, col) { return this.validator.validate(type, row, col); }

  occupy(row, col, footprint, owner) {
    this.getFootprintCells(row, col, footprint)?.forEach((c) => (c.occupant = owner));
    this.rebuildZone();     // a área de construção se expande ao redor da nova construção
    // Peso da construção (campo `threat` em Data.js): faz o inimigo evitar a região.
    // O raio de influência é o próprio alcance da torre (combat.range, em unidades 3D → células).
    const data = TOWERS[owner?.type];
    const weight = data?.threat?.weight;
    if (weight && data.combat?.range) {
      this.threats.push({ row, col, footprint, owner, weight, radius: data.combat.range / this.cellSize });
      this.rebuildDanger();
    }
  }

  release(row, col, footprint) {
    this.getFootprintCells(row, col, footprint)?.forEach((c) => (c.occupant = null));
    this.rebuildZone();
    const before = this.threats.length;
    this.threats = this.threats.filter((t) => !(t.row === row && t.col === col));
    if (this.threats.length !== before) this.rebuildDanger();
  }

  // Chamado depois de evoluir uma torre: o alcance mudou, então o raio de influência também.
  refreshThreat(owner) {
    const t = this.threats.find((x) => x.owner === owner);
    if (!t) return;
    t.radius = owner.range / this.cellSize;
    this.rebuildDanger();
  }

  // Recalcula o perigo de cada célula: soma, para cada torre, de
  // weight * (1 - distância / (radius + 1)) dentro do raio (em células).
  rebuildDanger() {
    for (const line of this.grid.cells) for (const c of line) c.danger = 0;
    for (const t of this.threats) {
      const cy = t.row + (t.footprint.height - 1) / 2;
      const cx = t.col + (t.footprint.width - 1) / 2;
      const reach = Math.ceil(t.radius) + 1;
      for (let r = Math.floor(cy) - reach; r <= Math.ceil(cy) + reach; r++) {
        for (let c = Math.floor(cx) - reach; c <= Math.ceil(cx) + reach; c++) {
          const cell = this.getCell(r, c);
          if (!cell) continue;
          const d = Math.hypot(c - cx, r - cy);
          if (d <= t.radius) cell.danger += t.weight * (1 - d / (t.radius + 1));
        }
      }
    }
  }

  // Sem `target`, o destino é o castelo. Retorna lista de células ou null.
  findPath(start, target = null, opts = {}) {
    const goals = target ? [target] : this.castleCells;
    // A célula inicial nunca é considerada bloqueada (inimigo pode estar "dentro" dela).
    const startCell = this.getCell(start.row, start.col);
    if (!startCell) return null;
    const saved = startCell.occupant;
    startCell.occupant = null;
    const path = this.pathfinding.find(start, goals, opts);
    startCell.occupant = saved;
    return path;
  }

  // Multiplicador de velocidade do terreno sob uma posição 3D.
  speedAt(pos) {
    const { row, col } = this.worldToGrid(pos);
    return this.getCell(row, col)?.speedFactor ?? 1;
  }

  getSpawnPoints() { return this.spawns; }

  getCastlePosition() {
    const n = this.castleCells.length || 1;
    let row = 0, col = 0;
    this.castleCells.forEach((c) => { row += c.row; col += c.col; });
    row /= n; col /= n;
    return {
      x: (col + 0.5) * this.cellSize - this.width / 2,
      z: (row + 0.5) * this.cellSize - this.height / 2,
      cells: this.castleCells.map((c) => ({ row: c.row, col: c.col }))
    };
  }

  // Descrição do terreno para quem for desenhá-lo (ordem row-major).
  describe() {
    const cells = [];
    for (const row of this.grid.cells) {
      for (const cell of row) {
        const p = this.gridToWorld(cell.row, cell.col);
        cells.push({ row: cell.row, col: cell.col, type: cell.type, x: p.x, z: p.z });
      }
    }
    return { rows: this.rows, cols: this.cols, cellSize: this.cellSize, cells };
  }
}