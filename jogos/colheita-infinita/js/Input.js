// Input.js — mouse e toque unificados (Pointer Events). Só entrega «onde está o ponteiro» e «está segurando?».
import { TOUCH_OFFSET_PX } from './Data.js';

export class Input {
  constructor(canvas, game) {
    this.pos = { x: innerWidth / 2, y: innerHeight / 2 };   // onde o círculo deve ficar na tela (px)
    this.inside = false;                                    // mouse sobre o canvas
    this.holding = false;                                   // botão esquerdo ou dedo pressionado
    this.type = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';   // último tipo usado
    this.activeId = null;                                   // ignora o segundo dedo

    canvas.style.touchAction = 'none';
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      this.type = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (this.activeId !== null) return;
      this.setPos(e);
      if (game.radial.isOpen) return;
      if (this.type === 'mouse' && e.button === 2) {        // direito: menu radial em volta do cursor
        game.radial.open(e.clientX, e.clientY, 'around');
        return;
      }
      if (e.button !== 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
      this.activeId = e.pointerId;
      this.inside = true;
      this.holding = true;                                  // a ferramenta só dispara depois de carregar o ciclo (Game.updateCharge)
    });

    canvas.addEventListener('pointermove', (e) => {
      this.type = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      if (this.type === 'mouse') this.inside = true;
      if (this.activeId === null || e.pointerId === this.activeId) this.setPos(e);
    });

    const release = (e) => {
      if (e.pointerId !== this.activeId) return;
      this.activeId = null;
      this.holding = false;
      if (this.type === 'touch') this.inside = false;       // anel some ao soltar o dedo
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.inside = false; });
    window.addEventListener('blur', () => { this.holding = false; this.activeId = null; });
  }

  setPos(e) {
    this.pos.x = e.clientX;
    this.pos.y = e.clientY - (this.type === 'touch' ? TOUCH_OFFSET_PX : 0);
  }

  // Usado pelo menu radial do PC: soltar o botão direito sobre um item.
  releaseAll() { this.holding = false; this.activeId = null; }
}
