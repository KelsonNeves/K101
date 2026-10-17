// UI.js — HUD, telas e resumo do dia. Só HTML: as regras ficam no Game.
import { TOOLS } from './Data.js';
import { CROPS } from './Crops.js';
import { Sound } from './Audio.js';
import { SkillTree } from './SkillTree.js';
import { ShopUI } from './ShopUI.js';
import { neighbors } from './Fields.js';
import { fmtMoney } from './Game.js';

const $ = (id) => document.getElementById(id);
const OVERLAYS = ['ov-title', 'ov-pause', 'ov-summary', 'ov-hub', 'ov-skills', 'ov-shop', 'ov-error', 'ov-confirm'];
const NAV_DIRS = ['up', 'down', 'left', 'right'];

export class UI {
  constructor() {
    this.skills = null;
    this.shop = null;
    this.hintGone = false;
    this.cache = {};
    this.countdownText = null;
    this.anim = 0;
  }

  /* ----------------------------- carregamento / erro ----------------------------- */
  setLoading(p, text) {
    $('loading-fill').style.width = `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;
    if (text) $('loading-text').textContent = text;
  }

  hideLoading() { $('ov-loading').hidden = true; }

  showError(msg) {
    $('ov-loading').hidden = true;
    $('err-text').textContent = msg;
    this.showOnly('ov-error');
  }

  /* --------------------------------- telas --------------------------------- */
  showOnly(id) {
    for (const o of OVERLAYS) { const el = $(o); if (el) el.hidden = o !== id; }
  }

  showTitle(hasSave, day) {
    $('ov-loading').hidden = true;
    this.showOnly('ov-title');
    $('btn-play').textContent = hasSave ? `Continuar · Dia ${day}` : 'Jogar';
    $('btn-new').hidden = !hasSave;
  }

  showPause(on) {
    $('ov-pause').hidden = !on;
    this.disarmQuit();
    if (on) $('btn-resume').focus?.();
  }

  // «Voltar ao início» pede um segundo toque, para ninguém perder o dia por engano.
  disarmQuit() {
    clearTimeout(this.quitTimer);
    this.quitArmed = false;
    const b = $('btn-quit'), tip = $('quit-tip');
    if (b) b.textContent = 'Voltar ao início';
    if (tip) tip.hidden = true;
  }

  showHud(on) {
    $('hud').hidden = !on;
    if (!on) { $('tool-btn').hidden = true; $('countdown').hidden = true; this.countdownText = null; this.syncNav(this.game, true); }
  }

  setCountdown(text) {
    const el = $('countdown');
    if (text === this.countdownText) return;
    this.countdownText = text;
    if (text === null) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = text;
    el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');   // reinicia a animação
  }

  /* --------------------------------- tutorial --------------------------------- */
  // t = { step, steps, title, text, count, max, pulse } ou null (desliga). Só mexe no DOM quando algo muda.
  setTutorial(t) {
    const el = $('tut'), on = !!t;
    if (this.tutOn !== on) {
      this.tutOn = on;
      document.body.classList.toggle('tut-on', on);
      $('hud').classList.toggle('tut', on);
      el.hidden = !on;
      this.game?.scene.resize();                           // o painel ocupa o topo no celular em pé: reenquadra o campo
    }
    if (!t) { this.cache.tut = ''; $('tool-btn').classList.remove('tut-pulse'); document.querySelector('.hud-tool')?.classList.remove('tut-pulse'); return; }
    const key = JSON.stringify(t);
    if (key === this.cache.tut) return;
    this.cache.tut = key;
    $('tut-step').textContent = `Passo ${t.step + 1} de ${t.steps}`;
    $('tut-title').textContent = t.title;
    $('tut-text').textContent = t.text;
    const prog = $('tut-prog');
    prog.hidden = t.max === null;
    if (t.max !== null) {
      $('tut-count').textContent = `${t.count}/${t.max}`;
      $('tut-fill').style.width = `${Math.round((t.count / t.max) * 100)}%`;
    }
    const dots = $('tut-dots');
    if (dots.children.length !== t.steps) { dots.textContent = ''; for (let i = 0; i < t.steps; i++) dots.appendChild(document.createElement('i')); }
    [...dots.children].forEach((d, i) => { d.className = i < t.step ? 'done' : i === t.step ? 'now' : ''; });
    $('tool-btn').classList.toggle('tut-pulse', t.pulse === 'btn');
    document.querySelector('.hud-tool')?.classList.toggle('tut-pulse', t.pulse === 'tool');
  }

  // Escolheu a ferramenta errada no tutorial: o painel balança.
  nudgeTutorial() {
    const el = $('tut');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    Sound.play('tick');
  }

  /* ----------------------------------- HUD ----------------------------------- */
  hudTick(g) {
    const t = Math.max(0, g.timeLeft), frac = t / g.S.dayLength, elapsed = 1 - frac;
    const sec = String(Math.ceil(t));
    if (this.cache.sec !== sec) { $('time-text').textContent = sec; this.cache.sec = sec; }
    $('time-fill').style.transform = `scaleX(${elapsed.toFixed(4)})`;         // a barra enche e o sol anda junto
    const sx = `${(elapsed * 100).toFixed(1)}%`;
    if (this.cache.sx !== sx) { this.cache.sx = sx; $('sun').style.setProperty('--sx', sx); }
    $('hud').classList.toggle('late', elapsed > 0.7);                         // fim de tarde: sol alaranjado
    $('hud').classList.toggle('urgent', t > 0 && t <= 5);
    const day = `DIA ${g.playedDay}`;
    if (this.cache.day !== day) { $('hud-day').textContent = day; this.cache.day = day; }
  }

  /* ----------------- dinheiro de hoje: colheita voa até o placar ----------------- */
  // Começo do dia: placar zerado e sem plantas voando.
  resetMoney() {
    this.moneyShown = 0; this.moneyTarget = 0; this.flying = 0;
    $('money-text').textContent = '0';
    $('float-layer').querySelectorAll('.fly').forEach((e) => e.remove());
  }

  // Uma planta colhida: o ícone nasce na célula, paira um instante e voa até a moeda do placar.
  // `delay` (ms) escalona várias colheitas do mesmo golpe. Ao chegar, o valor entra no placar (com som).
  harvestFly(cropId, screen, value, delay = 0) {
    const layer = $('float-layer'), coin = $('money-coin');
    if (!layer || !coin || this.flying >= 36 || !screen) { this.coinArrive(value, !screen || this.flying >= 36); return; }   // muita coisa voando: entra direto
    const r = coin.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const x0 = screen.x, y0 = screen.y;
    let el;
    if (cropId) { el = document.createElement('img'); el.src = `assets/icons/crops/${cropId}.webp`; el.alt = ''; el.draggable = false; el.onerror = () => { const d = document.createElement('div'); d.className = 'fly'; el.replaceWith(d); }; }
    else el = document.createElement('div');
    el.className = 'fly';
    el.style.opacity = '0';
    layer.appendChild(el);
    this.flying++;
    const hop = 46, mx = (x0 + tx) / 2 + (tx > x0 ? -30 : 30), my = Math.min(y0 - hop, ty) - 60;     // curva suave até o placar
    const T = (x, y, s) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s})`;
    const done = () => { if (el.isConnected) el.remove(); this.flying = Math.max(0, this.flying - 1); this.coinArrive(value); };
    if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { setTimeout(done, delay + 200); return; }
    const anim = el.animate([
      { transform: T(x0, y0, 0.3), opacity: 0, offset: 0, easing: 'cubic-bezier(.2,1.4,.4,1)' },
      { transform: T(x0, y0 - hop, 1.25), opacity: 1, offset: 0.22, easing: 'ease-in-out' },       // pula para fora da célula
      { transform: T(x0, y0 - hop - 6, 1.15), opacity: 1, offset: 0.42, easing: 'cubic-bezier(.5,0,.9,.5)' },   // paira
      { transform: T(mx, my, 0.9), opacity: 1, offset: 0.72, easing: 'cubic-bezier(.2,.6,.4,1)' },
      { transform: T(tx, ty, 0.4), opacity: 0.95, offset: 1 }
    ], { duration: 1150, delay, fill: 'both' });
    anim.onfinish = done;
    anim.oncancel = () => { if (el.isConnected) { el.remove(); this.flying = Math.max(0, this.flying - 1); } };
  }

  // O valor chegou ao placar: toca o som (sobe de tom em sequência), o placar dá um pulinho e o número rola até o novo total.
  coinArrive(value, silent = false) {
    this.moneyTarget = (this.moneyTarget ?? 0) + value;
    const now = performance.now();
    if (!silent) {
      this.coinStep = now - (this.lastCoin ?? 0) < 450 ? (this.coinStep ?? 0) + 1 : 0;
      this.lastCoin = now;
      if (now - (this.lastCoinSound ?? 0) > 40) { this.lastCoinSound = now; Sound.play('coinIn', this.coinStep); }   // efeito sonoro «coinIn» (assets/audio/moeda.mp3)
      const box = $('hud-money');
      box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    }
    if (!this.moneyAnim) this.moneyAnim = requestAnimationFrame((t) => this.rollMoney(t));
  }

  rollMoney(t) {
    const dt = Math.min(0.05, (t - (this.moneyLast ?? t)) / 1000);
    this.moneyLast = t;
    const diff = this.moneyTarget - this.moneyShown;
    this.moneyShown = Math.abs(diff) < 0.5 ? this.moneyTarget : this.moneyShown + diff * Math.min(1, dt * 9);   // rola rápido no começo e assenta no fim
    const txt = fmtMoney(Math.round(this.moneyShown * 10) / 10);
    if (txt !== this.cache.money) { this.cache.money = txt; $('money-text').textContent = txt; }
    if (this.moneyShown !== this.moneyTarget) this.moneyAnim = requestAnimationFrame((n) => this.rollMoney(n));
    else { this.moneyAnim = 0; this.moneyLast = undefined; }
  }

  // Ferramenta atual: nome (PC) e ícone do botão inferior (celular).
  toolChanged(fromUser) {
    const g = this.game, sel = g.selection;
    const name = sel.tool === 'plant' ? `Semear · ${CROPS[sel.crop].name}` : TOOLS[sel.tool].name;
    $('tool-name').textContent = name;
    const img = $('tool-icon'), glyph = $('tool-glyph');
    const src = sel.tool === 'plant' ? `assets/icons/crops/${sel.crop}.webp` : TOOLS[sel.tool].icon;
    img.hidden = false; glyph.hidden = true;
    img.onerror = () => { img.hidden = true; glyph.hidden = false; };
    img.src = src;
    glyph.textContent = TOOLS[sel.tool].name.charAt(0);
    if (fromUser && !this.hintGone) { this.hintGone = true; $('tool-hint').hidden = true; }
  }

  // Por quadro (barato): botão de ferramenta no toque e dica no PC.
  syncControls(g) {
    const day = g.state === 'DAY';
    const touch = g.input.type === 'touch';
    const btn = $('tool-btn');
    const showBtn = day && touch && !g.paused;
    if (btn.hidden === showBtn) btn.hidden = !showBtn;
    $('tool-hint').hidden = this.hintGone || touch || !day;
    if (showBtn) {
      const p = Math.round(g.cursor.progress(g) * 100);
      if (this.cache.p !== p) { this.cache.p = p; btn.style.setProperty('--p', `${p}%`); }
    }
    this.syncNav(g);
    document.body.classList.toggle('touch', touch);
    document.body.classList.toggle('playing', day && !g.paused);
  }

  /* ----------------------------------- resumo ----------------------------------- */
  showSummary({ day, lines, total, best, newBest }, onContinue) {
    this.showOnly('ov-summary');
    cancelAnimationFrame(this.anim);
    $('sum-title').textContent = `Dia ${day} concluído`;
    const list = $('sum-list');
    list.innerHTML = '';
    if (!lines.length) {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nada colhido hoje. Amanhã tem mais!';
      list.appendChild(li);
    }
    for (const l of lines) {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.alt = ''; img.draggable = false;
      img.onerror = () => { img.hidden = true; };
      img.src = `assets/icons/crops/${l.id}.webp`;
      const nm = document.createElement('span'); nm.className = 'l-name'; nm.textContent = `${l.name} × ${l.qty}`;
      const v = document.createElement('span'); v.className = 'l-val'; v.textContent = fmtMoney(l.value);
      li.append(img, nm, v);
      list.appendChild(li);
    }
    $('sum-total').textContent = fmtMoney(total);
    $('sum-best').textContent = newBest && total > 0
      ? `Novo recorde! ${fmtMoney(best.earned)} num só dia`
      : (best.earned > 0 ? `Melhor dia: ${fmtMoney(best.earned)} (dia ${best.day})` : '');

    const money = $('sum-money'), btn = $('btn-continue');
    btn.disabled = true;
    money.textContent = '0';
    const dur = total > 0 ? Math.min(2400, 700 + total * 6) : 300;
    const t0 = performance.now();
    let lastShown = 0, lastSound = 0, done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(this.anim);
      money.textContent = fmtMoney(total);
      btn.disabled = false;
      $('ov-summary').removeEventListener('pointerdown', finish);
    };
    const step = (now) => {
      if (done) return;
      const k = Math.min(1, (now - t0) / dur);
      const v = total * (1 - Math.pow(1 - k, 3));
      const shown = Math.floor(v);
      if (shown !== lastShown) {
        lastShown = shown;
        money.textContent = fmtMoney(shown);
        if (now - lastSound > 55) { lastSound = now; Sound.play('coin'); }
      }
      if (k >= 1) finish(); else this.anim = requestAnimationFrame(step);
    };
    $('ov-summary').addEventListener('pointerdown', finish);        // tocar na tela acelera a contagem
    this.anim = requestAnimationFrame(step);
    this.onContinue = onContinue;
  }

  showHub() {
    this.showOnly('ov-hub');
    $('hub-money').textContent = fmtMoney(this.game.money);
    $('hub-day').textContent = `DIA ${this.game.day}`;
    $('hub-skills').focus?.();
  }

  showSkills() {
    this.showOnly('ov-skills');
    this.tipDone = false;
    this.skills.open();
    this.syncSkillTip();
  }

  // Passo 6 do tutorial: enquanto a 1ª habilidade (grátis) não foi desbloqueada, a árvore explica como fazer.
  syncSkillTip() {
    const g = this.game, tip = $('sk-tip'), buy = $('sk-buy');
    if (!g) return;
    const learning = !g.owned.has('raiz');
    const touch = g.input.type === 'touch';
    clearTimeout(this.tipTimer);
    if (learning) {
      tip.hidden = false;
      $('sk-tip-title').textContent = 'Desbloqueie sua 1ª habilidade';
      $('sk-tip-text').textContent = this.skills.selected === 'raiz'
        ? `Cada célula desta árvore melhora a fazenda. ${touch ? 'Toque' : 'Clique'} em “Desbloquear”, embaixo: a primeira é grátis!`
        : `${touch ? 'Toque' : 'Clique'} na célula brilhante “Mãos na terra” para ver os detalhes.`;
    } else if (this.tipDone) {
      tip.hidden = false;
      $('sk-tip-title').textContent = 'Muito bem!';
      $('sk-tip-text').textContent = 'Novas habilidades apareceram. Gaste seu dinheiro nelas e, quando quiser, toque em “Próximo dia”.';
      this.tipTimer = setTimeout(() => { this.tipDone = false; tip.hidden = true; }, 7000);
    } else tip.hidden = true;
    buy.classList.toggle('tut-pulse', learning && this.skills.selected === 'raiz' && !buy.disabled);
  }

  skillTipDone() { this.tipDone = true; }

  showShop() {
    this.showOnly('ov-shop');
    this.shop.open();
  }

  /* ------------------------- setas de navegação entre campos ------------------------- */
  // Mostra só as setas que levam a um campo vizinho; a seta ganha um destaque quando há plantas maduras lá.
  syncNav(g, force = false) {
    if (!g) return;
    const ns = g.state === 'DAY' ? neighbors(g.fields, g.activeField) : [];
    const key = `${g.activeField}|${ns.map((n) => `${n.dir}${n.field.id}`).join(',')}`;
    if (force || key !== this.cache.nav) {
      this.cache.nav = key;
      for (const dir of NAV_DIRS) {
        const btn = $(`nav-${dir}`), n = ns.find((o) => o.dir === dir);
        btn.hidden = !n;
        if (n) { btn.dataset.field = n.field.id; btn.setAttribute('aria-label', `Ir para ${n.field.name}`); btn.title = n.field.name; }
        this.cache[`ready-${dir}`] = undefined;
      }
    }
    if (!ns.length) return;
    const ripe = {};
    for (const c of g.grid.cells) if (c.state === 'ripe') ripe[c.field] = (ripe[c.field] ?? 0) + 1;
    for (const n of ns) {
      const ready = (ripe[n.field.id] ?? 0) > 0;
      if (this.cache[`ready-${n.dir}`] !== ready) { this.cache[`ready-${n.dir}`] = ready; $(`nav-${n.dir}`).classList.toggle('ready', ready); }
    }
  }

  /* ----------------------------------- ligações ----------------------------------- */
  bind(game) {
    this.game = game;
    this.skills = new SkillTree(game);
    this.shop = new ShopUI(game);

    $('btn-play').addEventListener('click', () => { Sound.unlock(); Sound.play('click'); game.enter(game.hasSave); });
    $('btn-new').addEventListener('click', () => { Sound.unlock(); Sound.play('click'); $('ov-confirm').hidden = false; });
    $('conf-no').addEventListener('click', () => { $('ov-confirm').hidden = true; });
    $('conf-yes').addEventListener('click', () => { $('ov-confirm').hidden = true; game.enter(false); });
    $('btn-resume').addEventListener('click', () => { Sound.play('click'); game.resume(); });
    $('btn-quit').addEventListener('click', () => {
      Sound.play('click');
      if (this.quitArmed) { this.disarmQuit(); game.quitToTitle(); return; }
      this.quitArmed = true;
      $('btn-quit').textContent = 'Confirmar: voltar ao início';
      $('quit-tip').hidden = false;
      this.quitTimer = setTimeout(() => this.disarmQuit(), 4000);
    });
    $('tut-skip').addEventListener('click', () => { Sound.play('click'); game.skipTutorial(); });
    $('btn-pause').addEventListener('click', (e) => { Sound.play('click'); game.pause(); e.currentTarget.blur(); });
    $('btn-continue').addEventListener('click', () => {
      if ($('btn-continue').disabled) return;
      Sound.play('click');
      this.onContinue?.();
    });
    $('btn-retry').addEventListener('click', () => location.reload());

    // Intervalo entre os dias: tela de escolha e setas entre Habilidades (esquerda) e Loja (direita).
    $('hub-skills').addEventListener('click', () => { Sound.play('click'); game.openSkills(); });
    $('hub-shop').addEventListener('click', () => { Sound.play('click'); game.openShop(); });
    $('go-shop').addEventListener('click', () => { Sound.play('click'); game.openShop(); });
    $('go-skills').addEventListener('click', () => { Sound.play('click'); game.openSkills(); });
    $('btn-hub-next').addEventListener('click', () => game.nextDay());
    $('btn-shop-next').addEventListener('click', () => game.nextDay());

    // Setas nas bordas: trocam o campo em vista.
    for (const dir of NAV_DIRS) $(`nav-${dir}`).addEventListener('click', (e) => { game.goField(Number(e.currentTarget.dataset.field)); e.currentTarget.blur(); });

    // Botão inferior do celular: abre o menu radial em leque para cima, na posição dele.
    $('tool-btn').addEventListener('click', () => {
      const r = $('tool-btn').getBoundingClientRect();
      game.radial.open(r.left + r.width / 2, r.top + r.height / 2, 'fan');
    });
    $('tool-btn').addEventListener('contextmenu', (e) => e.preventDefault());
    this.toolChanged(false);
  }
}
