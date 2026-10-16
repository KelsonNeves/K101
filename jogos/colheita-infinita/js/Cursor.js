// Cursor.js — anel de raio (3D, deitado no chão) com «carregando» + ícone da ferramenta (DOM).
import * as THREE from 'three';
import { PALETTE, TOOLS } from './Data.js';
import { CROPS } from './Crops.js';

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();

export class Cursor {
  constructor(game) {
    this.game = game;
    this.worldPoint = null;                       // ponto do chão sob o cursor (ou null)
    this.visible = false;
    this.pulse = 0;                               // 0..1: pulso quando a ferramenta é usada
    this.iconKey = '';
    this.icon = document.getElementById('cursor-icon');
    this.hl = new Set();                          // células que seriam afetadas (brilho no solo)
    this.iconOn = false;                          // ícone visível agora?

    // O ícone é posicionado direto no evento do mouse (e não no quadro do jogo), para andar exatamente
    // junto com o cursor, sem atraso. Deslocamento p/ baixo e p/ a direita: não cobre a seta do sistema.
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.placeIcon(e.clientX, e.clientY);
    }, { passive: true });

    const ringGeo = new THREE.RingGeometry(0.94, 1.0, 96);
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uProgress: { value: 1 }, uColor: { value: new THREE.Color(PALETTE.ring.plant) } },
      vertexShader: `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vP; uniform float uProgress; uniform vec3 uColor;
        void main() {
          float a = atan(vP.x, vP.y);                            // 0 no topo, sentido horário
          float f = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;   // 0..1 ao redor do círculo
          float on = step(f, uProgress);
          gl_FragColor = vec4(uColor, mix(0.25, 0.95, on));      // trilho fraco + trecho cheio
        }`
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 5;

    // Disco suave por baixo do anel
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: PALETTE.ring.plant, transparent: true, opacity: 0.12, depthWrite: false })
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.renderOrder = 4;

    this.group = new THREE.Group();
    this.group.add(this.disc, this.ring);
    this.group.position.y = 0.06;
    this.group.visible = false;
    game.scene.scene.add(this.group);
  }

  groundPoint(px, py, camera) {
    ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;   // null se apontar para o céu
  }

  // Carga 0..1 do ciclo da ferramenta atual: enche só com o ponteiro pressionado e dispara ao chegar em 1
  // (também usado pelo botão de ferramenta no celular).
  progress(game) {
    return Math.min(1, Math.max(0, game.charge / game.cycleTime()));
  }

  update(game) {
    const input = game.input;
    const fired = game.fired; game.fired = false;   // consome o aviso de «ferramenta usada»
    const dayActive = game.state === 'DAY' && !game.paused && !game.radial.isOpen && game.countdown <= 0 && game.ending <= 0;
    const show = dayActive && (input.type === 'mouse' ? input.inside : input.holding);

    this.worldPoint = null;
    this.hl.clear();
    if (show) {
      const p = this.groundPoint(input.pos.x, input.pos.y, game.scene.camera);
      if (p) this.worldPoint = p.clone();
    }
    // O anel só aparece com o cursor realmente sobre o campo em vista (com meia célula de folga).
    const f = game.fields[game.activeField];
    const onField = !!this.worldPoint && !!f
      && Math.abs(this.worldPoint.x - f.x) <= f.cols / 2 + 0.5
      && Math.abs(this.worldPoint.z - f.z) <= f.rows / 2 + 0.5;
    const overDrone = !!game.drones.hover;           // sobre um drone: clique seleciona, então o anel some
    const vis = show && onField && !overDrone;
    this.group.visible = vis;

    // Mouse: sobre o arado, o cursor do sistema some e ficam só o anel (raio) e o ícone da ferramenta.
    // Fora do arado, o cursor normal fica sempre visível. O ícone aparece nos dois casos, ao lado do cursor.
    document.body.classList.toggle('on-field', vis && input.type === 'mouse');
    document.body.classList.toggle('over-drone', show && overDrone && input.type === 'mouse');
    this.iconOn = input.type === 'mouse' && show;
    if (this.icon) {
      this.icon.hidden = !this.iconOn;
      if (this.iconOn) {
        this.placeIcon(input.pos.x, input.pos.y);
        this.syncIcon(game);
      }
    }
    if (!vis) return;

    const sel = game.selection, tool = TOOLS[sel.tool], group = tool.group;
    const radius = game.toolRadius();
    const prog = this.progress(game);
    if (fired && !game.reduceMotion) this.pulse = 1;        // pulso no instante em que a ferramenta é usada
    this.pulse = Math.max(0, this.pulse - 1 / 9);          // ~150 ms a 60 fps
    const k = 1 + 0.06 * Math.sin(this.pulse * Math.PI);

    this.group.position.set(this.worldPoint.x, 0.06, this.worldPoint.z);
    this.group.scale.setScalar(radius * k);
    this.ringMat.uniforms.uProgress.value = prog;
    const color = PALETTE.ring[group];
    this.ringMat.uniforms.uColor.value.setHex(color);
    this.disc.material.color.setHex(color);

    // Células que seriam afetadas ganham brilho
    for (const c of game.grid.cellsInCircle(this.worldPoint.x, this.worldPoint.z, radius, game.activeField)) {
      if (tool.canTarget(c, game)) this.hl.add(c);
    }
  }

  placeIcon(x, y) {
    if (this.icon) this.icon.style.transform = `translate3d(${x + 16}px, ${y + 16}px, 0)`;
  }

  syncIcon(game) {
    const sel = game.selection;
    const key = sel.tool === 'plant' ? `crop:${sel.crop}` : sel.tool;
    if (key === this.iconKey) return;
    this.iconKey = key;
    this.icon.style.visibility = 'visible';
    this.icon.onerror = () => { this.icon.style.visibility = 'hidden'; };
    this.icon.src = sel.tool === 'plant' ? `assets/icons/crops/${sel.crop}.webp` : TOOLS[sel.tool].icon;
    this.icon.alt = sel.tool === 'plant' ? `Semear ${CROPS[sel.crop]?.name ?? ''}` : TOOLS[sel.tool].name;
  }
}
