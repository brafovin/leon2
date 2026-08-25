/** Persistenz für V-Bucks, Besitz, Ausrüstung und Arena-Hype. */
const KEY = 'leon-royale-save-v1';

const DEFAULT = {
  vbucks: 1500,
  owned: ['kratos', 'leviathan'],
  equipped: { skin: 'kratos', pickaxe: 'leviathan', car: null },
  hype: 0,
  stats: { matches: 0, wins: 0, kills: 0, arenaMatches: 0, arenaWins: 0 },
};

export const save = {
  data: structuredClone(DEFAULT),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...structuredClone(DEFAULT), ...parsed };
        this.data.equipped = { ...DEFAULT.equipped, ...(parsed.equipped || {}) };
        this.data.stats = { ...DEFAULT.stats, ...(parsed.stats || {}) };
        // Startausrüstung kann nie verloren gehen
        for (const id of DEFAULT.owned) if (!this.data.owned.includes(id)) this.data.owned.push(id);
      }
    } catch { /* korrupter Speicherstand -> Standard */ }
    return this.data;
  },

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* Privatmodus */ }
  },

  owns(id) { return this.data.owned.includes(id); },

  buy(id, price) {
    if (this.owns(id) || this.data.vbucks < price) return false;
    this.data.vbucks -= price;
    this.data.owned.push(id);
    this.persist();
    return true;
  },

  equip(slot, id) { this.data.equipped[slot] = id; this.persist(); },
  addVbucks(n) { this.data.vbucks = Math.max(0, this.data.vbucks + n); this.persist(); },
  addHype(n) { this.data.hype = Math.max(0, this.data.hype + n); this.persist(); },
  reset() { this.data = structuredClone(DEFAULT); this.persist(); },
};
