// Fields.js — onde ficam os campos no mundo e quem é vizinho de quem. Só dados, sem Three.js.
// O campo principal fica no centro; cada arado comprado vai para um lado fixo (direita, esquerda, cima, baixo).
// A distância é grande (FIELD_GAP), então só o campo em vista aparece; a câmera desliza até o vizinho.
import { FIELD_DIRS, FIELD_GAP } from './Data.js';

export const OPPOSITE = { right: 'left', left: 'right', up: 'down', down: 'up' };
const DIR_VEC = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };

// S = estatísticas atuais (Stats.js). Devolve [principal, ...arados comprados], cada um com id = posição na lista.
export function layoutFields(S) {
  const main = { id: 0, key: 'main', dir: null, index: -1, name: 'Campo principal', cols: S.grid.cols, rows: S.grid.rows, x: 0, z: 0 };
  const list = [main];
  FIELD_DIRS.forEach((dir, i) => {
    const p = S.plows[i];
    if (!p.owned) return;
    const [vx, vz] = DIR_VEC[dir];
    list.push({
      id: list.length, key: dir, dir, index: i, name: `Arado ${i + 1}`, cols: p.cols, rows: p.rows,
      x: vx * ((main.cols + p.cols) / 2 + FIELD_GAP),
      z: vz * ((main.rows + p.rows) / 2 + FIELD_GAP)
    });
  });
  return list;
}

// Setas disponíveis a partir de `current`: do principal, uma para cada arado; de um arado, só a de volta.
export function neighbors(fields, current) {
  const f = fields[current];
  if (!f) return [];
  if (f.dir === null) return fields.filter((o) => o.dir !== null).map((o) => ({ dir: o.dir, field: o }));
  return [{ dir: OPPOSITE[f.dir], field: fields[0] }];
}
