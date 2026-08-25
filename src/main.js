import * as THREE from 'three';
import { Input } from './engine/input.js';
import { sfx } from './engine/audio.js';
import { save } from './save.js';
import { Match } from './match.js';
import { Hud } from './ui/hud.js';
import { Lobby } from './ui/lobby.js';
import { renderPreviews } from './ui/previews.js';
import { CATALOG, divisionFor, arenaScore, findItem } from './ui/catalog.js';
import { buildSkin } from './entities/character.js';
import { buildPickaxe } from './items/pickaxe.js';
import { buildPorschePreview } from './vehicles/porsche.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/*  Renderer & Grundszene                                             */
/* ------------------------------------------------------------------ */

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1400);
const input = new Input(canvas);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function skyScene(color = 0x8fc4f0, fog = 0xa9cfee, fogNear = 180, fogFar = 620) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(color);
  s.fog = new THREE.Fog(fog, fogNear, fogFar);
  s.add(new THREE.HemisphereLight(0xd9ecff, 0x4a5a3f, 1.05));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.15);
  sun.position.set(120, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 520;
  const d = 90;
  Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0008;
  s.add(sun, sun.target);
  s.userData.sun = sun;
  return s;
}

/* ------------------------------------------------------------------ */
/*  Lobby-Bühne                                                       */
/* ------------------------------------------------------------------ */

const lobbyScene = skyScene(0x10203c, 0x10203c, 30, 140);
lobbyScene.userData.sun.position.set(9, 14, 8);
{
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 0.6, 48),
    new THREE.MeshLambertMaterial({ color: 0x16233c }),
  );
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  lobbyScene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.4, 0.09, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x2a7fd0 }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  lobbyScene.add(ring);
  const spot = new THREE.PointLight(0x7fd0ff, 90, 40);
  spot.position.set(0, 8, 5);
  lobbyScene.add(spot);
  // Fülllicht von der Kameraseite, damit die Figur nicht im Schatten steht
  const fill = new THREE.DirectionalLight(0xffffff, 1.05);
  fill.position.set(-5, 4, 7);
  lobbyScene.add(fill);
  const rim = new THREE.DirectionalLight(0xffb46a, 0.6);
  rim.position.set(6, 3, -5);
  lobbyScene.add(rim);
}

const stage = new THREE.Group();
lobbyScene.add(stage);
let stageRig = null;
// Kameraeinstellung der Lobby-Bühne (weiter weg, sobald ein Auto danebensteht)
let framing = { camX: -1.9, camY: 1.7, camZ: 4.0, lookX: 0.7, lookY: 1.0 };

function refreshStage() {
  stage.clear();
  const eq = save.data.equipped;
  const rig = buildSkin(eq.skin, 0);
  const axe = buildPickaxe(eq.pickaxe);
  axe.position.set(0, -0.34, 0.06);
  axe.rotation.set(-0.3, 0, -0.25);
  rig.handR.add(axe);
  rig.root.position.set(0.75, 0, 0);
  stage.add(rig.root);
  stageRig = rig;
  framing = { camX: -1.9, camY: 1.7, camZ: 4.0, lookX: 0.7, lookY: 1.0 };

  if (eq.car) {
    const item = findItem(eq.car);
    const car = buildPorschePreview(item?.color || 'guardsRed');
    car.position.set(4.3, 0, -1.4);
    car.rotation.y = -2.35;          // Dreiviertel-Frontansicht zur Lobbykamera
    stage.add(car);
    rig.root.position.set(0.6, 0, 1.1);
    framing = { camX: -1.6, camY: 2.2, camZ: 6.6, lookX: 1.9, lookY: 0.9 };
  }
}

/* ------------------------------------------------------------------ */
/*  Spielzustand                                                      */
/* ------------------------------------------------------------------ */

const hud = new Hud();
let match = null;
let state = 'boot';           // boot | lobby | playing | paused | result
let lobby = null;
let pendingArenaBuyIn = 0;

function setState(s) {
  state = s;
  lobby?.show(s === 'lobby');
  hud.show(s === 'playing' || s === 'paused');
  $('pause').classList.toggle('hidden', s !== 'paused');
  $('result').classList.toggle('hidden', s !== 'result');
  if (s === 'playing') input.lock(); else input.unlock();
}

/* ---------------- Match starten / beenden ---------------- */

function startMatch(mode) {
  const eq = save.data.equipped;

  pendingArenaBuyIn = 0;
  if (mode === 'arena') {
    const div = divisionFor(save.data.hype);
    if (div.buyIn > save.data.hype) {
      hud.toast('Nicht genug Hype für das Buy-In', 1800);
      return;
    }
    pendingArenaBuyIn = div.buyIn;
  }

  match?.dispose();
  matchScene.clear();
  rebuildMatchLights();

  match = new Match(matchScene, {
    mode,
    loadout: { skin: eq.skin, pickaxe: eq.pickaxe, car: eq.car },
    hud,
  });
  hud.setMode(mode);
  hud.killfeed(mode === 'arena'
    ? `ARENA — ${divisionFor(save.data.hype).name} · Bauen deaktiviert`
    : 'BATTLE ROYALE — viel Erfolg!', '#3aa0ff');
  hud.toast(mode === 'arena'
    ? '<b>ARENA</b><br><span style="font-size:15px">Kein Bauen · Voll ausgerüstet</span>'
    : '<b>MATCH GESTARTET</b><br><span style="font-size:15px">Sammle Material und finde Truhen</span>', 2600);
  setState('playing');
}

function endMatch() {
  const r = match.result;
  const stats = save.data.stats;
  stats.matches++; stats.kills += r.kills;
  if (r.won) stats.wins++;

  let vbucks = 25 + r.kills * 20 + Math.max(0, Math.round((r.total - r.placement) * 2.5));
  if (r.won) vbucks += 250;
  save.addVbucks(vbucks);

  let hypeDelta = 0;
  if (r.mode === 'arena') {
    stats.arenaMatches++;
    if (r.won) stats.arenaWins++;
    hypeDelta = arenaScore({ placement: r.placement, kills: r.kills, total: r.total, buyIn: pendingArenaBuyIn });
    save.addHype(hypeDelta);
  }
  save.persist();

  $('result-title').textContent = r.won ? '#1 VICTORY ROYALE' : `#${r.placement} von ${r.total}`;
  $('result-title').style.color = r.won ? '#ffc93c' : '#e8f1ff';
  const base = r.won
    ? `Du hast ${r.kills} Gegner eliminiert und überlebt.`
    : `Ausgeschaltet von ${r.killer || 'dem Sturm'} · ${r.kills} Eliminierungen.`;
  $('result-sub').innerHTML = r.mode === 'arena'
    ? `${base}<br><b style="color:${hypeDelta >= 0 ? '#3ddc84' : '#ff4d5e'}">
       ${hypeDelta >= 0 ? '+' : ''}${hypeDelta} Hype</b> · ${divisionFor(save.data.hype).name}`
    : base;
  $('result-vb').textContent = vbucks.toLocaleString('de-DE');

  setState('result');
}

/* ---------------- Match-Szene ---------------- */

let matchScene = skyScene();
function rebuildMatchLights() {
  matchScene.background = new THREE.Color(0x8fc4f0);
  matchScene.fog = new THREE.Fog(0xa9cfee, 200, 700);
  matchScene.add(new THREE.HemisphereLight(0xd9ecff, 0x4a5a3f, 1.05));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.15);
  sun.position.set(120, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 520;
  const d = 90;
  Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0008;
  matchScene.add(sun, sun.target);
  matchScene.userData.sun = sun;
}

/* ------------------------------------------------------------------ */
/*  Buttons                                                           */
/* ------------------------------------------------------------------ */

$('btn-resume').addEventListener('click', () => setState('playing'));
$('btn-quit').addEventListener('click', () => { quitToLobby(); });
$('btn-again').addEventListener('click', () => { quitToLobby(); });

function quitToLobby() {
  match?.dispose();
  match = null;
  matchScene.clear();
  rebuildMatchLights();
  refreshStage();
  setState('lobby');
  lobby.refresh();
}

canvas.addEventListener('click', () => { if (state === 'playing') input.lock(); });
document.addEventListener('pointerlockchange', () => {
  if (state === 'playing' && !input.locked && match && !match.ended) setState('paused');
});

/* ------------------------------------------------------------------ */
/*  Hauptschleife                                                     */
/* ------------------------------------------------------------------ */

let last = performance.now();
let mapOpen = false;
let hudTick = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (state === 'lobby' || state === 'boot') {
    stageRig?.pose(t);
    // Kamera leicht versetzt, damit die Figur rechts neben den Menü-Panels steht
    camera.position.set(framing.camX + Math.sin(t * 0.15) * 0.35, framing.camY, framing.camZ);
    camera.lookAt(framing.lookX, framing.lookY, 0);
    renderer.render(lobbyScene, camera);
    input.endFrame();
    return;
  }

  if (state === 'playing' && match) {
    if (input.hit('Escape')) { setState('paused'); input.endFrame(); return; }
    if (input.hit('Tab')) { mapOpen = !mapOpen; hud.toggleMap(mapOpen); }

    match.update(dt, input);
    match.player.updateCamera(camera, dt);

    // Sonne folgt dem Spieler, damit die Schattenkarte scharf bleibt
    const sun = matchScene.userData.sun;
    if (sun) {
      sun.position.set(match.player.pos.x + 120, 190, match.player.pos.z + 90);
      sun.target.position.copy(match.player.pos);
      sun.target.updateMatrixWorld();
    }

    hudTick += dt;
    hud.update(match.player, {
      alive: match.aliveCount(),
      stormLabel: match.storm.label(),
      inStorm: match.inStorm,
      hype: save.data.hype,
    });
    if (hudTick > 0.2) { hudTick = 0; hud.updateMaps(match.world, match.player, match.bots, match.storm); }

    if (match.ended) endMatch();
  } else if (state === 'paused' && match) {
    if (input.hit('Escape')) setState('playing');
    match.player.updateCamera(camera, dt);
  }

  if (match) renderer.render(matchScene, camera);
  input.endFrame();
}

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

async function boot() {
  const steps = [
    ['Speicherstand wird geladen …', () => save.load()],
    ['Item-Vorschauen werden gerendert …', () => {
      const ids = [...CATALOG.skins, ...CATALOG.pickaxes, ...CATALOG.cars].map((i) => i.id);
      return renderPreviews(ids);
    }],
    ['Lobby wird aufgebaut …', (previews) => {
      lobby = new Lobby({
        previews,
        onPlay: (mode) => startMatch(mode),
        onLoadoutChange: () => refreshStage(),
      });
      refreshStage();
    }],
  ];

  let carry = null;
  for (let i = 0; i < steps.length; i++) {
    $('boot-text').textContent = steps[i][0];
    $('boot-bar').style.width = `${((i + 0.4) / steps.length) * 100}%`;
    await new Promise((r) => setTimeout(r, 40));
    carry = steps[i][1](carry) ?? carry;
  }
  $('boot-bar').style.width = '100%';
  await new Promise((r) => setTimeout(r, 180));
  $('boot').classList.add('hidden');
  setState('lobby');
}

rebuildMatchLights();
requestAnimationFrame(frame);
boot();

// Debug-Zugriff in der Konsole
window.LEON = { save, get match() { return match; }, startMatch, quitToLobby };
