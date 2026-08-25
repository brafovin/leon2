import * as THREE from 'three';

/* Trefferabfrage: analytische Kapsel-Tests für Charaktere,
   Ray-Marching gegen Terrain/Bauteile für die Deckung. */

const _v = new THREE.Vector3();

/** Schnittpunkt Strahl/Kugel; gibt Distanz oder -1. */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t;
}

/** Strahl gegen vertikalen Zylinder (Körper). */
function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const a = dx * dx + dz * dz;
  const mx = ox - cx, mz = oz - cz;
  if (a < 1e-8) return -1;
  const b = mx * dx + mz * dz;
  const c = mx * mx + mz * mz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  let t = (-b - Math.sqrt(disc)) / a;
  if (t < 0) t = (-b + Math.sqrt(disc)) / a;
  if (t < 0) return -1;
  const y = oy + dy * t;
  if (y < y0 || y > y1) return -1;
  return t;
}

/**
 * Erster blockierender Weltkontakt entlang des Strahls.
 * @returns {number} Distanz oder Infinity
 */
export function marchWorld(origin, dir, maxDist, world, step = 0.45) {
  let d = step;
  while (d < maxDist) {
    const x = origin.x + dir.x * d;
    const y = origin.y + dir.y * d;
    const z = origin.z + dir.z * d;
    if (y < world.terrain.heightAt(x, z)) return d;
    if (world.solidAt(x, y, z)) return d;
    d += step;
  }
  return Infinity;
}

/**
 * Charaktertreffer entlang eines Strahls.
 * @param {Array} targets Objekte mit {pos:{x,y,z}, alive, height}
 * @returns {{target:any, dist:number, head:boolean}|null}
 */
export function hitCharacter(origin, dir, maxDist, targets) {
  let best = null;
  for (const t of targets) {
    if (!t.alive) continue;
    const h = t.height || 1.85;
    const bodyT = rayCylinder(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      t.pos.x, t.pos.z, 0.42, t.pos.y + 0.1, t.pos.y + h * 0.86);
    const headT = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      t.pos.x, t.pos.y + h * 0.92, t.pos.z, 0.3);
    let d = -1, head = false;
    if (headT >= 0 && (bodyT < 0 || headT <= bodyT)) { d = headT; head = true; }
    else if (bodyT >= 0) { d = bodyT; }
    if (d < 0 || d > maxDist) continue;
    if (!best || d < best.dist) best = { target: t, dist: d, head };
  }
  return best;
}

/** Kombinierter Hitscan-Schuss inkl. Deckung. */
export function hitscan(origin, dir, maxDist, targets, world, buildSystem) {
  const wall = marchWorld(origin, dir, maxDist, world);
  const hit = hitCharacter(origin, dir, Math.min(maxDist, wall), targets);
  if (hit) return { kind: 'character', ...hit };
  if (wall < Infinity) {
    const p = new THREE.Vector3(origin.x + dir.x * wall, origin.y + dir.y * wall, origin.z + dir.z * wall);
    return { kind: 'world', point: p, dist: wall };
  }
  return null;
}

/** Streuvektor um die Blickrichtung. */
export function spreadDir(dir, spread, out = new THREE.Vector3()) {
  out.copy(dir);
  if (spread > 0) {
    out.x += (Math.random() - 0.5) * spread * 2;
    out.y += (Math.random() - 0.5) * spread * 2;
    out.z += (Math.random() - 0.5) * spread * 2;
    out.normalize();
  }
  return out;
}

/* ---------------- Effekte ---------------- */

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
    this.sparkGeo = new THREE.SphereGeometry(0.07, 5, 4);
  }

  tracer(from, to) {
    const line = new THREE.Line(this.tracerGeo.clone(), this.tracerMat.clone());
    line.geometry.setFromPoints([from.clone(), to.clone()]);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.07, max: 0.07, kind: 'tracer' });
  }

  impact(point, color = 0xffd27f, count = 5) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color }));
      m.position.copy(point);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5);
      this.scene.add(m);
      this.items.push({ obj: m, life: 0.45, max: 0.45, kind: 'spark', v });
    }
  }

  muzzle(point) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd27f }));
    m.position.copy(point);
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.05, max: 0.05, kind: 'flash' });
  }

  damageNumber() { /* Platzhalter: Schadenszahlen laufen über das HUD */ }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.kind === 'spark') {
        it.v.y -= 18 * dt;
        it.obj.position.addScaledVector(it.v, dt);
      }
      if (it.obj.material) it.obj.material.opacity = Math.max(0, it.life / it.max);
      if (it.obj.material) it.obj.material.transparent = true;
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items.length = 0;
  }
}

/* ---------------- Projektile (Bogen) ---------------- */

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5);
    this.geo.rotateX(Math.PI / 2);
    this.mat = new THREE.MeshLambertMaterial({ color: '#d8c9a0' });
  }

  spawn(origin, dir, speed, damage, owner, headMult = 2) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(origin);
    m.castShadow = true;
    this.scene.add(m);
    this.list.push({
      mesh: m, pos: origin.clone(), vel: dir.clone().multiplyScalar(speed),
      damage, owner, headMult, life: 5,
    });
  }

  update(dt, world, targets, onHit) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vel.y -= 9.5 * dt;
      const stepLen = p.vel.length() * dt;
      const dir = _v.copy(p.vel).normalize();

      const hit = hitCharacter(p.pos, dir, stepLen, targets.filter((t) => t !== p.owner));
      const wall = marchWorld(p.pos, dir, stepLen, world, 0.35);

      if (hit && hit.dist <= wall) {
        onHit(hit.target, p.damage * (hit.head ? p.headMult : 1), hit.head,
          p.pos.clone().addScaledVector(dir, hit.dist), p.owner);
        this._kill(i); continue;
      }
      if (wall < Infinity) {
        onHit(null, 0, false, p.pos.clone().addScaledVector(dir, wall), p.owner);
        this._kill(i); continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.pos.clone().add(p.vel));
      if (p.life <= 0 || p.pos.y < -20) this._kill(i);
    }
  }

  _kill(i) {
    this.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }

  clear() { while (this.list.length) this._kill(0); }
}
