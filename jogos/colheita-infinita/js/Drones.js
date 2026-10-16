// Drones.js — modelos 3D dos drones (.glb) e a simulação deles: cada drone voa até uma célula que precisa
// do seu serviço (semear, aguar ou colher), age, espera o ciclo e procura a próxima. Trabalham em TODOS os campos.
//
// Modelo (assets/models/drones/<plant|water|harvest>.glb): um objeto só, origem no centro do corpo,
// uns 0,6 de largura, cor sólida (sem textura), até ~600 triângulos. Nós chamados `rotor*` giram sozinhos.
// Sem o arquivo, o jogo usa um drone provisório de caixas coloridas (e avisa no console).
//
// Seleção: passar o mouse em QUALQUER parte do corpo do drone mostra um contorno branco; clicar abre um painel
// com o campo (arado) onde ele deve trabalhar («Todos» = padrão) e, no semeador, a semente (ou «Auto», que
// planta o que o jogador está plantando) e o botão ▶ Iniciar / ■ Parar: o drone só trabalha depois do ▶ e, sem
// serviço por 3 s (ou desligado), espera fora do campo. O raio de clique usa uma esfera invisível (`hit`) em volta do drone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRONE_IDS, DRONE_INFO, BASE_STATS, TOOLS, CELL } from './Data.js';
import { CROPS } from './Crops.js';
import { Sound } from './Audio.js';

const FLY_HEIGHT = 1.15;          // altura de voo (unidades do mundo)
const BASE_FLY_SPEED = 5;         // unidades por segundo no ciclo base
const ARRIVE = 0.06;              // distância para considerar «chegou»
const ROTOR_SPIN = 38;            // rad/s
const WAIT_MAX = 1.0;             // s travado (sem poder andar) antes de desistir do alvo e procurar outro
const IDLE_WAIT = 3;              // s sem serviço antes de sair do arado e esperar do lado de fora
const MIN_SEP = 0.8;              // distância mínima entre dois drones (nunca se sobrepõem)
const ANGLES = [0, 0.6, 1.2, 1.9].flatMap((a, i) => (i === 0 ? [0] : [a, -a]));   // direções testadas: reto, depois para os lados (rad)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

// Contorno branco simples: casco invertido (faces de trás) empurrado um pouco para fora. Um material só.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
OUTLINE_MAT.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
    `#include <begin_vertex>
     transformed += normal * 0.014 + position / max(length(position), 0.05) * 0.016;`);   // normal + radial: fecha as quinas
};
OUTLINE_MAT.customProgramCacheKey = () => 'drone-outline';
const HIT_GEO = new THREE.SphereGeometry(0.3, 8, 6);
const HIT_MAT = new THREE.MeshBasicMaterial();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// Drone provisório: corpo + 4 hélices (nós `rotor*`) + «bico» embaixo.
function placeholderDrone(id) {
  const color = DRONE_INFO[id].color;
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.34), mat(color));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.2), mat(0x3a2a1a));
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(0xfff4d6));
  nose.position.set(0, -0.11, 0);
  g.add(body, stripe, nose);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz], i) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), mat(0x3a2a1a));
    arm.position.set(sx * 0.17, 0.02, sz * 0.17); arm.rotation.y = Math.PI / 4 * sx * sz;
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.05), mat(0xfff4d6));
    rotor.name = `rotor${i}`;
    rotor.position.set(sx * 0.24, 0.1, sz * 0.24);
    g.add(arm, rotor);
  });
  return g;
}

// Carrega os .glb dos drones. Devolve { plant, water, harvest } onde cada valor é uma função que cria um drone novo.
export async function loadDroneModels(manager) {
  const loader = new GLTFLoader(manager);
  const factories = {};
  await Promise.all(DRONE_IDS.map(async (id) => {
    let gltf;
    try {
      gltf = await loader.loadAsync(`assets/models/drones/${id}.glb`);
    } catch {
      console.warn(`[Drones] ${id}.glb não encontrado: usando drone provisório.`);
      factories[id] = () => placeholderDrone(id);
      return;
    }
    // Cor sólida e sombreamento chapado, como as plantas.
    const cache = new Map();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const key = o.material.color.getHex();
      if (!cache.has(key)) cache.set(key, new THREE.MeshLambertMaterial({ color: o.material.color, flatShading: true }));
      o.material = cache.get(key);
    });
    factories[id] = () => gltf.scene.clone(true);
  }));
  return factories;
}

export class DroneSwarm {
  constructor(game, factories) {
    this.game = game;
    this.factories = factories ?? {};
    this.group = new THREE.Group();
    game.scene.scene.add(this.group);
    this.list = [];
    this.claimed = new Set();       // células já escolhidas por algum drone (evita dois no mesmo alvo)
    this.cfg = new Map();           // escolhas do jogador por drone (campo e semente), mantidas de um dia para o outro
    this.hover = null;              // drone sob o mouse
    this.sfxCd = 0;
    this.clock = 0;
    this.layer = document.getElementById('drone-layer');   // camada HTML do painel de seleção
    this.v = new THREE.Vector3();
    this.panel = el('div', 'drone-panel');
    this.panel.hidden = true; this.panel.setAttribute('role', 'dialog');
    this.panelKey = '';
    if (this.layer) {
      this.layer.appendChild(this.panel);
      this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    }
  }

  // Início do dia: recria a frota conforme as compras (S.drones[id].count).
  reset() {
    for (const d of this.list) this.group.remove(d.mesh);
    this.list = []; this.claimed.clear(); this.hover = null; this.panelKey = '';
    this.panel.hidden = true;
    const g = this.game;
    this.offsets = []; let acc = 0;                       // posição do 1º índice de cada campo em grid.cells
    for (const f of g.fields) { this.offsets.push(acc); acc += f.cols * f.rows; }
    for (const id of DRONE_IDS) {
      const n = g.S.drones[id].count;
      for (let i = 0; i < n; i++) {
        const make = this.factories[id] ?? (() => placeholderDrone(id));
        const mesh = make();
        mesh.traverse((o) => { if (o.isMesh) o.castShadow = !g.scene.low; });
        const rotors = [], meshes = [];
        mesh.traverse((o) => { if (o.name?.startsWith('rotor')) rotors.push(o); if (o.isMesh) meshes.push(o); });
        // contorno (escondido até o mouse passar) como filho de cada malha: herda posição e giro das hélices
        const outlines = meshes.map((m) => {
          const o = new THREE.Mesh(m.geometry, OUTLINE_MAT);
          o.visible = false; o.castShadow = false; o.raycast = () => {};
          m.add(o);
          return o;
        });
        const hit = new THREE.Mesh(HIT_GEO, HIT_MAT);      // área de clique generosa em volta do corpo
        hit.visible = false;
        mesh.add(hit);
        this.group.add(mesh);
        const key = `${id}:${i}`, saved = this.cfg.get(key) ?? {};
        this.list.push({
          id, key, mesh, rotors, outlines, hit, outlined: false, target: null, cell: null,
          x: 0, z: 0, y: FLY_HEIGHT,
          active: false,                                                   // só trabalha depois do ▶ no painel
          idleT: 0, scan: 0, blocked: 0, side: 1, moving: false,
          cd: 0, phase: Math.random() * Math.PI * 2, tilt: 0,
          crop: saved.crop ?? null,                                        // null = acompanha a semente do jogador
          field: saved.field ?? null,                                      // null = trabalha em todos os campos
          open: false
        });
      }
    }
    for (const d of this.list) {                           // todos começam na área de espera
      const s = this.slot(d);
      d.x = s.x; d.z = s.z; d.cell = this.cellAt(d.x, d.z);
      this.place(d);
    }
  }

  // Área de espera: faixa fora do campo (lado de baixo) do campo escolhido para o drone (ou do principal).
  slot(d) {
    const main = this.game.fields[0], home = this.fieldOf(d) ?? main;
    const mates = this.list.filter((o) => (this.fieldOf(o) ?? main) === home);
    const i = Math.max(0, mates.indexOf(d)), n = Math.max(1, mates.length);
    return { x: home.x + (i - (n - 1) / 2) * 0.9, z: home.z + home.rows / 2 + 1.2 };
  }

  // Célula do chão sob o ponto (x, z), ou null se estiver fora de todos os campos.
  cellAt(x, z) {
    const fs = this.game.fields, cells = this.game.grid.cells;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      const col = Math.floor((x - f.x) / CELL + f.cols / 2), row = Math.floor((z - f.z) / CELL + f.rows / 2);
      if (col >= 0 && col < f.cols && row >= 0 && row < f.rows) return cells[this.offsets[i] + row * f.cols + col] ?? null;
    }
    return null;
  }

  // Outro drone está (parado ou voando) sobre esta célula?
  occupiedBy(cell, d) { return this.list.some((o) => o !== d && o.cell === cell); }

  // Campo (objeto de Fields.js) escolhido para o drone, ou null = todos (também se o campo não existir hoje).
  fieldOf(d) { return d.field ? this.game.fields.find((f) => f.key === d.field) ?? null : null; }

  cycleOf(d) {
    const st = this.game.S.drones[d.id];
    return st.cooldown * (d.id === 'plant' ? CROPS[this.cropOf(d)].plantMult : 1);   // semear planta nova é mais lento
  }

  // Semente deste drone: a que o jogador escolheu para ele (se ainda liberada) ou a que o jogador está plantando.
  cropOf(d) {
    const g = this.game;
    return d.crop && g.S.unlockedCrops.includes(d.crop) ? d.crop : g.selection.crop;
  }

  // Célula livre (sem outro drone sobre ela nem como alvo) mais próxima que precisa do serviço deste drone.
  pick(d) {
    const tool = TOOLS[d.id], g = this.game, f = this.fieldOf(d);
    const busy = new Set();                                   // células com outro drone em cima: ficam de fora
    for (const o of this.list) if (o !== d && o.cell) busy.add(o.cell);
    let best = null, bd = Infinity;
    for (const c of g.grid.cells) {
      if (f && c.field !== f.id) continue;
      if (this.claimed.has(c) || busy.has(c) || !tool.canTarget(c, g)) continue;
      const dx = c.x - d.x, dz = c.z - d.z, dist = dx * dx + dz * dz;
      if (dist < bd) { bd = dist; best = c; }
    }
    return best;
  }

  release(d) { if (d.target) this.claimed.delete(d.target); d.target = null; }

  // Pode ficar em (nx, nz)? Nunca perto demais de outro drone nem dentro da célula de outro.
  free(d, nx, nz) {
    const cell = this.cellAt(nx, nz);
    for (const o of this.list) {
      if (o === d) continue;
      const now = Math.hypot(d.x - o.x, d.z - o.z), next = Math.hypot(nx - o.x, nz - o.z);
      if (next < MIN_SEP && next < now) return false;                  // chegando perto demais
      if (cell && cell === o.cell && (cell !== d.cell || next < now)) return false;   // célula do outro
    }
    return true;
  }

  // Anda um passo rumo a (gx, gz). Se o caminho reto está bloqueado por outro drone, olha para os lados.
  // Devolve { moved, straight }.
  moveToward(d, gx, gz, speed, dt) {
    const dx = gx - d.x, dz = gz - d.z, dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return { moved: false, straight: true };
    const step = Math.min(dist, speed * dt), ux = dx / dist, uz = dz / dist;
    for (const a of ANGLES) {
      const ang = a * d.side, c = Math.cos(ang), s = Math.sin(ang);
      const vx = ux * c - uz * s, vz = ux * s + uz * c;
      const nx = d.x + vx * step, nz = d.z + vz * step;
      if (!this.free(d, nx, nz)) continue;
      d.x = nx; d.z = nz; d.cell = this.cellAt(nx, nz);
      d.tx = vx; d.tz = vz;
      return { moved: true, straight: a === 0 };
    }
    return { moved: false, straight: false };
  }

  // Sem serviço (ou desligado): vai para a área de espera.
  park(d, speed, dt) {
    const s = this.slot(d);
    if (Math.hypot(s.x - d.x, s.z - d.z) <= ARRIVE) return;
    d.moving = this.moveToward(d, s.x, s.z, speed, dt).moved;
  }

  // Simulação (só durante o dia, no tempo do jogo).
  update(dt) {
    const g = this.game;
    this.sfxCd = Math.max(0, this.sfxCd - dt);
    for (const d of this.list) {
      const tool = TOOLS[d.id], st = g.S.drones[d.id];
      const speed = BASE_FLY_SPEED * (BASE_STATS.drones[d.id].cooldown / st.cooldown);   // upgrades de velocidade também aceleram o voo
      d.moving = false;
      if (d.open) continue;                                                           // painel aberto: o drone espera
      if (!d.active) { this.release(d); this.park(d, speed, dt); continue; }          // desligado: fica na área de espera
      if (d.target && !tool.canTarget(d.target, g)) { this.release(d); d.cd = 0; }   // alguém já resolveu essa célula
      if (d.cd > 0) { d.cd -= dt; continue; }
      d.scan -= dt;
      if (!d.target && d.scan <= 0) {                                                 // procura serviço (também a caminho da espera)
        d.scan = 0.25;
        const t = this.pick(d);
        if (t) { d.target = t; this.claimed.add(t); d.idleT = 0; d.blocked = 0; d.side = Math.random() < 0.5 ? 1 : -1; }
      }
      if (!d.target) {
        d.idleT += dt;
        if (d.idleT >= IDLE_WAIT) this.park(d, speed, dt);                           // 3 s sem serviço: sai do arado
        continue;
      }
      // voa até o alvo, desviando de outros drones
      const t = d.target;
      if (Math.hypot(t.x - d.x, t.z - d.z) > ARRIVE) {
        const r = this.moveToward(d, t.x, t.z, speed, dt);
        d.moving = r.moved;
        const tOcc = this.list.some((o) => o !== d && o.cell === t) && Math.hypot(t.x - d.x, t.z - d.z) < 1.6;
        if (!r.moved || tOcc) d.blocked += dt; else if (r.straight) d.blocked = 0;
        if (d.blocked > WAIT_MAX) { this.release(d); d.blocked = 0; d.cd = 0.1; d.side = -d.side; continue; }   // travado: procura outro
        if (!r.moved || Math.hypot(t.x - d.x, t.z - d.z) > ARRIVE) continue;
      }
      this.work(d, st, tool);
    }
  }

  work(d, st, tool) {
    const g = this.game, c = d.target;
    const targets = g.grid.cellsInCircle(c.x, c.z, st.radius, c.field).filter((o) => tool.canTarget(o, g));
    g.fireValue = 0;
    for (const o of targets) {
      if (d.id === 'plant') g.grid.sow(o, this.cropOf(d));
      else tool.apply(o, g);
    }
    if (c.field === g.activeField && targets.length) {          // efeitos só onde o jogador está olhando
      g.vfx.burst({ x: c.x, z: c.z }, tool.vfx, targets.length, st.radius);
      if (g.fireValue > 0) g.vfx.floatText({ x: c.x, z: c.z }, `+${g.fireValue.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`);
      if (this.sfxCd <= 0) { Sound.play(tool.sfx); this.sfxCd = 0.15; }
    }
    this.release(d);
    d.cd = this.cycleOf(d);
    d.idleT = 0; d.scan = 0;
  }

  /* ------------------------- seleção: mouse sobre o drone ------------------------- */
  canPick() {
    const g = this.game;
    return g.state === 'DAY' && !g.paused && g.ending <= 0 && !g.radial.isOpen && !window.K101?.blocked;
  }

  // Drone cuja área de clique está sob o ponto (px, py) da tela, o mais próximo da câmera.
  hitTest(px, py) {
    if (!this.list.length) return null;
    ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, this.game.scene.camera);
    let best = null, bd = Infinity;
    for (const d of this.list) {
      const h = ray.intersectObject(d.hit, false)[0];
      if (h && h.distance < bd) { bd = h.distance; best = d; }
    }
    return best;
  }

  // Todo quadro, ANTES do Cursor: quem está sob o mouse (sem botão apertado, para não atrapalhar o uso da ferramenta).
  updateHover() {
    const inp = this.game.input;
    this.hover = this.canPick() && inp.type === 'mouse' && inp.inside && !inp.holding ? this.hitTest(inp.pos.x, inp.pos.y) : null;
  }

  // Clique/toque no campo. Devolve true se pegou um drone (aí a ferramenta NÃO dispara).
  pointerDown(px, py) {
    if (!this.canPick()) return false;
    const d = this.hitTest(px, py);
    const was = d?.open;
    for (const o of this.list) o.open = false;           // só um painel aberto por vez; clicar fora fecha
    if (!d) return false;
    d.open = !was;
    this.panelKey = '';
    Sound.play('click');
    return true;
  }

  /* ------------------------------ painel do drone ------------------------------ */
  seedImg(id) {
    const wrap = el('span', 'db-seed');
    const img = document.createElement('img'); img.alt = ''; img.draggable = false;
    const glyph = el('span', 'db-glyph', CROPS[id].name.charAt(0)); glyph.hidden = true;
    img.onerror = () => { img.hidden = true; glyph.hidden = false; };
    img.src = `assets/icons/crops/${id}.webp`;
    wrap.append(img, glyph);
    return wrap;
  }

  buildPanel(d) {
    const g = this.game, p = this.panel;
    p.textContent = '';
    const body = el('div', 'dp-body');                      // conteúdo à esquerda; o botão redondo fica sempre à direita
    p.setAttribute('aria-label', DRONE_INFO[d.id].name);
    body.append(el('b', 'dp-title', DRONE_INFO[d.id].name));
    body.append(el('span', 'dp-status', !d.active ? 'Em espera' : d.target ? 'Trabalhando' : 'Sem serviço'));

    body.append(el('span', 'dp-label', 'Trabalhar em'));
    if (g.fields.length > 1) {
      const row = el('div', 'dp-row');
      const opts = [{ key: '', name: 'Todos' }, ...g.fields.map((f) => ({ key: f.key, name: f.dir === null ? 'Principal' : f.name }))];
      for (const o of opts) {
        const b = el('button', 'dp-opt dp-pill', o.name);
        b.type = 'button'; b.dataset.act = 'field'; b.dataset.value = o.key;
        b.classList.toggle('sel', (o.key || null) === d.field);
        row.appendChild(b);
      }
      body.append(row);
    } else {
      body.append(el('span', 'dp-hint', 'Libere um arado na árvore de habilidades para escolher o campo.'));
    }

    if (d.id === 'plant') {
      body.append(el('span', 'dp-label', 'Semente'));
      const row = el('div', 'dp-row');
      for (const id of g.S.unlockedCrops) {
        const b = el('button', 'dp-opt dp-seedbtn');
        b.type = 'button'; b.dataset.act = 'crop'; b.dataset.crop = id; b.title = CROPS[id].name;
        b.setAttribute('aria-label', `Plantar ${CROPS[id].name}`);
        b.classList.toggle('sel', d.crop === id);
        b.appendChild(this.seedImg(id));
        row.appendChild(b);
      }
      const auto = el('button', 'dp-opt dp-pill', 'Auto');
      auto.type = 'button'; auto.dataset.act = 'crop'; auto.dataset.crop = ''; auto.title = 'Planta o mesmo que você';
      auto.classList.toggle('sel', !d.crop);
      row.appendChild(auto);
      body.append(row);
    }

    const go = el('button', d.active ? 'dp-play stop' : 'dp-play');
    go.type = 'button'; go.dataset.act = 'play';
    go.title = go.ariaLabel = d.active ? 'Parar o drone' : 'Iniciar o drone';
    go.setAttribute('aria-label', go.title);
    p.append(body, go);
  }

  onPanelClick(e) {
    const b = e.target.closest('button[data-act]');
    const d = this.list.find((o) => o.open);
    if (!b || !d) return;
    if (b.dataset.act === 'play') {                               // liga/desliga o trabalho do drone
      d.active = !d.active;
      this.release(d);
      d.idleT = 0; d.scan = 0; d.cd = 0;
      d.open = false;
    } else if (b.dataset.act === 'field') {
      d.field = b.dataset.value || null;
      const f = this.fieldOf(d);
      if (d.target && f && d.target.field !== f.id) this.release(d);   // já está indo para outro campo: escolhe de novo
    } else {
      d.crop = b.dataset.crop || null;
    }
    this.cfg.set(d.key, { field: d.field, crop: d.crop });         // campo e semente ficam de um dia para o outro
    this.panelKey = '';                                            // o painel segue aberto até o ▶ / ■
    Sound.play('click');
  }

  syncPanel(live) {
    const g = this.game, p = this.panel, d = this.list.find((o) => o.open);
    if (!d || !live) { if (d) d.open = false; p.hidden = true; return; }
    this.v.set(d.x, d.y + 0.4, d.z);
    const s = g.scene.worldToScreen(this.v);
    if (s.x < 0 || s.x > innerWidth || s.y < 0 || s.y > innerHeight) { d.open = false; p.hidden = true; return; }
    const key = `${d.key}|${d.field}|${d.crop}|${d.active}|${!!d.target}|${g.fields.map((f) => f.key).join()}|${g.S.unlockedCrops.join()}`;
    if (key !== this.panelKey || p.hidden) { this.panelKey = key; this.buildPanel(d); p.hidden = false; }
    const w = p.offsetWidth, h = p.offsetHeight;
    const x = Math.min(innerWidth - w / 2 - 8, Math.max(w / 2 + 8, s.x));
    const y = Math.max(h + this.game.scene.insetTop + 8, s.y);        // fica acima do drone, sem passar por baixo do HUD
    p.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  place(d) {
    d.mesh.position.set(d.x, d.y, d.z);
  }

  // Visual (todo quadro): flutuar, inclinar na direção do voo, girar as hélices e o contorno de seleção.
  render(dt) {
    this.clock += dt;
    for (const d of this.list) {
      const bob = Math.sin(this.clock * 3 + d.phase) * 0.06;
      d.y = FLY_HEIGHT + bob;
      const moving = d.moving;
      d.tilt += ((moving ? 0.28 : 0) - d.tilt) * Math.min(1, dt * 8);
      d.mesh.position.set(d.x, d.y, d.z);
      d.mesh.rotation.x = (d.tz ?? 0) * d.tilt;
      d.mesh.rotation.z = -(d.tx ?? 0) * d.tilt;
      for (const r of d.rotors) r.rotation.y += ROTOR_SPIN * dt;
      const on = d === this.hover || d.open;
      if (on !== d.outlined) { d.outlined = on; for (const o of d.outlines) o.visible = on; }
    }
    // Painel só durante o dia, sem pausa (ele também some quando a tela muda).
    const g = this.game, live = g.state === 'DAY' && !g.paused;
    if (this.layer) this.layer.hidden = !live;
    this.syncPanel(live);
  }
}