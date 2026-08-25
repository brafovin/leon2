import * as THREE from 'three';

/* ---------------- Waffendefinitionen ---------------- */

export const WEAPONS = {
  pickaxe: {
    id: 'pickaxe', name: 'Leviathan-Axt', slotKey: '1', icon: '🪓',
    melee: true, damage: 34, rate: 0.55, range: 3.2, rarity: 'legendary',
  },
  smg: {
    id: 'smg', name: 'Sturm-SMG', slotKey: '2', icon: '🔫',
    damage: 17, rate: 0.085, mag: 32, reserve: 240, reload: 1.9,
    spread: 0.028, adsSpread: 0.012, range: 90, rarity: 'rare', headMult: 1.75,
  },
  shotgun: {
    id: 'shotgun', name: 'Pump-Schrotflinte', slotKey: '3', icon: '💥',
    damage: 13, pellets: 9, rate: 0.85, mag: 5, reserve: 40, reload: 2.6,
    spread: 0.075, adsSpread: 0.055, range: 26, rarity: 'epic', headMult: 1.6,
  },
  bow: {
    id: 'bow', name: 'Talon-Bogen', slotKey: '4', icon: '🏹',
    damage: 62, rate: 0.95, mag: 1, reserve: 60, reload: 0.85,
    spread: 0.004, adsSpread: 0.0, range: 140, rarity: 'legendary', headMult: 2.2,
    projectile: true, projectileSpeed: 110,
  },
};

export const RARITY_COLOR = {
  common: 0x9aa4b2, uncommon: 0x3ddc84, rare: 0x3aa0ff,
  epic: 0xa24bff, legendary: 0xff9d2e, icon: 0x4fe6d0,
};

/* ---------------- Modelle ---------------- */

const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

function put(parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildSmg() {
  const g = new THREE.Group();
  const body = M('#31363f'), dark = M('#1a1d23'), accent = M('#3aa0ff');
  put(g, new THREE.BoxGeometry(0.12, 0.16, 0.62), body, 0, 0, 0.06);
  put(g, new THREE.BoxGeometry(0.08, 0.07, 0.44), dark, 0, 0.11, 0.16);      // Lauf/Schiene
  put(g, new THREE.BoxGeometry(0.09, 0.24, 0.11), dark, 0, -0.18, -0.06, 0.22, 0, 0); // Griff
  put(g, new THREE.BoxGeometry(0.08, 0.2, 0.1), dark, 0, -0.15, 0.14);       // Magazin
  put(g, new THREE.BoxGeometry(0.1, 0.11, 0.26), body, 0, -0.01, -0.28);     // Schaft
  put(g, new THREE.BoxGeometry(0.05, 0.03, 0.14), accent, 0, 0.16, 0.12);    // Visier
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0.03, 0.42); g.add(g.userData.muzzle);
  return g;
}

export function buildShotgun() {
  const g = new THREE.Group();
  const wood = M('#7a4f2a'), steel = M('#4a5058'), dark = M('#20242a');
  put(g, new THREE.CylinderGeometry(0.045, 0.045, 0.8, 8), steel, 0, 0.05, 0.18, Math.PI / 2, 0, 0);
  put(g, new THREE.BoxGeometry(0.11, 0.13, 0.34), wood, 0, -0.04, 0.02);
  put(g, new THREE.BoxGeometry(0.09, 0.1, 0.22), dark, 0, -0.09, 0.24);      // Pumpe
  put(g, new THREE.BoxGeometry(0.1, 0.26, 0.12), wood, 0, -0.2, -0.1, 0.28, 0, 0);
  put(g, new THREE.BoxGeometry(0.11, 0.16, 0.3), wood, 0, -0.02, -0.3, 0.12, 0, 0);
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0.05, 0.58); g.add(g.userData.muzzle);
  return g;
}

export function buildBow() {
  const g = new THREE.Group();
  const wood = M('#6b4a2e'), gold = M('#c2a24d'), string = M('#e8e4d8');
  const arc = new THREE.TorusGeometry(0.46, 0.028, 6, 20, Math.PI * 1.05);
  put(g, arc, wood, 0, 0, 0, 0, Math.PI / 2, Math.PI * 0.475);
  put(g, new THREE.BoxGeometry(0.07, 0.22, 0.07), gold, 0, 0, 0.02);          // Griff
  put(g, new THREE.BoxGeometry(0.012, 0.9, 0.012), string, 0, 0, -0.36);      // Sehne
  put(g, new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), M('#c9b28a'), 0, 0, 0.02, Math.PI / 2, 0, 0); // Pfeil
  put(g, new THREE.ConeGeometry(0.03, 0.08, 4), M('#9aa4b2'), 0, 0, 0.4, Math.PI / 2, 0, 0);
  g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0, 0.45); g.add(g.userData.muzzle);
  return g;
}

export function buildWeaponModel(id) {
  if (id === 'smg') return buildSmg();
  if (id === 'shotgun') return buildShotgun();
  if (id === 'bow') return buildBow();
  return buildSmg();
}

/** Laufzeit-Zustand einer Waffe im Inventar. */
export function makeWeaponState(id) {
  const def = WEAPONS[id];
  if (!def) return null;
  return {
    id, def,
    mag: def.mag ?? 0,
    reserve: def.reserve ?? 0,
    cooldown: 0,
    reloading: 0,
  };
}
