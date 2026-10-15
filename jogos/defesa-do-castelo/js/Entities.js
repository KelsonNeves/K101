/* ==========================================================================
   Entities.js — estado dos objetos do jogo. Sem regras, sem carregar GLB.
   "Quais objetos existem agora?"
   ========================================================================== */

import { GAME_CONFIG } from "./Data.js";

let nextUid = 1;

export class Entity {
  constructor(object3D = null) {
    this.uid = nextUid++;
    this.position = { x: 0, y: 0, z: 0 };
    this.object3D = object3D;      // referência visual (criada pelo Scene)
    this.alive = true;
  }
}

export class Enemy extends Entity {
  constructor(data, object3D) {
    super(object3D);
    this.type = data.id;
    this.name = data.name;
    this.maxHealth = data.health;
    this.health = data.health;
    this.baseSpeed = data.speed;
    this.reward = data.reward;
    this.attack = { ...data.attack };
    this.attack.structureDamage = data.attack.structureDamage ?? data.attack.damage;   // dano contra construções
    this.structurePreference = data.structurePreference ?? 0;   // 0 = só quebra o necessário … 1 = caça construções
    this.target = null;            // construção que está perseguindo/atacando
    this.retargetTimer = 0;
    this.targetSince = -Infinity;  // quando o alvo atual foi escolhido (relógio do EnemySystem)
    this.targetLock = 0;           // até quando a escolha de alvo fica travada (anti vai-e-vem)
    this.switchLog = [];           // momentos das últimas trocas de alvo
    this.skip = new Map();         // uid de construção → até quando ela é ignorada (ex.: inalcançável)

    this.routeKey = null;          // grupo de rota (tipo + spawn) — veja Routes.js
    this.routeRank = 0;            // 0 = melhor rota, 1 = segunda melhor …
    this.routeStart = null;

    this.state = "WALKING";        // WALKING | ATTACKING (castelo) | BREAKING (construção) | DYING
    this.path = [];                // waypoints em coordenadas 3D
    this.waypoint = 0;
    this.jitter = { x: 0, z: 0 };
    this.heading = 0;
    this.distanceToGoal = Infinity;
    this.attackTimer = 0;
    this.deathTimer = 0;
    this.deathDuration = 0;
    this.slowFactor = 1;
    this.slowTimer = 0;

    // Colisão entre inimigos (veja GAME_CONFIG.collision)
    this.radius = data.collisionRadius ?? GAME_CONFIG.collision?.radius ?? 0.5;
    this.followFactor = 1;         // < 1 quando acompanha o ritmo de um colega de grupo à frente (fila indiana)
    this.queued = false;           // true se está encostado em um inimigo que já está atacando (fila)
    this.ghostUntil = 0;           // até quando atravessa os outros inimigos (anti-travamento)
    this.stuckClock = 0;           // tempo acumulado desde a última checagem de progresso
    this.lastPos = null;           // posição da última checagem de progresso
    this.queueClock = 0;           // s na fila sem alcance (dispara a busca por outro lado do alvo)
    this.waitingFull = null;       // construção ao alcance, mas já lotada: espera/desvia em vez de atacar
    this.flank = null;             // { pts, i, until }: caminho curto até outro ponto de ataque
    this.flankCooldown = 0;        // até quando não procura outro lado de novo
    this.replanAt = 0;             // limita o replanejamento de quem terminou o caminho fora de alcance
  }
  get speed() { return this.baseSpeed * this.slowFactor; }
}

export class Tower extends Entity {
  constructor(data, row, col, startLevel = 1) {
    super();
    this.type = data.id;
    this.name = data.name;
    this.cost = data.cost;
    this.footprint = data.footprint;
    this.row = row;
    this.col = col;
    this.maxHealth = data.health ?? 100;
    this.health = this.maxHealth;
    this.repairRate = data.repairRate ?? GAME_CONFIG.repairRate ?? 0.4;
    this.muzzleHeight = (data.muzzleHeight ?? 2) * (GAME_CONFIG.modelScale?.structures ?? 1);   // acompanha a escala visual

    const c = data.combat ?? {};     // construções sem `combat` (ex.: muro) não atacam
    this.attacks = !!data.combat;
    this.wall = data.wall ?? null;   // config de ligação entre muros (Data.js)
    this.damage = c.damage ?? 0;
    this.range = c.range ?? 0;
    this.cooldown = c.cooldown ?? 0;
    this.projectile = c.projectile ?? null;
    this.projectileSpeed = c.projectileSpeed ?? 0;
    this.splash = c.splash ?? 0;
    this.maxPerTarget = c.maxPerTarget ?? 0;   // dano em área: máximo tirado de cada inimigo (0 = sem limite)
    this.arc = c.arc ?? 0;
    this.slow = c.slow ?? 0;
    this.slowDuration = c.slowDuration ?? 0;

    // Mina: entrega `mineAmount` moedas a cada `mineInterval` segundos (só depois da obra).
    this.mining = !!data.mining;
    this.mineAmount = data.mining?.amount ?? 0;
    this.mineInterval = data.mining?.interval ?? 0;
    this.mineTimer = 0;

    // Torre de restauração: laser contínuo que devolve `healAmount` de vida a cada `healInterval` s à construção mais ferida.
    this.healer = !!data.heal;
    this.healRange = data.heal?.range ?? 0;
    this.healAmount = data.heal?.amount ?? 0;
    this.healInterval = data.heal?.interval ?? 1;
    this.healTimer = 0;
    this.healTarget = null;
    this.healRetarget = 0;
    this.healDuration = data.heal?.duration ?? 8;    // s de cura contínua com energia cheia
    this.healRecharge = data.heal?.recharge ?? 10;   // s para recarregar de 0 a 100%
    this.healResume = data.heal?.resume ?? 0.5;      // fração de energia para voltar a funcionar após superaquecer
    this.healColor = data.heal?.color ?? 0x57d98a;   // cor do laser neste nível
    this.healEnergy = 1;                             // 0 a 1
    this.healOverheated = false;
    this.healPower = 1;                              // 0 a 1: intensidade do laser (cai quando a energia está acabando)
    this.healPulse = 0;            // 1 no instante de um pulso de cura (o laser brilha e decai)

    // Armadilha (barril): oculta para os inimigos; explode uma vez quando um inimigo chega perto.
    this.hidden = !!data.hidden;
    this.trap = data.trap ? { ...data.trap } : null;

    this.cooldownTimer = 0;
    this.target = null;

    // Obra: 0 → 1. Enquanto < 1, a construção não ataca, não evolui e (muro) não se liga aos vizinhos.
    this.buildTime = Math.max(0, data.buildTime ?? GAME_CONFIG.buildTime ?? 0);
    this.buildProgress = this.buildTime > 0 ? 0 : 1;

    // Evolução: níveis de 1 a maxLevel. `invested` = tudo que o jogador gastou nesta torre.
    this.upgrades = data.upgrades ?? [];
    this.level = 1;
    this.maxLevel = 1 + this.upgrades.length;
    this.invested = data.cost;
    this.visualKey = JSON.stringify([data.model, data.fallback]);   // visual em uso (muda quando uma evolução traz outro modelo/cor)

    // Já nasce evoluída (ex.: muro novo ligado a um grupo de muros nível 3). `invested` soma base + cada evolução.
    while (this.level < startLevel && this.applyUpgrade());
  }

  get built() { return this.buildProgress >= 1; }

  // Avança a obra. Retorna true no frame em que ela termina.
  advanceBuild(dt) {
    if (this.built) return false;
    this.buildProgress = Math.min(1, this.buildProgress + dt / this.buildTime);
    return this.built;
  }

  // Preço para recuperar toda a vida que falta (0 se já está cheia). Proporcional ao que foi investido.
  repairCost() {
    const missing = 1 - this.health / this.maxHealth;
    if (missing <= 0.0001) return 0;
    return Math.max(1, Math.ceil(this.invested * this.repairRate * missing));
  }

  // Próxima evolução (ou null no nível máximo).
  nextUpgrade() { return this.upgrades[this.level - 1] ?? null; }

  // Aplica os valores do próximo nível. O pagamento é feito por quem chama.
  applyUpgrade() {
    const u = this.nextUpgrade();
    if (!u) return false;
    for (const k of ["damage", "range", "cooldown", "splash", "maxPerTarget", "projectileSpeed", "slow", "slowDuration", "healRange", "healAmount", "healInterval", "healDuration", "healRecharge", "healColor"]) {
      if (u[k] !== undefined) this[k] = u[k];
    }
    if (u.amount !== undefined) this.mineAmount = u.amount;
    if (u.interval !== undefined) this.mineInterval = u.interval;
    if (u.health !== undefined) {                 // vida nova: mantém o dano já sofrido
      const delta = u.health - this.maxHealth;
      this.maxHealth = u.health;
      this.health = Math.min(this.maxHealth, Math.max(1, this.health + delta));
    }
    this.invested += u.cost;
    this.level++;
    return true;
  }
}

export class Projectile extends Entity {
  constructor(tower, target, start) {
    super();
    this.kind = tower.projectile;
    this.damage = tower.damage;
    this.speed = tower.projectileSpeed;
    this.splash = tower.splash;
    this.maxPerTarget = tower.maxPerTarget;
    this.arc = tower.arc;
    this.slow = tower.slow;
    this.slowDuration = tower.slowDuration;
    this.target = target;
    this.targetPos = { x: target.position.x, y: 0.9, z: target.position.z };
    this.position = { x: start.x, y: start.y, z: start.z };
    this.startY = start.y;
    this.origin = { x: start.x, z: start.z };   // de onde saiu o tiro (a boca da torre): define a prioridade do dano em área
    this.startDist = Math.max(0.01, Math.hypot(this.targetPos.x - start.x, this.targetPos.z - start.z));
  }
}

export class Castle extends Entity {
  constructor({ health, x, z, cells }) {
    super();
    this.maxHealth = health;
    this.health = health;
    this.position = { x, y: 0, z };
    this.cells = cells;
  }
}

// Registro central das entidades vivas na partida.
export class EntityStore {
  constructor() { this.clear(); }
  clear() {
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.castle = null;
  }
}