import * as THREE from 'three';
import { buildBot } from './character.js';
import { buildWeaponModel, WEAPONS } from '../items/weapons.js';
import { hitscan, marchWorld, spreadDir } from '../systems/combat.js';
import { sfx } from '../engine/audio.js';

const GRAV = 26;

const SKILL = {
  easy:   { react: 0.75, spread: 0.075, dmg: 0.55, range: 42, hp: 100, shield: 0 },
  normal: { react: 0.45, spread: 0.045, dmg: 0.8,  range: 55, hp: 100, shield: 25 },
  hard:   { react: 0.25, spread: 0.026, dmg: 1.0,  range: 72, hp: 100, shield: 50 },
  arena:  { react: 0.18, spread: 0.02,  dmg: 1.15, range: 85, hp: 100, shield: 50 },
};

let botCounter = 0;

export class Bot {
  constructor(scene, world, { x, y, z }, difficulty = 'normal', index = 0, team = 0) {
    this.scene = scene;
    this.world = world;
    this.skill = SKILL[difficulty] || SKILL.normal;
    this.rig = buildBot(index);
    this.height = 1.8;
    scene.add(this.rig.root);

    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.grounded = true;
    this.alive = true;
    this.isPlayer = false;
    this.team = team;
    this.name = `${this.rig.name} ${String(++botCounter).padStart(2, '0')}`;

    this.hp = this.skill.hp; this.maxHp = 100;
    this.shield = this.skill.shield; this.maxShield = 100;
    this.kills = 0;

    this.weaponId = Math.random() < 0.45 ? 'shotgun' : 'smg';
    this.def = WEAPONS[this.weaponId];
    this.cooldown = Math.random();
    this.reaction = 0;
    this.state = 'roam';
    this.target = null;
    this.dest = null;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.jumpTimer = 0;
    this._foes = [];

    const model = buildWeaponModel(this.weaponId);
    model.position.set(0, -0.14, 0.16);
    this.rig.handR.add(model);
  }

  _pickDest() {
    const r = this.world.size * 0.45;
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r;
    this.dest = { x: Math.cos(a) * d, z: Math.sin(a) * d };
  }

  update(dt, ctx) {
    if (!this.alive) return;
    this.strafeTimer -= dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.strafeTimer <= 0) { this.strafe *= -1; this.strafeTimer = 0.8 + Math.random() * 2; }

    // Zielsuche
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.85, this.pos.z);
    let best = null, bestD = Infinity;
    for (const t of ctx.targets) {
      if (t === this || !t.alive) continue;
      if (ctx.teamPlay && t.team === this.team) continue;   // kein Beschuss der eigenen Farbe
      const d = this.pos.distanceTo(t.pos);
      if (d > this.skill.range || d > bestD) continue;
      const dir = new THREE.Vector3(
        t.pos.x - eye.x, t.pos.y + t.height * 0.6 - eye.y, t.pos.z - eye.z).normalize();
      if (marchWorld(eye, dir, d - 0.6, this.world, 0.6) < d - 0.8) continue; // keine Sichtlinie
      best = t; bestD = d;
    }

    if (best) {
      if (this.state !== 'fight') this.reaction = this.skill.react;
      this.state = 'fight'; this.target = best;
    } else if (this.state === 'fight') {
      this.state = 'roam'; this.target = null; this.dest = null;
    }

    const move = new THREE.Vector3();
    const storm = ctx.storm;
    const safe = storm?.safePoint(this.pos.x, this.pos.z);

    if (safe) {
      // Sturm hat Priorität
      this.dest = safe;
      this.state = this.target ? 'fight' : 'rotate';
    }

    if (this.state === 'fight' && this.target) {
      const t = this.target;
      const to = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z);
      const dist = to.length() || 1;
      to.normalize();
      this.yaw = Math.atan2(to.x, to.z);

      const ideal = this.weaponId === 'shotgun' ? 7 : 22;
      const along = dist > ideal + 3 ? 1 : dist < ideal - 3 ? -1 : 0;
      const side = new THREE.Vector3(to.z, 0, -to.x).multiplyScalar(this.strafe);
      move.addScaledVector(to, along).addScaledVector(side, 0.85);
      if (safe) move.add(new THREE.Vector3(safe.x - this.pos.x, 0, safe.z - this.pos.z).normalize().multiplyScalar(1.2));

      this.reaction -= dt;
      if (this.reaction <= 0 && this.cooldown <= 0 && dist < this.def.range) {
        this._fire(ctx, eye, t);
      }
    } else {
      if (!this.dest || Math.hypot(this.dest.x - this.pos.x, this.dest.z - this.pos.z) < 3) this._pickDest();
      const to = new THREE.Vector3(this.dest.x - this.pos.x, 0, this.dest.z - this.pos.z);
      if (to.lengthSq() > 0.01) { to.normalize(); move.add(to); this.yaw = Math.atan2(to.x, to.z); }
    }

    // Fortbewegung
    const speed = this.state === 'rotate' ? 8.6 : this.state === 'fight' ? 6.0 : 5.2;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    this.vel.x += (move.x - this.vel.x) * Math.min(1, 12 * dt);
    this.vel.z += (move.z - this.vel.z) * Math.min(1, 12 * dt);
    this.vel.y -= GRAV * dt;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const res = this.world.resolve(nx, nz, this.pos.y, 0.42, this.height);
    const stuck = Math.abs(res.x - nx) > 0.001 || Math.abs(res.z - nz) > 0.001;
    nx = res.x; nz = res.z;
    if (stuck) {
      this.jumpTimer -= dt;
      if (this.grounded && this.jumpTimer <= 0) { this.vel.y = 8.6; this.jumpTimer = 0.9; this.grounded = false; }
      if (this.state !== 'fight' && Math.random() < 0.02) this._pickDest();
    }

    const lim = this.world.size * 0.5 * 0.96;
    const dd = Math.hypot(nx, nz);
    if (dd > lim) { nx = (nx / dd) * lim; nz = (nz / dd) * lim; this._pickDest(); }

    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vel.y * dt;
    const ground = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
    if (this.pos.y <= ground) { this.pos.y = ground; this.vel.y = 0; this.grounded = true; }
    else this.grounded = false;

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw + Math.PI;
    this.rig.animate(dt, Math.hypot(this.vel.x, this.vel.z), this.grounded);
    this.rig.shoulderR.rotation.x = -1.25;
    this.rig.shoulderR.rotation.z = 0.3;
    this.rig.shoulderL.rotation.x = -1.1;
    this.rig.shoulderL.rotation.z = -0.42;
  }

  _fire(ctx, eye, t) {
    const aim = new THREE.Vector3(
      t.pos.x - eye.x,
      t.pos.y + t.height * (0.55 + Math.random() * 0.3) - eye.y,
      t.pos.z - eye.z).normalize();

    const dist = this.pos.distanceTo(t.pos);
    if (dist < 34) sfx.shoot(this.weaponId);
    const shots = this.def.pellets || 1;
    const muzzle = eye.clone().addScaledVector(aim, 0.6);
    const foes = this._foes;
    foes.length = 0;
    for (const x of ctx.targets) {
      if (x === this) continue;
      if (ctx.teamPlay && x.team === this.team) continue;
      foes.push(x);
    }
    for (let i = 0; i < shots; i++) {
      const d = spreadDir(aim, this.skill.spread * (this.weaponId === 'shotgun' ? 2.2 : 1));
      const hit = hitscan(eye, d, this.def.range, foes, this.world, ctx.build);
      const end = hit ? (hit.point || eye.clone().addScaledVector(d, hit.dist))
        : eye.clone().addScaledVector(d, this.def.range);
      ctx.effects.tracer(muzzle, end);
      if (hit?.kind === 'character') {
        const falloff = this.weaponId === 'shotgun' ? Math.max(0.3, 1 - hit.dist / this.def.range) : 1;
        ctx.damage(hit.target, this.def.damage * this.skill.dmg * falloff * (hit.head ? 1.4 : 1), this, hit.head);
      } else if (hit) {
        ctx.effects.impact(hit.point, 0xcfd8e3, 2);
        ctx.build?.damageAt(hit.point, 0.9, this.def.damage);
      }
    }
    this.cooldown = this.def.rate * (this.def.mag > 8 ? 1 : 1) + (Math.random() * 0.25);
    if (this.def.mag <= 8) this.cooldown += 0.5;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    let dmg = amount;
    if (this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a; dmg -= a;
    }
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  die() {
    this.alive = false;
    this.rig.root.visible = false;
  }

  respawn(p) {
    this.pos.set(p.x, p.y + 0.2, p.z);
    this.vel.set(0, 0, 0);
    this.hp = this.skill.hp;
    this.shield = this.skill.shield;
    this.alive = true;
    this.state = 'roam';
    this.target = null;
    this.dest = null;
    this.rig.root.visible = true;
  }

  /** Farbige Markierung über dem Kopf, damit Teams unterscheidbar sind. */
  setTeamMarker(color) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.42, 4),
      new THREE.MeshBasicMaterial({ color }),
    );
    m.position.y = 1.15;
    m.rotation.x = Math.PI;
    this.rig.head.add(m);
    this.marker = m;
  }

  dispose() { this.scene.remove(this.rig.root); }
}
