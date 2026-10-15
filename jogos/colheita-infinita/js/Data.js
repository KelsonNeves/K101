// Data.js — constantes e balanceamento. Somente DADOS (sem lógica de jogo).
export const CELL = 1;
export const MAX_COLS = 12, MAX_ROWS = 12;           // capacidade das InstancedMesh
export const TOUCH_OFFSET_PX = 40;                   // anel acima do dedo (0 = exatamente no dedo)
export const RADIAL_TIME_SCALE = 1;                  // 1 = relógio normal com o menu aberto; 0.25 = câmera lenta
export const START_CROPS = ['trigo'];

export const BASE_STATS = {
  dayLength: 30,
  plant:   { radius: 1.5, cooldown: 1.0 },
  water:   { radius: 1.5, cooldown: 1.0 },
  harvest: { radius: 1.5, cooldown: 1.0 },
  grid:    { cols: 6, rows: 6 },
  growthSpeed: 1,
  valueMult: 1
};
// Todos os caminhos numéricos de BASE_STATS, ex.: 'plant.radius'
export const STAT_KEYS = ['dayLength', 'plant.radius', 'plant.cooldown', 'water.radius', 'water.cooldown',
  'harvest.radius', 'harvest.cooldown', 'grid.cols', 'grid.rows', 'growthSpeed', 'valueMult'];

export const LIMITS = {                              // [mínimo, máximo]
  dayLength: [10, 90],
  'plant.radius': [0.5, 4], 'water.radius': [0.5, 4], 'harvest.radius': [0.5, 4],
  'plant.cooldown': [0.25, 5], 'water.cooldown': [0.25, 5], 'harvest.cooldown': [0.25, 5],
  'grid.cols': [3, MAX_COLS], 'grid.rows': [3, MAX_ROWS],
  growthSpeed: [0.25, 3], valueMult: [0.1, 100000]
};

export const STAT_LABELS = {                         // textos automáticos da árvore
  dayLength: 'Duração do dia (s)', 'plant.radius': 'Raio de semear', 'water.radius': 'Raio de aguar',
  'harvest.radius': 'Raio de colher', 'plant.cooldown': 'Ciclo de semear', 'water.cooldown': 'Ciclo de aguar',
  'harvest.cooldown': 'Ciclo de colher', 'grid.cols': 'Colunas', 'grid.rows': 'Linhas',
  growthSpeed: 'Velocidade de crescimento', valueMult: 'Valor da colheita'
};

export const PALETTE = {                             // cores do MUNDO 3D (a interface usa tema.css)
  grass: 0x6fae4a, soilEmpty: 0x7a5230, soilWet: 0x4d321c, sky: 0xbfe3f5,
  ring: { plant: 0x9be564, water: 0x58b8ff, harvest: 0xffd24a },
  dirt: 0x7a5230, drops: 0x58b8ff, leaves: 0x7bd45a
};

export const TOOLS = {
  plant:   { id: 'plant', name: 'Semear', group: 'plant', sfx: 'plant', vfx: 'dirt',
             canTarget: (c) => c.state === 'empty',
             apply: (c, g) => g.grid.sow(c, g.selection.crop) },
  water:   { id: 'water', name: 'Aguar', group: 'water', sfx: 'water', vfx: 'drops', icon: 'assets/icons/tools/water.webp',
             canTarget: (c) => c.state === 'dry',
             apply: (c, g) => g.grid.water(c) },
  harvest: { id: 'harvest', name: 'Colher', group: 'harvest', sfx: 'harvest', vfx: 'leaves', icon: 'assets/icons/tools/harvest.webp',
             canTarget: (c) => c.state === 'ripe',
             apply: (c, g) => g.harvestCell(c) }
};
