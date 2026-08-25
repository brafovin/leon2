import * as THREE from 'three';
import { World } from './world/island.js';
import { Player } from './entities/player.js';
import { Bot } from './entities/bot.js';
import { Storm } from './systems/storm.js';
import { BuildSystem } from './systems/build.js';
import { Effects, Projectiles } from './systems/combat.js';
import { Porsche } from './vehicles/porsche.js';
import { sfx } from './engine/audio.js';
import { findItem } from './ui/catalog.js';

const BOT_COUNT = { br: 29, arena: 15 };

export class Match {
  /**
   * @param {THREE.Scene} scene
   * @param {{mode:'br'|'arena', loadout:{skin:string,pickaxe:string,car:string|null}, hud:any}} opts
   */
  constructor(scene, { mode, loadout, hud }) {
    this.scene = scene;
    this.mode = mode;
    this.hud = hud;
    this.ended = false;
    this.time = 0;
    this.result = null;

    this.world = new World(scene, { mode });
    this.effects = new Effects(scene);
    this.projectiles = new Projectiles(scene);
    this.storm = new Storm(scene, this.world.size, mode);

    this.build = new BuildSystem(this.world, scene);
    this.build.enabled = mode !== 'arena';     // Arena: kein Bauen

    // Spieler
    const sp = this.world.spawnPoints[Math.floor(Math.random() * this.world.spawnPoints.length)];
    this.player = new Player(scene, this.world, { mode, skin: loadout.skin, pickaxe: loadout.pickaxe });
    this.player.pos.set(sp.x, sp.y + 0.2, sp.z);

    // Gegner
    this.bots = [];
    const count = BOT_COUNT[mode];
    const diffPool = mode === 'arena' ? ['arena', 'arena', 'hard'] : ['easy', 'normal', 'normal', 'hard'];
    const minDist = mode === 'arena' ? 30 : 45;
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 12; tries++) {
        const p = this.world.spawnPoints[Math.floor(Math.random() * this.world.spawnPoints.length)];
        x = p.x + (Math.random() - 0.5) * 8;
        z = p.z + (Math.random() - 0.5) * 8;
        if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) >= minDist) break;
      }
      const diff = diffPool[Math.floor(Math.random() * diffPool.length)];
      this.bots.push(new Bot(scene, this.world, { x, y: this.world.terrain.heightAt(x, z), z }, diff, i));
    }
    this.totalPlayers = this.bots.length + 1;

    this.targets = [this.player, ...this.bots];

    // Fahrzeug (nur wenn im Spind ausgerüstet)
    this.porsche = null;
    if (loadout.car) {
      const item = findItem(loadout.car);
      const px = this.player.pos.x + 6, pz = this.player.pos.z + 4;
      this.porsche = new Porsche(scene, this.world, {
        x: px, y: this.world.terrain.heightAt(px, pz), z: pz, color: item?.color || 'guardsRed',
      });
    }

    this.stormTick = 0;
    this.killsThisMatch = 0;
    this.placement = this.totalPlayers;

    this.ctx = {
      targets: this.targets,
      effects: this.effects,
      projectiles: this.projectiles,
      build: this.build.enabled ? this.build : null,
      storm: this.storm,
      buildMode: false,
      damage: (t, amt, from, head) => this.damage(t, amt, from, head),
      onHarvest: (mat, n) => { if (n > 0) this.hud.toast(`+${n} ${matName(mat)}`, 700); },
    };
  }

  /* ---------------- Schaden & Eliminierungen ---------------- */

  damage(target, amount, from, head) {
    if (!target?.alive) return;
    const dead = target.takeDamage(amount, from, null);
    if (from === this.player) this.hud.hitMarker();
    if (!dead) return;

    if (target === this.player) {
      this.placement = 1 + this.bots.filter((b) => b.alive).length;
      this._finish(false, from?.name || 'dem Sturm');
      return;
    }
    target.die?.();
    if (from === this.player) {
      this.player.kills++;
      this.killsThisMatch++;
      sfx.elim();
      this.hud.killfeed(`Du ▸ ${target.name}`, '#ffc93c');
      this.hud.toast(`ELIMINIERT — ${target.name}`, 1200);
      // Beute des Gegners: Munition & Schild
      this.player.heal(0, 25);
      if (this.mode !== 'arena') {
        this.player.mats.wood += 20; this.player.mats.stone += 12; this.player.mats.metal += 8;
      }
    } else {
      this.hud.killfeed(`${from?.name || 'Sturm'} ▸ ${target.name}`);
    }
    this._checkWin();
  }

  _checkWin() {
    if (this.ended) return;
    if (!this.bots.some((b) => b.alive)) {
      this.placement = 1;
      this._finish(true, null);
    }
  }

  _finish(won, killer) {
    if (this.ended) return;
    this.ended = true;
    this.result = {
      won, killer, placement: this.placement,
      kills: this.killsThisMatch, total: this.totalPlayers, mode: this.mode,
    };
    won ? sfx.victory() : sfx.defeat();
  }

  /* ---------------- Loop ---------------- */

  update(dt, input) {
    if (this.ended) { this.effects.update(dt); return; }
    this.time += dt;

    // Bau-Eingaben (nur BR)
    if (this.build.enabled) {
      if (input.hit('KeyQ')) this.build.setMode('wall');
      if (input.hit('KeyE')) this.build.setMode('ramp');
      if (input.hit('KeyR') && this.player.weapon?.def.melee) this.build.setMode('floor');
      if (input.hit('KeyC')) this.build.cycleMaterial();
      this.ctx.buildMode = !!this.build.mode;
      if (this.build.mode) {
        this.build.updateGhost(this.player, this.player.mats);
        if (input.mouse.leftPressed) {
          if (this.build.place(this.player, this.player.mats)) sfx.build();
        }
      }
    } else if (input.hit('KeyQ') || input.hit('KeyE')) {
      this.hud.toast('IM ARENA-MODUS IST BAUEN DEAKTIVIERT', 900);
    }

    // Waffenwahl
    for (let i = 0; i < 4; i++) {
      if (input.hit(`Digit${i + 1}`)) { this.player.selectSlot(i); this.build.setMode(null); this.ctx.buildMode = false; }
    }
    if (input.mouse.wheel) {
      const dirn = input.mouse.wheel > 0 ? 1 : -1;
      for (let k = 1; k <= 4; k++) {
        const i = (this.player.slot + dirn * k + 8) % 4;
        if (this.player.slots[i]) { this.player.selectSlot(i); break; }
      }
    }

    // Interaktion: Fahrzeug / Truhe
    if (input.hit('KeyF')) this._interact();

    // Spieler & Gegner
    const buildingBlocksFire = this.ctx.buildMode;
    if (buildingBlocksFire) {
      const saveLeft = input.mouse.left, savePressed = input.mouse.leftPressed;
      input.mouse.left = false; input.mouse.leftPressed = false;
      this.player.update(dt, input, this.ctx);
      input.mouse.left = saveLeft; input.mouse.leftPressed = savePressed;
    } else {
      this.player.update(dt, input, this.ctx);
    }

    for (const b of this.bots) if (b.alive) b.update(dt, this.ctx);

    this.projectiles.update(dt, this.world, this.targets, (target, dmg, head, point, owner) => {
      if (target) { this.damage(target, dmg, owner, head); }
      else { this.effects.impact(point, 0xcfd8e3, 3); this.build.damageAt(point, 1.0, 60); }
    });

    if (this.porsche) {
      this.porsche.update(dt, this.player.vehicle === this.porsche ? input : null);
      const near = this.porsche.pos.distanceTo(this.player.pos) < 4.5 && !this.player.vehicle;
      this.porsche.setPromptVisible(near);
      if (near) this.hud.toast('<kbd>F</kbd> Porsche 991 einsteigen', 400);
      // Anfahren von Gegnern
      if (this.player.vehicle === this.porsche && Math.abs(this.porsche.speed) > 12) {
        for (const b of this.bots) {
          if (b.alive && b.pos.distanceTo(this.porsche.pos) < 2.6) {
            this.damage(b, 65, this.player, false);
          }
        }
      }
    }

    // Sturm
    this.storm.update(dt);
    const inStorm = this.storm.outside(this.player.pos.x, this.player.pos.z);
    this.stormTick += dt;
    if (this.stormTick >= 0.5) {
      this.stormTick = 0;
      if (inStorm) this.damage(this.player, this.storm.damage * 0.5, null, false);
      for (const b of this.bots) {
        if (b.alive && this.storm.outside(b.pos.x, b.pos.z)) {
          if (b.takeDamage(this.storm.damage * 0.5)) {
            b.die();
            this.hud.killfeed(`${b.name} vom Sturm erwischt`, '#a24bff');
            this._checkWin();
          }
        }
      }
    }
    this.inStorm = inStorm;

    // Truhen-Animation
    for (const c of this.world.chests) {
      if (c.userData.opened) continue;
      c.userData.glow.position.y = 0.85 + Math.sin(this.time * 3 + c.position.x) * 0.06;
      c.userData.glow.rotation.y += dt;
    }

    this.effects.update(dt);
    this._checkWin();
  }

  _interact() {
    // Fahrzeug hat Vorrang
    if (this.player.vehicle) { this.player.exitVehicle(); sfx.ui(); return; }
    if (this.porsche && this.porsche.pos.distanceTo(this.player.pos) < 4.5) {
      this.player.enterVehicle(this.porsche);
      sfx.pickup();
      this.hud.toast('PORSCHE 991 — <kbd>F</kbd> zum Aussteigen', 1400);
      return;
    }
    // Truhe
    let best = null, bestD = 3.2;
    for (const c of this.world.chests) {
      if (c.userData.opened) continue;
      const d = c.position.distanceTo(this.player.pos);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return;
    best.userData.opened = true;
    best.userData.lid.rotation.x = -1.1;
    best.userData.lid.position.z = -0.3;
    best.userData.glow.visible = false;
    sfx.pickup();

    const roll = Math.random();
    const gun = roll < 0.45 ? 'smg' : roll < 0.78 ? 'shotgun' : 'bow';
    this.player.pickupWeapon(gun);
    this.player.heal(0, 25);
    if (this.mode !== 'arena') {
      this.player.mats.wood += 30; this.player.mats.stone += 20; this.player.mats.metal += 10;
    }
    this.hud.toast(`TRUHE: ${gun.toUpperCase()} · +25 Schild`, 1400);
  }

  aliveCount() { return 1 + this.bots.filter((b) => b.alive).length - (this.player.alive ? 0 : 1); }

  dispose() {
    this.projectiles.clear();
    this.effects.clear();
    this.build.clear();
    this.scene.remove(this.build.ghost);
    this.storm.dispose(this.scene);
    this.porsche?.dispose();
    for (const b of this.bots) b.dispose();
    this.player.dispose();
    this.world.dispose();
  }
}

function matName(m) { return m === 'wood' ? 'Holz' : m === 'stone' ? 'Stein' : 'Metall'; }
