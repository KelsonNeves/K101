// Sfx.js — receitas dos efeitos sonoros (todos sintetizados por Synth.js na v1).
export const SFX = {
  plant:   (s) => { s.noise({ dur: 0.12, gain: 0.18, freq: 400, q: 0.8 }); s.tone({ freq: 180, to: 110, dur: 0.1, type: 'triangle', gain: 0.12 }); },
  water:   (s) => { s.noise({ dur: 0.22, gain: 0.14, freq: 2600, q: 1.5 }); s.tone({ freq: 700, to: 1100, dur: 0.12, type: 'sine', gain: 0.06 }); },
  harvest: (s) => { s.noise({ dur: 0.1, gain: 0.15, freq: 3000, q: 1 }); s.tone({ freq: 520, to: 780, dur: 0.14, type: 'triangle', gain: 0.16 }); },
  coin:    (s) => { s.tone({ freq: 988, dur: 0.07, type: 'square', gain: 0.07 }); s.tone({ freq: 1319, dur: 0.12, type: 'square', gain: 0.07, delay: 0.06 }); },
  tick:    (s) => { s.tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.07 }); },
  dayEnd:  (s) => { [523, 659, 784, 1047].forEach((f, i) => s.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.14, delay: i * 0.11 })); },
  unlock:  (s) => { [392, 523, 659].forEach((f, i) => s.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.16, delay: i * 0.07 })); },
  click:   (s) => { s.tone({ freq: 620, dur: 0.05, type: 'triangle', gain: 0.1 }); },
  ready:   (s) => { s.tone({ freq: 1200, dur: 0.04, type: 'sine', gain: 0.05 }); }
};
