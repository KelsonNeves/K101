// Debug.js — só carrega com ?debug. Mostra cada planta com os 5 estágios lado a lado.
import * as THREE from 'three';

export function showCropShowcase(sceneObj, models) {
  const ids = Object.keys(models);
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  ids.forEach((id, row) => {
    for (let s = 0; s < 5; s++) {
      for (const part of models[id][s]) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        m.makeTranslation((s - 2) * 1.2, 0, (row - (ids.length - 1) / 2) * 1.4 - 7);
        mesh.applyMatrix4(m.multiply(part.matrix.clone()));
        mesh.castShadow = true;
        group.add(mesh);
      }
    }
  });
  sceneObj.scene.add(group);
  console.info('[Debug] vitrine: cada linha = uma planta, colunas = estágios 1 a 5 (fica atrás da grade).');
}
