// FILE: src/main.js
import { Game } from './core/Game.js';
import { Menu } from './ui/Menu.js';
import { HUD } from './ui/HUD.js';
import { assets } from './core/Assets.js';

async function init() {
  const loadingScreen = document.getElementById('loading-screen');
  const mainMenu = document.getElementById('main-menu');
  const loadingBar = document.getElementById('loading-bar-fill');
  const loadingText = document.getElementById('loading-text');

  if (loadingScreen) {
    loadingScreen.style.display = 'flex';
  }
  if (mainMenu) {
    mainMenu.style.display = 'none';
  }

  try {
    // 1. Preload assets with real percentage progress
    await assets.loadAll((ratio, itemId) => {
      const pct = Math.round(ratio * 100);
      if (loadingBar) loadingBar.style.width = `${pct}%`;
      if (loadingText) loadingText.textContent = `LOADING ASSETS (${pct}%) — ${itemId.toUpperCase()}`;
    });

    // Dev-only Animation Viewer (?anim=1)
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('anim') === '1') {
      if (loadingScreen) loadingScreen.style.display = 'none';
      const { AnimViewer } = await import('./ui/AnimViewer.js');
      new AnimViewer();
      return;
    }

    // 2. Initialize Game engine
    const game = new Game();
    window.__SUNSHIFT_GAME__ = game;

    // 3. WebGL Guard
    if (!game.isWebGLSupported) {
      console.error('WebGL is not supported on this browser/GPU. Engine aborted.');
      return;
    }

    // 4. Initialize HUD and Menu UI layers
    new HUD(game);
    new Menu(game);
  } catch (err) {
    console.error('[MAIN] Engine initialization error:', err);
    try {
      new Menu({
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
