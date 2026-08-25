import * as THREE from 'three';
import { buildSkin } from './character.js';
import { buildPickaxe } from '../items/pickaxe.js';
import { buildWeaponModel, WEAPONS, makeWeaponState } from '../items/weapons.js';
import { hitscan, spreadDir, marchWorld } from '../systems/combat.js';
import { sfx } from '../engine/audio.js';

const GRAV = 26;
const WALK = 6.2;
const SPRINT = 9.4;
const JUMP = 9.2;
const RADIUS = 0.42;

export class Player {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.mode = opts.mode || 'br';
    this.skinId = opts.skin || 'kratos';
    this.pickaxeId = opts.pickaxe || 'leviathan';

    this.rig = buildSkin(this.skinId);
    this.height = this.rig.height || 1.85;
    scene.add(this.rig.root);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;
    this.alive = true;
    this.isPlayer = true;
    this.name = 'Du';
    this.team = opts.team ?? 0;

    // Arena und Team-Rumble starten voll ausgerüstet
    this.loadedOut = this.mode === 'arena' || this.mode === 'team';
    this.hp = 100; this.maxHp = 100;
    this.shield = this.loadedOut ? 50 : 0; this.maxShield = 100;
    this.mats = this.mode === 'arena' ? { wood: 0, stone: 0, metal: 0 } : { wood: 60, stone: 20, metal: 0 };
    this.kills = 0;
    this.vehicle = null;
    this.hitFlash = 0;
    this._foes = [];        // Zielliste ohne den Spieler selbst
    this.swing = 0;
    this.recoil = 0;
    this.ads = false;

    // Inventar: Arena startet voll ausgerüstet
    this.slots = [makeWeaponState('pickaxe'), null, null, null];
    if (this.loadedOut) {
      this.slots[1] = makeWeaponState('smg');
      this.slots[2] = makeWeaponState('shotgun');
      this.slots[3] = makeWeaponState('bow');
    }
    this.slot = 0;

    this.heldGroup = new THREE.Group();
    this.rig.handR.add(this.heldGroup);
    this._equipVisual();
  }

  /* ---------------- Ausrüstung ---------------- */

  get weapon() { return this.slots[this.slot]; }

  _equipVisual() {
    this.heldGroup.clear();
    const w = this.weapon;
    if (!w) return;
    let model;
    if (w.id === 'pickaxe') {
      model = buildPickaxe(this.pickaxeId);
      model.position.set(0, -0.34, 0.06);
      model.rotation.set(-0.3, 0, -0.25);
    } else {
      model = buildWeaponModel(w.id);
      model.position.set(0, -0.14, 0.16);
      model.rotation.set(0.1, 0, 0);
      if (w.id === 'bow') model.rotation.set(0, Math.PI / 2, 0.2);
    }
    this.heldGroup.add(model);
    this.heldModel = model;
  }

  selectSlot(i) {
    if (i < 0 || i > 3 || !this.slots[i] || i === this.slot) return;
    this.slot = i;
    if (this.weapon) this.weapon.reloading = 0;
    this._equipVisual();
    sfx.ui();
  }

  pickupWeapon(id) {
    const idx = { smg: 1, shotgun: 2, bow: 3 }[id];
    if (idx == null) return false;
    if (this.slots[idx]) {
      const def = WEAPONS[id];
      this.slots[idx].reserve = Math.min(def.reserve * 1.5, this.slots[idx].reserve + def.mag * 3);
    } else {
      this.slots[idx] = makeWeaponState(id);
      if (this.slot === 0) { this.slot = idx; this._equipVisual(); }
    }
    return true;
  }

  /* ---------------- Blickrichtung ---------------- */

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
  }

  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
  }

  /* ---------------- Update ---------------- */

  update(dt, input, ctx) {
    if (!this.alive) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt);

    // Maussteuerung
    this.yaw -= input.mouse.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouse.dy, -1.35, 1.35);

    if (this.vehicle) { this._updateInVehicle(dt); return; }

    this.ads = input.mouse.right && this.weapon && !this.weapon.def.melee;

    // Bewegung
    const f = this.forward();
    const right = new THREE.Vector3(f.z, 0, -f.x);
    const ax = input.moveAxis();
    const move = new THREE.Vector3()
      .addScaledVector(f, ax.y)
      .addScaledVector(right, ax.x);

    const sprint = input.down('ShiftLeft') && !this.ads;
    let speed = sprint ? SPRINT : WALK;
    if (this.ads) speed *= 0.55;
    const mag = Math.min(1, move.length());
    if (mag > 0.001) move.normalize().multiplyScalar(speed * mag);

    const accel = this.grounded ? 18 : 6;
    this.vel.x += (move.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (move.z - this.vel.z) * Math.min(1, accel * dt);

    if (input.hit('Space') && this.grounded) { this.vel.y = JUMP; this.grounded = false; }
    this.vel.y -= GRAV * dt;

    // Integration + Kollision
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const res = this.world.resolve(nx, nz, this.pos.y, RADIUS, this.height);
    if (res.x !== nx) this.vel.x *= 0.2;
    if (res.z !== nz) this.vel.z *= 0.2;
    nx = res.x; nz = res.z;

    // Nicht über den Inselrand hinaus
    const lim = this.world.size * 0.5 * 0.98;
    const d = Math.hypot(nx, nz);
    if (d > lim) { nx = (nx / d) * lim; nz = (nz / d) * lim; }

    this.pos.x = nx; this.pos.z = nz;
    this.pos.y += this.vel.y * dt;

    const ground = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
    if (this.pos.y <= ground) {
      if (this.vel.y < -22) this.takeDamage(Math.min(60, (-this.vel.y - 22) * 2.4), null, 'Sturz');
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else this.grounded = false;

    // Waffenlogik
    this._weaponUpdate(dt, input, ctx);

    // Modell
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw + Math.PI;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.rig.animate(dt, hs, this.grounded);
    this._armPose();
  }

  _armPose() {
    const w = this.weapon;
    const aimX = THREE.MathUtils.clamp(this.pitch, -1.1, 1.1);
    if (w && w.def.melee) {
      const s = this.swing > 0 ? Math.sin((1 - this.swing / 0.35) * Math.PI) : 0;
      this.rig.shoulderR.rotation.x = -0.5 - s * 2.1;
      this.rig.shoulderR.rotation.z = 0.25 - s * 0.3;
      this.rig.shoulderL.rotation.z = -0.2;
    } else if (w) {
      const raise = this.ads ? -1.55 : -1.25;
      this.rig.shoulderR.rotation.x = raise + aimX * 0.8 + this.recoil * 0.35;
      this.rig.shoulderR.rotation.z = 0.32;
      this.rig.shoulderL.rotation.x = raise * 0.85 + aimX * 0.7;
      this.rig.shoulderL.rotation.z = -0.45;
    }
    this.rig.head.rotation.x = THREE.MathUtils.clamp(this.pitch * 0.5, -0.5, 0.5);
  }

  _weaponUpdate(dt, input, ctx) {
    const w = this.weapon;
    if (!w) return;
    w.cooldown = Math.max(0, w.cooldown - dt);

    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take; w.reserve -= take;
      }
      return;
    }

    if (input.hit('KeyR') && !ctx.buildMode && !w.def.melee && w.mag < w.def.mag && w.reserve > 0) {
      w.reloading = w.def.reload; return;
    }

    const wantsFire = w.def.melee || w.def.id === 'shotgun' || w.def.id === 'bow'
      ? input.mouse.leftPressed : input.mouse.left;
    if (!wantsFire || w.cooldown > 0) return;

    if (w.def.melee) { this._swing(ctx); w.cooldown = w.def.rate; return; }

    if (w.mag <= 0) {
      if (w.reserve > 0) w.reloading = w.def.reload;
      return;
    }
    this._shoot(ctx);
    w.cooldown = w.def.rate;
  }


  /** Zielliste ohne die eigene Hitbox - sonst trifft der Strahl den Spieler selbst. */
  _foesOf(ctx) {
    this._foes.length = 0;
    for (const t of ctx.targets) if (t !== this) this._foes.push(t);
    return this._foes;
  }

  _swing(ctx) {
    this.swing = 0.35;
    const dir = this.lookDir();
    const eye = this.eye();
    const w = this.weapon.def;

    const hit = hitscan(eye, dir, w.range, this._foesOf(ctx), this.world, ctx.build);
    if (hit?.kind === 'character') {
      ctx.damage(hit.target, w.damage * (hit.head ? 1.5 : 1), this, hit.head);
      sfx.hitmark();
      return;
    }

    // Bauteile abbauen
    if (ctx.build && hit?.kind === 'world') {
      if (ctx.build.damageAt(hit.point, 1.2, 90)) { sfx.chop('wood'); return; }
    }

    const h = this.world.harvestableNear(this.pos, this.forward(), w.range);
    if (h) {
      sfx.chop(h.mat);
      ctx.effects.impact(new THREE.Vector3(h.x, h.y + h.height * 0.5, h.z),
        h.mat === 'wood' ? 0xc98a3c : h.mat === 'stone' ? 0xb9c0c8 : 0x7fd0ff, 4);
      const dead = this.world.damageHarvestable(h, 45);
      const gain = dead ? h.yield : Math.round(h.yield * 0.34);
      this.mats[h.mat] = Math.min(999, this.mats[h.mat] + gain);
      ctx.onHarvest?.(h.mat, gain);
    } else if (hit?.kind === 'world') {
      ctx.effects.impact(hit.point, 0x9aa4b2, 3);
      sfx.chop('stone');
    }
  }

  _shoot(ctx) {
    const w = this.weapon;
    const def = w.def;
    w.mag--;
    this.recoil = 1;
    sfx.shoot(def.id);

    const eye = this.eye();
    const dir = this.lookDir();
    const spread = this.ads ? def.adsSpread : def.spread;
    const muzzleWorld = eye.clone().addScaledVector(dir, 0.6);
    ctx.effects.muzzle(muzzleWorld);

    if (def.projectile) {
      ctx.projectiles.spawn(muzzleWorld, dir, def.projectileSpeed, def.damage, this, def.headMult);
      return;
    }

    const shots = def.pellets || 1;
    const foes = this._foesOf(ctx);
    for (let i = 0; i < shots; i++) {
      const d = spreadDir(dir, spread);
      const hit = hitscan(eye, d, def.range, foes, this.world, ctx.build);
      const end = hit ? (hit.point || eye.clone().addScaledVector(d, hit.dist))
        : eye.clone().addScaledVector(d, def.range);
      ctx.effects.tracer(muzzleWorld, end);
      if (!hit) continue;
      if (hit.kind === 'character') {
        const dmgFall = def.id === 'shotgun' ? Math.max(0.35, 1 - hit.dist / def.range) : 1;
        ctx.damage(hit.target, def.damage * (hit.head ? def.headMult : 1) * dmgFall, this, hit.head);
        sfx.hitmark();
      } else {
        ctx.effects.impact(hit.point, 0xcfd8e3, 3);
        ctx.build?.damageAt(hit.point, 0.9, def.damage * 0.8);
      }
    }
  }

  /* ---------------- Fahrzeug ---------------- */

  enterVehicle(v) {
    this.vehicle = v;
    v.driver = this;
    this.rig.root.visible = false;
  }

  exitVehicle() {
    if (!this.vehicle) return;
    const v = this.vehicle;
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(2.2);
    this.pos.set(v.pos.x + side.x, v.pos.y + 0.5, v.pos.z + side.z);
    this.pos.y = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.vel.set(0, 0, 0);
    v.driver = null;
    this.vehicle = null;
    this.rig.root.visible = true;
  }

  _updateInVehicle(dt) {
    const v = this.vehicle;
    this.pos.copy(v.pos);
    this.rig.root.position.copy(v.pos);
  }

  /* ---------------- Schaden ---------------- */

  takeDamage(amount, from, cause) {
    if (!this.alive) return false;
    let dmg = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed; dmg -= absorbed;
    }
    this.hp -= dmg;
    this.hitFlash = 0.25;
    sfx.hurt();
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  /** Wiedereinstieg im Team-Modus. */
  respawn(p) {
    if (this.vehicle) this.exitVehicle();
    this.pos.set(p.x, p.y + 0.2, p.z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.shield = this.loadedOut ? 50 : 0;
    this.alive = true;
    this.hitFlash = 0;
    this.rig.root.visible = true;
    if (this.weapon) { this.weapon.reloading = 0; this.weapon.cooldown = 0; }
    for (const w of this.slots) if (w && w.def.mag) { w.mag = w.def.mag; w.reserve = w.def.reserve; }
  }

  heal(hp, shield) {
    if (hp) this.hp = Math.min(this.maxHp, this.hp + hp);
    if (shield) this.shield = Math.min(this.maxShield, this.shield + shield);
  }

  /* ---------------- Kamera ---------------- */

  updateCamera(camera, dt) {
    const target = new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.86, this.pos.z);
    if (this.vehicle) {
      target.set(this.vehicle.pos.x, this.vehicle.pos.y + 2.4, this.vehicle.pos.z);
    }
    const dist = this.vehicle ? 9.5 : (this.ads ? 2.3 : 4.8);
    const shoulder = this.vehicle ? 0 : (this.ads ? 0.75 : 0.62);
    // Mindestabstand, damit die Kamera nicht in Fahrzeug oder Figur rutscht
    const minDist = this.vehicle ? 5.0 : 1.9;

    const dir = this.lookDir();
    const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const desired = target.clone()
      .addScaledVector(dir, -dist)
      .addScaledVector(right, shoulder)
      .add(new THREE.Vector3(0, this.ads ? 0.08 : 0.35, 0));

    // Kamera nicht durch Geometrie schieben
    const back = desired.clone().sub(target);
    const backLen = back.length();
    const bd = back.clone().normalize();
    const blocked = marchWorld(target, bd, backLen, this.world, 0.3);
    const finalLen = Math.min(backLen, blocked === Infinity ? backLen : Math.max(minDist, blocked - 0.35));
    const finalPos = target.clone().addScaledVector(bd, finalLen);
    const groundY = this.world.terrain.heightAt(finalPos.x, finalPos.z) + 0.6;
    if (finalPos.y < groundY) finalPos.y = groundY;

    camera.position.lerp(finalPos, Math.min(1, dt * (this.vehicle ? 9 : 18)));
    const look = target.clone().addScaledVector(dir, 12);
    camera.lookAt(look);
    if (this.recoil > 0) camera.rotateX(this.recoil * 0.02);
  }

  dispose() { this.scene.remove(this.rig.root); }
}
