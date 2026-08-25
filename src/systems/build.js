import * as THREE from 'three';

/* Bau-System (nur Battle Royale - im Arena-Modus deaktiviert). */

export const GRID = 4;
export const BUILD_COST = 10;

const MATS = {
  wood: new THREE.MeshLambertMaterial({ color: '#c98a3c' }),
  stone: new THREE.MeshLambertMaterial({ color: '#9aa2ab' }),
  metal: new THREE.MeshLambertMaterial({ color: '#7fa8c8' }),
};
const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0x5cf08e, transparent: true, opacity: 0.35, depthWrite: false });
const GHOST_BAD = new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.3, depthWrite: false });

const GEO = {
  wall: new THREE.BoxGeometry(GRID, GRID, 0.25),
  floor: new THREE.BoxGeometry(GRID, 0.25, GRID),
  ramp: new THREE.BoxGeometry(GRID, 0.25, GRID * 1.42),
};

export const PIECE_HP = { wood: 150, stone: 300, metal: 500 };

export class BuildSystem {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.enabled = true;
    this.mode = null;              // 'wall' | 'ramp' | 'floor' | null
    this.material = 'wood';
    this.pieces = [];
    this.ghost = new THREE.Mesh(GEO.wall, GHOST_OK);
    this.ghost.visible = false;
    scene.add(this.ghost);
  }

  setMode(mode) {
    this.mode = this.mode === mode ? null : mode;
    this.ghost.visible = false;
  }

  cycleMaterial() {
    this.material = this.material === 'wood' ? 'stone' : this.material === 'stone' ? 'metal' : 'wood';
  }

  /** Zielzelle aus Spielerposition + Blickrichtung. */
  _target(player) {
    const dir = player.forward();
    const dist = this.mode === 'floor' ? GRID * 0.85 : GRID * 0.9;
    const px = player.pos.x + dir.x * dist;
    const pz = player.pos.z + dir.z * dist;
    const gx = Math.round(px / GRID) * GRID;
    const gz = Math.round(pz / GRID) * GRID;
    const baseY = this.world.groundAt(gx, gz, player.pos.y + 2);

    if (this.mode === 'wall') {
      // Wand quer zur Blickrichtung ausrichten
      const yaw = Math.abs(dir.x) > Math.abs(dir.z) ? Math.PI / 2 : 0;
      return { x: gx, y: baseY + GRID / 2, z: gz, rotY: yaw, kind: 'wall' };
    }
    if (this.mode === 'floor') {
      return { x: gx, y: Math.max(baseY + 0.15, player.pos.y + 0.05), z: gz, rotY: 0, kind: 'floor' };
    }
    const yaw = Math.atan2(dir.x, dir.z);
    const snapped = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    return { x: gx, y: baseY + GRID / 2 - 0.6, z: gz, rotY: snapped, kind: 'ramp' };
  }

  updateGhost(player, mats) {
    if (!this.enabled || !this.mode) { this.ghost.visible = false; return; }
    const t = this._target(player);
    this.ghost.geometry = GEO[t.kind];
    this.ghost.position.set(t.x, t.y, t.z);
    this.ghost.rotation.set(t.kind === 'ramp' ? -0.62 : 0, t.rotY, 0);
    const affordable = mats[this.material] >= BUILD_COST;
    const free = !this._occupied(t);
    this.ghost.material = (affordable && free) ? GHOST_OK : GHOST_BAD;
    this.ghost.visible = true;
    return { t, ok: affordable && free };
  }

  _occupied(t) {
    return this.pieces.some((p) => p.kind === t.kind &&
      Math.abs(p.x - t.x) < 0.5 && Math.abs(p.z - t.z) < 0.5 && Math.abs(p.y - t.y) < 1.2);
  }

  place(player, mats) {
    if (!this.enabled || !this.mode) return false;
    const t = this._target(player);
    if (mats[this.material] < BUILD_COST || this._occupied(t)) return false;
    mats[this.material] -= BUILD_COST;

    const mesh = new THREE.Mesh(GEO[t.kind], MATS[this.material]);
    mesh.position.set(t.x, t.y, t.z);
    mesh.rotation.set(t.kind === 'ramp' ? -0.62 : 0, t.rotY, 0);
    mesh.castShadow = true; mesh.receiveShadow = true;

    const piece = {
      kind: t.kind, x: t.x, y: t.y, z: t.z, mesh,
      hp: PIECE_HP[this.material], maxHp: PIECE_HP[this.material],
      collider: null, platform: null,
    };

    if (t.kind === 'wall') {
      const along = Math.abs(Math.sin(t.rotY)) > 0.5;
      piece.collider = { x: t.x, z: t.z, hw: along ? 0.2 : GRID / 2, hd: along ? GRID / 2 : 0.2,
        y0: t.y - GRID / 2, y1: t.y + GRID / 2, piece };
    } else if (t.kind === 'floor') {
      piece.platform = { x: t.x, z: t.z, hw: GRID / 2, hd: GRID / 2, y: t.y + 0.15, piece };
    } else {
      // Rampe: als Treppe aus flachen Plattformen abbilden
      piece.platform = { x: t.x, z: t.z, hw: GRID / 2, hd: GRID / 2, y: t.y + 0.6, piece };
    }

    this.world.addBuildPiece(piece.collider, piece.platform, mesh);
    this.pieces.push(piece);
    return true;
  }

  damageAt(point, radius, dmg) {
    let destroyed = false;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z) > radius + GRID * 0.6) continue;
      p.hp -= dmg;
      if (p.hp <= 0) {
        this.world.removeBuildPiece(p);
        this.pieces.splice(i, 1);
        destroyed = true;
      }
    }
    return destroyed;
  }

  clear() {
    for (const p of this.pieces) this.world.removeBuildPiece(p);
    this.pieces.length = 0;
    this.ghost.visible = false;
  }
}
