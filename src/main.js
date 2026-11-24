// FILE: src/main.js
import { Game } from './core/Game.js';
import { Menu } from './ui/Menu.js';
import { HUD } from './ui/HUD.js';

function init() {
  console.log('[MAIN] Initializing SUNSHIFT engine...');
  let game = null;

  try {
    // 1. Initialize Game engine
    game = new Game();
    window.__SUNSHIFT_GAME__ = game;

    // 2. WebGL Guard: If WebGL is not supported, halt before instantiating HUD and Menu
    if (!game.isWebGLSupported) {
      console.error('WebGL is not supported on this browser/GPU. Engine aborted.');
      return;
    }

    // 3. Initialize HUD and Menu UI layers
    new HUD(game);
    new Menu(game);

    console.log('[MAIN] Engine, HUD, and Menu initialized successfully!');
  } catch (err) {
    console.error('[MAIN] Engine initialization error:', err);
    try {
      new Menu(game || {
        state: 'MENU',
        start: () => console.warn('Game engine initializing...'),
        showMenu: () => {},
        resume: () => {},
        restart: () => window.location.reload(),
        settings: { volume: 0.7, sensitivity: 0.0022, fov: 75, invertY: false, quality: 'MEDIUM' }
      });
    } catch (menuErr) {
      console.error('[MAIN] Menu fallback error:', menuErr);
    }
  }
}

// Resilient initialization: execute immediately if DOM is already parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
