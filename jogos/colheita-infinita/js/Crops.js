// Para criar uma planta: uma linha aqui + assets/models/plants/<id>.glb + assets/icons/crops/<id>.webp
// + uma habilidade em Skills.js que a libere (ou coloque o id em START_CROPS).
// `color`/`ripe` só são usados pelos modelos provisórios (quando o .glb não existe).
export const CROPS = {
  trigo:   { id: 'trigo',   name: 'Trigo',   growTime: 6,  value: 2,  seedCost: 0, color: 0x6fae4a, ripe: 0xe8c547 },
  milho:   { id: 'milho',   name: 'Milho',   growTime: 8,  value: 4,  seedCost: 0, color: 0x5fa03f, ripe: 0xf5d442 },
  cenoura: { id: 'cenoura', name: 'Cenoura', growTime: 10, value: 7,  seedCost: 0, color: 0x4f9a3a, ripe: 0xf08a24 },
  tomate:  { id: 'tomate',  name: 'Tomate',  growTime: 12, value: 11, seedCost: 0, color: 0x3f8f3a, ripe: 0xe03b2f }
};
