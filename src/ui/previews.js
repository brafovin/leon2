import * as THREE from 'three';
import { buildSkin } from '../entities/character.js';
import { buildPickaxe } from '../items/pickaxe.js';
import { buildPorschePreview } from '../vehicles/porsche.js';

/**
 * Rendert kleine 3D-Vorschaubilder der Items als Data-URL,
 * damit die Shop-Karten echte Modelle zeigen statt Platzhalter.
 */
export function renderPreviews(ids) {
  const W = 400, H = 264;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x30384a, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fd0ff, 0.7);
  rim.position.set(-4, 2, -4); scene.add(rim);

  const out = {};
  for (const id of ids) {
    const { obj, camPos, look } = makePreviewObject(id);
    if (!obj) continue;
    scene.add(obj);
    cam.position.set(...camPos);
    cam.lookAt(...look);
    renderer.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(obj);
  }
  renderer.dispose();
  return out;
}

function makePreviewObject(id) {
  if (id.startsWith('porsche')) {
    const color = id.includes('silver') ? 'gtSilver' : 'guardsRed';
    const car = buildPorschePreview(color);
    car.rotation.y = -0.72;          // Front zur Kamera (lokales +X = Bug)
    car.position.y = -0.5;
    return { obj: car, camPos: [4.4, 2.1, 4.6], look: [0, 0.35, 0] };
  }
  if (id === 'leviathan' || id === 'default') {
    const axe = buildPickaxe(id);
    axe.position.y = -0.05;
    axe.rotation.set(0.15, 0.6, 0.35);
    axe.scale.setScalar(1.55);
    return { obj: axe, camPos: [0.4, 0.4, 3.2], look: [0, -0.05, 0] };
  }
  const skinIndex = { ranger: 2, nightfalcon: 3 }[id] ?? 0;
  const rig = buildSkin(id, skinIndex);
  rig.pose(0.9);
  rig.root.rotation.y = 0.55;
  rig.root.position.y = -1.0;
  return { obj: rig.root, camPos: [0, 0.35, 3.5], look: [0, -0.1, 0] };
}
