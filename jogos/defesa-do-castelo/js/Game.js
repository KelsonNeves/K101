/* ==========================================================================
   Game.js — compositor da aplicação.
   "Como tudo isso é conectado?"
   Cria os módulos, liga uns aos outros, mantém o estado geral e executa o loop.
   As regras ficam em Systems / Map; a visualização em Scene; a tela em UI.
   ========================================================================== */
import { GAME_CONFIG, ENEMIES, TOWERS, MAPS, AUDIO } from "./Data.js";
import { GameScene } from "./Scene.js";
import { GameMap } from "./Map.js";
import { Tower, Castle, EntityStore } from "./Entities.js";
import {
  EconomySystem, EnemySystem, TowerSystem, CombatSystem, WaveSystem, AnimationSystem
} from "./Systems.js";
import { VfxSystem } from "./Vfx.js";
import { Haptics } from "./Haptics.js";
import { Sound } from "./Audio.js";
import { SoundDirector } from "./Sfx.js";
import { InputManager } from "./Input.js";
import { UIManager } from "./UI.js";

const STATES = ["LOADING", "MENU", "PREPARING", "PLAYING", "PAUSED", "GAME_OVER"];
const RECORD_KEY = "defesa-do-castelo:recorde";   // melhor tempo de sobrevivência (segundos), guardado no navegador

const loadRecord = () => {
  try { return Math.max(0, Number(localStorage.getItem(RECORD_KEY)) || 0); } catch { return 0; }
};
const saveRecord = (seconds) => {
  try { localStorage.setItem(RECORD_KEY, String(seconds)); } catch { /* sem armazenamento: o recorde vale só nesta sessão */ }
};
const PICK_RADIUS = 26;         // px: tolerância ao clicar no corpo de uma estrutura
const TOUCH_DRAG_OFFSET = 56;   // px: o modelo aparece acima do dedo para não ficar escondido

export class Game {
  constructor() {
    this.state = "LOADING";
    this.stateBeforePause = "PREPARING";
    this.timeScale = 1;
    this.selectedTower = null;
    this.selectedStructure = null;   // construção com o menu de contexto aberto
    this.ghostCell = null;
    this.dragging = false;
    this.undoStack = [];             // últimas construções colocadas (só valem enquanto estão em obra)
    this.lastTime = 0;
    this.elapsed = 0;                // segundos sobrevividos nesta partida (tempo de jogo, já com a velocidade)
    this.record = loadRecord();      // melhor tempo já alcançado

    const canvas = document.getElementById("game-canvas");
    this.scene = new GameScene({ canvas, modelsBase: GAME_CONFIG.paths.models, modelScale: GAME_CONFIG.modelScale });

    this.ui = new UIManager({
      onPlay: () => this.newGame(),
      onRestart: () => this.restart(),
      onSelectTower: (id) => this.selectTower(id),
      onPause: () => (this.state === "PAUSED" ? this.resume() : this.pause()),
      onResume: () => this.resume(),
      onFinish: () => this.finishRun(),
      onToggleSpeed: () => { this.timeScale = this.timeScale === 1 ? 2 : this.timeScale === 2 ? 3 : 1; },
      onContextAction: (id) => this.handleContextAction(id),
      onUndo: () => this.undoBuild(),
      onDragStart: (id) => this.beginDrag(id),
      onDragMove: (x, y, over) => this.dragMove(x, y, over),
      onDragEnd: (x, y, cancel) => this.dragEnd(x, y, cancel)
    });

    this.input = new InputManager(canvas, () => this.scene.camera, {
      onHover: (pt) => this.handleHover(pt),
      onSelect: (pt, type, x, y) => this.handleSelect(pt, type, x, y),
      onPan: (dx, dy) => this.scene.panCamera(dx, dy),
      onZoom: (f) => this.scene.zoomCamera(f),
      onDoubleTap: (pt) => this.scene.toggleZoom(pt),
      onCancel: () => this.selectTower(null),
      onKey: (code) => this.handleKey(code)
    });

    Sound.setLocator((x, y, z, alcance) => {
      const p = this.input.worldToScreen(x, y, z);
      if (!p) return null;
      const foco = AUDIO.foco;
      const zoom = this.scene.cameraManager.zoomLevel;
      const nx = (p.x - window.innerWidth / 2) / (window.innerWidth / 2);
      const ny = (p.y - window.innerHeight / 2) / (window.innerHeight / 2);
      const out = Math.max(Math.abs(nx), Math.abs(ny));
      const fora = foco.foraPerto + (foco.foraLonge - foco.foraPerto) * zoom;
      const tela = out <= 1 ? 1 - foco.queda * out : Math.max(0, (1 - foco.queda) - (out - 1) * fora);
      const longe = 1 - zoom * (1 - (alcance ?? foco.alcancePadrao));
      return { gain: tela * longe, pan: Math.max(-0.7, Math.min(0.7, nx * 0.7)) };
    });
  }

  /* --------------------------- plataforma K101 --------------------------- */
  installPlatform() {
    const on = (name, fn) => window.addEventListener(`k101:${name}`, fn);
    this.muteSources = new Set();
    const mute = (src, active) => {
      active ? this.muteSources.add(src) : this.muteSources.delete(src);
      Sound.setExternalMute(this.muteSources.size > 0);
    };
    on("ad:start", () => { this.pause(); mute("ad", true); });       // anúncio: pausa e silencia tudo
    on("ad:end", () => mute("ad", false));                           // continua pausado até o jogador voltar
    on("exit:open", () => { this.pause(); mute("exit", true); });    // popup "Deseja sair?": pausa e silencia
    on("exit:cancel", () => mute("exit", false));                    // continua pausado até o jogador retomar
  }

  /* ------------------------------ ciclo ------------------------------ */
  async start() {
    this.installPlatform();
    this.setState("LOADING");
    this.ui.showLoading(0);

    // Verifica a exibição do anúncio de entrada (1ª vez e a cada 3 aberturas)
    window.K101?.ads?.checkEntryAd?.();

    await this.scene.preload(this.collectModels(), (p) => this.ui.showLoading(p * 0.9));
    await Sound.load((p) => this.ui.showLoading(0.9 + p * 0.1));
    this.ui.setTowers(Object.values(TOWERS), GAME_CONFIG.paths.icons);
    this.ui.setBuildIcon(GAME_CONFIG.paths.buildIcon ? GAME_CONFIG.paths.icons + GAME_CONFIG.paths.buildIcon : null);
    this.buildWorld();
    this.setState("MENU");
    this.ui.setRecord(this.record);
    this.ui.showMenu();
    Sound.playMusic("menu");
    requestAnimationFrame((t) => this.frame(t));
  }

  collectModels() {
    const list = [];
    Object.values(ENEMIES).forEach((d) => list.push({ category: "enemies", model: d.model }));
    Object.values(TOWERS).forEach((d) => {
      list.push({ category: "structures", model: d.model });
      if (d.wall?.link?.model) list.push({ category: "structures", model: d.wall.link.model });
      d.upgrades?.forEach((u) => u.link?.model && list.push({ category: "structures", model: u.link.model }));
      d.upgrades?.forEach((u) => u.model && list.push({ category: "structures", model: u.model }));
    });
    list.push({ category: "structures", model: GAME_CONFIG.castle.model });
    Object.values(GAME_CONFIG.environment).forEach((d) => list.push({ category: "environment", model: d.model }));
    Object.values(GAME_CONFIG.effects).forEach((d) => list.push({ category: "effects", model: d.model }));
    return list;
  }

  frame(now) {
    const delta = Math.min((now - (this.lastTime || now)) / 1000, 0.05);
    this.lastTime = now;
    try { this.update(delta); this.render(); } catch (err) { console.error(err); }
    requestAnimationFrame((t) => this.frame(t));
  }

  update(delta) {
    this.input.update(delta);
    if (!this.world) return;

    if (this.state === "PREPARING" || this.state === "PLAYING") {
      const speed = this.state === "PREPARING" ? 1 : this.timeScale;
      const dt = delta * speed;
      this.elapsed += dt;
      const s = this.systems;
      s.wave.update(dt);
      s.enemy.update(dt);
      s.tower.update(dt);
      this.director.update(dt);
      s.combat.update(dt);
      s.animation.update(dt);
      s.vfx.update(dt);
      this.scene.update(dt);
    } else if (this.state !== "PAUSED") {
      this.systems.animation.update(delta);
      this.systems.vfx.update(delta);
      this.scene.update(delta);
    }
    this.updateStructureMenu();
    this.syncBuildGrid();
    this.updateGhostPrice();
    this.ui.update(this.snapshot());
  }

  syncBuildGrid() {
    if (!this.selectedTower || !this.map || this.gridVersion === this.map.zoneVersion) return;
    this.gridVersion = this.map.zoneVersion;
    this.scene.setBuildGrid(this.map.buildSpots(), this.map.cellSize);
  }

  render() { this.scene.render(); }

  setState(state) {
    if (!STATES.includes(state)) throw new Error(`Estado inválido: ${state}`);
    this.state = state;
  }

  pause() {
    if (this.state !== "PREPARING" && this.state !== "PLAYING") return;
    this.stateBeforePause = this.state;
    this.closeStructureMenu();
    this.setState("PAUSED");
    this.ui.showPause(true, { record: this.record, time: Math.floor(this.elapsed) });
    Sound.setWorldPaused(true);
    Sound.play("ui_pausar");
  }

  finishRun() {
    if (this.state !== "PAUSED") return;
    this.ui.showPause(false);
    Sound.setWorldPaused(false);
    this.setState("GAME_OVER");
    this.selectTower(null);
    this.director.dispose();
    Sound.playMusic(null);
    Sound.play("fim_de_jogo");
    this.endRun("Partida finalizada");
  }

  resume() {
    if (this.state !== "PAUSED") return;
    this.setState(this.stateBeforePause);
    this.ui.showPause(false);
    Sound.setWorldPaused(false);
    Sound.play("ui_continuar");
  }

  newGame() {
    this.buildWorld();
    this.elapsed = 0;
    this.ui.hideOverlays();
    this.ui.showHud(true);
    this.setState("PREPARING");
    Sound.setWorldPaused(false);
    Sound.playMusic("preparo");
    this.ui.message("Construa suas torres! A primeira onda vem aí", false);
  }

  async restart() {
    if (this.restarting) return;
    this.restarting = true;
    try {
      if (this.state === "GAME_OVER") await window.K101?.ads?.request?.("interstitial", { reason: "restart" });
    } catch { /* sem anúncio, segue o jogo */ }
    this.restarting = false;
    this.newGame();
  }

  /* ------------------------------ mundo ------------------------------ */
  buildWorld() {
    this.dragging = false;
    this.selectTower(null);
    this.scene.reset();
    this.wallLinks = new Map();
    this.undoStack = [];

    const map = new GameMap(MAPS[GAME_CONFIG.defaultMap].layout);
    const entities = new EntityStore();
    const economy = new EconomySystem(GAME_CONFIG.startCoins);
    const emit = (name, payload) => this.handleEvent(name, payload);
    this.director?.dispose();
    this.director = new SoundDirector({ entities });

    this.scene.buildTerrain({ ...map.describe(), environment: GAME_CONFIG.environment, border: GAME_CONFIG.mapBorder });

    const pos = map.getCastlePosition();
    const castle = new Castle({ health: GAME_CONFIG.castleHealth, x: pos.x, z: pos.z, cells: pos.cells });
    castle.object3D = this.scene.createObject("structures", { ...GAME_CONFIG.castle, globalScale: false }).object3D;
    this.scene.setPosition(castle.object3D, pos.x, 0, pos.z);
    this.scene.add(castle.object3D);
    entities.castle = castle;
    this.scene.focusCamera(pos.x, pos.z);

    const animation = new AnimationSystem({ scene: this.scene });
    const combat = new CombatSystem({ scene: this.scene, entities, emit });
    const enemy = new EnemySystem({ map, scene: this.scene, entities, economy, combat, animation, emit });
    combat.setKillHandler((e) => enemy.kill(e));
    const tower = new TowerSystem({ scene: this.scene, entities, combat, economy, emit });
    const wave = new WaveSystem({ entities, enemySystem: enemy, map, economy, emit });
    const vfx = new VfxSystem();

    this.map = map;
    this.entities = entities;
    this.economy = economy;
    this.systems = { animation, combat, enemy, tower, wave, vfx };
    this.world = true;
  }

  /* ----------------------------- eventos ----------------------------- */
  handleEvent(name, payload) {
    switch (name) {
      case "waveStarted":
        this.setState("PLAYING");
        this.ui.announceAttack();
        Sound.play("onda_inicio");
        Sound.playMusic("batalha");
        break;
      case "waveCompleted":
        this.setState("PREPARING");
        this.ui.message(`Onda ${payload.number} vencida! +${payload.bonus} moedas`);
        Sound.play("onda_vencida");
        Sound.playMusic("preparo");
        break;
      case "structureDestroyed":
        this.destroyStructure(payload.tower);
        break;
      case "trapTriggered":
        this.consumeTrap(payload.tower);
        break;
      case "mineProduced": {
        const t = payload.tower;
        const p = this.input.worldToScreen(t.position.x, t.muzzleHeight + 0.4, t.position.z);
        if (p) this.ui.floatCoins(p.x, p.y, payload.amount);
        this.director.mineProduced(t);
        break;
      }
      case "castleIncome": {
        const c = payload.castle;
        const p = this.input.worldToScreen(c.position.x, 3, c.position.z);
        if (p) this.ui.floatCoins(p.x, p.y, payload.amount);
        Sound.play("moeda_castelo", { x: c.position.x, y: 3, z: c.position.z });
        break;
      }
      case "healBeam":
        this.systems.vfx.setHealBeam(payload.tower, payload.target);
        break;
      case "structureBuilt":
        this.systems.vfx.buildComplete(payload.tower);
        this.director.structureBuilt(payload.tower);
        this.syncWallLinks();
        break;
      case "castleDamaged":
        this.ui.flashDamage();
        Haptics.play("castleHit");
        this.director.castleHit(payload.enemy, this.entities.castle);
        break;
      case "castleDestroyed":
        Haptics.play("castleDestroyed");
        this.setState("GAME_OVER");
        this.selectTower(null);
        this.director.dispose();
        Sound.playMusic(null);
        Sound.play("castelo_destruido");
        Sound.play("fim_de_jogo", { delay: 1.6 });
        this.endRun();
        break;
      case "towerFired":
        this.director.towerFired(payload.tower);
        break;
      case "projectileImpact":
        this.director.projectileImpact(payload);
        break;
      case "enemyHitStructure":
        this.director.enemyHitStructure(payload.enemy, payload.tower);
        break;
      case "enemySpawned":
        this.director.enemySpawned(payload.enemy);
        break;
      case "enemyDied":
        this.director.enemyDied(payload.enemy);
        break;
    }
  }

  endRun(title = "O castelo caiu") {
    const time = Math.floor(this.elapsed);
    const isRecord = time > this.record;
    if (isRecord) { this.record = time; saveRecord(time); Sound.play("recorde", { delay: 3.4 }); }
    this.ui.setRecord(this.record);
    this.ui.showEnd({ title, time, wave: this.systems.wave.started, record: this.record, isRecord });
  }

  /* ----------------------------- construção ---------------------------- */
  selectTower(id) {
    this.closeStructureMenu();
    if (!id || id === this.selectedTower) {
      this.selectedTower = null;
      this.ghostCell = null;
      this.scene.clearGhost();
      this.ui.hideGhostPrice();
      this.scene.setGridVisible(false);
      this.ui.setSelected(null);
      return;
    }
    const data = TOWERS[id];
    this.selectedTower = id;
    this.ghostCell = null;
    Sound.play("ui_selecionar");
    this.scene.createGhost("structures", data, data.combat?.range ?? data.heal?.range ?? 0);
    this.gridVersion = -1;
    this.scene.setGridVisible(true);
    this.ui.setSelected(id);
  }

  placementState(cell) {
    const data = TOWERS[this.selectedTower];
    const check = this.map.canBuild(data.id, cell.row, cell.col);
    const plan = this.placementPlan(data, cell.row, cell.col);
    const affordable = this.economy.canAfford(plan.cost);
    return { check, affordable, plan, ok: check.ok && affordable };
  }

  handleHover(point) {
    if (!this.selectedTower || !this.map) return;
    const cell = this.map.worldToGrid(point);
    if (!this.map.getCell(cell.row, cell.col)) { this.scene.hideGhost(); this.ui.hideGhostPrice(); this.ghostCell = null; return; }

    const data = TOWERS[this.selectedTower];
    const w = this.map.gridToWorld(cell.row, cell.col, data.footprint);
    const prev = this.ghostCell;
    this.ghostCell = cell;
    if (this.dragging && (!prev || prev.row !== cell.row || prev.col !== cell.col)) { Haptics.play("cell"); Sound.play("ui_tique"); }
    const state = this.placementState(cell);
    this.scene.setGhost(w.x, w.z, state.ok);
    this.updateGhostLinks(cell, state.ok);
    this.ghostPrice = { x: w.x, z: w.z, cost: state.plan.cost, ok: state.ok, height: (data.muzzleHeight ?? 2) * (GAME_CONFIG.modelScale?.structures ?? 1) };
    this.updateGhostPrice();
  }

  updateGhostPrice() {
    const g = this.ghostPrice;
    if (!g || !this.selectedTower || !this.ghostCell) return this.ui.hideGhostPrice();
    const p = this.input.worldToScreen(g.x, g.height + 0.6, g.z);
    if (!p) return this.ui.hideGhostPrice();
    this.ui.showGhostPrice(p.x, p.y, g.cost, g.ok);
  }

  handleSelect(point, pointerType, sx, sy) {
    const active = this.state === "PREPARING" || this.state === "PLAYING";
    if (!active) return;

    if (this.selectedTower) {
      if (pointerType !== "mouse") return;
      const cell = this.map.worldToGrid(point);
      if (!this.map.getCell(cell.row, cell.col)) return;
      this.handleBuildRequest(cell);
      return;
    }

    const tower = this.pickStructure(point, sx, sy);
    if (!tower || tower === this.selectedStructure) this.closeStructureMenu();
    else this.openStructureMenu(tower, sx != null ? { x: sx, y: sy - 36 } : null);
  }

  /* ------------------ menu de contexto das estruturas ------------------ */
  pickStructure(point, sx, sy) {
    const cell = this.map.worldToGrid(point);
    const occupant = this.map.getCell(cell.row, cell.col)?.occupant;
    if (occupant instanceof Tower) return occupant;
    if (sx == null) return null;

    let best = null, bestDist = PICK_RADIUS;
    for (const t of this.entities.towers) {
      const a = this.input.worldToScreen(t.position.x, 0.2, t.position.z);
      const b = this.input.worldToScreen(t.position.x, t.muzzleHeight, t.position.z);
      if (!a || !b) continue;
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy || 1;
      const k = Math.min(1, Math.max(0, ((sx - a.x) * vx + (sy - a.y) * vy) / len2));
      const d = Math.hypot(sx - (a.x + vx * k), sy - (a.y + vy * k));
      if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
  }

  refundFor(tower) { return Math.floor(tower.invested * GAME_CONFIG.refundRate); }

  structureActions(tower) {
    const next = tower.nextUpgrade();
    const group = this.upgradeGroup(tower);
    const groupCost = this.groupUpgradeCost(group);
    const refund = this.refundFor(tower);
    const demolish = { id: "demolish", icon: "demolish", kind: "danger", label: `Demolir (+${refund} moedas)`, badge: `+${refund}` };
    if (!tower.built) {
      const pct = Math.floor(tower.buildProgress * 100);
      return [{ id: "building", static: true, caption: "Obra", text: `${pct}%`, label: `${tower.name} — em construção (${pct}%)` }, demolish];
    }
    const damaged = this.linkedGroup(tower).filter((t) => t.repairCost() > 0);
    const fix = damaged.reduce((n, t) => n + t.repairCost(), 0);
    const repair = fix > 0
      ? {
          id: "repair", icon: "repair", kind: "repair",
          label: damaged.length > 1
            ? `Reparar ${damaged.length} muros ligados (${fix} moedas)`
            : `Reparar (${fix} moedas)\nVida ${Math.ceil(tower.health)}/${tower.maxHealth}`,
          badge: `${fix}`,
          poor: !this.economy.canAfford(fix)
        }
      : { id: "repair", icon: "repair", kind: "repair", label: "Vida cheia", badge: "OK", disabled: true };
    if (tower.trap) return [demolish];
    if (tower.maxLevel === 1) return [repair, demolish];

    const upgrade = next
      ? {
          id: "upgrade", icon: "upgrade", kind: "upgrade",
          label: group.length > 1
            ? `Evoluir ${group.length} muros ligados para o nível ${group.target} (${groupCost} moedas)\n${this.describeUpgrade(tower, next)}`
            : `Evoluir para o nível ${tower.level + 1} (${next.cost} moedas)\n${this.describeUpgrade(tower, next)}`,
          badge: `${groupCost}`,
          poor: !this.economy.canAfford(groupCost)
        }
      : { id: "upgrade", icon: "upgrade", kind: "upgrade", label: "Nível máximo", badge: "MAX", disabled: true };

    return [
      { id: "level", static: true, caption: "Nv", text: `${tower.level}`, label: `${tower.name} — nível ${tower.level} de ${tower.maxLevel} · vida ${Math.ceil(tower.health)}/${tower.maxHealth}${tower.mining ? `\n+${tower.mineAmount} moedas a cada${tower.mineInterval}s` : ""}${tower.healer ? `\nCura ${tower.healAmount} a cada ${tower.healInterval}s · alcance ${tower.healRange}\nEnergia ${Math.round(tower.healEnergy * 100)}\%${tower.healOverheated ? " (superaquecida)" : ""}` : ""}` },
      upgrade,
      repair,
      demolish
    ];
  }

  describeUpgrade(tower, u) {
    const parts = [];
    const add = (name, now, next, unit = "") => { if (next !== undefined && next !== now) parts.push(`${name} ${now}→${next}${unit}`); };
    add("Vida", tower.maxHealth, u.health);
    add("Moedas", tower.mineAmount, u.amount);
    add("Intervalo", tower.mineInterval, u.interval, "s");
    add("Cura", tower.healAmount, u.healAmount);
    add("Pulso", tower.healInterval, u.healInterval, "s");
    add("Alcance de cura", tower.healRange, u.healRange);
    add("Energia", tower.healDuration, u.healDuration, "s");
    add("Recarga", tower.healRecharge, u.healRecharge, "s");
    add("Dano", tower.damage, u.damage);
    add("Alcance", tower.range, u.range);
    add("Recarga", tower.cooldown, u.cooldown, "s");
    add("Área", tower.splash, u.splash);
    add("Máx. por inimigo", tower.maxPerTarget, u.maxPerTarget);
    return parts.join(" · ");
  }

  openStructureMenu(tower, tap = null) {
    this.selectedStructure = tower;
    Sound.play("ui_abrir");
    this.menuFallback = tap;
    this.scene.setOutline(tower.object3D);
    this.ui.showContext(this.structureActions(tower));
    this.updateStructureMenu();
  }

  closeStructureMenu() {
    if (!this.selectedStructure) return;
    this.selectedStructure = null;
    this.scene.setOutline(null);
    this.scene.setSecondaryOutlines([]);
    this.ui.hideContext();
  }

  updateStructureMenu() {
    const t = this.selectedStructure;
    if (!t) return;
    try {
      if (!this.entities.towers.includes(t)) return this.closeStructureMenu();
      this.scene.setOutline(t.object3D);
      this.scene.setSecondaryOutlines(this.linkedGroup(t).filter((o) => o !== t).map((o) => o.object3D));
      let p = this.input.worldToScreen(t.position.x, t.muzzleHeight + 0.8, t.position.z);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) p = this.menuFallback;
      if (p) this.ui.moveContext(p.x, p.y);
      this.ui.refreshContext(this.structureActions(t));
    } catch (err) {
      console.error(err);
      this.closeStructureMenu();
    }
  }

  handleContextAction(id) {
    const t = this.selectedStructure;
    if (!t || (this.state !== "PREPARING" && this.state !== "PLAYING")) return;
    if (id === "demolish") this.demolishStructure(t);
    else if (id === "upgrade") this.upgradeStructure(t);
    else if (id === "repair") this.repairStructure(t);
  }

  applyTowerVisual(tower) {
    const base = TOWERS[tower.type];
    const pick = (o) => Object.fromEntries(
      ["model", "scale", "yOffset", "rotationY", "fallback"].filter((k) => o[k] !== undefined).map((k) => [k, o[k]])
    );

    let visual = pick(base);
    let customModel = false;
    for (let i = 0; i < tower.level - 1; i++) {
      const u = base.upgrades?.[i];
      if (u?.model) {
        customModel = true;
        visual = { fallback: base.fallback, ...pick(u) };
      } else if (u?.fallback) {
        visual = { ...visual, fallback: u.fallback };
      }
    }

    const key = JSON.stringify([visual.model, visual.fallback]);
    if (key !== tower.visualKey) {
      const { scale, yOffset, rotationY, ...rest } = base;
      const old = tower.object3D;
      const obj = this.scene.createObject("structures", { ...rest, ...visual }).object3D;
      this.scene.setPosition(obj, tower.position.x, 0, tower.position.z);
      obj.rotation.copy(old.rotation);
      this.scene.add(obj);
      this.scene.remove(old);
      tower.object3D = obj;
      tower.visualKey = key;
      this.scene.attachHealthBar(obj, tower.muzzleHeight + 0.5);
    }
    return customModel ? 1 : 1 + GAME_CONFIG.upgradeGrowth * (tower.level - 1);
  }

  upgradeStructure(tower) {
    if (!tower.built) return this.ui.message("Aguarde a obra terminar", true);
    if (!tower.nextUpgrade()) return this.ui.message("Esta construção já está no nível máximo", true);

    const group = this.upgradeGroup(tower);
    const cost = this.groupUpgradeCost(group);
    if (!this.economy.canAfford(cost)) return this.ui.message("Moedas insuficientes", true);

    this.economy.spend(cost);
    for (const t of group) {
      while (t.level < group.target && t.applyUpgrade());
      this.map.refreshThreat(t);
    }
    this.systems.enemy.recomputePaths();

    for (const t of group) {
      const scale = this.applyTowerVisual(t);
      this.scene.setHealthBar(t.object3D, t.health / t.maxHealth);
      this.systems.vfx.upgradeGlow(t, scale);
    }
    this.syncWallLinks();
    Sound.play("evoluir", { x: tower.position.x, y: 1, z: tower.position.z, pitch: 1 + 0.05 * (tower.level - 2) });

    this.ui.message(group.length > 1
      ? `${group.length} muros evoluídos para o nível ${group.target}! (-${cost} moedas)`
      : `${tower.name} evoluída para o nível ${tower.level}!`);
    this.updateStructureMenu();
  }

  upgradeGroup(tower) {
    const group = this.linkedGroup(tower);
    const top = Math.max(...group.map((t) => t.level));
    group.target = Math.min(tower.maxLevel, top + 1);
    return group;
  }

  linkedGroup(tower) {
    if (!tower.wall || !tower.built) return [tower];
    const seen = new Set([tower]);
    const queue = [tower];
    while (queue.length) {
      const cur = queue.pop();
      for (const n of this.wallNeighbors(cur.row, cur.col)) {
        if (seen.has(n) || n.type !== tower.type) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    return [...seen];
  }

  groupUpgradeCost(group) {
    let total = 0;
    for (const t of group) {
      for (let lv = t.level; lv < group.target; lv++) total += t.upgrades[lv - 1]?.cost ?? 0;
    }
    return total;
  }

  destroyStructure(tower) {
    const list = this.entities.towers;
    const i = list.indexOf(tower);
    if (i >= 0) list.splice(i, 1);
    tower.alive = false;
    this.map.release(tower.row, tower.col, tower.footprint);
    this.scene.spawnEffect(GAME_CONFIG.effects.explosion, { x: tower.position.x, y: 0.6, z: tower.position.z }, 1.2);
    Sound.play("construcao_destruida", { x: tower.position.x, y: 1, z: tower.position.z });
    this.collapseVisual(tower, true);
    this.systems.enemy.recomputePaths();
    this.syncWallLinks();
    this.ui.message(`${tower.name} destruída!`, true, false);
  }

  consumeTrap(tower) {
    const list = this.entities.towers;
    const i = list.indexOf(tower);
    if (i >= 0) list.splice(i, 1);
    tower.alive = false;
    this.map.release(tower.row, tower.col, tower.footprint);
    this.director.trapExploded(tower);
    this.systems.vfx.collapse(tower, { violent: true, colors: [0x5a3b22, 0x2b2f33, 0x8a6a42], onDone: () => this.scene.remove(tower.object3D) });
    if (this.selectedStructure === tower) this.closeStructureMenu();
    this.ui.message(`${tower.name} explodiu!`);
  }

  collapseVisual(tower, violent) {
    const obj = tower.object3D;
    if (!obj) return;
    this.scene.setHealthBar(obj, 1);
    this.systems.vfx.collapse(tower, {
      violent,
      colors: TOWERS[tower.type]?.debrisColors,
      onDone: () => this.scene.remove(obj)
    });
  }

  repairStructure(tower) {
    const damaged = this.linkedGroup(tower).filter((t) => t.repairCost() > 0);
    const cost = damaged.reduce((n, t) => n + t.repairCost(), 0);
    if (cost <= 0) return this.ui.message("A vida já está cheia", true);
    if (!this.economy.canAfford(cost)) return this.ui.message("Moedas insuficientes", true);

    this.economy.spend(cost);
    for (const t of damaged) {
      t.health = t.maxHealth;
      this.scene.setHealthBar(t.object3D, 1);
      this.systems.vfx.repairPulse(t);
    }
    Sound.play("reparar", { x: tower.position.x, y: 1, z: tower.position.z });
    this.systems.enemy.recomputePaths();
    this.ui.message(damaged.length > 1
      ? `${damaged.length} muros reparados (-${cost} moedas)`
      : `${tower.name} reparada (-${cost} moedas)`);
    this.updateStructureMenu();
  }

  demolishStructure(tower, { undo = false } = {}) {
    const list = this.entities.towers;
    const i = list.indexOf(tower);
    if (i < 0) return;
    const refund = undo ? tower.invested : this.refundFor(tower);

    list.splice(i, 1);
    tower.alive = false;
    this.map.release(tower.row, tower.col, tower.footprint);
    this.collapseVisual(tower, false);
    Sound.play(undo ? "desfazer" : "demolir", { x: tower.position.x, y: 1, z: tower.position.z });
    this.economy.earn(refund);
    this.systems.enemy.recomputePaths();
    this.syncWallLinks();

    if (!undo || this.selectedStructure === tower) this.closeStructureMenu();
    this.ui.message(undo ? `Obra de ${tower.name} desfeita +${refund} moedas` : `${tower.name} demolida +${refund} moedas`);
  }

  /* ------------------------------ desfazer ------------------------------ */
  pruneUndo() {
    this.undoStack = this.undoStack.filter((t) => t.alive && !t.built);
  }

  undoBuild() {
    if (this.state !== "PREPARING" && this.state !== "PLAYING") return;
    this.pruneUndo();
    const tower = this.undoStack.pop();
    if (!tower) return this.ui.message("Nada para desfazer", true);
    this.demolishStructure(tower, { undo: true });
  }

  handleBuildRequest(cell) {
    const { check, affordable } = this.placementState(cell);
    if (!check.ok) return this.ui.message(check.reason, true);
    if (!affordable) return this.ui.message("Moedas insuficientes", true);
    this.confirmBuild(cell);
  }

  confirmBuild(cell) {
    const data = TOWERS[this.selectedTower];
    const plan = this.placementPlan(data, cell.row, cell.col);
    const tower = new Tower(data, cell.row, cell.col, plan.level);

    const p = this.map.gridToWorld(cell.row, cell.col, data.footprint);
    tower.position = { x: p.x, y: 0, z: p.z };
    tower.object3D = this.scene.createObject("structures", data).object3D;
    this.scene.setPosition(tower.object3D, p.x, 0, p.z);
    this.scene.add(tower.object3D);
    Sound.play("construir_posicionar", { x: p.x, y: 0.5, z: p.z });
    this.scene.attachHealthBar(tower.object3D, tower.muzzleHeight + 0.5);
    if (tower.level > 1) this.applyTowerVisual(tower);

    this.map.occupy(cell.row, cell.col, data.footprint, tower);
    this.economy.spend(plan.cost);
    this.entities.towers.push(tower);
    this.systems.enemy.recomputePaths();
    this.syncWallLinks();
    this.systems.vfx.constructionSite(tower);

    if (!tower.built) {
      this.undoStack.push(tower);
      while (this.undoStack.length > (GAME_CONFIG.undoLimit ?? 2)) this.undoStack.shift();
    }

    this.handleHover({ x: p.x, z: p.z });
  }

  /* ------------------------------ muros ------------------------------ */
  placementPlan(data, row, col) {
    let level = 1;
    if (data.wall) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const o = this.map.getCell(row + dr, col + dc)?.occupant;
          if (o instanceof Tower && o.wall && o.type === data.id) level = Math.max(level, o.level);
        }
      }
    }
    level = Math.min(level, 1 + (data.upgrades?.length ?? 0));
    let cost = data.cost;
    for (let i = 0; i < level - 1; i++) cost += data.upgrades[i].cost;
    return { level, cost };
  }

  wallNeighbors(row, col) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const o = this.map.getCell(row + dr, col + dc)?.occupant;
        if (o instanceof Tower && o.wall && o.built) list.push(o);
      }
    }
    return list;
  }

  linkSpecFor(tower) {
    const base = TOWERS[tower.type];
    let spec = base.wall.link;
    for (let i = 0; i < tower.level - 1; i++) {
      const l = base.upgrades?.[i]?.link;
      if (l) spec = { ...spec, ...l, fallback: { ...spec.fallback, ...l.fallback } };
    }
    return spec;
  }

  syncWallLinks() {
    const wanted = new Map();
    for (const a of this.entities.towers) {
      if (!a.wall || !a.built) continue;
      for (const b of this.wallNeighbors(a.row, a.col)) {
        if (b === a || a.uid > b.uid) continue;
        const spec = this.linkSpecFor(a.level <= b.level ? a : b);
        wanted.set(`${a.uid}-${b.uid}`, { a, b, spec, sig: JSON.stringify(spec) });
      }
    }
    for (const [key, entry] of this.wallLinks) {
      if (wanted.get(key)?.sig === entry.sig) continue;
      this.scene.remove(entry.obj);
      this.wallLinks.delete(key);
    }
    for (const [key, { a, b, spec, sig }] of wanted) {
      if (this.wallLinks.has(key)) continue;
      const obj = this.scene.createWallLink(spec, a.position, b.position);
      this.scene.add(obj);
      this.wallLinks.set(key, { obj, sig });
    }
  }

  updateGhostLinks(cell, ok) {
    const data = TOWERS[this.selectedTower];
    if (!data?.wall) return;
    const p = this.map.gridToWorld(cell.row, cell.col, data.footprint);
    const links = this.wallNeighbors(cell.row, cell.col)
      .filter((n) => n.row !== cell.row || n.col !== cell.col)
      .map((n) => ({ a: p, b: n.position }));
    this.scene.setGhostLinks(data.wall.link, links, ok);
  }

  /* ------------------- arrastar e soltar (toque) --------------------- */
  beginDrag(id) {
    if (this.state !== "PREPARING" && this.state !== "PLAYING") return false;
    if (this.selectedTower !== id) this.selectTower(id);
    this.dragging = true;
    return true;
  }

  dragPoint(x, y) { return this.input.groundPoint(x, y - TOUCH_DRAG_OFFSET); }

  dragMove(x, y, overMenu = false) {
    if (!this.dragging) return;
    if (overMenu) { this.scene.hideGhost(); this.ui.hideGhostPrice(); this.ghostCell = null; return; }
    const pt = this.dragPoint(x, y);
    if (pt) this.handleHover(pt);
    else { this.scene.hideGhost(); this.ui.hideGhostPrice(); this.ghostCell = null; }
  }

  dragEnd(x, y, cancel) {
    if (!this.dragging) return;
    this.dragging = false;
    const pt = cancel ? null : this.dragPoint(x, y);
    const cell = pt ? this.map.worldToGrid(pt) : null;
    if (cell && this.map.getCell(cell.row, cell.col) && this.placementState(cell).ok &&
        (this.state === "PREPARING" || this.state === "PLAYING")) {
      this.confirmBuild(cell);
    }
    this.selectTower(null);
  }

  /* ------------------------------ entrada ---------------------------- */
  handleKey(code) {
    const towers = Object.keys(TOWERS);
    if (code.startsWith("Digit")) {
      const id = towers[Number(code.slice(5)) - 1];
      if (id) this.selectTower(id);
    } else if (code === "KeyB") {
      this.ui.toggleTray();
    } else if (code === "KeyM") {
      Sound.toggleMute();
    } else if (code === "KeyZ") {
      this.undoBuild();
    } else if (code === "KeyP") (this.state === "PAUSED" ? this.resume() : this.pause());
    else if (code === "Escape") {
      if (this.selectedTower) this.selectTower(null);
      else (this.state === "PAUSED" ? this.resume() : this.pause());
    }
  }

  /* ------------------------------- UI -------------------------------- */
  snapshot() {
    const w = this.systems.wave;
    const c = this.entities.castle;
    return {
      coins: this.economy.getCoins(),
      castleHealth: c.health,
      castleMax: c.maxHealth,
      wave: w.started,
      time: Math.floor(this.elapsed),
      record: Math.max(this.record, Math.floor(this.elapsed)),
      waveActive: w.active,
      countdown: this.state === "PREPARING" ? w.countdown : null,
      waveTimer: !w.active && w.countdown != null && (this.state === "PREPARING" || this.state === "PAUSED")
        ? { left: w.countdown, total: w.delayFor(w.started) }
        : null,
      countdownFrom: GAME_CONFIG.waveTiming.countdownFrom,
      speed: this.timeScale,
      paused: this.state === "PAUSED",
      undo: (this.pruneUndo(), this.undoStack.length)
    };
  }
}