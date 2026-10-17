// Decor.js — cenário em volta dos campos: manchas de grama, tufos, flores, pedras, arbustos e árvores.
// Tudo é InstancedMesh (poucas chamadas de desenho) e low poly com flatShading, no mesmo estilo das plantas.
// A posição de cada item vem de um sorteio com semente fixa: o mapa é sempre o mesmo, só some o que cairia em cima de um campo.
import * as THREE from 'three';

const rngFrom = (seed) => {                                    // mulberry32: sorteio repetível
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const GREENS = [0x6fae4a, 0x5f9f3e, 0x7bbf52, 0x4f8f35];
const FLOWERS = [0xff6b6b, 0xffd93d, 0xffffff, 0xff9ff3, 0xb084f5, 0xff9f43];
const ROCKS = [0x9a9a92, 0x8a8a84, 0xaaa79b];
const PATCH = [0x7bbf52, 0x5d9a3a, 0x86c75c, 0x65a041];

export class Decor {
  constructor(scene, { low = false } = {}) {
    this.scene = scene;
    this.low = low;
    this.k = low ? 0.55 : 1;                                   // celular fraco: metade da densidade
    this.kinds = {};
    this.tmpColor = new THREE.Color();
    this.m = new THREE.Matrix4(); this.base = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.e = new THREE.Euler();

    const loc = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const up = (geo, h) => { geo.translate(0, h / 2, 0); return geo; };   // base no chão

    this.define('patch', 140, [{ geo: this.flat(new THREE.CircleGeometry(1, 10)), local: loc(0, 0, 0), color: 0xffffff }]);
    this.define('tuft', 1500, [
      { geo: up(new THREE.ConeGeometry(0.045, 0.34, 4), 0.34), local: loc(0, 0, 0, 0.0, 0, 0.25), color: 0x6fae4a },
      { geo: up(new THREE.ConeGeometry(0.045, 0.28, 4), 0.28), local: loc(0.04, 0, 0, 0.3, 0, -0.3), color: 0x6fae4a },
      { geo: up(new THREE.ConeGeometry(0.045, 0.24, 4), 0.24), local: loc(-0.03, 0, 0.03, -0.35, 0, 0.05), color: 0x6fae4a }
    ]);
    this.define('flower', 520, [
      { geo: up(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 4), 0.26), local: loc(0, 0, 0), color: 0x4f8f35 },
      { geo: new THREE.IcosahedronGeometry(0.07, 0), local: loc(0, 0.29, 0, 0, 0, 0, 1, 0.7, 1), color: 0xffffff }
    ]);
    this.define('rock', 200, [
      { geo: new THREE.IcosahedronGeometry(0.2, 0), local: loc(0, 0.08, 0, 0, 0, 0, 1, 0.6, 0.85), color: 0x9a9a92 }
    ]);
    this.define('bush', 140, [
      { geo: new THREE.IcosahedronGeometry(0.3, 0), local: loc(0, 0.24, 0), color: 0x4f9a3a },
      { geo: new THREE.IcosahedronGeometry(0.3, 0), local: loc(0.27, 0.19, 0.05, 0, 0.6, 0, 0.8), color: 0x58a643 },
      { geo: new THREE.IcosahedronGeometry(0.3, 0), local: loc(-0.2, 0.17, 0.16, 0, 1.2, 0, 0.68), color: 0x4f9a3a }
    ]);
    this.define('pine', 90, [
      { geo: up(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 6), 0.8), local: loc(0, 0, 0), color: 0x7a5230, shadow: true },
      { geo: up(new THREE.ConeGeometry(0.66, 1.1, 7), 1.1), local: loc(0, 0.65, 0), color: 0x3f8f4a, shadow: true },
      { geo: up(new THREE.ConeGeometry(0.5, 0.95, 7), 0.95), local: loc(0, 1.25, 0), color: 0x479a52, shadow: true },
      { geo: up(new THREE.ConeGeometry(0.34, 0.8, 7), 0.8), local: loc(0, 1.85, 0), color: 0x4fa65a, shadow: true }
    ]);
    this.define('oak', 90, [
      { geo: up(new THREE.CylinderGeometry(0.12, 0.17, 1.0, 6), 1.0), local: loc(0, 0, 0), color: 0x84582f, shadow: true },
      { geo: new THREE.IcosahedronGeometry(0.8, 0), local: loc(0, 1.55, 0, 0, 0.4, 0, 1, 0.9, 1), color: 0x5aa83f, shadow: true },
      { geo: new THREE.IcosahedronGeometry(0.5, 0), local: loc(0.5, 1.25, 0.2, 0, 1, 0, 1), color: 0x66b448, shadow: true },
      { geo: new THREE.IcosahedronGeometry(0.45, 0), local: loc(-0.4, 1.9, -0.15, 0, 2, 0, 1), color: 0x66b448, shadow: true }
    ]);
    this.build([]);                                            // antes do 1º dia: cenário sem campos
  }

  flat(geo) { geo.rotateX(-Math.PI / 2); geo.translate(0, -0.06, 0); return geo; }   // círculo deitado logo acima do chão

  define(name, cap, parts) {
    const kind = { cap, n: 0, parts: [] };
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), cap);
      im.count = 0; im.frustumCulled = false;
      im.castShadow = !!p.shadow && !this.low;
      im.setColorAt(0, new THREE.Color(0xffffff));            // cria instanceColor
      this.scene.add(im);
      kind.parts.push({ im, local: p.local, color: p.color });
    }
    this.kinds[name] = kind;
  }

  // Coloca uma instância. `colors` (opcional) troca a cor de cada parte; senão vale a cor da parte com um tom sorteado.
  put(name, x, z, rot, scale, colors, tone = 1) {
    const kind = this.kinds[name];
    if (kind.n >= kind.cap) return;
    this.p.set(x, 0, z); this.q.setFromAxisAngle(this.up, rot); this.s.set(scale, scale, scale);
    this.base.compose(this.p, this.q, this.s);
    kind.parts.forEach((part, i) => {
      this.m.multiplyMatrices(this.base, part.local);
      part.im.setMatrixAt(kind.n, this.m);
      this.tmpColor.setHex(colors ? colors[i] ?? part.color : part.color);
      if (!colors) this.tmpColor.multiplyScalar(tone);
      part.im.setColorAt(kind.n, this.tmpColor);
    });
    kind.n++;
  }

  // Redesenha o cenário para os campos de hoje (cada um: x, z, cols, rows). Nada nasce em cima de um campo.
  build(fields) {
    for (const kind of Object.values(this.kinds)) kind.n = 0;
    const rnd = rngFrom(20240611);
    const free = (x, z, m) => fields.every((f) => Math.abs(x - f.x) > f.cols / 2 + m || Math.abs(z - f.z) > f.rows / 2 + m);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const near = 25, far = 60, K = this.k;
    const spot = (ext) => [(rnd() * 2 - 1) * ext, (rnd() * 2 - 1) * ext];

    // manchas de grama (claras e escuras): quebram o verde liso
    for (let i = 0, n = Math.round(110 * K); i < n; i++) {
      const [x, z] = spot(i % 2 ? near : far), r = 1.5 + rnd() * 4.5, c = pick(PATCH);
      this.put('patch', x, z, 0, r, [c]);
    }
    // árvores e arbustos: rejeitam lugares muito perto de outra árvore (não fica amontoado)
    const trees = [];
    const tryTree = (ext) => {
      const [x, z] = spot(ext), rot = rnd() * 6.28, sc = 0.85 + rnd() * 0.6, kind = rnd() < 0.5 ? 'pine' : 'oak';
      if (!free(x, z, 2.0) || trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2)) return;
      trees.push([x, z]);
      this.put(kind, x, z, rot, sc, null, 0.92 + rnd() * 0.16);
      for (let j = 0; j < 4; j++) { const a = rnd() * 6.28, d = 0.7 + rnd() * 0.9; this.put('tuft', x + Math.cos(a) * d, z + Math.sin(a) * d, rnd() * 6, 0.9 + rnd() * 0.6, null, 0.8 + rnd() * 0.3); }
    };
    for (let i = 0, n = Math.round(90 * K); i < n; i++) tryTree(i % 3 ? far : near);
    for (let i = 0, n = Math.round(75 * K); i < n; i++) {
      const [x, z] = spot(i % 2 ? far : near);
      if (!free(x, z, 1.4)) continue;
      this.put('bush', x, z, rnd() * 6.28, 0.8 + rnd() * 0.7, null, 0.9 + rnd() * 0.2);
    }
    // pedras (algumas em grupinhos)
    for (let i = 0, n = Math.round(110 * K); i < n; i++) {
      const [x, z] = spot(i % 2 ? far : near);
      if (!free(x, z, 0.9)) continue;
      const c = pick(ROCKS), k = rnd() < 0.35 ? 3 : 1;
      for (let j = 0; j < k; j++) this.put('rock', x + (rnd() - 0.5) * 0.7, z + (rnd() - 0.5) * 0.7, rnd() * 6.28, 0.5 + rnd() * 0.9, [c], 1);
    }
    // flores em canteiros de uma cor (com um toque de outra)
    for (let i = 0, n = Math.round(60 * K); i < n; i++) {
      const [cx, cz] = spot(i % 2 ? far : near), main = pick(FLOWERS), count = 5 + Math.floor(rnd() * 6);
      for (let j = 0; j < count; j++) {
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 1.3, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (!free(x, z, 0.7)) continue;
        this.put('flower', x, z, rnd() * 6.28, 0.8 + rnd() * 0.6, [0x4f8f35, rnd() < 0.8 ? main : pick(FLOWERS)]);
      }
    }
    // tufos de grama espalhados (mais perto do centro)
    for (let i = 0, n = Math.round(4000 * K); i < n; i++) {
      const [x, z] = spot(i % 6 ? near : far);
      if (!free(x, z, 0.45)) continue;
      this.put('tuft', x, z, rnd() * 6.28, 0.8 + rnd() * 0.8, null, 0.8 + rnd() * 0.4);
    }

    for (const kind of Object.values(this.kinds)) {
      kind.parts.forEach(({ im }) => {
        im.count = kind.n;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      });
    }
  }
}
