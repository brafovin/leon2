/* Item-Katalog: Skins, Spitzhacken, Fahrzeuge. */

export const CATALOG = {
  skins: [
    { id: 'kratos', name: 'Kratos', rarity: 'icon', price: 0, tag: 'START',
      desc: 'Der Geist von Sparta. Startskin.' },
    { id: 'atreus', name: 'Atreus', rarity: 'epic', price: 1200, tag: 'NEU',
      desc: 'Sohn des Kriegsgottes. Bogenschütze aus Midgard.' },
    { id: 'ranger', name: 'Waldläufer', rarity: 'rare', price: 800,
      desc: 'Leichte Ausrüstung, schnelle Rotationen.' },
    { id: 'nightfalcon', name: 'Nachtfalke', rarity: 'epic', price: 1200,
      desc: 'Späher-Outfit für lautlose Anflüge.' },
  ],
  pickaxes: [
    { id: 'leviathan', name: 'Leviathan-Axt', rarity: 'legendary', price: 0, tag: 'START',
      desc: 'Frostgeschmiedete Axt mit Runenklinge.' },
    { id: 'default', name: 'Standard-Hacke', rarity: 'common', price: 0,
      desc: 'Tut, was sie soll.' },
  ],
  cars: [
    { id: 'porsche991', name: 'Porsche 991', rarity: 'legendary', price: 2000, tag: 'HEISS',
      desc: 'Heckmotor-Sportwagen. Spawnt zu Matchbeginn neben dir.', color: 'guardsRed' },
    { id: 'porsche991_silver', name: 'Porsche 991 GT-Silber', rarity: 'epic', price: 1500,
      desc: 'Gleiche Leistung, kühlere Lackierung.', color: 'gtSilver' },
  ],
};

/** Tagesangebot: Atreus und der Porsche sind immer im Shop. */
export function shopItems() {
  const out = [];
  for (const s of CATALOG.skins) if (s.price > 0) out.push({ ...s, slot: 'skin' });
  for (const c of CATALOG.cars) out.push({ ...c, slot: 'car' });
  for (const p of CATALOG.pickaxes) if (p.price > 0) out.push({ ...p, slot: 'pickaxe' });
  // Atreus und Porsche 991 zuerst
  const rank = (i) => (i.id === 'atreus' ? 0 : i.id === 'porsche991' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

export function findItem(id) {
  for (const list of Object.values(CATALOG)) {
    const hit = list.find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}

/* ---------------- Arena-Divisionen ---------------- */

export const DIVISIONS = [
  { name: 'Offene Division I', min: 0, buyIn: 0 },
  { name: 'Offene Division II', min: 500, buyIn: 0 },
  { name: 'Offene Division III', min: 1500, buyIn: 0 },
  { name: 'Contender Division IV', min: 3000, buyIn: 15 },
  { name: 'Contender Division V', min: 5000, buyIn: 25 },
  { name: 'Contender Division VI', min: 7500, buyIn: 35 },
  { name: 'Champion Division VII', min: 10000, buyIn: 50 },
  { name: 'Champion Division VIII', min: 14000, buyIn: 60 },
];

export function divisionFor(hype) {
  let idx = 0;
  for (let i = 0; i < DIVISIONS.length; i++) if (hype >= DIVISIONS[i].min) idx = i;
  return { index: idx, ...DIVISIONS[idx], next: DIVISIONS[idx + 1] || null };
}

/** Hype-Berechnung nach einem Arena-Match. */
export function arenaScore({ placement, kills, total, buyIn }) {
  let hype = -buyIn;
  if (placement === 1) hype += 60;
  else if (placement <= 3) hype += 40;
  else if (placement <= 5) hype += 25;
  else if (placement <= Math.ceil(total * 0.25)) hype += 12;
  else if (placement <= Math.ceil(total * 0.5)) hype += 5;
  hype += kills * 8;
  return hype;
}
