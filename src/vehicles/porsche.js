import * as THREE from 'three';
import { sfx } from '../engine/audio.js';

/* ------------------------------------------------------------------ *
 *  Sportwagen im Stil eines 911 (991) - Silhouette per Extrusion des
 *  Seitenprofils, dazu Kotflügel, Räder, Heckflügel und Leuchten.
 * ------------------------------------------------------------------ */

const CAR_COLORS = {
  guardsRed: '#c8102e', racingYellow: '#f5c518', gtSilver: '#c7ccd1',
  midnight: '#101725', mint: '#7ad3c0',
};

function sideProfile() {
  // x = Länge (Front +), y = Höhe. Erzeugt die typische 911-Fastback-Linie.
  const s = new THREE.Shape();
  s.moveTo(-2.15, 0.16);           // Heck unten
  s.lineTo(2.10, 0.16);            // Unterboden nach vorn
  s.lineTo(2.24, 0.42);            // Frontschürze
  s.quadraticCurveTo(2.30, 0.72, 2.02, 0.80);   // Bug / Haube vorn
  s.quadraticCurveTo(1.35, 0.86, 0.92, 0.96);   // flache Fronthaube
  s.quadraticCurveTo(0.55, 1.02, 0.30, 1.36);   // Windschutzscheibe
  s.quadraticCurveTo(-0.20, 1.50, -0.62, 1.46); // Dachlinie
  s.quadraticCurveTo(-1.35, 1.38, -1.82, 0.98); // abfallendes Fastback-Heck
  s.quadraticCurveTo(-2.10, 0.82, -2.18, 0.58); // Heckabschluss
  s.lineTo(-2.15, 0.16);
  return s;
}

export class Porsche {
  constructor(scene, world, { x = 0, y = 0, z = 0, color = 'guardsRed' } = {}) {
    this.scene = scene;
    this.world = world;
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = 0;
    this.speed = 0;
    this.steer = 0;
    this.driver = null;
    this.alive = true;
    this.height = 1.4;
    this.hp = 800;

    this.maxSpeed = 43;      // ~155 km/h
    this.reverseMax = -11;
    this.accelRate = 17;
    this.brakeRate = 30;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    scene.add(this.group);
    this._build(CAR_COLORS[color] || CAR_COLORS.guardsRed);

    this._engineNode = null;
  }

  _build(bodyColor) {
    const g = this.group;
    const paint = new THREE.MeshLambertMaterial({ color: bodyColor });
    const dark = new THREE.MeshLambertMaterial({ color: '#14171c' });
    const glass = new THREE.MeshLambertMaterial({ color: '#243447', transparent: true, opacity: 0.75 });
    const chrome = new THREE.MeshLambertMaterial({ color: '#cfd6dd' });
    const light = new THREE.MeshBasicMaterial({ color: '#fff4d0' });
    const tail = new THREE.MeshBasicMaterial({ color: '#ff2d3a' });
    const tire = new THREE.MeshLambertMaterial({ color: '#141416' });
    const rim = new THREE.MeshLambertMaterial({ color: '#b9c0c8' });

    // Karosserie durch Extrusion des Seitenprofils.
    // Das Profil liegt in der XY-Ebene und wird entlang Z zur Breite
    // extrudiert: +X ist damit die Fahrzeugfront.
    const HALF_W = 0.86;
    const extrude = new THREE.ExtrudeGeometry(sideProfile(), {
      depth: HALF_W * 2, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.07,
      bevelSegments: 3, curveSegments: 16,
    });
    extrude.translate(0, 0, -HALF_W);
    const body = new THREE.Mesh(extrude, paint);
    body.castShadow = true;
    g.add(body);

    const put = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const SIDE = HALF_W + 0.06;      // Außenhaut inkl. Fase

    // Ausgestellte Kotflügel: vorn schmal, hinten die typisch breiten Hüften
    for (const zs of [1, -1]) {
      put(B(1.20, 0.42, 0.17), paint, 1.28, 0.60, zs * (SIDE + 0.02));
      put(B(1.40, 0.52, 0.21), paint, -1.14, 0.66, zs * (SIDE + 0.04));
    }

    // Scheiben liegen als flache Platten auf der Profillinie
    put(B(0.80, 0.06, 1.46), glass, 0.60, 1.16, 0, 0, 0, -0.57);   // Frontscheibe
    put(B(1.30, 0.06, 1.42), glass, -1.16, 1.25, 0, 0, 0, 0.37);   // Heckscheibe
    for (const zs of [1, -1]) {
      put(B(1.05, 0.30, 0.05), glass, -0.22, 1.26, zs * (HALF_W + 0.01));  // Seitenfenster
      put(B(0.16, 0.06, 0.06), chrome, 0.16, 1.02, zs * (HALF_W + 0.04));  // Türgriff
      put(B(2.10, 0.10, 0.09), dark, 0, 0.30, zs * (SIDE - 0.02));         // Seitenschweller
      put(B(0.34, 0.24, 0.06), dark, -1.30, 0.86, zs * (HALF_W + 0.02));   // Lufteinlass hinten
    }

    // Heckflügel (fährt ab ~80 km/h aus)
    this.wing = put(B(0.34, 0.06, 1.44), dark, -1.80, 1.00, 0);
    put(B(0.09, 0.16, 0.08), dark, -1.76, 0.91, 0.55);
    put(B(0.09, 0.16, 0.08), dark, -1.76, 0.91, -0.55);
    put(B(0.5, 0.05, 1.3), dark, -1.60, 0.94, 0, 0, 0, 0.2);       // Motorraumgitter

    // Front: LED-Rundscheinwerfer, leicht in die Haube eingelassen
    for (const zs of [1, -1]) {
      put(new THREE.SphereGeometry(0.16, 12, 10), light, 1.88, 0.78, zs * 0.56);
      put(new THREE.TorusGeometry(0.17, 0.026, 6, 14), chrome, 1.92, 0.78, zs * 0.56, 0, Math.PI / 2, 0);
    }
    put(B(0.09, 0.14, 1.05), dark, 2.20, 0.40, 0);                 // Frontsplitter
    put(B(0.10, 0.13, 0.40), dark, 2.14, 0.50, 0.60);              // Lufteinlässe
    put(B(0.10, 0.13, 0.40), dark, 2.14, 0.50, -0.60);

    // Heck: durchgehendes Leuchtenband + Diffusor + Endrohre
    put(B(0.07, 0.10, 1.45), tail, -2.16, 0.84, 0);
    put(B(0.13, 0.20, 0.95), dark, -2.13, 0.36, 0);
    put(new THREE.CylinderGeometry(0.065, 0.065, 0.22, 8), chrome, -2.14, 0.30, 0.28, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.065, 0.065, 0.22, 8), chrome, -2.14, 0.30, -0.28, 0, 0, Math.PI / 2);

    // Räder: hinten breiter und größer, sitzen außerhalb der Karosserie
    this.wheels = [];
    const mk = (x, z, r, w) => {
      const wheel = new THREE.Group();
      wheel.position.set(x, r, z);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16), tire);
      t.rotation.x = Math.PI / 2; t.castShadow = true; wheel.add(t);
      const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, w + 0.03, 12), rim);
      rimMesh.rotation.x = Math.PI / 2; wheel.add(rimMesh);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.15, 0.05, w * 0.55), rim);
        spoke.rotation.z = (i / 5) * Math.PI * 2;
        wheel.add(spoke);
      }
      g.add(wheel);
      this.wheels.push(wheel);
      return wheel;
    };
    this.wheelFL = mk(1.30, SIDE + 0.10, 0.40, 0.30);
    this.wheelFR = mk(1.30, -(SIDE + 0.10), 0.40, 0.30);
    this.wheelRL = mk(-1.28, SIDE + 0.14, 0.45, 0.40);
    this.wheelRR = mk(-1.28, -(SIDE + 0.14), 0.45, 0.40);

    // Sitze, durch die Scheiben sichtbar
    put(B(0.36, 0.44, 0.36), dark, -0.15, 0.95, 0.38);
    put(B(0.36, 0.44, 0.36), dark, -0.15, 0.95, -0.38);

    // Interaktions-Glühen, wenn man in der Nähe steht
    this.prompt = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.95, 24),
      new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    this.prompt.rotation.x = -Math.PI / 2;
    this.prompt.position.y = 0.06;
    this.prompt.visible = false;
    g.add(this.prompt);
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }

  update(dt, input) {
    const driving = !!this.driver;

    if (driving && input) {
      const ax = input.moveAxis();
      const throttle = Math.abs(ax.y) > 0.2 ? Math.sign(ax.y) : 0;
      const steerIn = Math.abs(ax.x) > 0.15 ? -ax.x : 0;
      const handbrake = input.down('Space');

      if (throttle > 0) this.speed += this.accelRate * dt * (1 - Math.min(1, this.speed / this.maxSpeed) * 0.7);
      else if (throttle < 0) this.speed -= this.brakeRate * dt * (this.speed > 0 ? 1 : 0.4);
      else this.speed -= Math.sign(this.speed) * 6 * dt;

      if (handbrake) this.speed -= Math.sign(this.speed) * 22 * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, this.reverseMax, this.maxSpeed);
      if (Math.abs(this.speed) < 0.15) this.speed = 0;

      const grip = handbrake ? 0.55 : 1;
      const steerAmount = steerIn * 1.5 * grip * THREE.MathUtils.clamp(1 - Math.abs(this.speed) / (this.maxSpeed * 1.6), 0.35, 1);
      this.steer += (steerAmount - this.steer) * Math.min(1, dt * 9);
      this.yaw += this.steer * dt * (this.speed / Math.max(4, this.maxSpeed * 0.35)) * 1.5;

      // Fahrerblick übernimmt die Fahrzeugausrichtung
      this.driver.yaw = this.yaw;
    } else {
      this.speed -= Math.sign(this.speed) * 10 * dt;
      if (Math.abs(this.speed) < 0.1) this.speed = 0;
      this.steer *= 0.9;
    }

    // Bewegung + Terrainfolge
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let nx = this.pos.x + fx * this.speed * dt;
    let nz = this.pos.z + fz * this.speed * dt;

    const res = this.world.resolve(nx, nz, this.pos.y, 1.5, 1.2);
    if (res.x !== nx || res.z !== nz) {
      // Aufprall: Tempo verlieren, Umgebung beschädigen
      this.speed *= -0.18;
      nx = res.x; nz = res.z;
    }
    const lim = this.world.size * 0.5 * 0.96;
    const d = Math.hypot(nx, nz);
    if (d > lim) { nx = (nx / d) * lim; nz = (nz / d) * lim; this.speed *= -0.3; }

    this.pos.x = nx; this.pos.z = nz;
    const ground = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
    this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 12);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw - Math.PI / 2;

    // Neigung an die Oberfläche anpassen
    const n = this.world.terrain.normalAt(this.pos.x, this.pos.z);
    const pitch = Math.atan2(n.x * fx + n.z * fz, n.y);
    this.group.rotation.z = THREE.MathUtils.clamp(-pitch, -0.5, 0.5) - this.steer * 0.05;

    // Rad-Animation
    const spin = this.speed * dt / 0.42;
    for (const w of this.wheels) {
      w.children[0].rotation.y -= spin;    // Reifen
      w.children[1].rotation.y -= spin;    // Felge
      for (let i = 2; i < w.children.length; i++) w.children[i].rotation.z -= spin;
    }
    this.wheelFL.rotation.y = this.steer * 0.45;
    this.wheelFR.rotation.y = this.steer * 0.45;

    // Heckflügel fährt ab ~80 km/h aus
    const up = this.kmh > 80 ? 1 : 0;
    this.wing.position.y += ((1.00 + up * 0.30) - this.wing.position.y) * Math.min(1, dt * 4);

    this._engineSound(driving);
  }

  _engineSound(on) {
    if (!on) { this._stopEngine(); return; }
    sfx.resume();
    if (!sfx.ctx) return;
    if (!this._engineNode) {
      const osc = sfx.ctx.createOscillator();
      const sub = sfx.ctx.createOscillator();
      const gain = sfx.ctx.createGain();
      const filter = sfx.ctx.createBiquadFilter();
      osc.type = 'sawtooth'; sub.type = 'square';
      filter.type = 'lowpass'; filter.frequency.value = 900;
      gain.gain.value = 0.0;
      osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(sfx.master);
      osc.start(); sub.start();
      this._engineNode = { osc, sub, gain };
    }
    const rpm = 55 + Math.abs(this.speed) * 5.2;
    this._engineNode.osc.frequency.setTargetAtTime(rpm, sfx.ctx.currentTime, 0.06);
    this._engineNode.sub.frequency.setTargetAtTime(rpm * 0.5, sfx.ctx.currentTime, 0.06);
    this._engineNode.gain.gain.setTargetAtTime(0.09 + Math.min(0.12, Math.abs(this.speed) / 300), sfx.ctx.currentTime, 0.1);
  }

  _stopEngine() {
    if (!this._engineNode) return;
    try {
      this._engineNode.gain.gain.setTargetAtTime(0, sfx.ctx.currentTime, 0.08);
      const n = this._engineNode;
      setTimeout(() => { n.osc.stop(); n.sub.stop(); }, 400);
    } catch { /* AudioContext bereits geschlossen */ }
    this._engineNode = null;
  }

  setPromptVisible(v) { this.prompt.visible = v; }

  dispose() { this._stopEngine(); this.scene.remove(this.group); }
}

/** Kleines Vorschaumodell für Lobby/Shop. */
export function buildPorschePreview(color = 'guardsRed') {
  const dummyWorld = null;
  const g = new THREE.Group();
  const fake = Object.create(Porsche.prototype);
  fake.group = g;
  fake.wheels = [];
  fake._build.call(fake, CAR_COLORS[color] || CAR_COLORS.guardsRed);
  return g;
}

export { CAR_COLORS };
