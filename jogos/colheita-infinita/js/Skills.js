// Skills.js — DADOS da árvore. Edite aqui para criar, mover ou remover habilidades.
import { FIELD_DIRS } from './Data.js';

export const TREE = { spacing: 150, nodeSize: 92 };   // px por unidade de «at»

// `needs` (opcional): id de um item da loja que precisa estar comprado para a habilidade aparecer (ver isVisible em Game.js).
// Atalho: cria uma fila de níveis encadeados (I, II, III…); cada nível é filho do anterior.
// O 1º nível nasce em `at` e os seguintes andam `step` a cada nível.
function chain({ id, parent, at, step, name, desc, icon, costs, effects, needs }) {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  return costs.map((cost, i) => ({
    id: `${id}-${i + 1}`,
    parent: i === 0 ? parent : `${id}-${i}`,
    at: [at[0] + step[0] * i, at[1] + step[1] * i],
    name: `${name} ${ROMAN[i]}`,
    desc, icon, cost, effects, ...(needs ? { needs } : {})
  }));
}

export const SKILLS = [
  // RAIZ: a única habilidade visível no começo. Custo 0 = de graça.
  { id: 'raiz', parent: null, at: [0, 0], name: 'Mãos na terra', icon: 'raiz.webp', cost: 0,
    desc: 'Sua jornada começa aqui. As colheitas valem 10% mais.',
    effects: [{ stat: 'valueMult', mul: 1.1 }] },

  // NORTE — semear
  ...chain({ id: 'semear-raio', parent: 'raiz', at: [0, -1], step: [0, -1], name: 'Semeadura ampla',
    icon: 'semear-raio.webp', costs: [20, 100, 1000, 2500], effects: [{ stat: 'plant.radius', add: 0.375 }] }),
  ...chain({ id: 'semear-ciclo', parent: 'semear-raio-1', at: [1, -1], step: [1, 0], name: 'Semeadura rápida',
    icon: 'semear-ciclo.webp', costs: [30, 250, 1500], effects: [{ stat: 'plant.cooldown', mul: 0.85 }] }),

  // LESTE — aguar
  ...chain({ id: 'agua-raio', parent: 'raiz', at: [1, 0], step: [1, 0], name: 'Regador amplo',
    icon: 'agua-raio.webp', costs: [20, 100, 1000, 2500], effects: [{ stat: 'water.radius', add: 0.375 }] }),
  ...chain({ id: 'agua-ciclo', parent: 'agua-raio-1', at: [1, 1], step: [1, 0], name: 'Regador rápido',
    icon: 'agua-ciclo.webp', costs: [30, 250, 1500], effects: [{ stat: 'water.cooldown', mul: 0.85 }] }),
  ...chain({ id: 'crescer', parent: 'agua-ciclo-1', at: [1, 2], step: [0, 1], name: 'Terra fértil',
    desc: 'As plantas crescem 15% mais rápido.',
    icon: 'crescer.webp', costs: [40, 500, 2000], effects: [{ stat: 'growthSpeed', mul: 1.15 }] }),

  // SUL — colher
  ...chain({ id: 'colher-raio', parent: 'raiz', at: [0, 1], step: [0, 1], name: 'Foice larga',
    icon: 'colher-raio.webp', costs: [20, 100, 1000, 2500], effects: [{ stat: 'harvest.radius', add: 0.375 }] }),
  ...chain({ id: 'colher-ciclo', parent: 'colher-raio-1', at: [-1, 1], step: [-1, 0], name: 'Foice rápida',
    icon: 'colher-ciclo.webp', costs: [30, 250, 1500], effects: [{ stat: 'harvest.cooldown', mul: 0.85 }] }),
  // Duração do dia: «Dia mais longo» soma 40 s por nível (5 níveis) e «Amanhecer cedo» ramifica do nível II e multiplica (3 níveis).
  // Tudo comprado: (30 + 5×40) × 1,1³ ≈ 306 s (~5 min). Alcance: raio 1,0 + 4 × 0,375 = 2,5 (o mesmo do último nível antigo).
  ...chain({ id: 'dia-longo', parent: 'colher-ciclo-1', at: [-1, 2], step: [0, 1], name: 'Dia mais longo',
    desc: 'O dia dura 40 segundos a mais.',
    icon: 'dia-longo.webp', costs: [50, 500, 1200, 2500, 5000], effects: [{ stat: 'dayLength', add: 40 }] }),
  ...chain({ id: 'dia-sol', parent: 'dia-longo-2', at: [-2, 3], step: [-1, 0], name: 'Amanhecer cedo',
    desc: 'O dia dura 10% mais.',
    icon: 'dia-sol.webp', costs: [150, 500, 2500], effects: [{ stat: 'dayLength', mul: 1.1 }] }),

  // OESTE — terra e plantas
  ...chain({ id: 'terra-grade', parent: 'raiz', at: [-1, 0], step: [-1, 0], name: 'Mais terra',
    desc: 'A grade ganha 2 colunas e 2 linhas.',
    icon: 'terra-grade.webp', costs: [40, 150, 1000, 2500, 5000],
    effects: [{ stat: 'grid.cols', add: 2 }, { stat: 'grid.rows', add: 2 }] }),
  { id: 'milho', parent: 'terra-grade-1', at: [-1, -1], name: 'Milho', icon: 'milho.webp', cost: 60,
    desc: 'Libera o milho.', effects: [{ unlock: 'crop', id: 'milho' }] },
  { id: 'cenoura', parent: 'milho', at: [-2, -1], name: 'Cenoura', icon: 'cenoura.webp', cost: 500,
    desc: 'Libera a cenoura.',
    effects: [{ unlock: 'crop', id: 'cenoura' }] },
  { id: 'tomate', parent: 'cenoura', at: [-3, -1], name: 'Tomate', icon: 'tomate.webp', cost: 2500,
    desc: 'Libera o tomate.',
    effects: [{ unlock: 'crop', id: 'tomate' }] },
  { id: 'indigo', parent: 'tomate', at: [-4, -1], name: 'Índigo', icon: 'indigo.webp', cost: 5000,
    desc: 'Libera o indigo.',
    effects: [{ unlock: 'crop', id: 'indigo' }] },
  ...chain({ id: 'preco', parent: 'milho', at: [-1, -2], step: [0, -1], name: 'Preço justo',
    desc: 'As colheitas valem 15% mais.',
    icon: 'preco.webp', costs: [80, 350], effects: [{ stat: 'valueMult', mul: 1.15 }] }),

  // ARADOS — cada arado extra se COMPRA aqui (nó «Arado N») e o tamanho dele cresce na fila «Terra do arado N».
  // Os nós de tamanho nascem do nó de compra, então só aparecem depois que o arado é comprado.
  ...[
    { n: 1, dir: 'à direita',  parent: 'agua-ciclo-2', at: [2, 2],  step: [0, 1],  cost: 1200,  sizes: [60, 750, 1500, 3000, 6000] },
    { n: 2, dir: 'à esquerda', parent: 'tomate',       at: [-3, -2], step: [0, -1], cost: 1200,  sizes: [60, 750, 1500, 3000, 6000] },
    { n: 3, dir: 'em cima',    parent: 'semear-raio-3', at: [1, -3], step: [1, 0],  cost: 1200, sizes: [60, 750, 1500, 3000, 6000] },
    { n: 4, dir: 'embaixo',    parent: 'crescer-3',    at: [1, 5],  step: [0, 1],  cost: 1200, sizes: [60, 750, 1500, 3000, 6000] }
  ].flatMap((p) => [
    { id: `arado-${p.n}`, parent: p.parent, at: p.at, name: `Arado ${p.n}`, icon: 'terra-arado.webp', cost: p.cost,
      desc: `Um novo campo ${p.dir} do principal, começando em 3×3. Chegue nele pela seta na borda da tela.`,
      effects: [{ unlock: 'plow', index: p.n - 1 }] },
    ...chain({ id: `arado${p.n}-terra`, parent: `arado-${p.n}`, at: [p.at[0] + p.step[0], p.at[1] + p.step[1]], step: p.step,
      name: `Terra do arado ${p.n}`, desc: `O arado ${p.n} (${p.dir}) ganha 2 colunas e 2 linhas.`, icon: 'terra-arado.webp',
      costs: p.sizes, effects: [{ stat: `plows.${p.n - 1}.cols`, add: 2 }, { stat: `plows.${p.n - 1}.rows`, add: 2 }] })
  ])
];


export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Validador: roda no carregamento e imprime erros no console.
export function validateSkills(list, crops, statKeys, shopIds = null) {
  const errs = [], byId = new Map(), at = new Map();
  for (const s of list) {
    if (byId.has(s.id)) errs.push(`id repetido: ${s.id}`);
    byId.set(s.id, s);
    const key = s.at.join(',');
    if (at.has(key)) errs.push(`${s.id} e ${at.get(key)} estão na mesma posição (${key})`);
    at.set(key, s.id);
    if (!Number.isFinite(s.cost) || s.cost < 0) errs.push(`${s.id}: custo inválido`);
    if (!s.effects?.length) errs.push(`${s.id}: sem efeitos`);
    if (s.needs && shopIds && !shopIds.has(s.needs)) errs.push(`${s.id}: item da loja inexistente (${s.needs})`);
    for (const e of s.effects ?? []) {
      const bad = e.unlock === 'crop' ? !crops[e.id]
        : e.unlock === 'plow' ? !(Number.isInteger(e.index) && e.index >= 0 && e.index < FIELD_DIRS.length)
        : !statKeys.includes(e.stat);
      if (bad)
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