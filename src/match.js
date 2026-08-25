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

const BOT_COUNT = { br: 29, arena: 15, team: 11 };
const TEAM_TARGET = 25;                    // Elims bis zum Sieg
const TEAM_COLORS = [0x4fa8ff, 0xff5a4d];  // Team 1 blau, Team 2 rot
const RESPAWN_DELAY = 3.5;

export class Match {
  /**
   * @param {THREE.Scene} scene
   * @param {{mode:'br'|'arena', loadout:{skin:string,pickaxe:string,car:string|null}, hud:any}} opts
   */
  constructor(scene, opts) {
    const { mode, loadout, hud } = opts;
    this.scene = scene;
    this.mode = mode;
    this.hud = hud;
    this.ended = false;
    this.time = 0;
    this.result = null;

    this.teamPlay = mode === 'team';
    this.world = new World(scene, {
      mode,
      layout: this.teamPlay ? 'town' : 'island',
      quality: opts.quality ?? 1,
    });
    this.effects = new Effects(scene);
    this.projectiles = new Projectiles(scene);
    // Im Team-Modus gibt es keinen Sturm - die Stadtinsel ist die Arena.
    this.storm = this.teamPlay ? null : new Storm(scene, this.world.size, mode);
    this.score = [0, 0];
    this.respawns = [];

    this.build = new BuildSystem(this.world, scene);
    this.build.enabled = mode !== 'arena';     // Arena: kein Bauen

    // Spieler
    const sp = this.teamPlay
      ? this._teamSpawn(0)
      : this.world.spawnPoints[Math.floor(Math.random() * this.world.spawnPoints.length)];
    this.player = new Player(scene, this.world, { mode, skin: loadout.skin, pickaxe: loadout.pickaxe, team: 0 });
    this.player.pos.set(sp.x, sp.y + 0.2, sp.z);

    // Gegner
    this.bots = [];
    const count = Math.max(5, Math.round(BOT_COUNT[mode] * (opts.botScale ?? 1)));
    const diffPool = mode === 'arena' ? ['arena', 'arena', 'hard']
      : mode === 'team' ? ['normal', 'normal', 'hard']
      : ['easy', 'normal', 'normal', 'hard'];
    const minDist = mode === 'arena' ? 30 : 45;
    for (let i = 0; i < count; i++) {
      const team = this.teamPlay ? (i % 2 === 0 ? 1 : 0) : 0;
      let x = 0, z = 0;
      if (this.teamPlay) {
        const p = this._teamSpawn(team);
        x = p.x + (Math.random() - 0.5) * 10;
        z = p.z + (Math.random() - 0.5) * 10;
      } else {
        for (let tries = 0; tries < 12; tries++) {
          const p = this.world.spawnPoints[Math.floor(Math.random() * this.world.spawnPoints.length)];
          x = p.x + (Math.random() - 0.5) * 8;
          z = p.z + (Math.random() - 0.5) * 8;
          if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) >= minDist) break;
        }
      }
      const diff = diffPool[Math.floor(Math.random() * diffPool.length)];
      const bot = new Bot(scene, this.world, { x, y: this.world.terrain.heightAt(x, z), z }, diff, i, team);
      if (this.teamPlay) bot.setTeamMarker(TEAM_COLORS[team]);
      this.bots.push(bot);
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
      teamPlay: this.teamPlay,
      buildMode: false,
      damage: (t, amt, from, head) => this.damage(t, amt, from, head),
      onHarvest: (mat, n) => { if (n > 0) this.hud.toast(`+${n} ${matName(mat)}`, 700); },
    };
  }

  /* ---------------- Schaden & Eliminierungen ---------------- */

  damage(target, amount, from, head) {
    if (!target?.alive) return;
    if (this.teamPlay && from && from !== target && from.team === target.team) return;  // kein Friendly Fire
    const dead = target.takeDamage(amount, from, null);
    if (from === this.player) this.hud.hitMarker();
    if (!dead) return;

    if (this.teamPlay) { this._teamElim(target, from); return; }

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

  /* ---------------- Team-Rumble ---------------- */

  _teamSpawn(team) {
    const list = this.world.teamSpawns?.[team] || this.world.spawnPoints;
    return list[Math.floor(Math.random() * list.length)];
  }

  _teamElim(target, from) {
    const scorer = from && from.team !== target.team ? from.team : (target.team === 0 ? 1 : 0);
    this.score[scorer]++;

    if (target === this.player) {
      this.player.rig.root.visible = false;
      if (this.player.vehicle) this.player.exitVehicle();
      this.hud.killfeed(`${from?.name || 'Umgebung'} ▸ Du`);
      this.hud.toast('AUSGESCHALTET<br><span style="font-size:15px">Wiedereinstieg in 3 Sekunden</span>', 2500);
    } else {
      target.die();
      if (from === this.player) {
        this.player.kills++;
        this.killsThisMatch++;
        sfx.elim();
        this.hud.killfeed(`Du ▸ ${target.name}`, '#ffc93c');
        this.hud.toast(`ELIMINIERT — ${target.name}`, 1000);
        this.player.heal(0, 25);
      } else {
        this.hud.killfeed(`${from?.name || 'Umgebung'} ▸ ${target.name}`,
          TEAM_COLORS[from?.team ?? 0] === TEAM_COLORS[0] ? '#4fa8ff' : '#ff5a4d');
      }
    }
    this.respawns.push({ entity: target, at: this.time + RESPAWN_DELAY });

    if (this.score[scorer] >= TEAM_TARGET) {
      this.placement = scorer === 0 ? 1 : 2;
      this._finish(scorer === 0, from === this.player ? null : from?.name);
    }
  }

  _updateRespawns() {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.time < r.at) continue;
      r.entity.respawn(this._teamSpawn(r.entity.team));
      this.respawns.splice(i, 1);
      if (r.entity === this.player) this.hud.toast('LOS GEHT’S', 700);
    }
  }

  _checkWin() {
    if (this.ended || this.teamPlay) return;
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
      score: [...this.score],
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
    if (!this.player.alive && this.teamPlay) {
      // Wartezeit bis zum Wiedereinstieg: nur Umsehen erlaubt
      this.player.yaw -= input.mouse.dx;
      this.player.pitch = Math.max(-1.3, Math.min(1.3, this.player.pitch + input.mouse.dy));
      for (const b of this.bots) if (b.alive) b.update(dt, this.ctx);
      this._updateRespawns();
      this.effects.update(dt);
      return;
    }
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

    // Sturm (im Team-Modus deaktiviert)
    let inStorm = false;
    if (this.storm) {
      this.storm.update(dt);
      inStorm = this.storm.outside(this.player.pos.x, this.player.pos.z);
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
    } else {
      this._updateRespawns();
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

  /** Scoreboard-Daten für das HUD. */
  teamState() {
    const rows = [
      { name: 'Team 1', score: this.score[0], you: true },
      { name: 'Team 2', score: this.score[1], you: false },
    ].sort((a, b) => b.score - a.score);
    return {
      rows, target: TEAM_TARGET, own: this.score[0], now: this.time,
      respawn: this.respawns.find((r) => r.entity === this.player),
    };
  }

  dispose() {
    this.projectiles.clear();
    this.effects.clear();
    this.build.clear();
    this.scene.remove(this.build.ghost);
    this.storm?.dispose(this.scene);
    this.porsche?.dispose();
    for (const b of this.bots) b.dispose();
    this.player.dispose();
    this.world.dispose();
  }
}

function matName(m) { return m === 'wood' ? 'Holz' : m === 'stone' ? 'Stein' : 'Metall'; }
