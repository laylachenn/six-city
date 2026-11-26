// The Lucky Six casino: the rules of every game, with no page code, so they can be unit-tested (node --test tests/).
// Money is handled by the caller: these functions say what a bet returns (stake included), never touch a bankroll.

/* ============================== cards ============================== */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];
export const rankValue = r => r === 'A' ? 1 : (r === 'J' || r === 'Q' || r === 'K') ? 10 : +r;

export function makeShoe(decks = 6, rng = Math.random) {
  const s = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const r of RANKS) s.push({ r, s: suit });
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return s;
}

// best total for a hand; soft = an ace is being counted as 11
export function handValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += rankValue(c.r); if (c.r === 'A') aces++; }
  if (aces && t + 10 <= 21) return { total: t + 10, soft: true };
  return { total: t, soft: false };
}
export const isNatural = cards => cards.length === 2 && handValue(cards).total === 21;

/* ============================== blackjack ==============================
   Six-deck shoe, reshuffled at the cut card (75% through). Dealer stands on soft 17 (option: hit), peeks for blackjack
   under an ace or a ten. Blackjack pays 3:2, insurance 2:1. Double on any first two cards, including after a split.
   Split any two cards of equal value, up to four hands; split aces get one card each and can't be re-split, and 21 on a
   split hand is not a blackjack. Late surrender on the first two cards returns half the bet. */
export class Blackjack {
  constructor({ decks = 6, rng = Math.random, penetration = 0.75, hitSoft17 = false, maxHands = 4, cards = null } = {}) {
    Object.assign(this, { decks, rng, penetration, hitSoft17, maxHands });
    this.fixed = !!cards; // tests stack the deck: cards are dealt in this order and never reshuffled
    this.shoe = cards ? cards.map(c => typeof c === 'string' ? { r: c, s: '♠' } : c) : makeShoe(decks, rng);
    this.pos = 0; this.cut = Math.floor(this.shoe.length * penetration);
    this.state = 'bet'; this.hands = []; this.dealer = []; this.insurance = 0; this.active = 0; this.payout = 0; this.shuffled = false;
  }
  draw() {
    if (this.pos >= this.shoe.length) { if (this.fixed) throw new Error('stacked deck ran out'); this.reshuffle(); }
    return this.shoe[this.pos++];
  }
  reshuffle() { this.shoe = makeShoe(this.decks, this.rng); this.pos = 0; this.cut = Math.floor(this.shoe.length * this.penetration); this.shuffled = true; }
  get hand() { return this.hands[this.active]; }

  deal(bet) {
    if (this.state !== 'bet' && this.state !== 'done') throw new Error('hand in progress');
    if (!(bet > 0)) throw new Error('bet must be positive');
    this.shuffled = false;
    if (!this.fixed && this.pos >= this.cut) this.reshuffle();
    const p = [], d = [];
    p.push(this.draw()); d.push(this.draw()); p.push(this.draw()); d.push(this.draw());
    this.hands = [{ cards: p, bet, done: false, doubled: false, split: false, splitAces: false, surrendered: false }];
    this.dealer = d; this.insurance = 0; this.active = 0; this.payout = 0; this.results = null;
    if (d[0].r === 'A') { this.state = 'insurance'; return this; }
    return this.afterPeek();
  }
  // dealer shows an ace: take insurance (half the bet) or not, then the dealer peeks
  insure(take) {
    if (this.state !== 'insurance') throw new Error('no insurance offered');
    this.insurance = take ? this.hands[0].bet / 2 : 0;
    return this.afterPeek();
  }
  afterPeek() {
    if (isNatural(this.dealer) || isNatural(this.hands[0].cards)) { this.hands[0].done = true; return this.settle(); }
    this.state = 'player'; return this;
  }

  canHit() { return this.state === 'player'; }
  canStand() { return this.state === 'player'; }
  canDouble() { const h = this.hand; return this.state === 'player' && h.cards.length === 2 && !h.splitAces; }
  canSplit() {
    const h = this.hand; return this.state === 'player' && h.cards.length === 2 && !h.splitAces && this.hands.length < this.maxHands &&
      rankValue(h.cards[0].r) === rankValue(h.cards[1].r);
  }
  canSurrender() { return this.state === 'player' && this.hands.length === 1 && this.hand.cards.length === 2; }

  hit() {
    if (!this.canHit()) throw new Error('cannot hit');
    const h = this.hand; h.cards.push(this.draw());
    if (handValue(h.cards).total >= 21) h.done = true;
    return this.next();
  }
  stand() { if (!this.canStand()) throw new Error('cannot stand'); this.hand.done = true; return this.next(); }
  double() {
    if (!this.canDouble()) throw new Error('cannot double');
    const h = this.hand; h.bet *= 2; h.doubled = true; h.cards.push(this.draw()); h.done = true; return this.next();
  }
  split() {
    if (!this.canSplit()) throw new Error('cannot split');
    const h = this.hand, aces = h.cards[0].r === 'A';
    const n = { cards: [h.cards.pop()], bet: h.bet, done: false, doubled: false, split: true, splitAces: aces, surrendered: false };
    h.split = true; h.splitAces = aces;
    h.cards.push(this.draw()); n.cards.push(this.draw());
    this.hands.splice(this.active + 1, 0, n);
    if (aces) { h.done = true; n.done = true; } // one card each on split aces
    else { if (handValue(h.cards).total === 21) h.done = true; if (handValue(n.cards).total === 21) n.done = true; }
    return this.next();
  }
  surrender() { if (!this.canSurrender()) throw new Error('cannot surrender'); this.hand.surrendered = true; this.hand.done = true; return this.next(); }

  next() {
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active < this.hands.length) return this;
    this.active = this.hands.length - 1;
    // the dealer only draws if some hand is still standing
    if (this.hands.some(h => !h.surrendered && handValue(h.cards).total <= 21)) {
      for (;;) { const v = handValue(this.dealer); if (v.total < 17 || (this.hitSoft17 && v.total === 17 && v.soft)) this.dealer.push(this.draw()); else break; }
    }
    return this.settle();
  }
  // what each hand returns, stake included; this.payout is the total (plus any insurance)
  settle() {
    const dv = handValue(this.dealer).total, dn = isNatural(this.dealer), single = this.hands.length === 1;
    this.results = this.hands.map(h => {
      const pv = handValue(h.cards).total, pn = single && !h.split && isNatural(h.cards);
      if (h.surrendered) return { r: 'surrender', ret: h.bet / 2 };
      if (pn && dn) return { r: 'push', ret: h.bet };
      if (pn) return { r: 'blackjack', ret: h.bet * 2.5 };
      if (dn) return { r: 'lose', ret: 0 };
      if (pv > 21) return { r: 'bust', ret: 0 };
      if (dv > 21 || pv > dv) return { r: 'win', ret: h.bet * 2 };
      if (pv === dv) return { r: 'push', ret: h.bet };
      return { r: 'lose', ret: 0 };
    });
    this.insuranceReturn = this.insurance && dn ? this.insurance * 3 : 0;
    this.payout = this.results.reduce((a, x) => a + x.ret, 0) + this.insuranceReturn;
    this.state = 'done'; return this;
  }
  // total chips on the table this round (bets after doubles and splits, plus insurance)
  get staked() { return this.hands.reduce((a, h) => a + h.bet, 0) + this.insurance; }
}

/* ============================== American roulette ==============================
   38 pockets: 0, 00 and 1-36. Even-money bets (red/black, odd/even, 1-18/19-36) and the dozens and columns lose on 0 and 00. */
export const POCKETS = ['0', '00', ...Array.from({ length: 36 }, (_, i) => String(i + 1))];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const pocketColor = p => (p === '0' || p === '00') ? 'green' : REDS.has(+p) ? 'red' : 'black';
export const spinRoulette = (rng = Math.random) => POCKETS[Math.floor(rng() * POCKETS.length)];
// bet: {type, value, amount}; types: straight (value '0' | '00' | '1'..'36'), red, black, odd, even, low, high, dozen (1-3), column (1-3)
export function roulettePayout(bet, pocket) {
  const a = bet.amount, n = (pocket === '0' || pocket === '00') ? 0 : +pocket;
  switch (bet.type) {
    case 'straight': return String(bet.value) === pocket ? a * 36 : 0;
    case 'red': return n && REDS.has(n) ? a * 2 : 0;
    case 'black': return n && !REDS.has(n) ? a * 2 : 0;
    case 'odd': return n && n % 2 === 1 ? a * 2 : 0;
    case 'even': return n && n % 2 === 0 ? a * 2 : 0;
    case 'low': return n >= 1 && n <= 18 ? a * 2 : 0;
    case 'high': return n >= 19 ? a * 2 : 0;
    case 'dozen': return n && Math.ceil(n / 12) === +bet.value ? a * 3 : 0;
    case 'column': return n && ((n - 1) % 3) + 1 === +bet.value ? a * 3 : 0;
    default: throw new Error('unknown bet ' + bet.type);
  }
}

/* ============================== slots ==============================
   Three reels with the same weighted strip; pays on the line. Three of a kind pays the table below; any two cherries pay 2×,
   a single cherry on the first reel gets your bet back. Return to player ≈ 93% (checked in the tests). */
export const SLOT_SYMBOLS = [
  { s: '🍒', w: 7, three: 4 },
  { s: '🍋', w: 6, three: 6 },
  { s: '🔔', w: 4, three: 12 },
  { s: '▬', w: 3, three: 25 },
  { s: '7', w: 2, three: 60 },
  { s: '💎', w: 1, three: 250 },
];
const SLOT_W = SLOT_SYMBOLS.reduce((a, x) => a + x.w, 0);
export function spinReel(rng = Math.random) { let t = rng() * SLOT_W; for (const x of SLOT_SYMBOLS) { if ((t -= x.w) < 0) return x.s; } return SLOT_SYMBOLS[0].s; }
export const spinSlots = (rng = Math.random) => [spinReel(rng), spinReel(rng), spinReel(rng)];
// multiplier of the bet returned for a line
export function slotMultiplier(line) {
  if (line[0] === line[1] && line[1] === line[2]) return SLOT_SYMBOLS.find(x => x.s === line[0]).three;
  const ch = line.filter(s => s === '🍒').length;
  if (ch === 2) return 2;
  if (line[0] === '🍒') return 1;
  return 0;
}
export function slotRTP() {
  let rtp = 0;
  for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS)
    rtp += (a.w * b.w * c.w) / SLOT_W ** 3 * slotMultiplier([a.s, b.s, c.s]);
  return rtp;
}

/* ============================== Lucky Wheel ==============================
   One free spin per in-game day (12 real minutes). 20 equal segments. */
export const WHEEL = [
  { label: '500 chips', kind: 'chips', amount: 500 }, { label: '$1,000', kind: 'cash', amount: 1000 }, { label: 'Body armour', kind: 'armour' },
  { label: '1,000 chips', kind: 'chips', amount: 1000 }, { label: '200 chips', kind: 'chips', amount: 200 }, { label: '$2,500', kind: 'cash', amount: 2500 },
  { label: '500 chips', kind: 'chips', amount: 500 }, { label: 'Mystery', kind: 'mystery' }, { label: '2,500 chips', kind: 'chips', amount: 2500 },
  { label: '200 chips', kind: 'chips', amount: 200 }, { label: 'SUPERCAR', kind: 'car' }, { label: '1,000 chips', kind: 'chips', amount: 1000 },
  { label: '$1,000', kind: 'cash', amount: 1000 }, { label: '500 chips', kind: 'chips', amount: 500 }, { label: 'Body armour', kind: 'armour' },
  { label: '5,000 chips', kind: 'chips', amount: 5000 }, { label: '200 chips', kind: 'chips', amount: 200 }, { label: 'Mystery', kind: 'mystery' },
  { label: '1,000 chips', kind: 'chips', amount: 1000 }, { label: '$5,000', kind: 'cash', amount: 5000 },
];
export const spinWheel = (rng = Math.random) => Math.floor(rng() * WHEEL.length);
export const WHEEL_COOLDOWN_MS = 12 * 60 * 1000;
