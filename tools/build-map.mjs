// Builds assets/toronto.json from the raw OpenStreetMap extracts in assets/osm/.
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// usage: node tools/build-map.mjs
// inputs: the OSM extracts (tools/fetch-north.mjs, fetch-shops.mjs, fetch-detail.mjs), the city's 3D Massing (tools/fetch-massing.mjs)
// and the roof colours sampled from aerial photos (tools/roof-colours.py, which reads this script's output: run the build again after it)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OSM = path.join(ROOT, 'assets/osm');
const load = p => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)).elements : [];
// downtown extract + the northern districts (assets/osm/north, from tools/fetch-north.mjs), de-duplicated by OSM id
const NORTH_IDS = new Set();
const read = (f, nf) => {
  const seen = new Set(), elements = [];
  for (const [p, north] of [[path.join(OSM, f), 0], ...[].concat(nf || f).map(n => [path.join(OSM, 'north', n), 1])]) for (const e of load(p)) {
    const k = e.type + e.id; if (north) NORTH_IDS.add(k); if (seen.has(k)) continue; seen.add(k); elements.push(e);
  }
  return { elements };
};

// ---- projection: local metres, rotated 17.2° so the downtown street grid is axis-aligned (x = east-ish, z = south-ish)
import { LAT0, LON0, proj, ZONES, CORRIDOR } from './zones.mjs';

const PLAY = CORRIDOR;                                            // drivable / walkable area: the districts + the arterials between them
const SCENE = { x0: -3000, x1: 3100, z0: -3200, z1: 3600 };      // rendered scenery around downtown
const inBox = (p, b, m = 0) => p[0] > b.x0 - m && p[0] < b.x1 + m && p[1] > b.z0 - m && p[1] < b.z1 + m;
const inZone = (p, m = 0) => ZONES.some(z => inBox(p, z, m));
const inScene = (p, m = 0) => inBox(p, SCENE, m) || inBox(p, CORRIDOR, 300 + m);
const r1 = v => Math.round(v * 10) / 10;

// ---- geometry helpers
function dp(pts, eps) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
const centroid = p => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
function ring(geom) { // closed OSM ring -> simplified, positive-area polygon without the duplicate end point
  const p = geom.map(proj);
  if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.01) p.pop();
  return simp(p);
}
function simp(p) { // simplified, positive-area closed polygon (no repeated end point)
  if (p.length < 3) return null;
  { // simplify a closed ring: split at the vertex farthest from the first one
    let m = 1, md = 0; for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > md) { md = d; m = i; } }
    const A = dp(p.slice(0, m + 1), 0.35), Bp = dp([...p.slice(m), p[0]], 0.35);
    p = [...A, ...Bp.slice(1, -1)];
  }
  if (p.length < 3) return null;
  if (area(p) < 0) p.reverse();
  return p;
}
function inside(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const outerOf = e => e.type === 'way' ? e.geometry : ((e.members || []).find(m => m.role === 'outer' && m.geometry) || {}).geometry;
const pack = p => p.map(q => [r1(q[0]), r1(q[1])]);

// ---- roads
const net = read('net.json');
const ROADCLS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'primary_link', 'secondary_link', 'tertiary_link']);
const ARTERIAL = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']);
const DEFLANES = { motorway: 6, motorway_link: 1, trunk: 4, trunk_link: 1, primary: 4, secondary: 4, tertiary: 2, residential: 2, unclassified: 2, living_street: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1 };
const DTZ = ZONES[0];
const nodePos = new Map(), use = new Map();
const roadWays = [];
for (const e of net.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !ROADCLS.has(t.highway) || !e.nodes) continue;
  if (t.tunnel === 'yes' || t.area === 'yes') continue;
  const pts = e.geometry.map(proj);
  // the Gardiner is drawn as an elevated deck; other motorways (DVP, 401) are drivable only outside downtown
  if (/^motorway/.test(t.highway) && (/Gardiner/.test(t.name || '') || pts.some(p => inBox(p, DTZ)))) continue;
  e.nodes.forEach((id, i) => nodePos.set(id, pts[i]));
  roadWays.push({ e, t, pts });
}
// keep ways that touch the play area; others become scenery roads
const playWays = [], sceneRoads = [];
const laneInfo = t => {
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' ? 1 : t.oneway === '-1' ? -1 : 0;
  let lanes = parseInt(t.lanes) || 0;
  if (!lanes) lanes = DEFLANES[t.highway] * (ow ? 0.5 : 1) || 1;
  lanes = Math.max(1, Math.min(8, lanes));
  const parking = (t.highway === 'residential' || t.highway === 'tertiary') ? (ow ? 2.4 : 4.4) : 0;
  const hw = Math.max(3, Math.min(15, (lanes * 3.3 + parking) / 2));
  return { ow, lanes, hw };
};
for (const w of roadWays) {
  w.art = ARTERIAL.has(w.t.highway);
  const touches = w.pts.some(p => inZone(p, 30)) || (w.art && w.pts.some(p => inBox(p, PLAY, 30)));
  if (touches) playWays.push(w);
  else if (w.pts.some(p => inScene(p))) { const li = laneInfo(w.t); sceneRoads.push({ p: pack(dp(w.pts, 1)), hw: r1(li.hw), ow: li.ow ? 1 : 0, l: li.lanes }); }
}
for (const w of playWays) for (const id of w.e.nodes) use.set(id, (use.get(id) || 0) + 1);
const nodeIdx = new Map(), nodes = [], edges = [];
const gnode = id => { if (!nodeIdx.has(id)) { nodeIdx.set(id, nodes.length); const p = nodePos.get(id); nodes.push({ x: r1(p[0]), z: r1(p[1]), e: [] }); } return nodeIdx.get(id); };
for (const w of playWays) {
  const ids = w.e.nodes, li = laneInfo(w.t);
  let start = 0;
  for (let i = 1; i < ids.length; i++) {
    if (i === ids.length - 1 || use.get(ids[i]) > 1) {
      let pts = w.pts.slice(start, i + 1), a = ids[start], b = ids[i];
      if (li.ow === -1) { pts = pts.slice().reverse(); [a, b] = [b, a]; }
      pts = dp(pts, 0.6);
      let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      const ok = q => inZone(q, 20) || (w.art && inBox(q, PLAY, 20));
      if (len > 0.5 && (ok(pts[0]) || ok(pts[pts.length - 1]))) {
        const ai = gnode(a), bi = gnode(b);
        edges.push({ a: ai, b: bi, p: pack(pts), n: w.t.name || '', c: w.t.highway, hw: r1(li.hw), ow: li.ow ? 1 : 0, l: li.lanes, len: r1(len), tram: 0 });
      }
      start = i;
    }
  }
}
edges.forEach((ed, i) => { nodes[ed.a].e.push(i); if (ed.b !== ed.a) nodes[ed.b].e.push(i); });
// largest connected component gets traffic
{
  const comp = new Int32Array(nodes.length).fill(-1); let best = -1, bestN = 0, cid = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue; const st = [s]; comp[s] = cid; let n = 0;
    while (st.length) { const v = st.pop(); n++; for (const ei of nodes[v].e) { const o = edges[ei].a === v ? edges[ei].b : edges[ei].a; if (comp[o] < 0) { comp[o] = cid; st.push(o); } } }
    if (n > bestN) { bestN = n; best = cid; } cid++;
  }
  edges.forEach(ed => { ed.ai = comp[ed.a] === best ? 1 : 0; });
}

// ---- streetcar tracks, Gardiner, rail, platforms, squares
const tram = [], gardiner = [], rail = [], platforms = [], plazas = [];
for (const e of net.elements) {
  const t = e.tags || {}; if (!e.geometry) continue;
  const pts = e.geometry.map(proj);
  if (t.railway === 'tram' && pts.some(p => inScene(p))) tram.push(pack(dp(pts, 0.4)));
  else if (t.highway === 'motorway' && /Gardiner/.test(t.name || '') && pts.some(p => inBox(p, SCENE))) gardiner.push({ p: pack(dp(pts, 0.8)), el: t.bridge === 'yes' || t.layer > 0 ? 1 : 0, l: parseInt(t.lanes) || 3 });
  else if (t.railway === 'rail' && t.tunnel !== 'yes' && pts.some(p => inScene(p))) rail.push(pack(dp(pts, 0.5)));
  else if (t.railway === 'platform') { const r = ring(e.geometry); if (r && Math.abs(area(r)) > 20) platforms.push(pack(r)); }
  else if (t.place === 'square' || (t.highway === 'pedestrian' && t.area === 'yes')) { const r = ring(e.geometry); if (r) plazas.push({ p: pack(r), n: t.name || '' }); }
}
// mark graph edges that carry streetcar tracks
{
  const G = new Map(), K = 20, key = (x, z) => ((x / K) | 0) + ',' + ((z / K) | 0);
  for (const l of tram) for (let k = 1; k < l.length; k++) { const a = l[k - 1], b = l[k], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4); for (let s = 0; s <= n; s++) { const x = a[0] + (b[0] - a[0]) * s / n, z = a[1] + (b[1] - a[1]) * s / n; const kk = key(x, z); (G.get(kk) || G.set(kk, []).get(kk)).push([x, z]); } }
  const near = (x, z) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const L = G.get((((x / K) | 0) + i) + ',' + (((z / K) | 0) + j)); if (L) for (const q of L) if (Math.hypot(q[0] - x, q[1] - z) < 4.5) return true; } return false; };
  for (const ed of edges) { let hit = 0, n = 0; const p = ed.p; for (let k = 1; k < p.length; k++) for (let s = 0; s < 3; s++) { const x = p[k - 1][0] + (p[k][0] - p[k - 1][0]) * (s + .5) / 3, z = p[k - 1][1] + (p[k][1] - p[k - 1][1]) * (s + .5) / 3; n++; if (near(x, z)) hit++; } if (n && hit / n > .6) ed.tram = 1; }
}

// ---- green areas and rail land
const areasRaw = read('areas.json'), green = [], railLand = [], islands = [];
const WOODS = t => t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'cemetery' || t.landuse === 'recreation_ground' || t.leisure === 'golf_course';
for (const e of areasRaw.elements) {
  const t = e.tags || {};
  if (t.place === 'island') {
    for (const m of e.members || []) if (m.role === 'outer' && m.geometry) { const r = ring(m.geometry); if (r && Math.abs(area(r)) > 2000) islands.push(pack(r)); }
    continue;
  }
  const g = outerOf(e); if (!g) continue; const r = ring(g); if (!r) continue;
  if (!r.some(p => inScene(p))) continue;
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || WOODS(t)) green.push({ p: pack(r), k: t.leisure === 'park' || t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'cemetery' ? 1 : 0, n: t.name || '', ...(t.leisure === 'golf_course' ? { g: 1 } : t.leisure === 'park' ? { pk: 1 } : {}) });
  else if (t.leisure === 'pitch') green.push({ p: pack(r), k: 2, n: '' });
  else if (t.landuse === 'railway') railLand.push(pack(r));
}

// ---- shoreline (Lake Ontario + harbour slips)
const shoreRaw = read('shore.json'), shore = [], basins = [];
for (const e of shoreRaw.elements) {
  if (!e.geometry) continue; const t = e.tags || {};
  if (t.water === 'basin' || t.natural === 'water') { const r = ring(e.geometry); if (r) basins.push(pack(r)); }
  else shore.push(pack(dp(e.geometry.map(proj), 1)));
}
{ // ponds, reservoirs and the Don River in the northern districts
  const seen = new Set(shoreRaw.elements.map(e => e.type + e.id));
  for (const e of load(path.join(OSM, 'north', 'water.json'))) {
    if (seen.has(e.type + e.id)) continue;
    const gs = e.type === 'way' ? [e.geometry] : (e.members || []).filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry);
    for (const g of gs) { if (!g) continue; const r = ring(g); if (r && Math.abs(area(r)) > 150 && r.some(p => inBox(p, CORRIDOR)) && (!inBox(centroid(r), SCENE) || ZONES.slice(1).some(z => inBox(centroid(r), z)))) basins.push(pack(r)); }
  }
}

// chain shoreline pieces; the longest open chain is the mainland shore, land is north of it
let land = null;
{
  const pieces = shore.map(p => p.slice());
  const eq = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;
  const chains = [];
  while (pieces.length) {
    let c = pieces.pop(), grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pieces.length; i++) {
        const q = pieces[i];
        if (eq(c[c.length - 1], q[0])) c = c.concat(q.slice(1));
        else if (eq(c[c.length - 1], q[q.length - 1])) c = c.concat(q.slice().reverse().slice(1));
        else if (eq(c[0], q[q.length - 1])) c = q.concat(c.slice(1));
        else if (eq(c[0], q[0])) c = q.slice().reverse().concat(c.slice(1));
        else continue;
        pieces.splice(i, 1); grew = true; break;
      }
    }
    chains.push(c);
  }
  const ext = c => Math.max(...c.map(p => p[0])) - Math.min(...c.map(p => p[0]));
  chains.sort((a, b) => ext(b) - ext(a));
  console.log('shore chains', chains.map(c => `${c.length}pts ext${ext(c) | 0} closed${eq(c[0], c[c.length - 1])}`).join(' | '));
  let m = chains[0];
  if (m && !eq(m[0], m[m.length - 1])) {
    if (m[0][0] > m[m.length - 1][0]) m = m.slice().reverse();
    // keep the part inside the scene, extend to the scene edges, close along the north edge
    m = m.filter(p => p[0] > SCENE.x0 - 50 && p[0] < SCENE.x1 + 50 && p[1] > SCENE.z0);
    land = [[SCENE.x0, m[0][1]], ...m, [SCENE.x1, m[m.length - 1][1]], [SCENE.x1, SCENE.z0], [SCENE.x0, SCENE.z0]];
    land = pack(dp(land, 0.8));
  }
}
// the northern districts are all dry land: two rectangles that butt against the north and east edges of the downtown land
const landExtra = [
  [[SCENE.x0, SCENE.z0], [CORRIDOR.x1 + 300, SCENE.z0], [CORRIDOR.x1 + 300, CORRIDOR.z0 - 300], [SCENE.x0, CORRIDOR.z0 - 300]],
  [[SCENE.x1, -1000], [CORRIDOR.x1 + 300, -1000], [CORRIDOR.x1 + 300, SCENE.z0], [SCENE.x1, SCENE.z0]],
].map(r => area(r) < 0 ? r.reverse() : r);

// ---- buildings
const bRaw = read('buildings.json', ['buildings_eastyork.json', 'buildings_northyork.json', ...[0, 1, 2, 3, 4, 5].map(k => `buildings_corridor${k}.json`), 'buildings_towers.json']), pRaw = read('parts.json');
const num = v => { const f = parseFloat(String(v || '').replace(',', '.')); return isFinite(f) ? f : NaN; };
const HOUSE = new Set(['house', 'semidetached_house', 'terrace', 'detached', 'garage', 'garages', 'shed', 'hut', 'carport']);
function heights(t, kind, a) {
  let h = num(t.height), b = num(t.min_height);
  const lv = num(t['building:levels']), mlv = num(t['building:min_level']);
  if (!isFinite(h) && isFinite(lv)) h = lv * 3.4 + (HOUSE.has(kind) ? 2.5 : 0);
  if (!isFinite(b)) b = isFinite(mlv) ? mlv * 3.4 : 0;
  if (!isFinite(h)) {
    if (HOUSE.has(kind)) h = kind === 'garage' || kind === 'garages' || kind === 'shed' ? 3.2 : 9.5;
    else if (kind === 'roof') h = 6;
    else if (kind === 'apartments' || kind === 'residential') h = a > 1500 ? 30 : 13;
    else if (kind === 'office' || kind === 'commercial') h = a > 2500 ? 40 : 16;
    else h = a < 150 ? 7.5 : a < 600 ? 11 : a < 2500 ? 15 : 20;
  }
  if (h <= b) h = b + 3;
  return [b, h];
}
const outlines = [];
const KEEP_NAMED = /^(Casa Loma|Spadina House|Royal Ontario Museum|Toronto Reference Library|Yorkdale|Upper Canada College)/;
const TOWER_IDS = new Set(load(path.join(OSM, 'north', 'buildings_towers.json')).map(e => e.type + e.id));
// buildings within ~50 m of a main road (trunk / primary / secondary) line the corridor between the districts
const fronts = (() => {
  const H = new Map(), K = 60, key = (i, j) => i + ',' + j;
  for (const ed of edges) if (/^(trunk|primary|secondary)/.test(ed.c)) for (let k = 1; k < ed.p.length; k++) {
    const a = ed.p[k - 1], b = ed.p[k];
    for (let i = Math.floor((Math.min(a[0], b[0]) - 60) / K); i <= Math.floor((Math.max(a[0], b[0]) + 60) / K); i++) for (let j = Math.floor((Math.min(a[1], b[1]) - 60) / K); j <= Math.floor((Math.max(a[1], b[1]) + 60) / K); j++) { const kk = key(i, j); (H.get(kk) || H.set(kk, []).get(kk)).push([a, b, ed.hw]); }
  }
  return c => { for (const [a, b, hw] of H.get(key(Math.floor(c[0] / K), Math.floor(c[1] / K))) || []) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / l2)); if (Math.hypot(c[0] - a[0] - dx * t, c[1] - a[1] - dz * t) < hw + 45) return true; } return false; };
})();
for (const e of bRaw.elements) {
  const g = outerOf(e); if (!g) continue; const t = e.tags || {};
  const r = ring(g); if (!r) continue; const c = centroid(r);
  if (!inScene(c)) continue;
  const a = Math.abs(area(r)); if (a < 12) continue;
  // outside the districts keep only what the game draws: towers, plus the buildings fronting the arterials (fetched for that)
  const zone = inZone(c, 250), front = !zone && NORTH_IDS.has(e.type + e.id) && inBox(c, CORRIDOR, 100) && (TOWER_IDS.has(e.type + e.id) || fronts(c) || KEEP_NAMED.test(t.name || ''));
  outlines.push({ r, c, a, t, kind: t.building || 'yes', parts: 0, top: 0, far: !(zone || front) });
}
const parts = [];
for (const e of pRaw.elements) {
  const g = outerOf(e); if (!g) continue; const t = e.tags || {};
  if (t['building:part'] === 'no') continue;
  const r = ring(g); if (!r) continue; const c = centroid(r);
  if (!inScene(c)) continue;
  const a = Math.abs(area(r)); if (a < 1.5) continue;
  parts.push({ r, c, a, t });
}
// spatial hash of outlines to attach parts
const OH = new Map(), OK = 100, okey = (x, z) => ((Math.floor(x / OK)) + ',' + (Math.floor(z / OK)));
const hashOutline = (o, i) => { const xs = o.r.map(p => p[0]), zs = o.r.map(p => p[1]); for (let x = Math.floor(Math.min(...xs) / OK); x <= Math.floor(Math.max(...xs) / OK); x++) for (let z = Math.floor(Math.min(...zs) / OK); z <= Math.floor(Math.max(...zs) / OK); z++) { const k = x + ',' + z; (OH.get(k) || OH.set(k, []).get(k)).push(i); } };
outlines.forEach(hashOutline);
const hostOf = c => { for (const i of OH.get(okey(c[0], c[1])) || []) if (inside(c, outlines[i].r)) return outlines[i]; return null; };

// is any point of this ring on (or within a metre of) a drivable street?
const [roadNear, onRoad, roadDist] = (() => {
  const H = new Map(), K = 30;
  for (const ed of edges) for (let k = 1; k < ed.p.length; k++) { const a = ed.p[k - 1], b = ed.p[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; for (let d = 0; d <= L + 2.9; d += 3) { const t = Math.min(1, d / L), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, kk = Math.floor(x / K) + ',' + Math.floor(z / K); (H.get(kk) || H.set(kk, []).get(kk)).push([x, z, ed.hw]); } }
  const pt = (x, z, m) => { const i = Math.floor(x / K), j = Math.floor(z / K); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const s of H.get((i + a) + ',' + (j + b)) || []) if (Math.hypot(x - s[0], z - s[1]) < s[2] + m) return true; return false; };
  // distance from (x, z) to the nearest drivable street's kerb (up to ~30 m; 1e9 beyond)
  const dist = (x, z) => { const i = Math.floor(x / K), j = Math.floor(z / K); let d = 1e9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const s of H.get((i + a) + ',' + (j + b)) || []) d = Math.min(d, Math.hypot(x - s[0], z - s[1]) - s[2]); return d; };
  return [r => r.some(q => pt(q[0], q[1], 1)), (x, z, m = 1) => pt(x, z, m), dist];
})();
// ---- real heights from the City of Toronto 3D Massing model (assets/osm/massing.json, from tools/fetch-massing.mjs).
// OpenStreetMap only has a measured height for ~1% of footprints; the rest were guessed from floor counts or size.
// Hand-made OSM 3D parts and explicit OSM heights win; everything else takes the city's lidar / site-plan height, a footprint
// the city splits into a podium and tower(s) gets those as parts, and city buildings missing from OSM are added.
{
  const M = fs.existsSync(path.join(OSM, 'massing.json')) ? JSON.parse(fs.readFileSync(path.join(OSM, 'massing.json'))).pieces : [];
  if (!M.length) console.warn('WARNING: assets/osm/massing.json missing — building heights fall back to guesses. Run: node tools/fetch-massing.mjs');
  for (const pt of pRaw.elements) { const g = outerOf(pt); if (!g || (pt.tags || {})['building:part'] === 'no') continue; const r = ring(g); if (!r) continue; const h = hostOf(centroid(r)); if (h) h.osmParts = 1; }
  // one height per piece: houses to their ridge (the game draws the roof up to it), others to just above their average
  // roof (a lidar maximum is usually a rooftop machine room or mast), and only part way up when the piece mixes a low and a tall roof
  const pieceH = (m, house) => house ? Math.min(m.mx || m.av, (m.av || m.mx) * 1.6) : !m.mx ? m.av : m.av + Math.min(4, (m.mx - m.av) * .5);
  let set = 0, split = 0, added = 0, skipped = 0;
  const byHost = new Map(), orphans = [];
  for (const m of M) {
    const c = centroid(m.p); if (!inScene(c)) continue;
    const host = hostOf(c); if (host) (byHost.get(host) || byHost.set(host, []).get(host)).push(m); else orphans.push(m);
  }
  for (const [o, ms] of byHost) {
    if (o.osmParts || isFinite(num(o.t.height))) { skipped++; continue; }
    const house = HOUSE.has(o.kind), hs = ms.map(m => pieceH(m, house)), A = ms.map(m => Math.abs(area(m.p))), tot = A.reduce((s, a) => s + a, 0);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (ms.length > 1 && hi - lo > 4 && tot > o.a * .6) { // stepped: each city piece becomes a part of this footprint
      for (let k = 0; k < ms.length; k++) if (A[k] > 6) { const r = simp(ms[k].p); if (r) parts.push({ r, c: centroid(r), a: A[k], t: { height: String(hs[k]), 'building:part': 'yes' }, city: 1 }); }
      split++;
    }
    o.t = { ...o.t, height: String(Math.round(hs.reduce((s, h, k) => s + h * A[k], 0) / tot * 10) / 10) }; set++;
  }
  // city buildings OSM doesn't have yet: only where they clearly don't overlap a mapped building or sit on a street
  for (const m of orphans) {
    const r = simp(m.p); if (!r) continue; const c = centroid(r), a = Math.abs(area(r));
    if (a < 30 || !inZone(c)) continue;
    if (r.some(q => hostOf(q))) continue;
    const oc = []; for (const i of OH.get(okey(c[0], c[1])) || []) if (inside(outlines[i].c, r)) oc.push(i); if (oc.length) continue;
    if (roadNear(r) || onRoad(c[0], c[1], 1)) continue;
    const o = { r, c, a, t: { building: 'yes', height: String(pieceH(m, false)) }, kind: 'yes', parts: 0, top: 0, far: false, city: 1 };
    hashOutline(o, outlines.length); outlines.push(o); added++;
  }
  console.log('city massing:', M.length, 'pieces;', set, 'buildings given real heights,', split, 'split into podium + tower,', added, 'added from the city model,', skipped, 'kept their OSM 3D model / height');
}
const vols = [];
const colour = v => (v || '').toLowerCase().replace(/\s/g, '');
// what the walls are made of, how many storeys they have and when they were built: the game picks the facade from these
const MATS = { brick: 'brick', stone: 'stone', sandstone: 'stone', limestone: 'stone', slate: 'stone', glass: 'glass', mirror: 'glass', flass: 'glass', concrete: 'concrete', cement_block: 'concrete', concrete_block: 'concrete', metal: 'metal', steel: 'metal', copper: 'metal', plaster: 'plaster', plastered: 'plaster', stucco: 'plaster', wood: 'wood', siding: 'wood', timber_framing: 'wood' };
function facts(t, host) {
  const o = {}, h = host ? host.t : {}, m = MATS[(t['building:material'] || t['building:facade:material'] || h['building:material'] || '').toLowerCase()];
  if (m) o.m = m;
  const lv = num(t['building:levels']) - (num(t['building:min_level']) || 0); if (lv > 0 && lv < 150) o.lv = Math.round(lv);
  const y = String(t.start_date || t.construction_date || h.start_date || '').match(/1[89]\d\d|20\d\d/); if (y) o.yr = +y[0];
  else if (t.heritage || h.heritage) o.yr = 1900;
  return o;
}
const SHAPES = { flat: 0, gabled: 1, hipped: 2, pyramidal: 3, dome: 4, round: 5, skillion: 6, onion: 4, cone: 3, gambrel: 1, mansard: 2, saltbox: 1, 'half-hipped': 2 };
for (const pt of parts) {
  const host = hostOf(pt.c);
  if (host) { host.parts++; host.pa = (host.pa || 0) + pt.a; }
  const kind = (host && host.kind) || 'yes';
  const [b, h] = heights(pt.t, kind, pt.a);
  if (host) { host.top = Math.max(host.top, h); if (b < 1) (host.ph || (host.ph = [])).push(h); }
  if ((!host || host.far) && !inZone(pt.c, 250) && h < 26) continue;
  if (host) (host.pl || (host.pl = [])).push({ r: pt.r, b, h, vi: vols.length });
  vols.push({ p: pack(pt.r), b: r1(b), h: r1(h), k: kind, f: !host || host.far ? 1 : 0, rs: SHAPES[pt.t['roof:shape']] || 0, rh: r1(num(pt.t['roof:height']) || 0), col: colour(pt.t['building:colour'] || (host && host.t['building:colour'])), rcol: colour(pt.t['roof:colour']), n: (host && host.t.name) || pt.t.name || '', part: pt.t['building:part'] , ...facts(pt.t, host) });
}
for (const o of outlines) {
  let [b, h] = heights(o.t, o.kind, o.a);
  if (o.parts && !((o.pa || 0) > o.a * 0.55) && o.ph) { const s = o.ph.slice().sort((x, y) => x - y); h = Math.min(h, s[s.length >> 1]); } // partial body: as tall as its typical ground part
  o.top = Math.max(o.top, h);
  // an outline whose 3D parts only cover a fraction of it (e.g. the Ontario Science Centre) still needs its own body
  if (o.parts && (o.pa || 0) > o.a * 0.55) continue;
  if (o.parts) o.partial = 1;
  if (o.kind === 'roof' && !isFinite(num(o.t.min_height))) continue; // free-standing canopies
  if (o.far && o.top < 26) continue;
  o.vi = vols.length;
  vols.push({ p: pack(o.r), b: r1(b), h: r1(h), k: o.kind, f: o.far ? 1 : 0, rs: SHAPES[o.t['roof:shape']] || 0, rh: r1(num(o.t['roof:height']) || 0), col: colour(o.t['building:colour']), rcol: colour(o.t['roof:colour']), n: o.t.name || '', ...facts(o.t) });
}
// solid footprints for collisions (play area only)
// ---- solid footprints for collisions. Only what stands on the ground blocks you: a building made of 3D parts collides
// with its ground-level parts, and skyways / bridges / anything that starts above head height never do.
const solids = [];
{
  // sample the drivable streets so buildings that a street runs straight through (covered passages) can be opened up
  const RS = new Map(), K = 25, key = (x, z) => Math.floor(x / K) + ',' + Math.floor(z / K);
  for (const ed of edges) for (let k = 1; k < ed.p.length; k++) { const a = ed.p[k - 1], b = ed.p[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d <= L; d += 2.5) { const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L, kk = key(x, z); (RS.get(kk) || RS.set(kk, []).get(kk)).push([x, z]); } }
  const roadHits = r => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of r) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    let n = 0; for (let i = Math.floor(x0 / K); i <= Math.floor(x1 / K); i++) for (let j = Math.floor(z0 / K); j <= Math.floor(z1 / K); j++) for (const q of RS.get(i + ',' + j) || []) if (inside(q, r)) n++; return n; };
  let opened = 0;
  for (const o of outlines) {
    if (o.far || o.kind === 'roof' || o.kind === 'bridge') continue;
    const n = o.t.name || '';
    if (o.pl) { for (const q of o.pl) { if (q.b > 2) continue; if (roadHits(q.r) >= 1) { vols[q.vi].b = Math.max(vols[q.vi].b, 4.6); opened++; continue; } solids.push({ p: pack(q.r), h: r1(q.h), n }); } if (!o.partial) continue; }
    const [b] = heights(o.t, o.kind, o.a);
    if (b > 2) continue;
    if (roadHits(o.r) >= 2) { if (o.vi !== undefined) { vols[o.vi].b = Math.max(vols[o.vi].b, 4.6); vols[o.vi].sf = ''; } opened++; continue; } // a street runs through it: lift it into an archway
    solids.push(o.vi !== undefined ? { v: o.vi, h: r1(o.top), n } : { p: pack(o.r), h: r1(o.top), n }); // v: same outline as that vol
  }
  console.log('buildings opened up over streets:', opened);
}

// ---- shopfront flags: wall edges that face a street get storefronts
{
  const RH = new Map(), RK = 40, rk = (x, z) => Math.floor(x / RK) + ',' + Math.floor(z / RK);
  const segs = [];
  for (const ed of edges) for (let k = 1; k < ed.p.length; k++) segs.push([ed.p[k - 1], ed.p[k], ed.hw, ed.n]);
  segs.forEach((s, i) => { const x0 = Math.min(s[0][0], s[1][0]), x1 = Math.max(s[0][0], s[1][0]), z0 = Math.min(s[0][1], s[1][1]), z1 = Math.max(s[0][1], s[1][1]); for (let x = Math.floor((x0 - 30) / RK); x <= Math.floor((x1 + 30) / RK); x++) for (let z = Math.floor((z0 - 30) / RK); z <= Math.floor((z1 + 30) / RK); z++) { const kk = x + ',' + z; (RH.get(kk) || RH.set(kk, []).get(kk)).push(i); } });
  const NOSHOP = new Set([...HOUSE, 'school', 'university', 'church', 'cathedral', 'train_station', 'civic', 'public', 'stadium', 'roof', 'parking', 'construction', 'college', 'dormitory', 'hospital', 'government', 'townhall']);
  for (const v of vols) {
    // every street-facing wall within 40 m of a street can hold a real shop; only walls that get one become shopfronts (below)
    if (v.f || v.b > 0.5 || v.h < 3 || /^(roof|parking|construction|stadium)$/.test(v.k) || v.p.length > 60) { v.sf = ''; continue; }
    let flags = ''; v.sfn = []; v.sfd = [];
    for (let i = 0; i < v.p.length; i++) {
      const a = v.p[i], c = v.p[(i + 1) % v.p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 4) { flags += '0'; continue; }
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L;
      let ok = false;
      const near = new Set(); for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (const si of RH.get(rk(mx + ox * 40, mz + oz * 40)) || []) near.add(si);
      for (const si of near) {
        const [p, q, hw] = segs[si], dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((mx - p[0]) * dx + (mz - p[1]) * dz) / l2)), px = p[0] + dx * t, pz = p[1] + dz * t, d = Math.hypot(mx - px, mz - pz);
        if (d < hw + 40 && ((px - mx) * nx + (pz - mz) * nz) / (d || 1) > 0.6 && !(v.sfd[i] < d - hw)) { ok = true; v.sfn[i] = segs[si][3]; v.sfd[i] = Math.max(0, d - hw); }
      }
      flags += ok ? '1' : '0';
    }
    v.sf = flags.includes('1') ? flags : '';
  }
}

// ---- real shops: every named shop / restaurant / café from OpenStreetMap goes on the shopfront wall it stands behind
{
  // window display kinds the game can draw: 0 café, 1 bakery, 2 florist, 3 fashion, 4 books & hobby, 5 pharmacy & health, 6 restaurant & bar, 7 general store / services
  const KIND = t => {
    const s = t.shop || '', a = t.amenity || '';
    if (a === 'cafe' || /^(coffee|tea)$/.test(s)) return 0;
    if (/^(bakery|pastry|confectionery|chocolate|deli|cheese|butcher|seafood|greengrocer|ice_cream)$/.test(s) || a === 'ice_cream') return 1;
    if (/^(florist|garden_centre|plant)$/.test(s)) return 2;
    if (/^(clothes|shoes|fashion|boutique|jewelry|bag|watches|cosmetics|beauty|hairdresser|perfumery|fashion_accessories|tailor|optician|second_hand|charity)$/.test(s) || t.craft === 'jeweller' || t.craft === 'tailor') return 3;
    if (/^(books|stationery|music|musical_instrument|video_games|games|toys|art|antiques|craft|frame|hobby|anime|comic|camera|photo|gift|tobacco|e-cigarette|cannabis)$/.test(s)) return 4;
    if (a === 'pharmacy' || /^(chemist|medical_supply|hearing_aids|nutrition_supplements|herbalist)$/.test(s) || /^(dentist|clinic|doctors|veterinary)$/.test(a)) return 5;
    if (/^(restaurant|fast_food|bar|pub|nightclub|food_court)$/.test(a) || t.craft === 'brewery') return 6;
    return 7;
  };
  const SUB = t => { const c = (t.cuisine || '').split(';')[0].replace(/_/g, ' '); const s = (t.shop || t.amenity || t.craft || '').replace(/_/g, ' ');
    const w = c && /restaurant|fast_food|cafe|bar|pub/.test(t.amenity || '') ? c : s; return w === 'yes' ? '' : w.toUpperCase().slice(0, 16); };
  const raw = load(path.join(OSM, 'shops.json'));
  // street names compared loosely: "Spadina Ave" = "Spadina Avenue", "Queen St W" = "Queen Street West"
  const SN = s => (s || '').toLowerCase().replace(/\./g, '').replace(/\b(street|st|avenue|ave|av|road|rd|boulevard|blvd|drive|dr|crescent|cres|court|ct|place|pl|lane|ln|square|sq|terrace|terr|parkway|pkwy|gate|circle|circ|trail|way|east|west|north|south|e|w|n|s)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const BRANDS = /^(McDonald|Tim Hortons|Starbucks|Shoppers Drug Mart|LCBO|Subway|Pizza Pizza|Rexall|Second Cup|A&W|Popeyes|Metro|No Frills|Loblaws|Winners|Indigo|Uniqlo|lululemon|Apple|Dollarama|TD|RBC|Scotiabank|CIBC|BMO|Circle K|7-Eleven|Burger King|Wendy|KFC|Chipotle|Booster Juice|The Beer Store|Sobeys|FreshCo|Five Guys|Harvey's|Mary Brown|Domino|Pizza Hut|Taco Bell|Chick-fil-A|Shake Shack|Pizzaiolo|Freshii|Pret|Balzac|Aroma|Sephora|H&M|Zara|Gap|Foot Locker|Sport Chek|Best Buy|Canadian Tire|Staples|Bulk Barn|Petsmart|Pet Valu|Shoppers|Whole Foods|Longo|Farm Boy|Food Basics|Rabba|Petro-Canada|Esso|Shell)/i;
  const SH = new Map(), K = 30, key = (i, j) => i + ',' + j, walls = [];
  vols.forEach((v, vi) => { if (!v.sf) return; for (let i = 0; i < v.p.length; i++) { if (v.sf[i] !== '1') continue; const a = v.p[i], c = v.p[(i + 1) % v.p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 3) continue; const w = { vi, i, a, c, L, st: SN(v.sfn && v.sfn[i]), set: v.sfd[i] || 0, nb: Math.max(1, Math.round(L / 6.5)), list: [] }; walls.push(w);
    for (let x = Math.floor((Math.min(a[0], c[0]) - 35) / K); x <= Math.floor((Math.max(a[0], c[0]) + 35) / K); x++) for (let z = Math.floor((Math.min(a[1], c[1]) - 35) / K); z <= Math.floor((Math.max(a[1], c[1]) + 35) / K); z++) { const kk = key(x, z); (SH.get(kk) || SH.set(kk, []).get(kk)).push(w); } } });
  const near = (p, r) => { const out = new Set(); for (let x = Math.floor((p[0] - r) / K); x <= Math.floor((p[0] + r) / K); x++) for (let z = Math.floor((p[1] - r) / K); z <= Math.floor((p[1] + r) / K); z++) for (const w of SH.get(key(x, z)) || []) out.add(w); return out; };
  let placed = 0, cand = 0; const seen = new Set();
  for (const e of raw) {
    const t = e.tags || {}; if (!t.name) continue; const g = e.type === 'node' ? e : e.center; if (!g) continue;
    const p = proj({ lat: g.lat, lon: g.lon }); if (!inBox(p, PLAY)) continue;
    const dk = t.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + Math.round(p[0] / 15) + ',' + Math.round(p[1] / 15); if (seen.has(dk)) continue; seen.add(dk);
    const st = SN(t['addr:street']), own = e.type !== 'node', brand = BRANDS.test(t.name);
    const pr = (own ? 4 : 0) + (brand ? 2 : 0) + (st ? 1 : 0) + (t['addr:housenumber'] ? 1 : 0);
    let best = null, bs = 1e9;
    for (const w of near(p, 30)) {
      const dx = w.c[0] - w.a[0], dz = w.c[1] - w.a[1], l2 = dx * dx + dz * dz || 1, tt = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dz) / l2));
      let s = Math.hypot(p[0] - w.a[0] - dx * tt, p[1] - w.a[1] - dz * tt); if (s > 30) continue;
      if (inside(p, vols[w.vi].p)) s *= .4;                        // the shop is inside this building
      if (st && w.st) s *= w.st === st ? .25 : 2.5;                 // and on the street its address says
      s += w.set * .15;                                             // prefer walls right on the sidewalk
      if (s < bs) { bs = s; best = { w, tt }; }
    }
    if (!best) continue; cand++;
    const k = KIND(t), sub = SUB(t);
    if (own) { // a shop that is its own building signs every wall of it that faces its street (or every shopfront wall)
      const v = vols[best.w.vi], ws = walls.filter(w => w.vi === best.w.vi), mine = ws.filter(w => st && w.st === st);
      for (const w of mine.length ? mine : ws) w.list.push({ name: t.name, k, sub, pr: pr + 1, tt: .5, span: 1 });
    } else best.w.list.push({ name: t.name, k, sub, pr, tt: best.tt });
  }
  // fill each wall's bays: a whole-building shop takes the wall; otherwise the best-documented shops win, in street order
  for (const w of walls) {
    if (!w.list.length) continue; const v = vols[w.vi];
    const span = w.list.filter(s => s.span).sort((a, b) => b.pr - a.pr)[0];
    if (span) { (v.sh || (v.sh = [])).push([w.i, .5, span.name.slice(0, 34), span.k, span.sub, 1]); placed++; continue; }
    const pick = w.list.sort((a, b) => b.pr - a.pr).slice(0, w.nb).sort((a, b) => a.tt - b.tt), used = new Array(w.nb).fill(false);
    for (const s of pick) { let j = Math.min(w.nb - 1, Math.floor(s.tt * w.nb)), d = 0; while (used[j] && d < w.nb) { d++; const jj = Math.min(w.nb - 1, Math.max(0, Math.floor(s.tt * w.nb) + (d % 2 ? (d + 1) / 2 : -d / 2))); if (!used[jj]) j = jj; }
      if (used[j]) continue; used[j] = true; (v.sh || (v.sh = [])).push([w.i, Math.round((j + .5) / w.nb * 1000) / 1000, s.name.slice(0, 34), s.k, s.sub]); placed++; }
  }
  // only walls that carry a real shop are shopfronts: no made-up shops anywhere
  for (const v of vols) { if (v.sf) { const has = new Set((v.sh || []).map(s => s[0])); v.sf = has.size ? v.p.map((_, i) => has.has(i) ? '1' : '0').join('') : ''; } delete v.sfn; delete v.sfd; }
  console.log('shops placed on storefronts:', placed, 'matched', cand, 'of', raw.length);
}

// ---- landmarks we model by hand (positions from the data)
const find = re => outlines.find(o => re.test(o.t.name || ''));
const lm = {};
for (const [k, re] of Object.entries({ rogers: /^Rogers Centre$/, arena: /^Scotiabank Arena$/, union: /^Union Station$/, eaton: /Eaton Centre/, cityhall: /^Toronto City Hall$/, oldcityhall: /^Old City Hall$/, cn: /^CN Tower$/, market: /St\.? Lawrence Market South/, legislature: /Ontario Legislative Building/,
  sciencecentre: /^Ontario Science Cent(re|er)$/, agakhan: /^Aga Khan Museum$/, nycivic: /North York Civic Cent(re|er)/, meridian: /Meridian Arts Cent(re|er)|Toronto Centre for the Arts/,
  eycivic: /East York Civic Cent(re|er)/, brickworks: /Brick Works|Kiln Building/, todmorden: /Todmorden Mills/, donmills: /Shops at Don Mills/, ismaili: /Ismaili Cent(re|er)/ })) {
  const o = find(re); if (o) lm[k] = { c: [r1(o.c[0]), r1(o.c[1])], p: pack(o.r), h: r1(o.top) };
}
for (const pz of plazas) if (/Sankofa|Nathan Phillips|Maple Leaf Square|Mel Lastman Square/.test(pz.n)) lm[pz.n] = { c: centroid(pz.p).map(r1), p: pz.p };
for (const g of green) if (/^(Edwards Gardens|Taylor Creek Park|Todmorden Mills Park|Don Valley Brick Works Park|Mel Lastman Square|Sunnybrook Park|Earl Bales Park|E\.? ?T\.? Seton Park|Withrow Park|Riverdale Park East|Leaside Park)$/.test(g.n) && !lm[g.n]) { let best = g; for (const h of green) if (h.n === g.n && Math.abs(area(h.p)) > Math.abs(area(best.p))) best = h; lm[g.n] = { c: centroid(best.p).map(r1), p: best.p }; }

// ---- places for the map list / teleport: real Toronto spots, matched by name in the data (or placed by coordinates)
const PLACES = [
  ['Downtown', [
    ['CN Tower', /^CN Tower$/], ['Union Station', /^Union Station$/], ['Rogers Centre', /^Rogers Centre$/], ['Scotiabank Arena', /^Scotiabank Arena$/],
    ["Ripley's Aquarium", /^Ripley's Aquarium of Canada$/], ['Hockey Hall of Fame', /^Hockey Hall of Fame$/], ['Roundhouse Park', /^Roundhouse Park$/],
    ['Eaton Centre', /^CF Toronto Eaton Centre$/], ['Sankofa Square', /^Sankofa Square$/], ['Nathan Phillips Square', /^Nathan Phillips Square$/], ['Old City Hall', /^Old City Hall$/],
    ['St. Lawrence Market', /St\.? Lawrence Market South/], ['Berczy Park', /^Berczy Park$/], ['Gooderham (Flatiron) Building', /^Gooderham Building$/],
    ['Roy Thomson Hall', /^Roy Thomson Hall$/], ['Massey Hall', /^Massey Hall$/], ['Princess of Wales Theatre', /^Princess of Wales Theatre$/],
    ['Art Gallery of Ontario', /^Art Gallery of Ontario$/], ['Sharp Centre for Design (OCAD)', /^Sharp Centre for Design$/], ['Chinatown', null, 43.6529, -79.3980],
    ['Kensington Market', null, 43.6545, -79.4005], ['Osgoode Hall', /^Osgoode Hall$/], ["Queen's Park", /Ontario Legislative Building/],
    ['University College (U of T)', /^University College$/], ['Hart House', /^Hart House$/], ['Maple Leaf Gardens', /^Maple Leaf Gardens$/], ['Allan Gardens', /^Allan Gardens Conservatory$/],
    ['Harbourfront Centre', /^Harbourfront Centre Main Building$/], ['HTO Park', /^HTO Park$/], ['Sugar Beach', /^Sugar Beach$/], ['Fort York', /^Fort York National Historic Site$/],
    ['Trinity Bellwoods Park', /^Trinity Bellwoods Park$/], ['Distillery District', /Distillery/, 43.6503, -79.3596],
    ['Riverdale Farm', /^Riverdale Farm$/, 43.6670, -79.3610], ['Yorkville', null, 43.6710, -79.3930], ['Honest Ed’s Alley / Mirvish Village', null, 43.6644, -79.4115], ['Christie Pits', /^Christie Pits Park$/]]],
  ['Midtown', [
    ['Royal Ontario Museum', /^Royal Ontario Museum$/], ['Toronto Reference Library', /^Toronto Reference Library$/], ['Casa Loma', /^Casa Loma$/, 43.6780, -79.4094],
    ['Mount Pleasant Cemetery', /^Mount Pleasant Cemetery$/], ['Yonge & Eglinton', null, 43.7066, -79.3984], ['Sunnybrook Park', /^Sunnybrook Park$/]]],
  ['East York & Don Mills', [
    ['Danforth Music Hall', /^The Danforth Music Hall$/], ['Greektown on the Danforth', null, 43.6779, -79.3500], ['Evergreen Brick Works', /^Kiln Building$|Brick Works/],
    ['Todmorden Mills', /^Todmorden Mills Park$/], ['East York Civic Centre', /East York Civic Cent(re|er)/], ['Leaside', null, 43.7090, -79.3690],
    ['Thorncliffe Park', null, 43.7050, -79.3480], ['Flemingdon Park', /^Flemingdon Park$/], ['Flemingdon Park Golf Club', /^Flemingdon Park Golf Club$/], ['E.T. Seton Park', /^E\.? ?T\.? Seton Park$/], ['Ontario Science Centre', /^Ontario Science Cent(re|er)$/], ['Aga Khan Museum', /^Aga Khan Museum$/],
    ['Shops at Don Mills', /Shops at Don Mills/], ['Edwards Gardens', /^Edwards Gardens$/], ['Toronto Botanical Garden', /^Toronto Botanical Garden$/]]],
  ['North York', [
    ['Mel Lastman Square', /^Mel Lastman Square$/], ['North York Civic Centre', /North York Civic Cent(re|er)/], ['Meridian Arts Centre', /Meridian Arts Cent(re|er)|Toronto Centre for the Arts/],
    ['Empress Walk', /^Empress Walk$/], ['Gibson House Museum', /^Gibson House$/], ['Yonge Sheppard Centre', /^Yonge Sheppard Centre$/], ['Bayview Village Park', /^Bayview Village Park$/]]],
];
const places = [];
{
  const named = []; // [name, polygon] from buildings, parks and squares, biggest first so the main footprint wins
  for (const o of outlines) if (o.t.name) named.push([o.t.name, o.r, o.a]);
  for (const g of green) if (g.n) named.push([g.n, g.p, Math.abs(area(g.p))]);
  for (const z of plazas) if (z.n) named.push([z.n, z.p, Math.abs(area(z.p))]);
  named.sort((a, b) => b[2] - a[2]);
  for (const [area_, list] of PLACES) for (const [n, re, lat, lon] of list) {
    const hit = re && named.find(q => re.test(q[0]));
    const c = hit ? centroid(hit[1]) : lat ? proj({ lat, lon }) : null;
    if (!c) { console.log('place not found:', n); continue; }
    if (!inBox(c, PLAY)) { console.log('place outside the play area:', n); continue; }
    places.push({ n, a: area_, c: c.map(r1) });
  }
}

// ---- address book for "go to an address": every street address, plus every named shop / restaurant, in the play area
{
  const A = load(path.join(OSM, 'addr.json')), S = load(path.join(OSM, 'shops.json'));
  const streets = new Map(), seen = new Set();
  for (const e of A) { const t = e.tags || {}, g = e.type === 'node' ? e : e.center; if (!g || !t['addr:street'] || !t['addr:housenumber']) continue;
    const p = proj({ lat: g.lat, lon: g.lon }); if (!inBox(p, PLAY, 50)) continue;
    for (const num of String(t['addr:housenumber']).split(/[;,]/).map(s => s.trim()).filter(Boolean).slice(0, 4)) {
      const k = t['addr:street'] + '|' + num; if (seen.has(k)) continue; seen.add(k);
      let L = streets.get(t['addr:street']); if (!L) streets.set(t['addr:street'], L = []); L.push(num.replace(/[|;]/g, '') + ';' + Math.round(p[0]) + ';' + Math.round(p[1])); } }
  const names = [], seenN = new Set();
  for (const e of S) { const t = e.tags || {}, g = e.type === 'node' ? e : e.center; if (!g || !t.name) continue; const p = proj({ lat: g.lat, lon: g.lon }); if (!inBox(p, PLAY, 50)) continue;
    const k = t.name + Math.round(p[0] / 20) + ',' + Math.round(p[1] / 20); if (seenN.has(k)) continue; seenN.add(k);
    const ad = t['addr:housenumber'] && t['addr:street'] ? t['addr:housenumber'] + ' ' + t['addr:street'] : '';
    names.push([t.name, Math.round(p[0]), Math.round(p[1]), ad].join(';')); }
  const book = { attribution: 'Map data © OpenStreetMap contributors, ODbL 1.0', st: [...streets].map(([n, L]) => n + '|' + L.join('|')), sh: names };
  fs.writeFileSync(path.join(ROOT, 'assets/addresses.json'), JSON.stringify(book));
  console.log('address book:', seen.size, 'addresses on', streets.size, 'streets,', names.length, 'named places,', (fs.statSync(path.join(ROOT, 'assets/addresses.json')).size / 1e6).toFixed(2), 'MB');
}

// ---- ground detail (assets/osm/detail, from tools/fetch-detail.mjs): parking lots with their stalls, playgrounds and their
// equipment, dog parks, running tracks, outdoor pools, footpaths through parks, and individually mapped trees
const lots = [], playgrounds = [], dogParks = [], tracks = [], pools = [], paths = [], trees = [];
{
  const DD = path.join(OSM, 'detail'), D = n => { // one extract, or all its pieces (paths_0.json, paths_1.json …) de-duplicated
    const fs_ = fs.existsSync(DD) ? fs.readdirSync(DD).filter(f => f === n + '.json' || new RegExp('^' + n + '_\\d+\\.json$').test(f)) : [], seen = new Set(), out = [];
    for (const f of fs_) for (const e of load(path.join(DD, f))) { const k = e.type + e.id; if (!seen.has(k)) { seen.add(k); out.push(e); } }
    return out; };
  // green areas, hashed, to find what lies in a park
  const GH = new Map(), GK = 100, gk = (i, j) => i + ',' + j;
  green.forEach((g, gi) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of g.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
    for (let i = Math.floor(x0 / GK); i <= Math.floor(x1 / GK); i++) for (let j = Math.floor(z0 / GK); j <= Math.floor(z1 / GK); j++) (GH.get(gk(i, j)) || GH.set(gk(i, j), []).get(gk(i, j))).push(gi); });
  const greenAt = (x, z, park) => { let best = -1; for (const gi of GH.get(gk(Math.floor(x / GK), Math.floor(z / GK))) || []) { const g = green[gi]; if ((!park || g.pk) && inside([x, z], g.p) && (best < 0 || Math.abs(area(g.p)) < Math.abs(area(green[best].p)))) best = gi; } return best; };
  const rings = e => e.type === 'way' ? [e.geometry] : (e.members || []).filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry);
  const inPlay = c => inBox(c, PLAY), solidAtP = (x, z) => !!hostOf([x, z]);

  // parking lots: asphalt everywhere in the scene, painted stalls in the play area
  const STALL_W = 2.7, STALL_D = 5.4, AISLE = 6.6;
  let nStalls = 0;
  for (const e of D('parking')) {
    const t = e.tags || {};
    if (/^(multi-storey|underground|rooftop|sheds|carports|garage_boxes)$/.test(t.parking || '') || t.building || t.location === 'underground' || (t.layer | 0) < 0) continue;
    for (const g of rings(e)) {
      if (!g) continue; const r = ring(g); if (!r) continue; const c = centroid(r), A = Math.abs(area(r));
      if (A < 60 || !inScene(c) || hostOf(c)) continue;
      const lot = { p: pack(r) }; lots.push(lot);
      if (!inPlay(c) || A > 120000 || t.access === 'private' && A < 150) continue;
      // the lot's main direction: the one its edges line up with, weighted by length
      const hist = new Float64Array(90);
      for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 90 + 90) % 90; hist[Math.floor(ang) % 90] += L; hist[(Math.floor(ang) + 1) % 90] += L * .5; hist[(Math.floor(ang) + 89) % 90] += L * .5; }
      const th = hist.indexOf(Math.max(...hist)) * Math.PI / 180, ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux;
      const U = q => q[0] * ux + q[1] * uz, V = q => q[0] * vx + q[1] * vz, at = (u, v) => [u * ux + v * vx, u * uz + v * vz];
      const us = r.map(U), vs = r.map(V), u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
      const ok = (u, v, du, dv) => [[-du, -dv], [du, -dv], [du, dv], [-du, dv], [0, 0]].every(([a, b]) => { const q = at(u + a, v + b); return inside(q, r) && !solidAtP(q[0], q[1]) && !onRoad(q[0], q[1], .5); });
      // double-loaded aisles: [stalls facing +v][aisle][stalls facing -v], modules back to back; try a few phases, keep the best
      let best = [];
      for (const ph of [0, 3, 6, 9, 12]) {
        const st = [];
        for (let m = v0 + .4 - ph; m < v1; m += STALL_D * 2 + AISLE) for (const [vc, dir] of [[m + STALL_D / 2, 1], [m + STALL_D + AISLE + STALL_D / 2, -1]]) {
          if (vc - STALL_D / 2 < v0 || vc + STALL_D / 2 > v1) continue;
          // the aisle in front of the row must be open too
          for (let u = u0 + .6 + STALL_W / 2; u + STALL_W / 2 < u1; u += STALL_W) if (ok(u, vc, STALL_W / 2 - .15, STALL_D / 2 - .15) && ok(u, vc + dir * (STALL_D / 2 + AISLE / 2), .3, .3)) {
            const q = at(u, vc), fwd = [vx * dir, vz * dir]; st.push([r1(q[0]), r1(q[1]), Math.round(Math.atan2(fwd[0], fwd[1]) * 100) / 100]); }
        }
        if (st.length > best.length) best = st;
      }
      if (best.length >= 4) { lot.s = best.slice(0, 600); lot.th = Math.round(th * 1000) / 1000; nStalls += lot.s.length; }
    }
  }

  // playgrounds and the equipment mapped in them
  const LE = D('leisure'), EQ = [];
  const EQK = { slide: 'sl', swing: 'sw', basketswing: 'sw', baby_swing: 'sw', climbingframe: 'cf', structure: 'st', playhouse: 'ph', springy: 'sp', seesaw: 'ss', roundabout: 'rb', sandpit: 'sd', climbingwall: 'cf', balancebeam: 'bb', zipwire: 'zw', splash_pad: 'wp', water: 'wp', spinner: 'rb', horizontal_bar: 'cf', activitypanel: 'ap', funnel_ball: 'ap' };
  for (const e of LE) {
    const t = e.tags || {};
    if (t.playground && !t.leisure) { const g = e.type === 'node' ? e : e.geometry && { lat: e.geometry.reduce((s, q) => s + q.lat, 0) / e.geometry.length, lon: e.geometry.reduce((s, q) => s + q.lon, 0) / e.geometry.length }; if (!g) continue;
      const k = EQK[t.playground]; if (k) { const q = proj(g); if (inPlay(q)) EQ.push([k, r1(q[0]), r1(q[1])]); } }
  }
  const pgIdx = [];
  for (const e of LE) {
    const t = e.tags || {}; if (!t.leisure) continue;
    if (t.indoor === 'yes' || t.location === 'indoor' || t.location === 'roof' || (t.level | 0) > 0) continue;
    if (e.type === 'node') { if (t.leisure === 'playground') { const q = proj(e); if (inPlay(q) && !hostOf(q)) { const pg = { c: [r1(q[0]), r1(q[1])], eq: [] }; playgrounds.push(pg); pgIdx.push(pg); } } continue; }
    for (const g of rings(e)) {
      if (!g || g.length < 4) continue; const r = ring(g); if (!r) continue; const c = centroid(r), A = Math.abs(area(r));
      if (!inPlay(c)) continue;
      if (t.leisure === 'playground') { if (A < 15 || A > 20000 || hostOf(c)) continue; const pg = { p: pack(r), c: c.map(r1), eq: [] }, sf = t.surface || ''; if (/rubber|tartan|synthetic|acrylic/.test(sf)) pg.sf = 'rubber'; else if (/sand|pebble|gravel/.test(sf)) pg.sf = 'sand'; else if (/grass/.test(sf)) pg.sf = 'grass'; playgrounds.push(pg); pgIdx.push(pg); }
      else if (t.leisure === 'dog_park') { if (A > 30) dogParks.push(pack(r)); }
      else if (t.leisure === 'track' && t.area !== 'no' && A > 400 && A < 40000) tracks.push(pack(r));
      else if (t.leisure === 'swimming_pool' && A > 20 && A < 3000 && !hostOf(c) && t.covered !== 'yes') pools.push(pack(r));
    }
  }
  // each piece of equipment goes to the playground it is in (or right next to)
  let nEq = 0;
  for (const [k, x, z] of EQ) {
    let best = null, bd = 25;
    for (const pg of pgIdx) { const d = pg.p && inside([x, z], pg.p) ? 0 : Math.hypot(pg.c[0] - x, pg.c[1] - z); if (d < bd) { bd = d; best = pg; } }
    if (best) { best.eq.push([k, x, z]); nEq++; }
  }
  for (const pg of playgrounds) if (!pg.eq.length) delete pg.eq;

  // footpaths: the ones through parks, squares and campus lawns (sidewalks along streets are drawn by the game)
  const parkLen = new Map();
  for (const e of D('paths')) {
    const t = e.tags || {}; if (!e.geometry || t.bridge === 'yes' || t.covered === 'yes') continue;
    const pts = dp(e.geometry.map(proj), .4); if (!pts.some(q => inPlay(q))) continue;
    let n = 0, inG = 0, park = -1;
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < L; d += 6) { const x = a[0] + (b[0] - a[0]) * d / L, z = a[1] + (b[1] - a[1]) * d / L; n++; const gi = greenAt(x, z); if (gi >= 0 && !onRoad(x, z, 2)) { inG++; if (green[gi].pk) park = gi; } } }
    if (!n || inG / n < .6) continue;
    const w = t.highway === 'pedestrian' ? 4 : t.highway === 'cycleway' || /^(asphalt|paved|concrete)$/.test(t.surface || '') && t.highway !== 'path' ? 2.6 : t.highway === 'path' ? 1.6 : 2.2;
    const soft = /^(dirt|ground|earth|grass|unpaved|woodchips|mud|sand|compacted|fine_gravel|gravel)$/.test(t.surface || '') || (t.highway === 'path' && !t.surface);
    paths.push({ p: pack(pts), w, ...(soft ? { s: 1 } : {}) });
    if (park >= 0) { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); parkLen.set(park, (parkLen.get(park) || 0) + L); }
  }
  for (const [gi, L] of parkLen) if (L > 60) green[gi].rp = 1; // the game uses these paths instead of making some up

  // trees mapped one by one (mostly in parks and along some streets)
  const treeCount = new Map();
  for (const e of D('trees')) {
    const q = proj(e); if (!inPlay(q) || hostOf(q) || onRoad(q[0], q[1], .5)) continue;
    trees.push(r1(q[0]), r1(q[1]));
    const gi = greenAt(q[0], q[1]); if (gi >= 0) treeCount.set(gi, (treeCount.get(gi) || 0) + 1);
  }
  for (const [gi, n] of treeCount) green[gi].rt = n; // how many real trees this park has: the game only adds made-up ones to make up the rest
  console.log('detail:', lots.length, 'parking lots,', nStalls, 'stalls,', playgrounds.length, 'playgrounds with', nEq, 'mapped pieces,', dogParks.length, 'dog parks,', tracks.length, 'tracks,', pools.length, 'pools,', paths.length, 'park paths,', trees.length / 2, 'mapped trees');
}

// ---- real roof colours sampled from the city's aerial photos (assets/osm/roofs.json, from tools/roof-colours.py)
{
  const f = path.join(OSM, 'roofs.json'), R = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)).roofs : {};
  let n = 0; for (const v of vols) { if (v.rcol) continue; const c = centroid(v.p), k = Math.round(c[0]) + ',' + Math.round(c[1]); if (R[k]) { v.rcol = R[k]; v.rr = 1; n++; } }
  console.log('roof colours from aerial photos:', n);
}

// ---- which wall of a low building faces its street (fr = edge index): porches, bay windows and fire escapes go by it
{
  let n = 0;
  for (const v of vols) {
    if (v.f || v.h > 30 || v.b > 1 || v.p.length > 24) continue;
    const p = v.p, a = Math.abs(area(p)); if (a > 4000) continue;
    let best = -1, bs = 1e9;
    for (let i = 0; i < p.length; i++) {
      const A = p[i], C = p[(i + 1) % p.length], L = Math.hypot(C[0] - A[0], C[1] - A[1]); if (L < 2.5) continue;
      const nx = (C[1] - A[1]) / L, nz = -(C[0] - A[0]) / L, d = roadDist((A[0] + C[0]) / 2 + nx * 3, (A[1] + C[1]) / 2 + nz * 3);
      const s = d - Math.min(L, 12) * .25; if (d < 35 && s < bs) { bs = s; best = i; }
    }
    if (best >= 0) { v.fr = best; n++; }
  }
  console.log('street-facing walls found:', n);
}

const out = {
  attribution: 'Map data © OpenStreetMap contributors, ODbL 1.0. Building heights and roof colours: City of Toronto, Open Government Licence – Toronto',
  frame: { lat0: LAT0, lon0: LON0, rotDeg: 17.2 }, play: PLAY, scene: SCENE, zones: ZONES,
  nodes, edges, sceneRoads, tram, gardiner, rail, platforms, plazas, green, railLand, islands, land, landExtra, basins,
  vols, solids, landmarks: lm, places,
  lots, playgrounds, dogParks, tracks, pools, paths, trees,
};
fs.writeFileSync(path.join(ROOT, 'assets/toronto.json'), JSON.stringify(out));
const playVols = vols.filter(v => inBox(centroid(v.p), PLAY)).length;
console.log({ nodes: nodes.length, edges: edges.length, aiEdges: edges.filter(e => e.ai).length, tramEdges: edges.filter(e => e.tram).length, sceneRoads: sceneRoads.length, tram: tram.length, gardiner: gardiner.length, rail: rail.length, platforms: platforms.length, plazas: plazas.length, green: green.length, railLand: railLand.length, islands: islands.length, shore: shore.length, basins: basins.length, vols: vols.length, playVols, solids: solids.length, landmarks: Object.keys(lm), sizeMB: (fs.statSync(path.join(ROOT, 'assets/toronto.json')).size / 1e6).toFixed(2) });
