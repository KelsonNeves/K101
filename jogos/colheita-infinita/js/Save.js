// Save.js — localStorage com prefixo do slug. Tudo em try/catch (modo privado / cota cheia).
import { SKILL_BY_ID } from './Skills.js';
import { ITEM_BY_ID } from './Shop.js';

const KEY = 'colheita-infinita:save';

export class Save {
  constructor(game) { this.game = game; }

  read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1) return null;
      return {
        day: Math.max(1, d.day | 0),
        money: Math.max(0, Number(d.money) || 0),
        owned: (Array.isArray(d.owned) ? d.owned : []).filter((id) => SKILL_BY_ID[id] || ITEM_BY_ID[id]),   // ids antigos são ignorados
        best: { earned: Number(d.best?.earned) || 0, day: d.best?.day | 0 }
      };
    } catch { return null; }
  }

  // Código síncrono: também é chamado em exit:confirm.
  write() {
    try {
      const g = this.game;
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, day: g.day, money: g.money, owned: [...g.owned], best: g.best
      }));
    } catch { /* sem armazenamento: segue o jogo */ }
  }

  clear() { try { localStorage.removeItem(KEY); } catch { /* nada */ } }
}
