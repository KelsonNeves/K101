// ShopUI.js — tela da loja (arados e drones). Só HTML: preços e regras vêm de Shop.js; a compra, de Game.buyItem.
import { SHOP_CARDS, ITEM_BY_ID } from './Shop.js';
import { describeEffect } from './SkillTree.js';
import { fmtMoney } from './Game.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class ShopUI {
  constructor(game) {
    this.game = game;
    this.tab = 'drones';
    this.list = $('shop-list');
    document.querySelectorAll('#shop-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      this.list.scrollTop = 0;
      this.render();
    }));
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('.sh-pip');
      if (b && !b.disabled) game.buyItem(b.dataset.id);
    });
  }

  open() { this.render(); }
  refresh() { this.render(); }

  render() {
    const g = this.game, S = g.S, keep = this.list.scrollTop;
    $('shop-money').textContent = fmtMoney(g.money);
    $('shop-day').textContent = `DIA ${g.day}`;
    document.querySelectorAll('#shop-tabs [data-tab]').forEach((b) => {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    this.list.textContent = '';
    for (const card of SHOP_CARDS) {
      if (card.tab !== this.tab) continue;
      this.list.appendChild(this.makeCard(card, S));
    }
    this.list.scrollTop = keep;
  }

  makeCard(card, S) {
    const g = this.game;
    const root = el('article', 'sh-card');
    const head = el('div', 'sh-head');
    const ico = el('span', 'sh-ico');
    const img = el('img'); img.alt = ''; img.draggable = false;
    const glyph = el('span', 'sh-glyph', card.title.charAt(0)); glyph.hidden = true;
    img.onerror = () => { img.hidden = true; glyph.hidden = false; };
    img.src = `assets/icons/shop/${card.icon}`;
    ico.append(img, glyph);
    const info = el('div', 'sh-info');
    info.append(el('h3', '', card.title), el('p', 'sh-blurb', card.blurb), el('p', 'sh-status', card.status(S)));
    head.append(ico, info);
    root.appendChild(head);

    for (const row of card.rows) {
      const r = el('div', 'sh-row');
      r.appendChild(el('span', 'sh-label', row.label));
      const pips = el('div', 'sh-pips');
      row.ids.forEach((id) => {
        const it = ITEM_BY_ID[id];
        const owned = g.owned.has(id);
        const locked = !!it.requires && !g.owned.has(it.requires);
        const afford = g.money >= it.cost;
        const b = el('button', 'sh-pip');
        b.type = 'button'; b.dataset.id = id;
        b.classList.toggle('owned', owned);
        b.classList.toggle('locked', !owned && locked);
        b.classList.toggle('avail', !owned && !locked && afford);
        b.classList.toggle('poor', !owned && !locked && !afford);
        b.disabled = owned || locked || !afford;
        const label = row.ids.length > 1 ? it.name.split(' ').pop() : (owned ? 'Comprado' : 'Comprar');
        b.append(el('b', '', label), el('small', '', owned ? '✓' : fmtMoney(it.cost)));
        const effects = it.effects.map(describeEffect).filter(Boolean).join(' · ');
        b.title = [it.desc, effects].filter(Boolean).join('\n');
        b.setAttribute('aria-label', `${it.name}, ${fmtMoney(it.cost)} moedas, ${owned ? 'comprado' : locked ? 'bloqueado' : afford ? 'disponível' : 'sem dinheiro suficiente'}`);
        pips.appendChild(b);
      });
      r.appendChild(pips);
      root.appendChild(r);
    }
    return root;
  }
}
