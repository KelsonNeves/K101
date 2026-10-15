/* ==========================================================================
   UI.js — interface HTML/CSS.
   "O que o jogador está vendo?"
   Só exibe dados recebidos e emite comandos ao Game. Não conhece regras.
   ========================================================================== */

import { Haptics } from "./Haptics.js";
import { Sound } from "./Audio.js";

// 75 → "1:15"; 3725 → "1:02:05"
const formatTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

// Botões sem o "clique" genérico: cada um toca o próprio som (cards, menu de contexto, construir, desfazer).
const SILENT_BUTTONS = "#ctx-menu, .tower-card, #btn-build, #btn-undo";

const DRAG_START = 8;      // px antes de um toque no card virar arrasto
const HOLD_MS = 300;       // toque longo mostra o menu de contexto

// Ícones (SVG branco) dos botões redondos do menu de contexto das estruturas.
// Para uma nova opção, adicione o ícone aqui e use a mesma chave em Game.structureActions().
const CTX_ICONS = {
  demolish: `<svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true">
    <g transform="rotate(-40 24 24)">
      <rect x="21" y="14" width="6" height="29" rx="2.5" fill="#fff"/>
      <rect x="8" y="7" width="32" height="14" rx="3" fill="#fff"/>
    </g></svg>`,
  upgrade: `<svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true">
    <path d="M24 6 L40 23 H29.5 V41 H18.5 V23 H8 Z" fill="#17321a"/></svg>`,
  repair: `<svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true">
    <path d="M30 6a11 11 0 0 0-10.4 14.6L7 33.2a4 4 0 0 0 0 5.6l2.2 2.2a4 4 0 0 0 5.6 0l12.6-12.6A11 11 0 0 0 42 18l-6.8 6.8-5.6-1.4-1.4-5.6L35 11a11 11 0 0 0-5-5z" fill="#0d2f3f"/></svg>`
};

export class UIManager {
  /**
   * @param {{onPlay, onSelectTower, onPause, onResume, onRestart, onToggleSpeed, onUndo,
   *          onDragStart, onDragMove, onDragEnd}} handlers
   */
  constructor(handlers) {
    this.h = handlers;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $("hud"), coins: $("hud-coins"), wave: $("hud-wave"),
      castleFill: $("hud-castle-fill"), castleText: $("hud-castle-text"),
      waveTimer: $("wave-timer"), waveTimerFill: $("wave-timer-fill"),
      countdown: $("countdown"), btnPause: $("btn-pause"), btnSpeed: $("btn-speed"),
      btnBuild: $("btn-build"), trash: $("trash"), dock: $("dock"), tray: $("tower-tray"), tip: $("tip"),
      main: $("main-menu"), undo: $("btn-undo"), undoCount: $("undo-count"),
      cards: $("tower-cards"), toast: $("toast"), flash: $("damage-flash"), ctx: $("ctx-menu"),
      loading: $("ov-loading"), loadingFill: $("loading-fill"),
      menu: $("ov-menu"), pause: $("ov-pause"), end: $("ov-end"),
      endTitle: $("end-title"), endText: $("end-text"), endRecord: $("end-record"),
      menuRecord: $("menu-record"), record: $("hud-record"),
      pauseRecord: $("pause-record"), pauseTime: $("pause-time"), btnFinish: $("btn-finish")
    };
    this.cache = {};
    this.toastTimer = null;
    this.tipTimer = null;
    this.holdTimer = null;
    this.drag = null;
    this.trayOpen = false;
    this.towerData = {};
    this.coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;

    window.addEventListener("pointermove", (e) => this.onDragMove(e));
    window.addEventListener("pointerup", (e) => this.onDragUp(e));
    window.addEventListener("pointercancel", (e) => this.onDragCancel(e));
    this.installHaptics();
    this.installAudioControls();
    this.installButtonReset();
    this.installSecondaryTouch();

    $("btn-play").onclick = () => { this.enterFullscreen(); this.h.onPlay(); };
    $("btn-resume").onclick = () => this.h.onResume();
    $("btn-restart").onclick = () => this.h.onRestart();
    $("btn-restart-pause").onclick = () => this.h.onRestart();
    // Finalizar partida pede um segundo toque para confirmar (evita encerrar sem querer).
    this.el.btnFinish.onclick = () => {
      if (!this.finishArmed) {
        this.finishArmed = true;
        this.el.btnFinish.textContent = "Toque de novo para confirmar";
        clearTimeout(this.finishTimer);
        this.finishTimer = setTimeout(() => this.resetFinishButton(), 3000);
        return;
      }
      this.resetFinishButton();
      this.h.onFinish?.();
    };
    this.el.btnPause.onclick = () => this.h.onPause();
    this.el.btnSpeed.onclick = () => this.h.onToggleSpeed();
    this.el.btnBuild.onclick = () => this.toggleTray();
    this.el.undo.onclick = () => this.h.onUndo?.();
    this.installCardScroll();

    // Etiqueta de preço que acompanha o fantasma da construção (posição vem do Game a cada frame).
    this.priceTag = document.createElement("div");
    this.priceTag.className = "price-tag";
    this.priceTag.hidden = true;
    this.priceTag.innerHTML = '<span class="stat-icon coin"></span><b></b>';
    this.priceText = this.priceTag.querySelector("b");
    ($("hud") ?? document.body).appendChild(this.priceTag);
  }

  // (x, y) = ponto na tela logo acima do fantasma. `ok` = dá para construir (vermelho se não).
  showGhostPrice(x, y, cost, ok) {
    const t = this.priceTag;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return this.hideGhostPrice();
    if (t.hidden) t.hidden = false;
    if (this.priceCost !== cost) { this.priceCost = cost; this.priceText.textContent = cost; }
    if (this.priceOk !== ok) { this.priceOk = ok; t.classList.toggle("poor", !ok); }
    t.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  hideGhostPrice() { if (!this.priceTag.hidden) this.priceTag.hidden = true; }

  // Mouse: a roda do mouse rola os cards para o lado quando não cabem todos.
  installCardScroll() {
    const list = this.el.cards;
    list.addEventListener("wheel", (e) => {
      if (list.scrollWidth <= list.clientWidth + 1 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      list.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }

  // Vibração padrão em TODO botão (inclusive os criados depois, como os do menu de contexto).
  // Vibra ao encostar; se o navegador ainda não liberou a vibração (1º toque da página), vibra no clique.
  installHaptics() {
    let played = true;
    const buttonOf = (e) => {
      const b = e.target?.closest?.("button");
      return b && !b.disabled ? b : null;
    };
    document.addEventListener("pointerdown", (e) => {
      played = false;
      const b = buttonOf(e);
      if (b) {
        played = Haptics.play("tap");
        if (!b.closest(SILENT_BUTTONS)) Sound.play("ui_clique");   // os silenciosos têm som próprio
      }
    }, true);
    document.addEventListener("click", (e) => {
      if (!played && buttonOf(e)) Haptics.play("tap");
      played = true;
    }, true);
  }

  // Menu de pausa: sliders de volume e botão de som (as mesmas configurações ficam salvas pelo Audio.js).
  installAudioControls() {
    const $ = (id) => document.getElementById(id);
    const sliders = { master: $("vol-master"), sfx: $("vol-sfx"), music: $("vol-music") };
    const mute = $("btn-mute");
    const sync = (s) => {
      for (const [name, el] of Object.entries(sliders)) if (el && document.activeElement !== el) el.value = Math.round(s[name] * 100);
      if (mute) { mute.textContent = s.muted ? "🔇" : "🔊"; mute.setAttribute("aria-pressed", String(s.muted)); }
    };
    for (const [name, el] of Object.entries(sliders)) {
      el?.addEventListener("input", () => Sound.setVolume(name, el.value / 100));
      el?.addEventListener("change", () => Sound.play("ui_tique"));
    }
    mute?.addEventListener("click", () => Sound.toggleMute());
    Sound.onChange(sync);
    sync(Sound.settings);
  }

  // O navegador só gera "click" para o ponteiro primário. Se um dedo já está arrastando o mapa,
  // o 2º dedo que toca num botão nunca produz "click" e o botão parece morto (a vibração vem do
  // pointerdown, por isso ela funcionava). Aqui um toque de ponteiro não primário vira um click.
  // Os cards ficam de fora: eles têm o próprio fluxo de arrastar (bindCard / onDragUp).
  installSecondaryTouch() {
    const pending = new Map();   // pointerId → botão onde o dedo encostou
    const buttonOf = (el) => {
      const b = el?.closest?.("button");
      return b && !b.disabled && !b.closest("#tower-cards") ? b : null;
    };
    document.addEventListener("pointerdown", (e) => {
      if (e.isPrimary || e.pointerType === "mouse") return;
      const b = buttonOf(e.target);
      if (b) pending.set(e.pointerId, b);
    }, true);
    document.addEventListener("pointerup", (e) => {
      const b = pending.get(e.pointerId);
      if (!b) return;
      pending.delete(e.pointerId);
      // dedo precisa soltar em cima do mesmo botão (o toque "prende" o alvo, então confere pela posição)
      if (buttonOf(document.elementFromPoint(e.clientX, e.clientY)) !== b) return;
      b.click();
    }, true);
    document.addEventListener("pointercancel", (e) => pending.delete(e.pointerId), true);
  }

  // Tira o foco do botão depois de soltar: some qualquer aparência "presa" e a barra de espaço/Enter
  // não aciona o mesmo botão de novo (P e Esc já cuidam da pausa).
  installButtonReset() {
    document.addEventListener("pointerup", (e) => {
      const b = e.target?.closest?.("button");
      if (b) setTimeout(() => b.blur(), 0);
    }, true);
  }

  /* ---- telas ---- */
  // Precisa ser chamado dentro de um clique do jogador. Falhas (ex.: iPhone) são ignoradas.
  enterFullscreen() {
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request || document.fullscreenElement || document.webkitFullscreenElement) return;
    try { request.call(el)?.catch?.(() => {}); } catch { /* sem suporte */ }
  }

  showLoading(progress) {
    this.el.loading.hidden = false;
    this.el.loadingFill.style.width = `${Math.round(progress * 100)}%`;
  }

  showMenu() {
    this.el.loading.hidden = true;
    this.el.menu.hidden = false;
  }

  hideOverlays() {
    for (const k of ["loading", "menu", "pause", "end"]) this.el[k].hidden = true;
  }

  showHud(visible) {
    this.el.hud.hidden = !visible;
    if (visible) this.setTray(false);
  }
  showPause(visible, info = null) {
    this.el.pause.hidden = !visible;
    this.resetFinishButton();
    if (visible && info) {
      this.el.pauseRecord.textContent = info.record > 0 ? `Recorde: ${formatTime(info.record)}` : "Ainda sem recorde";
      this.el.pauseTime.textContent = `Tempo desta partida: ${formatTime(info.time)}`;
    }
  }

  resetFinishButton() {
    clearTimeout(this.finishTimer);
    this.finishArmed = false;
    this.el.btnFinish.textContent = "Finalizar partida";
  }

  // Resultado da partida: tempo sobrevivido, onda alcançada e recorde.
  showEnd({ title = "O castelo caiu", time, wave, record, isRecord }) {
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = `Você sobreviveu ${formatTime(time)} e chegou à onda ${wave}.`;
    this.el.endRecord.textContent = isRecord ? "Novo recorde!" : `Recorde: ${formatTime(record)}`;
    this.el.endRecord.classList.toggle("new", !!isRecord);
    this.el.end.hidden = false;
  }

  // Recorde no menu inicial (some se ainda não existe).
  setRecord(seconds) {
    this.el.menuRecord.hidden = !(seconds > 0);
    this.el.menuRecord.textContent = `Seu recorde: ${formatTime(seconds)}`;
  }

  /* ---- 2º menu (cards) ---- */
  setTray(open) {
    // Esconder o tray (display:none) zera o scrollLeft; guardamos e restauramos ao reabrir.
    if (!open && this.trayOpen) this.trayScroll = this.el.cards.scrollLeft;
    if (open !== this.trayOpen) Sound.play(open ? "ui_abrir" : "ui_fechar");
    this.trayOpen = open;
    this.el.tray.hidden = !open;
    if (open) {
      this.el.cards.scrollLeft = this.trayScroll ?? 0;
      if (this.inertia) cancelAnimationFrame(this.inertia);
      this.inertia = 0;
    }
    this.el.btnBuild.classList.toggle("open", open);
    this.el.btnBuild.setAttribute("aria-expanded", String(open));
    if (!open) this.hideTip();
  }

  toggleTray() {
    const open = !this.trayOpen;
    this.setTray(open);
    if (!open) this.h.onSelectTower(null);   // fechar cancela a construção em andamento
  }

  // Ícone do botão redondo de construções. Enquanto a imagem não carrega (ou se faltar), fica a letra "F".
  setBuildIcon(src) {
    const holder = this.el.btnBuild.querySelector(".build-icon");
    if (!holder || !src) return;
    const img = new Image();
    img.alt = "";
    img.draggable = false;
    img.onload = () => holder.replaceChildren(img);
    img.src = src;
  }

  setTowers(towers, iconBase) {
    this.towerData = Object.fromEntries(towers.map((t) => [t.id, t]));
    this.el.cards.innerHTML = "";
    towers.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = "tower-card";
      btn.dataset.id = t.id;
      btn.setAttribute("aria-label", `${t.name}, ${t.cost} moedas`);
      btn.innerHTML = `<span class="thumb">${t.name[0]}</span><span class="cost">${t.cost}</span>`;   // thumb = fundo do card
      if (t.icon) {
        const img = new Image();
        img.alt = "";
        img.draggable = false;
        img.onload = () => { btn.querySelector(".thumb").replaceChildren(img); };
        img.src = `${iconBase}${t.icon}`;
      }
      this.bindCard(btn, t.id);
      this.el.cards.appendChild(btn);
    });
    this.towerCost = Object.fromEntries(towers.map((t) => [t.id, t.cost]));
  }

  bindCard(btn, id) {
    // Mouse: clique seleciona (a construção segue o cursor); hover mostra informações.
    btn.addEventListener("click", (e) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") return;
      this.hideTip();
      this.h.onSelectTower(id);
    });
    btn.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") this.showTip(btn, id); });
    btn.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") this.hideTip(); });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());

    // Toque: segurar mostra informações (some ao soltar); arrastar leva o modelo 3D ao mapa.
    btn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.button > 0) return;
      clearTimeout(this.holdTimer);
      this.stopInertia();
      this.drag = {
        id, btn, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, active: false,
        mode: null, lastX: e.clientX, lastT: performance.now(), vx: 0
      };
      this.holdTimer = setTimeout(() => {
        if (this.drag && !this.drag.active) this.showTip(btn, id, true);
      }, HOLD_MS);
    });
  }

  onDragMove(e) {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.mode === "scroll") { this.scrollCards(e, d); return; }
    if (!d.active) {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (Math.hypot(dx, dy) < DRAG_START) return;
      clearTimeout(this.holdTimer);
      this.hideTip();
      const list = this.el.cards;
      if (list.scrollWidth > list.clientWidth + 1 && Math.abs(dx) > Math.abs(dy)) {
        // gesto horizontal com cards escondidos = rolar a lista (feito aqui, não pelo navegador)
        d.mode = "scroll";
        d.lastX = d.sx; d.lastT = performance.now(); d.vx = 0;
        this.scrollCards(e, d);
        return;
      }
      if (this.h.onDragStart(d.id) === false) { this.finishDrag(); return; }
      d.active = true;
      d.btn.classList.add("lifted");
      this.setDragUI(true);
    }
    const over = this.overDock(e.clientX, e.clientY);
    this.el.trash.classList.toggle("hot", over);
    this.h.onDragMove(e.clientX, e.clientY, over);
  }

  onDragUp(e) {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    clearTimeout(this.holdTimer);
    this.hideTip();
    if (d.mode === "scroll") {
      if (performance.now() - d.lastT < 80) this.startInertia(d.vx);
      this.finishDrag();
      return;
    }
    // soltar sobre a lixeira cancela
    if (d.active) this.h.onDragEnd(e.clientX, e.clientY, this.overDock(e.clientX, e.clientY));
    this.finishDrag();
  }

  onDragCancel(e) {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    clearTimeout(this.holdTimer);
    this.hideTip();
    if (d.active) this.h.onDragEnd(0, 0, true);
    this.finishDrag();
  }

  // Rolagem manual da lista de cards (o navegador não rola: touch-action é none nos cards).
  scrollCards(e, d) {
    const list = this.el.cards;
    const now = performance.now();
    const dx = e.clientX - d.lastX;
    const dt = Math.max(1, now - d.lastT);
    list.scrollLeft -= dx;
    d.vx = 0.7 * d.vx + 0.3 * (-dx / dt);      // px/ms
    d.lastX = e.clientX;
    d.lastT = now;
  }

  startInertia(v) {
    if (Math.abs(v) < 0.05) return;
    const list = this.el.cards;
    let last = performance.now();
    const step = (t) => {
      const dt = Math.min(48, t - last);
      last = t;
      const before = list.scrollLeft;
      list.scrollLeft += v * dt;
      v *= Math.exp(-dt / 325);
      if (Math.abs(v) < 0.02 || list.scrollLeft === before) { this.inertia = 0; return; }
      this.inertia = requestAnimationFrame(step);
    };
    this.inertia = requestAnimationFrame(step);
  }

  stopInertia() {
    if (this.inertia) cancelAnimationFrame(this.inertia);
    this.inertia = 0;
  }

  // Durante o arrasto: os dois menus somem e a lixeira aparece no lugar do menu principal; ao soltar, tudo volta.
  setDragUI(on) {
    this.el.tray.classList.toggle("dragging", on);
    this.el.main.classList.toggle("dragging", on);
    this.el.trash.hidden = !on;
    this.el.trash.classList.remove("hot");
  }

  finishDrag() {
    this.drag?.btn.classList.remove("lifted");
    this.setDragUI(false);
    this.drag = null;
  }

  // Área que cancela ao soltar: o lugar do menu principal (onde a lixeira aparece).
  overDock(x, y) {
    const r = this.el.main.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* ---- menu de contexto (nome, dano, dano por segundo) ---- */
  showTip(card, id, withHint = false) {
    const t = this.towerData[id];
    if (!t) return;
    const c = t.combat;
    let html;
    if (t.mining) {                             // mina: só produz moedas
      const m = t.mining;
      html = `<b>${t.name}</b>Vida: ${t.health}<br>+${m.amount} moedas a cada ${m.interval}s<br>Por segundo: ${(m.amount / m.interval).toFixed(1)}`;
    } else if (t.heal) {                        // torre de restauração: laser de cura
      const h = t.heal;
      html = `<b>${t.name}</b>Vida: ${t.health}<br>Cura: ${h.amount} a cada ${h.interval}s<br>Por segundo: ${(h.amount / h.interval).toFixed(1)}<br>Alcance: ${h.range}<br>Energia: ${h.duration}s · recarga ${h.recharge}s`;
    } else if (t.trap) {                        // barril: armadilha de uso único
      html = `<b>${t.name}</b>Dano: ${t.trap.damage}<br>Área: ${t.trap.radius}<br>${t.description ?? "Uso único"}`;
    } else if (!c) {                            // construção que não ataca (muro)
      html = `<b>${t.name}</b>Vida: ${t.health}<br>${t.description ?? "Não ataca"}`;
    } else {
      const dps = (c.damage / c.cooldown).toFixed(1);
      const dmgLabel = c.splash > 0 ? "Dano total (dividido)" : "Dano";   // em área: um total repartido entre os atingidos
      html = `<b>${t.name}</b>Vida: ${t.health}<br>${dmgLabel}: ${c.damage}<br>Dano por segundo: ${dps}<br>Alcance: ${c.range}`;
      if (c.splash > 0) html += `<br>Área: ${c.splash}` + (c.maxPerTarget > 0 ? `<br>Máx. por inimigo: ${c.maxPerTarget}` : "");
    }
    if (withHint && this.coarse) html += `<span class="hint">Arraste até o mapa para construir</span>`;

    const tip = this.el.tip;
    clearTimeout(this.tipTimer);
    tip.innerHTML = html;
    tip.hidden = false;
    const r = card.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), window.innerWidth - w - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, r.top - h - 8)}px`;
  }

  hideTip() {
    clearTimeout(this.tipTimer);
    this.el.tip.hidden = true;
  }

  setSelected(id) {
    if (id && !this.trayOpen) this.setTray(true);
    this.el.cards.querySelectorAll(".tower-card")
      .forEach((c) => c.classList.toggle("selected", c.dataset.id === id));
  }

  /* ---- menu de contexto de uma estrutura construída (botões redondos) ---- */
  showContext(actions) {
    const m = this.el.ctx;
    m.innerHTML = "";
    this.ctxSig = actions.map((a) => a.id).join("|");
    for (const a of actions) {
      if (a.static) {                         // marcador não clicável (ex.: nível atual)
        const c = document.createElement("div");
        c.className = "ctx-chip";
        c.dataset.id = a.id;
        c.innerHTML = `<small>${a.caption ?? ""}</small><b></b>`;
        m.appendChild(c);
        continue;
      }
      const b = document.createElement("button");
      b.className = "ctx-btn";
      b.dataset.id = a.id;
      b.dataset.kind = a.kind ?? "";
      b.innerHTML = CTX_ICONS[a.icon] ?? `<b>${a.label[0]}</b>`;
      b.addEventListener("click", () => this.h.onContextAction(a.id));
      m.appendChild(b);
    }
    this.patchContext(actions);
    this.hideTip();
    m.hidden = false;
    m.style.visibility = "hidden";            // só aparece depois de ganhar uma posição válida
    m.classList.remove("pop");
    this.ctxPlaced = false;
  }

  // Atualiza textos/estados dos botões sem recriá-los (não perde o toque no meio do clique).
  patchContext(actions) {
    const m = this.el.ctx;
    for (const a of actions) {
      const el = m.querySelector(`[data-id="${a.id}"]`);
      if (!el) continue;
      el.title = a.label;
      if (a.static) {
        const v = el.querySelector("b");
        if (v.textContent !== String(a.text)) v.textContent = a.text;
        continue;
      }
      el.setAttribute("aria-label", a.label.split("\n")[0]);
      el.classList.toggle("poor", !!a.poor);       // sem moedas
      el.classList.toggle("maxed", !!a.disabled);  // nível máximo
      let badge = el.querySelector(".badge");
      if (a.badge) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "badge";
          el.appendChild(badge);
        }
        if (badge.textContent !== a.badge) badge.textContent = a.badge;
      } else badge?.remove();
    }
  }

  // Todo frame: se só os valores mudaram, atualiza no lugar; se os botões mudaram, recria.
  refreshContext(actions) {
    if (this.el.ctx.hidden) return;
    if (actions.map((a) => a.id).join("|") !== this.ctxSig) this.showContext(actions);
    else this.patchContext(actions);
  }

  hideContext() { this.el.ctx.hidden = true; }

  // (x, y) = ponto na tela logo acima da estrutura; o menu fica acima dele, com a setinha apontando.
  moveContext(x, y) {
    const m = this.el.ctx;
    if (m.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const w = m.offsetWidth, h = m.offsetHeight;
    const cx = Math.min(Math.max(x, w / 2 + 8), Math.max(w / 2 + 8, vw - w / 2 - 8));
    const cy = Math.min(Math.max(y, h + 24), vh - 8);     // sempre dentro da tela
    const reach = Math.max(0, w / 2 - 22);
    m.style.left = `${cx}px`;
    m.style.top = `${cy}px`;
    m.style.setProperty("--dx", `${Math.min(reach, Math.max(-reach, x - cx))}px`);
    if (!this.ctxPlaced) {                    // primeira posição válida: mostra com a animação
      this.ctxPlaced = true;
      m.style.visibility = "";
      void m.offsetWidth;
      m.classList.add("pop");
    }
  }

  /* ---- atualização por frame (só mexe no DOM se algo mudou) ---- */
  update(s) {
    this.text("coins", this.el.coins, s.coins);
    this.text("wave", this.el.wave, `Onda ${s.wave} · ${formatTime(s.time)}`);
    this.text("record", this.el.record, s.record > 0 ? `Recorde ${formatTime(s.record)}` : "");
    this.text("hp", this.el.castleText, Math.ceil(s.castleHealth));

    const ratio = Math.max(0, s.castleHealth) / s.castleMax;
    if (this.cache.ratio !== ratio) {
      this.cache.ratio = ratio;
      this.el.castleFill.style.width = `${ratio * 100}%`;
      this.el.castleFill.style.background = ratio > 0.5 ? "var(--leaf)" : ratio > 0.25 ? "var(--gold)" : "var(--berry)";
    }

    // Contagem regressiva da próxima onda: só aparece nos últimos segundos (3, 2, 1).
    const n = s.countdown != null && s.countdown <= s.countdownFrom ? Math.ceil(s.countdown) : null;
    if (this.cache.cd !== n) {
      this.cache.cd = n;
      if (n) this.countdownPop(n);
    }

    // Barra do tempo até a próxima onda (aparece quando a onda anterior termina e esvazia até a próxima).
    const wt = s.waveTimer;
    if (this.cache.wtShow !== !!wt) { this.cache.wtShow = !!wt; this.el.waveTimer.classList.toggle("show", !!wt); }
    if (wt) {
      const r = Math.min(1, Math.max(0, wt.left / wt.total));
      if (this.cache.wtRatio !== r) { this.cache.wtRatio = r; this.el.waveTimerFill.style.width = `${r * 100}%`; }
      const low = wt.left <= s.countdownFrom;
      if (this.cache.wtLow !== low) { this.cache.wtLow = low; this.el.waveTimer.classList.toggle("low", low); }
    }

    const undo = s.undo ?? 0;                   // obras em andamento que ainda dá para desfazer
    if (this.cache.undo !== undo) {
      this.cache.undo = undo;
      this.el.undo.disabled = undo <= 0;        // sempre visível; só fica desativado sem nada para desfazer
      this.el.undoCount.hidden = undo <= 1;
      this.el.undoCount.textContent = undo;
    }

    this.text("speed", this.el.btnSpeed, `${s.speed}x`);
    this.text("pause", this.el.btnPause, s.paused ? "▶" : "❚❚");

    const poorKey = Object.entries(this.towerCost ?? {}).map(([id, c]) => (s.coins < c ? id : "")).join("|");
    if (this.cache.poor !== poorKey) {
      this.cache.poor = poorKey;
      this.el.cards.querySelectorAll(".tower-card")
        .forEach((c) => c.classList.toggle("poor", s.coins < this.towerCost[c.dataset.id]));
    }
  }

  text(key, el, value) {
    if (this.cache[key] !== value) { this.cache[key] = value; el.textContent = value; }
  }

  // "+N" dourado que sobe e some sobre a mina (posição em px da tela).
  floatCoins(x, y, amount) {
    const el = document.createElement("div");
    el.className = "coin-pop";
    el.textContent = `+${amount}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 1600);       // reserva (ex.: animações desligadas)
    this.el.hud.appendChild(el);
  }

  // `sound`: toca o "erro" junto com mensagens ruins (desligue quando o evento já tem som próprio).
  message(text, bad = false, sound = bad) {
    if (sound) Sound.play("ui_erro");
    const t = this.el.toast;
    t.textContent = text;
    t.classList.toggle("bad", bad);
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // Texto grande no centro superior (contagem e aviso de ataque).
  banner(text, ms, attack = false) {
    const b = this.el.countdown;
    b.textContent = text;
    b.classList.remove("show", "tick", "attack", "n1", "n2", "n3");
    void b.offsetWidth;                       // reinicia a animação
    b.classList.add("show");
    if (attack) b.classList.add("attack", "tick");   // aviso de ataque usa a mesma animação da contagem
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove("show", "tick"), ms);
  }

  announceAttack() { this.banner("Ataque inimigo!", 1600, true); }

  // Contagem 3, 2, 1: usa o mesmo #countdown, com a classe .tick e uma cor por número.
  countdownPop(n) {
    const b = this.el.countdown;
    b.textContent = n;
    b.classList.remove("show", "attack", "tick", "n1", "n2", "n3");
    void b.offsetWidth;                       // reinicia a animação
    b.classList.add("show", "tick", `n${n}`);
    Sound.play("contagem_bip", { pitch: n === 1 ? 1.5 : 1 });
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove("show", "tick"), 1000);
  }

  flashDamage() {
    this.el.flash.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.flash.classList.remove("on")));
  }
}