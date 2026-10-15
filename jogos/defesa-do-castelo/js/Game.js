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

    // Áudio posicional com FOCO (veja AUDIO.foco em Data.js). O volume de um som depende de:
    //   1) onde ele está na tela: queda suave até a borda; fora da tela some (rápido com zoom perto);
    //   2) o zoom: com a câmera longe tudo fica mais baixo, e cada som mantém só a fração `alcance`
    //      do volume (passos somem, explosões continuam audíveis).
    Sound.setLocator((x, y, z, alcance) => {
      const p = this.input.worldToScreen(x, y, z);
      if (!p) return null;
      const foco = AUDIO.foco;
      const zoom = this.scene.cameraManager.zoomLevel;             // 0 = bem perto, 1 = bem longe
      const nx = (p.x - window.innerWidth / 2) / (window.innerWidth / 2);
      const ny = (p.y - window.innerHeight / 2) / (window.innerHeight / 2);
      const out = Math.max(Math.abs(nx), Math.abs(ny));            // 1 = borda da tela
      const fora = foco.foraPerto + (foco.foraLonge - foco.foraPerto) * zoom;
      const tela = out <= 1 ? 1 - foco.queda * out : Math.max(0, (1 - foco.queda) - (out - 1) * fora);
      const longe = 1 - zoom * (1 - (alcance ?? foco.alcancePadrao));
      return { gain: tela * longe, pan: Math.max(-0.7, Math.min(0.7, nx * 0.7)) };
    });
  }

  /* --------------------------- plataforma K101 --------------------------- */
  // O SDK (/shared/k101.js) avisa por eventos do window ("k101:*"), então não importa quem carrega primeiro
  // e o jogo funciona igual se o SDK não existir (rodando fora do site).
  installPlatform() {
    const on = (name, fn) => window.addEventListener(`k101:${name}`, fn);
    // Várias origens podem pedir silêncio ao mesmo tempo (anúncio e popup de saída):
    // o áudio só volta quando nenhuma delas estiver ativa.
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
    await this.scene.preload(this.collectModels(), (p) => this.ui.showLoading(p * 0.9));
    await Sound.load((p) => this.ui.showLoading(0.9 + p * 0.1));   // nunca derruba o jogo se falhar
    this.ui.setTowers(Object.values(TOWERS), GAME_CONFIG.paths.icons);
    this.ui.setBuildIcon(GAME_CONFIG.paths.buildIcon ? GAME_CONFIG.paths.icons + GAME_CONFIG.paths.buildIcon : null);
    this.buildWorld();               // mundo de fundo atrás do menu
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
      if (d.wall?.link?.model) list.push({ category: "structures", model: d.wall.link.model });   // segmento do muro
      d.upgrades?.forEach((u) => u.link?.model && list.push({ category: "structures", model: u.link.model }));   // segmento por nível
      d.upgrades?.forEach((u) => u.model && list.push({ category: "structures", model: u.model }));   // modelos por nível
    });
    list.push({ category: "structures", model: GAME_CONFIG.castle.model });
    Object.values(GAME_CONFIG.environment).forEach((d) => list.push({ category: "environment", model: d.model }));
    Object.values(GAME_CONFIG.effects).forEach((d) => list.push({ category: "effects", model: d.model }));
    return list;
  }

  frame(now) {
    const delta = Math.min((now - (this.lastTime || now)) / 1000, 0.05);
    this.lastTime = now;
    // Um erro num frame não pode derrubar o loop inteiro (o jogo "congelaria").
    try { this.update(delta); this.render(); } catch (err) { console.error(err); }
    requestAnimationFrame((t) => this.frame(t));
  }

  update(delta) {
    this.input.update(delta);
    if (!this.world) return;

    if (this.state === "PREPARING" || this.state === "PLAYING") {
      // Intervalo entre ondas sempre em 1x; na onda, vale a velocidade escolhida pelo jogador.
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

  // Malha de construção: só as células livres dentro da área permitida. Refeita quando a área muda.
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

  // Botão "Finalizar partida" do menu de pausa: encerra a run atual e salva o recorde, se houver.
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

  // "Jogar de novo" na tela de fim de partida é a pausa natural para um anúncio entre partidas.
  // O anúncio é decisão da plataforma (pode não aparecer) e nunca impede de jogar.
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
    this.wallLinks = new Map();      // "uidA-uidB" → segmento de muro 3D
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
    this.scene.focusCamera(pos.x, pos.z);   // a partida começa com o castelo no centro da tela

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
        Sound.play("moeda_castelo", { x: c.position.x, y: 3, z: c.position.z });   // segue a tela, como a mina
        break;
      }
      case "healBeam":
        this.systems.vfx.setHealBeam(payload.tower, payload.target);   // laser contínuo da torre de restauração
        break;
      case "structureBuilt":
        this.systems.vfx.buildComplete(payload.tower);   // andaime se desmonta + onda de choque
        this.director.structureBuilt(payload.tower);
        this.syncWallLinks();                            // muro pronto: agora liga aos vizinhos
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

  // Fim da partida: compara o tempo sobrevivido com o recorde e mostra o resultado.
  endRun(title = "O castelo caiu") {
    const time = Math.floor(this.elapsed);
    const isRecord = time > this.record;
    if (isRecord) { this.record = time; saveRecord(time); Sound.play("recorde", { delay: 3.4 }); }
    this.ui.setRecord(this.record);
    this.ui.showEnd({ title, time, wave: this.systems.wave.started, record: this.record, isRecord });
  }

  /* ----------------------------- construção ---------------------------- */
  selectTower(id) {
    this.closeStructureMenu();      // escolher/cancelar uma construção fecha o menu de contexto
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
    this.gridVersion = -1;           // força desenhar a malha na próxima atualização
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
    // Arrastando uma construção: uma vibraçãozinha a cada célula nova (várias seguidas se passar rápido).
    if (this.dragging && (!prev || prev.row !== cell.row || prev.col !== cell.col)) { Haptics.play("cell"); Sound.play("ui_tique"); }
    const state = this.placementState(cell);
    this.scene.setGhost(w.x, w.z, state.ok);
    this.updateGhostLinks(cell, state.ok);
    this.ghostPrice = { x: w.x, z: w.z, cost: state.plan.cost, ok: state.ok, height: (data.muzzleHeight ?? 2) * (GAME_CONFIG.modelScale?.structures ?? 1) };
    this.updateGhostPrice();
  }

  // Etiqueta com o preço total (base + evoluções do grupo de muros) logo acima do fantasma.
  updateGhostPrice() {
    const g = this.ghostPrice;
    if (!g || !this.selectedTower || !this.ghostCell) return this.ui.hideGhostPrice();
    const p = this.input.worldToScreen(g.x, g.height + 0.6, g.z);
    if (!p) return this.ui.hideGhostPrice();
    this.ui.showGhostPrice(p.x, p.y, g.cost, g.ok);
  }

  // Mouse: o modelo segue o cursor e o clique constrói.
  // Toque: a construção é feita arrastando o card (veja beginDrag/dragMove/dragEnd).
  handleSelect(point, pointerType, sx, sy) {
    const active = this.state === "PREPARING" || this.state === "PLAYING";
    if (!active) return;

    // Com uma torre escolhida no menu, o clique do mouse constrói.
    if (this.selectedTower) {
      if (pointerType !== "mouse") return;
      const cell = this.map.worldToGrid(point);
      if (!this.map.getCell(cell.row, cell.col)) return;
      this.handleBuildRequest(cell);
      return;
    }

    // Sem construção em andamento: clicar numa estrutura abre o menu de contexto dela.
    const tower = this.pickStructure(point, sx, sy);
    if (!tower || tower === this.selectedStructure) this.closeStructureMenu();
    else this.openStructureMenu(tower, sx != null ? { x: sx, y: sy - 36 } : null);
  }

  /* ------------------ menu de contexto das estruturas ------------------ */
  // Acha a torre clicada: primeiro pela célula do chão; senão pelo corpo (da base ao topo) na tela.
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

  // Devolve parte de TUDO que foi investido na torre (compra + evoluções).
  refundFor(tower) { return Math.floor(tower.invested * GAME_CONFIG.refundRate); }

  // Opções do menu. Para novas opções (evoluir etc.), basta acrescentar itens aqui
  // e tratar o `id` em handleContextAction. `icon` é uma chave de ICONS em UI.js.
  structureActions(tower) {
    const next = tower.nextUpgrade();
    const group = this.upgradeGroup(tower);
    const groupCost = this.groupUpgradeCost(group);
    const refund = this.refundFor(tower);
    const demolish = { id: "demolish", icon: "demolish", kind: "danger", label: `Demolir (+${refund} moedas)`, badge: `+${refund}` };
    if (!tower.built) {                                       // em obra: só dá para cancelar (demolir)
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
    if (tower.trap) return [demolish];                        // armadilha: só dá para demolir (vida nunca é danificada)
    if (tower.maxLevel === 1) return [repair, demolish];     // sem evolução: reparar e demolir

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
      { id: "level", static: true, caption: "Nv", text: `${tower.level}`, label: `${tower.name} — nível ${tower.level} de ${tower.maxLevel} · vida ${Math.ceil(tower.health)}/${tower.maxHealth}${tower.mining ? `\n+${tower.mineAmount} moedas a cada ${tower.mineInterval}s` : ""}${tower.healer ? `\nCura ${tower.healAmount} a cada ${tower.healInterval}s · alcance ${tower.healRange}\nEnergia ${Math.round(tower.healEnergy * 100)}%${tower.healOverheated ? " (superaquecida)" : ""}` : ""}` },
      upgrade,
      repair,
      demolish
    ];
  }

  // "Dano 10→14 · Alcance 7.5→8 · Recarga 0.7→0.65s" (só o que muda)
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

  // `tap` = ponto tocado (px): posição de reserva caso a projeção 3D → tela falhe.
  openStructureMenu(tower, tap = null) {
    this.selectedStructure = tower;
    Sound.play("ui_abrir");
    this.menuFallback = tap;
    this.scene.setOutline(tower.object3D);    // contorno branco enquanto o menu está aberto
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

  // Todo frame: o menu acompanha a estrutura quando a câmera se move.
  updateStructureMenu() {
    const t = this.selectedStructure;
    if (!t) return;
    try {
      if (!this.entities.towers.includes(t)) return this.closeStructureMenu();
      this.scene.setOutline(t.object3D);      // a evolução pode trocar o objeto 3D: o contorno acompanha
      this.scene.setSecondaryOutlines(this.linkedGroup(t).filter((o) => o !== t).map((o) => o.object3D));
      let p = this.input.worldToScreen(t.position.x, t.muzzleHeight + 0.8, t.position.z);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) p = this.menuFallback;
      if (p) this.ui.moveContext(p.x, p.y);
      this.ui.refreshContext(this.structureActions(t));   // moedas/nível mudaram? atualiza os botões
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

  // Resolve o visual do nível atual da torre e troca o objeto 3D se o .glb mudou.
  // Retorna a escala final: 1 se o nível tem modelo próprio, senão cresce GAME_CONFIG.upgradeGrowth por nível.
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
        visual = { fallback: base.fallback, ...pick(u) };   // modelo próprio: scale/yOffset/rotationY são dele
      } else if (u?.fallback) {
        visual = { ...visual, fallback: u.fallback };       // só muda o graybox (cor/forma); o .glb, se houver, continua
      }
    }

    const key = JSON.stringify([visual.model, visual.fallback]);
    if (key !== tower.visualKey) {
      const { scale, yOffset, rotationY, ...rest } = base;   // não herda o ajuste do modelo anterior
      const old = tower.object3D;
      const obj = this.scene.createObject("structures", { ...rest, ...visual }).object3D;
      this.scene.setPosition(obj, tower.position.x, 0, tower.position.z);
      obj.rotation.copy(old.rotation);                       // mantém a mira
      this.scene.add(obj);
      this.scene.remove(old);
      tower.object3D = obj;
      tower.visualKey = key;
      this.scene.attachHealthBar(obj, tower.muzzleHeight + 0.5);   // a barra de vida pertencia ao objeto antigo
    }
    return customModel ? 1 : 1 + GAME_CONFIG.upgradeGrowth * (tower.level - 1);
  }

  // Muros: evolui todo o grupo ligado de uma vez. Outras construções: só a selecionada.
  upgradeStructure(tower) {
    if (!tower.built) return this.ui.message("Aguarde a obra terminar", true);
    if (!tower.nextUpgrade()) return this.ui.message("Esta construção já está no nível máximo", true);

    const group = this.upgradeGroup(tower);
    const cost = this.groupUpgradeCost(group);
    if (!this.economy.canAfford(cost)) return this.ui.message("Moedas insuficientes", true);

    this.economy.spend(cost);
    for (const t of group) {
      while (t.level < group.target && t.applyUpgrade());
      this.map.refreshThreat(t);               // novo alcance = nova área de perigo para os inimigos
    }
    this.systems.enemy.recomputePaths();

    // Visual do novo nível: troca o .glb (se o nível tiver um) ou só aumenta o tamanho; depois o brilho (Vfx.js).
    for (const t of group) {
      const scale = this.applyTowerVisual(t);
      this.scene.setHealthBar(t.object3D, t.health / t.maxHealth);
      this.systems.vfx.upgradeGlow(t, scale);
    }
    this.syncWallLinks();                      // o visual do segmento depende do nível dos dois muros
    Sound.play("evoluir", { x: tower.position.x, y: 1, z: tower.position.z, pitch: 1 + 0.05 * (tower.level - 2) });

    this.ui.message(group.length > 1
      ? `${group.length} muros evoluídos para o nível ${group.target}! (-${cost} moedas)`
      : `${tower.name} evoluída para o nível ${tower.level}!`);
    this.updateStructureMenu();
  }

  // Quem evolui junto: para muro, todos os muros prontos ligados a ele (direta ou indiretamente);
  // para o resto, só a própria construção. `target` = nível que todos alcançam (o maior do grupo + 1).
  upgradeGroup(tower) {
    const group = this.linkedGroup(tower);
    const top = Math.max(...group.map((t) => t.level));
    group.target = Math.min(tower.maxLevel, top + 1);
    return group;
  }

  // Muro: ele + todos os muros prontos ligados (direta ou indiretamente). Outras construções: só ela.
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

  // Soma das evoluções que cada membro ainda precisa pagar até o nível alvo do grupo.
  groupUpgradeCost(group) {
    let total = 0;
    for (const t of group) {
      for (let lv = t.level; lv < group.target; lv++) total += t.upgrades[lv - 1]?.cost ?? 0;
    }
    return total;
  }

  // Construção destruída por inimigos: igual a demolir, mas sem reembolso e com explosão.
  destroyStructure(tower) {
    const list = this.entities.towers;
    const i = list.indexOf(tower);
    if (i >= 0) list.splice(i, 1);
    tower.alive = false;
    this.map.release(tower.row, tower.col, tower.footprint);
    this.scene.spawnEffect(GAME_CONFIG.effects.explosion, { x: tower.position.x, y: 0.6, z: tower.position.z }, 1.2);
    Sound.play("construcao_destruida", { x: tower.position.x, y: 1, z: tower.position.z });
    this.collapseVisual(tower, true);          // desaba em escombros (Vfx.js) e só então remove o objeto 3D
    this.systems.enemy.recomputePaths();       // com a construção fora, o melhor caminho pode mudar
    this.syncWallLinks();
    this.ui.message(`${tower.name} destruída!`, true, false);   // já tem o som de desabamento
  }

  // Armadilha que já explodiu (TowerSystem/CombatSystem cuidaram do dano e da explosão): some sem
  // reembolso e sem escombros. A explosão já foi desenhada por CombatSystem.detonate.
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

  // Animação de queda (Vfx.js); o objeto 3D só é removido quando o desabamento termina.
  collapseVisual(tower, violent) {
    const obj = tower.object3D;
    if (!obj) return;
    this.scene.setHealthBar(obj, 1);           // esconde a barra de vida
    this.systems.vfx.collapse(tower, {
      violent,
      colors: TOWERS[tower.type]?.debrisColors,
      onDone: () => this.scene.remove(obj)
    });
  }

  // Recupera toda a vida pelo preço de Tower.repairCost(). Em muros, repara todos os danificados do grupo ligado.
  repairStructure(tower) {
    const damaged = this.linkedGroup(tower).filter((t) => t.repairCost() > 0);
    const cost = damaged.reduce((n, t) => n + t.repairCost(), 0);
    if (cost <= 0) return this.ui.message("A vida já está cheia", true);
    if (!this.economy.canAfford(cost)) return this.ui.message("Moedas insuficientes", true);

    this.economy.spend(cost);
    for (const t of damaged) {
      t.health = t.maxHealth;
      this.scene.setHealthBar(t.object3D, 1);          // esconde a barra de vida
      this.systems.vfx.repairPulse(t);                 // animação de reparo (Vfx.js)
    }
    Sound.play("reparar", { x: tower.position.x, y: 1, z: tower.position.z });
    this.systems.enemy.recomputePaths();               // construção reforçada custa mais para os inimigos quebrarem
    this.ui.message(damaged.length > 1
      ? `${damaged.length} muros reparados (-${cost} moedas)`
      : `${tower.name} reparada (-${cost} moedas)`);
    this.updateStructureMenu();
  }

  // undo = desfazer uma obra recém-colocada: devolve 100% do investido (demolir devolve só refundRate).
  demolishStructure(tower, { undo = false } = {}) {
    const list = this.entities.towers;
    const i = list.indexOf(tower);
    if (i < 0) return;
    const refund = undo ? tower.invested : this.refundFor(tower);

    list.splice(i, 1);
    tower.alive = false;
    this.map.release(tower.row, tower.col, tower.footprint);   // libera as células e o "peso" de perigo
    this.collapseVisual(tower, false);                         // desaba em escombros (Vfx.js)
    Sound.play(undo ? "desfazer" : "demolir", { x: tower.position.x, y: 1, z: tower.position.z });
    this.economy.earn(refund);
    this.systems.enemy.recomputePaths();                       // o caminho dos inimigos pode mudar
    this.syncWallLinks();                                      // remove as ligações do muro demolido

    if (!undo || this.selectedStructure === tower) this.closeStructureMenu();
    this.ui.message(undo ? `Obra de ${tower.name} desfeita +${refund} moedas` : `${tower.name} demolida +${refund} moedas`);
  }

  /* ------------------------------ desfazer ------------------------------ */
  // Mantém só as construções que ainda estão em obra (as prontas ou destruídas saem da lista).
  pruneUndo() {
    this.undoStack = this.undoStack.filter((t) => t.alive && !t.built);
  }

  // Desfaz a última construção ainda em obra, com reembolso total.
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
    const tower = new Tower(data, cell.row, cell.col, plan.level);     // muro novo já nasce no nível do grupo

    const p = this.map.gridToWorld(cell.row, cell.col, data.footprint);
    tower.position = { x: p.x, y: 0, z: p.z };
    tower.object3D = this.scene.createObject("structures", data).object3D;
    this.scene.setPosition(tower.object3D, p.x, 0, p.z);
    this.scene.add(tower.object3D);
    Sound.play("construir_posicionar", { x: p.x, y: 0.5, z: p.z });
    this.scene.attachHealthBar(tower.object3D, tower.muzzleHeight + 0.5);   // só aparece depois de levar dano
    if (tower.level > 1) this.applyTowerVisual(tower);                     // modelo/cor do nível inicial

    this.map.occupy(cell.row, cell.col, data.footprint, tower);
    this.economy.spend(plan.cost);
    this.entities.towers.push(tower);
    this.systems.enemy.recomputePaths();
    this.syncWallLinks();                    // muro novo: liga aos vizinhos (só quando a obra terminar)
    this.systems.vfx.constructionSite(tower);   // andaime + progresso (nada acontece se buildTime = 0)

    if (!tower.built) {                      // pode ser desfeita enquanto estiver em obra
      this.undoStack.push(tower);
      while (this.undoStack.length > (GAME_CONFIG.undoLimit ?? 2)) this.undoStack.shift();
    }

    this.handleHover({ x: p.x, z: p.z });    // revalida o fantasma (agora ocupado)
  }

  /* ------------------------------ muros ------------------------------ */
  // Nível inicial e preço TOTAL de uma construção nova. Muro encostado em muros já evoluídos nasce no
  // nível deles (inclusive muros ainda em obra, que vão se ligar) e custa base + cada evolução até lá.
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

  // Muros nas 8 células ao redor (inclusive a própria, se já houver um).
  wallNeighbors(row, col) {
    const list = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const o = this.map.getCell(row + dr, col + dc)?.occupant;
        if (o instanceof Tower && o.wall && o.built) list.push(o);   // muro em obra ainda não liga
      }
    }
    return list;
  }

  // Visual do segmento no nível do muro: base + `link` de cada evolução já alcançada.
  linkSpecFor(tower) {
    const base = TOWERS[tower.type];
    let spec = base.wall.link;
    for (let i = 0; i < tower.level - 1; i++) {
      const l = base.upgrades?.[i]?.link;
      if (l) spec = { ...spec, ...l, fallback: { ...spec.fallback, ...l.fallback } };
    }
    return spec;
  }

  // Deixa os segmentos 3D exatamente iguais aos pares de muros vizinhos que existem agora
  // (e com o visual do nível certo; o par usa o muro de menor nível).
  syncWallLinks() {
    const wanted = new Map();
    for (const a of this.entities.towers) {
      if (!a.wall || !a.built) continue;
      for (const b of this.wallNeighbors(a.row, a.col)) {
        if (b === a || a.uid > b.uid) continue;           // cada par uma vez só
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

  // Prévia: mostra no fantasma com quais muros vizinhos ele vai se ligar.
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
    if (overMenu) { this.scene.hideGhost(); this.ui.hideGhostPrice(); this.ghostCell = null; return; }   // sobre a lixeira
    const pt = this.dragPoint(x, y);
    if (pt) this.handleHover(pt);
    else { this.scene.hideGhost(); this.ui.hideGhostPrice(); this.ghostCell = null; }
  }

  // Soltou: constrói só se o quadrado for válido; senão cancela sem mensagem.
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
      record: Math.max(this.record, Math.floor(this.elapsed)),   // o recorde sobe junto enquanto você o supera
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