// Downloads the bike-share docks and motorcycle parking in the playable area into assets/osm/bikes.json.
// build-map.mjs keeps the ones on the map as `bikeDocks` and `motoParking`: the game racks share bikes and parks motorcycles there.
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// usage: node tools/fetch-bikes.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZONES, CORRIDOR, bboxOf } from './zones.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/osm/bikes.json');
const boxes = [...ZONES.map(bboxOf), bboxOf(CORRIDOR)];
const Q = `(${boxes.map(b => `node[amenity=bicycle_rental](${b});way[amenity=bicycle_rental](${b});node[amenity=motorcycle_parking](${b});way[amenity=motorcycle_parking](${b});`).join('')});out center tags;`;
let txt = '';
for (let k = 0, wait = 15; ; k++, wait *= 2) {
  const url = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'][k % 3];
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'osm-map-builder/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent('[out:json][timeout:300];' + Q) });
    txt = await r.text();
    if (r.ok && txt.trimStart().startsWith('{') && !/"remark":\s*"runtime error/.test(txt.slice(-2000))) break;
    console.error(url, r.status, txt.slice(0, 120).replace(/\s+/g, ' '));
  } catch (e) { console.error(url, e.message); }
  if (k >= 6) process.exit(1);
  await new Promise(r => setTimeout(r, wait * 1000));
}
fs.writeFileSync(OUT, txt);
const el = JSON.parse(txt).elements;
console.log('bike docks', el.filter(e => e.tags?.amenity === 'bicycle_rental').length, '· motorcycle parking', el.filter(e => e.tags?.amenity === 'motorcycle_parking').length);
