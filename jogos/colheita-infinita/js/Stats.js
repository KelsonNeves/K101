// Stats.js — aplica habilidades E compras da loja (tudo em `owned`) sobre BASE_STATS.
import { BASE_STATS, LIMITS, START_CROPS, STAT_KEYS, DRONE_IDS } from './Data.js';
import { SKILL_BY_ID } from './Skills.js';
import { ITEM_BY_ID } from './Shop.js';

const get = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

export function computeStats(ownedIds) {
  const add = {}, mul = {}, crops = new Set(START_CROPS), plows = new Set();
  for (const id of ownedIds) {
    const item = SKILL_BY_ID[id] ?? ITEM_BY_ID[id];
    if (!item) continue;
    for (const e of item.effects) {
      if (e.unlock === 'crop') crops.add(e.id);
      else if (e.unlock === 'plow') plows.add(e.index);
      else if (e.add !== undefined) add[e.stat] = (add[e.stat] ?? 0) + e.add;
      else if (e.mul !== undefined) mul[e.stat] = (mul[e.stat] ?? 1) * e.mul;
    }
  }
  const S = structuredClone(BASE_STATS);
  for (const key of STAT_KEYS) {
    const v = (get(BASE_STATS, key) + (add[key] ?? 0)) * (mul[key] ?? 1);
    const [lo, hi] = LIMITS[key] ?? [-Infinity, Infinity];
    set(S, key, Math.min(hi, Math.max(lo, v)));
  }
  S.grid.cols = Math.round(S.grid.cols);
  S.grid.rows = Math.round(S.grid.rows);
  S.plows.forEach((p, i) => { p.owned = plows.has(i); p.cols = Math.round(p.cols); p.rows = Math.round(p.rows); });
  for (const id of DRONE_IDS) S.drones[id].count = Math.round(S.drones[id].count);
  S.unlockedCrops = [...crops];
  return S;
}
