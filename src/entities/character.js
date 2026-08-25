import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Prozedurale Low-Poly-Charaktere. Alle Modelle werden aus Boxen und
 *  Canvas-Texturen erzeugt - keine externen Assets.
 * ------------------------------------------------------------------ */

const boxCache = new Map();
function box(w, h, d) {
  const k = `${w}|${h}|${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxCache.get(k);
}

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function part(geo, material, x, y, z, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/* ---------------- Texturen ---------------- */

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Blasse Haut mit roter Kriegsbemalung (Torso). */
function kratosTorsoTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d8cec2'; g.fillRect(0, 0, w, h);
    // Muskelschattierung
    g.fillStyle = 'rgba(120,100,88,.25)';
    g.fillRect(30, 12, 4, 44);
    g.fillRect(10, 34, 44, 3);
    // rote Bemalung: breiter Streifen über Brust und Schulter
    g.fillStyle = '#b3181f';
    g.fillRect(6, 4, 16, 56);
    g.fillStyle = '#8d1016';
    g.fillRect(6, 4, 5, 56);
    // Narben
    g.strokeStyle = 'rgba(150,110,100,.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(40, 10); g.lineTo(52, 30); g.stroke();
  });
}

/** Kratos-Gesicht: rote Bemalung über dem linken Auge, Bart-Ansatz. */
function kratosHeadTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d8cec2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3181f'; g.fillRect(4, 0, 15, 64);   // Bemalungsstreifen
    g.fillStyle = '#8d1016'; g.fillRect(4, 0, 5, 64);
    g.fillStyle = '#1d1b1a';                              // Augen
    g.fillRect(12, 26, 8, 6); g.fillRect(40, 26, 8, 6);
    g.fillStyle = '#e9e4dc'; g.fillRect(14, 27, 3, 3); g.fillRect(42, 27, 3, 3);
    g.fillStyle = 'rgba(90,70,60,.45)'; g.fillRect(8, 20, 48, 3); // Stirnfalte
  });
}

function atreusHeadTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#e8c9a8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5b3a20'; g.fillRect(0, 0, w, 14);     // Pony
    g.fillStyle = '#2a2620';
    g.fillRect(13, 28, 7, 6); g.fillRect(41, 28, 7, 6);
    g.fillStyle = '#fff'; g.fillRect(15, 29, 3, 3); g.fillRect(43, 29, 3, 3);
    g.fillStyle = 'rgba(170,110,70,.55)';                  // Sommersprossen
    for (let i = 0; i < 12; i++) g.fillRect(10 + Math.random() * 44, 38 + Math.random() * 10, 2, 2);
    g.strokeStyle = '#8a3a2a'; g.lineWidth = 2;            // Kriegsbemalung Wange
    g.beginPath(); g.moveTo(6, 34); g.lineTo(6, 48); g.stroke();
  });
}

function faceTex(skin, eye = '#20202a') {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    g.fillStyle = eye;
    g.fillRect(13, 27, 8, 7); g.fillRect(41, 27, 8, 7);
    g.fillStyle = '#fff'; g.fillRect(15, 28, 3, 3); g.fillRect(43, 28, 3, 3);
  });
}

/* ---------------- Rig ---------------- */

/**
 * Humanoides Skelett aus verschachtelten Gruppen.
 * root -> hips -> {torso -> {head, shoulderL/R -> armL/R -> handL/R}, legL/R}
 */
export class Rig {
  constructor() {
    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);

    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);

    this.shoulderL = new THREE.Group(); this.shoulderL.position.set(0.34, 0.46, 0);
    this.shoulderR = new THREE.Group(); this.shoulderR.position.set(-0.34, 0.46, 0);
    this.torso.add(this.shoulderL, this.shoulderR);

    this.handL = new THREE.Group(); this.handL.position.set(0, -0.56, 0); this.shoulderL.add(this.handL);
    this.handR = new THREE.Group(); this.handR.position.set(0, -0.56, 0); this.shoulderR.add(this.handR);

    this.legL = new THREE.Group(); this.legL.position.set(0.17, 0, 0);
    this.legR = new THREE.Group(); this.legR.position.set(-0.17, 0, 0);
    this.hips.add(this.legL, this.legR);

    this.phase = Math.random() * Math.PI * 2;
    this.height = 1.85;
  }

  /** Lauf-/Idle-Animation. speed = horizontale Geschwindigkeit in m/s. */
  animate(dt, speed, grounded = true) {
    const moving = speed > 0.35;
    this.phase += dt * (moving ? 3.2 + Math.min(speed, 9) * 0.85 : 2.0);
    const amp = moving ? Math.min(0.55 + speed * 0.05, 0.95) : 0.06;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    if (!grounded) {
      this.legL.rotation.x = -0.55; this.legR.rotation.x = 0.3;
      this.shoulderL.rotation.x = -0.8; this.shoulderR.rotation.x = -0.8;
      return;
    }
    this.legL.rotation.x = s * amp;
    this.legR.rotation.x = -s * amp;
    this.shoulderL.rotation.x = -s * amp * 0.75;
    this.shoulderR.rotation.x = s * amp * 0.75;
    this.hips.position.y = 0.92 + (moving ? Math.abs(c) * 0.045 : Math.sin(this.phase * 0.5) * 0.012);
    this.torso.rotation.y = moving ? s * 0.06 : 0;
  }

  /** Ruhepose für Menüs / Lobby. */
  pose(t) {
    this.shoulderL.rotation.x = -0.12 + Math.sin(t * 1.1) * 0.05;
    this.shoulderR.rotation.x = -0.12 - Math.sin(t * 1.1) * 0.05;
    this.shoulderL.rotation.z = -0.16;
    this.shoulderR.rotation.z = 0.16;
    this.hips.position.y = 0.92 + Math.sin(t * 1.3) * 0.02;
    this.root.rotation.y = Math.sin(t * 0.35) * 0.45;
  }
}

/* ---------------- Bausteine ---------------- */

function addLimbs(rig, skinMat, sleeveMat, pantsMat, bootMat, scale = 1) {
  // Arme
  for (const [sh, hand] of [[rig.shoulderL, rig.handL], [rig.shoulderR, rig.handR]]) {
    part(box(0.17, 0.4, 0.19), sleeveMat, 0, -0.2, 0, sh);
    part(box(0.15, 0.3, 0.17), skinMat, 0, -0.53, 0, sh);
    part(box(0.16, 0.14, 0.18), skinMat, 0, -0.7, 0, sh); // Faust
    hand.position.y = -0.68;
  }
  // Beine
  for (const leg of [rig.legL, rig.legR]) {
    part(box(0.21, 0.5, 0.22), pantsMat, 0, -0.28, 0, leg);
    part(box(0.2, 0.4, 0.21), pantsMat, 0, -0.68, 0, leg);
    part(box(0.23, 0.14, 0.3), bootMat, 0, -0.9, 0.03, leg);
  }
  rig.root.scale.setScalar(scale);
}

/* ---------------- Kratos ---------------- */

export function buildKratos() {
  const rig = new Rig();
  const skinTex = kratosTorsoTex();
  const skin = mat('#d8cec2');
  const torsoMat = new THREE.MeshLambertMaterial({ map: skinTex });
  const leather = mat('#4a3524');
  const dark = mat('#2b211a');
  const gold = mat('#c8a44a');
  const red = mat('#a8161d');

  // Torso
  part(box(0.78, 0.9, 0.42), torsoMat, 0, 0.2, 0, rig.torso);
  part(box(0.62, 0.22, 0.44), leather, 0, -0.3, 0, rig.torso);          // Gürtel
  part(box(0.66, 0.1, 0.46), gold, 0, -0.3, 0.01, rig.torso).scale.set(1, 0.55, 1.02);
  // rote Schärpe diagonal
  const sash = part(box(0.9, 0.16, 0.46), red, 0, 0.18, 0.02, rig.torso);
  sash.rotation.z = 0.55;

  // Kopf: bald, Bart, rote Bemalung
  const headMat = new THREE.MeshLambertMaterial({ map: kratosHeadTex() });
  const headMats = [skin, skin, skin, skin, headMat, skin];
  const head = new THREE.Mesh(box(0.46, 0.5, 0.44), headMats);
  head.castShadow = true; head.position.y = 0.05; rig.head.add(head);
  part(box(0.4, 0.26, 0.16), dark, 0, -0.13, 0.2, rig.head);            // Bart
  part(box(0.34, 0.1, 0.12), dark, 0, 0.02, 0.23, rig.head);            // Schnurrbart

  // Schulterpanzer links + Lederriemen
  const paul = part(box(0.3, 0.26, 0.34), leather, 0.06, 0.06, 0, rig.shoulderL);
  paul.rotation.z = -0.15;
  part(box(0.32, 0.06, 0.36), gold, 0.06, 0.16, 0, rig.shoulderL);
  // Armbinden (Chaos-Ketten-Andeutung)
  for (const sh of [rig.shoulderL, rig.shoulderR]) {
    part(box(0.19, 0.12, 0.21), dark, 0, -0.42, 0, sh);
    part(box(0.2, 0.05, 0.22), gold, 0, -0.36, 0, sh);
  }

  addLimbs(rig, skin, skin, mat('#3a2c1f'), mat('#241b14'), 1.0);
  // Kriegsrock
  const skirt = part(box(0.74, 0.42, 0.5), leather, 0, -0.2, 0, rig.hips);
  skirt.scale.set(1, 1, 0.95);

  rig.name = 'Kratos';
  rig.height = 1.9;
  return rig;
}

/* ---------------- Atreus ---------------- */

export function buildAtreus() {
  const rig = new Rig();
  const skin = mat('#e8c9a8');
  const tunic = mat('#4f6b3f');
  const fur = mat('#6b4a2e');
  const leather = mat('#5a3f26');
  const hair = mat('#5b3a20');

  part(box(0.62, 0.8, 0.36), tunic, 0, 0.18, 0, rig.torso);
  part(box(0.66, 0.18, 0.4), fur, 0, 0.5, 0, rig.torso);        // Fellkragen
  part(box(0.5, 0.14, 0.38), leather, 0, -0.22, 0, rig.torso);  // Gürtel
  const strap = part(box(0.72, 0.1, 0.4), leather, 0, 0.16, 0.01, rig.torso);
  strap.rotation.z = -0.6;

  const headMat = new THREE.MeshLambertMaterial({ map: atreusHeadTex() });
  const head = new THREE.Mesh(box(0.4, 0.42, 0.38), [skin, skin, hair, skin, headMat, skin]);
  head.castShadow = true; head.position.y = 0.02; rig.head.add(head);
  part(box(0.44, 0.16, 0.42), hair, 0, 0.19, -0.02, rig.head);
  part(box(0.14, 0.2, 0.1), hair, 0, 0.06, -0.22, rig.head);    // kleiner Zopf

  // Köcher auf dem Rücken
  const quiver = part(box(0.14, 0.5, 0.14), leather, -0.2, 0.24, -0.24, rig.torso);
  quiver.rotation.z = 0.35;
  for (let i = 0; i < 3; i++) {
    part(box(0.03, 0.3, 0.03), mat('#c9b28a'), -0.24 - i * 0.04, 0.55, -0.26, rig.torso);
  }

  addLimbs(rig, skin, tunic, mat('#5c4a33'), mat('#3a2b1c'), 0.82);
  rig.name = 'Atreus';
  rig.height = 1.55;
  return rig;
}

/* ---------------- Gegner / Standard-Skins ---------------- */

const BOT_PALETTE = [
  { body: '#2f6fd0', pants: '#1e3f7a', skin: '#e9c39a', name: 'Rekrut' },
  { body: '#c8452f', pants: '#7a2418', skin: '#c98d63', name: 'Bandit' },
  { body: '#2f9f6a', pants: '#1c5f40', skin: '#f0d6b8', name: 'Ranger' },
  { body: '#8a4bd0', pants: '#4c2578', skin: '#8d5f3f', name: 'Nachtfalke' },
  { body: '#d8a12f', pants: '#7d5c14', skin: '#e5bb90', name: 'Sturmjäger' },
  { body: '#26313f', pants: '#141b24', skin: '#d9b48f', name: 'Schatten' },
];

export function buildBot(index = 0) {
  const p = BOT_PALETTE[index % BOT_PALETTE.length];
  const rig = new Rig();
  const skin = mat(p.skin);
  const body = mat(p.body);
  const vest = mat('#2a3444');

  part(box(0.68, 0.86, 0.38), body, 0, 0.2, 0, rig.torso);
  part(box(0.72, 0.4, 0.42), vest, 0, 0.2, 0, rig.torso).scale.set(1, 1, 0.6);
  part(box(0.56, 0.14, 0.4), mat('#1b2330'), 0, -0.24, 0, rig.torso);

  const headMat = new THREE.MeshLambertMaterial({ map: faceTex(p.skin) });
  const head = new THREE.Mesh(box(0.42, 0.44, 0.4), [skin, skin, skin, skin, headMat, skin]);
  head.castShadow = true; rig.head.add(head);
  part(box(0.46, 0.16, 0.44), mat('#2c2b2f'), 0, 0.16, 0, rig.head); // Mütze

  addLimbs(rig, skin, body, mat(p.pants), mat('#20262f'), 0.97);
  rig.name = p.name;
  return rig;
}

export function buildSkin(id, botIndex = 0) {
  if (id === 'kratos') return buildKratos();
  if (id === 'atreus') return buildAtreus();
  return buildBot(botIndex);
}

export const SKIN_HEIGHTS = { kratos: 1.9, atreus: 1.55 };
