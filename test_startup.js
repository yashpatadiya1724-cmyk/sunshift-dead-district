// mock browser environment with WebGL
globalThis.window = globalThis;
globalThis.WebGLRenderingContext = function() {};
globalThis.document = {
  readyState: 'complete',
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: (id) => ({
    style: {},
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    innerText: '',
    textContent: '',
    appendChild: () => {},
    addEventListener: () => {},
    getContext: () => ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      clip: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      stroke: () => {},
      fill: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {}
    })
  }),
  querySelectorAll: () => [],
  createElementNS: () => globalThis.document.createElement(),
  createElement: () => ({
    getContext: () => ({
      getExtension: () => null,
      getParameter: () => 1024,
      createTexture: () => ({}),
      bindTexture: () => {},
      texParameteri: () => {},
      texImage2D: () => {},
      clearColor: () => {},
      clearDepth: () => {},
      clear: () => {},
      enable: () => {},
      disable: () => {},
      depthFunc: () => {},
      frontFace: () => {},
      cullFace: () => {},
      viewport: () => {},
      scissor: () => {},
      createFramebuffer: () => ({}),
      bindFramebuffer: () => {},
      framebufferTexture2D: () => {},
      checkFramebufferStatus: () => 36053,
      deleteFramebuffer: () => {},
      createRenderbuffer: () => ({}),
      bindRenderbuffer: () => {},
      renderbufferStorage: () => {},
      framebufferRenderbuffer: () => {},
      deleteRenderbuffer: () => {}
    }),
    style: {},
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  }),
  body: {
    requestPointerLock: () => {},
    appendChild: () => {}
  }
};
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);

async function test() {
  try {
    const { Game } = await import('./src/core/Game.js');
    const { Menu } = await import('./src/ui/Menu.js');
    const { HUD } = await import('./src/ui/HUD.js');
    console.log('Imports succeeded!');

    const game = new Game();
    console.log('Game initialized! state:', game.state);

    const hud = new HUD(game);
    console.log('HUD initialized!');

    const menu = new Menu(game);
    console.log('Menu initialized!');

    console.log('Calling game.showMenu()...');
    game.showMenu();
    console.log('showMenu succeeded! state:', game.state);

    console.log('ALL TESTS PASSED WITH ZERO ERRORS!');
  } catch (err) {
    console.error('ERROR ENCOUNTERED:', err);
  }
}

test();
