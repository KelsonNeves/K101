/* ==========================================================================
   Audio.js — motor de áudio (Web Audio API).
   "Como um som sai nas caixas?"
   Não conhece regras do jogo: quem decide QUANDO tocar é o Sfx.js / Game.js.
   Quem chama só diz o nome:  Sound.play("arrow_shoot", { x, y, z })

   Estrutura (a mesma ideia dos motores profissionais, em miniatura):
     fonte → ganho da voz → (pan) → BUS (sfx | ui | music) → master → compressor/limitador → saída
   - Os sons são decodificados uma vez em AudioBuffer (latência mínima; nada de <audio> para efeitos).
   - Sons em posição do mundo: o volume cai e o pan (esquerda/direita) segue a posição na TELA;
     o zoom da câmera também conta (veja AUDIO.foco em Data.js e o localizador no Game.js).
   - Variação de tom/volume e várias versões do mesmo som: o jogo não soa repetitivo.
   - Limites: cooldown por som, vozes por som e vozes totais (multidão de inimigos não vira ruído).
   - Pausa: o bus "sfx" (mundo) silencia; o bus "ui" continua.
   - Arquivo em assets/audio/ substitui a receita graybox (Synth.js) de mesmo nome.
   ========================================================================== */
import { AUDIO } from "./Data.js";
import { renderSynth } from "./Synth.js";

const STORE_KEY = "defesa-do-castelo:audio";
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const stemOf = (path) => path.split("/").pop().replace(/\.[^.]+$/, "");
const extOf = (path) => (path.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();

function loadSettings() {
  const base = { ...AUDIO.volumes, muted: false };
  try { return { ...base, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") }; } catch { return base; }
}

class SoundManager {
  constructor() {
    this.ctx = null;
    this.buses = {};
    this.buffers = new Map();     // id → [AudioBuffer, ...] (variações)
    this.voices = new Map();      // id → Set de vozes ativas
    this.lastPlayed = new Map();  // id → performance.now() do último toque
    this.loops = new Map();       // chave → { src, gain, pan, id }
    this.musicFiles = new Map();  // id da música → URL
    this.activeVoices = 0;
    this.locator = null;          // (x, y, z) → { gain, pan } | null  (definido pelo Game)
    this.settings = loadSettings();
    this.worldPaused = false;
    this.externalMute = false;    // mudo temporário imposto pela plataforma (anúncio); não é salvo
    this.music = null;            // { name, el, gain }
    this.wantMusic = null;        // música pedida antes do navegador liberar o áudio
    this.listeners = [];          // chamados quando volume/mudo mudam (a UI se atualiza)
    this.ready = false;
  }

  get muted() { return this.settings.muted; }

  /* ------------------------------ inicialização ------------------------------ */
  // Chamado uma vez pelo Game.start(). Nunca lança erro: sem áudio o jogo continua normal.
  async load(onProgress = () => {}) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.buildGraph();
      this.installUnlock();

      const ids = Object.keys(AUDIO.sounds);
      let done = 0;
      await Promise.all(ids.map(async (id) => {      // 1) receitas graybox
        try {
          const def = AUDIO.sounds[id];
          if (def.synth) this.buffers.set(id, [await renderSynth(def.synth)]);
        } catch (err) { console.warn(`[áudio] receita "${id}" falhou`, err); }
        onProgress(++done / (ids.length + 1));
      }));
      await this.loadFiles();                         // 2) arquivos reais (substituem as receitas)
      onProgress(1);
      this.ready = true;
      if (this.wantMusic) this.playMusic(this.wantMusic);
    } catch (err) {
      console.warn("[áudio] desativado:", err);
    }
  }

  buildGraph() {
    const ctx = this.ctx;
    this.limiter = ctx.createDynamicsCompressor();    // evita estourar quando muita coisa toca junto
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.limiter).connect(ctx.destination);
    for (const name of ["sfx", "ui", "music"]) {
      this.buses[name] = ctx.createGain();
      this.buses[name].connect(this.master);
    }
    this.applyVolumes(true);
  }

  // Lê assets/audio/manifest.json (gerado na raiz do site: node tools/make-audio-manifest.mjs jogos/defesa-do-castelo). Sem ele, só as receitas tocam.
  async loadFiles() {
    let list = [];
    try {
      const res = await fetch(AUDIO.basePath + AUDIO.manifest, { cache: "no-cache" });
      if (!res.ok) return;
      list = (await res.json()).files ?? [];
    } catch { return; }

    // Agrupa por nome (sem extensão) e escolhe o melhor formato que este navegador toca.
    const probe = document.createElement("audio");
    const playable = (ext) => !!probe.canPlayType?.({ ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" }[ext] ?? "");
    const rank = (ext) => { const i = AUDIO.formats.indexOf(ext); return i < 0 ? 99 : i; };
    const byStem = new Map();
    for (const path of list) {
      const ext = extOf(path);
      if (!playable(ext)) continue;
      const stem = path.replace(/\.[^.]+$/, "");
      const cur = byStem.get(stem);
      if (!cur || rank(ext) < rank(extOf(cur))) byStem.set(stem, path);
    }

    const musicIds = new Set(Object.values(AUDIO.music));
    const groups = new Map();                          // id → [caminho, ...]
    for (const path of byStem.values()) {
      const name = stemOf(path);
      if (musicIds.has(name)) { this.musicFiles.set(name, AUDIO.basePath + path); continue; }
      const id = AUDIO.sounds[name] ? name : name.replace(/_\d+$/, "");
      if (!AUDIO.sounds[id]) { console.warn(`[áudio] arquivo sem som correspondente: ${path}`); continue; }
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(path);
    }

    await Promise.all([...groups].map(async ([id, paths]) => {
      const decoded = [];
      for (const path of paths.sort()) {
        try {
          const data = await (await fetch(AUDIO.basePath + path)).arrayBuffer();
          decoded.push(await this.ctx.decodeAudioData(data));
        } catch (err) { console.warn(`[áudio] não carregou ${path}`, err); }
      }
      if (decoded.length) this.buffers.set(id, decoded);
    }));
  }

  // Os navegadores só liberam o áudio depois de um gesto do jogador.
  installUnlock() {
    const events = ["pointerdown", "pointerup", "touchend", "keydown", "click"];
    const unlock = () => {
      if (this.ctx.state === "running") return;
      this.ctx.resume().then(() => {
        if (this.ctx.state !== "running") return;
        events.forEach((e) => window.removeEventListener(e, unlock, true));
        if (this.wantMusic) this.playMusic(this.wantMusic);
      }).catch(() => {});
    };
    events.forEach((e) => window.addEventListener(e, unlock, true));
    document.addEventListener("visibilitychange", () => {      // aba em segundo plano: cala tudo
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  /* ------------------------------ volumes ------------------------------ */
  applyVolumes(instant = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.settings;
    const set = (node, v) => (instant ? (node.gain.value = v) : node.gain.setTargetAtTime(v, t, 0.04));
    set(this.master, s.muted || this.externalMute ? 0 : s.master);
    set(this.buses.sfx, this.worldPaused ? 0 : s.sfx);
    set(this.buses.ui, 1);
    set(this.buses.music, s.music);
  }

  setVolume(name, value) {
    if (!(name in this.settings) || name === "muted") return;
    this.settings[name] = clamp(Number(value) || 0, 0, 1);
    this.save();
    this.applyVolumes();
  }

  // Usado pela plataforma K101 durante anúncios. Não mexe na preferência salva do jogador.
  setExternalMute(on) {
    this.externalMute = !!on;
    this.applyVolumes();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.save();
    this.applyVolumes();
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* só vale nesta sessão */ }
    this.listeners.forEach((fn) => fn(this.settings));
  }

  onChange(fn) { this.listeners.push(fn); }

  // Pausa do jogo: silencia o mundo (bus "sfx"); a interface continua audível.
  setWorldPaused(paused) {
    this.worldPaused = paused;
    this.applyVolumes();
    this.music && this.musicGain(paused ? 0.35 : 1);
  }

  setLocator(fn) { this.locator = fn; }

  /* ------------------------------ efeitos ------------------------------ */
  // Toca uma vez. opts: { x, y, z } posição no mundo · volume · pitch · delay (s)
  play(id, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return null;
    const def = AUDIO.sounds[id], list = this.buffers.get(id);
    if (!def || !list?.length) return null;

    const D = AUDIO.defaults;
    const now = performance.now();
    const cooldown = def.cooldown ?? D.cooldown;
    if (cooldown && now - (this.lastPlayed.get(id) ?? -Infinity) < cooldown) return null;
    const set = this.voices.get(id) ?? new Set();
    if (set.size >= (def.maxVoices ?? D.maxVoices)) return null;
    if (this.activeVoices >= AUDIO.maxVoices && (def.priority ?? 1) < 2) return null;

    let gain = 1, pan = 0;
    if (opts.x !== undefined && this.locator) {           // posição no mundo → volume e pan
      const at = this.locator(opts.x, opts.y ?? 0, opts.z ?? 0, def.alcance);
      if (!at || at.gain < 0.03) return null;
      gain = at.gain; pan = at.pan;
    }

    const vary = def.vary !== false;
    const [p0, p1] = def.pitch ?? D.pitch;
    const [v0, v1] = D.volume;
    const rate = (opts.pitch ?? 1) * (vary ? rand(p0, p1) : 1);
    const volume = (def.gain ?? 1) * (opts.volume ?? 1) * gain * (vary ? rand(v0, v1) : 1);

    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = volume;
    let tail = src.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail = tail.connect(p);
    }
    tail.connect(this.buses[def.bus ?? "sfx"]);

    this.lastPlayed.set(id, now);
    set.add(src);
    this.voices.set(id, set);
    this.activeVoices++;
    src.onended = () => { set.delete(src); this.activeVoices--; };
    src.start(ctx.currentTime + (opts.delay ?? 0));
    return src;
  }

  /* ------------------------------ sons contínuos ------------------------------ */
  // Mantém um som em loop vivo sob uma chave (ex.: "heal:12"). Chame todo frame: cria, atualiza
  // volume/pan/tom e, se parar de ser chamado, o Sfx.js manda parar com stopLoop.
  loop(key, id, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const def = AUDIO.sounds[id], list = this.buffers.get(id);
    if (!def || !list?.length) return;

    let gain = 1, pan = 0;
    if (opts.x !== undefined && this.locator) {
      const at = this.locator(opts.x, opts.y ?? 0, opts.z ?? 0, def.alcance);
      if (at) { gain = at.gain; pan = at.pan; } else gain = 0;
    }
    const volume = (def.gain ?? 1) * (opts.volume ?? 1) * gain;
    const t = ctx.currentTime;

    let lp = this.loops.get(key);
    if (!lp) {
      const src = ctx.createBufferSource();
      src.buffer = list[0];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      let tail = src.connect(g);
      if (p) tail = tail.connect(p);
      tail.connect(this.buses[def.bus ?? "sfx"]);
      src.start();
      lp = { src, g, p };
      this.loops.set(key, lp);
    }
    lp.g.gain.setTargetAtTime(volume, t, 0.08);       // entra/sai suave (sem estalo)
    lp.p?.pan.setTargetAtTime(pan, t, 0.08);
    lp.src.playbackRate.setTargetAtTime(opts.pitch ?? 1, t, 0.1);
  }

  stopLoop(key) {
    const lp = this.loops.get(key);
    if (!lp) return;
    this.loops.delete(key);
    const t = this.ctx.currentTime;
    lp.g.gain.setTargetAtTime(0, t, 0.05);
    try { lp.src.stop(t + 0.3); } catch { /* já parou */ }
  }

  stopLoops(prefix = "") {
    for (const key of [...this.loops.keys()]) if (key.startsWith(prefix)) this.stopLoop(key);
  }

  hasLoop(key) { return this.loops.has(key); }

  /* ------------------------------ música ------------------------------ */
  // playMusic("preparo") troca (com fade) para a faixa da situação; playMusic(null) silencia.
  // Música usa <audio> em streaming (faixas longas não cabem decodificadas na memória).
  playMusic(name) {
    this.wantMusic = name;
    if (!this.ctx || !this.ready) return;
    if (this.music?.name === name) return;

    const old = this.music;
    this.music = null;
    if (old) {
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      setTimeout(() => { old.el.pause(); old.src.disconnect(); old.gain.disconnect(); }, 2500);
    }
    const url = name ? this.musicFiles.get(AUDIO.music[name]) : null;
    if (!url || this.ctx.state !== "running") return;

    const el = new Audio(url);
    el.loop = true;
    el.crossOrigin = "anonymous";
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.buses.music);
    gain.gain.setTargetAtTime(this.worldPaused ? 0.35 : 1, this.ctx.currentTime, 0.6);   // fade-in
    el.play().catch(() => {});
    this.music = { name, el, src, gain };
  }

  musicGain(v) { this.music?.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
}

export const Sound = new SoundManager();