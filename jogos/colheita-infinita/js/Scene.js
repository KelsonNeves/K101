// Scene.js — renderer, câmera, luzes, chão e solo instanciado.
import * as THREE from 'three';
import { MAX_COLS, MAX_ROWS, PALETTE } from './Data.js';

const TILT = THREE.MathUtils.degToRad(55);

export class Scene {
  constructor(canvas) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    // Flag de qualidade: celular de tela pequena = sem sombra, sem antialias, pixelRatio 1,5.
    this.low = coarse && Math.min(innerWidth, innerHeight) < 820;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = this.low ? 1.5 : 2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    this.dist = 14; this.targetDist = 14;

    // Luzes
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(5, 12, 6);
    if (!this.low) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const s = this.sun.shadow.camera;
      s.left = -9; s.right = 9; s.top = 9; s.bottom = -9; s.near = 1; s.far = 40;
    }
    this.scene.add(this.sun);
    this.sunMorning = new THREE.Color(0xfff6e0);
    this.sunEvening = new THREE.Color(0xffb36a);

    // Chão
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Solo: UMA InstancedMesh com cor por instância.
    const soilGeo = new THREE.BoxGeometry(0.94, 0.1, 0.94);
    soilGeo.translate(0, -0.05, 0);                       // topo em y = 0
    this.soil = new THREE.InstancedMesh(soilGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_COLS * MAX_ROWS);
    this.soil.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.soil.count = 0;
    this.soil.frustumCulled = false;
    this.soil.receiveShadow = true;
    this.soil.setColorAt(0, new THREE.Color(0xffffff));  // cria instanceColor
    this.scene.add(this.soil);

    this.cEmpty = new THREE.Color(PALETTE.soilEmpty);
    this.cWet = new THREE.Color(PALETTE.soilWet);
    this.cTmp = new THREE.Color();
    this.m = new THREE.Matrix4();

    this.cols = 6; this.rows = 6;
    this.resize();
    this.placeCamera();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit(this.cols, this.rows);
  }

  // Distância da câmera para a grade inteira caber, com folga para o HUD.
  fit(cols, rows) {
    this.cols = cols; this.rows = rows;
    const w = cols + 1.4, d = rows + 1.4;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const needH = (w / 2) / Math.tan(hFov / 2);
    const needV = ((d * Math.sin(TILT)) / 2 + 0.6) / Math.tan(vFov / 2);
    this.targetDist = Math.max(needH, needV) * 1.15;
  }

  placeCamera() {
    this.camera.position.set(0, Math.sin(TILT) * this.dist, Math.cos(TILT) * this.dist);
    this.camera.lookAt(0, 0, 0);
  }

  // p: 0 (manhã clara) → 1 (fim de tarde alaranjada)
  setDayProgress(p) {
    this.sun.color.copy(this.sunMorning).lerp(this.sunEvening, Math.min(1, Math.max(0, p)));
  }

  // Solo muda de cor no mesmo quadro em que o estado muda; `hl` realça as células que seriam afetadas.
  updateSoil(cells, hl) {
    const n = cells.length;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      this.m.makeTranslation(c.x, 0, c.z);
      this.soil.setMatrixAt(i, this.m);
      this.cTmp.copy(c.state === 'growing' || c.state === 'ripe' ? this.cWet : this.cEmpty);
      if (hl && hl.has(c)) this.cTmp.offsetHSL(0, 0.05, 0.12);
      this.soil.setColorAt(i, this.cTmp);
    }
    this.soil.count = n;
    this.soil.instanceMatrix.needsUpdate = true;
    if (this.soil.instanceColor) this.soil.instanceColor.needsUpdate = true;
  }

  // Projeta um ponto do mundo para pixels de tela.
  worldToScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
  }

  render() {
    this.dist += (this.targetDist - this.dist) * 0.1;            // a grade «cresce» suavemente
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }
}
