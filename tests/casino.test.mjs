// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Blackjack, handValue, isNatural, makeShoe,
  POCKETS, pocketColor, roulettePayout, spinRoulette,
  SLOT_SYMBOLS, slotMultiplier, slotRTP, spinSlots, WHEEL, spinWheel,
} from '../src/casino.js';

// stacked deck helper: deal order is player, dealer (up), player, dealer (hole), then hits in order
const deck = (...r) => r.map(x => ({ r: x, s: '♠' }));
const H = (...r) => deck(...r);

test('hand values: hard, soft and multiple aces', () => {
  assert.deepEqual(handValue(H('10', '7')), { total: 17, soft: false });
  assert.deepEqual(handValue(H('A', '6')), { total: 17, soft: true });
  assert.deepEqual(handValue(H('A', '6', '10')), { total: 17, soft: false });
  assert.deepEqual(handValue(H('A', 'A', '9')), { total: 21, soft: true });
  assert.deepEqual(handValue(H('A', 'A', 'A', 'A')), { total: 14, soft: true });
  assert.deepEqual(handValue(H('K', 'Q', '5')), { total: 25, soft: false });
  assert.ok(isNatural(H('A', 'K')));
  assert.ok(!isNatural(H('A', '5', '5')));
});

test('a six-deck shoe has 312 cards, 24 of each rank', () => {
  const s = makeShoe(6);
  assert.equal(s.length, 312);
  assert.equal(s.filter(c => c.r === 'Q').length, 24);
});

test('player blackjack pays 3:2 and ends the hand at once', () => {
  const g = new Blackjack({ cards: deck('A', '9', 'K', '7') }).deal(100);
  assert.equal(g.state, 'done');
  assert.equal(g.results[0].r, 'blackjack');
  assert.equal(g.payout, 250);
});

test('player and dealer blackjack push', () => {
  const g = new Blackjack({ cards: deck('A', 'K', 'Q', 'A') }).deal(100);
  assert.equal(g.results[0].r, 'push');
  assert.equal(g.payout, 100);
});

test('dealer peeks under a ten: dealer blackjack takes the bet before you act', () => {
  const g = new Blackjack({ cards: deck('9', 'K', '9', 'A') }).deal(50);
  assert.equal(g.state, 'done');
  assert.equal(g.results[0].r, 'lose');
  assert.equal(g.payout, 0);
});

test('ace up: insurance is offered and pays 2:1 when the dealer has blackjack', () => {
  const g = new Blackjack({ cards: deck('10', 'A', '9', 'K') }).deal(100);
  assert.equal(g.state, 'insurance');
  g.insure(true);
  assert.equal(g.state, 'done');
  assert.equal(g.insurance, 50);
  assert.equal(g.payout, 150); // hand lost, insurance 50 returns 150
});

test('ace up: declined insurance, no dealer blackjack, play goes on', () => {
  const g = new Blackjack({ cards: deck('10', 'A', '9', '6', '5') }).deal(100);
  g.insure(false);
  assert.equal(g.state, 'player');
  g.stand(); // dealer soft 17 stands
  assert.equal(handValue(g.dealer).total, 17);
  assert.equal(g.results[0].r, 'win'); // 19 beats 17
  assert.equal(g.payout, 200);
});

test('lost insurance is forfeited when the dealer has no blackjack', () => {
  const g = new Blackjack({ cards: deck('10', 'A', '8', '7') }).deal(100);
  g.insure(true);
  g.stand();
  assert.equal(g.insuranceReturn, 0);
  assert.equal(g.results[0].r, 'push'); // 18 vs soft 18
  assert.equal(g.staked, 150);
});

test('busting loses even if the dealer would bust too, and the dealer does not draw', () => {
  const g = new Blackjack({ cards: deck('10', '6', '6', '10', 'K') }).deal(100);
  g.hit();
  assert.equal(g.results[0].r, 'bust');
  assert.equal(g.dealer.length, 2);
  assert.equal(g.payout, 0);
});

test('dealer busts: standing hands win even money', () => {
  const g = new Blackjack({ cards: deck('10', '6', '2', '10', 'K') }).deal(100);
  g.stand();
  assert.ok(handValue(g.dealer).total > 21);
  assert.equal(g.results[0].r, 'win');
  assert.equal(g.payout, 200);
});

test('equal totals push', () => {
  const g = new Blackjack({ cards: deck('10', '10', '8', '8') }).deal(40);
  g.stand();
  assert.equal(g.results[0].r, 'push');
  assert.equal(g.payout, 40);
});

test('hitting to 21 stands automatically', () => {
  const g = new Blackjack({ cards: deck('5', '10', '6', '7', 'K') }).deal(10);
  g.hit();
  assert.equal(g.state, 'done');
  assert.equal(g.results[0].r, 'win');
});

test('double: bet doubles, exactly one card, then the hand stands', () => {
  const g = new Blackjack({ cards: deck('6', '10', '5', '7', '10') }).deal(100);
  assert.ok(g.canDouble());
  g.double();
  assert.equal(g.hands[0].cards.length, 3);
  assert.equal(g.hands[0].bet, 200);
  assert.equal(g.results[0].r, 'win'); // 21 vs 17
  assert.equal(g.payout, 400);
});

test('no doubling after a hit', () => {
  const g = new Blackjack({ cards: deck('2', '10', '3', '7', '2') }).deal(10);
  g.hit();
  assert.ok(!g.canDouble());
  assert.throws(() => g.double());
});

test('split: two hands with their own bets, played left to right', () => {
  // player 8,8 vs dealer 10/7; hands get 3 and 10
  const g = new Blackjack({ cards: deck('8', '10', '8', '7', '3', '10') }).deal(100);
  assert.ok(g.canSplit());
  g.split();
  assert.equal(g.hands.length, 2);
  assert.equal(g.active, 0);
  assert.deepEqual(g.hands[0].cards.map(c => c.r), ['8', '3']);
  assert.deepEqual(g.hands[1].cards.map(c => c.r), ['8', '10']);
  g.stand(); // 11 stands (bad play, simple test)
  g.stand(); // 18
  assert.equal(g.results[0].r, 'lose');
  assert.equal(g.results[1].r, 'win');
  assert.equal(g.staked, 200);
  assert.equal(g.payout, 200);
});

test('ten-value cards of different rank can be split', () => {
  const g = new Blackjack({ cards: deck('K', '9', 'J', '7') }).deal(10);
  assert.ok(g.canSplit());
});

test('double after split is allowed', () => {
  const g = new Blackjack({ cards: deck('8', '10', '8', '7', '3', '10', '10') }).deal(100);
  g.split();
  assert.ok(g.canDouble());
  g.double(); // 8,3 + 10 = 21
  g.stand();  // 8,10 = 18
  assert.equal(g.hands[0].bet, 200);
  assert.equal(g.results[0].r, 'win');
  assert.equal(g.payout, 400 + 200);
});

test('split aces get one card each, cannot be re-split, and 21 is not a blackjack', () => {
  const g = new Blackjack({ cards: deck('A', '9', 'A', '8', 'K', 'A') }).deal(100);
  g.split();
  assert.equal(g.state, 'done');
  assert.equal(g.hands[0].cards.length, 2);
  assert.equal(g.hands[1].cards.length, 2);
  assert.equal(g.results[0].r, 'win'); // A,K = 21 pays 1:1, not 3:2
  assert.equal(g.results[0].ret, 200);
});

test('split aces: the second hand of A,A counts as 12 and loses to 17', () => {
  const g = new Blackjack({ cards: deck('A', '9', 'A', '8', 'K', 'A') }).deal(100);
  g.split();
  // hands[1] = A + A = soft 12; dealer 17
  assert.equal(handValue(g.hands[1].cards).total, 12);
  assert.equal(g.results[1].r, 'lose');
});

test('re-splits stop at four hands', () => {
  const g = new Blackjack({ cards: deck('8', '10', '8', '7', '8', '8', '8', '2', '2', '2', '2', '2') }).deal(10);
  g.split(); assert.equal(g.hands.length, 2); // hand0 = 8,8
  g.split(); assert.equal(g.hands.length, 3); // hand0 = 8,8 again
  g.split(); assert.equal(g.hands.length, 4);
  assert.ok(!g.canSplit());
});

test('late surrender returns half the bet; not available after a hit or a split', () => {
  const g = new Blackjack({ cards: deck('10', '10', '6', '7') }).deal(100);
  assert.ok(g.canSurrender());
  g.surrender();
  assert.equal(g.results[0].r, 'surrender');
  assert.equal(g.payout, 50);
  const h = new Blackjack({ cards: deck('8', '10', '8', '7', '2', '2') }).deal(10);
  h.split();
  assert.ok(!h.canSurrender());
});

test('dealer stands on soft 17 by default, hits it when configured', () => {
  const s = new Blackjack({ cards: deck('10', 'A', '8', '6', '4') });
  s.deal(10); s.insure(false); s.stand();
  assert.equal(s.dealer.length, 2);
  const h = new Blackjack({ cards: deck('10', 'A', '8', '6', '4'), hitSoft17: true });
  h.deal(10); h.insure(false); h.stand();
  assert.equal(h.dealer.length, 3); // A,6 + 4 = 21
  assert.equal(h.results[0].r, 'lose');
});

test('actions throw when not allowed', () => {
  const g = new Blackjack({ cards: deck('A', '9', 'K', '7') });
  assert.throws(() => g.hit());
  g.deal(10);
  assert.throws(() => g.stand()); // hand already over (blackjack)
  assert.throws(() => new Blackjack().deal(0));
});

test('the shoe is reshuffled once the cut card is reached', () => {
  let seed = 1; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = new Blackjack({ rng, decks: 1 });
  let reshuffles = 0;
  for (let i = 0; i < 60; i++) {
    g.deal(10);
    if (g.shuffled) reshuffles++;
    if (g.state === 'insurance') g.insure(false);
    while (g.state === 'player') g.stand();
    assert.ok(g.pos <= g.shoe.length);
  }
  assert.ok(reshuffles >= 5, 'reshuffled ' + reshuffles);
});

test('a long simulated session never loses or creates chips by accident', () => {
  let seed = 7; const rng = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const g = new Blackjack({ rng });
  for (let i = 0; i < 3000; i++) {
    g.deal(10);
    if (g.state === 'insurance') g.insure(rng() < .3);
    while (g.state === 'player') {
      const v = handValue(g.hand.cards).total, r = rng();
      if (g.canSplit() && r < .3) g.split(); else if (g.canDouble() && v >= 9 && v <= 11) g.double(); else if (v < 17) g.hit(); else g.stand();
    }
    assert.equal(g.state, 'done');
    for (const [k, x] of g.results.entries()) {
      const b = g.hands[k].bet;
      assert.ok([0, b / 2, b, b * 2, b * 2.5].includes(x.ret), `return ${x.ret} on bet ${b}`);
    }
  }
});

test('roulette: 38 pockets, colours and every bet type', () => {
  assert.equal(POCKETS.length, 38);
  assert.equal(pocketColor('0'), 'green');
  assert.equal(pocketColor('00'), 'green');
  assert.equal(pocketColor('1'), 'red');
  assert.equal(pocketColor('2'), 'black');
  assert.equal(POCKETS.filter(p => pocketColor(p) === 'red').length, 18);
  const b = (type, value) => ({ type, value, amount: 10 });
  assert.equal(roulettePayout(b('straight', '17'), '17'), 360);
  assert.equal(roulettePayout(b('straight', '00'), '00'), 360);
  assert.equal(roulettePayout(b('straight', '0'), '00'), 0);
  assert.equal(roulettePayout(b('red'), '3'), 20);
  assert.equal(roulettePayout(b('black'), '3'), 0);
  assert.equal(roulettePayout(b('odd'), '0'), 0);
  assert.equal(roulettePayout(b('even'), '00'), 0);
  assert.equal(roulettePayout(b('low'), '18'), 20);
  assert.equal(roulettePayout(b('high'), '19'), 20);
  assert.equal(roulettePayout(b('dozen', 2), '24'), 30);
  assert.equal(roulettePayout(b('dozen', 3), '24'), 0);
  assert.equal(roulettePayout(b('column', 1), '34'), 30);
  assert.equal(roulettePayout(b('column', 3), '36'), 30);
  assert.equal(roulettePayout(b('column', 1), '0'), 0);
  assert.throws(() => roulettePayout(b('corner'), '1'));
});

test('roulette house edge is 5.26% on every bet type', () => {
  for (const bet of [['straight', '7'], ['red'], ['black'], ['odd'], ['even'], ['low'], ['high'], ['dozen', 1], ['column', 2]]) {
    const ret = POCKETS.reduce((a, p) => a + roulettePayout({ type: bet[0], value: bet[1], amount: 1 }, p), 0) / 38;
    assert.ok(Math.abs(ret - 36 / 38) < 1e-9, bet[0] + ' ' + ret);
  }
  for (let i = 0; i < 200; i++) assert.ok(POCKETS.includes(spinRoulette()));
});

test('slots: paytable and a fair-but-house-favoured return', () => {
  assert.equal(slotMultiplier(['💎', '💎', '💎']), 250);
  assert.equal(slotMultiplier(['7', '7', '7']), 60);
  assert.equal(slotMultiplier(['🍒', '🍒', '🍒']), 4);
  assert.equal(slotMultiplier(['🍒', '🍋', '🍒']), 2);
  assert.equal(slotMultiplier(['🍒', '🔔', '7']), 1);
  assert.equal(slotMultiplier(['🔔', '🍒', '7']), 0);
  assert.equal(slotMultiplier(['🔔', '7', '💎']), 0);
  const rtp = slotRTP();
  assert.ok(rtp > 0.88 && rtp < 0.98, 'rtp ' + rtp);
  for (let i = 0; i < 100; i++) assert.ok(spinSlots().every(s => SLOT_SYMBOLS.some(x => x.s === s)));
});

test('lucky wheel: 20 segments, every spin lands on one', () => {
  assert.equal(WHEEL.length, 20);
  for (let i = 0; i < 200; i++) { const k = spinWheel(); assert.ok(k >= 0 && k < 20); }
  assert.equal(WHEEL[spinWheel(() => 0.999999)], WHEEL[19]);
});
