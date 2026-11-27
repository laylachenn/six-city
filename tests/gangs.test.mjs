// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CREWS, HIRED, crewOf, assignTurf, warWaves, nextAttack, attackGap, taxPerMin, countOf, standings, RADIUS, TAX_PER_MIN } from '../src/gangs.js';

// a 6 x 5 grid of neighbourhoods, 800 m apart
const TURFS = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) TURFS.push({ id: `t${i}${j}`, x: i * 800, z: j * 800 });
const seq = (...v) => { let k = 0; return () => v[k++ % v.length]; };

test('crews start in separate corners and hold the turf nearest their home', () => {
  const { owners, homes } = assignTurf(TURFS, 7);
  assert.equal(Object.keys(homes).length, 3);
  const H = Object.values(homes).map(id => TURFS.find(t => t.id === id));
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.ok(Math.hypot(H[a].x - H[b].x, H[a].z - H[b].z) > 2000, 'homes are spread out');
  for (const c of CREWS) assert.equal(owners[homes[c.id]], c.id);
  for (const t of TURFS) {
    const o = owners[t.id]; if (!o) continue;
    const h = TURFS.find(q => q.id === homes[o]);
    assert.ok(Math.hypot(h.x - t.x, h.z - t.z) <= RADIUS);
  }
  assert.ok(Object.values(owners).some(o => o === null), 'some turf starts unclaimed');
  assert.ok(Object.values(owners).every(o => o !== 'you'));
});

test('turf assignment is repeatable per seed', () => {
  assert.deepEqual(assignTurf(TURFS, 3), assignTurf(TURFS, 3));
  assert.deepEqual(assignTurf([], 3), { owners: {}, homes: {} });
  const one = assignTurf([{ id: 'a', x: 0, z: 0 }], 1);
  assert.equal(Object.keys(one.homes).length, 1);
});

test('war waves grow with the crew and never need more than five people', () => {
  assert.deepEqual(warWaves(0), [3, 3, 4]);
  assert.deepEqual(warWaves(4), [4, 4, 5]);
  assert.deepEqual(warWaves(40), [5, 5, 5]);
});

test('street tax and counts', () => {
  const owners = { a: 'you', b: 'you', c: 'kings', d: null };
  assert.equal(taxPerMin(owners), 2 * TAX_PER_MIN);
  assert.equal(countOf(owners, 'kings'), 1);
  const s = standings(owners);
  assert.equal(s.rows[0].id, 'you'); assert.equal(s.rows[0].n, 2); assert.equal(s.free, 1);
  assert.equal(crewOf('you').name, 'Your crew'); assert.equal(crewOf('saints').tag, 'NS'); assert.equal(crewOf('x'), null);
});

test('rivals hit the turf they border, with the crew that has the most turf next door', () => {
  const owners = Object.fromEntries(TURFS.map(t => [t.id, null]));
  assert.equal(nextAttack(TURFS, owners), null);
  owners.t00 = 'you'; assert.equal(nextAttack(TURFS, owners), null, 'nobody next door');
  owners.t10 = 'saints'; owners.t01 = 'kings'; owners.t11 = 'kings';
  assert.deepEqual(nextAttack(TURFS, owners, seq(0.5)), { turf: 't00', crew: 'kings' });
  owners.t50 = 'you'; owners.t40 = 'gardiner';
  const hits = new Set([0.01, 0.99].map(v => nextAttack(TURFS, owners, seq(v)).turf));
  assert.deepEqual([...hits].sort(), ['t00', 't50']);
});

test('attacks start once you hold two turfs and come faster as you grow', () => {
  assert.equal(attackGap(0), Infinity); assert.equal(attackGap(1), Infinity);
  assert.equal(attackGap(2, () => 0.5), 8); assert.equal(attackGap(6, () => 0.5), 6); assert.equal(attackGap(30, () => 0.5), 4);
  assert.ok(attackGap(2, () => 0) < attackGap(2, () => 1));
});

test('hired muscle has a colour and tag but is never a turf crew', () => {
  assert.equal(crewOf('vale'), HIRED); assert.equal(HIRED.tag, 'V');
  assert.ok(!CREWS.some(c => c.id === HIRED.id));
  const owners = assignTurf([{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 3000, z: 0 }, { id: 'c', x: 0, z: 3000 }], 3).owners;
  assert.ok(!Object.values(owners).includes('vale'));
});
