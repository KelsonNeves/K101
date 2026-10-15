// Stats.js — aplica as habilidades compradas sobre BASE_STATS.
import { BASE_STATS, LIMITS, START_CROPS, STAT_KEYS } from './Data.js';
import { SKILL_BY_ID } from './Skills.js';

const get = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

export function computeStats(ownedIds) {
  const add = {}, mul = {}, crops = new Set(START_CROPS);
  for (const id of ownedIds) {
    const skill = SKILL_BY_ID[id];
    if (!skill) continue;
    for (const e of skill.effects) {
      if (e.unlock === 'crop') crops.add(e.id);
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
  S.unlockedCrops = [...crops];
  return S;
}
