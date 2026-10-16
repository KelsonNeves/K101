// Game.js — máquina de estados, loop, ciclo das ferramentas, relógio, pausa e ponte com window.K101.
// Não desenha nada: quem desenha são Scene/Plants/Cursor/Vfx (3D) e UI/SkillTree (HTML).
import { MAX_CELLS, TOOLS, RADIAL_TIME_SCALE, STAT_KEYS } from './Data.js';
import { CROPS } from './Crops.js';
import { SKILLS, SKILL_BY_ID, validateSkills } from './Skills.js';
import { computeStats } from './Stats.js';
import { ITEM_BY_ID, SHOP_ITEMS, validateShop } from './Shop.js';
import { layoutFields, neighbors } from './Fields.js';
import { DroneSwarm } from './Drones.js';
import { Grid } from './Grid.js';
import { Scene } from './Scene.js';
import { PlantRenderer } from './Plants.js';
import { Cursor } from './Cursor.js';
import { Input } from './Input.js';
import { RadialMenu } from './RadialMenu.js';
import { Vfx } from './Vfx.js';
import { Save } from './Save.js';
import { Sound } from './Audio.js';

// Regra de visibilidade da árvore: a única que decide o que aparece.
// `needs` = item da loja exigido (ex.: a fila «Terra do arado 1» só aparece depois de comprar o Arado 1).
export const isVisible = (g, s) => (s.parent === null || g.owned.has(s.parent)) && (!s.needs || g.owned.has(s.needs));
export const visibleIds = (g) => SKILLS.filter((s) => isVisible(g, s)).map((s) => s.id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor({ ui, models, droneModels }) {
    this.ui = ui;
    this.canvas = document.getElementById('c');
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    validateSkills(SKILLS, CROPS, STAT_KEYS, new Set(SHOP_ITEMS.map((i) => i.id)));
    validateShop();

    this.scene = new Scene(this.canvas);
    this.plants = new PlantRenderer(this.scene.scene, models, MAX_CELLS);
    this.grid = new Grid({ reduceMotion: this.reduceMotion });
    this.vfx = new Vfx(this.scene);
    this.save = new Save(this);
    this.radial = new RadialMenu(this);
    this.input = new Input(this.canvas, this);
    this.cursor = new Cursor(this);

    // Estado persistente
    this.day = 1; this.money = 0; this.owned = new Set(); this.best = { earned: 0, day: 0 };
    this.S = computeStats(this.owned);
    this.fields = layoutFields(this.S);   // [principal, ...arados comprados]
    this.activeField = 0;                 // campo em vista
    this.drones = new DroneSwarm(this, droneModels);

    // Estado do dia
    this.state = 'LOADING';
    this.paused = false;
    this.charge = 0;                 // segundos de carga do ciclo da ferramenta (só enche com o ponteiro pressionado)
    this.fired = false;              // avisa o Cursor que a ferramenta acabou de ser usada
    this.selection = { tool: 'plant', crop: 'trigo' };
    this.timeLeft = 0; this.countdown = 0; this.ending = 0;
    this.dayHarvest = {}; this.dayMoney = 0; this.fireValue = 0;
    this.lastTick = -1; this.last = undefined;
    this.playedDay = 1;

    this.hasSave = false;
    const saved = this.save.read();
    if (saved) this.applySave(saved);

    this.installPlatform();
    this.installKeys();
    addEventListener('resize', () => this.scene.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.scene.resize(), 150));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });

    this.ui.bind(this);
    this.scene.updateSoil([], null);
    this.start();
  }

  applySave(d) {
    this.day = d.day; this.money = d.money; this.owned = new Set(d.owned); this.best = d.best;
    this.S = computeStats(this.owned);
    this.hasSave = true;
  }

  /* ----------------------------- plataforma K101 ----------------------------- */
  installPlatform() {
    const on = (name, fn) => window.addEventListener(`k101:${name}`, fn);
    this.muteSources = new Set();
    const mute = (src, active) => {
      active ? this.muteSources.add(src) : this.muteSources.delete(src);
      Sound.setExternalMute(this.muteSources.size > 0);   // só religa quando ninguém pede silêncio
    };
    on('ad:start',     () => { this.pause(); mute('ad', true); });
    on('ad:end',       () => mute('ad', false));          // segue pausado até o jogador voltar
    on('exit:open',    () => { this.pause(); mute('exit', true); });
    on('exit:cancel',  () => mute('exit', false));        // segue pausado
    on('exit:confirm', () => this.save.write());          // SÓ código síncrono
    on('fullscreen:change', () => this.scene.resize());
  }

  /* ----------------------------------- loop ----------------------------------- */
  start() { this.scene.renderer.setAnimationLoop((t) => this.tick(t)); }

  timeScale() { return this.radial.isOpen ? RADIAL_TIME_SCALE : 1; }

  tick(t) {
    const dt = Math.min(0.05, (t - (this.last ?? t)) / 1000);
    this.last = t;
    const frozen = this.paused || window.K101?.blocked;
    if (this.state === 'DAY' && !frozen) this.updateDay(dt * this.timeScale(), dt);
    this.drones.updateHover();         // drone sob o mouse (o Cursor precisa saber)
    this.cursor.update(this);          // posição, anel e progresso (não depende do dt do dia)
    this.plants.update(this.grid.cells);
    this.scene.updateSoil(this.grid.cells, this.cursor.hl);
    this.vfx.update(frozen ? 0 : dt);
    this.drones.render(frozen ? 0 : dt);
    this.ui.syncControls(this);
    this.scene.render();
  }

  updateDay(dt, realDt) {
    // Contagem 3-2-1 antes de começar
    if (this.countdown > 0) {
      this.countdown -= realDt;
      if (this.countdown > 0) {
        const n = Math.ceil(this.countdown);
        this.ui.setCountdown(String(n));
        if (n !== this.lastCount) { this.lastCount = n; Sound.play('count', 3 - n); }   // 3 → 2 → 1: cada número mais agudo
      } else { this.countdown = 0; this.ui.setCountdown(null); Sound.play('go'); }
      return;
    }
    // «Fim do dia!» por 1 s, ferramentas paradas
    if (this.ending > 0) {
      this.ending -= realDt;
      if (this.ending <= 0) this.openSummary();
      return;
    }

    this.timeLeft -= dt;
    this.grid.update(dt, this.S);
    this.drones.update(dt);
    this.updateCharge(dt);                             // segurar = carregar o ciclo; ao encher, usa a ferramenta
    this.scene.setDayProgress(1 - Math.max(0, this.timeLeft) / this.S.dayLength);

    // 5 s finais: relógio pulsa e faz tique
    const sec = Math.ceil(this.timeLeft);
    if (this.timeLeft > 0 && sec <= 5 && sec !== this.lastTick) { this.lastTick = sec; Sound.play('tick'); }
    this.ui.hudTick(this);
    if (this.timeLeft <= 0) this.endDay();
  }

  /* ------------------------------ ferramentas ------------------------------ */
  // Tempo de um ciclo da ferramenta atual (s).
  // Semear fica mais lento e com raio menor a cada planta nova (Crops.js: plantMult / radiusMult).
  cycleTime() {
    const sel = this.selection, group = TOOLS[sel.tool].group;
    return this.S[group].cooldown * (sel.tool === 'plant' ? CROPS[sel.crop].plantMult : 1);
  }

  toolRadius() {
    const sel = this.selection, group = TOOLS[sel.tool].group;
    return this.S[group].radius * (sel.tool === 'plant' ? CROPS[sel.crop].radiusMult : 1);
  }

  // Segurar carrega o ciclo; a ferramenta só é usada quando ele enche, e a carga recomeça do zero.
  // Soltar o botão/dedo cancela a carga: o primeiro uso não tem vantagem sobre os seguintes.
  updateCharge(dt) {
    if (!this.input.holding || this.radial.isOpen) { this.charge = 0; return; }
    const cycle = this.cycleTime();
    this.charge = Math.min(cycle, this.charge + dt);
    if (this.charge >= cycle) this.tryFire();          // sem alvo: fica cheio e usa assim que houver alvo
  }

  tryFire() {
    if (this.state !== 'DAY' || this.paused || window.K101?.blocked) return false;
    if (this.countdown > 0 || this.ending > 0 || this.radial.isOpen) return false;
    const sel = this.selection;
    const tool = TOOLS[sel.tool], group = tool.group;
    // O ponto do chão vem do ponteiro atual (o Cursor só atualiza no quadro; aqui calculamos na hora)
    const p = this.input.inside ? this.cursor.groundPoint(this.input.pos.x, this.input.pos.y, this.scene.camera) : null;
    if (!p) return false;
    const point = { x: p.x, z: p.z };
    const radius = this.toolRadius();
    const targets = this.grid.cellsInCircle(point.x, point.z, radius, this.activeField).filter((c) => tool.canTarget(c, this));
    if (!targets.length) return false;                 // sem alvo: não gasta o ciclo
    this.fireValue = 0;
    for (const c of targets) tool.apply(c, this);
    this.charge = 0;                                   // o próximo uso precisa carregar um ciclo inteiro
    this.fired = true;
    this.vfx.burst(point, tool.vfx, targets.length, radius);
    if (this.fireValue > 0) this.vfx.floatText(point, `+${fmtMoney(this.fireValue)}`);
    Sound.play(tool.sfx);
    return true;
  }

  harvestCell(c) {
    const crop = CROPS[c.crop];
    const value = crop.value * this.S.valueMult;
    const h = (this.dayHarvest[c.crop] ??= { qty: 0, value: 0 });
    h.qty += 1; h.value += value;
    this.dayMoney += value;
    this.fireValue += value;                           // um único número flutuante por ciclo
    this.grid.harvest(c);
  }

  radialItems() {
    const items = this.S.unlockedCrops.map((id) => ({
      key: `plant:${id}`, tool: 'plant', crop: id, name: CROPS[id].name, icon: `assets/icons/crops/${id}.webp`
    }));
    items.push({ key: 'water', tool: 'water', name: 'Aguar', icon: TOOLS.water.icon });
    items.push({ key: 'harvest', tool: 'harvest', name: 'Colher', icon: TOOLS.harvest.icon });
    return items;
  }

  selectItem(it) {
    this.selection = it.tool === 'plant' ? { tool: 'plant', crop: it.crop } : { tool: it.tool, crop: this.selection.crop };
    this.charge = 0;                                   // trocar de ferramenta recomeça a carga
    this.ui.toolChanged(true);
    Sound.play('click');
  }

  /* --------------------------------- o dia --------------------------------- */
  startDay() {
    this.state = 'DAY';
    this.paused = false;
    this.S = computeStats(this.owned);
    this.fields = layoutFields(this.S);
    this.activeField = 0;                                  // todo dia começa olhando o campo principal
    this.grid.reset(this.fields);                          // todos os campos começam vazios em todo dia
    this.drones.reset();
    this.charge = 0; this.fired = false;
    this.dayHarvest = {}; this.dayMoney = 0;
    this.timeLeft = this.S.dayLength;
    this.ending = 0; this.countdown = 3; this.lastTick = -1; this.lastCount = 3;
    Sound.play('count', 0);                                // «3»
    this.playedDay = this.day;
    if (!this.S.unlockedCrops.includes(this.selection.crop)) this.selection.crop = this.S.unlockedCrops[0];
    this.scene.setField(this.fields[0], true);
    this.scene.setDayProgress(0);
    this.radial.close();
    this.ui.showOnly(null);
    this.ui.showHud(true);
    this.ui.toolChanged();
    this.ui.hudTick(this);
    this.ui.syncNav(this, true);
    this.ui.setCountdown('3');
  }

  endDay() {
    this.ending = 1;
    this.input.releaseAll();
    this.radial.close();
    this.ui.setCountdown('Fim do dia!');
    Sound.play('dayEnd');
  }

  openSummary() {
    const lines = Object.entries(this.dayHarvest).map(([id, h]) => ({ id, name: CROPS[id].name, qty: h.qty, value: h.value }));
    const total = this.dayMoney;
    const playedDay = this.playedDay;
    const newBest = total > this.best.earned;
    // Dinheiro entra agora (e salva) para não se perder se o jogador sair no resumo; a tela só anima a contagem.
    this.money += total;
    if (newBest) this.best = { earned: total, day: playedDay };
    this.day = playedDay + 1;
    this.hasSave = true;
    this.save.write();
    this.state = 'SUMMARY';
    this.paused = false;
    this.ending = 0;
    this.ui.setCountdown(null);
    this.ui.showHud(false);
    this.ui.showSummary({ day: playedDay, lines, total, best: this.best, newBest }, () => this.openHub());
  }

  // Intervalo entre os dias: HUB (escolher) ⇄ HABILIDADES ⇄ LOJA. Na ordem da esquerda para a direita:
  // habilidades à esquerda, loja à direita (as setas das telas seguem essa ordem).
  openHub() {
    this.state = 'HUB';
    this.ui.showHub();
  }

  openSkills() {
    this.state = 'SKILLS';
    this.ui.showSkills();
  }

  openShop() {
    if (this.state !== 'HUB' && this.state !== 'SKILLS' && this.state !== 'SHOP') return;
    this.state = 'SHOP';
    this.ui.showShop();
  }

  // Compra na loja: arados e drones moram no mesmo conjunto `owned` das habilidades (e vão para o mesmo save).
  buyItem(id) {
    const it = ITEM_BY_ID[id];
    if (!it || this.owned.has(id) || this.money < it.cost) return false;
    if (it.requires && !this.owned.has(it.requires)) return false;
    this.money -= it.cost;
    this.owned.add(id);
    this.S = computeStats(this.owned);                 // vale a partir do próximo dia
    this.save.write();
    this.ui.shop.refresh();
    Sound.play('unlock');
    return true;
  }

  /* ----------------------------- navegação entre campos ----------------------------- */
  // Troca o campo em vista: a câmera desliza até ele. Os outros campos continuam crescendo e os drones, trabalhando.
  goField(id) {
    if (this.state !== 'DAY' || this.paused || this.ending > 0 || !this.fields[id] || id === this.activeField) return;
    this.activeField = id;
    this.input.releaseAll();
    this.radial.close();
    this.charge = 0;
    this.scene.setField(this.fields[id]);
    this.ui.syncNav(this, true);
    Sound.play('click');
  }

  goDir(dir) {
    const n = neighbors(this.fields, this.activeField).find((o) => o.dir === dir);
    if (n) this.goField(n.field.id);
  }

  nextDay() { Sound.play('click'); this.startDay(); }

  /* --------------------------- título, pausa, novo jogo --------------------------- */
  showTitle() {
    this.state = 'TITLE';
    this.ui.showHud(false);
    this.ui.showTitle(this.hasSave, this.day);
  }

  // Jogar / Continuar: o toque libera o áudio e chama o anúncio de entrada (sem bloquear mais de 3 s).
  async enter(continueGame) {
    if (this.entering) return;
    this.entering = true;
    Sound.unlock();
    try {
      const ad = window.K101?.ads?.checkEntryAd?.();
      if (ad) await Promise.race([Promise.resolve(ad).catch(() => {}), sleep(3000)]);
    } catch { /* sem anúncio: segue o jogo */ }
    this.entering = false;
    if (!continueGame) this.resetProgress();
    if (continueGame && this.day > 1) this.openHub();      // quem volta escolhe: loja ou habilidades, antes do próximo dia
    else this.startDay();
  }

  resetProgress() {
    this.day = 1; this.money = 0; this.owned = new Set(); this.best = { earned: 0, day: 0 };
    this.S = computeStats(this.owned);
    this.save.write();
  }

  pause() {
    if (this.state !== 'DAY' || this.paused) return;    // seguro em qualquer estado: sem efeito fora do dia
    this.paused = true;
    this.input.releaseAll();
    this.radial.close();
    this.ui.showPause(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.last = undefined;
    this.ui.showPause(false);
  }

  togglePause() { this.paused ? this.resume() : this.pause(); }

  // Da pausa de volta ao título. O progresso salvo fica como está (o dia em andamento não conta).
  quitToTitle() {
    if (this.state !== 'DAY' || !this.paused) return;
    this.paused = false;
    this.input.releaseAll();
    this.radial.close();
    this.ui.showPause(false);
    this.ui.setCountdown(null);
    this.save.write();
    this.showTitle();
  }

  installKeys() {
    addEventListener('keydown', (e) => {
      // No intervalo: seta direita = loja, seta esquerda = habilidades.
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'ArrowRight' && this.state === 'SKILLS') return this.openShop();
        if (e.key === 'ArrowLeft' && this.state === 'SHOP') return this.openSkills();
      }
      if (this.state !== 'DAY' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (this.radial.isOpen) this.radial.close(); else this.togglePause();
      } else if (e.key === 'p' || e.key === 'P') {
        this.togglePause();
      } else if (e.key.startsWith('Arrow') && !this.paused) {
        this.goDir(e.key.slice(5).toLowerCase());
      } else if (/^[1-9]$/.test(e.key) && !this.paused) {
        const it = this.radialItems()[Number(e.key) - 1];
        if (it) this.selectItem(it);
      }
    });
  }

  /* --------------------------------- compra --------------------------------- */
  buy(id) {
    const s = SKILL_BY_ID[id];
    if (!s || this.owned.has(id) || !isVisible(this, s) || this.money < s.cost) return false;
    const before = new Set(visibleIds(this));
    this.money -= s.cost;
    this.owned.add(id);
    this.S = computeStats(this.owned);                 // vale a partir do próximo dia
    this.save.write();
    this.ui.skills.refresh({ born: visibleIds(this).filter((v) => !before.has(v)), from: id });
    Sound.play('unlock');
    return true;
  }
}

export function fmtMoney(v) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
