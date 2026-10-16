// Shop.js — DADOS da loja: só drones. Os arados (novos campos) e o tamanho deles ficam na árvore de habilidades (Skills.js).
// Cada item é como uma habilidade: `effects` alimentam Stats.js. `requires` = id que precisa já ter sido comprado.
// Compras ficam no mesmo conjunto `owned` das habilidades (e vão para o mesmo save).
import { DRONE_IDS, DRONE_INFO, STAT_KEYS } from './Data.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const fmt = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ---- preços (balanceamento) ----
const DRONE_COSTS = { plant: 300, water: 300, harvest: 450 };
const DRONE_SPEED_COSTS = [120, 260, 520, 1000, 1900];          // -15% no ciclo por nível
const DRONE_RANGE_COSTS = [150, 320, 650, 1300];                // +0,25 de alcance por nível
const DRONE_FLEET_COSTS = [600, 1500];                          // +1 drone do mesmo tipo (máx. 3)

export const SHOP_ITEMS = [];   // todos os itens compráveis
export const SHOP_CARDS = [];   // como a loja agrupa os itens na tela

const add = (item) => { SHOP_ITEMS.push(item); return item.id; };
// Escada de níveis encadeados: o 1º exige `requires`, cada seguinte exige o anterior. Devolve os ids.
const ladder = ({ id, name, desc, costs, requires, effects }) => costs.map((cost, i) => add({
  id: `${id}-${i + 1}`, name: `${name} ${ROMAN[i]}`, desc, cost,
  requires: i === 0 ? requires : `${id}-${i}`, effects
}));

// --------------------------------- DRONES ---------------------------------
for (const id of DRONE_IDS) {
  const info = DRONE_INFO[id];
  const buy = add({
    id: `drone-${id}`, name: info.name, cost: DRONE_COSTS[id], requires: null, desc: info.blurb,
    effects: [{ stat: `drones.${id}.count`, add: 1 }]
  });
  const speed = ladder({
    id: `drone-${id}-vel`, name: 'Velocidade', desc: 'O drone trabalha 15% mais rápido.',
    costs: DRONE_SPEED_COSTS, requires: buy, effects: [{ stat: `drones.${id}.cooldown`, mul: 0.85 }]
  });
  const range = ladder({
    id: `drone-${id}-alc`, name: 'Alcance', desc: 'O drone age numa área maior.',
    costs: DRONE_RANGE_COSTS, requires: buy, effects: [{ stat: `drones.${id}.radius`, add: 0.25 }]
  });
  const fleet = ladder({
    id: `drone-${id}-frota`, name: 'Frota', desc: 'Mais um drone do mesmo tipo trabalhando junto.',
    costs: DRONE_FLEET_COSTS, requires: buy, effects: [{ stat: `drones.${id}.count`, add: 1 }]
  });
  SHOP_CARDS.push({
    id: `drone-${id}`, tab: 'drones', icon: info.icon, title: info.name, blurb: info.blurb,
    status: (S) => {
      const d = S.drones[id];
      return d.count > 0 ? `${d.count} em campo · ciclo ${fmt(d.cooldown)} s · alcance ${fmt(d.radius)}` : 'Ainda não comprado';
    },
    rows: [
      { label: 'Drone', ids: [buy] },
      { label: 'Velocidade', ids: speed },
      { label: 'Alcance', ids: range },
      { label: 'Frota', ids: fleet }
    ]
  });
}

export const ITEM_BY_ID = Object.fromEntries(SHOP_ITEMS.map((s) => [s.id, s]));

// Validador: roda no carregamento e imprime erros no console.
export function validateShop(statKeys = STAT_KEYS) {
  const errs = [], seen = new Set();
  for (const it of SHOP_ITEMS) {
    if (seen.has(it.id)) errs.push(`id repetido: ${it.id}`);
    seen.add(it.id);
    if (!Number.isFinite(it.cost) || it.cost <= 0) errs.push(`${it.id}: custo inválido`);
    if (it.requires && !ITEM_BY_ID[it.requires]) errs.push(`${it.id}: requisito inexistente (${it.requires})`);
    if (!it.effects?.length) errs.push(`${it.id}: sem efeitos`);
    for (const e of it.effects ?? []) {
      const ok = statKeys.includes(e.stat);
      if (!ok) errs.push(`${it.id}: efeito inválido ${JSON.stringify(e)}`);
    }
  }
  for (const c of SHOP_CARDS) {
    for (const r of c.rows) for (const id of r.ids) if (!ITEM_BY_ID[id]) errs.push(`${c.id}: item inexistente (${id})`);
  }
  errs.forEach((m) => console.error('[Shop]', m));
  return errs;
}
