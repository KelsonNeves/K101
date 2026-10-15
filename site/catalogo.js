/* catalogo.js — desenha a vitrine a partir de /data/games.json e controla o popup de cada jogo.
   Só baixa o JSON e os ícones. As imagens do carrossel só são pedidas quando o popup abre.
   Nada de nenhum jogo é carregado aqui. */

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const skeleton = document.getElementById("skeleton");
const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

/* ------------------------------ fundo na rolagem ------------------------------ */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const hero = $("inicio");
let heroH = hero.offsetHeight || innerHeight;
addEventListener("resize", () => { heroH = hero.offsetHeight || innerHeight; }, { passive: true });
let ticking = false;
function syncScroll() {
  ticking = false;
  const y = Math.max(0, window.scrollY);
  const s = document.documentElement.style;
  s.setProperty("--sy", String(y));                         // fundo (manchas de luz)
  s.setProperty("--hy", String(Math.min(y, heroH)));        // boas-vindas: logo e texto em planos diferentes
  s.setProperty("--p", String(Math.min(1, y / heroH)));     // 0 a 1: quanto da tela de boas-vindas já saiu
}
if (!reduceMotion.matches) {
  addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(syncScroll); }
  }, { passive: true });
  syncScroll();
}

/* ------------------------------ logo principal ------------------------------ */
// A logo é fixa. Enquanto a página rola, ela acompanha o espaço reservado da boas-vindas, encolhe,
// e para no topo central (posição e tamanho finais vêm do CSS: top da .logo e --logo-min-h).
const logo = $("logo"), logoSlot = $("logo-slot");
let slotTop = 0, topEnd = 0, minH = 58, fullH = 1, slow = 2;
function syncLogo() {
  const y = Math.max(0, window.scrollY);
  const dist = Math.max(1, slotTop - topEnd);               // quanto rolar até a logo chegar ao topo
  const t = Math.min(1, y / (dist * slow));                 // 0 = grande, 1 = pequena (encolhe mais devagar que a subida)
  const scale = 1 + (Math.min(1, minH / fullH) - 1) * t;
  const dy = Math.max(0, slotTop - y - topEnd);
  logo.style.transform = `translate(-50%, ${dy}px) scale(${scale})`;
  document.documentElement.style.setProperty("--lp", t.toFixed(3));
}
function measureLogo() {
  topEnd = parseFloat(getComputedStyle(logo).top) || 0;
  minH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--logo-min-h")) || 58;
  slow = Math.max(1, parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--logo-slow")) || 2);
  fullH = logoSlot.offsetHeight || 1;
  slotTop = logoSlot.getBoundingClientRect().top + window.scrollY;
  document.documentElement.classList.add("logo-js");
  syncLogo();
}
new ResizeObserver(measureLogo).observe(hero);               // tamanho da tela, fontes e imagens mudam o centro da boas-vindas
logoSlot.querySelector("img").addEventListener("load", measureLogo);
addEventListener("scroll", () => requestAnimationFrame(syncLogo), { passive: true });
measureLogo();
// clicar na logo volta ao topo (em vez de recarregar a página)
logo.addEventListener("click", (e) => {
  e.preventDefault();
  scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
});

// seta da tela de boas-vindas: desce até os jogos
$("cue").addEventListener("click", () => {
  $("jogos").scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
});

/* ------------------------------ utilidades ------------------------------ */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function platformLabel(list = []) {
  const desktop = list.includes("desktop"), mobile = list.includes("mobile");
  if (desktop && mobile) return "PC e celular";
  if (desktop) return "PC";
  if (mobile) return "Celular";
  return "";
}

// Ícone do jogo (quadrado). Sem arquivo, mostra um quadrado com a inicial.
function iconFor(game, eager) {
  const tile = () => { const t = el("div", "icon empty", game.title.trim().charAt(0).toUpperCase()); t.setAttribute("aria-hidden", "true"); return t; };
  if (!game.icon) return tile();
  const img = new Image();
  img.src = game.icon;
  img.alt = "";
  img.width = 192; img.height = 192;
  img.decoding = "async";
  img.loading = eager ? "eager" : "lazy";
  img.className = "icon is-loading";
  img.addEventListener("load", () => img.classList.remove("is-loading"), { once: true });
  img.addEventListener("error", () => img.replaceWith(tile()), { once: true });
  if (img.complete && img.naturalWidth) img.classList.remove("is-loading");
  return img;
}

/* ------------------------------ popup ------------------------------ */
const dlg = $("game-modal");
const shots = $("m-shots"), shotsWrap = $("m-shots-wrap");
const prevBtn = $("m-prev"), nextBtn = $("m-next");
const byId = new Map();
let current = null;
let lastFocus = null;

function syncNav() {
  const max = shots.scrollWidth - shots.clientWidth;
  shotsWrap.classList.toggle("scrollable", max > 4);
  prevBtn.disabled = shots.scrollLeft <= 2;
  nextBtn.disabled = shots.scrollLeft >= max - 2;
}
shots.addEventListener("scroll", syncNav, { passive: true });
shots.addEventListener("contextmenu", (e) => e.preventDefault());   // sem menu "salvar imagem" no carrossel
addEventListener("resize", () => { if (dlg.open) syncNav(); });
const slide = (dir) => shots.scrollBy({ left: dir * shots.clientWidth * 0.8, behavior: reduceMotion.matches ? "auto" : "smooth" });
prevBtn.addEventListener("click", () => slide(-1));
nextBtn.addEventListener("click", () => slide(1));

function fill(game) {
  current = game;
  $("m-title").textContent = game.title;
  $("m-icon").replaceChildren(iconFor(game, true));
  $("m-play").href = game.url;
  $("m-play").setAttribute("aria-label", `Jogar ${game.title}`);

  // carrossel: as imagens só são criadas (e baixadas) agora
  shots.replaceChildren();
  shots.classList.toggle("portrait", game.orientation === "portrait");
  shots.scrollLeft = 0;
  const list = game.screenshots ?? [];
  list.forEach((src, i) => {
    const img = new Image();
    img.src = src;
    img.alt = `Imagem ${i + 1} de ${list.length} de ${game.title}`;
    img.className = "shot is-loading";
    img.addEventListener("load", () => img.classList.remove("is-loading"), { once: true });
    img.decoding = "async";
    img.loading = i < 2 ? "eager" : "lazy";
    img.draggable = false;
    img.addEventListener("error", () => { img.remove(); shotsWrap.hidden = !shots.children.length; syncNav(); }, { once: true });
    shots.append(img);
  });
  shotsWrap.hidden = !list.length;

  $("m-desc").textContent = game.description || game.tagline || "";
  $("m-desc").hidden = !($("m-desc").textContent);

  const tags = $("m-tags");
  tags.replaceChildren(...(game.tags ?? []).map((t) => el("li", "", t)));
  tags.hidden = !tags.children.length;

  const info = $("m-info");
  const rows = [
    ["Plataformas", platformLabel(game.platforms)],
    ["Tamanho", game.approxDownloadMB ? `~${game.approxDownloadMB} MB` : ""],
    ["Versão", game.version ?? ""]
  ].filter(([, v]) => v);
  info.replaceChildren(...rows.map(([k, v]) => { const d = el("div"); d.append(el("dt", "", k), el("dd", "", v)); return d; }));
  info.hidden = !rows.length;

  dlg.querySelector(".sheet").scrollTop = 0;
}

function openModal(game, push = true) {
  fill(game);
  if (!dlg.open) {
    lastFocus = document.activeElement;
    dlg.showModal();
    document.documentElement.classList.add("modal-open");
  }
  if (push) history.pushState({ k101Modal: game.id }, "", `#${encodeURIComponent(game.id)}`);
  requestAnimationFrame(syncNav);
}

// Fecha de verdade (sem mexer no histórico).
function hide() {
  if (dlg.open) dlg.close();
  document.documentElement.classList.remove("modal-open");
  shots.replaceChildren();
  current = null;
  lastFocus?.focus?.({ preventScroll: true });
}

// Pedido de fechar vindo do X, do clique fora, do Esc ou do Backspace:
// volta uma entrada do histórico (o popstate abaixo fecha). Assim o "voltar" do celular/navegador e o X se comportam igual.
function closeModal() {
  if (!dlg.open) return;
  if (history.state?.k101Modal) history.back();
  else hide();
}

$("m-close").addEventListener("click", closeModal);

// clique fora do popup (no fundo escurecido)
let downOnBackdrop = false;
dlg.addEventListener("pointerdown", (e) => { downOnBackdrop = e.target === dlg; });
dlg.addEventListener("click", (e) => { if (e.target === dlg && downOnBackdrop) closeModal(); downOnBackdrop = false; });

// Esc
dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeModal(); });

// Backspace no PC (sem atrapalhar quem está digitando)
addEventListener("keydown", (e) => {
  if (!dlg.open || e.key !== "Backspace") return;
  if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  closeModal();
});

// botão voltar do celular / do navegador (e avançar, que reabre)
addEventListener("popstate", () => {
  const id = history.state?.k101Modal;
  if (id) {
    const game = byId.get(id);
    if (game && current !== game) openModal(game, false);
  } else if (dlg.open) {
    hide();
  }
});

/* ------------------------------ busca ------------------------------ */
const form = $("search-form"), input = $("search"), clearBtn = $("search-clear");
const dock = $("dock"), bar = $("dock-bar"), row = $("dock-row");
const openBtn = $("dock-search"), homeBtn = $("dock-home"), minBtn = $("search-min");
const cards = [];   // { node, hay }

// minúsculas e sem acento: "Estratégia" casa com "estrategia"
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

function haystack(g) {
  const plat = (g.platforms ?? []).map((p) => (p === "desktop" ? "pc computador desktop" : p === "mobile" ? "celular mobile" : p)).join(" ");
  return norm([g.title, g.tagline, g.description, ...(g.tags ?? []), plat, g.version].filter(Boolean).join(" "));
}

function applyFilter() {
  const q = input.value;
  clearBtn.hidden = !q;
  dock.classList.toggle("has-query", !!q.trim());   // bolinha no ícone de busca quando há filtro ativo
  if (!cards.length) return;
  const words = norm(q).split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const c of cards) {
    const ok = words.every((w) => c.hay.includes(w));
    c.node.hidden = !ok;
    if (ok) shown++;
  }
  if (shown) { status.hidden = true; }
  else { status.textContent = `Nenhum jogo encontrado para “${q.trim()}”.`; status.hidden = false; }
}
input.addEventListener("input", applyFilter);
form.addEventListener("submit", (e) => { e.preventDefault(); applyFilter(); input.blur(); });   // blur recolhe o teclado do celular
clearBtn.addEventListener("click", () => { input.value = ""; applyFilter(); input.focus(); });
input.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  if (input.value) clearBtn.click(); else setSearching(false);
});

/* ------------------------------ menu flutuante ------------------------------ */
// Aparece quando a tela de boas-vindas (quase) saiu de vista.
// O menu surge no mesmo instante em que a seta de descer some (mesma fração, vinda do CSS: --cue-end).
const cueEnd = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cue-end")) || 0.2;
const syncDock = () => dock.classList.toggle("show", window.scrollY >= heroH * cueEnd);
addEventListener("scroll", syncDock, { passive: true });
addEventListener("resize", syncDock, { passive: true });
syncDock();

// A busca nasce do ícone: guardamos onde ele está para o CSS esticar a partir dali.
function placePane() {
  const b = bar.getBoundingClientRect(), r = openBtn.getBoundingClientRect();
  bar.style.setProperty("--cx", `${r.left - b.left}px`);
  bar.style.setProperty("--cw", `${r.width}px`);
}
placePane();
addEventListener("resize", placePane, { passive: true });

function setSearching(on) {
  if (on === dock.classList.contains("searching")) return;
  if (on) placePane();
  dock.classList.toggle("searching", on);
  form.inert = !on;
  row.inert = on;
  openBtn.setAttribute("aria-expanded", String(on));
  trackKb();
  if (on) input.focus({ preventScroll: true });
  else { input.blur(); openBtn.focus({ preventScroll: true }); }
}
openBtn.addEventListener("click", () => setSearching(true));
minBtn.addEventListener("click", () => setSearching(false));

// logo do centro = "Início": limpa a busca e volta para a tela de boas-vindas
homeBtn.addEventListener("click", () => {
  if (input.value) { input.value = ""; applyFilter(); }
  setSearching(false);
  scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
});

// teclado do celular: o menu sobe junto, sempre acima do teclado.
// --kb = altura coberta pelo teclado (base da tela visível vs. base da página). O teclado demora a animar
// e alguns navegadores não avisam a tempo, então medimos a cada quadro por ~1 s depois de focar/desfocar.
const vv = window.visualViewport;
let kbRaf = 0;
function syncKb() {
  if (!vv) return;
  // Só vale com o campo de busca focado. Fora disso, a barra de endereço/ferramentas do navegador
  // aparecendo e sumindo na rolagem mudaria o visualViewport e empurraria o menu para cima.
  const kb = document.activeElement === input ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0;
  dock.style.setProperty("--kb", `${kb}px`);
  dock.classList.toggle("kb", kb > 60);
}
function trackKb(ms = 1000) {
  cancelAnimationFrame(kbRaf);
  const end = performance.now() + ms;
  const tick = () => { syncKb(); if (performance.now() < end) kbRaf = requestAnimationFrame(tick); };
  tick();
}
if (vv) { vv.addEventListener("resize", syncKb); vv.addEventListener("scroll", syncKb); }
input.addEventListener("focus", () => trackKb());
input.addEventListener("blur", () => trackKb());

/* ------------------------------ cards ------------------------------ */
function card(game, index) {
  const b = el("button", "card");
  b.type = "button";
  b.setAttribute("aria-haspopup", "dialog");
  b.setAttribute("aria-label", `Ver detalhes de ${game.title}`);

  const stage = el("span", "stage");
  stage.append(iconFor(game, index < 4));
  b.append(stage, el("span", "title", game.title));

  b.addEventListener("click", () => openModal(game));
  cards.push({ node: b, hay: haystack(game) });
  return b;
}

async function load() {
  status.hidden = true;
  grid.hidden = true;
  skeleton.hidden = false;
  cards.length = 0;
  try {
    const res = await fetch("/data/games.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const { games = [] } = await res.json();
    skeleton.hidden = true;
    if (!games.length) { status.textContent = "Nenhum jogo publicado ainda. Volte em breve."; status.hidden = false; return; }
    games.forEach((g) => byId.set(g.id, g));
    grid.replaceChildren(...games.map(card));
    grid.hidden = false;
    status.hidden = true;
    applyFilter();   // se o usuário já digitou algo enquanto carregava

    // voltou do jogo pelo botão "voltar": reabre o popup em que estava
    const id = history.state?.k101Modal;
    if (id && byId.has(id)) openModal(byId.get(id), false);
  } catch {
    skeleton.hidden = true;
    status.hidden = false;
    status.textContent = "Não foi possível carregar a lista de jogos.";
    const retry = el("button", "", "Tentar de novo");
    retry.type = "button";
    retry.addEventListener("click", load);
    status.append(retry);
  }
}

load();