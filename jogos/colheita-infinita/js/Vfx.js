// Vfx.js — partículas (cubos coloridos, combinam com o low poly) e números flutuantes.
import * as THREE from 'three';
import { PALETTE } from './Data.js';

const CAP = 320;

export class Vfx {
  constructor(sceneObj) {
    this.sceneObj = sceneObj;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      CAP
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(0xffffff));
    sceneObj.scene.add(this.mesh);
    this.parts = [];
    this.m = new THREE.Matrix4(); this.col = new THREE.Color();
    this.layer = document.getElementById('float-layer');
  }

  // kind: 'dirt' | 'drops' | 'leaves'. Partículas nascem dentro do círculo da ferramenta.
  burst(p, kind, n = 1, radius = 1) {
    const count = Math.min(40, 8 + n * 3);
    const color = PALETTE[kind] ?? 0xffffff;
    for (let i = 0; i < count && this.parts.length < CAP; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const base = { x, z, life: 0, max: 0.5 + Math.random() * 0.4, color };
      if (kind === 'drops') Object.assign(base, { y: 1.2 + Math.random() * 0.6, vx: 0, vy: -3, vz: 0, g: 4 });
      else if (kind === 'leaves') Object.assign(base, { y: 0.2, vx: (Math.random() - 0.5) * 1.2, vy: 2.2 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.2, g: 5 });
      else Object.assign(base, { y: 0.1, vx: (Math.random() - 0.5) * 1.0, vy: 1.6 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.0, g: 7 });
      this.parts.push(base);
    }
  }

  // Um único número flutuante por ciclo (evita poluição quando várias células são colhidas).
  floatText(p, text) {
    if (!this.layer) return;
    const s = this.sceneObj.worldToScreen(new THREE.Vector3(p.x, 0.6, p.z));
    const el = document.createElement('div');
    el.className = 'float-num';
    el.textContent = text;
    el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life += dt;
      if (q.life >= q.max) { this.parts.splice(i, 1); continue; }
      q.vy -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.04) { q.y = 0.04; q.vy = 0; q.vx *= 0.8; q.vz *= 0.8; }
    }
    for (const q of this.parts) {
      const s = 1 - q.life / q.max;
      this.m.makeScale(s, s, s).setPosition(q.x, q.y, q.z);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.col.setHex(q.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
