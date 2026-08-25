import { WEAPONS } from '../items/weapons.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.slotsEl = $('slots');
    this.minimap = $('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.bigmap = $('bigmap');
    this.bctx = $('bigmap-c').getContext('2d');
    this.toastTimer = 0;
    this._buildSlots();
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  _buildSlots() {
    this.slotsEl.innerHTML = '';
    this.slotEls = [];
    const order = ['pickaxe', 'smg', 'shotgun', 'bow'];
    order.forEach((id, i) => {
      const d = document.createElement('div');
      d.className = 'slot empty';
      d.innerHTML = `<span class="k">${i + 1}</span><span class="ic">${WEAPONS[id].icon}</span>`;
      this.slotsEl.appendChild(d);
      this.slotEls.push(d);
    });
  }

  setMode(mode) {
    $('hype-pill').classList.toggle('hidden', mode !== 'arena');
    this.mode = mode;
  }

  update(player, state) {
    const hpPct = player.hp / player.maxHp;
    $('bar-hp').style.transform = `scaleX(${hpPct})`;
    $('hp-num').textContent = Math.ceil(player.hp);
    const shPct = player.shield / player.maxShield;
    $('bar-shield').style.transform = `scaleX(${shPct})`;
    $('sh-num').textContent = Math.ceil(player.shield);

    $('mat-wood').textContent = player.mats.wood;
    $('mat-stone').textContent = player.mats.stone;
    $('mat-metal').textContent = player.mats.metal;

    $('alive').textContent = state.alive;
    $('kills').textContent = player.kills;
    $('storm-info').textContent = state.stormLabel;
    if (this.mode === 'arena') $('hud-hype').textContent = state.hype;

    this.slotEls.forEach((el, i) => {
      const w = player.slots[i];
      el.classList.toggle('empty', !w);
      el.classList.toggle('active', i === player.slot);
    });

    const w = player.weapon;
    const ammo = $('ammo');
    if (w && !w.def.melee) {
      ammo.classList.remove('hidden');
      $('ammo-mag').textContent = w.reloading > 0 ? '↻' : w.mag;
      $('ammo-res').textContent = `/${w.reserve}`;
    } else ammo.classList.add('hidden');

    const vign = $('dmg-vignette');
    vign.classList.toggle('on', player.hitFlash > 0);
    vign.classList.toggle('storm', state.inStorm && player.hitFlash <= 0);

    $('drive-hud').classList.toggle('hidden', !player.vehicle);
    if (player.vehicle) $('kmh').textContent = Math.round(player.vehicle.kmh);
  }

  killfeed(text, color = '#ff4d5e') {
    const el = document.createElement('div');
    el.className = 'kf';
    el.style.borderLeftColor = color;
    el.textContent = text;
    const feed = $('killfeed');
    feed.appendChild(el);
    setTimeout(() => el.remove(), 5000);
    while (feed.children.length > 6) feed.firstChild.remove();
  }

  toast(text, ms = 1600) {
    const t = $('toast');
    t.innerHTML = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  toggleMap(v) { this.bigmap.classList.toggle('hidden', !v); }

  drawMap(ctx2d, size, world, player, bots, storm, W) {
    const s = W / size;
    const cx = W / 2, cy = W / 2;
    ctx2d.clearRect(0, 0, W, W);
    ctx2d.fillStyle = '#12406b'; ctx2d.fillRect(0, 0, W, W);

    // Landmasse grob aus der Höhenkarte
    const step = W / 56;
    for (let ix = 0; ix < 56; ix++) {
      for (let iz = 0; iz < 56; iz++) {
        const wx = (ix / 56 - 0.5) * size, wz = (iz / 56 - 0.5) * size;
        const h = world.terrain.heightAt(wx, wz);
        if (h < 0.4) continue;
        ctx2d.fillStyle = h > 14 ? '#8b9099' : h > 7 ? '#5e8c46' : '#4a8b3a';
        ctx2d.fillRect(ix * step, iz * step, step + 1, step + 1);
      }
    }
    // POIs
    ctx2d.fillStyle = 'rgba(255,255,255,.85)';
    ctx2d.font = `${Math.max(9, W / 58)}px "Trebuchet MS"`;
    ctx2d.textAlign = 'center';
    for (const p of world.pois) {
      const x = cx + p.x * s, y = cy + p.z * s;
      ctx2d.fillText(p.name, x, y);
    }
    // Sturm
    if (storm) {
      ctx2d.strokeStyle = '#d8a4ff'; ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(cx + storm.center.x * s, cy + storm.center.y * s, storm.radius * s, 0, Math.PI * 2);
      ctx2d.stroke();
      if (storm.shrinking) {
        ctx2d.strokeStyle = 'rgba(255,255,255,.75)';
        ctx2d.setLineDash([5, 4]);
        ctx2d.beginPath();
        ctx2d.arc(cx + storm.targetCenter.x * s, cy + storm.targetCenter.y * s, storm.targetRadius * s, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
      }
    }
    // Gegner
    ctx2d.fillStyle = '#ff4d5e';
    for (const b of bots) {
      if (!b.alive) continue;
      ctx2d.fillRect(cx + b.pos.x * s - 2, cy + b.pos.z * s - 2, 4, 4);
    }
    // Spieler
    const px = cx + player.pos.x * s, py = cy + player.pos.z * s;
    ctx2d.save();
    ctx2d.translate(px, py);
    ctx2d.rotate(-player.yaw);
    ctx2d.fillStyle = '#7fe0ff';
    ctx2d.beginPath();
    ctx2d.moveTo(0, -7); ctx2d.lineTo(5, 6); ctx2d.lineTo(-5, 6);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.restore();
  }

  updateMaps(world, player, bots, storm) {
    this.drawMap(this.mctx, world.size, world, player, bots, storm, 220);
    if (!this.bigmap.classList.contains('hidden')) {
      this.drawMap(this.bctx, world.size, world, player, bots, storm, 640);
    }
  }

  hitMarker() {
    const c = document.getElementById('crosshair');
    c.classList.add('hit');
    setTimeout(() => c.classList.remove('hit'), 90);
  }
}
