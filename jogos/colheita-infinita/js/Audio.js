// Audio.js — API de som do jogo. Chave de armazenamento: colheita-infinita:audio.
// Arquivos opcionais em assets/audio/: agua.mp3 (aguar), colher.mp3 (colher) e musica.mp3 (fundo, em loop).
// Qualquer arquivo ausente cai no som sintetizado do Synth.js. O mudo externo (anúncio / popup de saída)
// NÃO altera o volume nem o mudo salvo pelo jogador.
import { Synth } from './Synth.js';
import { SFX } from './Sfx.js';

const KEY = 'colheita-infinita:audio';
const BASE = 'assets/audio/';
const SFX_FILES = { water: 'agua.mp3', harvest: 'colher.mp3' };   // nome do efeito (Sfx.js) → arquivo
const MUSIC_FILE = 'musica.mp3';
const MUSIC_GAIN = 0.35;                                          // a música fica mais baixa que os efeitos
const raw = {}, bufs = {}, decoding = new Set();
let music = null, musicStarted = false;

const synth = new Synth();
let muted = false, volume = 0.8, external = false;

try {
  const d = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (d) { muted = !!d.muted; if (Number.isFinite(d.volume)) volume = Math.min(1, Math.max(0, d.volume)); }
} catch { /* sem armazenamento */ }

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ muted, volume })); } catch { /* nada */ } };
const apply = () => {
  const off = muted || external;
  synth.setVolume(off ? 0 : volume);
  if (!music) return;
  music.volume = off ? 0 : volume * MUSIC_GAIN;
  if (off) music.pause();                                          // iOS ignora .volume: pausa de verdade
  else if (musicStarted) music.play().catch(() => {});
};

// Depois do 1º toque (o navegador só libera o áudio por gesto): decodifica os efeitos e inicia a música.
function startAudio() {
  for (const name of Object.keys(raw)) {
    if (bufs[name] || decoding.has(name)) continue;
    decoding.add(name);
    synth.decode(raw[name]).then((b) => { if (b) bufs[name] = b; });
  }
  musicStarted = true;
  apply();
}

export const Sound = {
  // Chamado no toque em Jogar/Continuar (gesto do usuário libera o áudio).
  unlock() { synth.resume(); startAudio(); },
  play(name) {
    if (muted || external) return;
    try {
      if (bufs[name]) synth.playBuffer(bufs[name], { gain: 0.9, rate: 0.96 + Math.random() * 0.08 });   // leve variação de tom
      else SFX[name]?.(synth);
    } catch { /* áudio é opcional */ }
  },
  setExternalMute(on) { external = !!on; apply(); },
  toggleMute() { muted = !muted; persist(); apply(); return muted; },
  get muted() { return muted; },
  // Baixa os arquivos de assets/audio/ (os que não existirem são ignorados: vale o som sintetizado).
  async load(onProgress) {
    const names = Object.keys(SFX_FILES);
    let done = 0;
    await Promise.all(names.map(async (n) => {
      try {
        const r = await fetch(BASE + SFX_FILES[n]);
        if (r.ok) raw[n] = await r.arrayBuffer();
      } catch { /* sem o arquivo */ }
      onProgress?.(++done / names.length);
    }));
    try {                                                           // música: só prepara, sem travar o carregamento
      const a = new Audio(BASE + MUSIC_FILE);
      a.loop = true; a.preload = 'auto';
      a.addEventListener('error', () => { if (music === a) music = null; });
      music = a;
    } catch { /* sem áudio */ }
    apply();
    onProgress?.(1);
  }
};