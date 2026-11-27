// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, byId, stock, sells, owns, buy, nextOwned } from '../src/fashion.js';

test('catalog entries are complete and ids unique', () => {
  const ids = new Set();
  for (const it of CATALOG) {
    assert.ok(!ids.has(it.id), it.id); ids.add(it.id);
    assert.ok(['top', 'bottom', 'jacket', 'shoes', 'hair'].includes(it.slot));
    assert.ok(it.price > 0 && Number.isInteger(it.price));
    assert.ok(typeof it.c === 'number' && it.n);
    if (it.slot === 'top') for (const k of ['sl', 'crop', 'acc']) assert.ok(k in it, `${it.id} ${k}`);
    if (it.slot === 'bottom') for (const k of ['den', 'sh']) assert.ok(k in it, `${it.id} ${k}`);
  }
  assert.equal(byId('puffer').slot, 'jacket'); assert.equal(byId('nope'), null);
});

test('each kind of shop sells its own things', () => {
  assert.deepEqual(sells('barber'), ['hair']); assert.deepEqual(sells('shoes'), ['shoes']); assert.deepEqual(sells('cafe'), []);
  assert.ok(stock('fashion', 'jacket').length >= 4);
  assert.equal(stock('shoes', 'top').length, 0);
  assert.ok(stock('barber', 'hair').every(i => i.slot === 'hair'));
});

test('buying', () => {
  assert.deepEqual(buy([], 'hoodie', 100), { ok: true, cost: 65, closet: ['hoodie'] });
  const c = ['hoodie'];
  assert.equal(buy(c, 'hoodie', 1e6).why, 'You already own it');
  assert.equal(buy(c, 'trench', 100).why, 'You need $420 more');
  assert.equal(buy(null, 'x', 1e6).ok, false);
  buy(c, 'jersey', 1e6); assert.deepEqual(c, ['hoodie'], 'never mutates');
});

test('owning: base pieces (no id) are always yours', () => {
  assert.equal(owns([], { n: 'Blue jeans' }), true);
  assert.equal(owns([], byId('cargo')), false);
  assert.equal(owns(['cargo'], byId('cargo')), true);
  assert.equal(owns(undefined, undefined), true);
});

test('cycling the wardrobe skips what you have not bought', () => {
  const L = [{ n: 'a' }, { n: 'b' }, { id: 'x', n: 'x' }, { id: 'y', n: 'y' }];
  assert.equal(nextOwned(L, 1, 1, []), 0, 'wraps past the locked ones');
  assert.equal(nextOwned(L, 1, 1, ['y']), 3);
  assert.equal(nextOwned(L, 0, -1, ['x']), 2);
  // optional slot: -1 is "none"
  assert.equal(nextOwned(L.slice(2), -1, 1, [], true), -1, 'nothing owned: stays on none');
  assert.equal(nextOwned(L.slice(2), -1, 1, ['y'], true), 1);
  assert.equal(nextOwned(L.slice(2), 1, 1, ['y'], true), -1);
  assert.equal(nextOwned(L.slice(2), undefined, -1, ['x'], true), 0);
});
