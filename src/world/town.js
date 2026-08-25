import * as THREE from 'three';
import { buildTree, buildBush, buildChest } from './props.js';

/* ------------------------------------------------------------------ *
 *  "Tilted Town" - runde Stadtinsel mit Straßenraster, Zentralplatz,
 *  Footballfeld, Vorstadthäusern und geparkten Autos.
 * ------------------------------------------------------------------ */

const M = {
  asphalt: new THREE.MeshLambertMaterial({ color: '#4a4f56' }),
  walk: new THREE.MeshLambertMaterial({ color: '#c3c6c9' }),
  curb: new THREE.MeshLambertMaterial({ color: '#9fa4a9' }),
  plaza: new THREE.MeshLambertMaterial({ color: '#d8c9a3' }),
  path: new THREE.MeshLambertMaterial({ color: '#e0d6bd' }),
  wallWhite: new THREE.MeshLambertMaterial({ color: '#eae6de' }),
  wallCream: new THREE.MeshLambertMaterial({ color: '#d9cbb2' }),
  wallBlue: new THREE.MeshLambertMaterial({ color: '#b9cbd8' }),
  wallBrick: new THREE.MeshLambertMaterial({ color: '#9d5f4a' }),
  roofDark: new THREE.MeshLambertMaterial({ color: '#4c525c' }),
  roofBrown: new THREE.MeshLambertMaterial({ color: '#6b4a35' }),
  roofRed: new THREE.MeshLambertMaterial({ color: '#8c4034' }),
  wood: new THREE.MeshLambertMaterial({ color: '#8a6136' }),
  glass: new THREE.MeshLambertMaterial({ color: '#8fc4e8', transparent: true, opacity: 0.55 }),
  hedge: new THREE.MeshLambertMaterial({ color: '#3f8f3a' }),
  metal: new THREE.MeshLambertMaterial({ color: '#8d959f' }),
  dark: new THREE.MeshLambertMaterial({ color: '#23282f' }),
  lamp: new THREE.MeshLambertMaterial({ color: '#3a4048' }),
  bulb: new THREE.MeshBasicMaterial({ color: '#ffeeba' }),
  line: new THREE.MeshLambertMaterial({ color: '#f0f0ee' }),
  turf: new THREE.MeshLambertMaterial({ color: '#4f9c3c' }),
  bleachRed: new THREE.MeshLambertMaterial({ color: '#c8503c' }),
  bleachBlue: new THREE.MeshLambertMaterial({ color: '#3f7fc0' }),
};

const CAR_PAINT = ['#c8342c', '#e0a020', '#2f6fc0', '#e8e4dc', '#2f2f34', '#d86a28', '#3f9a6a'];

const BOX = new THREE.BoxGeometry(1, 1, 1);

function slab(group, mat, x, y, z, w, h, d, rotY = 0) {
  const m = new THREE.Mesh(BOX, mat);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.rotation.y = rotY;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/* ---------------- Footballfeld-Textur ---------------- */

function fieldTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#4f9c3c'; g.fillRect(0, 0, 1024, 512);
  // Mähstreifen
  g.fillStyle = 'rgba(255,255,255,.045)';
  for (let i = 0; i < 20; i += 2) g.fillRect(i * 51.2, 0, 51.2, 512);
  // Endzonen
  g.fillStyle = 'rgba(20,80,160,.35)';
  g.fillRect(0, 0, 92, 512); g.fillRect(932, 0, 92, 512);
  // Yard-Linien
  g.strokeStyle = '#f2f2f0'; g.lineWidth = 4;
  for (let i = 0; i <= 20; i++) {
    const x = 92 + (i / 20) * 840;
    g.beginPath(); g.moveTo(x, 20); g.lineTo(x, 492); g.stroke();
  }
  g.lineWidth = 6;
  g.strokeRect(92, 20, 840, 472);
  // Yard-Zahlen
  g.fillStyle = '#f2f2f0';
  g.font = 'bold 54px "Trebuchet MS"';
  g.textAlign = 'center';
  const nums = ['10', '20', '30', '40', '50', '40', '30', '20', '10'];
  nums.forEach((n, i) => {
    const x = 92 + ((i + 1) / 10) * 840;
    g.save(); g.translate(x, 90); g.fillText(n, 0, 0); g.restore();
    g.save(); g.translate(x, 440); g.rotate(Math.PI); g.fillText(n, 0, 0); g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------- Bauteile ---------------- */

/** Vorstadthaus mit zwei Etagen, Veranda und begehbarem Erdgeschoss. */
function townHouse(rng) {
  const g = new THREE.Group();
  const w = 9 + Math.floor(rng() * 3);
  const d = 8 + Math.floor(rng() * 3);
  const h = 6.2;                       // zwei Etagen
  const t = 0.35;
  const wall = [M.wallWhite, M.wallCream, M.wallBlue, M.wallBrick][Math.floor(rng() * 4)];
  const roof = [M.roofDark, M.roofBrown, M.roofRed][Math.floor(rng() * 3)];
  const colliders = [];

  slab(g, M.wood, 0, 0.15, 0, w, 0.3, d);
  const doorW = 2.2;
  const segs = [
    [0, -d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d],
    [-(w / 4 + doorW / 4), d / 2, w / 2 - doorW / 2, t],
    [(w / 4 + doorW / 4), d / 2, w / 2 - doorW / 2, t],
  ];
  for (const [x, z, sx, sz] of segs) {
    slab(g, wall, x, h / 2, z, sx, h, sz).castShadow = true;
    colliders.push({ x, z, hw: sx / 2, hd: sz / 2, y0: 0, y1: h });
  }
  slab(g, wall, 0, h - 1.0, d / 2, doorW, 2.0, t);            // Türsturz

  // Fenster
  for (const [x, z, sx, sz] of [
    [-w / 2 + 0.02, -2, 0.1, 1.8], [w / 2 - 0.02, 2, 0.1, 1.8],
    [-w / 2 + 0.02, 2, 0.1, 1.8], [w / 2 - 0.02, -2, 0.1, 1.8],
    [-2.6, d / 2 - 0.02, 1.6, 0.1], [2.6, d / 2 - 0.02, 1.6, 0.1],
  ]) {
    slab(g, M.glass, x, 1.9, z, sx, 1.4, sz);
    slab(g, M.glass, x, 4.6, z, sx, 1.4, sz);
  }

  // Walmdach in zwei Stufen
  const r1 = slab(g, roof, 0, h + 0.35, 0, w + 1.4, 0.7, d + 1.4); r1.castShadow = true;
  slab(g, roof, 0, h + 1.25, 0, w * 0.72, 1.2, d * 0.72).castShadow = true;
  colliders.push({ x: 0, z: 0, hw: (w + 1.4) / 2, hd: (d + 1.4) / 2, y0: h, y1: h + 0.7 });

  // Veranda mit Pfosten
  slab(g, M.wood, 0, 0.35, d / 2 + 1.4, w * 0.8, 0.3, 2.6);
  for (const px of [-w * 0.34, w * 0.34]) {
    slab(g, M.wood, px, 1.6, d / 2 + 2.5, 0.3, 2.8, 0.3);
    colliders.push({ x: px, z: d / 2 + 2.5, hw: 0.2, hd: 0.2, y0: 0, y1: 2.8 });
  }
  slab(g, roof, 0, 3.1, d / 2 + 1.5, w * 0.84, 0.3, 3.0);

  g.userData.colliders = colliders;
  g.userData.roofY = h + 0.7;
  g.userData.footprint = { w: w + 1.4, d: d + 1.4 };
  return g;
}

/** Flachdach-Gewerbebau mit begehbarem Dach. */
function shopBuilding(rng) {
  const g = new THREE.Group();
  const w = 18, d = 14, h = 6.5, t = 0.4;
  const colliders = [];
  slab(g, M.dark, 0, 0.15, 0, w, 0.3, d);
  const doorW = 3;
  for (const [x, z, sx, sz] of [
    [0, -d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d],
    [-(w / 4 + doorW / 4), d / 2, w / 2 - doorW / 2, t],
    [(w / 4 + doorW / 4), d / 2, w / 2 - doorW / 2, t],
  ]) {
    slab(g, M.wallCream, x, h / 2, z, sx, h, sz).castShadow = true;
    colliders.push({ x, z, hw: sx / 2, hd: sz / 2, y0: 0, y1: h });
  }
  slab(g, M.glass, -4, 2.6, d / 2 - 0.02, 4.5, 3.2, 0.1);
  slab(g, M.glass, 4, 2.6, d / 2 - 0.02, 4.5, 3.2, 0.1);
  const roof = slab(g, M.dark, 0, h + 0.25, 0, w + 0.8, 0.5, d + 0.8);
  roof.castShadow = true;
  colliders.push({ x: 0, z: 0, hw: (w + 0.8) / 2, hd: (d + 0.8) / 2, y0: h, y1: h + 0.5 });
  // Lüftung + Brüstung
  slab(g, M.metal, -5, h + 1.1, -3, 2.4, 1.2, 2.4);
  slab(g, M.metal, 4, h + 0.9, 3, 1.8, 0.8, 1.8);
  g.userData.colliders = colliders;
  g.userData.roofY = h + 0.5;
  g.userData.footprint = { w: w + 0.8, d: d + 0.8 };
  return g;
}

/** Pavillon in der Platzmitte. */
function pavilion() {
  const g = new THREE.Group();
  const colliders = [];
  slab(g, M.plaza, 0, 0.2, 0, 9, 0.4, 9);
  for (const [px, pz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
    slab(g, M.wood, px, 1.9, pz, 0.45, 3.4, 0.45).castShadow = true;
    colliders.push({ x: px, z: pz, hw: 0.3, hd: 0.3, y0: 0, y1: 3.4 });
  }
  slab(g, M.roofDark, 0, 3.8, 0, 10.5, 0.5, 10.5).castShadow = true;
  slab(g, M.roofDark, 0, 4.5, 0, 7.5, 1.0, 7.5).castShadow = true;
  g.userData.colliders = colliders;
  g.userData.roofY = 4.05;
  g.userData.footprint = { w: 10.5, d: 10.5 };
  return g;
}

/** Geparktes Auto - abbaubar für Metall. */
function parkedCar(rng) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: CAR_PAINT[Math.floor(rng() * CAR_PAINT.length)] });
  slab(g, paint, 0, 0.75, 0, 2.0, 0.75, 4.5).castShadow = true;
  slab(g, paint, 0, 1.4, -0.25, 1.7, 0.6, 2.2).castShadow = true;
  slab(g, M.glass, 0, 1.42, 0.9, 1.55, 0.5, 0.12);
  slab(g, M.glass, 0, 1.42, -1.4, 1.55, 0.5, 0.12);
  slab(g, M.bulb, 0.6, 0.85, 2.26, 0.5, 0.25, 0.08);
  slab(g, M.bulb, -0.6, 0.85, 2.26, 0.5, 0.25, 0.08);
  slab(g, new THREE.MeshBasicMaterial({ color: '#e03028' }), 0, 0.9, -2.26, 1.6, 0.2, 0.08);
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  for (const [x, z] of [[1.0, 1.5], [-1.0, 1.5], [1.0, -1.5], [-1.0, -1.5]]) {
    const m = new THREE.Mesh(wheel, M.dark);
    m.position.set(x, 0.36, z); m.rotation.z = Math.PI / 2;
    g.add(m);
  }
  g.userData.harvest = { hp: 190, mat: 'metal', yield: 20, radius: 1.5, height: 1.8 };
  return g;
}

function streetLamp() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 7, 7), M.lamp);
  post.position.y = 3.5; post.castShadow = true; g.add(post);
  const arm = new THREE.Mesh(BOX, M.lamp);
  arm.position.set(0.8, 6.9, 0); arm.scale.set(1.8, 0.16, 0.16); g.add(arm);
  const head = new THREE.Mesh(BOX, M.bulb);
  head.position.set(1.6, 6.75, 0); head.scale.set(0.8, 0.22, 0.5); g.add(head);
  g.userData.colliders = [{ x: 0, z: 0, hw: 0.2, hd: 0.2, y0: 0, y1: 7 }];
  return g;
}

function hedgeRow(len) {
  const g = new THREE.Group();
  const m = slab(g, M.hedge, 0, 0.65, 0, len, 1.3, 1.1);
  m.castShadow = true;
  g.userData.harvest = { hp: 50, mat: 'wood', yield: 8, radius: 0.8, height: 1.3 };
  return g;
}

function bleachers(mat) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) slab(g, mat, 0, 0.4 + i * 0.55, -i * 0.9, 14, 0.5, 0.9).castShadow = true;
  g.userData.colliders = [{ x: 0, z: -1.35, hw: 7, hd: 2.2, y0: 0, y1: 2.4 }];
  g.userData.roofY = 2.4;
  g.userData.footprint = { w: 14, d: 4.4 };
  return g;
}

/* ---------------- Generator ---------------- */

/**
 * Baut die komplette Stadt in die übergebene World.
 * @param {import('./island.js').World} world
 */
export function generateTown(world) {
  const rng = world.rng;
  const g = world.group;
  const R = world.terrain.radius;
  const Y = world.terrain.groundY;
  const inside = (x, z, pad = 4) => Math.hypot(x, z) < R - pad;

  // Randbarriere
  g.add(world.terrain.barrier());

  // Vereinfachte Geometrie für die Minimap
  const hints = world.mapHints = { radius: R, rects: [] };
  const hint = (x, z, w, d, color) => hints.rects.push({ x, z, w, d, color });

  /* --- Straßenraster --- */
  const AXES = [-72, -36, 36, 72];
  const ROAD_W = 9, WALK_W = 3;

  const roadSpan = (fixed) => {
    const lim = Math.sqrt(Math.max(0, (R - 5) ** 2 - fixed ** 2));
    return lim;
  };

  const roads = [];
  for (const x of AXES) {
    const lim = roadSpan(x);
    if (lim < 12) continue;
    slab(g, M.walk, x, Y + 0.04, 0, ROAD_W + WALK_W * 2, 0.08, lim * 2);
    slab(g, M.asphalt, x, Y + 0.07, 0, ROAD_W, 0.08, lim * 2);
    hint(x, 0, ROAD_W + WALK_W * 2, lim * 2, '#8d939a');
    roads.push({ axis: 'x', at: x, lim });
  }
  for (const z of AXES) {
    const lim = roadSpan(z);
    if (lim < 12) continue;
    slab(g, M.walk, 0, Y + 0.05, z, lim * 2, 0.08, ROAD_W + WALK_W * 2);
    slab(g, M.asphalt, 0, Y + 0.08, z, lim * 2, 0.08, ROAD_W);
    hint(0, z, lim * 2, ROAD_W + WALK_W * 2, '#8d939a');
    roads.push({ axis: 'z', at: z, lim });
  }
  // Mittelstreifen
  for (const r of roads) {
    for (let d = -r.lim + 4; d < r.lim - 4; d += 7) {
      if (r.axis === 'x') slab(g, M.line, r.at, Y + 0.1, d, 0.3, 0.05, 3);
      else slab(g, M.line, d, Y + 0.11, r.at, 3, 0.05, 0.3);
    }
  }

  /* --- Zentralplatz mit Pavillon --- */
  slab(g, M.plaza, 0, Y + 0.06, 0, 30, 0.1, 30);
  hint(0, 0, 30, 30, '#d8c9a3');
  for (const [w, d] of [[6, 62], [62, 6]]) slab(g, M.path, 0, Y + 0.05, 0, w, 0.08, d);
  const pav = pavilion();
  pav.position.set(0, Y, 0);
  world.placeStructure(pav, { x: 0, y: Y, z: 0 });

  // Hecken rings um den Platz
  for (const [hx, hz, len, rot] of [
    [-11, -16, 14, 0], [11, -16, 14, 0], [-11, 16, 14, 0], [11, 16, 14, 0],
    [-16, -11, 14, Math.PI / 2], [-16, 11, 14, Math.PI / 2],
    [16, -11, 14, Math.PI / 2], [16, 11, 14, Math.PI / 2],
  ]) {
    const h = hedgeRow(len);
    h.rotation.y = rot;
    world.placeProp(h, hx, Y, hz);
  }
  // Parkbäume
  for (const [tx, tz] of [[-22, -22], [22, -22], [-22, 22], [22, 22], [-24, 4], [24, -4]]) {
    world.placeProp(buildTree(rng), tx + (rng() - 0.5) * 3, Y, tz + (rng() - 0.5) * 3);
  }
  world.pois.push({ name: 'Zentralplatz', x: 0, z: 0 });

  /* --- Footballfeld --- */
  const FX = 0, FZ = 54;
  const fieldGeo = new THREE.PlaneGeometry(52, 27);
  fieldGeo.rotateX(-Math.PI / 2);
  const field = new THREE.Mesh(fieldGeo, new THREE.MeshLambertMaterial({ map: fieldTexture() }));
  field.position.set(FX, Y + 0.06, FZ);
  field.receiveShadow = true;
  g.add(field);
  hint(FX, FZ, 52, 27, '#3f8f30');
  // Torstangen
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(BOX, M.bulb);
    base.position.set(FX + side * 24, Y + 2.2, FZ); base.scale.set(0.25, 4.4, 0.25); g.add(base);
    const bar = new THREE.Mesh(BOX, M.bulb);
    bar.position.set(FX + side * 24, Y + 4.4, FZ); bar.scale.set(0.25, 0.25, 5.5); g.add(bar);
    for (const zs of [-1, 1]) {
      const up = new THREE.Mesh(BOX, M.bulb);
      up.position.set(FX + side * 24, Y + 6.2, FZ + zs * 2.7); up.scale.set(0.25, 3.6, 0.25); g.add(up);
    }
  }
  for (const [bz, mat] of [[-17.5, M.bleachRed], [17.5, M.bleachBlue]]) {
    const b = bleachers(mat);
    b.rotation.y = bz > 0 ? Math.PI : 0;
    world.placeStructure(b, { x: FX, y: Y, z: FZ + bz });
  }
  world.pois.push({ name: 'Stadion', x: FX, z: FZ });

  /* --- Blöcke mit Häusern --- */
  const EDGES = [-96, -72, -36, 36, 72, 96];
  const blocks = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    for (let j = 0; j < EDGES.length - 1; j++) {
      const x0 = EDGES[i] + (i === 0 ? 8 : ROAD_W / 2 + WALK_W);
      const x1 = EDGES[i + 1] - (i === EDGES.length - 2 ? 8 : ROAD_W / 2 + WALK_W);
      const z0 = EDGES[j] + (j === 0 ? 8 : ROAD_W / 2 + WALK_W);
      const z1 = EDGES[j + 1] - (j === EDGES.length - 2 ? 8 : ROAD_W / 2 + WALK_W);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const bw = x1 - x0, bd = z1 - z0;
      if (bw < 14 || bd < 14) continue;
      if (Math.abs(cx) < 34 && Math.abs(cz) < 34) continue;                    // Park
      if (Math.abs(cx - FX) < 30 && Math.abs(cz - FZ) < 24) continue;          // Stadion
      if (!inside(cx, cz, 10)) continue;
      blocks.push({ cx, cz, bw, bd });
    }
  }

  let shopPlaced = false;
  for (const b of blocks) {
    // Ein Block wird zum Gewerbegebiet mit Parkplatz
    if (!shopPlaced && b.cx > 40 && Math.abs(b.cz) < 40) {
      shopPlaced = true;
      slab(g, M.asphalt, b.cx, Y + 0.05, b.cz, Math.min(b.bw, 30), 0.08, Math.min(b.bd, 30));
      hint(b.cx, b.cz, Math.min(b.bw, 30), Math.min(b.bd, 30), '#5c6169');
      const shop = shopBuilding(rng);
      shop.rotation.y = -Math.PI / 2;
      world.placeStructure(shop, { x: b.cx, y: Y, z: b.cz - 3 });
      for (let k = 0; k < 6; k++) {
        const px = b.cx - 10, pz = b.cz + 6 + (k % 3) * 5;
        if (inside(px, pz, 6)) world.placeProp(parkedCar(rng), px + (k > 2 ? 6 : 0), Y, pz);
      }
      world.pois.push({ name: 'Einkaufszentrum', x: b.cx, z: b.cz });
      continue;
    }

    const cols = b.bw > 52 ? 3 : b.bw > 30 ? 2 : 1;
    const rows = b.bd > 52 ? 3 : b.bd > 30 ? 2 : 1;
    for (let cx = 0; cx < cols; cx++) {
      for (let cz = 0; cz < rows; cz++) {
        const hx = b.cx + (cols === 1 ? 0 : (cx / (cols - 1) - 0.5) * b.bw * 0.68);
        const hz = b.cz + (rows === 1 ? 0 : (cz / (rows - 1) - 0.5) * b.bd * 0.68);
        if (!inside(hx, hz, 12)) continue;
        const house = townHouse(rng);
        // Veranda zur nächsten Straße drehen
        house.rotation.y = Math.abs(hx) > Math.abs(hz)
          ? (hx > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (hz > 0 ? 0 : Math.PI);
        world.placeStructure(house, { x: hx, y: Y, z: hz });
        hint(hx, hz, 12, 12, '#7a5a48');

        // Vorgarten: Hecke, Baum, Auffahrt, Truhe
        if (rng() < 0.85) world.placeProp(buildTree(rng), hx + (rng() - 0.5) * 15, Y, hz + (rng() - 0.5) * 15);
        if (rng() < 0.7) world.placeProp(buildBush(rng), hx + (rng() - 0.5) * 16, Y, hz + (rng() - 0.5) * 16);
        if (rng() < 0.55) {
          const hedge = hedgeRow(7 + rng() * 4);
          hedge.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
          world.placeProp(hedge, hx + (rng() - 0.5) * 17, Y, hz + (rng() - 0.5) * 17);
        }
        if (rng() < 0.55) {
          const c = buildChest();
          c.position.set(hx + (rng() - 0.5) * 5, Y + 0.3, hz + (rng() - 0.5) * 5);
          c.userData.opened = false;
          g.add(c);
          world.chests.push(c);
        }
      }
    }
  }

  /* --- Straßenmöblierung: Autos, Laternen, Straßenbäume --- */
  for (const r of roads) {
    for (let d = -r.lim + 10; d < r.lim - 10; d += 9) {
      const side = rng() < 0.5 ? 1 : -1;
      const off = (ROAD_W / 2 - 1.4) * side;
      const x = r.axis === 'x' ? r.at + off : d;
      const z = r.axis === 'x' ? d : r.at + off;
      if (!inside(x, z, 6)) continue;
      if (rng() < 0.55) {
        const car = parkedCar(rng);
        car.rotation.y = r.axis === 'x' ? 0 : Math.PI / 2;
        world.placeProp(car, x, Y, z);
      }
      if (rng() < 0.45) {
        const lampX = r.axis === 'x' ? r.at + (ROAD_W / 2 + 1.5) * side : d;
        const lampZ = r.axis === 'x' ? d : r.at + (ROAD_W / 2 + 1.5) * side;
        const lamp = streetLamp();
        lamp.rotation.y = rng() * Math.PI * 2;
        world.placeStructure(lamp, { x: lampX, y: Y, z: lampZ });
      }
      if (rng() < 0.5) {
        const tx = r.axis === 'x' ? r.at + (ROAD_W / 2 + 3.5) * side : d + 4;
        const tz = r.axis === 'x' ? d + 4 : r.at + (ROAD_W / 2 + 3.5) * side;
        if (inside(tx, tz, 6)) world.placeProp(buildTree(rng), tx, Y, tz);
      }
    }
  }

  /* --- Truhen auf dem Platz und im Stadion --- */
  for (const [cx, cz] of [[0, 12], [0, -12], [12, 0], [-12, 0], [FX - 18, FZ], [FX + 18, FZ]]) {
    const c = buildChest();
    c.position.set(cx, Y + 0.12, cz);
    c.userData.opened = false;
    g.add(c);
    world.chests.push(c);
  }

  /* --- Spawnpunkte --- */
  world.teamSpawns = [[], []];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 78;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!inside(x, z, 8)) continue;
    const p = { x, y: Y, z };
    world.spawnPoints.push(p);
    world.teamSpawns[z < 0 ? 0 : 1].push(p);
  }
  for (const list of world.teamSpawns) if (!list.length) list.push({ x: 0, y: Y, z: 0 });

  world.pois.push({ name: 'Nordviertel', x: 0, z: -74 }, { name: 'Südviertel', x: 0, z: 74 });
}
