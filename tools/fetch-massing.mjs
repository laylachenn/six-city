// Downloads the City of Toronto 3D Massing model (every building in the city, with heights measured from lidar / site plans)
// and keeps the pieces inside the game's scene, in the game's local metres, as assets/osm/massing.json.
// build-map.mjs uses it for real building heights, and to split a footprint into its podium and tower(s).
// Contains information licensed under the Open Government Licence – Toronto: https://open.toronto.ca/open-data-license/
// usage: node tools/fetch-massing.mjs [path/to/3DMassingShapefile_*_WGS84.zip]   (downloads the 2025 edition when no zip is given)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { proj, CORRIDOR } from './zones.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/387b2e3b-2a76-4199-8b3b-0b7d22e2ec10/resource/667237d6-4d3c-4cf3-8cb7-e91c48d59375/download/3dmassingshapefile_2025_wgs84.zip';
const SCENE = { x0: -3000, x1: 3100, z0: -3200, z1: 3600 };
const inBox = (p, b, m = 0) => p[0] > b.x0 - m && p[0] < b.x1 + m && p[1] > b.z0 - m && p[1] < b.z1 + m;
const keep = p => inBox(p, SCENE) || inBox(p, CORRIDOR, 400);

// ---- get the shapefile
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'massing-'));
let zip = process.argv[2];
if (!zip) {
  zip = path.join(tmp, 'massing.zip');
  console.log('downloading the 3D Massing shapefile (~80 MB)…');
  const r = await fetch(URL); if (!r.ok) throw new Error('download failed: ' + r.status);
  fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
}
execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
const base = fs.readdirSync(tmp).find(f => /\.shp$/i.test(f)); if (!base) throw new Error('no .shp in ' + zip);
const shp = fs.readFileSync(path.join(tmp, base)), dbf = fs.readFileSync(path.join(tmp, base.replace(/\.shp$/i, '.dbf')));

// ---- attribute table (dBase III)
const nRec = dbf.readUInt32LE(4), hLen = dbf.readUInt16LE(8), rLen = dbf.readUInt16LE(10), fields = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*/s, ''), len: dbf[o + 16] });
const attr = i => { let o = hLen + i * rLen + 1; const r = {}; for (const f of fields) { r[f.name] = dbf.toString('latin1', o, o + f.len).trim(); o += f.len; } return r; };

// ---- geometry: (multi)polygons in Web Mercator -> lat/lon -> game metres
const RE = 6378137, toLL = (x, y) => ({ lon: x / RE * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(y / RE)) - Math.PI / 2) * 180 / Math.PI });
const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
const r1 = v => Math.round(v * 10) / 10;
const pieces = []; let o = 100, i = 0;
while (o < shp.length) {
  const clen = shp.readInt32BE(o + 4) * 2, c = o + 8; o = c + clen;
  const rec = i++, type = shp.readInt32LE(c); if (type !== 5 && type !== 15 && type !== 25) continue;
  const nParts = shp.readInt32LE(c + 36), nPts = shp.readInt32LE(c + 40), P0 = c + 44 + nParts * 4;
  const a = attr(rec), cen = proj({ lat: +a.LATITUDE, lon: +a.LONGITUDE });
  if (!keep(cen)) continue;
  const mx = +a.MAX_HEIGHT, av = +a.AVG_HEIGHT, mn = +a.MIN_HEIGHT;
  if (!(mx > 0 || av > 0)) continue;
  // a piece can have holes or several islands: keep its largest ring
  let best = null, bestA = 0;
  for (let k = 0; k < nParts; k++) {
    const s = shp.readInt32LE(c + 44 + k * 4), e = k + 1 < nParts ? shp.readInt32LE(c + 44 + (k + 1) * 4) : nPts, ring = [];
    for (let j = s; j < e; j++) { const ll = toLL(shp.readDoubleLE(P0 + j * 16), shp.readDoubleLE(P0 + j * 16 + 8)); ring.push(proj(ll)); }
    if (ring.length > 3 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) < .01) ring.pop();
    const A = Math.abs(area(ring)); if (A > bestA) { bestA = A; best = ring; }
  }
  if (!best || bestA < 4) continue;
  if (area(best) < 0) best.reverse();
  pieces.push({ p: best.map(q => [r1(q[0]), r1(q[1])]), mn: r1(mn), mx: r1(mx), av: r1(av), s: /lidar/i.test(a.HEIGHT_SRC) ? 'L' : a.HEIGHT_SRC.slice(0, 12) });
}
fs.rmSync(tmp, { recursive: true, force: true });
const out = path.join(ROOT, 'assets/osm/massing.json');
fs.writeFileSync(out, JSON.stringify({ attribution: 'Contains information licensed under the Open Government Licence – Toronto', pieces }));
console.log('massing pieces kept:', pieces.length, 'of', nRec, '→', (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
