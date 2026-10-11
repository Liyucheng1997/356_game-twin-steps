// Keyboard + mouse input with "pressed this frame" tracking and pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.locked = false;
    this.dragging = false; // fallback when pointer lock is unavailable

    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ShiftLeft'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = [false, false, false]; });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
      if (!this.locked) this.dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown[e.button] = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
