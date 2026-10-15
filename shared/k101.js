/* ==========================================================================
   /shared/k101.js — SDK K101 v1: menu flutuante + ponte jogo ↔ plataforma.
   Incluído em todo jogo com:  <script type="module" src="/shared/k101.js"></script>
   (depois do importmap, se o jogo tiver um). O jogo informa o próprio id com
   <meta name="k101-game" content="slug"> e a reserva do topo com <meta name="k101-safe-top" content="44">.
   Eventos chegam ao jogo como CustomEvent no window: "k101:menu:open", "k101:ad:start", ...
   ========================================================================== */
const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content;
const listeners = {};
const root = document.documentElement;
const reqFS = root.requestFullscreen ?? root.webkitRequestFullscreen;
const exitFS = document.exitFullscreen ?? document.webkitExitFullscreen;
const fsOn = () => !!(document.fullscreenElement ?? document.webkitFullscreenElement);
/* Aparência: o menu e o popup leem TUDO de /shared/tema.css (cores, bordas, botões, formas, fonte).
   Se a página do jogo não tiver o <link> do tema, o SDK o adiciona sozinho. */
if (!document.querySelector('link[href$="/shared/tema.css"]')) {
  const tema = document.createElement("link");
  tema.rel = "stylesheet";
  tema.href = "/shared/tema.css";
  document.head.appendChild(tema);
}
const swallow = (p) => { try { p?.catch?.(() => {}); } catch { /* sem suporte */ } };

export const K101 = {
  sdk: 1,
  gameId: meta("k101-game") ?? "desconhecido",
  safeTop: Number(meta("k101-safe-top") ?? 52),
  home: "/",

  // true enquanto algo da plataforma (popup de saída, futuramente anúncio) está na frente do jogo.
  // Alternativa/reforço aos eventos: no loop do jogo, `if (window.K101?.blocked) return;`
  _holds: new Set(),
  get blocked() { return this._holds.size > 0; },

  on(event, fn) {
    (listeners[event] ??= []).push(fn);
    return () => { listeners[event] = listeners[event].filter((f) => f !== fn); };
  },
  emit(event, detail) {
    (listeners[event] ?? []).forEach((fn) => { try { fn(detail); } catch (err) { console.error(err); } });
    window.dispatchEvent(new CustomEvent(`k101:${event}`, { detail }));
  },

  fullscreen: {
    supported: !!reqFS && !!(document.fullscreenEnabled ?? document.webkitFullscreenEnabled),   // iPhone: false
    get active() { return fsOn(); },
    toggle() { swallow(fsOn() ? exitFS.call(document) : reqFS.call(root)); }
  },
  goHome() { location.href = K101.home; },
  // Pede confirmação antes de sair: avisa o jogo (pausar) e mostra o popup. Só sai se o jogador confirmar.
  confirmExit() { exitDialog.open(); },

  // Anúncios: gerencia anúncios em tela cheia (interstitials) sem banners no layout.
  ads: {
    enabled: true,
    
    // Função para verificar se deve exibir o anúncio na entrada (na 1ª abertura e depois a cada 3 aberturas)
    checkEntryAd() {
      const KEY = 'k101_global_game_opens';
      let opens = parseInt(localStorage.getItem(KEY) || '0', 10);
      opens += 1;
      localStorage.setItem(KEY, opens.toString());

      // Se for a 1ª vez (1) ou múltiplos de 3 (ex: 1, 4, 7, 10...)
      if (opens === 1 || (opens - 1) % 3 === 0) {
        return this.request('interstitial', { reason: 'entry' });
      }
      return Promise.resolve({ shown: false, skipped: true });
    },

    async request(type, info = {}) {
      // Quando a conta AdSense/Ad Manager estiver ativa, a chamada real do bloco entra aqui.
      // Por enquanto, avisa o jogo para pausar/despausar normalmente.
      return { shown: false, rewarded: false };
    }
  }
};
window.K101 = K101;

root.style.setProperty("--k101-safe-top", `${K101.safeTop}px`);
const onFS = () => K101.emit("fullscreen:change", { active: fsOn() });
document.addEventListener("fullscreenchange", onFS);
document.addEventListener("webkitfullscreenchange", onFS);

/* ------------------------------ popup de confirmação de saída ------------------------------ */
class K101Exit extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
<style>
  :host { display: none; position: fixed; inset: 0; z-index: 2147483600; touch-action: none;
          -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  :host(.open) { display: grid; place-items: center; }
  .veil { position: absolute; inset: 0; background: var(--overlay);
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
  .box { position: relative; width: min(340px, calc(100vw - 40px)); box-sizing: border-box; padding: 26px 22px 22px;
         border: var(--borda); border-radius: var(--raio-card);
         background: var(--brilho-popup), var(--background2); box-shadow: var(--sombra-popup);
         color: var(--texto1); text-align: center; font: 600 16px/1.35 var(--fonte); }
  .box img { width: 96px; height: auto; max-height: 96px; display: block; margin: 0 auto 16px; }
  p { margin: 0 0 22px; font-size: 18px; font-weight: 800; text-wrap: balance; }
  .row { display: flex; gap: 10px; }
  button { all: unset; box-sizing: border-box; flex: 1; padding: 13px 10px; cursor: pointer; text-align: center;
           font: 800 16px/1 var(--fonte); border-radius: var(--raio-btn);
           border: var(--btn-borda-largura) solid transparent; transition: background .2s ease; }
  button:focus-visible { outline: var(--foco); outline-offset: 3px; }
  .cancel { background: var(--btn2-fundo); color: var(--btn2-texto); border-color: var(--btn2-borda); }
  .cancel:hover { background: var(--btn2-fundo-hover); }
  .leave { background: var(--btn3-fundo); color: var(--btn3-texto); border-color: var(--btn3-borda); }
  .leave:hover { background: var(--btn3-fundo-hover); }
</style>
<div class="veil"></div>
<div class="box" role="alertdialog" aria-modal="true" aria-labelledby="q">
  <img src="/shared/img/logo.svg" alt="K101">
  <p id="q">Deseja realmente sair do jogo?</p>
  <div class="row">
    <button class="cancel" type="button">Cancelar</button>
    <button class="leave" type="button">Sair</button>
  </div>
</div>`;

    const cancel = shadow.querySelector(".cancel"), leave = shadow.querySelector(".leave");
    const veil = shadow.querySelector(".veil");
    let previous = null;

    this.show = () => {
      if (this.classList.contains("open")) return;
      previous = document.activeElement;
      this.classList.add("open");
      K101._holds.add("exit");
      K101.emit("exit:open");
      cancel.focus();
    };
    const hide = () => {
      this.classList.remove("open");
      K101._holds.delete("exit");
      K101.emit("exit:cancel");
      try { previous?.focus?.(); } catch { /* sem foco anterior */ }
    };

    cancel.addEventListener("click", hide);
    veil.addEventListener("click", hide);
    leave.addEventListener("click", () => { K101.emit("exit:confirm"); K101.goHome(); });

    this.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); hide(); }
      if (e.key === "Tab") {
        e.preventDefault();
        (shadow.activeElement === cancel ? leave : cancel).focus();
      }
    });
    this.addEventListener("keyup", (e) => e.stopPropagation());

    window.addEventListener("pageshow", (e) => { if (e.persisted && this.classList.contains("open")) hide(); });

    for (const ev of ["pointerdown", "pointerup", "pointermove", "touchstart", "touchmove", "touchend", "wheel", "contextmenu", "click"])
      this.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
  }
}

if (!customElements.get("k101-exit")) customElements.define("k101-exit", K101Exit);
const exitDialog = {
  el: null,
  open() {
    if (!this.el) { this.el = document.createElement("k101-exit"); document.body.appendChild(this.el); }
    this.el.show();
  }
};

/* ------------------------------ menu flutuante ------------------------------ */
const ICON = {
  enter: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  exit:  '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const svg = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

class K101Menu extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
<style>
  :host { position: fixed; top: max(env(safe-area-inset-top), 6px); left: 50%; transform: translateX(-50%);
          z-index: 2147483000; touch-action: manipulation; -webkit-user-select: none; user-select: none;
          -webkit-tap-highlight-color: transparent; font-family: var(--fonte); }
  .bar { display: flex; align-items: center; gap: 5px; padding: 4px; border-radius: var(--raio-pill);
         background: var(--vidro); border: var(--borda);
         backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
         opacity: .55; transition: opacity .15s; }
  .bar.open { opacity: 1; }
  button { all: unset; box-sizing: border-box; display: grid; place-items: center; cursor: pointer;
           width: 40px; height: 40px; border-radius: var(--raio-pill); color: var(--texto1); }
  button:focus-visible { outline: var(--foco); outline-offset: 1px; }
  .logo img { width: 33px; height: 33px; display: block; border-radius: 8px; }
  .opt { display: none; }
  .bar.open .opt { display: grid; }
  .opt:hover, .bar.open .logo:hover { background: var(--hover-leve); }
  .opt[hidden] { display: none; }
  .fs .exit { display: none; }
  .fs.on .enter { display: none; }
  .fs.on .exit { display: block; }
  @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
<div class="bar">
  <button class="logo" type="button" aria-label="Abrir menu K101" aria-expanded="false"><img src="/shared/img/logo-icone.svg" alt=""></button>
  <button class="opt fs" type="button" aria-label="Tela cheia" title="Tela cheia">${svg("enter", "enter")}${svg("exit", "exit")}</button>
  <button class="opt close" type="button" aria-label="Fechar menu" title="Fechar menu">${svg("close")}</button>
</div>`;

    const bar = shadow.querySelector(".bar"), logo = shadow.querySelector(".logo");
    const fs = shadow.querySelector(".fs"), close = shadow.querySelector(".close");
    let timer;

    const isOpen = () => bar.classList.contains("open");
    const setOpen = (open) => {
      if (open === isOpen()) return;
      bar.classList.toggle("open", open);
      logo.setAttribute("aria-expanded", String(open));
      const label = open ? "Voltar ao catálogo" : "Abrir menu K101";
      logo.setAttribute("aria-label", label);
      logo.title = open ? label : "";
      clearTimeout(timer);
      if (open) timer = setTimeout(() => setOpen(false), 5000);
      K101.emit(open ? "menu:open" : "menu:close");
    };
    const syncFS = () => {
      const on = fsOn();
      fs.classList.toggle("on", on);
      fs.setAttribute("aria-label", on ? "Sair da tela cheia" : "Tela cheia");
      fs.title = on ? "Sair da tela cheia" : "Tela cheia";
    };

    fs.hidden = !K101.fullscreen.supported;
    syncFS();
    logo.addEventListener("click", () => (isOpen() ? (setOpen(false), K101.confirmExit()) : setOpen(true)));
    fs.addEventListener("click", () => { K101.fullscreen.toggle(); setOpen(false); });
    close.addEventListener("click", () => setOpen(false));
    K101.on("fullscreen:change", syncFS);
    document.addEventListener("pointerdown", (e) => { if (!e.composedPath().includes(this)) setOpen(false); }, true);

    for (const ev of ["pointerdown", "pointerup", "pointermove", "wheel", "contextmenu"])
      this.addEventListener(ev, (e) => e.stopPropagation());
  }
}

if (!customElements.get("k101-menu")) customElements.define("k101-menu", K101Menu);
document.body.appendChild(document.createElement("k101-menu"));