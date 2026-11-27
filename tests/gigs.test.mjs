// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as GG from '../src/gigs.js';

test('fares grow with distance, round to $5, and rush riders pay more', () => {
  const a = GG.fare('ride', 300), b = GG.fare('ride', 900);
  assert.ok(b > a); assert.equal(a % 5, 0); assert.equal(b % 5, 0);
  assert.ok(GG.fare('ride', 600, 'rush') > GG.fare('ride', 600));
  assert.ok(GG.fare('food', 600) < GG.fare('ride', 600));
});

test('time limits: longer trips get longer, rush less, a pedal bike gets more than a motorcycle', () => {
  assert.ok(GG.timeLimit('ride', 900) > GG.timeLimit('ride', 300));
  assert.ok(GG.timeLimit('ride', 600, 'rush') < GG.timeLimit('ride', 600));
  assert.ok(GG.timeLimit('food', 400, 'calm', true) > GG.timeLimit('food', 400, 'calm', false));
  // a 600 m ride at a reasonable city pace is doable: about 1:40
  const t = GG.timeLimit('ride', 600); assert.ok(t > 80 && t < 120, String(t));
});

test('stars: a clean trip is five, lateness, damage, bumps and cops cost stars, never below one', () => {
  assert.equal(GG.stars({}), 5);
  assert.equal(GG.stars({ late: 1 }), 4);
  assert.equal(GG.stars({ late: 45 }), 2);
  assert.equal(GG.stars({ damage: 30 }), 3);
  assert.equal(GG.stars({ bumps: 3 }), 4);
  assert.equal(GG.stars({ bumps: 2 }, 'nervous'), 4);   // nervous riders mind bumps more
  assert.equal(GG.stars({ bumps: 2 }), 5);
  assert.equal(GG.stars({ heat: 1 }), 3);
  assert.equal(GG.stars({ late: 200, damage: 90, heat: 3 }), 1);
});

test('tips: none under four stars, more for five and for rush riders', () => {
  assert.equal(GG.tip(200, 3), 0);
  assert.equal(GG.tip(200, 4), 20);
  assert.equal(GG.tip(200, 5), 50);
  assert.equal(GG.tip(200, 5, 'rush'), 80);
});

test('profile: rating averages recent trips, streaks pay a bonus every five good trips and reset on a bad one', () => {
  const P = GG.newProfile();
  assert.equal(GG.rating(P), 5);
  let last;
  for (let i = 0; i < 5; i++) last = GG.finish(P, 'ride', 100, 5);
  assert.equal(P.streak, 5); assert.equal(last.bonus, 250); assert.equal(last.total, 100 + 25 + 250);
  GG.finish(P, 'food', 100, 2);
  assert.equal(P.streak, 0); assert.equal(P.best, 5); assert.equal(P.rides, 5); assert.equal(P.food, 1); assert.equal(P.trips, 6);
  assert.equal(GG.rating(P), 4.5);
  GG.cancel(P); assert.equal(P.ratings.length, 7); assert.equal(P.ratings.at(-1), 1);
  for (let i = 0; i < 30; i++) GG.finish(P, 'ride', 50, 4);
  assert.equal(P.ratings.length, GG.RATING_N); assert.equal(GG.rating(P), 4);
  assert.equal(P.earned, 5 * 125 + 250 + 100 + 30 * 55 + [5, 10, 15, 20, 25, 30].reduce((a, k) => a + 50 * k, 0));
});

test('takeout places from the address book', () => {
  for (const n of ['Tim Hortons', "McDonald's", 'Pizza Pizza', 'Banh Mi Boys Kitchen', 'Subway', 'Nord Lyon Cafe', 'Pho Hung']) assert.ok(GG.isFood(n), n);
  for (const n of ['RBC Royal Bank', 'Shoppers Drug Mart', 'Randolph Theatre', 'TD', 'Subway Station']) assert.ok(!GG.isFood(n), n);
});

test('pickWithin: only places in the ring, honours the veto, null when nothing fits', () => {
  const L = [{ x: 10, z: 0 }, { x: 500, z: 0 }, { x: 0, z: 700 }, { x: 2000, z: 0 }];
  for (let i = 0; i < 20; i++) { const p = GG.pickWithin(L, 0, 0, 300, 900); assert.ok(p === L[1] || p === L[2]); }
  assert.equal(GG.pickWithin(L, 0, 0, 300, 900, Math.random, p => p.z > 0), L[2]);
  assert.equal(GG.pickWithin(L, 0, 0, 3000, 4000), null);
  assert.equal(GG.pickWithin(L, 0, 0, 300, 900, Math.random, () => false), null);
});

test('short addresses', () => {
  assert.equal(GG.shortAddr('344 Bathurst Street'), '344 Bathurst St');
  assert.equal(GG.shortAddr('250 Queen Street West'), '250 Queen St W');
  assert.equal(GG.shortAddr(''), '');
});
