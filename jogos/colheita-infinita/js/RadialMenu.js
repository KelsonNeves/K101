// RadialMenu.js — menu radial em HTML (PC e celular). Estilo só com as variáveis do tema.
import { TOOLS } from './Data.js';

export class RadialMenu {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('radial');
    this.isOpen = false;
    this.mode = 'around';
    this.suppressUntil = 0;

    // Clicar/tocar no fundo transparente fecha.
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) { e.preventDefault(); this.close(); }
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    // PC: ao soltar o botão direito sobre um item, ele é escolhido (segurar, arrastar e soltar).
    window.addEventListener('pointerup', (e) => {
      if (!this.isOpen || e.pointerType !== 'mouse' || e.button !== 2) return;
      const item = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rad-item');
      if (item) this.choose(item.dataset.key);
      // sem item: o menu fica aberto e o clique esquerdo escolhe
    });
  }

  layout(n, mode) {
    const R = Math.max(76, 30 * n);
    const angles = Array.from({ length: n }, (_, i) =>
      mode === 'fan'
        ? (n === 1 ? -90 : -160 + (140 * i) / (n - 1))
        : -90 + (360 * i) / n);
    return { R, angles };
  }

  open(x, y, mode = 'around') {
    const g = this.game;
    if (g.state !== 'DAY' || g.paused || g.countdown > 0 || g.ending > 0) return;
    const items = g.radialItems();
    this.mode = mode;
    const { R, angles } = this.layout(items.length, mode);

    // No PC o centro é limitado para o círculo inteiro caber na tela (margem de 40 px).
    let cx = x, cy = y;
    if (mode === 'around') {
      const m = R + 28 + 40;
      cx = Math.min(innerWidth - m, Math.max(m, x));
      cy = Math.min(innerHeight - m, Math.max(m, y));
    }

    this.el.innerHTML = '';
    this.el.hidden = false;
    if (mode === 'around') {
      const hub = document.createElement('div');
      hub.className = 'rad-hub';
      hub.style.left = `${cx}px`; hub.style.top = `${cy}px`;
      this.el.appendChild(hub);
    }
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rad-item' + (this.isSelected(it) ? ' sel' : '');
      b.dataset.key = it.key;
      b.setAttribute('aria-label', it.name);
      const a = (angles[i] * Math.PI) / 180;
      const tx = Math.cos(a) * R, ty = Math.sin(a) * R;
      b.style.left = `${cx}px`; b.style.top = `${cy}px`;
      b.style.setProperty('--tx', `${tx}px`);
      b.style.setProperty('--ty', `${ty}px`);
      b.style.setProperty('--delay', `${i * 60}ms`);
      const img = document.createElement('img');
      img.alt = ''; img.draggable = false; img.src = it.icon;
      const fallback = document.createElement('span');
      fallback.className = 'rad-glyph'; fallback.textContent = it.name.charAt(0);
      fallback.hidden = true;
      img.onerror = () => { img.hidden = true; fallback.hidden = false; };
      const lab = document.createElement('span');
      lab.className = 'rad-label'; lab.textContent = it.name;
      b.append(img, fallback, lab);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.choose(it.key); });
      this.el.appendChild(b);
    });
    this.isOpen = true;
    this.game.input.releaseAll();
  }

  isSelected(it) {
    const s = this.game.selection;
    return it.tool === s.tool && (it.tool !== 'plant' || it.crop === s.crop);
  }

  choose(key) {
    const it = this.game.radialItems().find((i) => i.key === key);
    if (it) this.game.selectItem(it);
    this.close();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.game.input.releaseAll();
  }
}
