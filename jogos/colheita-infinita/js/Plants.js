// Plants.js — carrega os .glb (5 estágios) e desenha as plantas com InstancedMesh.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Modelo provisório: 5 caixas coloridas de alturas crescentes (mesmos estágios stage_1..5).
function placeholderStages(crop) {
  const heights = [0.12, 0.3, 0.55, 0.85, 1.1];
  const widths = [0.25, 0.3, 0.4, 0.5, 0.55];
  return heights.map((h, i) => {
    const geo = new THREE.BoxGeometry(widths[i], h, widths[i]);
    return [{
      geometry: geo,
      material: new THREE.MeshLambertMaterial({ color: i === 4 ? crop.ripe : crop.color, flatShading: true }),
      matrix: new THREE.Matrix4().makeTranslation(0, h / 2, 0)
    }];
  });
}

export async function loadCropModels(crops, manager) {
  const loader = new GLTFLoader(manager);
  const models = {};
  await Promise.all(crops.map(async (crop) => {
    let gltf;
    try {
      gltf = await loader.loadAsync(`assets/models/plants/${crop.id}.glb`);
    } catch {
      console.warn(`[Plants] ${crop.id}.glb não encontrado: usando modelo provisório.`);
      models[crop.id] = placeholderStages(crop);
      return;
    }
    gltf.scene.updateMatrixWorld(true);
    const stages = [];
    for (let s = 1; s <= 5; s++) {
      const root = gltf.scene.getObjectByName(`stage_${s}`);
      if (!root) throw new Error(`${crop.id}.glb: falta o nó stage_${s}`);
      const parts = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        parts.push({
          geometry: o.geometry,
          material: new THREE.MeshLambertMaterial({ color: o.material.color, flatShading: true }),
          matrix: o.matrixWorld.clone()                 // posição da malha dentro do estágio
        });
      });
      stages.push(parts);
    }
    models[crop.id] = stages;                           // models[id][0..4] = lista de partes
  }));
  return models;
}

export class PlantRenderer {
  constructor(scene, models, capacity) {
    this.models = models;
    this.pools = {};                                    // pools[id][estágio] = [InstancedMesh por parte]
    for (const [id, stages] of Object.entries(models)) {
      this.pools[id] = stages.map((parts) => parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, capacity);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.count = 0; im.castShadow = true; im.frustumCulled = false;
        scene.add(im);
        return im;
      }));
    }
    this.base = new THREE.Matrix4(); this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.sc = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  // Instâncias reconstruídas todo quadro (máx. 144 células): simples e sem bug de contagem.
  update(cells) {
    for (const stages of Object.values(this.pools)) for (const list of stages) for (const im of list) im.count = 0;
    for (const c of cells) {
      if (!c.crop) continue;
      const parts = this.models[c.crop][c.stage - 1];
      const pool = this.pools[c.crop][c.stage - 1];
      this.pos.set(c.x, 0, c.z);
      this.q.setFromAxisAngle(this.up, c.rot);
      this.sc.setScalar(c.size * c.pop);               // «pop» ao semear e ao mudar de estágio
      this.base.compose(this.pos, this.q, this.sc);
      parts.forEach((p, i) => {
        this.m.multiplyMatrices(this.base, p.matrix);
        pool[i].setMatrixAt(pool[i].count++, this.m);
      });
    }
    for (const stages of Object.values(this.pools)) for (const list of stages) for (const im of list) im.instanceMatrix.needsUpdate = true;
  }
}
