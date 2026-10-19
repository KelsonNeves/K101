// Input.js — mouse e toque unificados (Pointer Events). Só entrega «onde está o ponteiro» e «está segurando?».
import { TOUCH_OFFSET_PX } from './Data.js';

// Deslizar o dedo troca de campo: movimento rápido (SWIPE_MIN px em até SWIPE_MS ms) e bem mais reto num eixo.
const SWIPE_MIN = 70, SWIPE_MS = 450;

export class Input {
  constructor(canvas, game) {
    this.pos = { x: innerWidth / 2, y: innerHeight / 2 };   // onde o círculo deve ficar na tela (px)
    this.inside = false;                                    // mouse sobre o canvas
    this.holding = false;                                   // botão esquerdo ou dedo pressionado
    this.type = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';   // último tipo usado
    this.activeId = null;                                   // ignora o segundo dedo
    this.start = null;                                      // início do gesto de toque (para detectar o deslize)

    canvas.style.touchAction = 'none';
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      this.type = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (this.activeId !== null) return;
      this.setPos(e);
      if (game.radial.isOpen) return;
      if (e.button === 0 && game.drones.pointerDown(e.clientX, e.clientY)) return;   // clicou num drone: abre o painel, não usa a ferramenta
      if (this.type === 'mouse' && e.button === 2) {        // direito: menu radial em volta do cursor
        game.radial.open(e.clientX, e.clientY, 'around');
        return;
      }
      if (e.button !== 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
      this.activeId = e.pointerId;
      this.inside = true;
      if (this.type === 'touch') this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.holding = true;                                  // a ferramenta só dispara depois de carregar o ciclo (Game.updateCharge)
    });

    canvas.addEventListener('pointermove', (e) => {
      this.type = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (this.type === 'mouse') this.inside = true;
      if (this.activeId === null || e.pointerId === this.activeId) this.setPos(e);
      if (this.type === 'touch' && this.start && e.pointerId === this.activeId) this.checkSwipe(e, game);
    });

    const release = (e) => {
      if (e.pointerId !== this.activeId) return;
      this.activeId = null;
      this.start = null;
      this.holding = false;
      if (this.type === 'touch') this.inside = false;       // anel some ao soltar o dedo
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.inside = false; });
    window.addEventListener('blur', () => { this.holding = false; this.activeId = null; });
  }

  // Dedo arrastado depressa para um lado: a tela segue o dedo, então deslizar para a esquerda mostra o campo da direita.
  checkSwipe(e, game) {
    const s = this.start, dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (performance.now() - s.t > SWIPE_MS) { this.start = null; return; }   // lento demais: é só o jogador pintando
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE_MIN || Math.max(ax, ay) < Math.min(ax, ay) * 1.6) return;
    const dir = ax > ay ? (dx < 0 ? 'right' : 'left') : (dy < 0 ? 'down' : 'up');
    this.start = null;
    const before = game.activeField;
    game.goDir(dir);
    if (game.activeField !== before) navigator.vibrate?.(12);
  }

  setPos(e) {
    this.pos.x = e.clientX;
    this.pos.y = e.clientY - (this.type === 'touch' ? TOUCH_OFFSET_PX : 0);
  }

  // Usado pelo menu radial do PC: soltar o botão direito sobre um item.
  releaseAll() { this.holding = false; this.activeId = null; }
}
