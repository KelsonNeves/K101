// Grid.js — dados das células e transições (semear, regar, crescer, colher). Sem Three.js.
import { CELL } from './Data.js';
import { CROPS } from './Crops.js';

export class Grid {
  constructor({ reduceMotion = false } = {}) {
    this.cols = 0; this.rows = 0; this.cells = [];
    this.reduceMotion = reduceMotion;
  }

  // Cria uma grade vazia centrada na origem.
  reset(cols, rows) {
    this.cols = cols; this.rows = rows; this.cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.cells.push({
          col, row,
          x: (col - (cols - 1) / 2) * CELL,
          z: (row - (rows - 1) / 2) * CELL,
          state: 'empty', crop: null, t: 0, stage: 1, pop: 1,
          rot: 0, size: 1
        });
      }
    }
  }

  sow(c, cropId) {
    Object.assign(c, {
      state: 'dry', crop: cropId, t: 0, stage: 1,
      pop: this.reduceMotion ? 1 : 0.4,
      rot: Math.random() * Math.PI * 2,
      size: 0.95 + Math.random() * 0.1
    });
  }

  water(c) { c.state = 'growing'; if (!this.reduceMotion) c.pop = 0.8; }

  harvest(c) { Object.assign(c, { state: 'empty', crop: null, t: 0, stage: 1, pop: 1 }); }

  update(dt, S) {
    for (const c of this.cells) {
      if (c.state === 'growing') {
        c.t += dt * S.growthSpeed;
        const p = c.t / CROPS[c.crop].growTime;                    // 0..1
        const stage = p >= 1 ? 5 : 1 + Math.floor(p * 4);
        if (stage !== c.stage) { c.stage = stage; if (!this.reduceMotion) c.pop = 0.6; }
        if (p >= 1) c.state = 'ripe';
      }
      if (c.pop < 1) c.pop = Math.min(1, c.pop + dt * 4);
    }
  }

  cellsInCircle(x, z, r) {
    const r2 = r * r, out = [];
    for (const c of this.cells) {
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz <= r2) out.push(c);
    }
    return out;                                                    // máx. 144 células: varrer todas é barato
  }
}
