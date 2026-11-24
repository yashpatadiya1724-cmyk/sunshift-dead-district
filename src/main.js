// FILE: src/main.js
import { Game } from './core/Game.js';
import { Menu } from './ui/Menu.js';
import { HUD } from './ui/HUD.js';

function init() {
  // 1. Initialize Game engine
  const game = new Game();

  // 2. WebGL Guard: If WebGL is not supported, halt before instantiating HUD and Menu
  if (!game.isWebGLSupported) {
    console.error('WebGL is not supported on this browser/GPU. Engine aborted.');
    return;
  }

  // 3. Initialize HUD and Menu UI layers
  const hud = new HUD(game);
  const menu = new Menu(game);

  // Expose game instance for debug/inspection if needed
  window.__SUNSHIFT_GAME__ = game;
}

// Resilient initialization: execute immediately if DOM is already parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
