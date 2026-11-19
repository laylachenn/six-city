// Downloads the OpenStreetMap extracts for the northern districts (East York / Don Mills, North York Centre)
// and the arterial corridor that links them to downtown, into assets/osm/north/.
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// usage: node tools/fetch-north.mjs [name ...]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZONES, CORRIDOR, bboxOf } from './zones.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/osm/north');
fs.mkdirSync(OUT, { recursive: true });
const Z = ZONES.filter(z => z.id !== 'downtown').map(z => bboxOf(z)), R = bboxOf(CORRIDOR), RN = bboxOf({ ...CORRIDOR, z1: -1500 });
const ALL = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street)$';
const ART = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$';
const each = f => Z.map(f).join('');
const Q = {
  net: `(${each(b => `way[highway~"${ALL}"](${b});way[highway=pedestrian][area=yes](${b});`)}way[highway~"${ART}"](${R});way[railway~"^(rail|platform)$"](${R});way[place=square](${R}););out body geom;`,
  // buildings: every footprint in each district, plus the ones fronting the arterials in between and any tower
  buildings_eastyork: `(way[building](${Z[0]});relation[building](${Z[0]}););out body geom;`,
  buildings_northyork: `(way[building](${Z[1]});relation[building](${Z[1]}););out body geom;`,
  // the corridor between the districts, in strips (the builder keeps only the buildings that front an arterial)
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(k => [`buildings_corridor${k}`, `way[building](${bboxOf({ ...CORRIDOR, z1: -1500 - k * 2220, z0: -1500 - (k + 1) * 2220 })});out body geom;`])),
  buildings_towers: `way[building]["building:levels"~"^([89]|[1-9][0-9])$"](${RN});out body geom;`,
  parts: `(${each(b => `way["building:part"](${b});relation["building:part"](${b});`)});out body geom;`,
  areas: `(way[leisure~"^(park|garden|pitch|golf_course)$"](${R});relation[leisure~"^(park|garden|golf_course)$"](${R});way[landuse~"^(grass|railway|cemetery|forest|recreation_ground)$"](${R});relation[landuse~"^(cemetery|forest)$"](${R});way[natural=wood](${R});relation[natural=wood](${R}););out body geom;`,
  water: `(way[natural=water](${R});relation[natural=water](${R});way[waterway=riverbank](${R}););out body geom;`,
};
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(Q)) {
  const t0 = Date.now();
  let txt = '';
  for (let k = 0, wait = 15; ; k++, wait *= 2) { // the public servers are busy at times: back off and try the mirrors
    const url = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'][k % 3];
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'osm-map-builder/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent('[out:json][timeout:600];' + Q[name]) });
      txt = await r.text();
      if (r.ok && txt.trimStart().startsWith('{') && !/"remark":\s*"runtime error/.test(txt.slice(-2000))) break;
      console.error(name, url, r.status, txt.slice(0, 120).replace(/\s+/g, ' '));
    } catch (e) { console.error(name, url, e.message); }
    if (k >= 6) process.exit(1);
    await new Promise(r => setTimeout(r, wait * 1000));
  }
  fs.writeFileSync(path.join(OUT, name + '.json'), txt);
  console.log(name, (txt.length / 1e6).toFixed(1) + 'MB', JSON.parse(txt).elements.length, 'elements', ((Date.now() - t0) / 1000 | 0) + 's');
}
