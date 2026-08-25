import { CATALOG, shopItems, findItem, divisionFor } from './catalog.js';
import { save } from '../save.js';
import { sfx } from '../engine/audio.js';

const $ = (id) => document.getElementById(id);
const RARITY_LABEL = {
  common: 'GEWÖHNLICH', uncommon: 'UNGEWÖHNLICH', rare: 'SELTEN',
  epic: 'EPISCH', legendary: 'LEGENDÄR', icon: 'ICON-SERIE',
};

export class Lobby {
  constructor({ previews, onPlay, onLoadoutChange }) {
    this.previews = previews;
    this.onPlay = onPlay;
    this.onLoadoutChange = onLoadoutChange;
    this.mode = 'br';
    this.el = $('lobby');
    this._wire();
    this.refresh();
  }

  show(v) { this.el.classList.toggle('hidden', !v); if (v) this.refresh(); }

  _wire() {
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        document.querySelectorAll('.tabpage').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        $(`tab-${t.dataset.tab}`).classList.add('active');
        sfx.ui();
      });
    });

    document.querySelectorAll('.mode').forEach((m) => {
      m.addEventListener('click', () => {
        document.querySelectorAll('.mode').forEach((x) => x.classList.remove('active'));
        m.classList.add('active');
        this.mode = m.dataset.mode;
        sfx.ui();
        this.refresh();
      });
    });

    $('btn-play').addEventListener('click', () => {
      sfx.resume(); sfx.ui();
      this.onPlay(this.mode);
    });
  }

  refresh() {
    $('vbucks').textContent = save.data.vbucks.toLocaleString('de-DE');
    this._renderLocker();
    this._renderShop();
    this._renderArena();
    const skin = findItem(save.data.equipped.skin);
    const pick = findItem(save.data.equipped.pickaxe);
    const car = save.data.equipped.car ? findItem(save.data.equipped.car) : null;
    $('loadout-line').textContent =
      `${skin?.name || '—'} · ${pick?.name || '—'}${car ? ` · ${car.name}` : ''}` +
      (this.mode === 'arena' ? '  |  ARENA: Bauen deaktiviert' : '');
  }

  _card(item, slot) {
    const owned = item.price === 0 || save.owns(item.id);
    const equipped = save.data.equipped[slot] === item.id;
    const el = document.createElement('div');
    el.className = `card ${item.rarity}${owned ? ' owned' : ''}${equipped ? ' equipped' : ''}`;
    const img = this.previews[item.id];
    el.innerHTML = `
      ${item.tag ? `<span class="tag">${item.tag}</span>` : ''}
      <img class="thumb" src="${img || ''}" alt="${item.name}" />
      <div class="meta">
        <div class="name">${item.name}</div>
        <div class="rar">${RARITY_LABEL[item.rarity] || ''}</div>
        <div class="price">${owned
          ? (equipped ? '✔ AUSGERÜSTET' : 'AUSRÜSTEN')
          : `<i class="vb"></i>${item.price.toLocaleString('de-DE')}`}</div>
      </div>`;
    el.title = item.desc || '';
    el.addEventListener('click', () => this._click(item, slot, owned));
    return el;
  }

  _click(item, slot, owned) {
    if (owned) {
      if (slot === 'car' && save.data.equipped.car === item.id) save.equip('car', null);
      else save.equip(slot, item.id);
      sfx.ui();
      this.onLoadoutChange?.();
      this.refresh();
      return;
    }
    if (save.data.vbucks < item.price) {
      this._flash(`Nicht genug V-Bucks für ${item.name}`);
      return;
    }
    if (save.buy(item.id, item.price)) {
      sfx.buy();
      save.equip(slot, item.id);
      this._flash(`${item.name} gekauft!`);
      this.onLoadoutChange?.();
      this.refresh();
    }
  }

  _flash(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    t.style.zIndex = 60;
    setTimeout(() => { t.classList.remove('show'); t.style.zIndex = ''; }, 1800);
  }

  _renderLocker() {
    const fill = (elId, list, slot) => {
      const box = $(elId);
      box.innerHTML = '';
      for (const item of list) {
        if (item.price > 0 && !save.owns(item.id)) continue;
        box.appendChild(this._card(item, slot));
      }
      if (!box.children.length) box.innerHTML = '<p style="color:#8ea4c8;font-size:13px">Noch nichts im Besitz — schau im Item-Shop vorbei.</p>';
    };
    fill('slot-skins', CATALOG.skins, 'skin');
    fill('slot-picks', CATALOG.pickaxes, 'pickaxe');
    fill('slot-cars', CATALOG.cars, 'car');
  }

  _renderShop() {
    const grid = $('shop-grid');
    grid.innerHTML = '';
    for (const item of shopItems()) grid.appendChild(this._card(item, item.slot));
  }

  _renderArena() {
    const hype = save.data.hype;
    const d = divisionFor(hype);
    $('arena-div-badge').textContent = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][d.index] || 'VIII';
    $('arena-div-name').textContent = d.name.toUpperCase();
    $('arena-hype').textContent = hype.toLocaleString('de-DE');
    if (d.next) {
      const span = d.next.min - d.min;
      const prog = Math.max(0, Math.min(1, (hype - d.min) / span));
      $('arena-hype-bar').style.width = `${prog * 100}%`;
      $('arena-div-next').textContent =
        `Noch ${(d.next.min - hype).toLocaleString('de-DE')} Hype bis ${d.next.name}` +
        (d.buyIn ? ` · Buy-In aktuell ${d.buyIn} Hype` : ' · kein Buy-In');
    } else {
      $('arena-hype-bar').style.width = '100%';
      $('arena-div-next').textContent = 'Höchste Division erreicht.';
    }
  }
}
