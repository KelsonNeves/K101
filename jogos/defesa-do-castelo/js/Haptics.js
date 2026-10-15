/* ==========================================================================
   Haptics.js — resposta por vibração.
   "Que vibração o jogador sente agora?"
   Os padrões ficam em Data.js (GAME_CONFIG.haptics). Quem chama só diz o nome:
   Haptics.play("tap"). Sem suporte (computador, iPhone/Safari) não faz nada.
   ========================================================================== */
import { GAME_CONFIG } from "./Data.js";

const cfg = GAME_CONFIG.haptics ?? {};
const lastPlayed = {};

// Os navegadores só deixam vibrar depois que o jogador já tocou na página.
const userActivated = () => navigator.userActivation?.hasBeenActive ?? true;

export const Haptics = {
  enabled: cfg.enabled ?? true,

  get supported() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  },

  // Toca um padrão de GAME_CONFIG.haptics.patterns. Retorna true se mandou vibrar.
  play(name) {
    if (!this.enabled || !this.supported || !userActivated()) return false;
    const pattern = cfg.patterns?.[name];
    if (!pattern) return false;

    const now = performance.now();
    if (pattern.minGap && now - (lastPlayed[name] ?? -Infinity) < pattern.minGap) return false;
    lastPlayed[name] = now;

    try { return navigator.vibrate(pattern.vibrate) === true; } catch { return false; }
  },

  stop() {
    try { navigator.vibrate?.(0); } catch { /* sem suporte */ }
  }
};
