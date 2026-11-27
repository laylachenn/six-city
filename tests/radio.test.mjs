// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, makeSong, songStep, songAt, djLine, talkLine, chordOn, SCALES, rng32 } from '../src/radio.js';

const MUSIC = STATIONS.filter(s => !s.talk);
const fresh = st => ({ ...st }); // songAt caches on the station object

test('songs are deterministic per station and song number', () => {
  for (const st of MUSIC) {
    const a = makeSong(st, 7), b = makeSong(st, 7), c = makeSong(st, 8);
    assert.deepEqual(a, b);
    assert.ok(a.title !== c.title || a.bpm !== c.bpm || a.root !== c.root, `${st.id} songs 7 and 8 are identical`);
  }
});

test('songs stay inside their station style', () => {
  for (const st of MUSIC) for (let n = 0; n < 40; n++) {
    const s = makeSong(st, n);
    assert.ok(s.bpm >= st.bpm[0] && s.bpm <= st.bpm[1], `${st.id} bpm ${s.bpm}`);
    assert.ok(s.dur > 45 && s.dur < 150, `${st.id} song length ${s.dur.toFixed(1)}s`);
    assert.equal(s.steps, s.bars * 16);
    for (const p of [s.kick, s.snare, s.hat, s.bassPat]) assert.equal(p.length, 16);
    assert.equal(s.leadA.length, 32); assert.equal(s.leadB.length, 32);
    assert.ok(s.title.length > 0 && s.artist.length > 0);
  }
});

test('every lead note is in the song\'s key', () => {
  for (const st of MUSIC) for (let n = 0; n < 40; n++) {
    const s = makeSong(st, n), pcs = new Set(s.scale.map(x => (x + s.root) % 12));
    for (const m of [...s.leadA, ...s.leadB]) if (m !== null) assert.ok(pcs.has(m % 12), `${st.id}#${n} note ${m} not in key`);
    for (const ch of [...s.chordsA, ...s.chordsB]) for (const m of ch) assert.ok(pcs.has(m % 12), `${st.id}#${n} chord note ${m}`);
  }
});

test('chords stack thirds from the scale', () => {
  assert.deepEqual(chordOn(SCALES.major, 0), [0, 4, 7]);
  assert.deepEqual(chordOn(SCALES.major, 4, 4), [7, 11, 14, 17]); // G7 in C
  assert.deepEqual(chordOn(SCALES.minor, 5), [8, 12, 15]);
});

test('songStep walks the sections in order', () => {
  const s = makeSong(MUSIC[0], 0);
  assert.equal(songStep(s, 0).section.name, 'intro');
  assert.equal(songStep(s, 4 * 16).section.name, 'verse');
  assert.equal(songStep(s, 12 * 16).section.name, 'chorus');
  assert.equal(songStep(s, s.steps - 1).section.name, 'outro');
  assert.equal(songStep(s, 12 * 16).chord, s.chordsB[0]);
  assert.equal(songStep(s, 13 * 16 + 3).step, 3);
});

test('songAt follows the playlist through time and can rewind', () => {
  const st = fresh(MUSIC[1]);
  const s0 = makeSong(st, 0), s1 = makeSong(st, 1);
  assert.equal(songAt(st, 1).n, 0);
  const p = songAt(st, s0.dur + 2);
  assert.equal(p.n, 1); assert.ok(Math.abs(p.at - 2) < 1e-9);
  assert.equal(songAt(st, s0.dur + s1.dur + .5).n, 2);
  assert.equal(songAt(st, 3600).song.station, st.id);
  assert.equal(songAt(st, 0).n, 0); // rewinding resets the cue
});

test('DJ lines name the next song and react to the police', () => {
  const st = MUSIC[0], next = makeSong(st, 3), prev = makeSong(st, 2);
  const ctx = { hood: 'Kensington Market', place: 'Spadina Avenue', time: 23, weather: 'Rain', heat: 0 };
  for (let i = 0; i < 50; i++) {
    const line = djLine(st, prev, next, ctx, rng32(i));
    assert.ok(line.includes(next.title), line);
    assert.ok(!/[{}]/.test(line), line);
  }
  const hot = Array.from({ length: 30 }, (_, i) => djLine(st, prev, next, { ...ctx, heat: 4 }, rng32(i)));
  assert.ok(hot.some(l => /helicopter|chopper/i.test(l)), 'a 4-star DJ link mentions the helicopter');
  assert.ok(hot.some(l => l.includes('Kensington Market')));
});

test('talk station cycles segments with every placeholder filled', () => {
  const ctx = { hood: 'Parkdale', place: 'Queen Street West', time: 8, weather: 'Clear', heat: 5, feed: 'a raccoon took my pizza' };
  const lines = Array.from({ length: 25 }, (_, k) => talkLine(k, ctx, rng32(k)));
  for (const l of lines) { assert.ok(l.length > 10); assert.ok(!/[{}]/.test(l), l); }
  assert.ok(lines.some(l => l.startsWith('Traffic and weather') && /Parkdale/.test(l)));
  assert.ok(lines.some(l => l.includes('a raccoon took my pizza')));
  assert.ok(talkLine(4, { ...ctx, feed: null }, rng32(1)).length > 10);
});
