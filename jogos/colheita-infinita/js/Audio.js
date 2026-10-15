// Audio.js — API de som do jogo. Chave de armazenamento: colheita-infinita:audio.
// Na v1 todos os efeitos saem do Synth.js; o mudo externo (anúncio / popup de saída)
// NÃO altera o volume nem o mudo salvo pelo jogador.
import { Synth } from './Synth.js';
import { SFX } from './Sfx.js';

const KEY = 'colheita-infinita:audio';

const synth = new Synth();
let muted = false, volume = 0.8, external = false;

try {
  const d = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (d) { muted = !!d.muted; if (Number.isFinite(d.volume)) volume = Math.min(1, Math.max(0, d.volume)); }
} catch { /* sem armazenamento */ }

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ muted, volume })); } catch { /* nada */ } };
const apply = () => synth.setVolume(muted || external ? 0 : volume);

export const Sound = {
  // Chamado no toque em Jogar/Continuar (gesto do usuário libera o áudio).
  unlock() { synth.resume(); apply(); },
  play(name) {
    if (muted || external) return;
    try { SFX[name]?.(synth); } catch { /* áudio é opcional */ }
  },
  setExternalMute(on) { external = !!on; apply(); },
  toggleMute() { muted = !muted; persist(); apply(); return muted; },
  get muted() { return muted; },
  // Hook para quando houver arquivos .ogg/.mp3 (manifest.json). Na v1 resolve na hora.
  async load(onProgress) { onProgress?.(1); }
};
