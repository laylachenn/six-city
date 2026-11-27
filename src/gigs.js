// Side jobs ("gigs"): rideshare fares in any car, food delivery on two wheels. The rules live here with no page code,
// so they can be unit-tested (node --test tests/). The page (src/game/27-gigs.js) finds the riders and restaurants,
// runs the trip and draws it; the Gigs app on the phone (K) is where you go online.
//
// A trip is scored when it ends: late arrival, damage to the vehicle (or the food), and picking up a wanted level
// each cost stars. Stars decide the tip, and your rating is the average of your last RATING_N trips.

export const RATING_N = 20;          // trips the rating is averaged over
export const STREAK_EVERY = 5;       // a bonus every this many 4+ star trips in a row
export const ROUTE = 1.35;           // streets wind: real distance is about this much longer than a straight line

export const KINDS = {
  ride: { name: 'Rideshare', icon: '🚗', speed: 11, slack: 25, base: 30, perM: 0.9, lo: 300, hi: 900 },
  food: { name: 'Food delivery', icon: '🛵', speed: 7, slack: 30, base: 20, perM: 0.7, lo: 220, hi: 650 },
};
// rider moods: rush pays more and tips more but gives less time; nervous riders mind every bump
export const MOODS = {
  calm: { time: 1, tip: 1, bumps: 1, label: '' },
  rush: { time: 0.72, tip: 1.6, bumps: 1, label: 'in a hurry' },
  nervous: { time: 1.15, tip: 1.3, bumps: 2.2, label: 'a nervous passenger' },
};

const r10 = v => Math.round(v / 5) * 5;

// what a trip pays before the tip, from the straight-line distance between pickup and drop-off (metres)
export function fare(kind, dist, mood = 'calm') {
  const K = KINDS[kind];
  return r10((K.base + dist * K.perM) * (mood === 'rush' ? 1.25 : 1));
}
// seconds you get for the drop-off leg (the pickup has no limit; riders just give up after a while)
export function timeLimit(kind, dist, mood = 'calm', bike = false) {
  const K = KINDS[kind], m = MOODS[mood] || MOODS.calm, speed = kind === 'food' && bike ? 6 : K.speed;
  return Math.round((dist * ROUTE / speed + K.slack) * m.time);
}

// stars from how the trip went. late: seconds over the limit; damage: hp lost (car hp or bike hp, 0-100);
// heat: wanted levels gained on the way; bumps: hard hits (each one jolts the rider or spills the food)
export function stars({ late = 0, damage = 0, heat = 0, bumps = 0 }, mood = 'calm') {
  const m = MOODS[mood] || MOODS.calm;
  let s = 5;
  if (late > 0) s -= 1 + Math.floor(late / 20);            // 1 star for being late at all, another every 20 s
  s -= Math.floor(damage / 15);                             // a star per 15% of damage
  s -= Math.floor(bumps * m.bumps / 3);                     // three bumps (fewer for a nervous rider) cost a star
  s -= heat * 2;                                            // cops make riders very unhappy
  return Math.max(1, Math.min(5, s));
}
export function tip(base, s, mood = 'calm') {
  const m = MOODS[mood] || MOODS.calm, pct = [0, 0, 0, 0, 0.1, 0.25][s] || 0;
  return r10(base * pct * m.tip);
}
// the streak bonus paid when this trip completes a run of STREAK_EVERY good trips (0 otherwise)
export function streakBonus(streak) { return streak > 0 && streak % STREAK_EVERY === 0 ? 50 * streak : 0; }

// the profile kept in the save: {trips, food, rides, earned, best, streak, ratings: [last RATING_N star counts]}
export function newProfile() { return { trips: 0, rides: 0, food: 0, earned: 0, streak: 0, best: 0, ratings: [] }; }
export function rating(P) { if (!P || !P.ratings.length) return 5; return Math.round(P.ratings.reduce((a, b) => a + b, 0) / P.ratings.length * 100) / 100; }
// record a finished trip, return what it paid: {base, tip, bonus, total, stars}
export function finish(P, kind, base, s, mood) {
  const t = tip(base, s, mood);
  P.trips++; P[kind === 'food' ? 'food' : 'rides']++;
  P.ratings.push(s); if (P.ratings.length > RATING_N) P.ratings.shift();
  P.streak = s >= 4 ? P.streak + 1 : 0; P.best = Math.max(P.best, P.streak);
  const bonus = streakBonus(P.streak), total = base + t + bonus;
  P.earned += total;
  return { base, tip: t, bonus, total, stars: s };
}
// a cancelled trip (rider bailed, food went cold) counts as one star and breaks the streak
export function cancel(P) { P.ratings.push(1); if (P.ratings.length > RATING_N) P.ratings.shift(); P.streak = 0; }
// below this rating the app pauses offers for a while
export const LOW_RATING = 3;

// which shops in the address book are places that do takeout
const FOODRE = /pizza|sushi|\bpho\b|caf[eé]|tim hortons|mcdonald|burger|shawarma|thai|kitchen|grill|restaurant|ramen|taco|wings|noodle|\bdeli\b|bakery|^subway$|chicken|starbucks|diner|bistro|curry|dumpling|poke|bbq|bagel|popeyes|wendy|harvey|a&w|kfc|pita|falafel|burrito|chipotle|freshii|sandwich|bubble tea|chatime|coffee|donut|doughnut|patty|roti|jerk|biryani|kebab|hakka|dim sum|bao|pasta|trattoria|osteria|taqueria|brunch|breakfast/i;
export const isFood = name => FOODRE.test(name || '');

// pick a place from list ([{x, z, ...}]) between lo and hi metres from (x, z); ok(p) can veto a place.
// rnd is a 0-1 random function. Returns null when nothing fits.
export function pickWithin(list, x, z, lo, hi, rnd = Math.random, ok = () => true) {
  const c = [];
  for (const p of list) { const d = Math.hypot(p.x - x, p.z - z); if (d >= lo && d <= hi) c.push(p); }
  for (let t = 0; t < 30 && c.length; t++) { const i = Math.floor(rnd() * c.length), p = c[i]; if (ok(p)) return p; c.splice(i, 1); }
  return null;
}

// "344 Bathurst Street" -> "344 Bathurst St"
const SHORT = { Street: 'St', Avenue: 'Ave', Road: 'Rd', Boulevard: 'Blvd', Drive: 'Dr', Crescent: 'Cres', Court: 'Ct', Place: 'Pl', Lane: 'Ln', Square: 'Sq', Terrace: 'Terr', Parkway: 'Pkwy', Circle: 'Circ', Gardens: 'Gdns', East: 'E', West: 'W', North: 'N', South: 'S' };
export const shortAddr = a => String(a || '').split(' ').map(w => SHORT[w] || w).join(' ');

export const RIDERS = ['Priya', 'Marcus', 'Mei', 'Tariq', 'Sofia', 'Jordan', 'Aisha', 'Dmitri', 'Grace', 'Kwame', 'Leila', 'Mateo', 'Hana', 'Owen', 'Fatima', 'Raj', 'Chloe', 'Andre', 'Yuki', 'Nadia', 'Liam', 'Zara', 'Bao', 'Camila'];
// things riders say on the way: the first line when they get in, then one or two more
export const CHAT = {
  calm: ['Thanks for grabbing me!', 'You can put the radio on if you want.', 'This city never stops building condos, eh?', 'Did you see the Leafs last night? Brutal.', 'I love this street in the fall.', 'Honestly the TTC would have been faster. Kidding!'],
  rush: ['I am SO late, please hurry!', 'Can you take the Gardiner? No? Whatever is fastest!', 'My meeting started five minutes ago...', 'Every light is red today, I swear.', 'If I miss this I am getting fired. No pressure.'],
  nervous: ['Could you maybe... slow down a little?', 'Watch the streetcar tracks, please.', 'I get carsick. Just so you know.', 'Oh god. OK. OK. We are fine.', 'Two hands on the wheel, please.'],
  bump: ['Ow! Hey!', 'Seriously?!', 'My coffee!', 'Is this how you always drive?', "I'm giving you one star for that."],
  cops: ["Uh, why are the cops behind us?!", "I didn't sign up for a police chase!", 'Let me out. LET ME OUT.'],
};
