// Synth.js — gerador de efeitos com WebAudio (sem arquivos). Tudo opcional: sem WebAudio, não faz nada.
export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
    return this.ctx;
  }

  resume() { try { this.ensure()?.resume?.(); } catch { /* sem áudio */ } }
  // Congela o relógio do WebAudio (nenhum efeito agendado toca depois). Não cria o contexto se ele ainda não existe.
  suspend() { try { this.ctx?.suspend?.()?.catch?.(() => {}); } catch { /* sem áudio */ } }
  setVolume(v) { if (this.master) this.master.gain.value = v; }

  // Decodifica um .mp3/.ogg já baixado (ArrayBuffer). Devolve null se o arquivo for inválido.
  async decode(arrayBuffer) {
    const ctx = this.ensure();
    if (!ctx) return null;
    try { return await ctx.decodeAudioData(arrayBuffer.slice(0)); } catch { return null; }
  }

  // Toca um áudio decodificado (pode sobrepor várias vezes: drones usam o mesmo som).
  playBuffer(buf, { gain = 0.9, rate = 1 } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !buf) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g); g.connect(this.master);
    src.start();
  }

  // Tom com envelope: freq (ou [de, para]), duração (s), tipo de onda, ganho.
  tone({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.2, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // Ruído filtrado (água, folhas, terra).
  noise({ dur = 0.15, gain = 0.15, freq = 1200, q = 1, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }
}