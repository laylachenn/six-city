// Downloads the TTC subway: each line's route (stations in order) and the station entrances, into assets/osm/ttc.json.
// build-map.mjs keeps the lines as `subway` (stations in order, with their entrances in the playable area).
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// usage: node tools/fetch-ttc.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/osm/ttc.json');
const B = '43.58,-79.65,43.86,-79.10'; // all of Toronto: lines run past the playable area and we want their whole order
const Q = `relation[route=subway](${B})->.r;.r out body;node(r.r);out body;node[railway=subway_entrance](${B});out body;node[station=subway](${B});out body;`;
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
console.log('routes', el.filter(e => e.type === 'relation').map(e => `${e.tags.ref || '?'} ${e.tags.name || ''}`).join(' | '));
console.log('entrances', el.filter(e => e.tags?.railway === 'subway_entrance').length, '· stations', el.filter(e => e.tags?.station === 'subway').length);
