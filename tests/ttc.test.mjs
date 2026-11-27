// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, stopsOf, towards, MIN_PER_STOP, MIN_PER_TRANSFER } from '../src/ttc.js';

// a small U-shaped Line 1, a crosstown Line 2 meeting it at two places, and a short Line 4 off the top
//   Line 1: 0 1 2 3 4 5 6     (2 = "St George", 4 = "Bloor-Yonge")
//   Line 2: 7 8 2 9 4 10 11
//   Line 4: 6 12 13
const net = {
  lines: [{ ref: '1', name: 'Line 1', st: [0, 1, 2, 3, 4, 5, 6] }, { ref: '2', name: 'Line 2', st: [7, 8, 2, 9, 4, 10, 11] }, { ref: '4', name: 'Line 4', st: [6, 12, 13] }],
  stations: Array.from({ length: 14 }, (_, i) => ({ n: 'S' + i })),
};

test('same line: straight there', () => {
  const t = plan(net, 1, 5);
  assert.equal(t.legs.length, 1); assert.equal(t.legs[0].line, '1'); assert.equal(t.stops, 4); assert.equal(t.transfers, 0);
  assert.equal(t.minutes, 4 * MIN_PER_STOP);
  assert.deepEqual(plan(net, 3, 3), { legs: [], stops: 0, transfers: 0, minutes: 0 });
});

test('one transfer, at the nearer interchange', () => {
  const t = plan(net, 8, 1);   // Line 2 to station 2, then Line 1 one stop
  assert.deepEqual(t.legs.map(l => [l.line, l.from, l.to]), [['2', 8, 2], ['1', 2, 1]]);
  assert.equal(t.minutes, 2 * MIN_PER_STOP + MIN_PER_TRANSFER);
  const u = plan(net, 11, 5);  // via station 4, not 2
  assert.deepEqual(u.legs.map(l => [l.line, l.from, l.to]), [['2', 11, 4], ['1', 4, 5]]);
});

test('two transfers when needed; fewer transfers beat fewer stops', () => {
  const t = plan(net, 7, 13);
  assert.deepEqual(t.legs.map(l => l.line), ['2', '1', '4']); assert.equal(t.transfers, 2);
  const u = plan(net, 2, 4); // both on Line 1 and Line 2: two stops either way, no transfer
  assert.equal(u.transfers, 0); assert.equal(u.stops, 2);
});

test('unreachable stations', () => {
  const lonely = { lines: [...net.lines, { ref: '9', name: 'x', st: [20, 21] }], stations: [] };
  assert.equal(plan(lonely, 0, 21), null);
});

test('announcements and directions', () => {
  const t = plan(net, 8, 1), s = stopsOf(net, t);
  assert.deepEqual(s.map(x => x.s), [2, 1]); assert.deepEqual(s.map(x => x.end), [true, true]);
  assert.equal(towards(net, t.legs[0]), 11); assert.equal(towards(net, t.legs[1]), 0);
});
