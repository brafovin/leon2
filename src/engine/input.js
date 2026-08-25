/** Tastatur-, Maus- und Pointer-Lock-Verwaltung. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // nur im Frame des Tastendrucks gesetzt
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.sensitivity = 0.0022;
    /** Analoge Bewegungsachse (Touch-Stick). */
    this.axis = { x: 0, y: 0 };
    this.axisActive = false;
    this.virtual = new Set();
    this.touchMode = false;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const c = e.code;
      this.keys.add(c);
      this.pressed.add(c);
      if (['Tab', 'Space', 'F1', 'F2', 'F3'].includes(c)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; }
    });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX * this.sensitivity;
      this.mouse.dy += e.movementY * this.sensitivity;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); },
      { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  lock() {
    if (this.touchMode) return;          // Touchgeräte brauchen keinen Pointer Lock
    if (!this.locked) this.canvas.requestPointerLock?.();
  }
  unlock() { if (this.locked) document.exitPointerLock?.(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  /** Taste per Touch-Knopf halten oder loslassen. */
  setVirtualKey(code, down) {
    if (down) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      this.virtual.add(code);
    } else if (this.virtual.has(code)) {
      this.keys.delete(code);
      this.virtual.delete(code);
    }
  }

  /** Einzelner Tastendruck (ein Frame lang). */
  tapKey(code) { this.pressed.add(code); }

  /** Bewegungsrichtung: analoger Stick hat Vorrang vor WASD. */
  moveAxis() {
    if (this.axisActive) return this.axis;
    return {
      x: (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0),
      y: (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0),
    };
  }

  /** Am Ende jedes Frames aufrufen. */
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.mouse.leftPressed = false;
  }
}
