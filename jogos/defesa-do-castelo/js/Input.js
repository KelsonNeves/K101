/* ==========================================================================
   Input.js — interpreta a entrada do jogador.
   "O que o jogador está fazendo?"
   Só informa intenções ao Game (hover, select, pan, zoom, cancel, key).
   Não conhece Map, Systems nem UI.
   ========================================================================== */
import * as THREE from "three";

const DRAG_THRESHOLD = 7;     // px antes de um toque virar arrasto
const KEY_PAN_SPEED = 520;    // px/s
const DOUBLE_TAP_MS = 300;    // tempo máximo entre os dois toques
const DOUBLE_TAP_DIST = 30;   // distância máxima (px) entre os dois toques

export class InputManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {() => THREE.Camera} getCamera
   * @param {{onHover, onSelect, onPan, onZoom, onDoubleTap, onCancel, onKey}} handlers
   */
  constructor(canvas, getCamera, handlers) {
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.h = handlers;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();

    this.pointers = new Map();
    this.pinchDist = 0;
    this.keys = new Set();
    this.lastTap = null;          // { t, x, y } do último toque simples (para detectar o toque duplo)

    canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    canvas.addEventListener("pointermove", (e) => this.onMove(e));
    canvas.addEventListener("pointerup", (e) => this.onUp(e));
    canvas.addEventListener("pointercancel", (e) => this.pointers.delete(e.pointerId));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.h.onZoom(e.deltaY > 0 ? 1.1 : 0.9);
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); this.h.onCancel(); });

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.h.onKey(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  // Ponto no chão (y=0) sob o cursor, ou null.
  groundPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.getCamera());
    const p = this.raycaster.ray.intersectPlane(this.ground, this.hit);
    return p ? { x: p.x, z: p.z } : null;
  }

  // Posição na tela (px) de um ponto 3D, ou null se estiver atrás da câmera.
  worldToScreen(x, y, z) {
    const rect = this.canvas.getBoundingClientRect();
    this.hit.set(x, y, z).project(this.getCamera());
    if (this.hit.z > 1) return null;
    return {
      x: rect.left + (this.hit.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-this.hit.y * 0.5 + 0.5) * rect.height
    };
  }

  onDown(e) {
    if (e.button === 2) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, type: e.pointerType
    });
    if (this.pointers.size === 2) this.pinchDist = this.currentPinch();
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);

    if (!p) {                                   // mouse sem botão: só hover
      if (e.pointerType === "mouse") {
        const pt = this.groundPoint(e.clientX, e.clientY);
        if (pt) this.h.onHover(pt, "mouse");
      }
      return;
    }

    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (this.pointers.size >= 2) {              // pinça = zoom
      const d = this.currentPinch();
      if (this.pinchDist > 0 && d > 0) this.h.onZoom(this.pinchDist / d);
      this.pinchDist = d;
      for (const q of this.pointers.values()) q.moved = true;
      return;
    }

    if (!p.moved && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_THRESHOLD) p.moved = true;
    if (p.moved) this.h.onPan(dx, dy);
    else if (p.type === "mouse") {
      const pt = this.groundPoint(e.clientX, e.clientY);
      if (pt) this.h.onHover(pt, "mouse");
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.pinchDist = 0;
    if (!p || p.moved || e.button === 2) return;
    const pt = this.groundPoint(e.clientX, e.clientY);
    if (!pt) return;
    if (p.type !== "mouse" && this.isDoubleTap(e)) { this.h.onDoubleTap?.(pt); return; }
    this.h.onSelect(pt, p.type, e.clientX, e.clientY);
  }

  // Dois toques rápidos e próximos (só touch/caneta). O segundo toque não vira seleção.
  isDoubleTap(e) {
    const now = performance.now();
    const last = this.lastTap;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_DIST) {
      this.lastTap = null;
      return true;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    return false;
  }

  currentPinch() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  // Chamado todo frame pelo Game: movimento de câmera pelo teclado.
  update(dt) {
    const k = this.keys;
    const dx = (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) - (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0);
    const dy = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    if (dx || dy) this.h.onPan(dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt);
  }
}