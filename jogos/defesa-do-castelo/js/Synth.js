/* ==========================================================================
   Synth.js — sons "graybox" gerados em código (sem arquivos).
   "Que som toca enquanto eu ainda não tenho o .ogg?"
   Funciona como o `fallback` dos modelos 3D: cada som de AUDIO.sounds (Data.js) traz uma
   receita `synth`. Na carga, a receita é renderizada UMA vez para um AudioBuffer
   (OfflineAudioContext); depois toca pelo mesmo caminho de um arquivo real.
   Se existir um arquivo com o nome do som em assets/audio/, ele substitui a receita.

   Receita:  { dur, loop?, layers: [ camada, ... ] }
   Camada:   w    "sine" | "triangle" | "square" | "sawtooth" | "noise"
             f    [início, fim] em Hz (varredura exponencial). No "noise" é a frequência do filtro.
             flt  "lowpass" | "highpass" | "bandpass"   (opcional)
             ff   [início, fim] do filtro quando a camada é um oscilador
             q    ressonância do filtro
             t0   atraso em s   t  duração em s   a  ataque em s
             g    volume (0 a 1)
             vib  [taxa Hz, profundidade Hz]   (vibrato)
   Com `loop: true` as frequências devem ser inteiras (buffer de 1 s) para emendar sem estalo.
   ========================================================================== */

const SAMPLE_RATE = 44100;

export async function renderSynth(recipe) {
  const length = Math.max(1, Math.ceil(recipe.dur * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);

  const noise = ctx.createBuffer(1, length, SAMPLE_RATE);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < length; i++) nd[i] = Math.random() * 2 - 1;

  for (const L of recipe.layers) {
    const t0 = L.t0 ?? 0;
    const t = L.t ?? Math.max(0.01, recipe.dur - t0);
    const attack = recipe.loop ? 0 : (L.a ?? 0.004);
    const g = L.g ?? 0.8;
    const [f0, f1 = f0] = L.f ?? [440];
    const end = t0 + t;

    let src, tail;
    if (L.w === "noise") {
      src = ctx.createBufferSource();
      src.buffer = noise;
      tail = src;
      if (L.flt) {
        const flt = ctx.createBiquadFilter();
        flt.type = L.flt;
        flt.Q.value = L.q ?? 1;
        flt.frequency.setValueAtTime(Math.max(20, f0), t0);
        flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), end);
        src.connect(flt);
        tail = flt;
      }
    } else {
      src = ctx.createOscillator();
      src.type = L.w ?? "sine";
      src.frequency.setValueAtTime(Math.max(20, f0), t0);
      src.frequency.exponentialRampToValueAtTime(Math.max(20, f1), Math.max(end, t0 + 0.001));
      tail = src;
      if (L.vib) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = L.vib[0];
        depth.gain.value = L.vib[1];
        lfo.connect(depth).connect(src.frequency);
        lfo.start(t0);
        lfo.stop(end + 0.05);
      }
      if (L.flt) {
        const [a0, a1 = a0] = L.ff ?? [2000];
        const flt = ctx.createBiquadFilter();
        flt.type = L.flt;
        flt.Q.value = L.q ?? 1;
        flt.frequency.setValueAtTime(Math.max(20, a0), t0);
        flt.frequency.exponentialRampToValueAtTime(Math.max(20, a1), Math.max(end, t0 + 0.001));
        src.connect(flt);
        tail = flt;
      }
    }

    const env = ctx.createGain();
    if (recipe.loop) {
      env.gain.setValueAtTime(g, 0);
    } else {
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(g, t0 + Math.max(0.001, attack));
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    tail.connect(env).connect(ctx.destination);
    src.start(t0);
    src.stop(end + 0.05);
  }

  const buffer = await ctx.startRendering();

  // Normaliza o pico: o volume final passa a depender só de `gain` no Data.js.
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) { const k = 0.9 / peak; for (let i = 0; i < data.length; i++) data[i] *= k; }
  return buffer;
}
