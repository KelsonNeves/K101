/* ==========================================================================
   Vfx.js — efeitos visuais feitos em código (sem .glb).
   "Que brilhos e partículas aparecem agora?"
   TODAS as animações das construções ficam aqui:
     upgradeGlow(tower, scale)   → evolução: coluna de luz dourada subindo
     repairPulse(tower)          → reparo: anel verde no chão + faíscas verdes subindo
     constructionSite(tower)     → obra: andaime, martelo, poeira e anel de progresso
     buildComplete(tower)        → obra pronta: andaime se desmonta + onda de choque + "pulinho"
     setHealBeam(tower, alvo)    → laser da torre de restauração (contínuo; alvo null = desliga)
     collapse(tower, opts)       → demolição / destruição: a construção desaba em escombros
   Cada efeito se adiciona ao mesmo "pai" do objeto 3D da construção e se
   remove sozinho quando termina. Não conhece regras de jogo (quem decide
   quando chamar é o Game; o tempo da obra é de Tower.buildProgress).
   ========================================================================== */
import * as THREE from "three";
import { GAME_CONFIG } from "./Data.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* ------------------------------ Cores / ajustes ------------------------------ */
// Cor do brilho conforme o NOVO nível da construção (2 a 5).
const LEVEL_COLORS = { 2: 0x8be36e, 3: 0x5ec8ff, 4: 0xc77dff, 5: 0xffc83d };
const DEFAULT_COLOR = 0xffc83d;

const BUILD = {
  progress: 0xffa63d,      // arco de progresso da obra
  track: 0x1a1a1a,         // trilho do arco
  shock: 0x9ff3ff,         // onda de choque ao terminar (azul-claro: diferente do dourado da evolução)
  shockWarm: 0xfff0b0,
  spark: 0xfff3c0
};
const DUST = 0xcbb894;
const SMOKE = 0x3b3b3b;
const DEFAULT_DEBRIS = [0x9a9a96, 0x7b7a76, 0x6b5a47];   // quando não dá para ler a cor do modelo (textura)

/* ------------------------- Geometrias / materiais compartilhados ------------------------- */
const PILLAR = new THREE.CylinderGeometry(0.8, 1.0, 1, 24, 1, true);   // coluna de luz (altura 1, escalada)
const RING = new THREE.RingGeometry(0.82, 1.0, 48);                    // anel que se expande no chão
const ORB = new THREE.SphereGeometry(1, 20, 14);                       // clarão de energia
const SPARK = new THREE.SphereGeometry(0.075, 6, 5);                   // faíscas
const BOX = new THREE.BoxGeometry(1, 1, 1);                            // tábuas, escombros
const PUFF = new THREE.SphereGeometry(1, 10, 8);                       // nuvens de poeira / fumaça

const WOOD = new THREE.MeshLambertMaterial({ color: 0xb08650 });
const WOOD_DARK = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
const IRON = new THREE.MeshLambertMaterial({ color: 0x6b7078 });

// Laser da torre de restauração.
// Laser de restauração: fino e discreto. width/glowWidth = espessura do núcleo/brilho; drop = quanto o início do raio
// fica abaixo da altura da boca (muzzleHeight); spiral = raio da espiral de partículas; alpha = transparência geral.
const HEAL = { core: 0xe4ffee, glow: 0x4dff88, ring: 0x6dff9a, width: 0.03, glowWidth: 0.085, particles: 4, flow: 0.9, extend: 22, retract: 14,
               drop: 0.3, spiral: 0.09, alpha: 0.7 };
const BEAM = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);   // altura 1 no eixo Y, escalada para o comprimento
const UP = new THREE.Vector3(0, 1, 0);
const _src = new THREE.Vector3(), _dst = new THREE.Vector3(), _dir = new THREE.Vector3(), _n = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();

const DURATION = 1.3;   // segundos (brilho de evolução)
const REPAIR_COLOR = 0x6dff9a;   // verde do reparo
const REPAIR_DURATION = 0.8;     // segundos

/* ------------------------------ Utilidades internas ------------------------------ */
// Item do sistema: tick(dt) → true quando terminou; dispose() limpa tudo.
const timed = (duration, step, finish) => {
  let t = 0;
  return {
    tick(dt) {
      t += dt;
      if (t >= duration) return true;
      step(t);
      return false;
    },
    dispose: finish
  };
};

// Tamanho visual da obra (andaime, anel, nuvens), a partir da pegada e da altura da construção.
function sizeOf(tower) {
  const cs = GAME_CONFIG.cellSize ?? 2;
  const fp = tower.footprint ?? { width: 1, height: 1 };
  const w = fp.width * cs, d = fp.height * cs;
  return {
    w, d,
    bw: w * 0.62, bd: d * 0.62,
    h: Math.max(1.2, (tower.muzzleHeight ?? 2) * 1.05),
    radius: Math.max(w, d) * 0.5 * 0.95
  };
}

// Cores dominantes do modelo (para os escombros terem a cara da construção).
// Modelo com textura (cor branca) cai na paleta de pedra/madeira.
function paletteOf(obj, override) {
  if (override?.length) return override;
  const out = [];
  (obj?.userData?.pivot ?? obj)?.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m?.color) continue;
      const c = m.color;
      if (m.map && (c.r + c.g + c.b) / 3 > 0.85) continue;
      const hex = c.getHex();
      if (!out.includes(hex)) out.push(hex);
    }
  });
  return out.length ? out.slice(0, 5) : DEFAULT_DEBRIS;
}

// Nuvens (poeira/fumaça). specs: {x,y,z, vx,vy,vz, g?, life, delay?, s0, s1, color, op?}
function makePuffs(group, specs) {
  const list = specs.map((s) => {
    const mat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(PUFF, mat);
    mesh.visible = false;
    group.add(mesh);
    return { ...s, mat, mesh };
  });
  return {
    step(t) {
      for (const p of list) {
        const lt = t - (p.delay ?? 0);
        if (lt < 0 || lt > p.life) { p.mesh.visible = false; continue; }
        const k = lt / p.life;
        p.mesh.visible = true;
        p.mesh.position.set(p.x + p.vx * lt, p.y + p.vy * lt - (p.g ?? 0) * lt * lt * 0.5, p.z + p.vz * lt);
        p.mesh.scale.setScalar(p.s0 + (p.s1 - p.s0) * easeOut(k));
        p.mat.opacity = (p.op ?? 0.6) * Math.pow(1 - k, 1.3);
      }
    },
    dispose() { for (const p of list) { p.mat.dispose(); p.mesh.removeFromParent(); } }
  };
}

// Escombros: caixinhas que voam, caem no chão e encolhem no final.
// specs: {x,y,z, vx,vy,vz, wx,wy,wz, sx,sy,sz, color, delay?}
function makeDebris(group, specs, lifeEnd) {
  const mats = new Map();
  const list = specs.map((s) => {
    if (!mats.has(s.color)) mats.set(s.color, new THREE.MeshLambertMaterial({ color: s.color }));
    const mesh = new THREE.Mesh(BOX, mats.get(s.color));
    mesh.visible = false;
    mesh.castShadow = true;
    group.add(mesh);
    return { ...s, mesh };
  });
  return {
    step(t) {
      for (const b of list) {
        const lt = t - (b.delay ?? 0);
        if (lt < 0) { b.mesh.visible = false; continue; }
        const floor = b.sy * 0.5;
        b.mesh.visible = true;
        b.mesh.position.set(
          b.x + b.vx * lt * (1 - 0.3 * clamp01(lt)),
          Math.max(floor, b.y + b.vy * lt - 7 * lt * lt),
          b.z + b.vz * lt * (1 - 0.3 * clamp01(lt))
        );
        const spin = lt * (1 - 0.5 * clamp01(lt));
        b.mesh.rotation.set(b.wx * spin, b.wy * spin, b.wz * spin);
        const shrink = 1 - clamp01((t - lifeEnd * 0.65) / (lifeEnd * 0.35));
        b.mesh.scale.set(b.sx * shrink, b.sy * shrink, b.sz * shrink);
      }
    },
    dispose() { for (const b of list) b.mesh.removeFromParent(); mats.forEach((m) => m.dispose()); }
  };
}

// Andaime de obra (graybox): plataforma, 4 postes, travessas, diagonais e um martelo.
function buildScaffold(bw, bd, h) {
  const g = new THREE.Group();
  const parts = [];
  const add = (mat, sx, sy, sz, x, y, z, rz = 0) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = true;
    g.add(m);
    parts.push(m);
    return m;
  };
  const hx = bw / 2, hz = bd / 2, p = 0.09;

  add(WOOD_DARK, bw + 0.3, 0.08, bd + 0.3, 0, 0.04, 0);                          // plataforma
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(WOOD, p, h, p, sx * hx, h / 2, sz * hz);   // postes
  for (const y of [h * 0.4, h * 0.8]) {                                           // travessas
    add(WOOD_DARK, bw, 0.06, 0.06, 0, y, hz);
    add(WOOD_DARK, bw, 0.06, 0.06, 0, y, -hz);
    add(WOOD_DARK, 0.06, 0.06, bd, hx, y, 0);
    add(WOOD_DARK, 0.06, 0.06, bd, -hx, y, 0);
  }
  const diag = Math.hypot(bw, h * 0.4);                                           // diagonais (frente e trás)
  const ang = Math.atan2(h * 0.4, bw);
  add(WOOD_DARK, diag, 0.05, 0.05, 0, h * 0.6, hz + 0.02, ang);
  add(WOOD_DARK, diag, 0.05, 0.05, 0, h * 0.6, -hz - 0.02, -ang);

  // martelo (cabo + cabeça) que balança em volta de um pivô
  const hammer = new THREE.Group();
  hammer.position.set(hx + 0.28, 0.45, hz + 0.1);
  const handle = new THREE.Mesh(BOX, WOOD);
  handle.scale.set(0.05, 0.5, 0.05);
  handle.position.y = 0.25;
  const head = new THREE.Mesh(BOX, IRON);
  head.scale.set(0.22, 0.12, 0.12);
  head.position.y = 0.52;
  handle.castShadow = head.castShadow = true;
  hammer.add(handle, head);
  g.add(hammer);
  parts.push(hammer);

  return { group: g, parts, hammer };
}

/* ------------------------------ Sistema ------------------------------ */
export class VfxSystem {
  constructor() {
    this.items = [];
    this.sites = new Map();   // tower.uid → obra em andamento
    this.beams = new Map();   // tower.uid → laser de restauração ligado
  }

  /* ===================== EVOLUÇÃO (dourado, sobe) ===================== */
  // Brilho de evolução: coluna de luz + anéis + clarão + faíscas subindo + "pulinho" da torre.
  upgradeGlow(tower, finalScale = 1) {
    const obj = tower.object3D;
    const parent = obj?.parent;
    if (!parent) { obj?.scale.setScalar(finalScale); return; }

    const color = LEVEL_COLORS[tower.level] ?? DEFAULT_COLOR;
    const mh = tower.muzzleHeight ?? 2;
    const H = mh + 1.6;
    const fromScale = obj.scale.x || 1;

    const group = new THREE.Group();
    group.position.set(tower.position.x, 0, tower.position.z);
    parent.add(group);

    const mats = [];
    const make = (geo, c = color) => {
      const m = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false
      });
      mats.push(m);
      const mesh = new THREE.Mesh(geo, m);
      group.add(mesh);
      return mesh;
    };

    const pillar = make(PILLAR);
    const rings = [0, 0.18].map((delay) => {
      const r = make(RING);
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.06;
      return { mesh: r, delay };
    });
    const orb = make(ORB);
    orb.position.y = mh * 0.55;

    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    mats.push(sparkMat);

    const count = 12 + tower.level * 3;
    const sparks = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(SPARK, sparkMat);
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.8;
      mesh.visible = false;
      group.add(mesh);
      sparks.push({
        mesh,
        x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.1 + Math.random() * 0.9,
        vy: 1.8 + Math.random() * 2.6,
        delay: Math.random() * 0.3,
        life: 0.6 + Math.random() * 0.5
      });
    }

    this.items.push(timed(DURATION,
      (t) => {
        // coluna de luz: sobe rápido, afina e some
        const k = clamp01(t / 0.9);
        const h = Math.max(0.01, H * easeOut(clamp01(t / 0.3)));
        pillar.scale.set(1 - 0.5 * k, h, 1 - 0.5 * k);
        pillar.position.y = h / 2;
        pillar.material.opacity = 0.55 * Math.pow(1 - k, 1.5);

        // anéis no chão
        for (const { mesh, delay } of rings) {
          const kk = clamp01((t - delay) / 0.8);
          mesh.scale.setScalar(0.5 + 1.7 * easeOut(kk));
          mesh.material.opacity = t < delay ? 0 : 0.9 * (1 - kk);
        }

        // clarão
        const kb = clamp01(t / 0.5);
        orb.scale.setScalar(0.6 + 1.6 * easeOut(kb));
        orb.material.opacity = 0.7 * Math.pow(1 - kb, 2);

        // faíscas subindo
        for (const s of sparks) {
          const lt = t - s.delay;
          if (lt < 0 || lt > s.life) { s.mesh.visible = false; continue; }
          s.mesh.visible = true;
          s.mesh.position.set(s.x, s.y + s.vy * lt, s.z);
          s.mesh.scale.setScalar(Math.max(0.05, 1 - lt / s.life) * 1.4);
        }

        // "pulinho" da construção ao crescer para o novo tamanho
        const kp = clamp01(t / 0.35);
        const s = fromScale + (finalScale - fromScale) * easeOut(kp) + 0.12 * Math.sin(kp * Math.PI);
        obj.scale.setScalar(s);
      },
      () => {
        obj.scale.setScalar(finalScale);
        group.removeFromParent();
        mats.forEach((m) => m.dispose());
      }
    ));
  }

  /* ===================== REPARO (verde, simples) ===================== */
  // Anel verde que se expande no chão + algumas faíscas verdes subindo.
  repairPulse(tower) {
    const parent = tower.object3D?.parent;
    if (!parent) return;
    const { radius } = sizeOf(tower);
    const mh = tower.muzzleHeight ?? 2;

    const group = new THREE.Group();
    group.position.set(tower.position.x, 0, tower.position.z);
    parent.add(group);

    const mat = new THREE.MeshBasicMaterial({
      color: REPAIR_COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const ring = new THREE.Mesh(RING, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    const sparks = [];
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(SPARK, mat);
      const a = Math.random() * Math.PI * 2, r = radius * (0.2 + Math.random() * 0.7);
      mesh.visible = false;
      group.add(mesh);
      sparks.push({ mesh, x: Math.cos(a) * r, z: Math.sin(a) * r, vy: 1.2 + Math.random() * 1.2, delay: Math.random() * 0.25 });
    }

    this.items.push(timed(REPAIR_DURATION,
      (t) => {
        const k = clamp01(t / REPAIR_DURATION);
        ring.scale.setScalar(Math.max(0.1, radius * (0.4 + 1.1 * easeOut(k))));
        mat.opacity = 0.8 * (1 - k);
        for (const sp of sparks) {
          const lt = t - sp.delay;
          if (lt < 0) { sp.mesh.visible = false; continue; }
          sp.mesh.visible = true;
          sp.mesh.position.set(sp.x, 0.2 + sp.vy * lt, sp.z);
          sp.mesh.scale.setScalar(Math.max(0.05, 1 - lt / (REPAIR_DURATION - sp.delay)) * 1.3);
        }
      },
      () => { group.removeFromParent(); mat.dispose(); }
    ));
  }

  /* ===================== LASER DE RESTAURAÇÃO ===================== */
  // Liga/troca/desliga o laser da torre. Enquanto estiver ligado a animação é contínua: o raio estica até o alvo,
  // partículas verdes sobem em espiral ao longo dele e o ponto de contato brilha a cada pulso de cura
  // (tower.healPulse). Ao trocar de alvo a ponta desliza até a nova construção; ao desligar o raio recolhe.
  setHealBeam(tower, target) {
    const current = this.beams.get(tower.uid);
    if (!target) { current?.release(); return; }
    if (current) { current.retarget(target); return; }
    const beam = this.makeHealBeam(tower, target);
    if (!beam) return;
    this.beams.set(tower.uid, beam);
    this.items.push(beam.item);
  }

  makeHealBeam(tower, target) {
    const parent = tower.object3D?.parent;
    if (!parent) return null;
    const group = new THREE.Group();
    parent.add(group);

    const mk = (color) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const coreMat = mk(HEAL.core), glowMat = mk(HEAL.glow), orbMat = mk(HEAL.glow), ringMat = mk(HEAL.ring);
    const core = new THREE.Mesh(BEAM, coreMat);
    const glow = new THREE.Mesh(BEAM, glowMat);
    const srcOrb = new THREE.Mesh(ORB, orbMat);
    const endOrb = new THREE.Mesh(ORB, orbMat);
    const ring = new THREE.Mesh(RING, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(core, glow, srcOrb, endOrb, ring);
    const parts = Array.from({ length: HEAL.particles }, (_, i) => {
      const m = new THREE.Mesh(SPARK, coreMat);
      group.add(m);
      return { m, k: i / HEAL.particles };
    });

    const srcY = () => tower.muzzleHeight - HEAL.drop;          // início do raio, um pouco abaixo da boca
    const end = new THREE.Vector3(tower.position.x, srcY(), tower.position.z);   // ponta do raio (começa na torre e estica)
    let t = 0, a = 0, releasing = false, disposed = false, color = -1;
    const state = { target };

    const tick = (dt) => {
      t += dt;
      tower.healPulse = Math.max(0, (tower.healPulse ?? 0) - dt * 4);
      if (!tower.alive || !tower.object3D?.parent) releasing = true;
      a = clamp01(a + dt * (releasing ? -6 : 10));
      if (releasing && a <= 0) return true;

      _src.set(tower.position.x, srcY(), tower.position.z);
      const tg = state.target;
      if (!releasing && tg?.alive) _dst.set(tg.position.x, Math.max(0.5, (tg.muzzleHeight ?? 1.4) * 0.55), tg.position.z);
      else _dst.copy(_src);                                     // recolhe até a torre
      end.lerp(_dst, 1 - Math.exp(-dt * (releasing ? HEAL.retract : HEAL.extend)));

      _dir.subVectors(end, _src);
      const len = _dir.length();
      const pulse = tower.healPulse ?? 0;
      const pw = tower.healPower ?? 1;                           // 1 = cheio … 0 = sem energia (laser transparente)
      if (tower.healColor !== color) {                           // cor do nível da torre
        color = tower.healColor;
        coreMat.color.setHex(color).lerp(WHITE, 0.97);
        for (const m of [glowMat, orbMat, ringMat]) m.color.setHex(color);
      }
      const wob = (1 + 0.12 * Math.sin(t * 30) + pulse * 0.4) * (0.45 + 0.55 * pw);
      const show = len > 0.05;
      core.visible = glow.visible = show;
      if (show) {
        _n.copy(_dir).divideScalar(len);
        for (const [mesh, w] of [[core, HEAL.width], [glow, HEAL.glowWidth]]) {
          mesh.position.copy(_src).addScaledVector(_dir, 0.5);
          mesh.quaternion.setFromUnitVectors(UP, _n);
          mesh.scale.set(w * wob, len, w * wob);
        }
        // espiral de partículas subindo da torre para a construção
        _p1.crossVectors(_n, UP);
        if (_p1.lengthSq() < 1e-4) _p1.set(1, 0, 0);
        _p1.normalize();
        _p2.crossVectors(_n, _p1);
        for (const p of parts) {
          const f = (p.k + t * HEAL.flow) % 1;
          const ang = t * 7 + p.k * Math.PI * 2;
          const r = (HEAL.spiral * Math.sin(f * Math.PI))/4;
          p.m.position.copy(_src).addScaledVector(_dir, f)
            .addScaledVector(_p1, Math.cos(ang) * r).addScaledVector(_p2, Math.sin(ang) * r);
          p.m.scale.setScalar(0.75 + Math.sin(f * Math.PI) * 0.2);
        }
      }
      for (const p of parts) p.m.visible = show;

      srcOrb.position.copy(_src);
      srcOrb.scale.setScalar(0.1 * (1 + 0.15 * Math.sin(t * 12) + pulse * 0.4));
      endOrb.position.copy(end);
      endOrb.scale.setScalar(0.13 * (1 + 0.2 * Math.sin(t * 9) + pulse * 0.6));
      ring.position.set(end.x, 0.07, end.z);
      ring.scale.setScalar(Math.max(0.1, (0.42 + 0.06 * Math.sin(t * 6) + pulse * 0.2) * clamp01(len / 0.8)));

      const f = a * pw;
      coreMat.opacity = 0.95 * HEAL.alpha * f;
      glowMat.opacity = (0.3 + 0.08 * Math.sin(t * 14) + pulse * 0.25) * 0.5 * HEAL.alpha * f;
      orbMat.opacity = 0.6 * HEAL.alpha * f;
      ringMat.opacity = 0.65 * 0.6 * HEAL.alpha * f;
      return false;
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      coreMat.dispose(); glowMat.dispose(); orbMat.dispose(); ringMat.dispose();
      if (this.beams.get(tower.uid) === beam) this.beams.delete(tower.uid);
    };

    const beam = {
      item: { tick, dispose },
      release: () => { releasing = true; },
      retarget: (next) => { state.target = next; releasing = false; }
    };
    return beam;
  }

  /* ===================== OBRA EM ANDAMENTO ===================== */
  // Andaime + martelo + poeira + arco de progresso. O modelo "cresce" do chão conforme tower.buildProgress.
  // Termina sozinho quando buildComplete() ou collapse() assume a obra.
  constructionSite(tower) {
    const obj = tower.object3D;
    const parent = obj?.parent;
    if (!parent || tower.built || this.sites.has(tower.uid)) return;

    const pivot = obj.userData.pivot ?? obj;
    const { bw, bd, h, radius } = sizeOf(tower);
    pivot.scale.set(0.9, 0.03, 0.9);               // já nasce "no chão" (sem piscar o modelo inteiro)

    const group = new THREE.Group();
    group.position.set(tower.position.x, 0, tower.position.z);
    parent.add(group);

    const { group: scaffold, parts, hammer } = buildScaffold(bw, bd, h);
    group.add(scaffold);

    const ringMat = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide
    });
    const track = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.12, 48), ringMat(BUILD.track, 0.35));
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.05;
    group.add(track);

    const arcMat = ringMat(BUILD.progress, 0.95);
    let arc = null, arcStep = -1;
    const setArc = (p) => {            // refaz a geometria só a cada ~2% (barato)
      const step = Math.floor(p * 48);
      if (step === arcStep) return;
      arcStep = step;
      if (arc) { arc.geometry.dispose(); group.remove(arc); arc = null; }
      if (step <= 0) return;
      const geo = new THREE.RingGeometry(radius - 0.02, radius + 0.14, 48, 1, Math.PI / 2, -Math.PI * 2 * clamp01(p));
      arc = new THREE.Mesh(geo, arcMat);
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.07;
      group.add(arc);
    };

    const site = { group, scaffold, parts, done: false };
    this.sites.set(tower.uid, site);

    let t = 0, emit = 0;
    this.items.push({
      tick: (dt) => {
        if (site.done) return true;
        t += dt;
        const p = clamp01(tower.buildProgress);
        const e = easeOut(p);

        // o modelo sobe do chão
        pivot.scale.set(0.9 + 0.1 * e, Math.max(0.03, e), 0.9 + 0.1 * e);

        // andaime "pula" para dentro e o martelo balança
        const pop = easeOut(clamp01(t / 0.35));
        scaffold.scale.set(0.8 + 0.2 * pop, Math.max(0.01, pop), 0.8 + 0.2 * pop);
        hammer.rotation.z = -0.2 - Math.abs(Math.sin(t * 7)) * 1.1;

        setArc(p);

        emit -= dt;
        if (emit <= 0) {
          emit = rand(0.18, 0.3);
          this.dustPuff(parent, tower.position.x + rand(-bw / 2, bw / 2), tower.position.z + rand(-bd / 2, bd / 2));
        }
        return false;
      },
      dispose: () => {
        if (arc) arc.geometry.dispose();
        track.geometry.dispose();
        track.material.dispose();
        arcMat.dispose();
        group.removeFromParent();      // se o andaime foi "solto" (scatter), ele já saiu daqui
      }
    });
  }

  // Pequena nuvem de poeira (usada durante a obra).
  dustPuff(parent, x, z, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0.1, z);
    parent.add(g);
    const puffs = makePuffs(g, [{
      x: 0, y: 0, z: 0, vx: rand(-0.25, 0.25), vy: rand(0.35, 0.6), vz: rand(-0.25, 0.25),
      life: 0.8, s0: 0.12 * scale, s1: 0.42 * scale, color: DUST, op: 0.5
    }]);
    this.items.push(timed(0.8, puffs.step, () => { puffs.dispose(); g.removeFromParent(); }));
  }

  /* ===================== OBRA PRONTA (azul/branco, onda de choque) ===================== */
  // Andaime se desmonta voando, onda de choque no chão, nuvem de poeira, faíscas em leque e "pulinho" elástico.
  buildComplete(tower) {
    const obj = tower.object3D;
    const parent = obj?.parent;
    if (!parent) return;
    const pivot = obj.userData.pivot ?? obj;
    pivot.scale.set(1, 1, 1);

    const site = this.sites.get(tower.uid);
    if (site) {
      this.scatterScaffold(parent, tower.position, site, 1);
      this.sites.delete(tower.uid);
    }

    const { radius, w, d } = sizeOf(tower);
    const group = new THREE.Group();
    group.position.set(tower.position.x, 0, tower.position.z);
    parent.add(group);

    const mats = [];
    const ringMesh = (color) => {
      const m = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false
      });
      mats.push(m);
      const mesh = new THREE.Mesh(RING, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.08;
      group.add(mesh);
      return mesh;
    };
    const shocks = [
      { mesh: ringMesh(BUILD.shock), delay: 0, reach: radius * 2.8 },
      { mesh: ringMesh(BUILD.shockWarm), delay: 0.09, reach: radius * 2.0 }
    ];

    // poeira radial
    const dust = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
      const sp = rand(1.1, 1.9);
      dust.push({
        x: Math.cos(a) * w * 0.3, y: 0.1, z: Math.sin(a) * d * 0.3,
        vx: Math.cos(a) * sp, vy: rand(0.3, 0.7), vz: Math.sin(a) * sp,
        life: rand(0.6, 0.9), s0: 0.2, s1: rand(0.6, 0.95), color: DUST, op: 0.55
      });
    }
    const puffs = makePuffs(group, dust);

    // faíscas em leque (saem para os lados e caem, diferente das faíscas verticais da evolução)
    const sparkMat = new THREE.MeshBasicMaterial({
      color: BUILD.spark, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    mats.push(sparkMat);
    const sparks = [];
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(SPARK, sparkMat);
      mesh.visible = false;
      group.add(mesh);
      const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
      const sp = rand(1.4, 2.6);
      sparks.push({ mesh, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rand(2.2, 3.6), life: rand(0.5, 0.75) });
    }

    this.items.push(timed(1.0,
      (t) => {
        for (const { mesh, delay, reach } of shocks) {
          const k = clamp01((t - delay) / 0.55);
          mesh.scale.setScalar(Math.max(0.01, radius * 0.5 + (reach - radius * 0.5) * easeOut(k)));
          mesh.material.opacity = t < delay ? 0 : 0.85 * Math.pow(1 - k, 1.4);
        }
        puffs.step(t);
        for (const s of sparks) {
          if (t > s.life) { s.mesh.visible = false; continue; }
          s.mesh.visible = true;
          s.mesh.position.set(s.vx * t, 0.3 + s.vy * t - 6 * t * t, s.vz * t);
          s.mesh.scale.setScalar(Math.max(0.05, 1 - t / s.life) * 1.5);
        }
        // "pulinho" elástico (squash & stretch) da construção
        if (t < 0.6) {
          const b = Math.exp(-5 * t) * Math.sin(t * 22) * 0.13;
          pivot.scale.set(1 - b * 0.55, 1 + b, 1 - b * 0.55);
        }
      },
      () => {
        pivot.scale.set(1, 1, 1);
        puffs.dispose();
        mats.forEach((m) => m.dispose());
        group.removeFromParent();
      }
    ));
  }

  // Solta as peças do andaime para voarem em volta e caírem (usado ao terminar a obra e ao desabar uma obra).
  scatterScaffold(parent, pos, site, power = 1) {
    site.done = true;                                // a obra para de animar
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);
    parent.add(g);
    g.add(site.scaffold);                            // sai do grupo da obra e vem para cá

    const bits = site.parts.map((m) => ({
      m,
      x: m.position.x, y: m.position.y, z: m.position.z,
      rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z,
      sx: m.scale.x, sy: m.scale.y, sz: m.scale.z,
      vx: (m.position.x === 0 ? rand(-1, 1) : Math.sign(m.position.x)) * rand(0.8, 2.2) * power,
      vy: rand(2.4, 4.6) * power,
      vz: (m.position.z === 0 ? rand(-1, 1) : Math.sign(m.position.z)) * rand(0.8, 2.2) * power,
      wx: rand(-6, 6), wy: rand(-6, 6), wz: rand(-6, 6)
    }));
    const LIFE = 1.0;

    this.items.push(timed(LIFE,
      (t) => {
        const shrink = 1 - clamp01((t - LIFE * 0.65) / (LIFE * 0.35));
        for (const b of bits) {
          b.m.position.set(b.x + b.vx * t, Math.max(0.05, b.y + b.vy * t - 7 * t * t), b.z + b.vz * t);
          b.m.rotation.set(b.rx + b.wx * t, b.ry + b.wy * t, b.rz + b.wz * t);
          b.m.scale.set(b.sx * shrink, b.sy * shrink, b.sz * shrink);
        }
      },
      () => g.removeFromParent()                      // materiais/geometrias são compartilhados: não descarta
    ));
  }

  /* ===================== DEMOLIÇÃO / DESTRUIÇÃO ===================== */
  // A construção desaba: treme, inclina, afunda no chão e solta escombros + poeira (+ fumaça se `violent`).
  // opts.violent  → true quando um inimigo quebrou (mais tremor, escombros e fumaça); false ao demolir.
  // opts.colors   → cores dos escombros (padrão: lidas do modelo).
  // opts.onDone   → chamado quando o modelo some (o Game remove o objeto 3D aqui).
  collapse(tower, { violent = false, colors = null, onDone = null } = {}) {
    const obj = tower.object3D;
    const parent = obj?.parent;
    if (!parent) { onDone?.(); return; }
    const pivot = obj.userData.pivot ?? obj;

    // se ainda estava em obra, o andaime também vai pelos ares
    const site = this.sites.get(tower.uid);
    if (site) {
      this.scatterScaffold(parent, tower.position, site, violent ? 1.3 : 1);
      this.sites.delete(tower.uid);
    }

    const { w, d, h } = sizeOf(tower);
    const palette = paletteOf(obj, colors);
    const group = new THREE.Group();
    group.position.set(tower.position.x, 0, tower.position.z);
    parent.add(group);

    const shakeT = violent ? 0.2 : 0.08;       // tremor antes de ceder
    const crumbleT = violent ? 0.75 : 0.6;     // tempo para afundar
    const total = shakeT + 1.2;                // + vida dos escombros
    const startY = pivot.scale.y, startXZ = pivot.scale.x;
    const base = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
    const tilt = violent ? 0.4 : 0.12;
    const dir = rand(0, Math.PI * 2);

    // escombros
    const n = violent ? 20 : 12;
    const power = violent ? 1 : 0.55;
    const debrisSpecs = [];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(1.0, 3.2) * power;
      const size = rand(0.1, 0.3) * (0.7 + w / 4);
      debrisSpecs.push({
        x: rand(-w * 0.3, w * 0.3), y: rand(0.15, h * 0.9), z: rand(-d * 0.3, d * 0.3),
        vx: Math.cos(a) * sp, vy: rand(1.2, 4.2) * power, vz: Math.sin(a) * sp,
        wx: rand(-9, 9), wy: rand(-9, 9), wz: rand(-9, 9),
        sx: size * rand(0.7, 1.4), sy: size * rand(0.5, 1.1), sz: size * rand(0.7, 1.4),
        color: pick(palette), delay: shakeT
      });
    }
    const debris = makeDebris(group, debrisSpecs, total - shakeT);

    // poeira em anel (+ fumaça escura subindo, na destruição)
    const puffSpecs = [];
    const ringN = violent ? 12 : 8;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + rand(-0.25, 0.25);
      const sp = rand(0.9, 1.6) * (violent ? 1.5 : 1);
      puffSpecs.push({
        x: Math.cos(a) * w * 0.25, y: 0.15, z: Math.sin(a) * d * 0.25,
        vx: Math.cos(a) * sp, vy: rand(0.4, 0.9), vz: Math.sin(a) * sp,
        life: rand(0.8, 1.1), delay: shakeT + rand(0, 0.12), s0: 0.25, s1: rand(0.8, 1.2), color: DUST, op: 0.6
      });
    }
    if (violent) {
      for (let i = 0; i < 6; i++) {
        puffSpecs.push({
          x: rand(-w * 0.2, w * 0.2), y: rand(0.3, h * 0.6), z: rand(-d * 0.2, d * 0.2),
          vx: rand(-0.3, 0.3), vy: rand(1.2, 2.0), vz: rand(-0.3, 0.3),
          life: rand(0.9, 1.2), delay: shakeT + rand(0, 0.2), s0: 0.3, s1: rand(1.0, 1.5), color: SMOKE, op: 0.5
        });
      }
    }
    const puffs = makePuffs(group, puffSpecs);

    let finished = false;
    const finish = () => { if (!finished) { finished = true; onDone?.(); } };

    this.items.push(timed(total,
      (t) => {
        if (t < shakeT) {                                   // tremor
          const amp = violent ? 0.06 : 0.02;
          obj.position.set(base.x + rand(-amp, amp), base.y, base.z + rand(-amp, amp));
        } else {                                            // cede, inclina e afunda
          const k = clamp01((t - shakeT) / crumbleT);
          const ek = k * k;
          obj.position.set(base.x, base.y - 0.35 * ek, base.z);
          pivot.scale.set(startXZ * (1 + 0.12 * k), Math.max(0.02, startY * (1 - ek)), startXZ * (1 + 0.12 * k));
          pivot.rotation.set(Math.sin(dir) * tilt * ek, 0, Math.cos(dir) * tilt * ek);
          if (k >= 1) finish();
        }
        puffs.step(t);
        debris.step(t);
      },
      () => {
        finish();
        puffs.dispose();
        debris.dispose();
        group.removeFromParent();
      }
    ));
  }

  /* ===================== loop ===================== */
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const fx = this.items[i];
      if (fx.tick(dt)) {
        fx.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }
}