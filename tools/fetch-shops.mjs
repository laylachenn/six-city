// Downloads every named shop, restaurant, café, bar, bank and pharmacy in the playable area into assets/osm/shops.json.
// build-map.mjs puts each one on the shopfront it belongs to, so the storefronts carry their real names.
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// usage: node tools/fetch-shops.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZONES, CORRIDOR, bboxOf } from './zones.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/osm/shops.json');
const AM = '^(restaurant|cafe|fast_food|bar|pub|ice_cream|bank|pharmacy|nightclub|food_court|bureau_de_change|dentist|clinic|doctors|veterinary|cinema|theatre|post_office)$';
const boxes = [...ZONES.map(bboxOf), bboxOf(CORRIDOR)];
const Q = `(${boxes.map(b => `node[name][shop](${b});way[name][shop](${b});node[name][amenity~"${AM}"](${b});way[name][amenity~"${AM}"](${b});node[name][craft~"^(brewery|winery|distillery|caterer|jeweller|tailor)$"](${b});`).join('')});out center tags;`;
let txt = '';
for (let k = 0, wait = 15; ; k++, wait *= 2) {
  const url = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'][k % 3];
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'osm-map-builder/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent('[out:json][timeout:600];' + Q) });
    txt = await r.text();
    if (r.ok && txt.trimStart().startsWith('{') && !/"remark":\s*"runtime error/.test(txt.slice(-2000))) break;
    console.error(url, r.status, txt.slice(0, 120).replace(/\s+/g, ' '));
  } catch (e) { console.error(url, e.message); }
  if (k >= 6) process.exit(1);
  await new Promise(r => setTimeout(r, wait * 1000));
}
fs.writeFileSync(OUT, txt);
console.log('shops', (txt.length / 1e6).toFixed(1) + 'MB', JSON.parse(txt).elements.length, 'elements');
