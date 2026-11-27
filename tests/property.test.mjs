// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESSES, byId, upgradeCost, rateOf, capOf, accrue, canBuy, canUpgrade, storeCar, takeCar, garageSize, summary, MAX_LEVEL, SAFE_MINUTES } from '../src/property.js';

test('every business has a sensible price and pays itself back in about an hour of play', () => {
  const ids = new Set();
  for (const b of BUSINESSES) {
    assert.ok(!ids.has(b.id)); ids.add(b.id);
    const payback = b.price / b.rate;
    assert.ok(payback >= 45 && payback <= 80, `${b.id} pays back in ${payback.toFixed(0)} min`);
    assert.equal(byId(b.id), b);
  }
});

test('upgrades: two levels, 40% then 80% of the price, each +50% income', () => {
  const b = byId('cabs');
  assert.equal(upgradeCost(b, 0), 16000); assert.equal(upgradeCost(b, 1), 32000); assert.equal(upgradeCost(b, MAX_LEVEL), null);
  assert.equal(rateOf(b, 0), 620); assert.equal(rateOf(b, 1), 930); assert.equal(rateOf(b, 2), 1240); assert.equal(rateOf(b, 7), 1240);
});

test('night and late-night bonuses', () => {
  const club = byId('nocturne'), pizza = byId('slice');
  assert.equal(rateOf(club, 0, 12), 1250); assert.equal(rateOf(club, 0, 22), 2500); assert.equal(rateOf(club, 0, 3.5), 2500); assert.equal(rateOf(club, 0, 4), 1250);
  assert.equal(rateOf(pizza, 0, 23), 400); assert.equal(rateOf(pizza, 0, 1), 800);
});

test('the safe fills, caps at half an hour of takings and says when it filled', () => {
  const b = byId('suds'), st = { lvl: 0, safe: 0 };
  assert.equal(capOf(b, 0), 260 * SAFE_MINUTES);
  accrue(st, b, 10); assert.equal(st.safe, 2600);
  let r = accrue(st, b, 19); assert.equal(r.filled, false);
  r = accrue(st, b, 5); assert.equal(r.filled, true); assert.equal(st.safe, capOf(b, 0));
  r = accrue(st, b, 5); assert.equal(r.filled, false); assert.equal(st.safe, capOf(b, 0));
  accrue(st, b, -3); assert.equal(st.safe, capOf(b, 0));
  st.lvl = 2; accrue(st, b, 1); assert.equal(st.safe, capOf(b, 0) + 520);
});

test('buying and upgrading checks', () => {
  assert.deepEqual(canBuy({}, 'suds', 20000), { ok: true, cost: 15000 });
  assert.equal(canBuy({}, 'suds', 1000).ok, false); assert.match(canBuy({}, 'suds', 1000).why, /14,000 more/);
  assert.equal(canBuy({ suds: { lvl: 0, safe: 0 } }, 'suds', 1e6).why, 'You already own it');
  assert.equal(canBuy({}, 'nope', 1e6).ok, false);
  assert.equal(canUpgrade({}, 'suds', 1e6).ok, false);
  assert.deepEqual(canUpgrade({ suds: { lvl: 0, safe: 0 } }, 'suds', 1e6), { ok: true, cost: 6000 });
  assert.equal(canUpgrade({ suds: { lvl: 2, safe: 0 } }, 'suds', 1e6).why, 'Fully upgraded');
  assert.equal(canUpgrade({ suds: { lvl: 1, safe: 0 } }, 'suds', 100).cost, 12000);
});

test('home garages hold a fixed number of cars', () => {
  assert.equal(garageSize('qq'), 3); assert.equal(garageSize('wards'), 0); assert.equal(garageSize('unknown'), 1);
  let r = storeCar([], 'kens', { ti: 4, col: '#b01020', hp: 72.4 });
  assert.ok(r.ok); assert.deepEqual(r.list, [{ ti: 4, col: '#b01020', hp: 72 }]);
  const full = storeCar(r.list, 'kens', { ti: 1, col: '#fff', hp: 100 });
  assert.equal(full.ok, false); assert.match(full.why, /full/);
  assert.match(storeCar([], 'wards', { ti: 1 }).why, /no garage/);
  assert.equal(storeCar([], 'qq', { ti: null }).ok, false);
  assert.equal(storeCar(null, 'qq', { ti: 0, col: '#000', hp: 0 }).list[0].hp, 1);
  const list = [{ ti: 1 }, { ti: 2 }, { ti: 4 }], t = takeCar(list, 1);
  assert.deepEqual(t.car, { ti: 2 }); assert.deepEqual(t.list, [{ ti: 1 }, { ti: 4 }]); assert.equal(list.length, 3);
  assert.equal(takeCar(list, 5).ok, false);
});

test('summary adds up what you own', () => {
  const owned = { suds: { lvl: 0, safe: 1000.7 }, nocturne: { lvl: 1, safe: 50 } };
  assert.deepEqual(summary(owned, 12), { n: 2, safe: 1050, perMin: 260 + 1875 });
  assert.equal(summary(owned, 23).perMin, 260 + 3750);
  assert.deepEqual(summary({}), { n: 0, safe: 0, perMin: 0 });
});
