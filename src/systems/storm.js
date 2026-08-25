import * as THREE from 'three';

/**
 * Sturmkreis. Der Kreis zieht sich in Phasen zusammen; außerhalb
 * verliert man kontinuierlich Leben.
 */
export class Storm {
  constructor(scene, worldSize, mode = 'br') {
    this.mode = mode;
    const fast = mode === 'arena';
    this.maxR = worldSize * 0.5;
    this.radius = this.maxR;
    this.targetRadius = this.maxR;
    this.center = new THREE.Vector2(0, 0);
    this.targetCenter = new THREE.Vector2(0, 0);
    this.phase = 0;
    this.timer = fast ? 32 : 55;
    this.shrinking = false;
    this.shrinkTime = 0;
    this.shrinkDur = 1;
    this.startR = this.maxR;
    this.startC = this.center.clone();

    // Phasenplan: [Wartezeit, Schrumpfdauer, Zielradius-Faktor, Schaden/s]
    this.plan = fast
      ? [[32, 22, 0.55, 2], [26, 20, 0.32, 4], [22, 18, 0.16, 7], [18, 16, 0.06, 10], [16, 14, 0.0, 14]]
      : [[55, 40, 0.62, 1], [45, 34, 0.42, 2], [38, 30, 0.28, 4], [32, 26, 0.16, 6],
         [26, 22, 0.08, 8], [22, 18, 0.03, 10], [18, 16, 0.0, 14]];
    this.damage = 1;

    const geo = new THREE.CylinderGeometry(1, 1, 260, 72, 1, true);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x9a4bff, transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false,
    }));
    this.mesh.position.y = 60;
    scene.add(this.mesh);

    const ringGeo = new THREE.RingGeometry(0.985, 1, 96);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xd8a4ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
    }));
    scene.add(this.ring);
    this._apply();
  }

  _apply() {
    this.mesh.scale.set(this.radius, 1, this.radius);
    this.mesh.position.x = this.center.x;
    this.mesh.position.z = this.center.y;
    this.ring.scale.set(this.radius, 1, this.radius);
    this.ring.position.set(this.center.x, 8, this.center.y);
  }

  update(dt) {
    if (this.shrinking) {
      this.shrinkTime += dt;
      const t = Math.min(1, this.shrinkTime / this.shrinkDur);
      const e = t * t * (3 - 2 * t);
      this.radius = this.startR + (this.targetRadius - this.startR) * e;
      this.center.lerpVectors(this.startC, this.targetCenter, e);
      if (t >= 1) { this.shrinking = false; this.timer = this.plan[Math.min(this.phase, this.plan.length - 1)][0]; }
    } else {
      this.timer -= dt;
      if (this.timer <= 0 && this.phase < this.plan.length) {
        const [, dur, factor, dmg] = this.plan[this.phase];
        this.startR = this.radius;
        this.startC = this.center.clone();
        this.targetRadius = Math.max(6, this.maxR * factor);
        const shift = (this.radius - this.targetRadius) * 0.55;
        const a = Math.random() * Math.PI * 2;
        this.targetCenter = new THREE.Vector2(
          this.center.x + Math.cos(a) * shift * Math.random(),
          this.center.y + Math.sin(a) * shift * Math.random(),
        );
        this.shrinkDur = dur;
        this.shrinkTime = 0;
        this.shrinking = true;
        this.damage = dmg;
        this.phase++;
      }
    }
    this._apply();
  }

  outside(x, z) {
    return Math.hypot(x - this.center.x, z - this.center.y) > this.radius;
  }

  /** Punkt innerhalb der (künftigen) Zone - für die Bot-KI. */
  safePoint(x, z) {
    const c = this.shrinking ? this.targetCenter : this.center;
    const r = this.shrinking ? this.targetRadius : this.radius;
    const dx = x - c.x, dz = z - c.y;
    const d = Math.hypot(dx, dz);
    if (d < r * 0.6) return null;
    const k = (r * 0.5) / (d || 1);
    return { x: c.x + dx * k, z: c.y + dz * k };
  }

  label() {
    if (this.shrinking) return `STURM ZIEHT SICH ZU`;
    if (this.phase >= this.plan.length) return 'FINALE ZONE';
    const t = Math.max(0, this.timer);
    return `ZONE ${this.phase + 1} · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }

  dispose(scene) { scene.remove(this.mesh); scene.remove(this.ring); }
}
