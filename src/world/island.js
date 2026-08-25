import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { mulberry32 } from './noise.js';
import { buildTree, buildRock, buildBush, buildWreck, buildHouse, buildTower, buildChest, buildRoadPatch } from './props.js';

const EMPTY = [];

const POI_NAMES_BR = [
  'Kratos-Klippe', 'Atreus-Wald', 'Porsche-Werk', 'Midgard-Markt',
  'Frost-Feste', 'Donner-Docks', 'Runen-Ruine', 'Nebeltal',
];
const POI_NAMES_ARENA = ['Arena-Nord', 'Arena-Süd', 'Zentralring', 'Steinbruch'];

export class World {
  /**
   * @param {THREE.Scene} scene
   * @param {{mode:'br'|'arena', seed?:number}} opts
   */
  constructor(scene, { mode = 'br', seed = Math.floor(Math.random() * 1e9) } = {}) {
    this.scene = scene;
    this.mode = mode;
    this.rng = mulberry32(seed);
    this.group = new THREE.Group();
    scene.add(this.group);

    const size = mode === 'arena' ? 230 : 430;
    this.size = size;
    this.terrain = new Terrain({ size, segments: mode === 'arena' ? 120 : 170, seed, hilliness: mode === 'arena' ? 0.7 : 1 });
    this.group.add(this.terrain.mesh);
    this.water = Terrain.water(size);
    this.group.add(this.water);

    /** @type {Array<{x:number,z:number,hw:number,hd:number,y0:number,y1:number,round?:boolean,r?:number,owner?:any}>} */
    this.colliders = [];
    /** Begehbare Flächen über dem Terrain (Dächer, Böden, Bauteile). */
    this.platforms = [];
    // Uniformes Gitter: hält Kollisions- und Bodenabfragen bei tausenden
    // Objekten konstant schnell.
    this.cell = 8;
    this.grid = new Map();
    this.pgrid = new Map();
    /** @type {Array<any>} */
    this.harvestables = [];
    this.chests = [];
    this.pois = [];
    this.spawnPoints = [];
    this._scratch = [];

    this._generate();
  }

  /* ---------------- Generierung ---------------- */

  _generate() {
    const rng = this.rng;
    const half = this.size / 2;
    const isArena = this.mode === 'arena';

    // --- POIs (Named Locations) ---
    const names = isArena ? POI_NAMES_ARENA : POI_NAMES_BR;
    const poiCount = names.length;
    for (let i = 0; i < poiCount; i++) {
      const a = (i / poiCount) * Math.PI * 2 + rng() * 0.5;
      const r = half * (isArena ? 0.42 : 0.3 + rng() * 0.38);
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.terrain.heightAt(x, z) < 1.2) { x *= 0.6; z *= 0.6; }
      this.pois.push({ name: names[i], x, z });
      this._buildSettlement(x, z, isArena ? 3 : 4 + Math.floor(rng() * 4));
    }

    // --- Vegetation & Ressourcen ---
    const treeCount = isArena ? 220 : 620;
    for (let i = 0; i < treeCount; i++) this._scatter(buildTree(rng), 1.0);
    const rockCount = isArena ? 110 : 260;
    for (let i = 0; i < rockCount; i++) this._scatter(buildRock(rng), 0.6);
    for (let i = 0; i < (isArena ? 90 : 220); i++) this._scatter(buildBush(rng), 0.3);
    for (let i = 0; i < (isArena ? 14 : 40); i++) this._scatter(buildWreck(rng), 0.9);

    // --- Türme ---
    for (let i = 0; i < (isArena ? 3 : 7); i++) {
      const p = this._findFlat(6);
      if (!p) continue;
      const t = buildTower(rng);
      t.position.set(p.x, p.y, p.z);
      this._registerStructure(t, p);
      this.group.add(t);
    }

    // --- Truhen ---
    const chestCount = isArena ? 22 : 65;
    for (let i = 0; i < chestCount; i++) {
      const p = this._findFlat(2);
      if (!p) continue;
      const c = buildChest();
      c.position.set(p.x, p.y, p.z);
      c.rotation.y = rng() * Math.PI * 2;
      c.userData.opened = false;
      this.group.add(c);
      this.chests.push(c);
    }

    // --- Spawnpunkte ---
    for (let i = 0; i < 80; i++) {
      const p = this._findFlat(3, half * 0.85);
      if (p) this.spawnPoints.push(p);
    }
    if (!this.spawnPoints.length) this.spawnPoints.push({ x: 0, y: this.terrain.heightAt(0, 0), z: 0 });
  }

  _buildSettlement(cx, cz, count) {
    const rng = this.rng;
    const road = buildRoadPatch(30);
    road.position.set(cx, this.terrain.heightAt(cx, cz) + 0.06, cz);
    this.group.add(road);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.7;
      const r = 9 + rng() * 13;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (this.terrain.outOfBounds(x, z) || this.terrain.heightAt(x, z) < 0.9) continue;
      const h = buildHouse(rng);
      const y = this.terrain.heightAt(x, z);
      h.position.set(x, y, z);
      h.rotation.y = Math.round(rng() * 4) * (Math.PI / 2);
      this._registerStructure(h, { x, y, z });
      this.group.add(h);

      // Truhe im Haus
      if (rng() < 0.7) {
        const c = buildChest();
        c.position.set(x + (rng() - 0.5) * 3, y + 0.24, z + (rng() - 0.5) * 3);
        c.userData.opened = false;
        this.group.add(c);
        this.chests.push(c);
      }
    }
  }

  /** Kollisionsboxen eines Gebäudes ins Weltkoordinatensystem übertragen. */
  _registerStructure(obj, p) {
    const cols = obj.userData.colliders || [];
    const cos = Math.cos(obj.rotation.y), sin = Math.sin(obj.rotation.y);
    for (const c of cols) {
      const wx = p.x + c.x * cos + c.z * sin;
      const wz = p.z - c.x * sin + c.z * cos;
      const swap = Math.abs(sin) > 0.5;
      this.addCollider({
        x: wx, z: wz,
        hw: swap ? c.hd : c.hw,
        hd: swap ? c.hw : c.hd,
        y0: p.y + c.y0, y1: p.y + c.y1,
        round: c.round, r: c.r,
      });
    }
    if (obj.userData.roofY != null) {
      const fp = obj.userData.footprint || { w: 8, d: 8 };
      this.addPlatform({ x: p.x, z: p.z, hw: fp.w / 2 - 1.5, hd: fp.d / 2 - 0.6, y: p.y + obj.userData.roofY });
      this.addPlatform({ x: p.x, z: p.z, hw: fp.w / 2 - 2.2, hd: fp.d / 2 - 1.4, y: p.y + 0.24 });
    }
  }

  _scatter(obj, minHeight) {
    const p = this._findFlat(1.2, this.size / 2 * 0.94, minHeight);
    if (!p) return;
    obj.position.set(p.x, p.y, p.z);
    // Streuobjekte sind statisch und werfen keine Schatten -> spart den
    // zweiten Renderdurchlauf für über tausend Meshes.
    obj.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
    this.group.add(obj);
    if (obj.userData.harvest) {
      const h = obj.userData.harvest;
      const entry = {
        obj, hp: h.hp, maxHp: h.hp, mat: h.mat, yield: h.yield,
        x: p.x, y: p.y, z: p.z, radius: h.radius, height: h.height, alive: true,
      };
      this.harvestables.push(entry);
      entry.collider = this.addCollider({ x: p.x, z: p.z, hw: h.radius * 0.6, hd: h.radius * 0.6,
        y0: p.y, y1: p.y + h.height, harvestable: entry });
    }
  }

  _findFlat(clearance = 2, maxR = null, minHeight = 0.9) {
    const half = this.size / 2;
    const lim = maxR ?? half * 0.9;
    for (let tries = 0; tries < 26; tries++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * lim;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = this.terrain.heightAt(x, z);
      if (y < minHeight) continue;
      const slope = Math.abs(this.terrain.heightAt(x + 2, z) - y) + Math.abs(this.terrain.heightAt(x, z + 2) - y);
      if (slope > clearance) continue;
      if (this._blocked(x, z, clearance)) continue;
      return { x, y, z };
    }
    return null;
  }

  _blocked(x, z, pad) {
    const list = this.nearColliders(x, z, pad + 3, this._scratch);
    for (const c of list) {
      if (Math.abs(c.x - x) < c.hw + pad && Math.abs(c.z - z) < c.hd + pad) return true;
    }
    return false;
  }


  /* ---------------- Räumliches Gitter ---------------- */

  _key(cx, cz) { return cx * 100003 + cz; }

  _cells(x, z, hw, hd) {
    const c = this.cell;
    const x0 = Math.floor((x - hw) / c), x1 = Math.floor((x + hw) / c);
    const z0 = Math.floor((z - hd) / c), z1 = Math.floor((z + hd) / c);
    const out = [];
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) out.push(this._key(cx, cz));
    return out;
  }

  _index(map, item, hw, hd) {
    for (const k of this._cells(item.x, item.z, hw, hd)) {
      let list = map.get(k);
      if (!list) { list = []; map.set(k, list); }
      list.push(item);
    }
  }

  _unindex(map, item, hw, hd) {
    for (const k of this._cells(item.x, item.z, hw, hd)) {
      const list = map.get(k);
      if (!list) continue;
      const i = list.indexOf(item);
      if (i >= 0) list.splice(i, 1);
    }
  }

  addCollider(c) {
    this.colliders.push(c);
    this._index(this.grid, c, c.round ? c.r : c.hw, c.round ? c.r : c.hd);
    return c;
  }

  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    this._unindex(this.grid, c, c.round ? c.r : c.hw, c.round ? c.r : c.hd);
  }

  addPlatform(p) {
    this.platforms.push(p);
    this._index(this.pgrid, p, p.hw, p.hd);
    return p;
  }

  removePlatform(p) {
    const i = this.platforms.indexOf(p);
    if (i >= 0) this.platforms.splice(i, 1);
    this._unindex(this.pgrid, p, p.hw, p.hd);
  }

  /** Kollider in der Zelle des Punktes (exakt für Punkttests). */
  cellColliders(x, z) {
    return this.grid.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || EMPTY;
  }

  /** Kollider im Umkreis (für Radius-Auflösung). */
  nearColliders(x, z, pad, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - pad) / c), x1 = Math.floor((x + pad) / c);
    const z0 = Math.floor((z - pad) / c), z1 = Math.floor((z + pad) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.grid.get(this._key(cx, cz));
        if (!list) continue;
        for (const item of list) if (!out.includes(item)) out.push(item);
      }
    }
    return out;
  }

  /** true, wenn der Punkt in einem festen Kollider liegt. */
  solidAt(x, y, z) {
    const list = this.cellColliders(x, z);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (y < c.y0 || y > c.y1) continue;
      if (c.round) { if (Math.hypot(x - c.x, z - c.z) < c.r) return true; continue; }
      if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) return true;
    }
    return false;
  }

  /* ---------------- Abfragen ---------------- */

  /** Höhe des begehbaren Bodens unter/at fromY. */
  groundAt(x, z, fromY = 1e5) {
    let best = this.terrain.heightAt(x, z);
    const list = this.pgrid.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (Math.abs(p.x - x) <= p.hw && Math.abs(p.z - z) <= p.hd && p.y <= fromY + 0.6 && p.y > best) best = p.y;
      }
    }
    return best;
  }

  /** Horizontale Kollision auflösen; gibt korrigierte x/z zurück. */
  resolve(x, z, y, radius, height = 1.8) {
    let nx = x, nz = z;
    const list = this.nearColliders(x, z, radius + 2, this._scratch);
    for (const c of list) {
      if (y + height < c.y0 || y > c.y1) continue;
      const dx = nx - c.x, dz = nz - c.z;
      if (c.round) {
        const d = Math.hypot(dx, dz);
        if (d < c.r + radius && d > 1e-4) {
          const push = (c.r + radius - d);
          nx += (dx / d) * push; nz += (dz / d) * push;
        }
        continue;
      }
      const ox = c.hw + radius - Math.abs(dx);
      const oz = c.hd + radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) nx += Math.sign(dx || 1) * ox;
        else nz += Math.sign(dz || 1) * oz;
      }
    }
    return { x: nx, z: nz };
  }

  /** Nächstes abbaubares Objekt im Radius vor dem Spieler. */
  harvestableNear(pos, dir, range) {
    let best = null, bestScore = -1;
    for (const h of this.harvestables) {
      if (!h.alive) continue;
      const dx = h.x - pos.x, dz = h.z - pos.z;
      const dy = (h.y + h.height * 0.4) - pos.y;
      const dist = Math.hypot(dx, dz);
      if (dist > range + h.radius || Math.abs(dy) > 4) continue;
      const d = dist || 1e-4;
      const dot = (dx / d) * dir.x + (dz / d) * dir.z;
      if (dot < 0.35) continue;
      const score = dot * 2 - dist * 0.1;
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best;
  }

  damageHarvestable(h, dmg) {
    h.hp -= dmg;
    if (h.hp <= 0 && h.alive) {
      h.alive = false;
      this.group.remove(h.obj);
      if (h.collider) this.removeCollider(h.collider);
      return true;
    }
    // Wackel-Feedback
    h.obj.rotation.z = (Math.random() - 0.5) * 0.06;
    h.obj.updateMatrix();
    return false;
  }

  addBuildPiece(collider, platform, mesh) {
    if (collider) this.addCollider(collider);
    if (platform) this.addPlatform(platform);
    if (mesh) this.group.add(mesh);
  }

  removeBuildPiece(piece) {
    if (piece.mesh) this.group.remove(piece.mesh);
    if (piece.collider) this.removeCollider(piece.collider);
    if (piece.platform) this.removePlatform(piece.platform);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose?.(); });
  }
}
