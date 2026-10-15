// Skills.js — DADOS da árvore. Edite aqui para criar, mover ou remover habilidades.
export const TREE = { spacing: 150, nodeSize: 84 };   // px por unidade de «at»

// Atalho: cria uma fila de níveis encadeados (I, II, III…); cada nível é filho do anterior.
// O 1º nível nasce em `at` e os seguintes andam `step` a cada nível.
function chain({ id, parent, at, step, name, desc, icon, costs, effects }) {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  return costs.map((cost, i) => ({
    id: `${id}-${i + 1}`,
    parent: i === 0 ? parent : `${id}-${i}`,
    at: [at[0] + step[0] * i, at[1] + step[1] * i],
    name: `${name} ${ROMAN[i]}`,
    desc, icon, cost, effects
  }));
}

export const SKILLS = [
  // RAIZ: a única habilidade visível no começo. Custo 0 = de graça.
  { id: 'raiz', parent: null, at: [0, 0], name: 'Mãos na terra', icon: 'raiz.webp', cost: 0,
    desc: 'Sua jornada começa aqui. As colheitas valem 10% mais.',
    effects: [{ stat: 'valueMult', mul: 1.1 }] },

  // NORTE — semear
  ...chain({ id: 'semear-raio', parent: 'raiz', at: [0, -1], step: [0, -1], name: 'Semeadura ampla',
    icon: 'semear-raio.webp', costs: [20, 45, 90, 180], effects: [{ stat: 'plant.radius', add: 0.25 }] }),
  ...chain({ id: 'semear-ciclo', parent: 'semear-raio-1', at: [1, -1], step: [1, 0], name: 'Semeadura rápida',
    icon: 'semear-ciclo.webp', costs: [30, 60, 120], effects: [{ stat: 'plant.cooldown', mul: 0.9 }] }),

  // LESTE — aguar
  ...chain({ id: 'agua-raio', parent: 'raiz', at: [1, 0], step: [1, 0], name: 'Regador amplo',
    icon: 'agua-raio.webp', costs: [20, 45, 90, 180], effects: [{ stat: 'water.radius', add: 0.25 }] }),
  ...chain({ id: 'agua-ciclo', parent: 'agua-raio-1', at: [1, 1], step: [1, 0], name: 'Regador rápido',
    icon: 'agua-ciclo.webp', costs: [30, 60, 120], effects: [{ stat: 'water.cooldown', mul: 0.9 }] }),
  ...chain({ id: 'crescer', parent: 'agua-ciclo-1', at: [1, 2], step: [0, 1], name: 'Terra fértil',
    desc: 'As plantas crescem 15% mais rápido.',
    icon: 'crescer.webp', costs: [40, 90, 200], effects: [{ stat: 'growthSpeed', mul: 1.15 }] }),

  // SUL — colher
  ...chain({ id: 'colher-raio', parent: 'raiz', at: [0, 1], step: [0, 1], name: 'Foice larga',
    icon: 'colher-raio.webp', costs: [20, 45, 90, 180], effects: [{ stat: 'harvest.radius', add: 0.25 }] }),
  ...chain({ id: 'colher-ciclo', parent: 'colher-raio-1', at: [-1, 1], step: [-1, 0], name: 'Foice rápida',
    icon: 'colher-ciclo.webp', costs: [30, 60, 120], effects: [{ stat: 'harvest.cooldown', mul: 0.9 }] }),
  // Duração do dia: «Dia mais longo» soma segundos (5 níveis); «Amanhecer cedo» ramifica do nível II e multiplica.
  ...chain({ id: 'dia-longo', parent: 'colher-ciclo-1', at: [-1, 2], step: [0, 1], name: 'Dia mais longo',
    desc: 'O dia dura 5 segundos a mais.',
    icon: 'dia-longo.webp', costs: [50, 120, 260, 500, 900], effects: [{ stat: 'dayLength', add: 5 }] }),
  ...chain({ id: 'dia-sol', parent: 'dia-longo-2', at: [-2, 3], step: [-1, 0], name: 'Amanhecer cedo',
    desc: 'O dia dura 10% mais.',
    icon: 'dia-sol.webp', costs: [150, 350, 700], effects: [{ stat: 'dayLength', mul: 1.1 }] }),

  // OESTE — terra e plantas
  ...chain({ id: 'terra-grade', parent: 'raiz', at: [-1, 0], step: [-1, 0], name: 'Mais terra',
    desc: 'A grade ganha 1 coluna e 1 linha.',
    icon: 'terra-grade.webp', costs: [40, 100, 220, 450, 900],
    effects: [{ stat: 'grid.cols', add: 1 }, { stat: 'grid.rows', add: 1 }] }),
  { id: 'milho', parent: 'terra-grade-1', at: [-1, -1], name: 'Milho', icon: 'milho.webp', cost: 60,
    desc: 'Libera a semente de milho (vale mais que o trigo).', effects: [{ unlock: 'crop', id: 'milho' }] },
  { id: 'cenoura', parent: 'milho', at: [-2, -1], name: 'Cenoura', icon: 'cenoura.webp', cost: 150,
    effects: [{ unlock: 'crop', id: 'cenoura' }] },
  { id: 'tomate', parent: 'cenoura', at: [-3, -1], name: 'Tomate', icon: 'tomate.webp', cost: 320,
    effects: [{ unlock: 'crop', id: 'tomate' }] },
  ...chain({ id: 'preco', parent: 'milho', at: [-1, -2], step: [0, -1], name: 'Preço justo',
    desc: 'As colheitas valem 15% mais.',
    icon: 'preco.webp', costs: [80, 200], effects: [{ stat: 'valueMult', mul: 1.15 }] })
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Validador: roda no carregamento e imprime erros no console.
export function validateSkills(list, crops, statKeys) {
  const errs = [], byId = new Map(), at = new Map();
  for (const s of list) {
    if (byId.has(s.id)) errs.push(`id repetido: ${s.id}`);
    byId.set(s.id, s);
    const key = s.at.join(',');
    if (at.has(key)) errs.push(`${s.id} e ${at.get(key)} estão na mesma posição (${key})`);
    at.set(key, s.id);
    if (!Number.isFinite(s.cost) || s.cost < 0) errs.push(`${s.id}: custo inválido`);
    if (!s.effects?.length) errs.push(`${s.id}: sem efeitos`);
    for (const e of s.effects ?? []) {
      if (e.unlock === 'crop' ? !crops[e.id] : !statKeys.includes(e.stat))
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
