// Data.js — constantes e balanceamento. Somente DADOS (sem lógica de jogo).
export const CELL = 1;
export const MAX_COLS = 12, MAX_ROWS = 12;           // tamanho máximo de UM campo
export const FIELD_DIRS = ['right', 'left', 'up', 'down'];   // onde cada arado comprado aparece (arado 1 = direita…)
export const MAX_FIELDS = 1 + FIELD_DIRS.length;     // principal + arados
export const MAX_CELLS = MAX_FIELDS * MAX_COLS * MAX_ROWS;   // capacidade das InstancedMesh (todos os campos juntos)
export const FIELD_GAP = 12;                         // vão entre as bordas de dois campos: o vizinho não aparece na tela
export const TOUCH_OFFSET_PX = 40;                   // anel acima do dedo (0 = exatamente no dedo)
export const RADIAL_TIME_SCALE = 1;                  // 1 = relógio normal com o menu aberto; 0.25 = câmera lenta
export const START_CROPS = ['trigo'];

export const DRONE_IDS = ['plant', 'water', 'harvest'];
export const DRONE_INFO = {                          // textos, ícones (assets/icons/shop/) e modelos (assets/models/drones/<id>.glb)
  plant:   { id: 'plant',   name: 'Drone semeador',  icon: 'drone-plant.webp',   color: 0x9be564,
             blurb: 'Voa sozinho e semeia as terras vazias com a semente escolhida no momento.' },
  water:   { id: 'water',   name: 'Drone regador',   icon: 'drone-water.webp',   color: 0x58b8ff,
             blurb: 'Voa sozinho e rega as plantas que ainda estão secas.' },
  harvest: { id: 'harvest', name: 'Drone colhedor',  icon: 'drone-harvest.webp', color: 0xffd24a,
             blurb: 'Voa sozinho e colhe o que já está maduro. O dinheiro conta como se fosse seu.' }
};

const PLOW = { owned: false, cols: 3, rows: 3 };     // arado novo: começa pequeno; a árvore de habilidades o amplia
const DRONE = (cooldown) => ({ count: 0, cooldown, radius: 0.6 });   // radius 0,6 = uma célula por vez

export const BASE_STATS = {
  dayLength: 30,
  plant:   { radius: 1.0, cooldown: 1.0 },           // raio 1,0 = diâmetro de 2 células
  water:   { radius: 1.0, cooldown: 1.0 },
  harvest: { radius: 1.0, cooldown: 1.0 },
  grid:    { cols: 3, rows: 3 },                     // campo principal (começa 3×3, como os arados)
  plows:   FIELD_DIRS.map(() => ({ ...PLOW })),      // arados 1..4
  drones:  { plant: DRONE(1.4), water: DRONE(1.0), harvest: DRONE(1.4) },
  growthSpeed: 1,
  valueMult: 1
};
// Todos os caminhos numéricos de BASE_STATS, ex.: 'plant.radius'
export const STAT_KEYS = ['dayLength', 'plant.radius', 'plant.cooldown', 'water.radius', 'water.cooldown',
  'harvest.radius', 'harvest.cooldown', 'grid.cols', 'grid.rows', 'growthSpeed', 'valueMult',
  ...FIELD_DIRS.flatMap((_, i) => [`plows.${i}.cols`, `plows.${i}.rows`]),
  ...DRONE_IDS.flatMap((id) => [`drones.${id}.count`, `drones.${id}.cooldown`, `drones.${id}.radius`])];

export const LIMITS = {                              // [mínimo, máximo]
  dayLength: [10, 400],
  'plant.radius': [0.5, 4], 'water.radius': [0.5, 4], 'harvest.radius': [0.5, 4],
  'plant.cooldown': [0.25, 5], 'water.cooldown': [0.25, 5], 'harvest.cooldown': [0.25, 5],
  'grid.cols': [3, MAX_COLS], 'grid.rows': [3, MAX_ROWS],
  growthSpeed: [0.25, 3], valueMult: [0.1, 100000],
  ...Object.fromEntries(FIELD_DIRS.flatMap((_, i) => [[`plows.${i}.cols`, [3, MAX_COLS]], [`plows.${i}.rows`, [3, MAX_ROWS]]])),
  ...Object.fromEntries(DRONE_IDS.flatMap((id) => [
    [`drones.${id}.count`, [0, 3]], [`drones.${id}.cooldown`, [0.4, 10]], [`drones.${id}.radius`, [0.5, 3]]]))
};

export const STAT_LABELS = {                         // textos automáticos da árvore e da loja
  dayLength: 'Duração do dia (s)', 'plant.radius': 'Raio de semear', 'water.radius': 'Raio de aguar',
  'harvest.radius': 'Raio de colher', 'plant.cooldown': 'Ciclo de semear', 'water.cooldown': 'Ciclo de aguar',
  'harvest.cooldown': 'Ciclo de colher', 'grid.cols': 'Colunas', 'grid.rows': 'Linhas',
  growthSpeed: 'Velocidade de crescimento', valueMult: 'Valor da colheita',
  ...Object.fromEntries(FIELD_DIRS.flatMap((_, i) => [
    [`plows.${i}.cols`, `Colunas do arado ${i + 1}`], [`plows.${i}.rows`, `Linhas do arado ${i + 1}`]])),
  ...Object.fromEntries(DRONE_IDS.flatMap((id) => [
    [`drones.${id}.count`, `${DRONE_INFO[id].name} (quantidade)`],
    [`drones.${id}.cooldown`, `Ciclo do ${DRONE_INFO[id].name.toLowerCase()}`],
    [`drones.${id}.radius`, `Alcance do ${DRONE_INFO[id].name.toLowerCase()}`]]))
};

export const PALETTE = {                             // cores do MUNDO 3D (a interface usa style.css)
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
