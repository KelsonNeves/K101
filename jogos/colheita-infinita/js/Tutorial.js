// Tutorial.js — tutorial do primeiro dia (5 passos, sem relógio). Só lógica: o texto vai para UI.setTutorial.
// Passos: 1 semear os 9 quadrados · 2 trocar para a água · 3 aguar os 9 · 4 trocar para a foice · 5 colher os 9 · 6 (na árvore de habilidades, ver UI.syncSkillTip) desbloquear a 1ª habilidade.
// O jogador só avança quando conclui o passo atual. Aparece em todo jogo novo (e some para sempre ao terminar ou pular).
const KEY = 'colheita-infinita:tutorial';
export const tutorialDone = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setTutorialDone = (v) => { try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* sem armazenamento */ } };

const count = (g, fn) => g.grid.cells.reduce((n, c) => n + (fn(c) ? 1 : 0), 0);
const hold = (t) => (t ? 'Toque e segure o dedo' : 'Segure o botão esquerdo do mouse');
const pickTool = (t, what, key) => (t
  ? `Toque no botão redondo da ferramenta (embaixo da tela) e escolha ${what}.`
  : `Clique com o botão direito do mouse para abrir o menu e escolha ${what}. Atalho: tecla ${key}.`);

const STEPS = [
  { tool: 'plant', title: 'Plante as sementes',
    text: (t) => `${hold(t)} sobre a terra até o anel encher: as sementes caem. O trigo já está escolhido. Plante nos 9 quadrados.`,
    total: () => 9, progress: (g) => count(g, (c) => c.state !== 'empty'), done: (g, p) => p >= 9 },
  { tool: 'water', title: 'Troque para a água',
    text: (t) => pickTool(t, 'a gota d’água', 2),
    done: (g) => g.selection.tool === 'water' },
  { tool: 'water', title: 'Regue as plantas',
    text: (t) => `${hold(t)} sobre as sementes para regar. Só plantas molhadas crescem. Regue os 9.`,
    total: () => 9, progress: (g) => count(g, (c) => c.state === 'growing' || c.state === 'ripe'), done: (g, p) => p >= 9 },
  { tool: 'harvest', title: 'Troque para a foice',
    text: (t) => pickTool(t, 'a foice (Colher)', 3),
    done: (g) => g.selection.tool === 'harvest' },
  { tool: 'harvest', title: 'Colha tudo!',
    text: (t, g, p) => (count(g, (c) => c.state === 'ripe') === 0 && p < 9
      ? 'Espere um instante: as plantas crescem e amadurecem (ficam maiores). Depois é só colher.'
      : `${hold(t)} sobre as plantas maduras para colher e ganhar dinheiro. Colha os 9.`),
    total: () => 9, progress: (g) => g.tut.harvested, done: (g, p) => p >= 9 }
];

export class Tutorial {
  constructor(game) { this.g = game; this.step = 0; this.harvested = 0; this.finishing = false; }

  get current() { return STEPS[this.step]; }
  get tool() { return this.current.tool; }

  // O jogador só pode escolher a ferramenta que o passo pede.
  allows(item) { return item.tool === this.tool; }

  // Todo quadro: confere se o passo foi cumprido, avança e atualiza o painel.
  update() {
    const g = this.g;
    if (this.finishing) return;
    for (let guard = 0; guard < STEPS.length; guard++) {
      const s = this.current;
      const p = s.progress ? s.progress(g) : 0;
      if (!s.done(g, p)) break;
      if (this.step === STEPS.length - 1) { this.finish(); return; }
      this.step++;
      g.sound('unlock');
    }
    const s = this.current, touch = g.input.type === 'touch';
    const p = s.progress ? s.progress(g) : 0;
    g.ui.setTutorial({
      step: this.step, steps: STEPS.length + 1,   // +1: o passo 6 (desbloquear a 1ª habilidade) acontece na árvore
       title: s.title, text: s.text(touch, g, p),
      count: s.total ? Math.min(p, s.total()) : null, max: s.total ? s.total() : null,
      pulse: s.progress ? null : (touch ? 'btn' : 'tool')
    });
  }

  finish() {
    if (this.finishing) return;
    this.finishing = true;
    setTutorialDone(true);
    this.g.finishTutorial();
  }
}
