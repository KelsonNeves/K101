/* ==========================================================================
   Sfx.js — diretor de som da partida.
   "Que som esse acontecimento faz?"
   Traduz o que acontece no jogo (eventos dos Systems + estado das entidades) em chamadas ao
   Audio.js. Não tem regras de jogo e não mexe em nada: só ouve.
   - Eventos pontuais (tiro, golpe, morte…) chegam pelos métodos abaixo, chamados pelo Game.handleEvent.
   - Sons que dependem de estado contínuo (passos, martelada da obra, laser de cura, alarme do
     castelo) são verificados todo frame em update(dt).
   Todos os nomes de som e perfis de inimigos vêm de AUDIO (Data.js).
   ========================================================================== */
import { AUDIO, ENEMIES } from "./Data.js";
import { Sound } from "./Audio.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HAMMER_EVERY = [0.45, 0.8];      // s entre marteladas de uma obra
const ALARM_EVERY = 2.4;               // s entre bipes com o castelo quase caindo
const ALARM_BELOW = 0.25;              // fração de vida do castelo
const HEAVY_STRUCT_HIT = 50;           // dano por golpe a partir do qual o golpe soa "pesado"

const profiles = new Map();
function profileOf(type) {
  let p = profiles.get(type);
  if (p) return p;
  const data = ENEMIES[type];
  const cfg = AUDIO.enemies[type] ?? {};
  const size = cfg.size ?? (data?.health >= 1000 ? "big" : data?.health >= 200 ? "medium" : "small");
  p = {
    size,
    pitch: cfg.pitch ?? 1,
    stride: cfg.stride ?? AUDIO.strides[size],
    ...AUDIO.enemySounds[size]
  };
  profiles.set(type, p);
  return p;
}

export class SoundDirector {
  constructor({ entities }) {
    this.entities = entities;
    this.steps = new Map();      // inimigo → { x, z, dist }
    this.hammer = new Map();     // construção → s até a próxima martelada
    this.healState = new Map();  // torre de restauração → estava superaquecida?
    this.alarm = 0;
  }

  /* --------------------------- eventos pontuais --------------------------- */
  enemySpawned(e) {
    const p = profileOf(e.type);
    if (p.spawn) Sound.play(p.spawn, { x: e.position.x, y: 1, z: e.position.z, pitch: p.pitch, volume: 0.7 });
  }

  enemyDied(e) {
    const p = profileOf(e.type);
    Sound.play(p.death, { x: e.position.x, y: 1, z: e.position.z, pitch: p.pitch });
    this.steps.delete(e);
  }

  // Golpe de um inimigo numa construção: pancada + (às vezes) um grunhido.
  enemyHitStructure(e, tower) {
    const p = profileOf(e.type);
    const heavy = e.attack.structureDamage >= HEAVY_STRUCT_HIT;
    Sound.play(heavy ? "golpe_construcao_pesado" : "golpe_construcao", { x: tower.position.x, y: 1, z: tower.position.z });
    if (Math.random() < 0.4) Sound.play(p.attack, { x: e.position.x, y: 1, z: e.position.z, pitch: p.pitch });
  }

  // Golpe no castelo: som global forte + o grunhido de quem bateu.
  castleHit(e, castle) {
    if (castle) Sound.play("castelo_dano", { x: castle.position.x, y: 1, z: castle.position.z });
    else Sound.play("castelo_dano");
    if (e && Math.random() < 0.5) {
      const p = profileOf(e.type);
      Sound.play(p.attack, { x: e.position.x, y: 1, z: e.position.z, pitch: p.pitch });
    }
  }

  towerFired(tower) {
    const s = AUDIO.projectiles[tower.projectile];
    if (s?.shoot) Sound.play(s.shoot, { x: tower.position.x, y: tower.muzzleHeight, z: tower.position.z });
  }

  // Impacto de projétil. Área maior = explosão mais forte (e um pouco mais grave).
  projectileImpact({ kind, pos, splash }) {
    const s = AUDIO.projectiles[kind];
    if (!s?.impact) return;
    const big = splash > 0 ? clamp(0.7 + splash * 0.1, 0.7, 1.2) : 1;
    Sound.play(s.impact, { x: pos.x, y: pos.y, z: pos.z, volume: big, pitch: splash > 0 ? 1.1 - splash * 0.08 : 1 });
  }

  structureBuilt(tower) {
    const cfg = AUDIO.towers[tower.type];
    Sound.play(cfg?.built ?? "obra_pronta", { x: tower.position.x, y: 1, z: tower.position.z });
    this.hammer.delete(tower);
  }

  mineProduced(tower) {
    const id = AUDIO.towers[tower.type]?.produce;
    if (id) Sound.play(id, { x: tower.position.x, y: tower.muzzleHeight, z: tower.position.z });
  }

  trapExploded(tower) {
    const id = AUDIO.towers[tower.type]?.explode ?? "barril_explosao";
    Sound.play(id, { x: tower.position.x, y: 0.6, z: tower.position.z });
  }

  /* --------------------------- estado contínuo --------------------------- */
  update(dt) {
    this.updateSteps();
    this.updateConstruction(dt);
    this.updateHealers();
    this.updateCastleAlarm(dt);
  }

  // Passos: um por "passada" de distância percorrida (inimigo parado não faz barulho).
  updateSteps() {
    const list = this.entities.enemies;
    let walking = 0;
    for (const e of list) if (e.alive && e.state === "WALKING") walking++;
    const crowd = 1 / (1 + 0.035 * walking);       // multidão: cada passo individual fica mais baixo

    for (const e of list) {
      if (!e.alive || e.state !== "WALKING") { this.steps.delete(e); continue; }
      const p = profileOf(e.type);
      let s = this.steps.get(e);
      if (!s) { s = { x: e.position.x, z: e.position.z, dist: Math.random() * p.stride }; this.steps.set(e, s); }
      s.dist += Math.hypot(e.position.x - s.x, e.position.z - s.z);
      s.x = e.position.x; s.z = e.position.z;
      if (s.dist >= p.stride) {
        s.dist -= p.stride;
        Sound.play(p.step, { x: s.x, y: 0, z: s.z, volume: crowd, pitch: p.pitch });
      }
    }
  }

  // Obra: martelada de tempos em tempos enquanto a construção não termina.
  updateConstruction(dt) {
    for (const t of this.entities.towers) {
      if (!t.alive || t.built) { this.hammer.delete(t); continue; }
      const left = (this.hammer.get(t) ?? Math.random() * HAMMER_EVERY[1]) - dt;
      if (left <= 0) {
        Sound.play("obra_martelada", { x: t.position.x, y: 1, z: t.position.z });
        this.hammer.set(t, HAMMER_EVERY[0] + Math.random() * (HAMMER_EVERY[1] - HAMMER_EVERY[0]));
      } else this.hammer.set(t, left);
    }
  }

  // Torre de restauração: laser em loop enquanto cura (volume acompanha a intensidade do laser);
  // sons de superaquecimento e de volta ao normal.
  updateHealers() {
    const seen = new Set();
    for (const t of this.entities.towers) {
      if (!t.alive || !t.healer || !t.built) continue;
      const cfg = AUDIO.towers[t.type] ?? {};
      const key = `heal:${t.uid}`;

      if (cfg.loop && t.healTarget && !t.healOverheated && t.healPower > 0.02) {
        seen.add(key);
        Sound.loop(key, cfg.loop, {
          x: t.position.x, y: t.muzzleHeight, z: t.position.z,
          volume: t.healPower, pitch: 1 + 0.06 * (t.level - 1)    // evoluir deixa o laser mais agudo
        });
      }

      const was = this.healState.get(t) ?? false;
      if (t.healOverheated && !was && cfg.overheat) Sound.play(cfg.overheat, { x: t.position.x, y: t.muzzleHeight, z: t.position.z });
      if (!t.healOverheated && was && cfg.ready) Sound.play(cfg.ready, { x: t.position.x, y: t.muzzleHeight, z: t.position.z });
      this.healState.set(t, t.healOverheated);
    }
    for (const key of [...Sound.loops.keys()]) {          // laser sem alvo / torre destruída: para
      if (key.startsWith("heal:") && !seen.has(key)) Sound.stopLoop(key);
    }
  }

  // Castelo quase caindo: bipe de alerta repetido.
  updateCastleAlarm(dt) {
    const c = this.entities.castle;
    if (!c || c.health <= 0 || c.health / c.maxHealth >= ALARM_BELOW) { this.alarm = 0; return; }
    this.alarm -= dt;
    if (this.alarm <= 0) { Sound.play("castelo_alarme"); this.alarm = ALARM_EVERY; }
  }

  // Fim da partida / reinício: nada pode continuar tocando.
  dispose() {
    Sound.stopLoops("heal:");
    this.steps.clear();
    this.hammer.clear();
    this.healState.clear();
  }
}