// main.js — entrada: carrega modelos/áudio com progresso real, mostra o título e cria o Game.
import * as THREE from 'three';
import { CROPS } from './Crops.js';
import { loadCropModels } from './Plants.js';
import { loadDroneModels } from './Drones.js';
import { Sound } from './Audio.js';
import { UI } from './UI.js';
import { Game } from './Game.js';

const ui = new UI();

async function boot() {
  try {
    ui.setLoading(0.02, 'Carregando plantações…');
    const manager = new THREE.LoadingManager();
    let modelsPct = 0, audioPct = 0;
    const report = () => ui.setLoading(0.05 + 0.9 * (modelsPct * 0.8 + audioPct * 0.2));
    manager.onProgress = (_u, loaded, total) => { modelsPct = total ? loaded / total : 1; report(); };

    const [models, droneModels] = await Promise.all([
      loadCropModels(Object.values(CROPS), manager),
      loadDroneModels(manager),
      Sound.load((p) => { audioPct = p; report(); })
    ]);

    ui.setLoading(0.98, 'Preparando a fazenda…');
    const game = new Game({ ui, models, droneModels });
    window.__game = game;                                   // útil no console durante o desenvolvimento

    if (location.search.includes('debug')) {
      const { showCropShowcase } = await import('./Debug.js');
      showCropShowcase(game.scene, models);
    }

    ui.setLoading(1);
    game.showTitle();
  } catch (err) {
    console.error(err);
    ui.showError(err?.message ? `Não foi possível carregar o jogo. ${err.message}` : 'Não foi possível carregar o jogo.');
  }
}

boot();
