// Grid.js — dados das células de TODOS os campos e transições (semear, regar, crescer, colher). Sem Three.js.
import { CELL } from './Data.js';
import { CROPS } from './Crops.js';

export class Grid {
  constructor({ reduceMotion = false } = {}) {
    this.cells = [];
    this.reduceMotion = reduceMotion;
  }

  // `fields` vem de Fields.layoutFields: [{ id, cols, rows, x, z }]. Cada campo é centrado no seu (x, z).
  reset(fields) {
    this.cells = [];
    for (const f of fields) {
      for (let row = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++) {
          this.cells.push({
            field: f.id, col, row,
            x: f.x + (col - (f.cols - 1) / 2) * CELL,
            z: f.z + (row - (f.rows - 1) / 2) * CELL,
            state: 'empty', crop: null, t: 0, stage: 1, pop: 1,
            rot: 0, size: 1
          });
        }
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

  // Todos os campos crescem ao mesmo tempo, mesmo o que o jogador não está olhando.
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

  // `field` (opcional): só as células desse campo.
  cellsInCircle(x, z, r, field = null) {
    const r2 = r * r, out = [];
    for (const c of this.cells) {
      if (field !== null && c.field !== field) continue;
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz <= r2) out.push(c);
    }
    return out;                                                    // máx. 720 células: varrer todas é barato
  }
}
