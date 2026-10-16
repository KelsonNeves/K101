// Para criar uma planta: uma linha aqui + assets/models/plants/<id>.glb + assets/icons/crops/<id>.webp
// + uma habilidade em Skills.js que a libere (ou coloque o id em START_CROPS).
// Quanto mais avançada a planta: cresce mais rápido (growTime menor) e vale mais (value maior),
// mas é mais difícil de plantar: plantMult alonga o ciclo de semear e radiusMult encolhe o raio de semear.
// `color`/`ripe` só são usados pelos modelos provisórios (quando o .glb não existe).
export const CROPS = {
  trigo:   { id: 'trigo',   name: 'Trigo',   growTime: 6, value: 500,  plantMult: 1,   radiusMult: 1,    seedCost: 0, color: 0x6fae4a, ripe: 0xe8c547 },
  milho:   { id: 'milho',   name: 'Milho',   growTime: 10,  value: 5,  plantMult: 1, radiusMult: 1, seedCost: 0, color: 0x5fa03f, ripe: 0xf5d442 },
  cenoura: { id: 'cenoura', name: 'Cenoura', growTime: 20,  value: 12, plantMult: 1, radiusMult: 1,  seedCost: 0, color: 0x4f9a3a, ripe: 0xf08a24 },
  tomate:  { id: 'tomate',  name: 'Tomate',  growTime: 30,  value: 30, plantMult: 1, radiusMult: 1, seedCost: 0, color: 0x3f8f3a, ripe: 0xe03b2f },
  indigo:  { id: 'indigo',  name: 'Índigo',  growTime: 40,  value: 50, plantMult: 1, radiusMult: 1,  seedCost: 0, color: 0xaa11ff, ripe: 0xf08a24 }
};