// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, ferryAt, nextDeparture, clock, DOCK_TIME, CRUISE } from '../src/harbour.js';

const R = makeRoute('Centre Island', [118, 1505], [118, 3248]);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('route timing: ramps up to cruise and back down', () => {
  assert.ok(near(R.len, 1743));
  assert.equal(R.vmax, CRUISE);
  assert.ok(R.sail > R.len / CRUISE && R.sail < R.len / CRUISE + 30, `sail ${R.sail}`);
  assert.ok(near(R.cycle, 2 * (DOCK_TIME + R.sail)));
  const hop = makeRoute('hop', [0, 0], [0, 100]);
  assert.ok(hop.vmax < CRUISE);
  assert.ok(near(ferryAt(hop, DOCK_TIME + hop.sail / 2).s, 50, 1e-6));
});

test('ferry waits at the terminal, sails, waits at the island, sails back', () => {
  let f = ferryAt(R, 0); assert.equal(f.phase, 'docked'); assert.equal(f.at, 'A'); assert.equal(f.x, 118); assert.equal(f.z, 1505);
  f = ferryAt(R, DOCK_TIME + 1); assert.equal(f.phase, 'sailing'); assert.equal(f.to, 'B'); assert.ok(f.z > 1505 && f.z < 1510);
  f = ferryAt(R, DOCK_TIME + R.sail / 2); assert.ok(near(f.z, (1505 + 3248) / 2, 1e-6)); assert.equal(f.v, CRUISE);
  f = ferryAt(R, DOCK_TIME + R.sail + 1); assert.equal(f.phase, 'docked'); assert.equal(f.at, 'B'); assert.equal(f.z, 3248);
  f = ferryAt(R, 2 * DOCK_TIME + R.sail + 1); assert.equal(f.phase, 'sailing'); assert.equal(f.to, 'A'); assert.ok(f.z < 3248 && f.z > 3240);
  f = ferryAt(R, R.cycle + 2); assert.equal(f.phase, 'docked'); assert.equal(f.at, 'A');
});

test('the ferry moves smoothly, never faster than cruise, and stops at each dock', () => {
  let prev = ferryAt(R, 0);
  for (let t = 0.1; t < R.cycle * 2; t += 0.1) {
    const f = ferryAt(R, t), jump = Math.hypot(f.x - prev.x, f.z - prev.z);
    assert.ok(jump <= CRUISE * 0.1 + 1e-6, `jump ${jump} at t=${t.toFixed(1)}`);
    assert.ok(f.v <= CRUISE + 1e-9);
    prev = f;
  }
  assert.ok(ferryAt(R, DOCK_TIME + R.sail - 0.01).v < 0.05);
});

test('offset shifts the timetable and negative times wrap', () => {
  const S = makeRoute('x', [0, 0], [0, 1000], 40);
  assert.deepEqual(ferryAt(S, 0), ferryAt(makeRoute('x', [0, 0], [0, 1000]), 40));
  assert.equal(ferryAt(R, -1).phase, 'sailing');
  assert.equal(ferryAt(R, -1).to, 'A');
});

test('next departure countdowns', () => {
  assert.equal(nextDeparture(R, 5, 'A'), 0);
  assert.ok(near(nextDeparture(R, 5, 'B'), DOCK_TIME + R.sail - 5));
  assert.ok(near(nextDeparture(R, DOCK_TIME + 3, 'A'), R.cycle - DOCK_TIME - 3));
  assert.equal(nextDeparture(R, DOCK_TIME + R.sail + 2, 'B'), 0);
  for (let t = 0; t < R.cycle; t += 7) for (const e of ['A', 'B']) { const w = nextDeparture(R, t, e); assert.ok(w >= 0 && w < R.cycle); }
});

test('clock formats seconds', () => {
  assert.equal(clock(0), '0:00'); assert.equal(clock(59.2), '1:00'); assert.equal(clock(125), '2:05'); assert.equal(clock(-3), '0:00');
});
