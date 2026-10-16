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

  /* ----------------------------------- HUD ----------------------------------- */
  hudTick(g) {
    const t = Math.max(0, g.timeLeft), frac = t / g.S.dayLength;
    const sec = String(Math.ceil(t));
    if (this.cache.sec !== sec) { $('time-text').textContent = sec; this.cache.sec = sec; }
    $('time-fill').style.transform = `scaleX(${frac.toFixed(4)})`;
    $('hud').classList.toggle('urgent', t > 0 && t <= 5);
    const day = `DIA ${g.playedDay}`;
    if (this.cache.day !== day) { $('hud-day').textContent = day; this.cache.day = day; }
    const money = fmtMoney(g.dayMoney);
    if (this.cache.money !== money) { $('money-text').textContent = money; this.cache.money = money; }
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
    this.skills.open();
  }

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
