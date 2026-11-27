// Property: the businesses you can buy, what they earn, upgrades, and the cars kept in your home garages. No page code,
// so it can be unit-tested (node --test tests/). The page (index.html) places the businesses on the map and calls these.
//
// A business earns while you play (real minutes, not game hours, so skipping time with T doesn't print money) into a
// safe that holds about half an hour of takings: drop by to empty it. Two upgrades each add half the base rate again.

export const SAFE_MINUTES = 30;
export const MAX_LEVEL = 2;

// rate: dollars per minute of play at level 0. at: map spot (snapped to the sidewalk by the page). perk: shown on the sign.
export const BUSINESSES = [
  { id: 'suds', name: 'Spadina Suds', kind: 'Laundromat', price: 15000, rate: 260, at: [-1060, -420], perk: 'Steady takings, open all hours.' },
  { id: 'slice', name: 'Queen West Slice', kind: 'Pizza shop', price: 24000, rate: 400, at: [-700, -60], perk: 'Busiest after midnight: double takings from midnight to 4am.', lateNight: true },
  { id: 'gleam', name: 'Gleam Car Wash', kind: 'Car wash', price: 32000, rate: 480, at: [900, 1150], perk: 'Drive in for a free repair and respray, and lose a two-star wanted level.', wash: true },
  { id: 'cabs', name: 'Six City Cabs', kind: 'Taxi company', price: 40000, rate: 620, at: [1300, -200], perk: 'Good, honest money.' },
  { id: 'boats', name: 'Harbour Boat Club', kind: 'Marina', price: 48000, rate: 700, at: [-930, 1445], perk: 'A club speedboat is always waiting at the slip for you.', boat: true },
  { id: 'nocturne', name: 'Club Nocturne', kind: 'Nightclub', price: 90000, rate: 1250, at: [-480, 300], perk: 'Double takings from 9pm to 4am.', night: true },
];
export const byId = id => BUSINESSES.find(b => b.id === id);

export const upgradeCost = (b, lvl) => lvl >= MAX_LEVEL ? null : Math.round(b.price * 0.4 * (lvl + 1) / 500) * 500;

// dollars per minute right now (hour = in-game clock, 0–24)
export function rateOf(b, lvl, hour = 12) {
  let r = b.rate * (1 + 0.5 * Math.min(MAX_LEVEL, Math.max(0, lvl)));
  if (b.night && (hour >= 21 || hour < 4)) r *= 2;
  if (b.lateNight && hour < 4) r *= 2;
  return r;
}
export const capOf = (b, lvl) => Math.round(b.rate * (1 + 0.5 * Math.min(MAX_LEVEL, Math.max(0, lvl))) * SAFE_MINUTES);

// add `minutes` of takings to an owned business's state {lvl, safe}; returns the state (mutated) and whether it just filled
export function accrue(st, b, minutes, hour = 12) {
  const cap = capOf(b, st.lvl), was = st.safe;
  st.safe = Math.min(cap, st.safe + rateOf(b, st.lvl, hour) * Math.max(0, minutes));
  return { st, filled: was < cap && st.safe >= cap };
}

// can you buy / upgrade, and what it costs (no money changes hands here)
export function canBuy(owned, id, cash) { const b = byId(id); if (!b) return { ok: false, why: 'No such business' }; if (owned[id]) return { ok: false, why: 'You already own it' }; if (cash < b.price) return { ok: false, why: `You need $${(b.price - cash).toLocaleString()} more` }; return { ok: true, cost: b.price }; }
export function canUpgrade(owned, id, cash) {
  const b = byId(id), st = owned[id]; if (!b || !st) return { ok: false, why: "You don't own it" };
  const c = upgradeCost(b, st.lvl); if (c === null) return { ok: false, why: 'Fully upgraded' };
  if (cash < c) return { ok: false, why: `You need $${(c - cash).toLocaleString()} more`, cost: c }; return { ok: true, cost: c };
}

/* ============================== home garages ============================== */
// how many cars each home's garage holds (the island cottage has no road, so no garage)
export const GARAGE_SIZE = { kens: 1, sherb: 2, kingw: 2, qq: 3, wards: 0 };
export const garageSize = home => GARAGE_SIZE[home] ?? 1;

// car: {ti, col, hp}; returns the new list or an error (lists are never mutated)
export function storeCar(list, home, car) {
  list = list || [];
  if (!car || car.ti == null) return { ok: false, why: "That can't go in a garage" };
  if (list.length >= garageSize(home)) return { ok: false, why: garageSize(home) ? 'Your garage here is full' : 'There is no garage here' };
  return { ok: true, list: [...list, { ti: car.ti, col: car.col, hp: Math.max(1, Math.round(car.hp ?? 100)) }] };
}
export function takeCar(list, i) {
  list = list || []; if (i < 0 || i >= list.length) return { ok: false, why: 'No car there' };
  return { ok: true, car: list[i], list: list.filter((_, k) => k !== i) };
}

// what the phone's Property app shows: total in all safes and per-minute income right now
export function summary(owned, hour = 12) {
  let safe = 0, perMin = 0, n = 0;
  for (const b of BUSINESSES) { const st = owned[b.id]; if (!st) continue; n++; safe += st.safe; perMin += rateOf(b, st.lvl, hour); }
  return { n, safe: Math.floor(safe), perMin: Math.round(perMin) };
}
