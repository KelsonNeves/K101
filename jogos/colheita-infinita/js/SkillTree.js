// SkillTree.js — tela da árvore de habilidades (desenho, pan/zoom, compra).
// A única regra de visibilidade é isVisible (Game.js): raiz, ou pai já desbloqueado.
import { SKILLS, SKILL_BY_ID, TREE } from './Skills.js';
import { STAT_LABELS } from './Data.js';
import { CROPS } from './Crops.js';
import { isVisible, fmtMoney } from './Game.js';

const ZMIN = 0.6, ZMAX = 1.4;
const NS = 'http://www.w3.org/2000/svg';
const fmtNum = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function describeEffect(e) {
  if (e.unlock === 'crop') return `Libera ${CROPS[e.id]?.name ?? e.id}`;
  if (e.unlock === 'plow') return `Libera o arado ${e.index + 1}`;
  const label = STAT_LABELS[e.stat] ?? e.stat;
  if (e.add !== undefined) return `${e.add >= 0 ? '+' : '−'}${fmtNum(Math.abs(e.add))} ${label}`;
  if (e.mul !== undefined) {
    const pct = Math.round((e.mul - 1) * 100);
    return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% ${label}`;
  }
  return '';
}

export class SkillTree {
  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.vp = this.$('tree-viewport');
    this.world = this.$('tree-world');
    this.lines = this.$('tree-lines');
    this.nodesEl = this.$('tree-nodes');
    this.nodes = new Map();       // id → elemento do nó
    this.paths = new Map();       // id do filho → <path>
    this.selected = null;
    this.tx = 0; this.ty = 0; this.z = 1;
    this.drag = null;
    this.pts = new Map();         // ponteiros ativos (id → posição): 1 = arrastar, 2 = pinça
    this.pinch = null;
    this.gestureMoved = false;    // o gesto atual arrastou/deu zoom: não conta como clique no nó
    this.justDragged = false;
    this.glideTimer = 0;
    this.bind();
  }

  bind() {
    const g = this.game;
    this.nodesEl.addEventListener('click', (e) => {
      if (this.justDragged) return;
      const n = e.target.closest('.node');
      if (n) this.select(n.dataset.id);
    });
    this.$('sk-buy').addEventListener('click', () => { if (this.selected) g.buy(this.selected); });
    this.$('btn-next-day').addEventListener('click', () => g.nextDay());
    this.$('sk-zin').addEventListener('click', () => this.zoomBy(1.15, this.vp.clientWidth / 2, this.vp.clientHeight / 2));
    this.$('sk-zout').addEventListener('click', () => this.zoomBy(1 / 1.15, this.vp.clientWidth / 2, this.vp.clientHeight / 2));
    this.$('sk-center').addEventListener('click', () => this.center(true));

    const vp = this.vp;
    vp.style.touchAction = 'none';
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // Ponteiros ativos: 1 dedo/mouse = arrastar; 2 dedos = pinça (zoom e arrasto juntos).
    vp.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.pts.size >= 2 && !this.pts.has(e.pointerId)) return;        // só os 2 primeiros dedos contam
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pts.size === 1) {
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false };
      } else if (this.pts.size === 2) {
        this.startPinch();
      }
    });
    vp.addEventListener('pointermove', (e) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pinch) { this.updatePinch(); return; }
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 6) {
        d.moved = true;
        try { vp.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
        this.world.classList.remove('glide');
        vp.classList.add('dragging');
      }
      if (d.moved) { this.tx = d.tx + dx; this.ty = d.ty + dy; this.apply(); }
    });
    const end = (e) => {
      if (!this.pts.delete(e.pointerId)) return;
      if (this.pinch) {
        // Soltou um dos dois dedos: o que sobrou continua arrastando, sem pulo.
        this.pinch = null;
        const rest = [...this.pts.entries()][0];
        this.drag = rest ? { id: rest[0], x: rest[1].x, y: rest[1].y, tx: this.tx, ty: this.ty, moved: true } : null;
      } else if (this.drag && this.drag.id === e.pointerId) {
        if (this.drag.moved) this.gestureMoved = true;
        this.drag = null;
      }
      if (this.pts.size === 0) {
        if (this.gestureMoved) { this.justDragged = true; setTimeout(() => { this.justDragged = false; }, 60); }
        this.gestureMoved = false;
        this.drag = null;
        vp.classList.remove('dragging');
      }
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    addEventListener('resize', () => { if (!this.$('ov-skills').hidden) this.center(false); });
  }

  /* --------------------------------- abrir --------------------------------- */
  open() {
    // Recomeça do zero (novo jogo ou volta ao título podem ter mudado as habilidades compradas).
    this.nodes.clear(); this.paths.clear();
    this.nodesEl.innerHTML = ''; this.lines.innerHTML = '';
    this.z = 1;
    this.pts.clear(); this.pinch = null; this.drag = null; this.gestureMoved = false;
    this.selected = null;
    this.render([]);
    // Seleciona a raiz quando ela ainda não foi desbloqueada (é a única célula na tela).
    const first = SKILLS.find((s) => isVisible(this.game, s) && !this.game.owned.has(s.id));
    if (first) this.selected = first.id;
    this.updateHeader();
    this.updatePanel();
    this.markSelected();
    this.center(false);
  }

  /* ------------------------------- desenho ------------------------------- */
  render(born) {
    const g = this.game, bornSet = new Set(born);
    document.documentElement.style.setProperty('--node-size', `${TREE.nodeSize}px`);
    for (const s of SKILLS) {
      if (!isVisible(g, s)) continue;
      let el = this.nodes.get(s.id);
      if (!el) {
        el = this.makeNode(s);
        this.nodes.set(s.id, el);
        this.nodesEl.appendChild(el);
        if (bornSet.has(s.id)) {
          el.classList.add('born');
          el.addEventListener('animationend', () => el.classList.remove('born'), { once: true });
        }
      }
      if (s.parent !== null && !this.paths.has(s.id)) {
        const p = SKILL_BY_ID[s.parent];
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M ${p.at[0] * TREE.spacing} ${p.at[1] * TREE.spacing} L ${s.at[0] * TREE.spacing} ${s.at[1] * TREE.spacing}`);
        path.setAttribute('pathLength', '1');
        if (bornSet.has(s.id)) {
          path.classList.add('born');
          path.addEventListener('animationend', () => path.classList.remove('born'), { once: true });
        }
        this.lines.appendChild(path);
        this.paths.set(s.id, path);
      }
      this.styleNode(s, el);
    }
    for (const [id, path] of this.paths) path.classList.toggle('on', g.owned.has(id));
  }

  makeNode(s) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'node';
    b.dataset.id = s.id;
    b.style.left = `${s.at[0] * TREE.spacing}px`;
    b.style.top = `${s.at[1] * TREE.spacing}px`;

    const ico = document.createElement('span'); ico.className = 'n-ico';
    const img = document.createElement('img'); img.alt = ''; img.draggable = false;
    const glyph = document.createElement('span'); glyph.className = 'n-glyph'; glyph.textContent = s.name.charAt(0); glyph.hidden = true;
    const file = s.icon ?? `${s.id}.webp`;
    img.onerror = () => {
      if (!img.dataset.tried) {
        img.dataset.tried = '1';
        console.warn(`[SkillTree] ícone ausente: assets/icons/skills/${file}`);
        img.src = 'assets/icons/skills/_missing.webp';
      } else { img.hidden = true; glyph.hidden = false; }
    };
    img.src = `assets/icons/skills/${file}`;
    ico.append(img, glyph);

    const name = document.createElement('span'); name.className = 'n-name'; name.textContent = s.name;
    const price = document.createElement('span'); price.className = 'n-price';
    const seal = document.createElement('span'); seal.className = 'n-seal'; seal.textContent = '✓'; seal.hidden = true;
    b.append(ico, name, price, seal);
    return b;
  }

  // Estados: desbloqueada · disponível e acessível · disponível sem dinheiro suficiente
  styleNode(s, el) {
    const g = this.game;
    const owned = g.owned.has(s.id), afford = g.money >= s.cost;
    el.classList.toggle('owned', owned);
    el.classList.toggle('avail', !owned && afford);
    el.classList.toggle('poor', !owned && !afford);
    el.querySelector('.n-seal').hidden = !owned;
    el.querySelector('.n-price').textContent = owned ? '' : (afford ? (s.cost === 0 ? 'Grátis' : fmtMoney(s.cost)) : `faltam ${fmtMoney(s.cost - g.money)}`);
    const estado = owned ? 'desbloqueada' : afford ? 'disponível' : 'sem dinheiro suficiente';
    el.setAttribute('aria-label', `${s.name}, ${s.cost === 0 ? 'grátis' : `${s.cost} moedas`}, ${estado}`);
  }

  updateHeader() {
    this.$('sk-money').textContent = fmtMoney(this.game.money);
    this.$('sk-day').textContent = `DIA ${this.game.day}`;
  }

  /* ----------------------------- seleção e painel ----------------------------- */
  select(id) {
    this.selected = id;
    this.markSelected();
    this.updatePanel();
  }

  markSelected() {
    for (const [id, el] of this.nodes) el.classList.toggle('sel', id === this.selected);
  }

  updatePanel() {
    const g = this.game, s = this.selected && SKILL_BY_ID[this.selected];
    const name = this.$('sk-name'), desc = this.$('sk-desc'), eff = this.$('sk-effects'), buy = this.$('sk-buy');
    if (!s) {
      name.textContent = 'Árvore de habilidades';
      desc.textContent = 'Toque numa célula para ver os detalhes.';
      eff.textContent = '';
      buy.disabled = true; buy.textContent = 'Desbloquear';
      return;
    }
    const effects = s.effects.map(describeEffect).filter(Boolean);
    name.textContent = s.name;
    desc.textContent = s.desc ?? effects.join(' · ');
    eff.textContent = s.desc ? effects.join(' · ') : '';
    if (g.owned.has(s.id)) { buy.disabled = true; buy.textContent = 'Desbloqueada'; }
    else if (g.money < s.cost) { buy.disabled = true; buy.textContent = `Faltam ${fmtMoney(s.cost - g.money)}`; }
    else { buy.disabled = false; buy.textContent = s.cost === 0 ? 'Desbloquear · grátis' : `Desbloquear · ${fmtMoney(s.cost)}`; }
  }

  // Chamado por Game.buy().
  refresh({ born = [], from } = {}) {
    this.render(born);
    for (const s of SKILLS) { const el = this.nodes.get(s.id); if (el) this.styleNode(s, el); }
    this.updateHeader();
    if (from) this.selected = from;
    this.markSelected();
    this.updatePanel();
    if (born.length) this.focus([from, ...born], true);   // desliza até enquadrar os filhos novos
  }

  /* ------------------------------- pan e zoom ------------------------------- */
  apply() { this.world.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.z})`; }

  zoomBy(f, px, py) {
    const nz = Math.min(ZMAX, Math.max(ZMIN, this.z * f));
    const k = nz / this.z;
    this.tx = px - (px - this.tx) * k;
    this.ty = py - (py - this.ty) * k;
    this.z = nz;
    this.world.classList.remove('glide');
    this.apply();
  }

  // Pinça: guarda a distância inicial entre os dedos e o ponto do mundo sob o centro deles.
  startPinch() {
    const [a, b] = [...this.pts.values()];
    const r = this.vp.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    this.pinch = {
      d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z0: this.z,
      wx: (mx - this.tx) / this.z, wy: (my - this.ty) / this.z
    };
    this.drag = null;
    this.gestureMoved = true;                 // soltar os dedos não deve «clicar» num nó
    this.world.classList.remove('glide');
    this.vp.classList.add('dragging');
  }

  // Zoom proporcional à abertura dos dedos; o ponto sob o centro acompanha os dedos (zoom + arrastar).
  updatePinch() {
    const [a, b] = [...this.pts.values()];
    const p = this.pinch;
    const r = this.vp.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const z = Math.min(ZMAX, Math.max(ZMIN, p.z0 * Math.hypot(a.x - b.x, a.y - b.y) / p.d0));
    this.z = z;
    this.tx = mx - p.wx * z;
    this.ty = my - p.wy * z;
    this.apply();
  }

  // Centraliza a visão nos nós disponíveis (ou em todos, se não houver).
  center(animated) {
    const g = this.game;
    let ids = SKILLS.filter((s) => isVisible(g, s) && !g.owned.has(s.id)).map((s) => s.id);
    if (!ids.length) ids = [...this.nodes.keys()];
    this.focus(ids, animated);
  }

  focus(ids, animated) {
    const pts = ids.filter(Boolean).map((id) => SKILL_BY_ID[id]).filter(Boolean);
    if (!pts.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of pts) {
      const x = s.at[0] * TREE.spacing, y = s.at[1] * TREE.spacing;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const vw = this.vp.clientWidth, vh = this.vp.clientHeight;
    this.world.classList.toggle('glide', !!animated);
    this.tx = vw / 2 - cx * this.z;
    this.ty = vh / 2 - cy * this.z;
    this.apply();
    clearTimeout(this.glideTimer);
    this.glideTimer = setTimeout(() => this.world.classList.remove('glide'), 500);
  }
}
