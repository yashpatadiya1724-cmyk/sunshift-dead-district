export class Input {
  constructor() {
    this.keys = {};
    this.mouse = { isDown: false, isRightDown: false, deltaX: 0, deltaY: 0 };
    this.isLocked = false;

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        this.keys[e.code] = true;
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      window.addEventListener('mousedown', (e) => {
        // Do NOT request pointer lock here; Game.js handles lock on state transitions
        if (this.isLocked) {
          if (e.button === 0) this.mouse.isDown = true;
          if (e.button === 2) this.mouse.isRightDown = true;
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.isDown = false;
        if (e.button === 2) this.mouse.isRightDown = false;
      });

      // Prevent right-click context menu during gameplay and UI interaction
      window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      if (typeof document !== 'undefined') {
        document.addEventListener('pointerlockchange', () => {
          this.isLocked = !!document.pointerLockElement;
          if (!this.isLocked) {
            this.mouse.isDown = false;
            this.mouse.isRightDown = false;
          }
        });
      }

      window.addEventListener('mousemove', (e) => {
        if (this.isLocked) {
          this.mouse.deltaX += e.movementX || 0;
          this.mouse.deltaY += e.movementY || 0;
        }
      });
    }
  }

  isKey(code) {
    return !!this.keys[code];
  }

  isMouseDown(button = 0) {
    if (button === 2) return !!this.mouse?.isRightDown;
    return !!this.mouse?.isDown;
  }

  consumeMouseDelta() {
    const delta = { x: this.mouse.deltaX, y: this.mouse.deltaY };
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    return delta;
  }

  reset() {
    this.keys = {};
    this.mouse.isDown = false;
    this.mouse.isRightDown = false;
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
  }
}
