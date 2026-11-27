// Turf: the crews, who holds which neighbourhood, turf-war waves, street-tax income and when rivals hit back. No page
// code, so it can be unit-tested (node --test tests/). The page (index.html) maps neighbourhoods, spawns crews and fights.
//
// The crews are made up. Turf follows the game's downtown neighbourhood names; each crew starts from a home turf and
// holds the neighbourhoods nearest it, the rest are unclaimed. Take a turf in a war of three waves; it pays street tax
// every minute you play; every so often a rival hits one of your turfs and you have a few minutes to defend it.

export const CREWS = [
  { id: 'kings', name: 'Raccoon Kings', col: '#8b4dff', tag: 'RK' },
  { id: 'saints', name: 'Neon Saints', col: '#ff2e88', tag: 'NS' },
  { id: 'gardiner', name: 'Gardiner Boys', col: '#ff8a1c', tag: 'GB' },
];
export const MINE = { id: 'you', name: 'Your crew', col: '#19c3b1', tag: '6' };
// muscle hired for one job in the story: never holds turf, never counted in the turf maths
export const HIRED = { id: 'vale', name: 'Vale Security', col: '#c9ced6', tag: 'V' };
export const crewOf = id => id === 'you' ? MINE : id === HIRED.id ? HIRED : CREWS.find(c => c.id === id) || null;

export const TAX_PER_MIN = 45;          // per turf you hold
export const DEFEND_SECONDS = 180;      // to get to a turf under attack
export const NEIGHBOUR = 1100;          // metres between turf centres that count as next door
export const RADIUS = 1500;             // how far a crew's turf reaches from its home turf at the start

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// turfs: [{id, x, z}] (neighbourhood centres). Picks a home turf per crew, spread far apart, and gives each crew the
// turfs closer to its home than to any other (within RADIUS). Returns {owners: {turfId: crewId|null}, homes: {crewId: turfId}}.
export function assignTurf(turfs, seed = 1) {
  const r = rng32(seed), owners = {}, homes = {};
  if (!turfs.length) return { owners, homes };
  const picks = [turfs[Math.floor(r() * turfs.length)]];
  while (picks.length < CREWS.length && picks.length < turfs.length) { // farthest-point: each new home as far as possible from the others
    let best = null, bd = -1;
    for (const t of turfs) { if (picks.includes(t)) continue; const d = Math.min(...picks.map(p => dist(p, t))) * (0.85 + r() * 0.3); if (d > bd) { bd = d; best = t; } }
    picks.push(best);
  }
  CREWS.forEach((c, i) => { if (picks[i]) homes[c.id] = picks[i].id; });
  for (const t of turfs) {
    let owner = null, bd = Infinity;
    CREWS.forEach((c, i) => { const h = picks[i]; if (!h) return; const d = dist(h, t); if (d < bd) { bd = d; owner = c.id; } });
    owners[t.id] = bd <= RADIUS ? owner : null;
  }
  return { owners, homes };
}

// how many attackers come in each wave of a war over a turf, by how many turfs that crew holds (bigger crews hit harder)
export function warWaves(crewTurfs) { const k = Math.min(2, Math.floor(crewTurfs / 4)); return [3 + k, 3 + k, 4 + k].map(n => Math.min(5, n)); }

export const countOf = (owners, crew) => Object.values(owners).filter(o => o === crew).length;
export const taxPerMin = owners => countOf(owners, 'you') * TAX_PER_MIN;

// which of your turfs a rival hits next: the one with the most rival neighbours, by the crew with the most turf next door.
// Returns {turf, crew} or null if you hold nothing a rival borders.
export function nextAttack(turfs, owners, r = Math.random) {
  const opts = [];
  for (const t of turfs) {
    if (owners[t.id] !== 'you') continue;
    const near = {}; let n = 0;
    for (const u of turfs) { const o = owners[u.id]; if (!o || o === 'you' || u === t || dist(u, t) > NEIGHBOUR) continue; near[o] = (near[o] || 0) + 1; n++; }
    if (!n) continue;
    const crew = Object.entries(near).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    opts.push({ turf: t.id, crew, w: n });
  }
  if (!opts.length) return null;
  const tot = opts.reduce((s, o) => s + o.w, 0); let x = r() * tot;
  for (const o of opts) { x -= o.w; if (x <= 0) return { turf: o.turf, crew: o.crew }; }
  const o = opts[opts.length - 1]; return { turf: o.turf, crew: o.crew };
}

// minutes until the next attack: none until you hold two turfs, then sooner the more you hold (8 down to 4 minutes)
export function attackGap(owned, r = Math.random) { if (owned < 2) return Infinity; return Math.max(4, 8 - (owned - 2) * 0.5) * (0.8 + r() * 0.4); }

// who holds what, for the phone
export function standings(owners) {
  const rows = [MINE, ...CREWS].map(c => ({ id: c.id, name: c.name, col: c.col, n: countOf(owners, c.id) }));
  return { rows, free: Object.values(owners).filter(o => !o).length };
}
