// The TTC: planning a subway trip between two stations (lines, transfers, stops, minutes) and the fare. No page code,
// so it can be unit-tested (node --test tests/). The page (src/game/22-ttc.js) draws the entrances and runs the ride.
//
// network: { lines: [{ref, name, col, st: [station index, ...in order]}], stations: [{n, l: [line refs], ...}] }

export const FARE = 3;               // dollars a ride, transfers included (subway and streetcar alike)
export const MIN_PER_STOP = 2;       // minutes between stations
export const MIN_PER_TRANSFER = 4;   // walking between platforms and waiting

// fewest transfers first, then fewest stops: a breadth-first search over (station, line) with transfers costing more
export function plan(net, from, to) {
  if (from === to) return { legs: [], stops: 0, transfers: 0, minutes: 0 };
  const pos = net.lines.map(L => { const m = new Map(); L.st.forEach((s, i) => m.set(s, i)); return m; });
  const key = (s, li) => s * 64 + li, best = new Map(), Q = [];
  net.lines.forEach((L, li) => { if (pos[li].has(from)) { Q.push({ s: from, li, cost: 0, prev: null }); best.set(key(from, li), 0); } });
  let done = null;
  while (Q.length) {
    Q.sort((a, b) => a.cost - b.cost); const cur = Q.shift();
    if (cur.cost > (best.get(key(cur.s, cur.li)) ?? Infinity)) continue;
    if (cur.s === to) { done = cur; break; }
    const L = net.lines[cur.li], i = pos[cur.li].get(cur.s);
    for (const d of [-1, 1]) { const j = i + d; if (j < 0 || j >= L.st.length) continue; const s = L.st[j], c = cur.cost + 1;
      if (c < (best.get(key(s, cur.li)) ?? Infinity)) { best.set(key(s, cur.li), c); Q.push({ s, li: cur.li, cost: c, prev: cur }); } }
    net.lines.forEach((L2, li2) => { if (li2 === cur.li || !pos[li2].has(cur.s)) return; const c = cur.cost + 100; // a transfer outweighs any number of stops
      if (c < (best.get(key(cur.s, li2)) ?? Infinity)) { best.set(key(cur.s, li2), c); Q.push({ s: cur.s, li: li2, cost: c, prev: cur, xfer: true }); } });
  }
  if (!done) return null;
  const path = []; for (let n = done; n; n = n.prev) path.unshift(n);
  const legs = []; let leg = null;
  for (const n of path) {
    if (!leg || n.li !== leg.li) { if (leg && leg.from !== leg.to) legs.push(leg); leg = { li: n.li, line: net.lines[n.li].ref, name: net.lines[n.li].name, from: n.s, to: n.s, stops: 0 }; }
    else { leg.to = n.s; leg.stops++; }
  }
  if (leg && leg.from !== leg.to) legs.push(leg);
  const stops = legs.reduce((a, l) => a + l.stops, 0), transfers = legs.length - 1;
  return { legs, stops, transfers, minutes: stops * MIN_PER_STOP + transfers * MIN_PER_TRANSFER };
}

// the stations a ride passes through, in order (for the "next station" announcements)
export function stopsOf(net, trip) {
  const out = [];
  for (const l of trip.legs) { const st = net.lines[l.li].st, a = st.indexOf(l.from), b = st.indexOf(l.to), d = b > a ? 1 : -1;
    for (let i = a + d; d > 0 ? i <= b : i >= b; i += d) out.push({ s: st[i], line: l.line, end: i === b }); }
  return out;
}
// which way a leg heads: the station at the end of the line in that direction ("towards Finch")
export function towards(net, leg) { const st = net.lines[leg.li].st, a = st.indexOf(leg.from), b = st.indexOf(leg.to); return b > a ? st[st.length - 1] : st[0]; }
