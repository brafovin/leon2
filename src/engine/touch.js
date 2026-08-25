import { isTouch } from './device.js';

/* ------------------------------------------------------------------ *
 *  Touch-Steuerung: linker Daumen = analoger Stick, rechte Bildhälfte
 *  = Umsehen, dazu Aktionsknöpfe. Schreibt in dieselbe Input-Instanz
 *  wie Maus und Tastatur - der Rest des Spiels merkt keinen Unterschied.
 * ------------------------------------------------------------------ */

const LOOK_SENS = 0.0055;
const TAP_MS = 220;
const TAP_PX = 14;

export class TouchControls {
  /**
   * @param {import('./input.js').Input} input
   * @param {HTMLElement} root Overlay-Container (#touch)
   */
  constructor(input, root) {
    this.input = input;
    this.root = root;
    this.enabled = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, lx: 0, ly: 0, startX: 0, startY: 0, t0: 0, moved: 0 };
    this.buttons = new Map();
    this.onPause = null;
    this.onMap = null;

    this._build();
    this._bind();
  }

  show(v) {
    this.enabled = v && isTouch;
    this.root.classList.toggle('hidden', !this.enabled);
    if (!this.enabled) this._releaseAll();
  }

  /** Bau-Knöpfe nur zeigen, wenn der Modus Bauen erlaubt. */
  setBuildEnabled(v) {
    this.root.classList.toggle('nobuild', !v);
  }

  /* ---------------- Aufbau ---------------- */

  _build() {
    this.root.innerHTML = `
      <div class="t-zone t-move"></div>
      <div class="t-zone t-look"></div>
      <div class="t-stick" id="t-stick"><i></i></div>
      <div class="t-right">
        <button class="t-btn t-fire" data-hold="fire">FEUER</button>
        <button class="t-btn t-jump" data-hold="jump">⤒</button>
        <button class="t-btn t-aim" data-hold="aim">ZIEL</button>
        <button class="t-btn t-use" data-tap="use">F</button>
        <button class="t-btn t-reload" data-tap="reload">⟳</button>
      </div>
      <div class="t-build">
        <button class="t-btn t-small" data-tap="wall">WAND</button>
        <button class="t-btn t-small" data-tap="ramp">RAMPE</button>
        <button class="t-btn t-small" data-tap="floor">BODEN</button>
        <button class="t-btn t-small" data-tap="mat">MAT</button>
      </div>
      <div class="t-top">
        <button class="t-btn t-small" data-tap="map">KARTE</button>
        <button class="t-btn t-small" data-tap="pause">II</button>
      </div>`;
    this.stickEl = this.root.querySelector('#t-stick');
    this.knobEl = this.stickEl.querySelector('i');
    this.lookZone = this.root.querySelector('.t-look');
    this.moveZone = this.root.querySelector('.t-move');
  }

  _bind() {
    for (const el of this.root.querySelectorAll('.t-btn')) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('down');
        try { el.setPointerCapture?.(e.pointerId); } catch { /* Zeiger schon freigegeben */ }
        this._press(el.dataset.hold || el.dataset.tap, !!el.dataset.hold);
      });
      const up = (e) => {
        e?.stopPropagation();
        el.classList.remove('down');
        if (el.dataset.hold) this._release(el.dataset.hold);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }

    const zones = [this.moveZone, this.lookZone];
    for (const z of zones) {
      z.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    }
    this.root.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    this.root.addEventListener('pointerup', (e) => this._up(e));
    this.root.addEventListener('pointercancel', (e) => this._up(e));
  }

  /* ---------------- Zeiger ---------------- */

  _down(e) {
    e.preventDefault();
    const left = e.target === this.moveZone;
    if (left && this.stick.id === null) {
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX; this.stick.oy = e.clientY;
      this.stick.x = 0; this.stick.y = 0;
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.add('on');
      this.knobEl.style.transform = 'translate(-50%,-50%)';
      return;
    }
    if (!left && this.look.id === null) {
      this.look.id = e.pointerId;
      this.look.lx = this.look.startX = e.clientX;
      this.look.ly = this.look.startY = e.clientY;
      this.look.t0 = performance.now();
      this.look.moved = 0;
    }
  }

  _move(e) {
    if (e.pointerId === this.stick.id) {
      e.preventDefault();
      const dx = e.clientX - this.stick.ox;
      const dy = e.clientY - this.stick.oy;
      const max = 62;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      const kx = dx * k, ky = dy * k;
      this.knobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      this.stick.x = kx / max;
      this.stick.y = -ky / max;                  // Bildschirm-Y ist invertiert
      return;
    }
    if (e.pointerId === this.look.id) {
      e.preventDefault();
      const dx = e.clientX - this.look.lx;
      const dy = e.clientY - this.look.ly;
      this.look.lx = e.clientX; this.look.ly = e.clientY;
      this.look.moved += Math.abs(dx) + Math.abs(dy);
      this.input.mouse.dx += dx * LOOK_SENS;
      this.input.mouse.dy += dy * LOOK_SENS;
    }
  }

  _up(e) {
    if (e.pointerId === this.stick.id) {
      this.stick.id = null;
      this.stick.x = this.stick.y = 0;
      this.stickEl.classList.remove('on');
      return;
    }
    if (e.pointerId === this.look.id) {
      const quick = performance.now() - this.look.t0 < TAP_MS && this.look.moved < TAP_PX;
      this.look.id = null;
      if (quick) this._tapFire();       // kurzer Tipper = ein Schuss
    }
  }

  _tapFire() {
    this.input.mouse.leftPressed = true;
    this.input.mouse.left = true;
    this._tapFireRelease = 2;           // zwei Frames gedrückt halten
  }

  /* ---------------- Knöpfe ---------------- */

  _press(action, hold) {
    const i = this.input;
    switch (action) {
      case 'fire': i.mouse.left = true; i.mouse.leftPressed = true; this.firing = true; break;
      case 'aim': i.mouse.right = !i.mouse.right; break;   // Umschalter statt Halten
      case 'jump': i.setVirtualKey('Space', true); break;
      case 'use': i.tapKey('KeyF'); break;
      case 'reload': i.tapKey('KeyR'); break;
      case 'wall': i.tapKey('KeyQ'); break;
      case 'ramp': i.tapKey('KeyE'); break;
      case 'floor': i.tapKey('KeyR'); break;
      case 'mat': i.tapKey('KeyC'); break;
      case 'map': this.onMap?.(); break;
      case 'pause': this.onPause?.(); break;
      default: break;
    }
    if (!hold && action === 'jump') this.input.setVirtualKey('Space', false);
  }

  _release(action) {
    const i = this.input;
    if (action === 'fire') { i.mouse.left = false; this.firing = false; }
    if (action === 'jump') i.setVirtualKey('Space', false);
  }

  _releaseAll() {
    this.input.mouse.left = false;
    this.input.mouse.right = false;
    this.firing = false;
    this.input.setVirtualKey('Space', false);
    this.stick.id = null; this.stick.x = this.stick.y = 0;
    this.look.id = null;
    this.stickEl?.classList.remove('on');
  }

  /** Am Ende des Frames: analoge Achse an den Input übergeben. */
  apply() {
    if (!this.enabled) return;
    const len = Math.hypot(this.stick.x, this.stick.y);
    if (len > 0.12) {
      this.input.axis.x = this.stick.x;
      this.input.axis.y = this.stick.y;
      this.input.axisActive = true;
      this.input.setVirtualKey('ShiftLeft', len > 0.86);   // Vollausschlag = sprinten
    } else {
      this.input.axisActive = false;
      this.input.axis.x = this.input.axis.y = 0;
      this.input.setVirtualKey('ShiftLeft', false);
    }
    // Gehaltener Feuerknopf löst auch Einzelschusswaffen wiederholt aus
    if (this.firing) { this.input.mouse.left = true; this.input.mouse.leftPressed = true; }
    if (this._tapFireRelease) {
      this._tapFireRelease--;
      if (this._tapFireRelease <= 0) this.input.mouse.left = false;
    }
  }
}
