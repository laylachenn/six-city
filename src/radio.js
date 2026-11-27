// Six City radio: the stations, the songs they play and what the DJs say, with no page code, so it can be unit-tested
// (node --test tests/). Songs are made up on the spot from a seed: the same station and song number always give the same
// song, so a station keeps "playing" while you're out of the car and you tune back in wherever it has got to.
// The page (index.html) turns a song into sound with Web Audio and reads DJ lines out with speech synthesis.

/* ============================== helpers ============================== */
export function rng32(seed) { // mulberry32: small, fast, seedable
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
export const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
};
// a chord on a scale degree (0-based), stacked in thirds from the scale: 3 notes, or 4 for sevenths
export function chordOn(scale, deg, notes = 3) {
  const out = [];
  for (let k = 0; k < notes; k++) { const d = deg + k * 2; out.push(scale[d % 7] + 12 * Math.floor(d / 7)); }
  return out;
}

/* ============================== stations ==============================
   style: drum patterns are 16 steps a bar (1 = hit, a fraction = a softer hit). progs are scale degrees, one chord a bar. */
const KICKS = {
  boombap: [[1, 0, 0, 0, 0, 0, 0, .6, 0, 0, 1, 0, 0, 0, 0, 0], [1, 0, 0, .5, 0, 0, 0, 0, 1, 0, .7, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, .6, 0, 0, .7, 1, 0, 0, 0, 0, 0]],
  rock: [[1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, .6, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, .6, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, .5, 0]],
  four: [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
  lofi: [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, .5, 0, 0, .8, 0, 0, 0, 0, 0]],
};
const SNARES = {
  backbeat: [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, .4]],
  lofi: [[0, 0, 0, 0, .8, 0, 0, 0, 0, 0, 0, 0, .8, 0, 0, 0], [0, 0, 0, 0, .8, 0, 0, .3, 0, 0, 0, 0, .8, 0, 0, 0]],
};
const HATS = {
  eighths: [.7, 0, .4, 0, .7, 0, .4, 0, .7, 0, .4, 0, .7, 0, .4, 0],
  sixteenths: [.6, .25, .4, .25, .6, .25, .4, .25, .6, .25, .4, .25, .6, .25, .4, .3],
  offbeat: [0, 0, .7, 0, 0, 0, .7, 0, 0, 0, .7, 0, 0, 0, .7, 0],
  trap: [.6, .3, .5, .3, .6, .3, .5, .3, .6, .3, .5, .3, .6, .4, .5, .4],
};

export const STATIONS = [
  { id: 'northside', name: 'Northside 96.6', tag: 'hip-hop from the six', voice: { pitch: .8, rate: 1.05 },
    bpm: [80, 94], swing: .35, scales: ['minor', 'dorian', 'phrygian'], root: [34, 41],
    progs: [[0, 0, 5, 6], [0, 3, 5, 4], [0, 5, 3, 4], [0, 6, 5, 6]], sevenths: false,
    kick: KICKS.boombap, snare: SNARES.backbeat, hats: [HATS.eighths, HATS.trap], bass: '808', pad: 'keys', lead: 'bell', leadDensity: .32 },
  { id: 'lakeshore', name: 'Lakeshore 101.7', tag: 'indie and rock', voice: { pitch: 1.1, rate: 1.1 },
    bpm: [116, 136], swing: 0, scales: ['major', 'mixolydian'], root: [38, 45],
    progs: [[0, 4, 5, 3], [0, 3, 0, 4], [5, 3, 0, 4], [0, 6, 3, 0]], sevenths: false,
    kick: KICKS.rock, snare: SNARES.backbeat, hats: [HATS.eighths], bass: 'pick', pad: 'strum', lead: 'guitar', leadDensity: .45 },
  { id: 'gardiner', name: 'Gardiner Nights 90.7', tag: 'synthwave for the night drive', voice: { pitch: .95, rate: .92 },
    bpm: [96, 112], swing: 0, scales: ['minor', 'dorian'], root: [33, 40],
    progs: [[0, 5, 2, 6], [0, 3, 5, 6], [5, 6, 0, 0], [0, 6, 5, 4]], sevenths: false,
    kick: KICKS.four, snare: SNARES.backbeat, hats: [HATS.offbeat, HATS.sixteenths], bass: 'arp', pad: 'lush', lead: 'saw', leadDensity: .4 },
  { id: 'ravine', name: 'Ravine 97.9', tag: 'lo-fi beats to get chased to', voice: { pitch: 1, rate: .85 },
    bpm: [68, 80], swing: .5, scales: ['dorian', 'major', 'minor'], root: [36, 43],
    progs: [[1, 4, 0, 0], [3, 2, 1, 4], [0, 5, 1, 4], [3, 4, 2, 5]], sevenths: true,
    kick: KICKS.lofi, snare: SNARES.lofi, hats: [HATS.eighths], bass: 'soft', pad: 'rhodes', lead: 'bell', leadDensity: .22, crackle: true },
  { id: 'talk', name: 'The Six Talk 1180', tag: 'news, traffic and your calls', voice: { pitch: 1, rate: 1 }, talk: true },
];

/* ============================== songs ============================== */
const T_ADJ = ['Midnight', 'Northbound', 'Electric', 'Golden', 'Lonely', 'Neon', 'Last', 'Late', 'Paper', 'Heavy', 'Quiet', 'Velvet', 'Concrete', 'Slow', 'Brand New'];
const T_NOUN = ['Streetcar', 'Skyline', 'Lakeshore', 'Raccoons', 'Ravine', 'Condo', 'Rooftops', 'Gardiner', 'Winter', 'Patio', 'Sirens', 'Ferry', 'Headlights', 'Subway', 'Overpass'];
const T_PLACE = ['Ossington', 'Kensington', 'Dundas', 'Scarborough', 'Parkdale', 'Bloor', 'Spadina', 'Yonge', 'Etobicoke', 'the Danforth', 'Liberty Village', 'Leslieville', 'the Beaches', 'Jane and Finch', 'North York'];
const T_FORM = [r => `${pick(r, T_ADJ)} ${pick(r, T_NOUN)}`, r => `${pick(r, T_PLACE)} at ${pick(r, ['Midnight', '3am', 'Sunrise', 'Last Call'])}`,
  r => `${pick(r, T_NOUN)} (${pick(r, T_PLACE)})`, r => `Leave It in ${pick(r, T_PLACE)}`, r => `${pick(r, T_ADJ)} on ${pick(r, T_PLACE)}`, r => `${pick(r, T_NOUN)} Love`];
const ARTISTS = {
  northside: [r => `Lil ${pick(r, ['Raccoon', 'Streetcar', 'Pothole', 'Condo', 'Tokens'])}`, r => `${pick(r, ['Kid', 'Young', 'Big'])} ${pick(r, ['Etobicoke', 'Rexdale', 'Malvern', 'Weston', 'Scarb'])}`, r => `${pick(r, ['6ix', 'North', 'East End'])} ${pick(r, ['Prophet', 'Saint', 'Kings', 'Collective'])}`],
  lakeshore: [r => `The ${pick(r, ['Streetcar', 'Ferry', 'Island', 'Overpass', 'Night Bus'])} ${pick(r, ['Ghosts', 'Lovers', 'Union', 'Kids', 'Band'])}`, r => `${pick(r, ['Maple', 'Harbour', 'Bloor', 'Queen'])} ${pick(r, ['Street Club', 'Avenue', 'Society', 'Static'])}`],
  gardiner: [r => `${pick(r, ['NEON', 'CHROME', 'VHS', 'LASER'])} ${pick(r, ['HARBOUR', 'TOWER', 'LAKESHORE', 'EXPRESS'])}`, r => `${pick(r, ['Night', 'Midnight', 'Turbo'])} ${pick(r, ['Driver', 'Ferry', 'Motel', 'Arcade'])}`],
  ravine: [r => `${pick(r, ['sleepy', 'cozy', 'rainy', 'humble'])} ${pick(r, ['raccoon', 'streetcar', 'ravine', 'patio'])}`, r => `${pick(r, ['don', 'humber', 'high', 'bluffs'])} ${pick(r, ['tapes', 'beats', 'radio', 'loops'])}`],
};

// one song for a station: everything the page needs to play it, as plain numbers (midi notes, steps, seconds)
export function makeSong(st, n) {
  const r = rng32(hashStr(st.id) ^ Math.imul(n + 1, 2654435761));
  const bpm = Math.round(st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]));
  const scaleName = pick(r, st.scales), scale = SCALES[scaleName];
  const root = st.root[0] + Math.floor(r() * (st.root[1] - st.root[0] + 1));
  const progA = pick(r, st.progs), progB = pick(r, st.progs);
  const chords = p => p.map(d => chordOn(scale, d, st.sevenths ? 4 : 3).map(x => x + root + 12)); // pad register
  const kick = pick(r, st.kick), snare = pick(r, st.snare), hat = pick(r, st.hats);

  // bass rhythm: semitone offsets above the chord root, null = rest
  const bassPat = {
    '808': [0, null, null, null, null, null, null, 0, null, null, 0, null, null, null, 12, null],
    pick: [0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 7, null],
    arp: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 7, 12],
    soft: [0, null, null, null, null, null, 7, null, 0, null, null, null, null, null, null, null],
  }[st.bass];

  // lead: two-bar phrases, a walk on the scale (scale-step numbers, 0 = the root), mostly small steps
  const phrase = dens => {
    const out = []; let d = Math.floor(r() * 5);
    for (let s = 0; s < 32; s++) {
      const strong = s % 4 === 0;
      if (r() < (strong ? dens * 1.6 : dens * .7)) { d += pick(r, [-2, -1, -1, 0, 1, 1, 2, 3, -3]); d = Math.max(-2, Math.min(9, d)); out.push(d); }
      else out.push(null);
    }
    return out;
  };
  const toMidi = ph => ph.map(d => d === null ? null : root + 24 + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7));
  const leadA = toMidi(phrase(st.leadDensity)), leadB = toMidi(phrase(st.leadDensity * 1.2));

  // structure: intro, verse, chorus, verse, chorus, outro (bars). parts say which instruments play.
  const S = (name, bars, parts) => ({ name, bars, ...parts });
  const sections = [
    S('intro', 4, { drums: 0, bass: 0, pad: 1, lead: 0, prog: 'A' }),
    S('verse', 8, { drums: 1, bass: 1, pad: 1, lead: 0, prog: 'A' }),
    S('chorus', 8, { drums: 1, bass: 1, pad: 1, lead: 'B', prog: 'B' }),
    S('verse', 8, { drums: 1, bass: 1, pad: 1, lead: 'A', prog: 'A' }),
    S('chorus', 8, { drums: 1, bass: 1, pad: 1, lead: 'B', prog: 'B' }),
    S('outro', 4, { drums: .5, bass: 0, pad: 1, lead: 0, prog: 'A' }),
  ];
  const bars = sections.reduce((a, s) => a + s.bars, 0);
  const stepDur = 60 / bpm / 4;
  const title = pick(r, T_FORM)(r), artist = pick(r, ARTISTS[st.id])(r);
  return { station: st.id, n, title, artist, bpm, root, scaleName, scale, chordsA: chords(progA), chordsB: chords(progB),
    rootsA: progA.map(d => scale[d] + root), rootsB: progB.map(d => scale[d] + root),
    kick, snare, hat, bassPat, leadA, leadB, sections, bars, steps: bars * 16, stepDur, dur: bars * 16 * stepDur, swing: st.swing };
}

// what plays at step s (0-based within the song): the section, the bar's chord and its root
export function songStep(song, s) {
  const bar = Math.floor(s / 16); let b = bar, sec = song.sections[0];
  for (const x of song.sections) { if (b < x.bars) { sec = x; break; } b -= x.bars; }
  const B = sec.prog === 'B', ci = bar % 4;
  return { bar, step: s % 16, barInSection: b, section: sec, chord: (B ? song.chordsB : song.chordsA)[ci], bassRoot: (B ? song.rootsB : song.rootsA)[ci] };
}

// where a station is at time t (seconds since it went on air): the song number, the song and how far into it
export function songAt(st, t) {
  const c = st._cue || (st._cue = { n: 0, start: 0, song: makeSong(st, 0) });
  if (t < c.start) { c.n = 0; c.start = 0; c.song = makeSong(st, 0); }
  while (t >= c.start + c.song.dur) { c.start += c.song.dur; c.n++; c.song = makeSong(st, c.n); }
  return { n: c.n, song: c.song, at: t - c.start };
}

/* ============================== DJs ==============================
   ctx: { hood, place, time (hour 0-24), weather ('Clear', 'Rain'...), heat (wanted stars 0-6), feed (latest Lookout post text) } */
const fill = (t, ctx) => t.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
const partOfDay = h => h < 5 ? 'late night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
const WEATHER_LINE = {
  Clear: ['Clear skies over the city right now.', 'Not a cloud over the lake. Windows down.'],
  Cloudy: ['Bit of cloud rolling in off the lake.', 'Grey but dry out there.'],
  Overcast: ['Proper grey sky over the six today.', 'Overcast, the classic Toronto look.'],
  Rain: ['Rain coming down, so watch those streetcar tracks.', 'It is wet out there. Leave some room on the Gardiner.'],
  Storm: ['Big storm over the city. Maybe pull over somewhere dry.', 'Thunder over the lake right now. Stay safe out there.'],
};
const HEAT_LINE = [null,
  ['Hearing a few sirens around {hood}.', 'Somebody is having a day in {hood}.'],
  ['Police are busy around {hood} right now.', 'Cop cars all over {hood}. Not ideal.'],
  ['We are getting reports of a chase through {hood}.', 'Listeners say a car is running from police near {place}.'],
  ['Police helicopter up over {hood}. Whoever you are, keep it moving.', 'The chopper is out over {hood} again.'],
  ['Roadblocks going up around {hood}. This is a serious one, folks.', 'Tactical units heading into {hood}. Wow.'],
  ['The whole force is out in {hood} right now. If you are hearing this, it might be you.', 'Every cop in the city is in {hood}. Stay off the roads.'],
];
const DJ_STYLE = {
  northside: { hi: ['Yo, Northside 96.6, hip-hop from the six.', 'You are locked in to Northside 96.6.', 'Northside, it is a {pod} vibe in the city.'] },
  lakeshore: { hi: ['Lakeshore 101.7, the city\'s indie station.', 'You are listening to Lakeshore 101.7.', 'Good {pod}, Toronto. This is Lakeshore 101.7.'] },
  gardiner: { hi: ['Gardiner Nights, 90.7. Keep driving.', 'This is Gardiner Nights. The city is yours tonight.', 'Gardiner Nights 90.7. Lights on, eyes forward.'] },
  ravine: { hi: ['Ravine 97.9. Breathe in, breathe out.', 'You are tuned to Ravine, 97.9. Slow down a little.', 'Ravine 97.9, lo-fi for the {pod}.'] },
};

// a DJ link between songs: names what's next, sometimes what just played, and one line about the city
export function djLine(st, prev, next, ctx, r = Math.random) {
  const c = { ...ctx, pod: partOfDay(ctx.time ?? 12) };
  const parts = [fill(pick(r, DJ_STYLE[st.id].hi), c)];
  if (prev && r() < .5) parts.push(`That was ${prev.title} by ${prev.artist}.`);
  const lvl = Math.max(0, Math.min(6, Math.floor(ctx.heat || 0)));
  if (lvl && r() < .85) parts.push(fill(pick(r, HEAT_LINE[lvl]), c));
  else if (WEATHER_LINE[ctx.weather] && r() < .5) parts.push(pick(r, WEATHER_LINE[ctx.weather]));
  parts.push(pick(r, [`Here is ${next.title} by ${next.artist}.`, `Up next, ${next.artist} with ${next.title}.`, `This one is ${next.title}.`]));
  return parts.join(' ');
}

// the talk station: an endless run of short segments, each one or two sentences
const ADS = [
  'Hungry at three in the morning? Waffle Hut. Always open. Always waffles.',
  'Six Gas. Fill up, grab a coffee, and get back on the road.',
  'The Lucky Six Casino. Blackjack, roulette and the Lucky Wheel. Please gamble responsibly.',
  'Bullet Barn. Everything you need, no questions asked. Some restrictions apply.',
  'Is your car a little too recognisable? Visit a chop shop near you.',
];
const NEWS = [
  'City council has voted to study the possibility of maybe fixing the Gardiner, eventually.',
  'Raccoons have once again defeated the city\'s new green bin design.',
  'The TTC reports delays on Line 1 due to, quote, everything.',
  'A new condo tower has been approved in {hood}. Residents say they are shocked.',
  'The Leafs lost again last night. The city is taking it one day at a time.',
  'Rent in {hood} is up again this month. Nobody is surprised.',
  'Police are reminding drivers that streetcar tracks are not a parking spot.',
];
const CALLERS = [
  ['Mike from Scarborough', 'Why is there always construction on my street? Every summer!'],
  ['Priya in Leslieville', 'I just want to say, the raccoons are organised now. They have a leader.'],
  ['Dave, North York', 'Somebody stole my car right in front of me, and honestly, they drove it better than I do.'],
  ['Jen from the Junction', 'Is it just me, or is every coffee in this city fourteen dollars?'],
  ['Tony in Etobicoke', 'Long time listener. The Gardiner is a parking lot again. That is the call.'],
];
export function talkLine(k, ctx, r = Math.random) {
  const c = { ...ctx, pod: partOfDay(ctx.time ?? 12) };
  const lvl = Math.max(0, Math.min(6, Math.floor(ctx.heat || 0)));
  switch (k % 5) {
    case 0: return fill(pick(r, ['Good {pod}, you are listening to The Six Talk, 1180.', 'The Six Talk, 1180. News, traffic and your calls.']), c) + ' ' + fill(pick(r, NEWS), c);
    case 1: { // traffic and weather together
      const tr = lvl >= 3 ? fill(pick(r, HEAT_LINE[lvl]), c) + ' Expect delays.' : fill(pick(r, ['Traffic is heavy on the Gardiner and the Don Valley, as always.', 'Slow going on Yonge near {hood}.', 'Roads look clear around {hood} right now.']), c);
      return 'Traffic and weather. ' + tr + ' ' + (WEATHER_LINE[ctx.weather] ? pick(r, WEATHER_LINE[ctx.weather]) : '');
    }
    case 2: { const [who, said] = pick(r, CALLERS); return `Let's go to the phones. ${who}, you are on the air. ${said}`; }
    case 3: return pick(r, ADS);
    default: return ctx.feed ? `On Lookout, somebody posted: ${ctx.feed}. The city never stops talking.` : fill(pick(r, NEWS), c);
  }
}
