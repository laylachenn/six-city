// The harbour: Toronto Island ferry timetables and where each ferry is at any moment, with no page code, so it can be
// unit-tested (node --test tests/). The page (index.html) draws the ferries, boards you and moves you with them.
//
// Each route runs back and forth from the mainland terminal (A) to an island dock (B): wait at A, sail, wait at B,
// sail back. The ferries are double-ended (like the real ones), so they never turn round: the heading is always A→B.
// Sailing speeds up to a cruise, holds it and slows down into the dock (a trapezoid speed profile).

export const FARE = 9;           // dollars, return trip included
export const DOCK_TIME = 30;     // seconds a ferry waits at each end
export const CRUISE = 18;        // m/s at full speed
export const ACCEL = 1.2;        // m/s² speeding up and slowing down

export function makeRoute(name, a, b, offset = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tRamp = CRUISE / ACCEL, dRamp = CRUISE * tRamp / 2;           // time and distance to reach cruise
  let sail, vmax;
  if (2 * dRamp >= len) { vmax = Math.sqrt(len * ACCEL); sail = 2 * vmax / ACCEL; }  // short hop: never reaches cruise
  else { vmax = CRUISE; sail = 2 * tRamp + (len - 2 * dRamp) / CRUISE; }
  return { name, a, b, len, sail, vmax, cycle: 2 * (DOCK_TIME + sail), offset, th: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

// distance covered and speed, tau seconds into a sailing
function profile(r, tau) {
  const tr = r.vmax / ACCEL, cruise = r.sail - 2 * tr;
  if (tau <= 0) return { s: 0, v: 0 };
  if (tau >= r.sail) return { s: r.len, v: 0 };
  if (tau < tr) return { s: ACCEL * tau * tau / 2, v: ACCEL * tau };
  const d1 = ACCEL * tr * tr / 2;
  if (tau < tr + cruise) return { s: d1 + r.vmax * (tau - tr), v: r.vmax };
  const left = r.sail - tau; return { s: r.len - ACCEL * left * left / 2, v: ACCEL * left };
}

// where a route's ferry is at time t (seconds): phase, which end it's at or heading to, position, speed, and the
// seconds until it next leaves (when docked) or arrives (when sailing)
export function ferryAt(r, t) {
  const T = (((t + r.offset) % r.cycle) + r.cycle) % r.cycle, D = DOCK_TIME, S = r.sail;
  const at = (s, from, to) => {
    const f = s / r.len, A = from === 'A' ? r.a : r.b, B = from === 'A' ? r.b : r.a;
    return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
  };
  if (T < D) return { phase: 'docked', at: 'A', x: r.a[0], z: r.a[1], v: 0, wait: D - T, th: r.th };
  if (T < D + S) { const p = profile(r, T - D), [x, z] = at(p.s, 'A', 'B'); return { phase: 'sailing', from: 'A', to: 'B', x, z, v: p.v, s: p.s, wait: D + S - T, th: r.th, dir: 1 }; }
  if (T < 2 * D + S) return { phase: 'docked', at: 'B', x: r.b[0], z: r.b[1], v: 0, wait: 2 * D + S - T, th: r.th };
  const p = profile(r, T - 2 * D - S), [x, z] = at(p.s, 'B', 'A');
  return { phase: 'sailing', from: 'B', to: 'A', x, z, v: p.v, s: p.s, wait: r.cycle - T, th: r.th, dir: -1 };
}

// seconds until the ferry next leaves from end 'A' or 'B' (0 if it's boarding there right now)
export function nextDeparture(r, t, end) {
  const f = ferryAt(r, t);
  if (f.phase === 'docked' && f.at === end) return 0;
  const T = (((t + r.offset) % r.cycle) + r.cycle) % r.cycle, D = DOCK_TIME, S = r.sail;
  const arrive = end === 'A' ? r.cycle : D + S;   // when the ferry next pulls in at that end, in cycle time
  return ((arrive - T) % r.cycle + r.cycle) % r.cycle;
}

export const clock = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
