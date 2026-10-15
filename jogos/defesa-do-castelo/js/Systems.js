/* ==========================================================================
   Systems.js — regras e simulação.
   "O que esses objetos estão fazendo?"
   Recebe Map, Scene e demais referências pelo construtor (não importa Game).
   ========================================================================== */
import { ENEMIES, ENDLESS, GAME_CONFIG } from "./Data.js";
import { Enemy, Projectile, Tower } from "./Entities.js";
import { RoutePlanner, ROUTING } from "./Routes.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TWO_PI = Math.PI * 2;

/* ------------------------------ Economia ------------------------------ */
export class EconomySystem {
  constructor(startCoins) { this.coins = startCoins; }
  getCoins() { return this.coins; }
  canAfford(cost) { return this.coins >= cost; }
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.coins -= cost;
    return true;
  }
  earn(amount) { this.coins += amount; }
}

/* ------------------------------ Animação ------------------------------ */
const CLIP_NAMES = {
  IDLE: ["idle"],
  WALKING: ["walk", "run"],
  ATTACKING: ["attack"],
  DYING: ["death", "die"]
};

export class AnimationSystem {
  constructor({ scene }) {
    this.scene = scene;
    this.items = new Map();
  }

  register(entity, animations = []) {
    const root = entity.object3D;
    const item = {
      pivot: root.userData.pivot,
      mixer: null, actions: {}, state: null, t: Math.random() * 10
    };
    if (animations.length) {
      item.mixer = this.scene.createMixer(root.userData.model);
      for (const [state, names] of Object.entries(CLIP_NAMES)) {
        const clip = animations.find((c) => names.some((n) => c.name.toLowerCase().includes(n)));
        if (clip) {
          const action = item.mixer.clipAction(clip);
          if (state === "DYING") { action.setLoop(2200, 1); action.clampWhenFinished = true; } // LoopOnce
          item.actions[state] = { action, duration: clip.duration };
        }
      }
    }
    this.items.set(entity, item);
    this.setState(entity, entity.state ?? "IDLE");
  }

  unregister(entity) {
    const item = this.items.get(entity);
    if (item?.mixer) item.mixer.stopAllAction();
    this.items.delete(entity);
  }

  getDuration(entity, state) {
    return this.items.get(entity)?.actions[state]?.duration ?? null;
  }

  setState(entity, state) {
    const item = this.items.get(entity);
    if (!item || item.state === state) return;
    const prev = item.actions[item.state]?.action;
    const next = item.actions[state]?.action;
    item.state = state;
    if (next) {
      next.reset().play();
      if (prev && prev !== next) prev.crossFadeTo(next, 0.2, false);
    } else if (prev) {
      prev.fadeOut(0.2);
    }
  }

  update(dt) {
    for (const [entity, item] of this.items) {
      item.mixer?.update(dt);
      const hasClip = !!item.actions[item.state];
      const p = item.pivot;
      if (!p) continue;
      item.t += dt;

      if (hasClip) { p.position.y = 0; p.rotation.set(0, 0, 0); p.scale.setScalar(1); continue; }

      // Movimento procedural (graybox ou modelo sem clipe para este estado)
      if (item.state === "WALKING") {
        const f = 6 + (entity.speed ?? 2) * 1.6;
        p.position.y = Math.abs(Math.sin(item.t * f)) * 0.12;
        p.rotation.set(0, 0, Math.sin(item.t * f) * 0.07);
        p.scale.setScalar(1);
      } else if (item.state === "ATTACKING") {
        p.position.y = 0;
        p.rotation.set(Math.sin(item.t * 11) * 0.22, 0, 0);
      } else if (item.state === "DYING") {
        const prog = entity.deathDuration ? clamp(1 - entity.deathTimer / entity.deathDuration, 0, 1) : 1;
        p.rotation.set(0, 0, prog * 1.5);
        p.position.y = -prog * 0.25;
        p.scale.setScalar(Math.max(0.05, 1 - prog * 0.85));
      } else {
        p.position.y = 0; p.rotation.set(0, 0, 0);
      }
    }
  }
}

/* ------------------------------ Combate ------------------------------- */
export class CombatSystem {
  constructor({ scene, entities, emit }) {
    this.scene = scene;
    this.entities = entities;
    this.emit = emit;
    this.onEnemyKilled = () => {};
  }

  setKillHandler(fn) { this.onEnemyKilled = fn; }

  // Chamado pelo TowerSystem: cria o projétil.
  fire(tower, target) {
    const start = { x: tower.position.x, y: tower.muzzleHeight, z: tower.position.z };
    const projectile = new Projectile(tower, target, start);
    const { object3D } = this.scene.createObject("effects", GAME_CONFIG.effects[tower.projectile]);
    projectile.object3D = object3D;
    this.scene.setPosition(object3D, start.x, start.y, start.z);
    this.scene.add(object3D);
    this.entities.projectiles.push(projectile);
    this.emit?.("towerFired", { tower });
  }

  update(dt) {
    const list = this.entities.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.target?.alive) { p.targetPos.x = p.target.position.x; p.targetPos.z = p.target.position.z; }

      const dx = p.targetPos.x - p.position.x;
      const dz = p.targetPos.z - p.position.z;
      const flat = Math.hypot(dx, dz);
      const step = p.speed * dt;

      if (flat <= Math.max(step, 0.3)) {
        this.impact(p);
        this.scene.remove(p.object3D);
        list.splice(i, 1);
        continue;
      }

      p.position.x += (dx / flat) * step;
      p.position.z += (dz / flat) * step;
      const t = clamp(1 - flat / p.startDist, 0, 1);
      const prevY = p.position.y;
      p.position.y = p.startY + (p.targetPos.y - p.startY) * t + p.arc * 4 * t * (1 - t);

      this.scene.setPosition(p.object3D, p.position.x, p.position.y, p.position.z);
      this.scene.faceDirection(p.object3D, dx, p.position.y - prevY, dz);
    }
  }

  impact(p) {
    const pos = { x: p.targetPos.x, y: 0.6, z: p.targetPos.z };
    this.emit?.("projectileImpact", { kind: p.kind, pos, splash: p.splash });
    if (p.splash > 0) {
      // Dano em área = UM valor total (p.damage) repartido entre os atingidos, do mais perto da torre
      // para o mais longe. Cada um recebe no máximo `maxPerTarget` (e nunca mais que a vida que tem);
      // o que sobra passa para o próximo e, no fim, o que restar é descartado.
      const ox = p.origin?.x ?? pos.x, oz = p.origin?.z ?? pos.z;
      const hit = this.entities.enemies
        .filter((e) => e.alive && Math.hypot(e.position.x - pos.x, e.position.z - pos.z) <= p.splash)
        .map((e) => ({ e, d: Math.hypot(e.position.x - ox, e.position.z - oz) }))
        .sort((a, b) => a.d - b.d || a.e.uid - b.e.uid);
      const cap = p.maxPerTarget > 0 ? p.maxPerTarget : Infinity;   // teto por inimigo (o excedente do total é descartado)
      let pool = p.damage;
      for (const { e } of hit) {
        if (pool <= 0) break;
        const dealt = Math.min(pool, cap, e.health);
        pool -= dealt;
        this.applyDamage(e, dealt, p);
      }
      this.scene.spawnEffect(GAME_CONFIG.effects.explosion, pos, p.splash);
    } else {
      if (p.target?.alive) this.applyDamage(p.target, p.damage, p);
      this.scene.spawnEffect(GAME_CONFIG.effects.hit, pos, 1);
    }
  }

  applyDamage(enemy, amount, source = null) {
    if (!enemy.alive) return;
    enemy.health -= amount;
    this.scene.setHealthBar(enemy.object3D, Math.max(0, enemy.health) / enemy.maxHealth);
    if (source?.slow) { enemy.slowFactor = 1 - source.slow; enemy.slowTimer = source.slowDuration; }
    if (enemy.health <= 0) this.onEnemyKilled(enemy);
  }

  // Barril de pólvora: dano em área (cheio dentro do raio) + a mesma explosão visual do canhão.
  // Quem chama (TowerSystem) avisa o Game, que remove o barril.
  detonate(tower) {
    const { damage, radius } = tower.trap;
    const pos = { x: tower.position.x, y: 0.6, z: tower.position.z };
    for (const e of this.entities.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.position.x - pos.x, e.position.z - pos.z) <= radius) this.applyDamage(e, damage, tower);
    }
    this.scene.spawnEffect(GAME_CONFIG.effects.explosion, pos, radius);
  }

  // Inimigo golpeando uma construção. Ao chegar a 0 de vida, avisa o Game (que remove a construção).
  enemyAttackStructure(enemy, tower) {
    if (!tower.alive) return;
    tower.health = Math.max(0, tower.health - enemy.attack.structureDamage);
    this.scene.setHealthBar(tower.object3D, tower.health / tower.maxHealth);
    this.scene.spawnEffect(GAME_CONFIG.effects.hit, { x: tower.position.x, y: 0.8, z: tower.position.z }, 1);
    this.emit?.("enemyHitStructure", { enemy, tower });
    if (tower.health <= 0) {
      tower.alive = false;
      this.emit("structureDestroyed", { tower });
    }
  }

  // Inimigo atacando o castelo (nenhum outro lugar altera castle.health).
  enemyAttack(enemy) {
    const castle = this.entities.castle;
    if (!castle || castle.health <= 0) return;
    castle.health = Math.max(0, castle.health - enemy.attack.damage);
    this.emit("castleDamaged", { amount: enemy.attack.damage, enemy });
    if (castle.health <= 0) this.emit("castleDestroyed");
  }
}

/* ------------------------------ Inimigos ------------------------------ */
// AGLOMERAÇÃO: construções juntas chamam mais atenção. O valor de cada uma é multiplicado por
// 1 + CLUSTER_BONUS × (vizinhas num raio de CLUSTER_RADIUS). Sozinha = ×1 (nada muda);
// com 3 vizinhas = ×4; com 5 = ×6; máximo (8) = ×9. Muros contam só CLUSTER_WALL_WEIGHT de uma vizinha.
// O grupo também aumenta o ALCANCE em que o inimigo o percebe: 1 + CLUSTER_AGGRO × vizinhas (máx. ×3).
// (Sem isso, um grupo a 7 células nunca era considerado por um orc, que só enxerga ~4 células.)
const CLUSTER_RADIUS = 5;             // unidades 3D (≈ 2,5 células, contando diagonais)
const CLUSTER_BONUS = 1.0;            // quanto cada vizinha soma ao multiplicador de VALOR
const CLUSTER_AGGRO = 0.25;           // quanto cada vizinha soma ao multiplicador do ALCANCE de percepção
const CLUSTER_MAX = 8;                // vizinhas acima disso não aumentam mais (evita valores absurdos)
const CLUSTER_WALL_WEIGHT = 0.3;      // um muro vale 30% de uma torre/mina como "vizinho"
const MINE_VALUE_DIV = 1.5;           // quanto menor, mais a mina "chama atenção" dos inimigos (moedas/s ÷ isto, somado a 1)
const STRUCTURE_REWARD_SECONDS = 40;   // quanto tempo (s) um inimigo de preferência 1 aceitaria gastar por uma construção de valor 1
// ANTI VAI-E-VEM
const TARGET_STICKY = 1.7;        // o alvo atual vale ×1,7 na comparação: só troca por um claramente melhor
const TARGET_MIN_COMMIT = 2;      // s: depois de escolher um alvo, não troca de alvo antes disso
const SWITCH_WINDOW = 8;          // s: janela para contar trocas de alvo
const SWITCH_LIMIT = 4;           // trocas dentro da janela = vai-e-vem detectado
const SWITCH_LOCK = 12;           // s: com vai-e-vem detectado, o alvo fica travado por este tempo
const UNREACHABLE_SKIP = 10;      // s: alvo sem caminho é ignorado por este tempo
const AGGRO_RANGE = 14;   // unidades 3D: com preferência 1 o inimigo persegue de qualquer distância; senão, preferência × 14

const COLLISION = GAME_CONFIG.collision ?? {};
const TARGETING = GAME_CONFIG.targeting ?? {};
const HASH = 1.5;                     // tamanho do balde da grade espacial (≥ 2 × maior raio comum)
const CONTACT = 1.2;
const STUCK_TIME = 1.2;               // s sem avançar (andando, sem fila) = travado
const GHOST_TIME = 2.5;               // s atravessando os outros inimigos para se destravar                  // "encostado" = distância < (r1 + r2) × CONTACT

export class EnemySystem {
  constructor({ map, scene, entities, economy, combat, animation, emit }) {
    Object.assign(this, { map, scene, entities, economy, combat, animation, emit });
    this.clock = 0;               // segundos de simulação (usado pelas travas de alvo)
    this.planner = new RoutePlanner({ map, entities });   // rotas por grupo (Routes.js)
    this.tally = { byTarget: new Map(), byGroup: new Map() };   // quantos inimigos já miram cada construção
  }

  /* ------------------- lotação de alvos (máx. por construção) ------------------- */
  groupKey(e) { return `${e.routeKey}|${e.routeRank}`; }

  bump(e, t, delta) {
    if (!t) return;
    const { byTarget, byGroup } = this.tally;
    byTarget.set(t.uid, (byTarget.get(t.uid) ?? 0) + delta);
    const gk = this.groupKey(e);
    let g = byGroup.get(gk);
    if (!g) byGroup.set(gk, (g = new Map()));
    g.set(t.uid, (g.get(t.uid) ?? 0) + delta);
  }

  // Quantos OUTROS inimigos já miram `t`, e se a construção está lotada para `e`.
  crowdOf(t, e) { return Math.max(0, (this.tally.byTarget.get(t.uid) ?? 0) - (t === e.target ? 1 : 0)); }
  isFull(t, e) { return this.crowdOf(t, e) >= (TARGETING.maxPerTarget ?? 4); }

  // Primeira construção viva no caminho (lista de células).
  firstBlock(path) {
    for (let i = 1; i < path.length; i++) {
      const o = this.map.getCell(path[i].row, path[i].col)?.occupant;
      if (o instanceof Tower && o.alive && !o.hidden) return o;
    }
    return null;
  }

  // Recontagem do zero a cada frame (cobre mortes, construções destruídas, troca de alvo em qualquer lugar).
  rebuildTally() {
    this.tally.byTarget.clear();
    this.tally.byGroup.clear();
    for (const e of this.entities.enemies) {
      if (e.state !== "DYING" && e.target?.alive) this.bump(e, e.target, 1);
    }
  }

  spawn(typeId, cell) {
    const data = ENEMIES[typeId];
    if (!data) return null;

    const { object3D, animations } = this.scene.createObject("enemies", data);
    const enemy = new Enemy(data, object3D);
    const lane = COLLISION.laneJitter ?? 0.2;     // linha quase igual para todos do grupo = fila indiana
    enemy.jitter = { x: (Math.random() - 0.5) * lane, z: (Math.random() - 0.5) * lane };

    const p = this.map.gridToWorld(cell.row, cell.col);
    enemy.position = { x: p.x + enemy.jitter.x, y: 0, z: p.z + enemy.jitter.z };

    this.planner.assign(enemy, cell);
    this.plan(enemy, cell);
    const first = enemy.path[enemy.waypoint];
    if (first) enemy.heading = Math.atan2(first.x - enemy.position.x, first.z - enemy.position.z);

    const k = this.scene.scaleFor("enemies");     // barra de vida acompanha o tamanho do inimigo
    this.scene.attachHealthBar(object3D, (data.barHeight ?? 1.6) * k, 1.1 * k);
    this.scene.setPosition(object3D, enemy.position.x, 0, enemy.position.z);
    this.scene.setRotation(object3D, enemy.heading);
    this.scene.add(object3D);

    this.animation.register(enemy, animations);
    this.entities.enemies.push(enemy);
    this.emit?.("enemySpawned", { enemy });
    return enemy;
  }

  toWaypoints(cells, jitter) {
    const list = [...cells];
    while (list.length && this.map.getCell(list[list.length - 1].row, list[list.length - 1].col).type === "castle") list.pop();
    return list.map((c) => {
      const w = this.map.gridToWorld(c.row, c.col);
      return { x: w.x + jitter.x, z: w.z + jitter.z };
    });
  }

  /* ---------------------- inteligência contra construções ---------------------- */
  // Custo (em "células equivalentes") de atravessar uma construção = tempo para quebrá-la.
  // Quanto maior a preferência por destruir, mais barato ela parece. Assim, quem não gosta de quebrar
  // desvia quando existe caminho razoável, e só quebra o necessário quando desviar sai mais caro.
  breachCost(e) {
    const dps = Math.max(0.1, e.attack.structureDamage / Math.max(0.1, e.attack.cooldown));
    const secondsPerCell = this.map.cellSize / Math.max(0.1, e.baseSpeed);
    return (cell) => {
      const t = cell.occupant;
      if (!t || !t.alive || t.hidden) return 0;
      const cells = (t.health / dps) / secondsPerCell;
      // cada inimigo que já ataca esta construção encarece a passagem: o caminho desvia para outro trecho
      return Math.max(0.5, cells * (1 - 0.9 * e.structurePreference)) + this.crowdOf(t, e) * (TARGETING.crowdCost ?? 3);
    };
  }

  // (Re)calcula o caminho: até a construção-alvo (se houver) ou até o castelo, quebrando só o que valer a pena.
  plan(e, cell = this.map.worldToGrid(e.position)) {
    if (e.target && !e.target.alive) e.target = null;
    const opts = { structureCost: this.breachCost(e) };
    let path = null;
    if (e.target) {
      path = this.map.findPath(cell, { row: e.target.row, col: e.target.col }, opts);
      if (!path) {                                   // sem caminho: esquece esse alvo por um tempo (não escolher de novo a cada 0,5s)
        e.skip.set(e.target.uid, this.clock + UNREACHABLE_SKIP);
        e.target = null;
      }
    }
    if (!path) {                                   // sem alvo: segue a rota do grupo (a que mais vale a pena)
      const route = this.planner.pathFor(e, cell);
      if (route) path = route;
    }
    if (!path) path = this.map.findPath(cell, null, opts);
    if (path) {                                    // 1ª construção do caminho já lotada? tenta outro trecho
      const blk = this.firstBlock(path);
      if (blk && this.isFull(blk, e)) {
        const alt = this.map.findPath(cell, e.target ? { row: e.target.row, col: e.target.col } : null, opts);
        if (alt) path = alt;
      }
    }
    if (!path) { if (!e.path.length) e.waypoint = 0; return; }
    e.path = this.toWaypoints(path, e.jitter);
    e.waypoint = e.path.length > 1 ? 1 : 0;
  }

  // Menor distância (unidades 3D) entre a construção e o que falta do caminho do inimigo.
  distanceToPath(t, e) {
    let best = Infinity;
    for (let i = e.waypoint; i < e.path.length; i++) {
      best = Math.min(best, Math.hypot(e.path[i].x - t.position.x, e.path[i].z - t.position.z));
    }
    return best;
  }

  // Escolhe a TORRE mais relevante, mas só se "vale a pena" para este inimigo.
  // Muros nunca são alvo por si só; minas e torres são (a mina vale mais quanto mais moedas/s produz).
  // Quanto maior a aglomeração ao redor de uma construção, maior o valor dela (veja CLUSTER_*).: só são quebradas quando estão no meio do
  // caminho, e isso já é decidido pelo A* (plan/breachCost), inclusive quando o caminho até uma torre-alvo passa por muros.
  // Vale a pena = benefício > custo (tudo em segundos):
  //   benefício = preferência × VALOR_EM_SEGUNDOS × valor da construção (torres que atacam valem mais)
  //   custo     = tempo de desvio até ela + tempo para quebrá-la (esse último pesa menos para quem gosta de quebrar)
  // Resultado: com preferência baixa o inimigo simplesmente passa direto pelas torres; só o caçador
  // (preferência 1) persegue sempre. Entre as que valem a pena, vence a mais próxima do melhor caminho.
  pickStructureTarget(e) {
    const p = e.structurePreference;
    if (p <= 0) return null;
    const aggro = p >= 1 ? Infinity : p * AGGRO_RANGE;
    const dps = Math.max(0.1, e.attack.structureDamage / Math.max(0.1, e.attack.cooldown));
    let best = null, bestScore = 0;
    for (const t of this.entities.towers) {
      if (!t.alive || t.hidden || (!t.attacks && !t.mining && !t.healer)) continue;   // armadilhas ocultas nunca são alvo   // só muro fica de fora: torres e minas podem ser alvo
      if ((e.skip.get(t.uid) ?? 0) > this.clock) continue;   // marcada como inalcançável há pouco
      // lotação: já tem o máximo de inimigos mirando esta construção? Vai para o próximo alvo da lista.
      // (quem já é o alvo atual conta a si mesmo; quem já está batendo nela nunca é expulso)
      const mine = t === e.target ? 1 : 0;
      const others = (this.tally.byTarget.get(t.uid) ?? 0) - mine;
      if (others >= (TARGETING.maxPerTarget ?? 4) && !(mine && e.state === "BREAKING")) continue;
      const d = Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z);
      const cluster = Math.min(CLUSTER_MAX, this.clusterSize(t));
      if (d > aggro * (1 + CLUSTER_AGGRO * cluster)) continue;   // grupos grandes são percebidos de mais longe
      const dpRaw = this.distanceToPath(t, e);
      const dp = Number.isFinite(dpRaw) ? dpRaw : d;
      const baseValue = t.healer
        ? 1.5 + (t.healAmount / Math.max(0.1, t.healInterval)) / 20                // curandeira: mantém as outras vivas
        : t.mining
        ? 1 + (t.mineAmount / Math.max(0.5, t.mineInterval)) / MINE_VALUE_DIV   // minas mais ricas valem mais
        : 1 + (t.damage / Math.max(0.2, t.cooldown)) / 15;                       // torres mais fortes valem mais
      const value = baseValue * (1 + CLUSTER_BONUS * cluster);      // aglomeração aumenta a vontade de atacar

      if (p < 1) {
        const benefit = p * STRUCTURE_REWARD_SECONDS * value;
        const cost = dp / Math.max(0.1, e.baseSpeed) + (t.health / dps) * (1 - 0.9 * p);
        if (benefit <= cost) continue;               // não compensa: segue o caminho
      }

      let score = value / ((1 + d / 4) * (1 + dp / 3));
      if (t === e.target) score *= TARGET_STICKY;    // histerese: só troca por um alvo claramente melhor
      const mates = (this.tally.byGroup.get(this.groupKey(e))?.get(t.uid) ?? 0) - mine;
      if (mates > 0) score *= TARGETING.groupBonus ?? 1.5;   // o grupo tende a ir junto, em fila, ao mesmo alvo
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  // Quantas construções "vizinhas" (num raio de CLUSTER_RADIUS) cercam a construção `t`.
  // Muros contam só uma fração; construções destruídas não contam.
  clusterSize(t) {
    let n = 0;
    for (const o of this.entities.towers) {
      if (o === t || !o.alive || o.hidden) continue;
      if (Math.hypot(o.position.x - t.position.x, o.position.z - t.position.z) > CLUSTER_RADIUS) continue;
      n += o.wall ? CLUSTER_WALL_WEIGHT : 1;
    }
    return n;
  }

  refreshTarget(e) {
    if (e.target && !e.target.alive) e.target = null;
    if (this.clock < e.targetLock) return;                       // decisão travada (vai-e-vem detectado)

    const best = this.pickStructureTarget(e);
    if (best === e.target) return;
    // compromisso: com um alvo em andamento, só troca depois de TARGET_MIN_COMMIT segundos
    if (e.target && this.clock - e.targetSince < TARGET_MIN_COMMIT) return;

    this.bump(e, e.target, -1);                  // libera a vaga do alvo antigo e ocupa a do novo já neste frame
    e.target = best;
    this.bump(e, best, 1);
    e.targetSince = this.clock;

    // detector: trocas demais em pouco tempo = vai-e-vem; trava o alvo por um bom tempo
    e.switchLog = e.switchLog.filter((t) => this.clock - t < SWITCH_WINDOW);
    e.switchLog.push(this.clock);
    if (e.switchLog.length >= SWITCH_LIMIT) {
      e.targetLock = this.clock + SWITCH_LOCK;
      e.switchLog.length = 0;
    }
    this.plan(e);
  }

  // Construção ao alcance do golpe: o alvo escolhido ou a que bloqueia o próximo passo do caminho.
  // Alcance de golpe, medido até a BORDA do alvo (unidades 3D). Nunca menos que 0.75 célula (para acertar
  // na diagonal) nem mais que COLLISION.maxReach: ninguém bate de 2 células de distância.
  reachOf(e) {
    const cs = this.map.cellSize;
    const base = Math.min(Math.max(e.attack.range, cs * 0.75), COLLISION.maxReach ?? 1.6);
    return base + (e.queued ? (COLLISION.queueReach ?? 0) * cs : 0);
  }

  edgeDist(x, z, cx, cz, hw, hh) {
    return Math.hypot(Math.max(Math.abs(x - cx) - hw, 0), Math.max(Math.abs(z - cz) - hh, 0));
  }

  towerEdgeDist(x, z, t) {
    const cs = this.map.cellSize;
    return this.edgeDist(x, z, t.position.x, t.position.z, (t.footprint.width * cs) / 2, (t.footprint.height * cs) / 2);
  }

  // Linha de visão livre entre dois pontos? Qualquer construção viva no meio (exceto `ignore`) bloqueia.
  // Na DIAGONAL, se as duas células vizinhas do canto estão ocupadas (ex.: dois muros em diagonal, que o jogo
  // liga com um segmento), o golpe também é bloqueado: não dá para atacar "por dentro" da ligação.
  lineClearFrom(sx, sz, tx, tz, ignore = null) {
    const map = this.map;
    const blocks = (row, col) => {
      const o = map.getCell(row, col)?.occupant;
      return !!o && o !== ignore && o.alive && !o.hidden;
    };
    const steps = Math.ceil(Math.hypot(tx - sx, tz - sz) / (map.cellSize * 0.1));
    const from = map.worldToGrid({ x: sx, z: sz });
    let prev = from;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const g = map.worldToGrid({ x: sx + (tx - sx) * t, z: sz + (tz - sz) * t });
      if (g.row === prev.row && g.col === prev.col) continue;
      if (g.row !== prev.row && g.col !== prev.col && blocks(prev.row, g.col) && blocks(g.row, prev.col)) return false;   // ligação diagonal
      prev = g;
      if (g.row === from.row && g.col === from.col) continue;
      if (blocks(g.row, g.col)) return false;
    }
    // último passo até o alvo (a célula do alvo não entra na conta, mas a quina antes dela sim)
    const end = map.worldToGrid({ x: tx, z: tz });
    if (end.row !== prev.row && end.col !== prev.col && blocks(prev.row, end.col) && blocks(end.row, prev.col)) return false;
    return true;
  }

  structureInReach(e, wp) {
    const reach = this.reachOf(e);
    const { x, z } = e.position;
    e.waitingFull = null;
    const within = (t) => {
      if (this.towerEdgeDist(x, z, t) > reach || !this.lineClearFrom(x, z, t.position.x, t.position.z, t)) return false;   // muro no meio = não acerta
      if (this.isFull(t, e)) { e.waitingFull = t; return false; }   // já tem o máximo de atacantes: não entra na briga
      return true;
    };
    if (e.target?.alive && within(e.target)) return e.target;
    // construção que bloqueia o caminho: quem está na fila olha também um waypoint adiante
    const ahead = e.queued ? [wp, e.path[e.waypoint + 1]] : [wp];
    for (const w of ahead) {
      if (!w) continue;
      const g = this.map.worldToGrid(w);
      const o = this.map.getCell(g.row, g.col)?.occupant;
      if (o instanceof Tower && o.alive && !o.hidden && within(o)) return o;
    }
    return null;
  }

  // O castelo está ao alcance E sem nenhuma construção (muro…) no meio do golpe?
  castleInReach(e) {
    const reach = this.reachOf(e), half = this.map.cellSize / 2;
    const { x, z } = e.position;
    for (const c of this.map.castleCells) {
      const p = this.map.gridToWorld(c.row, c.col);
      if (this.edgeDist(x, z, p.x, p.z, half, half) <= reach && this.lineClearFrom(x, z, p.x, p.z)) return true;
    }
    return false;
  }

  /* ---------------- fila sem alcance: procurar outro lado do alvo ---------------- */
  towerGoal(t) {
    const cs = this.map.cellSize;
    return { cx: t.position.x, cz: t.position.z, hw: (t.footprint.width * cs) / 2, hh: (t.footprint.height * cs) / 2, ignore: t };
  }

  // O que este inimigo quer acertar agora: o alvo, a construção que bloqueia o caminho ou o castelo (se perto).
  flankGoal(e, wp) {
    if (e.target?.alive) return this.towerGoal(e.target);
    for (const w of [wp, e.path[e.waypoint + 1]]) {
      if (!w) continue;
      const g = this.map.worldToGrid(w);
      const o = this.map.getCell(g.row, g.col)?.occupant;
      if (o instanceof Tower && o.alive && !o.hidden) return this.towerGoal(o);
    }
    const cs = this.map.cellSize;
    let best = null, bd = Infinity;
    for (const c of this.map.castleCells) {
      const p = this.map.gridToWorld(c.row, c.col);
      const d = Math.hypot(p.x - e.position.x, p.z - e.position.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best && bd <= cs * 3.5 ? { cx: best.x, cz: best.z, hw: cs / 2, hh: cs / 2, ignore: null } : null;
  }

  // Procura um ponto livre em volta do alvo, ao alcance e com linha de visão, e monta um caminho curto até ele.
  tryFlank(e, wp) {
    if (this.clock < e.flankCooldown) return false;
    e.flankCooldown = this.clock + 1;                 // não repete a busca a cada frame
    const goal = this.flankGoal(e, wp);
    if (!goal) return false;

    const reach = this.reachOf(e);
    const off = Math.min(1, reach * 0.85);
    const others = this.entities.enemies.filter((o) => o !== e && o.state !== "DYING");
    const slots = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TWO_PI, ca = Math.cos(a), sa = Math.sin(a);
      const s = Math.min(goal.hw / Math.max(Math.abs(ca), 1e-6), goal.hh / Math.max(Math.abs(sa), 1e-6));
      const x = goal.cx + ca * (s + off), z = goal.cz + sa * (s + off);
      const g = this.map.worldToGrid({ x, z });
      const cell = this.map.getCell(g.row, g.col);
      if (!cell || cell.blocked || cell.type === "castle") continue;
      if (this.edgeDist(x, z, goal.cx, goal.cz, goal.hw, goal.hh) > reach) continue;
      if (!this.lineClearFrom(x, z, goal.cx, goal.cz, goal.ignore)) continue;
      if (others.some((o) => Math.hypot(o.position.x - x, o.position.z - z) < (e.radius + o.radius) * 1.1)) continue;   // já tem alguém lá
      slots.push({ x, z, row: g.row, col: g.col, d: Math.hypot(x - e.position.x, z - e.position.z) });
    }
    slots.sort((p, q) => p.d - q.d);

    const from = this.map.worldToGrid(e.position);
    for (const s of slots.slice(0, 3)) {
      const path = this.map.findPath(from, { row: s.row, col: s.col });
      if (!path || path.length > 9) continue;          // só desvios curtos
      const pts = path.slice(1).map((c) => { const w = this.map.gridToWorld(c.row, c.col); return { x: w.x, z: w.z }; });
      pts.push({ x: s.x, z: s.z });
      e.flank = { pts, i: 0, until: this.clock + 4 };
      return true;
    }
    return false;
  }

  followFlank(e, dt) {
    const f = e.flank;
    if (!f || this.clock > f.until || f.i >= f.pts.length) { e.flank = null; e.flankCooldown = this.clock + 1; return; }
    const p = f.pts[f.i];
    const dx = p.x - e.position.x, dz = p.z - e.position.z;
    const dist = Math.hypot(dx, dz);
    const step = e.speed * this.map.speedAt(e.position) * dt;
    if (dist <= step) { e.position.x = p.x; e.position.z = p.z; f.i++; return; }
    e.position.x += (dx / dist) * step;
    e.position.z += (dz / dist) * step;
    const target = Math.atan2(dx, dz);
    const diff = ((target - e.heading + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    e.heading += diff * Math.min(1, dt * 10);
  }

  // Anti-travamento: quem está andando, fora de fila, e quase não saiu do lugar (ex.: dois inimigos de
  // frente um para o outro na ponte) vira "fantasma" por um instante e atravessa os outros.
  detectStuck(dt) {
    for (const e of this.entities.enemies) {
      if (e.state !== "WALKING" || e.queued || e.flank || e.waitingFull) { e.stuckClock = 0; e.lastPos = null; continue; }
      if (!e.lastPos) { e.lastPos = { x: e.position.x, z: e.position.z }; e.stuckClock = 0; continue; }
      e.stuckClock += dt;
      if (e.stuckClock < STUCK_TIME) continue;
      const moved = Math.hypot(e.position.x - e.lastPos.x, e.position.z - e.lastPos.z);
      if (moved < e.speed * e.stuckClock * 0.25) e.ghostUntil = this.clock + GHOST_TIME;
      e.lastPos = { x: e.position.x, z: e.position.z };
      e.stuckClock = 0;
    }
  }

  /* ---------------------------- colisão entre inimigos ---------------------------- */
  // A posição só é aceita se a célula de destino for livre (sem árvore, água, construção...).
  // Tenta o movimento completo; se não der, desliza só em X ou só em Z.
  canStandAt(x, z, fromCell) {
    const g = this.map.worldToGrid({ x, z });
    if (g.row === fromCell.row && g.col === fromCell.col) return true;
    const cell = this.map.getCell(g.row, g.col);
    return !!cell && !cell.blocked && cell.type !== "castle";   // empurrão nunca entra no castelo
  }

  nudge(e, mx, mz) {
    const from = this.map.worldToGrid(e.position);
    const x = e.position.x, z = e.position.z;
    if (this.canStandAt(x + mx, z + mz, from)) { e.position.x = x + mx; e.position.z = z + mz; }
    else if (mx && this.canStandAt(x + mx, z, from)) e.position.x = x + mx;
    else if (mz && this.canStandAt(x, z + mz, from)) e.position.z = z + mz;
  }

  // Empurra inimigos sobrepostos para longe uns dos outros. Quem está andando cede mais do que quem
  // está atacando (a fila se organiza em volta de quem já bate na construção). Marca `queued` em quem
  // está encostado em um atacante, para o alcance extra de structureInReach/castelo.
  separate(dt) {
    const list = this.entities.enemies.filter((e) => e.state !== "DYING");
    const n = list.length;
    for (const e of list) { e.queued = false; e.followFactor = 1; }
    if (n < 2) return;

    const share = COLLISION.stationaryShare ?? 0.15;
    const strength = COLLISION.strength ?? 0.6;
    const maxPush = (COLLISION.maxPush ?? 5) * dt;
    const mobility = (e) => (e.state === "WALKING" ? 1 : share);
    const dxs = new Float32Array(n), dzs = new Float32Array(n);
    const keyOf = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

    for (let pass = 0; pass < (COLLISION.iterations ?? 2); pass++) {
      const buckets = new Map();
      list.forEach((e, i) => {
        const k = keyOf(Math.floor(e.position.x / HASH), Math.floor(e.position.z / HASH));
        let b = buckets.get(k);
        if (!b) buckets.set(k, (b = []));
        b.push(i);
      });

      dxs.fill(0); dzs.fill(0);
      for (let i = 0; i < n; i++) {
        const a = list[i];
        const ix = Math.floor(a.position.x / HASH), iz = Math.floor(a.position.z / HASH);
        for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
          const b = buckets.get(keyOf(ix + gx, iz + gz));
          if (!b) continue;
          for (const j of b) {
            if (j <= i) continue;                       // cada par uma vez
            const o = list[j];
            if (this.clock < a.ghostUntil || this.clock < o.ghostUntil) continue;   // destravando: atravessa
            let dx = o.position.x - a.position.x, dz = o.position.z - a.position.z;
            let d = Math.hypot(dx, dz);
            const min = a.radius + o.radius;
            if (d >= min * CONTACT) continue;

            // contato com alguém que está atacando = está na fila
            if (o.state !== "WALKING") a.queued = true;
            if (a.state !== "WALKING") o.queued = true;
            // fila indiana: quem está atrás, no mesmo grupo de rota, acompanha o ritmo de quem está à frente
            if (a.state === "WALKING" && o.state === "WALKING" && a.routeKey === o.routeKey && a.routeRank === o.routeRank && d > 1e-4) {
              if ((dx * Math.sin(a.heading) + dz * Math.cos(a.heading)) / d > 0.3) a.followFactor = Math.min(a.followFactor, Math.max(0.2, o.speed / a.speed));
              if ((-dx * Math.sin(o.heading) - dz * Math.cos(o.heading)) / d > 0.3) o.followFactor = Math.min(o.followFactor, Math.max(0.2, a.speed / o.speed));
            }
            if (d >= min) continue;                     // encostado, mas sem sobreposição

            if (d < 1e-4) {                             // mesmo ponto: escolhe uma direção estável
              const ang = (a.uid * 12.9898 + o.uid * 78.233) % TWO_PI;
              dx = Math.cos(ang); dz = Math.sin(ang); d = 1;
            }
            const overlap = (min - d) * strength;
            const ma = mobility(a), mo = mobility(o);
            const sa = ma / (ma + mo);                  // fatia do empurrão que cabe a `a`
            const nx = dx / d, nz = dz / d;
            dxs[i] -= nx * overlap * sa;  dzs[i] -= nz * overlap * sa;
            dxs[j] += nx * overlap * (1 - sa);  dzs[j] += nz * overlap * (1 - sa);
          }
        }
      }

      for (let i = 0; i < n; i++) {
        let mx = dxs[i], mz = dzs[i];
        const len = Math.hypot(mx, mz);
        if (len < 1e-5) continue;
        if (len > maxPush) { mx *= maxPush / len; mz *= maxPush / len; }
        this.nudge(list[i], mx, mz);
      }
    }
  }

  beginBreaking(e, tower) {
    e.flank = null;
    if (e.target !== tower) {                    // ocupa a vaga já neste frame (vale também para muros no caminho)
      if (e.target?.alive) this.bump(e, e.target, -1);
      this.bump(e, tower, 1);
    }
    e.target = tower;
    e.state = "BREAKING";
    e.attackTimer = 0.3;
    e.heading = Math.atan2(tower.position.x - e.position.x, tower.position.z - e.position.z);
    this.animation.setState(e, "ATTACKING");
  }

  // Distância "até o objetivo" usada pelas torres para escolher alvo.
  goalDistance(e) {
    let d = this.remainingDistance(e);
    const c = this.entities.castle;
    if (e.target?.alive && c) d += Math.hypot(e.target.position.x - c.position.x, e.target.position.z - c.position.z);
    return d;
  }

  // Chamado pelo Game quando as construções mudam (construiu, evoluiu, destruiu).
  recomputePaths() {
    this.planner.invalidate();                  // construções mudaram: refaz e reavalia as rotas
    for (const e of this.entities.enemies) {
      if (e.state !== "WALKING" || !e.alive) continue;
      this.plan(e);
    }
  }

  kill(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.planner.recordDeath(enemy);            // a rota onde morreu fica menos atraente
    enemy.state = "DYING";
    enemy.deathDuration = this.animation.getDuration(enemy, "DYING") ?? 0.8;
    enemy.deathTimer = enemy.deathDuration;
    this.animation.setState(enemy, "DYING");
    this.scene.setHealthBar(enemy.object3D, 1, false);
    this.economy.earn(enemy.reward);
    this.emit("enemyDied", { enemy });
  }

  update(dt) {
    this.clock += dt;
    this.rebuildTally();
    const list = this.entities.enemies;
    const castle = this.entities.castle;

    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];

      if (e.state === "DYING") {
        e.deathTimer -= dt;
        if (e.deathTimer <= 0) {
          this.scene.remove(e.object3D);
          this.animation.unregister(e);
          list.splice(i, 1);
        }
        continue;
      }

      if (e.slowTimer > 0) { e.slowTimer -= dt; if (e.slowTimer <= 0) e.slowFactor = 1; }

      if (e.state === "WALKING") {
        e.retargetTimer -= dt;
        if (e.retargetTimer <= 0) {
          e.retargetTimer = 0.5 + Math.random() * 0.2;
          this.refreshTarget(e);
        }

        const wp = e.path[e.waypoint];
        const hit = this.structureInReach(e, wp);
        if (e.queued && !hit) e.queueClock += dt; else e.queueClock = 0;
        if (hit) {
          this.beginBreaking(e, hit);
        } else if (!e.target?.alive && (e.queued || !wp) && this.castleInReach(e)) {
          e.state = "ATTACKING";
          e.attackTimer = 0.3;
          if (castle) e.heading = Math.atan2(castle.position.x - e.position.x, castle.position.z - e.position.z);
          this.animation.setState(e, "ATTACKING");
        } else if (e.waitingFull) {
          // a construção do caminho está lotada: não anda para dentro dela; refaz o caminho (outro trecho)
          if (this.clock >= e.replanAt) { e.replanAt = this.clock + 0.5; this.plan(e); }
          e.heading = Math.atan2(e.waitingFull.position.x - e.position.x, e.waitingFull.position.z - e.position.z);
        } else if (e.flank || (e.queueClock > (COLLISION.flankDelay ?? 0.5) && this.tryFlank(e, wp))) {
          this.followFlank(e, dt);                 // na fila e sem alcance: vai atacar por outro lado
        } else if (!wp) {
          // terminou o caminho mas ainda não alcança nada (foi empurrado): refaz o caminho
          if (this.clock >= e.replanAt) { e.replanAt = this.clock + 0.5; this.plan(e); }
        } else {
          const dx = wp.x - e.position.x, dz = wp.z - e.position.z;
          const dist = Math.hypot(dx, dz);
          const step = e.speed * e.followFactor * this.map.speedAt(e.position) * dt;   // terreno (lama) e fila afetam a velocidade
          if (dist <= step) {
            e.position.x = wp.x; e.position.z = wp.z; e.waypoint++;
          } else {
            e.position.x += (dx / dist) * step;
            e.position.z += (dz / dist) * step;
            const target = Math.atan2(dx, dz);
            const diff = ((target - e.heading + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
            e.heading += diff * Math.min(1, dt * 10);
          }
          e.distanceToGoal = this.goalDistance(e);
        }
      } else if (e.state === "BREAKING") {
        const t = e.target;
        if (!t || !t.alive) {                      // a construção caiu: volta a andar
          e.target = null;
          e.state = "WALKING";
          e.retargetTimer = 0;
          this.animation.setState(e, "WALKING");
          this.plan(e);
        } else {
          if (this.towerEdgeDist(e.position.x, e.position.z, t) > this.reachOf(e) + 0.5) {   // empurrado para longe: reaproxima
            e.state = "WALKING";
            e.retargetTimer = 0;
            this.animation.setState(e, "WALKING");
            this.plan(e);
            continue;
          }
          e.heading = Math.atan2(t.position.x - e.position.x, t.position.z - e.position.z);
          e.distanceToGoal = this.goalDistance(e);
          e.attackTimer -= dt;
          if (e.attackTimer <= 0) {
            this.combat.enemyAttackStructure(e, t);
            e.attackTimer = e.attack.cooldown;
          }
        }
      } else if (e.state === "ATTACKING") {
        e.distanceToGoal = 0;
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          this.combat.enemyAttack(e);
          e.attackTimer = e.attack.cooldown;
        }
      }

    }

    if (COLLISION.enabled !== false) { this.separate(dt); this.detectStuck(dt); }

    for (const e of list) {
      if (e.state === "DYING") continue;
      this.scene.setPosition(e.object3D, e.position.x, 0, e.position.z);
      this.scene.setRotation(e.object3D, e.heading);
    }
  }

  remainingDistance(e) {
    let total = 0, px = e.position.x, pz = e.position.z;
    for (let i = e.waypoint; i < e.path.length; i++) {
      total += Math.hypot(e.path[i].x - px, e.path[i].z - pz);
      px = e.path[i].x; pz = e.path[i].z;
    }
    return total;
  }
}

/* ------------------------------- Torres ------------------------------- */
const HEAL_FADE = 0.3;      // abaixo dessa fração de energia o laser da torre de restauração vai ficando transparente

export class TowerSystem {
  constructor({ scene, entities, combat, economy, emit }) {
    Object.assign(this, { scene, entities, combat, economy, emit });
    this.castleTimer = 0;
    this.clock = 0;
  }

  // Renda do castelo: pequena e constante (GAME_CONFIG.castleIncome). Nunca deixa o jogador totalmente sem moedas.
  updateCastleIncome(dt) {
    const inc = GAME_CONFIG.castleIncome;
    const castle = this.entities.castle;
    if (!inc || !castle || !castle.alive || !(inc.interval > 0)) return;
    this.castleTimer += dt;
    if (this.castleTimer < inc.interval) return;
    this.castleTimer %= inc.interval;
    this.economy.earn(inc.amount);
    this.emit?.("castleIncome", { castle, amount: inc.amount });
  }

  // Alvo: o inimigo no alcance que está mais perto do castelo.
  pickTarget(tower) {
    let best = null;
    for (const e of this.entities.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - tower.position.x, e.position.z - tower.position.z);
      if (d > tower.range) continue;
      if (!best || e.distanceToGoal < best.distanceToGoal) best = e;
    }
    return best;
  }

  // Torre de restauração: escolhe a construção ferida ao alcance com MENOR fração de vida (a mais perto de cair)
  // e, enquanto ela estiver ligada, devolve `healAmount` de vida a cada `healInterval` segundos.
  // Só troca de alvo se outro estiver bem pior (histerese), para o laser não ficar pulando entre duas construções.
  // Alvo ATUAL do laser: continua válido enquanto estiver ferido OU tiver sido ferido há menos de `linger` s.
  holdable(h, t) {
    if (!t || t === h || !t.alive || !t.built) return false;
    if (Math.hypot(t.position.x - h.position.x, t.position.z - h.position.z) > h.healRange) return false;
    return t.health < t.maxHealth || this.clock - (t.hurtAt ?? -Infinity) < (GAME_CONFIG.healer?.linger ?? 2.5);
  }

  healable(h, t) {
    return t && t !== h && t.alive && t.built && t.health < t.maxHealth &&
      Math.hypot(t.position.x - h.position.x, t.position.z - h.position.z) <= h.healRange;
  }

  updateHealer(h, dt) {
    const stopBeam = () => {
      if (!h.healTarget) return;
      h.healTarget = null;
      h.healTimer = 0;
      this.emit?.("healBeam", { tower: h, target: null });
    };

    // SUPERAQUECIDA: laser desligado; recupera até `healResume` e volta a funcionar.
    if (h.healOverheated) {
      stopBeam();
      h.healEnergy = Math.min(1, h.healEnergy + dt / h.healRecharge);
      if (h.healEnergy >= h.healResume) h.healOverheated = false;
      h.healPower = 0;
      this.crystal(h, dt);
      return;
    }

    h.healRetarget -= dt;
    const cur = h.healTarget;
    const curOk = this.holdable(h, cur);
    if (!curOk || h.healRetarget <= 0) {
      h.healRetarget = 0.25;
      let best = null, bestRatio = Infinity;
      for (const t of this.entities.towers) {
        if (!this.healable(h, t)) continue;
        const ratio = t.health / t.maxHealth;
        if (ratio < bestRatio) { bestRatio = ratio; best = t; }
      }
      if (curOk && (!best || bestRatio > cur.health / cur.maxHealth - 0.15)) best = cur;
      if (best !== cur) {
        h.healTarget = best;
        h.healTimer = 0;
        this.emit?.("healBeam", { tower: h, target: best });
      }
    }

    const target = h.healTarget;
    if (!target) {                               // REPOUSO: a energia volta, mesmo sem ter esgotado
      h.healEnergy = Math.min(1, h.healEnergy + dt / h.healRecharge);
      h.healPower = 1;
      this.crystal(h, dt);
      return;
    }

    // CURANDO: gasta energia (só quando há vida para curar; em "espera" o laser fica ligado sem gastar); ao zerar, superaquece.
    const hurt = target.health < target.maxHealth;
    if (hurt) h.healEnergy = Math.max(0, h.healEnergy - dt / h.healDuration);
    h.healPower = Math.min(1, h.healEnergy / HEAL_FADE);        // laser some aos poucos nos últimos 30%
    this.scene.setTurretYaw(h.object3D, Math.atan2(target.position.x - h.position.x, target.position.z - h.position.z));
    h.healTimer += dt;
    while (h.healTimer >= h.healInterval) {
      h.healTimer -= h.healInterval;
      if (target.health >= target.maxHealth) continue;   // nada a curar: sem pulso, sem brilho
      target.health = Math.min(target.maxHealth, target.health + h.healAmount);
      h.healPulse = 1;
    }
    this.scene.setHealthBar(target.object3D, target.health / target.maxHealth);
    if (h.healEnergy <= 0) { h.healOverheated = true; h.healPower = 0; stopBeam(); }
    this.crystal(h, dt);
  }

  // Cristal do modelo: some enquanto superaquecida e reaparece ao recuperar `healResume` de energia.
  crystal(h, dt) {
    this.scene.updateCrystal?.(h.object3D, h.healEnergy, !h.healOverheated, dt);
  }

  update(dt) {
    this.clock += dt;
    for (const t of this.entities.towers) {          // marca o instante do último dano (usado pela torre de restauração)
      if (t.lastHealth !== undefined && t.health < t.lastHealth) t.hurtAt = this.clock;
      t.lastHealth = t.health;
    }
    this.updateCastleIncome(dt);
    for (const tower of this.entities.towers) {
      if (!tower.built) {               // em obra: só avança o relógio; não ataca
        if (tower.advanceBuild(dt)) this.emit?.("structureBuilt", { tower });
        continue;
      }
      if (tower.trap) {                 // armadilha: dispara quando um inimigo vivo chega perto
        const r = tower.trap.triggerRadius ?? 1;
        const trigger = this.entities.enemies.some((e) =>
          e.alive && Math.hypot(e.position.x - tower.position.x, e.position.z - tower.position.z) <= r);
        if (trigger) {
          tower.alive = false;          // uso único: evita disparar duas vezes
          this.combat.detonate(tower);
          this.emit?.("trapTriggered", { tower });
        }
        continue;
      }
      if (tower.healer) { this.updateHealer(tower, dt); continue; }
      if (tower.mining && tower.mineInterval > 0) {   // mina: entrega moedas de tempo em tempo
        tower.mineTimer += dt;
        if (tower.mineTimer >= tower.mineInterval) {
          tower.mineTimer %= tower.mineInterval;
          this.economy.earn(tower.mineAmount);
          this.emit?.("mineProduced", { tower, amount: tower.mineAmount });
        }
        continue;
      }
      if (!tower.attacks) continue;     // muro: não ataca
      tower.cooldownTimer = Math.max(0, tower.cooldownTimer - dt);

      const t = tower.target;
      const stillValid = t && t.alive &&
        Math.hypot(t.position.x - tower.position.x, t.position.z - tower.position.z) <= tower.range;
      if (!stillValid) tower.target = this.pickTarget(tower);

      const target = tower.target;
      if (!target) continue;

      const yaw = Math.atan2(target.position.x - tower.position.x, target.position.z - tower.position.z);
      this.scene.setTurretYaw(tower.object3D, yaw);

      if (tower.cooldownTimer <= 0) {
        this.combat.fire(tower, target);
        tower.cooldownTimer = tower.cooldown;
      }
    }
  }
}

/* -------------------------------- Ondas ------------------------------- */
// Ondas infinitas: cada onda é calculada a partir da lista de inimigos de ENEMIES (veja ENDLESS em Data.js).
export class WaveSystem {
  constructor({ entities, enemySystem, map, economy, emit }) {
    Object.assign(this, { entities, enemySystem, map, economy, emit });
    this.reset();
  }

  // Inimigos do mais fraco ao mais forte. `tier` (opcional, em ENEMIES) manda; sem ele vale a vida.
  // Calculado a cada onda, então inimigos novos entram na conta sozinhos.
  tiers() {
    return Object.values(ENEMIES)
      .map((d, i) => ({ id: d.id, power: d.tier ?? d.health, i }))
      .sort((a, b) => a.power - b.power || a.i - b.i)
      .map((t) => t.id);
  }

  // Quantos inimigos de cada nível na onda n (lista na ordem fraco → forte).
  // Onda em que o tier k entra: o 1º tier novo vem `first` ondas depois do anterior, o seguinte `first + step`, etc.
  // Com first 2 e step 1: tiers entram nas ondas 1, 3, 6, 10, 15, 21, 28, 36, 45, 55.
  unlockWave(k) {
    const { first = 2, step = 1 } = ENDLESS.tierGap ?? {};
    return 1 + k * first + step * (k * (k - 1)) / 2;
  }

  // Depois de entrar, o tier k ganha +1 inimigo a cada (groupSize + k) ondas: quanto mais forte, mais devagar cresce.
  composition(n) {
    const g = Math.max(1, ENDLESS.groupSize ?? 2);
    return this.tiers().map((id, k) => {
      if (k === 0) return { id, count: n };
      const unlock = this.unlockWave(k);
      return { id, count: n < unlock ? 0 : Math.floor((n - unlock) / (g + k)) + 1 };
    });
  }

  // Onda n: fila de inimigos em ordem ALEATÓRIA (qualquer nível pode nascer a qualquer momento),
  // intervalo entre eles e bônus em moedas.
  compose(n) {
    // Blocos de até ROUTING.groupSize inimigos da MESMA classe: cada bloco nasce junto e anda junto.
    // A ordem dos blocos é aleatória.
    const G = ROUTING.groupSize;
    const chunks = [];
    for (const { id, count } of this.composition(n)) {
      for (let left = count; left > 0; left -= G) chunks.push(Array(Math.min(G, left)).fill(id));
    }
    for (let i = chunks.length - 1; i > 0; i--) {          // embaralha os blocos (Fisher-Yates)
      const j = Math.floor(Math.random() * (i + 1));
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    const enemies = chunks.flat();
    const si = ENDLESS.spawnInterval;
    return {
      enemies,
      spawnInterval: Math.max(si.min, si.start * Math.pow(si.decay, n - 1)),
      reward: Math.round(ENDLESS.bonus.base + ENDLESS.bonus.perWave * n)
    };
  }

  reset() {
    this.started = 0;        // quantas ondas já começaram
    this.active = false;
    this.queue = [];
    this.timer = 0;
    this.interval = 1;
    this.bonus = 0;
    this.spawnCursor = 0;
    this.lastType = null;    // para agrupar: um bloco inteiro nasce no mesmo spawn
    this.inGroup = 0;
    this.nextIn = this.delayFor(0);   // segundos até a próxima onda começar sozinha
  }

  // Espera antes da onda de índice `index`: a primeira usa firstWaveDelay; as demais firstDelay + delayStep × índice (até maxDelay).
  delayFor(index) {
    const t = GAME_CONFIG.waveTiming;
    if (index === 0) return t.firstWaveDelay ?? t.firstDelay;
    return Math.min(t.maxDelay ?? Infinity, t.firstDelay + t.delayStep * index);
  }

  // Segundos restantes até a próxima onda (null se há onda ativa).
  get countdown() {
    return this.active ? null : Math.max(0, this.nextIn);
  }

  canStart() { return !this.active; }

  start() {
    if (!this.canStart()) return false;
    const wave = this.compose(++this.started);
    this.enemySystem.planner.startWave(this.composition(this.started));   // grupos e memória de rotas
    this.queue = [...wave.enemies];
    this.interval = wave.spawnInterval;
    this.bonus = wave.reward;
    this.timer = 0.6;
    this.active = true;
    this.emit("waveStarted", { number: this.started });
    return true;
  }

  update(dt) {
    if (!this.active) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) this.start();
      return;
    }

    if (this.queue.length) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const spawns = this.map.getSpawnPoints();
        const type = this.queue[0];
        if (type !== this.lastType || this.inGroup >= ROUTING.groupSize) {   // novo bloco → próximo spawn
          this.spawnCursor++; this.inGroup = 0; this.lastType = type;
        }
        this.inGroup++;
        const cell = spawns[this.spawnCursor % spawns.length];
        this.enemySystem.spawn(this.queue.shift(), cell);
        this.timer = this.interval;
      }
    } else if (this.entities.enemies.every((e) => !e.alive)) {
      this.active = false;
      this.nextIn = this.delayFor(this.started);   // espera da próxima onda
      this.economy.earn(this.bonus);
      this.emit("waveCompleted", { number: this.started, bonus: this.bonus });
    }
  }
}