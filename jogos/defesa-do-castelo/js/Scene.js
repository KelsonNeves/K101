/* ==========================================================================
   Scene.js — mundo visual Three.js.
   "Como isso aparece em 3D?"
   Sabe ONDE existe um objeto, não POR QUE ele existe.
   ========================================================================== */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { GAME_CONFIG } from "./Data.js";

// Contorno de seleção (construção com o menu de contexto aberto: evoluir / reparar / demolir).
// Técnica "casco invertido": cópia inflada do modelo, branca, só com as faces de trás. Custo: 1 draw call por mesh.
const SELECT_OUTLINE = {
  color: 0xffffff,
  thickness: 0.07,   // espessura em unidades do mundo
  secondaryOpacity: 0.3   // opacidade do contorno dos muros ligados (0 = invisível, 1 = igual ao principal)
};

/* ------------------------- Formas de graybox -------------------------- */
const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...opts });

const part = (geo, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const FALLBACKS = {
  none: () => new THREE.Group(),

  capsule: (o) => {
    const r = o.radius ?? 0.3, h = o.height ?? 1;
    const g = new THREE.Group();
    g.add(part(new THREE.CapsuleGeometry(r, Math.max(h - 2 * r, 0.01), 2, 6), o.color ?? 0x6aa84f, 0, h / 2, 0));
    g.add(part(new THREE.BoxGeometry(r * 0.6, r * 0.4, r * 0.7), 0x1d1d1d, 0, h * 0.78, r * 0.95)); // "focinho" = frente (+Z)
    return g;
  },

  archerTower: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.6, 0.8, 1.8, 6), 0x8d7b68, 0, 0.9, 0));
    g.add(part(new THREE.CylinderGeometry(0.85, 0.85, 0.25, 6), 0x6d5a45, 0, 1.9, 0));
    const turret = new THREE.Group();
    turret.name = "Turret";
    turret.position.y = 2.0;
    const roof = part(new THREE.ConeGeometry(0.9, 0.9, 4), 0xb5443a, 0, 0.75, 0);
    roof.rotation.y = Math.PI / 4;
    turret.add(roof);
    turret.add(part(new THREE.CapsuleGeometry(0.16, 0.3, 2, 5), 0xe9c9a0, 0, 0.3, 0));
    turret.add(part(new THREE.BoxGeometry(0.07, 0.07, 0.8), 0x3e2f1f, 0, 0.35, 0.45)); // arco
    g.add(turret);
    return g;
  },

  cannon: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.85, 1.0, 0.7, 8), 0x5b6770, 0, 0.35, 0));
    const turret = new THREE.Group();
    turret.name = "Turret";
    turret.position.y = 0.95;
    turret.add(part(new THREE.SphereGeometry(0.5, 7, 5), 0x7a8791, 0, 0, 0));
    const barrel = part(new THREE.CylinderGeometry(0.22, 0.3, 1.3, 8), 0x2b2f33, 0, 0.1, 0.55);
    barrel.rotation.x = Math.PI / 2;
    turret.add(barrel);
    g.add(turret);
    return g;
  },

  castle: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(3.2, 2.0, 3.2), 0xa8adb3, 0, 1.0, 0));
    g.add(part(new THREE.BoxGeometry(1.6, 1.2, 1.6), 0x8f959c, 0, 2.6, 0));
    g.add(part(new THREE.ConeGeometry(1.2, 1.0, 4), 0xb5443a, 0, 3.7, 0));
    for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
      g.add(part(new THREE.CylinderGeometry(0.5, 0.55, 2.8, 6), 0x9aa0a6, x, 1.4, z));
      g.add(part(new THREE.ConeGeometry(0.65, 0.8, 6), 0x3f6fb5, x, 3.2, z));
    }
    return g;
  },

  arrow: () => {
    const g = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), 0xc9a46a);
    shaft.rotation.x = Math.PI / 2;
    const tip = part(new THREE.ConeGeometry(0.09, 0.22, 5), 0xdddddd, 0, 0, 0.5);
    tip.rotation.x = Math.PI / 2;
    g.add(shaft, tip);
    return g;
  },

  cannonball: () => new THREE.Group().add(part(new THREE.SphereGeometry(0.24, 8, 6), 0x222428)),

  // Mina (graybox): boca de túnel em moldura de madeira, com pilha de ouro e carrinho.
  mine: (o) => {
    const base = new THREE.Color(o.color ?? 0x8d7b68);
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(1.5, 1.0, 1.3), base, 0, 0.5, -0.1));
    g.add(part(new THREE.BoxGeometry(0.7, 0.75, 0.2), 0x15110d, 0, 0.4, 0.58));          // entrada escura
    g.add(part(new THREE.BoxGeometry(0.12, 0.85, 0.16), 0x6b4a2b, -0.45, 0.42, 0.62));   // moldura
    g.add(part(new THREE.BoxGeometry(0.12, 0.85, 0.16), 0x6b4a2b, 0.45, 0.42, 0.62));
    g.add(part(new THREE.BoxGeometry(1.1, 0.14, 0.16), 0x6b4a2b, 0, 0.88, 0.62));
    const roof = part(new THREE.ConeGeometry(1.1, 0.7, 4), 0x8a5a3a, 0, 1.35, -0.1);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(part(new THREE.DodecahedronGeometry(0.2, 0), 0xf4b942, 0.55, 0.2, 0.95));       // ouro
    g.add(part(new THREE.DodecahedronGeometry(0.15, 0), 0xffd36b, 0.78, 0.15, 0.78));
    return g;
  },

  // Torre de restauração (graybox): base de pedra, coluna e cristal brilhante que gira (grupo "Turret") até o alvo.
  restorer: (o) => {
    const c = new THREE.Color(o.color ?? 0x57d98a);
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.85, 1.0, 0.45, 8), 0x6e7a76, 0, 0.22, 0));
    g.add(part(new THREE.CylinderGeometry(0.32, 0.5, 1.2, 6), 0x8fa39b, 0, 1.0, 0));
    const turret = new THREE.Group();
    turret.name = "Turret";
    turret.position.y = 2.0;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.25, flatShading: true })
    );
    crystal.name = "cristal";            // o Crystal.js controla rotação, tamanho e transparência deste objeto
    crystal.scale.y = 1.4;
    crystal.castShadow = true;
    turret.add(crystal);
    const ring = part(new THREE.TorusGeometry(0.62, 0.05, 6, 24), 0xcfe8dc, 0, 0, 0);
    ring.rotation.x = Math.PI / 2.4;
    turret.add(ring);
    g.add(turret);
    return g;
  },

  // Barril de pólvora (graybox): barril de madeira com aros de ferro e pavio.
  barrel: (o) => {
    const wood = new THREE.Color(o.color ?? 0x7a4e2b);
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 10), wood, 0, 0.45, 0));
    g.add(part(new THREE.CylinderGeometry(0.54, 0.54, 0.09, 10), 0x2b2f33, 0, 0.22, 0));
    g.add(part(new THREE.CylinderGeometry(0.54, 0.54, 0.09, 10), 0x2b2f33, 0, 0.68, 0));
    g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), 0xd9c9a0, 0, 1.05, 0));       // pavio
    g.add(part(new THREE.SphereGeometry(0.07, 6, 5), 0xff8a2b, 0, 1.22, 0));                  // brasa
    return g;
  },

  // Poste do muro (graybox): bloco de pedra com "tampa".
  wallPost: (o) => {
    const base = new THREE.Color(o.color ?? 0x8e949b);
    const cap = base.clone().offsetHSL(0, 0, 0.12);
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(0.95, 1.4, 0.95), base, 0, 0.7, 0));
    g.add(part(new THREE.BoxGeometry(1.15, 0.22, 1.15), cap, 0, 1.5, 0));
    return g;
  },

  tree: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.15, 0.22, 0.7, 5), 0x6b4a2b, 0, 0.35, 0));
    g.add(part(new THREE.ConeGeometry(0.8, 1.3, 6), 0x2f8f4e, 0, 1.25, 0));
    g.add(part(new THREE.ConeGeometry(0.58, 1.1, 6), 0x3aa65c, 0, 2.0, 0));
    return g;
  },

  rock: () => {
    const m = part(new THREE.DodecahedronGeometry(0.65, 0), 0x8a9096, 0, 0.35, 0);
    m.scale.set(1.15, 0.7, 1);
    return new THREE.Group().add(m);
  },

  bush: () => {
    const m = part(new THREE.IcosahedronGeometry(0.6, 0), 0x3f9f55, 0, 0.4, 0);
    m.scale.set(1, 0.72, 1);
    return new THREE.Group().add(m);
  },

  bridge: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(1.9, 0.16, 2.0), 0x9b7347, 0, 0.05, 0));
    g.add(part(new THREE.BoxGeometry(0.1, 0.35, 2.0), 0x6d4f2f, 0.9, 0.22, 0));
    g.add(part(new THREE.BoxGeometry(0.1, 0.35, 2.0), 0x6d4f2f, -0.9, 0.22, 0));
    return g;
  },

  explosion: () => {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      mat(0xff8a1f, { emissive: 0xff5500, emissiveIntensity: 0.9, transparent: true })
    );
    m.position.y = 0.3;
    return new THREE.Group().add(m);
  },

  hit: () => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 6, 4),
      mat(0xffffff, { emissive: 0xffffaa, emissiveIntensity: 1, transparent: true })
    );
    return new THREE.Group().add(m);
  }
};

// Segmento de muro (graybox): caixa unitária compartilhada, esticada por escala.
const LINK_GEO = new THREE.BoxGeometry(1, 1, 1);
const LINK_MATS = new Map();
const linkMat = (color) => {
  if (!LINK_MATS.has(color)) LINK_MATS.set(color, mat(color));
  return LINK_MATS.get(color);
};

// Faixa do zoom da câmera (zoomFactor) e atalhos do toque duplo, em % da faixa (0% = bem perto, 100% = bem longe).
const ZOOM_MIN = 0.35, ZOOM_MAX = 0.8;
const DOUBLE_TAP_ZOOM = { near: 0.10, far: 0.90, duration: 320 };   // ms

// Barras de vida: opacidade no MAIOR zoom (0 = invisível, 1 = sólida) e a faixa de zoom em que ela some.
// zoomFactor da câmera: 0.45 = bem perto, 1 = visão inicial do mapa, 1.25 = bem longe.
// Do `near` ao `far` a barra vai de HEALTH_BAR_OPACITY até totalmente transparente.
const HEALTH_BAR_OPACITY = 0.55;
const HEALTH_BAR_FADE = { near: 0.45, far: 0.85 };

/* ------------------------------ Assets -------------------------------- */
class AssetManager {
  constructor(base) {
    this.base = base;
    this.loader = new GLTFLoader();
    this.requests = new Map();
    this.ready = new Map();            // url -> gltf | null (arquivo ausente)
  }

  url(category, file) { return `${this.base}${category}/${file}`; }

  load(url) {
    if (!this.requests.has(url)) {
      this.requests.set(url, new Promise((resolve) => {
        this.loader.load(
          url,
          (gltf) => {
            gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            this.ready.set(url, gltf);
            resolve(gltf);
          },
          undefined,
          () => { this.ready.set(url, null); resolve(null); }
        );
      }));
    }
    return this.requests.get(url);
  }

  async preload(entries, onProgress) {
    const urls = [...new Set(entries.map((e) => this.url(e.category, e.model)))];
    let done = 0;
    await Promise.all(urls.map((u) => this.load(u).then(() => onProgress?.(++done / urls.length))));
  }
}

/* ------------------------------- Câmera ------------------------------- */
class CameraManager {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.target = new THREE.Vector3();
    this.tilt = THREE.MathUtils.degToRad(58);
    this.zoomFactor = 1;
    this.baseDistance = 40;
    this.limit = { x: 16, z: 18 };
    this.aspect = 1;
    this.mapSize = { w: 32, h: 36 };
    this.anim = null;            // animação do zoom por toque duplo
  }

  fit(w, h, aspect = this.aspect) {
    this.mapSize = { w, h };
    this.aspect = aspect;
    const visible = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const byHeight = (h * Math.sin(this.tilt) * 1.12) / visible;
    const byWidth = (w * 1.05) / (visible * aspect);
    this.baseDistance = Math.max(byHeight, byWidth, 18);
    this.limit = { x: w / 2, z: h / 2 };
    this.update();
  }

  pan(dxPx, dyPx, viewportH) {
    this.anim = null;            // o jogador assumiu o controle
    const d = this.baseDistance * this.zoomFactor;
    const scale = (2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / viewportH;
    this.target.x -= dxPx * scale;
    this.target.z -= (dyPx * scale) / Math.sin(this.tilt);
    this.clamp();
  }

  zoom(factor) {
    this.anim = null;
    this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor * factor, ZOOM_MIN, ZOOM_MAX);
  }

  // Zoom atual em 0 a 1 dentro da faixa permitida (0 = mais perto, 1 = mais longe).
  get zoomLevel() { return (this.zoomFactor - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN); }

  // Toque duplo: vai para o extremo OPOSTO ao que está mais perto (perto → 90%, longe → 10%).
  // Ao aproximar, a câmera também centraliza o ponto tocado.
  toggleZoom(point) {
    const { near, far, duration } = DOUBLE_TAP_ZOOM;
    const level = this.zoomLevel;
    const closerToNear = Math.abs(level - near) < Math.abs(level - far);
    const toLevel = closerToNear ? far : near;
    const goingClose = toLevel === near;
    const to = this.target.clone();
    if (goingClose && point) { to.x = point.x; to.z = point.z; }
    to.x = THREE.MathUtils.clamp(to.x, -this.limit.x, this.limit.x);
    to.z = THREE.MathUtils.clamp(to.z, -this.limit.z, this.limit.z);
    this.anim = {
      t0: performance.now(), duration,
      fromZoom: this.zoomFactor, toZoom: ZOOM_MIN + toLevel * (ZOOM_MAX - ZOOM_MIN),
      fromTarget: this.target.clone(), toTarget: to
    };
  }

  stepAnim() {
    const a = this.anim;
    if (!a) return;
    const k = Math.min(1, (performance.now() - a.t0) / a.duration);
    const e = 1 - Math.pow(1 - k, 3);   // easeOutCubic
    this.zoomFactor = a.fromZoom + (a.toZoom - a.fromZoom) * e;
    this.target.lerpVectors(a.fromTarget, a.toTarget, e);
    if (k >= 1) this.anim = null;
  }

  clamp() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -this.limit.x, this.limit.x);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -this.limit.z, this.limit.z);
  }

  update() {
    this.stepAnim();
    const d = this.baseDistance * this.zoomFactor;
    this.camera.position.set(
      this.target.x,
      this.target.y + Math.sin(this.tilt) * d,
      this.target.z + Math.cos(this.tilt) * d
    );
    this.camera.lookAt(this.target);
  }
}

/* ------------------------------- Luzes -------------------------------- */
class LightingManager {
  constructor(scene) {
    scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5d6e3c, 0.95));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    sun.position.set(-14, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.near = 1; s.far = 90;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
  }
}

/* ----------------------------- GameScene ------------------------------ */
export class GameScene {
  constructor({ canvas, modelsBase, modelScale = {} }) {
    this.canvas = canvas;
    this.modelScale = modelScale;      // escala global por categoria (Data.js → GAME_CONFIG.modelScale)
    this.assets = new AssetManager(modelsBase);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x86bfdc);
    this.scene.fog = new THREE.Fog(0x86bfdc, 70, 100);

    this.cameraManager = new CameraManager();
    this.camera = this.cameraManager.camera;
    new LightingManager(this.scene);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.bars = new Set();
    this.effects = [];
    this.ghost = null;
    this.grid = null;

    this.outlineTarget = null;
    this.outlineHulls = [];
    this.smoothCache = new WeakMap();   // geometria original → geometria com normais suaves

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /* ---- assets ---- */
  preload(entries, onProgress) { return this.assets.preload(entries, onProgress); }

  hasModel(category, file) { return !!this.assets.ready.get(this.assets.url(category, file)); }

  // Cria um Object3D: modelo .glb se existir; senão, forma de graybox.
  // Estrutura: root (posição) > yaw (rotação) > pivot (animação procedural) > modelo
  createObject(category, spec = {}) {
    const gltf = spec.model ? this.assets.ready.get(this.assets.url(category, spec.model)) : null;
    const root = new THREE.Group();
    const yaw = new THREE.Group();
    const pivot = new THREE.Group();
    root.add(yaw);
    yaw.add(pivot);

    let model, animations = [];
    if (gltf) {
      model = SkeletonUtils.clone(gltf.scene);
      model.scale.setScalar(spec.scale ?? 1);
      model.position.y = spec.yOffset ?? 0;
      model.rotation.y = spec.rotationY ?? 0;
      animations = gltf.animations ?? [];
    } else {
      const build = FALLBACKS[spec.fallback?.shape] ?? FALLBACKS.none;
      model = build(spec.fallback ?? {});
    }
    pivot.add(model);

    // Escala global da categoria (inimigos/estruturas) no `yaw`: não briga com a animação (pivot) nem com o brilho de evolução (root).
    const k = spec.globalScale === false ? 1 : this.scaleFor(category);
    if (k !== 1) yaw.scale.setScalar(k);

    let turret = null;
    model.traverse((o) => { if (!turret && /turret/i.test(o.name)) turret = o; });
    root.userData = { yaw, pivot, model, turret, isModel: !!gltf };
    return { object3D: root, animations, model };
  }

  scaleFor(category) { return this.modelScale[category] ?? 1; }

  createMixer(model) { return new THREE.AnimationMixer(model); }

  /* ---- operações básicas ---- */
  add(obj) { this.world.add(obj); }

  remove(obj) {
    if (!obj) return;
    const bar = obj.userData?.bar;
    if (bar) {
      this.bars.delete(bar.group);
      bar.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    obj.parent?.remove(obj);
  }

  setPosition(obj, x, y, z) { obj.position.set(x, y, z); }
  setRotation(obj, yaw) { (obj.userData.yaw ?? obj).rotation.y = yaw; }
  // Cristal da torre de restauração (objeto chamado "cristal" no modelo): gira, encolhe e some com a energia.
  // `energy` 0-1; `show` false = oculto (torre superaquecida). Mexe só em rotação, escala e opacidade do cristal.
  updateCrystal(obj, energy, show, dt) {
    let c = obj.userData.crystal;
    if (c === undefined) c = obj.userData.crystal = this.setupCrystal(obj);   // null = este modelo não tem cristal
    if (!c) return;
    const K = GAME_CONFIG.crystal;

    c.t += dt;
    c.vis += ((show ? 1 : 0) - c.vis) * Math.min(1, dt * K.fade);       // suaviza o aparecer/sumir
    const n = c.node;
    n.visible = c.vis > 0.01;
    if (!n.visible) return;

    const e = Math.min(1, Math.max(0, energy));
    n.rotation.set(
      c.baseRot.x + Math.sin(c.t * 0.9) * K.wobble,
      c.baseRot.y + c.t * K.spin,
      c.baseRot.z + Math.cos(c.t * 0.7) * K.wobble
    );
    n.position.y = c.baseY + Math.sin(c.t * K.bobSpeed) * K.bob;
    n.scale.copy(c.baseScale).multiplyScalar(Math.max(0.001, c.vis * (K.minScale + (1 - K.minScale) * e)));

    const opacity = c.vis * (K.minOpacity + (1 - K.minOpacity) * e);
    for (const m of c.mats) m.opacity = opacity;
  }

  // Acha o objeto "cristal" e dá a ele materiais próprios (o .glb clonado compartilha materiais entre torres iguais).
  setupCrystal(root) {
    const key = GAME_CONFIG.crystal.name.toLowerCase();
    let node = null;
    root.traverse((o) => { if (!node && o.name.toLowerCase().includes(key)) node = o; });
    if (!node) return null;

    const mats = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const own = [].concat(o.material).map((m) => { const c = m.clone(); c.transparent = true; mats.push(c); return c; });
      o.material = Array.isArray(o.material) ? own : own[0];
    });
    return {
      node, mats,
      baseScale: node.scale.clone(), baseRot: node.rotation.clone(), baseY: node.position.y,
      t: Math.random() * 10,      // fase própria: torres vizinhas não giram sincronizadas
      vis: 1                      // 0 = oculto … 1 = visível
    };
  }
  setTurretYaw(obj, yaw) { if (obj.userData.turret) obj.userData.turret.rotation.y = yaw; }

  faceDirection(obj, dx, dy, dz) {
    obj.lookAt(obj.position.x + dx, obj.position.y + dy, obj.position.z + dz);
  }

  /* ---- barra de vida ---- */
  attachHealthBar(obj, height = 1.6, width = 1.1) {
    const group = new THREE.Group();
    group.position.y = height;
    const bgGeo = new THREE.PlaneGeometry(width + 0.08, 0.2);
    const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ color: 0x101820, depthTest: false, depthWrite: false, transparent: true, opacity: HEALTH_BAR_OPACITY }));
    const fgGeo = new THREE.PlaneGeometry(width, 0.12);
    fgGeo.translate(width / 2, 0, 0);
    const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0x7bc86c, depthTest: false, depthWrite: false, transparent: true, opacity: HEALTH_BAR_OPACITY }));   // transparent: senão desenha ANTES do fundo e fica escondida por ele
    fg.position.set(-width / 2, 0, 0.001);
    bg.renderOrder = 10; fg.renderOrder = 11;
    group.add(bg, fg);
    group.visible = false;
    group.userData.mats = [bg.material, fg.material];   // opacidade ajustada por zoom em render()
    obj.add(group);
    this.bars.add(group);
    obj.userData.bar = { group, fg };
  }

  setHealthBar(obj, ratio, show = ratio < 1 && ratio > 0) {
    const bar = obj.userData?.bar;
    if (!bar) return;
    bar.group.visible = show;
    bar.fg.scale.x = Math.max(ratio, 0.001);
    bar.fg.material.color.setHSL(ratio * 0.33, 0.75, 0.5);
  }

  /* ---- terreno ---- */
  reset() {
    this.scene.remove(this.world);
    this.world.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.bars.clear();
    this.effects = [];
    this.ghost = null;
    this.ghostLinks = null;
    this.grid = null;
    this.setOutline(null);
    this.secondaryOutlines = new Map();
  }

  // Desenha, com InstancedMesh (poucos draw calls), um mesmo modelo em várias posições.
  // `items` = [{x, z, rot, s}]. Funciona com .glb ou com o graybox do `spec.fallback`.
  scatterInstances(category, spec, items) {
    if (!items.length) return;
    const { object3D } = this.createObject(category, spec);
    object3D.updateMatrixWorld(true);
    const meshes = [];
    object3D.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });

    const inst = new THREE.Matrix4(), out = new THREE.Matrix4();
    const q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (const mesh of meshes) {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, items.length);
      im.castShadow = false;
      im.receiveShadow = true;
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        inst.compose(pos.set(it.x, it.y ?? 0, it.z), q, sc.set(it.s, it.s, it.s));
        im.setMatrixAt(i, out.multiplyMatrices(inst, mesh.matrixWorld));   // posição da instância × posição da peça no modelo
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;            // a caixa de colisão do InstancedMesh não cobre as instâncias
      this.world.add(im);
    }
  }

  // Moldura ao redor do mapa: chão + objetos intransponíveis (árvore/pedra/arbusto), mais densos quanto mais longe.
  buildBorder({ rows, cols, cellSize: cs, environment, border }) {
    const n = Math.max(0, Math.floor(border?.cells ?? 0));
    if (!border?.enabled || n === 0) return;

    let seed = (border.seed ?? 1) >>> 0;                     // mulberry32: sorteio repetível
    const rand = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const types = Object.entries(border.weights ?? { tree: 1 }).filter(([k, w]) => w > 0 && environment[k]);
    const totalW = types.reduce((a, [, w]) => a + w, 0) || 1;
    const pickType = () => {
      let r = rand() * totalW;
      for (const [k, w] of types) { if ((r -= w) <= 0) return k; }
      return types[0]?.[0];
    };

    const W = cols * cs, H = rows * cs;

    // ---- relevo: a moldura vira colinas/montanhas, bem mais altas que o chão jogável ----
    const hc = border.height ?? {};
    const hEdge = hc.edge ?? 1.1;            // base da subida (a partir da 2ª fileira)
    const hFirst = hc.firstStep ?? 0.65;     // altura só da 1ª fileira (o "degrau" colado no mapa)
    const hPeak = hc.peak ?? 7;              // altura nas fileiras mais distantes
    const jitter = hc.jitter ?? 0.5;         // irregularidade (cresce com a distância)
    const front = hc.frontScale ?? 0.55;     // lado de baixo (perto da câmera) fica mais baixo para não esconder o mapa
    const treeLine = hc.treeLine ?? 0.6;     // acima dessa fração da altura máxima só há pedras
    const snowLine = hc.snowLine ?? 0.8;     // a partir daqui o topo fica branco (neve)
    const R = rows + 2 * n, C = cols + 2 * n;
    const idx = (r, c) => (r + n) * C + (c + n);
    const inside = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
    const ringOf = (r, c) => Math.max(r < 0 ? -r : r - rows + 1, c < 0 ? -c : c - cols + 1, 1);   // 1 = colada no mapa
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    let hg = new Float32Array(R * C);
    for (let r = -n; r < rows + n; r++) {
      for (let c = -n; c < cols + n; c++) {
        if (inside(r, c)) continue;
        const ring = ringOf(r, c);
        const t = clamp01((ring - 1) / Math.max(1, n - 1));
        if (ring === 1) { hg[idx(r, c)] = hFirst + (rand() - 0.5) * 0.2; continue; }   // 1ª fileira: baixa e quase uniforme
        const base = hEdge + (hPeak - hEdge) * Math.pow(t, 1.4);
        hg[idx(r, c)] = Math.max(hEdge * 0.8, base + (rand() - 0.5) * 2 * jitter * (0.3 + 1.7 * t));
      }
    }
    // suaviza (só entre células da moldura) e baixa o lado de baixo
    const smooth = new Float32Array(hg);
    for (let r = -n; r < rows + n; r++) {
      for (let c = -n; c < cols + n; c++) {
        if (inside(r, c)) continue;
        let sum = 0, cnt = 0;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr < -n || cc < -n || rr >= rows + n || cc >= cols + n || inside(rr, cc)) continue;
          sum += hg[idx(rr, cc)]; cnt++;
        }
        const first = ringOf(r, c) === 1;
        let h = first || !cnt ? hg[idx(r, c)] : 0.5 * hg[idx(r, c)] + 0.5 * (sum / cnt);   // 1ª fileira não é "puxada" para cima
        h = Math.max(h, (first ? hFirst : hEdge) * 0.8);
        const south = clamp01((r - (rows - 4)) / 4);            // 0 nas laterais/topo → 1 abaixo do mapa
        h *= 1 - (1 - front) * south;
        smooth[idx(r, c)] = Math.max(0.35, h);
      }
    }
    hg = smooth;

    const cells = [];
    const byType = {};
    for (let r = -n; r < rows + n; r++) {
      for (let c = -n; c < cols + n; c++) {
        if (inside(r, c)) continue;
        const x = (c + 0.5) * cs - W / 2, z = (r + 0.5) * cs - H / 2;
        const h = hg[idx(r, c)];
        const hn = clamp01(h / hPeak);                           // 0 = baixo … 1 = pico
        cells.push({ x, z, h, hn, shade: rand() });

        const t = clamp01((ringOf(r, c) - 1) / Math.max(1, n - 1));
        const density = (border.densityNear ?? 0.45) + ((border.densityFar ?? 0.85) - (border.densityNear ?? 0.45)) * t;
        if (rand() > density) continue;

        let type = pickType();
        if (!type) continue;
        if (hn > treeLine && type !== "rock" && environment.rock) type = "rock";   // no alto só pedra
        // pequeno deslocamento para não parecer um tabuleiro perfeito
        (byType[type] ??= []).push({
          x: x + (rand() - 0.5) * cs * 0.4,
          z: z + (rand() - 0.5) * cs * 0.4,
          y: h,                                                   // em cima do relevo
          rot: rand() * Math.PI * 2,
          s: (0.9 + rand() * 0.3) * (type === "rock" ? 1 + hn * 1.5 : 1)   // pedras maiores nas montanhas
        });
      }
    }

    // Cada célula = coluna de pedra (a "parede" do penhasco) + tampa um pouco maior (grama → pedra → neve).
    const colGeo = new THREE.BoxGeometry(cs * 0.94, 1, cs * 0.94);
    const capGeo = new THREE.BoxGeometry(cs, 0.16, cs);
    const cols_ = new THREE.InstancedMesh(colGeo, mat(0xffffff), cells.length);
    const caps = new THREE.InstancedMesh(capGeo, mat(0xffffff), cells.length);
    for (const m of [cols_, caps]) { m.receiveShadow = true; m.frustumCulled = false; }

    const dummy = new THREE.Object3D(), color = new THREE.Color();
    const rockLow = new THREE.Color(0x6e5f4e), rockHigh = new THREE.Color(0x8b8f96);
    const grassLow = new THREE.Color(0x6aa84c), grassHigh = new THREE.Color(0x4a8340);
    const stone = new THREE.Color(0x8d9298), snow = new THREE.Color(0xf2f6fa);
    cells.forEach((g, i) => {
      const top = g.h - 0.08;                                      // a coluna termina dentro da tampa
      dummy.position.set(g.x, (top - 0.3) / 2, g.z);
      dummy.scale.set(1, top + 0.3, 1);
      dummy.updateMatrix();
      cols_.setMatrixAt(i, dummy.matrix);
      cols_.setColorAt(i, color.copy(rockLow).lerp(rockHigh, g.hn).offsetHSL(0, 0, (g.shade - 0.5) * 0.08));

      dummy.position.set(g.x, g.h - 0.08, g.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      caps.setMatrixAt(i, dummy.matrix);
      color.copy(grassLow).lerp(grassHigh, clamp01(g.hn / treeLine));
      if (g.hn > treeLine) color.lerp(stone, clamp01((g.hn - treeLine) / Math.max(0.01, snowLine - treeLine)));
      if (g.hn > snowLine) color.lerp(snow, clamp01((g.hn - snowLine) / Math.max(0.01, 1 - snowLine) * 1.6));
      caps.setColorAt(i, color.offsetHSL(0, 0, (g.shade - 0.5) * 0.05));
    });
    this.world.add(cols_, caps);

    for (const [type, items] of Object.entries(byType)) this.scatterInstances("environment", environment[type], items);
  }

  buildTerrain({ rows, cols, cellSize: cs, cells, environment, border }) {
    const W = cols * cs, H = rows * cs;
    this.cameraManager.target.set(0, 0, 0);
    this.cameraManager.zoomFactor = 0.8;
    this.cameraManager.fit(W, H);

    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(W * 5, H * 5), mat(0x5c8f46));
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.y = -0.32;
    backdrop.receiveShadow = true;
    this.world.add(backdrop);

    this.buildBorder({ rows, cols, cellSize: cs, environment, border });   // moldura decorativa fora do mapa jogável

    const isWet = (t) => t === "water" || t === "bridge";
    const land = cells.filter((c) => !isWet(c.type));
    const wet = cells.filter((c) => isWet(c.type));
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(cs, 0.3, cs), mat(0xffffff), land.length);
    tiles.receiveShadow = true;
    land.forEach((c, i) => {
      dummy.position.set(c.x, -0.15, c.z);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
      const base = c.type === "spawn" ? 0x7a5f3d
        : c.type === "castle" ? 0x8c877d
        : c.type === "mud" ? ((c.row + c.col) % 2 ? 0x6b4f33 : 0x5f4529)
        : c.type === "trilha" ? ((c.row + c.col) % 2 ? 0xc9b27c : 0xbfa56d)
        : (c.row + c.col) % 2 ? 0x70b152 : 0x68a84c;
      tiles.setColorAt(i, color.set(base));
    });

    this.world.add(tiles);

    if (wet.length) {
      const water = new THREE.InstancedMesh(
        new THREE.BoxGeometry(cs, 0.2, cs), mat(0x3f8fd0, { roughness: 0.3 }), wet.length);
      water.receiveShadow = true;
      wet.forEach((c, i) => {
        dummy.position.set(c.x, -0.28, c.z);
        dummy.updateMatrix();
        water.setMatrixAt(i, dummy.matrix);
      });
      this.world.add(water);
    }

    const typeAt = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols ? "void" : cells[r * cols + c].type);

    for (const c of cells) {
      const spec = environment[c.type];
      if (spec && ["tree", "rock", "bush", "bridge"].includes(c.type)) {
        const { object3D } = this.createObject("environment", spec);
        object3D.position.set(c.x, 0, c.z);
        if (c.type !== "bridge") {
          this.setRotation(object3D, Math.random() * Math.PI * 2);
          object3D.scale.setScalar(0.9 + Math.random() * 0.25);
        }
        this.world.add(object3D);
      }

      if (c.type === "spawn") {
        const portal = part(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 8), 0x6b2fa3, c.x, 0.06, c.z);
        portal.material.emissive.set(0x8a3fe0);
        portal.material.emissiveIntensity = 0.7;
        this.world.add(portal);
      }

      // Peças de margem só aparecem se você tiver o .glb (fallback = nada)
      if (c.type === "water" && environment.waterEdge &&
          this.hasModel("environment", environment.waterEdge.model)) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = typeAt(c.row + dr, c.col + dc);
          if (t === "void" || isWet(t)) continue;
          const { object3D } = this.createObject("environment", environment.waterEdge);
          object3D.position.set(c.x, 0, c.z);
          this.setRotation(object3D, Math.atan2(dc, dr));
          this.world.add(object3D);
        }
      }
    }

    // Malha de construção (aparece ao escolher uma torre; só nas células onde dá para construir — veja setBuildGrid)
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    this.grid.position.y = 0.04;
    this.grid.frustumCulled = false;
    this.grid.visible = false;
    this.world.add(this.grid);
  }

  setGridVisible(v) { if (this.grid) this.grid.visible = v; }

  // Desenha o contorno só das células livres onde se pode construir. spots = [{x, z}] (centros 3D).
  setBuildGrid(spots, cs) {
    if (!this.grid) return;
    const h = cs / 2, pts = [];
    for (const { x, z } of spots) {
      pts.push(x - h, 0, z - h, x + h, 0, z - h,
               x + h, 0, z - h, x + h, 0, z + h,
               x + h, 0, z + h, x - h, 0, z + h,
               x - h, 0, z + h, x - h, 0, z - h);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.grid.geometry.dispose();
    this.grid.geometry = geo;
  }

  // Centraliza a câmera num ponto do mundo (ex.: o castelo no início da partida).
  focusCamera(x, z) {
    const c = this.cameraManager;
    c.anim = null;
    c.target.x = x;
    c.target.z = z;
    c.clamp();
  }

  /* ---- ghost (estrutura fantasma) ---- */
  createGhost(category, spec, range) {
    this.clearGhost();
    const { object3D } = this.createObject(category, spec);
    this.ghostMats = [];
    object3D.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      for (const m of [].concat(o.material)) {
        m.transparent = true; m.opacity = 0.7;
        this.ghostMats.push(m);
      }
    });

    let ring = null;                       // sem alcance (muro) = sem anel
    if (range > 0) {
      ring = new THREE.Mesh(
        new THREE.RingGeometry(range - 0.1, range, 64),
        new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
    }

    const group = new THREE.Group();
    group.add(object3D);
    if (ring) group.add(ring);
    group.visible = false;
    group.userData = { ring };
    this.world.add(group);
    this.ghost = group;
  }

  setGhost(x, z, valid) {
    if (!this.ghost) return;
    this.ghost.visible = true;
    this.ghost.position.set(x, 0, z);
    const c = valid ? 0x55ff88 : 0xff5555;
    this.ghost.userData.ring?.material.color.set(c);
    for (const m of this.ghostMats) { if (m.emissive) { m.emissive.set(c); m.emissiveIntensity = 0.55; } }
  }

  hideGhost() {
    if (this.ghost) this.ghost.visible = false;
    if (this.ghostLinks) this.ghostLinks.visible = false;
  }

  clearGhost() {
    if (this.ghostLinks) { this.ghostLinks.removeFromParent(); this.ghostLinks = null; }
    if (!this.ghost) return;
    this.world.remove(this.ghost);
    this.ghost = null;
  }

  /* ---- muros: segmento entre dois postes ---- */
  // a, b = {x, z} dos dois postes. `ghostMat` (opcional) desenha a prévia translúcida.
  createWallLink(spec = {}, a, b, ghostMat = null) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const root = new THREE.Group();
    root.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    root.rotation.y = Math.atan2(dx, dz);          // comprimento do segmento ao longo de +Z

    const k = this.scaleFor("structures");           // espessura/altura acompanham o poste (o comprimento não muda)
    const gltf = !ghostMat && spec.model ? this.assets.ready.get(this.assets.url("structures", spec.model)) : null;
    if (gltf) {
      const model = SkeletonUtils.clone(gltf.scene);
      const s = spec.scale ?? 1;
      model.scale.set(s * k, s * k, s * len / (spec.modelLength ?? 2));
      model.position.y = spec.yOffset ?? 0;
      root.add(model);
    } else {
      const f = spec.fallback ?? {};
      const h = (f.height ?? 1) * k, t = (f.thickness ?? 0.55) * k;
      const bodyHex = f.color ?? 0x9a9fa6;
      const capHex = new THREE.Color(bodyHex).offsetHSL(0, 0, 0.12).getHex();
      const body = new THREE.Mesh(LINK_GEO, ghostMat ?? linkMat(bodyHex));
      body.scale.set(t, h, len);
      body.position.y = h / 2;
      const cap = new THREE.Mesh(LINK_GEO, ghostMat ?? linkMat(capHex));
      cap.scale.set(t * 1.3, 0.12, len);
      cap.position.y = h + 0.06;
      for (const m of [body, cap]) { m.castShadow = !ghostMat; m.receiveShadow = true; root.add(m); }
    }
    return root;
  }

  // Prévia das ligações que a construção fantasma vai criar. links = [{a, b}] em coordenadas 3D.
  setGhostLinks(spec, links, valid) {
    if (!this.ghostLinks) { this.ghostLinks = new THREE.Group(); this.world.add(this.ghostLinks); }
    const g = this.ghostLinks;
    g.clear();                                      // geometria e materiais são compartilhados
    g.visible = true;
    const c = valid ? 0x55ff88 : 0xff5555;
    if (!this.ghostLinkMat) this.ghostLinkMat = mat(c, { transparent: true, opacity: 0.6 });
    this.ghostLinkMat.color.set(c);
    this.ghostLinkMat.emissive.set(c);
    this.ghostLinkMat.emissiveIntensity = 0.55;
    for (const { a, b } of links) g.add(this.createWallLink(spec, a, b, this.ghostLinkMat));
  }

  /* ---- efeitos (visuais, de curta duração) ---- */
  spawnEffect(spec, pos, size = 1) {
    const { object3D } = this.createObject("effects", spec);
    object3D.position.set(pos.x, pos.y, pos.z);
    this.world.add(object3D);
    this.effects.push({ obj: object3D, t: 0, dur: spec.duration ?? 0.4, size });
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.t += dt;
      const p = Math.min(fx.t / fx.dur, 1);
      fx.obj.scale.setScalar(fx.size * (0.4 + 0.7 * (1 - (1 - p) * (1 - p))));
      if (!fx.obj.userData.isModel) {
        fx.obj.traverse((o) => { if (o.isMesh) o.material.opacity = 1 - p; });
      }
      if (p >= 1) {
        fx.obj.traverse((o) => { if (o.isMesh && !fx.obj.userData.isModel) { o.geometry.dispose(); o.material.dispose(); } });
        this.world.remove(fx.obj);
        this.effects.splice(i, 1);
      }
    }
  }

  /* ---- câmera / render ---- */
  panCamera(dxPx, dyPx) { this.cameraManager.pan(dxPx, dyPx, this.canvas.clientHeight || 1); }
  zoomCamera(factor) { this.cameraManager.zoom(factor); }
  toggleZoom(point) { this.cameraManager.toggleZoom(point); }

  /* ---- contorno de seleção ---- */
  // Cópia da geometria com vértices soldados e normais suaves: sem isso o casco abre frestas nas quinas (flatShading).
  smoothGeometry(geo) {
    let out = this.smoothCache.get(geo);
    if (out) return out;
    out = geo.clone();
    for (const k of Object.keys(out.attributes)) if (k !== "position") out.deleteAttribute(k);
    out.morphAttributes = {};
    out = mergeVertices(out, 1e-4);
    out.computeVertexNormals();
    this.smoothCache.set(geo, out);
    return out;
  }

  // Cria os cascos de contorno de um modelo. `opacity` < 1 = contorno secundário (mais fraco).
  buildHulls(target, opacity = 1) {
    target.updateWorldMatrix(true, true);
    const meshes = [];
    target.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !o.userData.isHull) meshes.push(o); });

    const hulls = [];
    for (const mesh of meshes) {
      const ws = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
      const thick = SELECT_OUTLINE.thickness / Math.max(1e-4, Math.max(ws.x, ws.y, ws.z));   // compensa a escala do modelo
      const material = new THREE.MeshBasicMaterial({
        color: SELECT_OUTLINE.color, side: THREE.BackSide, fog: false, toneMapped: false,
        transparent: opacity < 1, opacity, depthWrite: opacity >= 1
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `vec3 transformed = position + normalize(normal) * ${thick.toFixed(5)};`
        );
      };
      const hull = new THREE.Mesh(this.smoothGeometry(mesh.geometry), material);
      hull.userData.isHull = true;
      hull.castShadow = false;
      hull.receiveShadow = false;
      mesh.add(hull);
      hulls.push(hull);
    }
    return hulls;
  }

  disposeHulls(hulls) {
    for (const h of hulls) { h.removeFromParent(); h.material.dispose(); }   // geometria fica no cache
  }

  // Contorna a construção `obj` (null remove). Usa só o modelo (yaw): a barra de vida fica de fora.
  setOutline(obj) {
    const target = obj ? (obj.userData?.yaw ?? obj) : null;
    if (target === this.outlineTarget) return;

    this.disposeHulls(this.outlineHulls);
    this.outlineHulls = [];
    this.outlineTarget = target;
    if (!target) return;
    this.outlineHulls = this.buildHulls(target, 1);
  }

  // Contornos secundários (metade da opacidade) para as construções ligadas à selecionada.
  // Recebe a lista completa de objetos 3D; só refaz o que mudou.
  setSecondaryOutlines(objs = []) {
    const targets = new Set(objs.filter(Boolean).map((o) => o.userData?.yaw ?? o));
    if (targets.has(this.outlineTarget)) targets.delete(this.outlineTarget);
    this.secondaryOutlines ??= new Map();
    for (const [t, hulls] of this.secondaryOutlines) {
      if (targets.has(t)) continue;
      this.disposeHulls(hulls);
      this.secondaryOutlines.delete(t);
    }
    for (const t of targets) {
      if (!this.secondaryOutlines.has(t)) this.secondaryOutlines.set(t, this.buildHulls(t, SELECT_OUTLINE.secondaryOpacity));
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const { w: mw, h: mh } = this.cameraManager.mapSize;
    this.cameraManager.fit(mw, mh, w / h);
  }

  render() {
    this.cameraManager.update();
    // Barras de vida: opacidade máxima no zoom mais perto, sumindo conforme o jogador se afasta.
    const { near, far } = HEALTH_BAR_FADE;
    const fade = THREE.MathUtils.clamp((far - this.cameraManager.zoomFactor) / (far - near), 0, 1);
    const opacity = HEALTH_BAR_OPACITY * fade;
    for (const bar of this.bars) {
      bar.quaternion.copy(this.camera.quaternion);
      for (const m of bar.userData.mats) m.opacity = opacity;
    }
    this.renderer.render(this.scene, this.camera);
  }
}