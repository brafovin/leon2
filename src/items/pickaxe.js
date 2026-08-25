import * as THREE from 'three';

/* Leviathan-Axt: Erntewerkzeug (Spitzhacke) mit Frost-Runen und Rückruf. */

function runeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8e959c'; g.fillRect(0, 0, 128, 128);
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,.35)');
  grd.addColorStop(1, 'rgba(20,30,40,.35)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  // Runenreihe
  g.strokeStyle = '#8fe6ff'; g.lineWidth = 4; g.shadowColor = '#8fe6ff'; g.shadowBlur = 10;
  const runes = [[20, 30, 20, 98], [20, 30, 40, 60], [55, 30, 55, 98], [40, 64, 70, 40],
                 [88, 30, 88, 98], [88, 50, 108, 30], [88, 70, 108, 92]];
  for (const [x1, y1, x2, y2] of runes) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildLeviathanAxe() {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ map: runeTexture() });
  const edge = new THREE.MeshLambertMaterial({ color: '#dfe9f2' });
  const glow = new THREE.MeshBasicMaterial({ color: '#7fe0ff' });
  const leather = new THREE.MeshLambertMaterial({ color: '#4a3524' });
  const brass = new THREE.MeshLambertMaterial({ color: '#c2a24d' });

  const add = (geo, m, x, y, z, parent = g) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  };

  // Stiel
  add(new THREE.CylinderGeometry(0.035, 0.042, 1.05, 8), leather, 0, -0.18, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), brass, 0, -0.66, 0);
  // Lederschlaufe am Griffende
  const loop = add(new THREE.TorusGeometry(0.07, 0.014, 6, 14), leather, 0, -0.75, 0);
  loop.rotation.x = Math.PI / 2;

  // Axtkopf
  const head = new THREE.Group(); head.position.y = 0.4; g.add(head);
  add(new THREE.BoxGeometry(0.16, 0.3, 0.14), steel, 0, 0, 0, head);   // Nacken
  const blade = add(new THREE.BoxGeometry(0.5, 0.42, 0.1), steel, 0.26, -0.02, 0, head);
  blade.scale.set(1, 1, 1);
  // Schneide
  const cut = add(new THREE.BoxGeometry(0.07, 0.5, 0.05), edge, 0.5, -0.02, 0, head);
  cut.rotation.z = 0.02;
  // oberer Dorn
  add(new THREE.ConeGeometry(0.055, 0.24, 4), steel, 0, 0.24, 0, head);
  // Frost-Runenglühen entlang der Schneide
  const r1 = add(new THREE.BoxGeometry(0.42, 0.03, 0.12), glow, 0.24, 0.08, 0, head);
  const r2 = add(new THREE.BoxGeometry(0.42, 0.03, 0.12), glow, 0.24, -0.12, 0, head);
  // Griffwicklung
  for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.045, 0.008, 5, 10), brass, 0, -0.02 - i * 0.09, 0)
    .rotation.x = Math.PI / 2;

  g.userData.glow = [r1, r2, cut];
  g.userData.kind = 'leviathan';
  g.scale.setScalar(0.95);
  return g;
}

/** Einfache Standard-Spitzhacke (Startwaffe für Bots / Alternativ-Skin). */
export function buildDefaultPickaxe() {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: '#b9c2cc' });
  const wood = new THREE.MeshLambertMaterial({ color: '#8a6136' });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.0, 7), wood);
  shaft.position.y = -0.15; g.add(shaft);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), steel);
  head.position.y = 0.36; head.rotation.z = 0.25; g.add(head);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), steel);
  spike.position.set(0.28, 0.44, 0); spike.rotation.z = -1.2; g.add(spike);
  g.userData.kind = 'default';
  return g;
}

export function buildPickaxe(id) {
  return id === 'leviathan' ? buildLeviathanAxe() : buildDefaultPickaxe();
}
