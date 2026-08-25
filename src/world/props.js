import * as THREE from 'three';

/* Wiederverwendete Geometrien/Materialien - hält die Drawcalls klein. */
const G = {
  trunk: new THREE.CylinderGeometry(0.22, 0.32, 4.2, 6),
  trunkBig: new THREE.CylinderGeometry(0.3, 0.45, 6.4, 7),
  leafCone: new THREE.ConeGeometry(1.9, 3.0, 7),
  leafBlob: new THREE.IcosahedronGeometry(1.6, 0),
  rock: new THREE.IcosahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  wheel: new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12),
};

const M = {
  bark: new THREE.MeshLambertMaterial({ color: '#5a3f28' }),
  barkDark: new THREE.MeshLambertMaterial({ color: '#432f1d' }),
  leaf: new THREE.MeshLambertMaterial({ color: '#2f7a37' }),
  leaf2: new THREE.MeshLambertMaterial({ color: '#3f9243' }),
  pine: new THREE.MeshLambertMaterial({ color: '#245c3a' }),
  stone: new THREE.MeshLambertMaterial({ color: '#7c828a', flatShading: true }),
  stoneDark: new THREE.MeshLambertMaterial({ color: '#5f656d', flatShading: true }),
  wall: new THREE.MeshLambertMaterial({ color: '#c9b79a' }),
  wall2: new THREE.MeshLambertMaterial({ color: '#9c8a72' }),
  wood: new THREE.MeshLambertMaterial({ color: '#8a6136' }),
  roof: new THREE.MeshLambertMaterial({ color: '#8c3b2f' }),
  roof2: new THREE.MeshLambertMaterial({ color: '#3f4a5a' }),
  glass: new THREE.MeshLambertMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.45 }),
  metal: new THREE.MeshLambertMaterial({ color: '#8d959f' }),
  tire: new THREE.MeshLambertMaterial({ color: '#1a1a1e' }),
  chest: new THREE.MeshLambertMaterial({ color: '#b8862c' }),
  chestGlow: new THREE.MeshBasicMaterial({ color: '#ffd76a' }),
  asphalt: new THREE.MeshLambertMaterial({ color: '#3b3f45' }),
};

export const PROP_MATERIALS = M;

function mesh(geo, material, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* ---------------- Bäume ---------------- */

export function buildTree(rng) {
  const g = new THREE.Group();
  const pine = rng() < 0.45;
  if (pine) {
    mesh(G.trunkBig, M.barkDark, g, 0, 3.2, 0, 0.7, 1, 0.7);
    for (let i = 0; i < 3; i++) {
      const s = 1 - i * 0.24;
      mesh(G.leafCone, M.pine, g, 0, 4.6 + i * 1.9, 0, s, s * 1.1, s);
    }
    g.userData.harvest = { hp: 130, mat: 'wood', yield: 14, radius: 1.1, height: 9 };
  } else {
    mesh(G.trunk, M.bark, g, 0, 2.1, 0);
    const leafMat = rng() < 0.5 ? M.leaf : M.leaf2;
    mesh(G.leafBlob, leafMat, g, 0, 5.0, 0, 1.25, 1.1, 1.25);
    mesh(G.leafBlob, leafMat, g, 0.9, 4.2, 0.4, 0.8, 0.7, 0.8);
    mesh(G.leafBlob, leafMat, g, -0.8, 4.4, -0.5, 0.7, 0.65, 0.7);
    g.userData.harvest = { hp: 110, mat: 'wood', yield: 12, radius: 0.9, height: 6.5 };
  }
  const s = 0.85 + rng() * 0.5;
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI * 2;
  g.userData.harvest.radius *= s;
  g.userData.harvest.height *= s;
  return g;
}

/* ---------------- Felsen ---------------- */

export function buildRock(rng) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rng() * 3);
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const r = 0.9 + rng() * 1.5;
    const m = mesh(G.rock, rng() < 0.5 ? M.stone : M.stoneDark, g,
      (rng() - 0.5) * 2.2, r * 0.55, (rng() - 0.5) * 2.2, r, r * (0.6 + rng() * 0.5), r);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    maxR = Math.max(maxR, r + 0.9);
  }
  g.userData.harvest = { hp: 160, mat: 'stone', yield: 16, radius: maxR * 0.7, height: 2.6 };
  return g;
}

export function buildBush(rng) {
  const g = new THREE.Group();
  const m = mesh(G.leafBlob, M.leaf, g, 0, 0.6, 0, 0.75, 0.5, 0.75);
  m.rotation.y = rng() * 3;
  g.userData.harvest = { hp: 40, mat: 'wood', yield: 6, radius: 0.9, height: 1.2 };
  return g;
}

/* ---------------- Fahrzeugwrack (Metall) ---------------- */

export function buildWreck(rng) {
  const g = new THREE.Group();
  const color = ['#a8433a', '#3f6ea8', '#6f7a52', '#8d959f'][Math.floor(rng() * 4)];
  const body = new THREE.MeshLambertMaterial({ color });
  mesh(G.box, body, g, 0, 0.75, 0, 2.0, 0.7, 4.4);
  mesh(G.box, body, g, 0, 1.35, -0.2, 1.75, 0.6, 2.0);
  mesh(G.box, M.glass, g, 0, 1.4, 0.85, 1.6, 0.5, 0.15);
  for (const [x, z] of [[0.95, 1.5], [-0.95, 1.5], [0.95, -1.5], [-0.95, -1.5]]) {
    const w = mesh(G.wheel, M.tire, g, x, 0.36, z);
    w.rotation.z = Math.PI / 2;
  }
  g.rotation.y = rng() * Math.PI * 2;
  g.userData.harvest = { hp: 190, mat: 'metal', yield: 18, radius: 2.0, height: 1.9 };
  return g;
}

/* ---------------- Gebäude ---------------- */

/**
 * Haus mit Türöffnung. Liefert Mesh-Gruppe und Kollisionsboxen zurück,
 * damit man hinein- und hindurchlaufen kann.
 */
export function buildHouse(rng, opts = {}) {
  const g = new THREE.Group();
  const w = opts.w ?? (7 + Math.floor(rng() * 4));
  const d = opts.d ?? (7 + Math.floor(rng() * 4));
  const h = opts.h ?? 3.4;
  const t = 0.3;
  const wallMat = rng() < 0.5 ? M.wall : M.wall2;
  const roofMat = rng() < 0.5 ? M.roof : M.roof2;
  const colliders = [];

  mesh(G.box, M.wood, g, 0, 0.12, 0, w, 0.24, d);           // Boden

  const doorW = 1.8;
  const segs = [
    // [x, z, sx, sz]
    [0, -d / 2, w, t],                                        // hinten
    [-w / 2, 0, t, d],                                        // links
    [w / 2, 0, t, d],                                         // rechts
    [-(w / 4 + doorW / 4), d / 2, w / 2 - doorW / 2, t],       // vorne links
    [(w / 4 + doorW / 4), d / 2, w / 2 - doorW / 2, t],        // vorne rechts
  ];
  for (const [x, z, sx, sz] of segs) {
    mesh(G.box, wallMat, g, x, h / 2, z, sx, h, sz);
    colliders.push({ x, z, hw: sx / 2, hd: sz / 2, y0: 0, y1: h });
  }
  mesh(G.box, wallMat, g, 0, h - 0.35, d / 2, doorW, 0.7, t);  // Türsturz

  // Fenster
  for (const [x, z, sx, sz] of [[-w / 2 + 0.02, -1.5, 0.08, 1.6], [w / 2 - 0.02, 1.5, 0.08, 1.6]]) {
    mesh(G.box, M.glass, g, x, 1.9, z, sx, 1.3, sz);
  }

  // Dach
  const roof = mesh(G.box, roofMat, g, 0, h + 0.5, 0, w + 0.8, 0.4, d + 0.8);
  colliders.push({ x: 0, z: 0, hw: (w + 0.8) / 2, hd: (d + 0.8) / 2, y0: h + 0.3, y1: h + 0.7 });
  const gable = mesh(G.box, roofMat, g, 0, h + 1.2, 0, w * 0.72, 1.0, d * 0.72);
  gable.rotation.y = 0;

  // Rampe aufs Dach (macht Kämpfe ohne Bauen interessanter)
  const ramp = mesh(G.box, M.wood, g, w / 2 + 1.6, (h + 0.3) / 2, 0, 3.4, 0.22, d * 0.9);
  ramp.rotation.z = -Math.atan2(h + 0.3, 3.4);

  g.userData.colliders = colliders;
  g.userData.roofY = h + 0.7;
  g.userData.footprint = { w: w + 4, d: d + 2 };
  return g;
}

/** Turm / Silo als Sniper-Position. */
export function buildTower(rng) {
  const g = new THREE.Group();
  const r = 2.6, h = 11;
  mesh(G.cyl, M.wall2, g, 0, h / 2, 0, r, h, r);
  mesh(G.cyl, M.roof2, g, 0, h + 0.4, 0, r + 0.5, 0.8, r + 0.5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    mesh(G.box, M.wood, g, Math.cos(a) * r, h + 1.3, Math.sin(a) * r, 0.4, 1.4, 0.4);
  }
  g.userData.colliders = [{ x: 0, z: 0, hw: r, hd: r, y0: 0, y1: h, round: true, r }];
  g.userData.roofY = h + 0.8;
  return g;
}

/* ---------------- Truhe ---------------- */

export function buildChest() {
  const g = new THREE.Group();
  mesh(G.box, M.chest, g, 0, 0.32, 0, 1.1, 0.64, 0.72);
  const lid = mesh(G.box, M.chest, g, 0, 0.72, 0, 1.14, 0.2, 0.76);
  mesh(G.box, M.metal, g, 0, 0.5, 0.37, 0.22, 0.3, 0.06);
  const glow = mesh(G.box, M.chestGlow, g, 0, 0.85, 0, 0.9, 0.03, 0.55);
  g.userData.lid = lid;
  g.userData.glow = glow;
  return g;
}

/* ---------------- Straßenstück ---------------- */

export function buildRoadPatch(size) {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, M.asphalt);
  m.receiveShadow = true;
  return m;
}
