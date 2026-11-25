// Downloads the small things that make the ground read as real: parking lots, playgrounds (and their equipment), dog parks,
// running tracks, sports courts, park footpaths and individually mapped trees, for downtown and the northern districts,
// into assets/osm/detail/.
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
// usage: node tools/fetch-detail.mjs [name ...]   (names: parking, leisure, paths_0 … paths_10, trees_0 … trees_10)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CORRIDOR, bboxOf } from './zones.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets/osm/detail');
fs.mkdirSync(OUT, { recursive: true });
// the downtown scene (down to the islands) and the corridor up to North York
const B = [bboxOf({ x0: -3000, x1: 3100, z0: -3200, z1: 3600 }), bboxOf(CORRIDOR)];
const each = f => B.map(f).join('');
const Q = {
  // surface lots and parking garages (garages are usually buildings too; the builder only draws the surface ones as lots)
  parking: `(${each(b => `way[amenity=parking](${b});relation[amenity=parking](${b});`)});out body geom;`,
  // playgrounds, dog parks, running tracks, courts, plus the mapped play equipment inside playgrounds
  leisure: `(${each(b => `way[leisure~"^(playground|dog_park|track|fitness_station|outdoor_seating|swimming_pool|sports_centre)$"](${b});relation[leisure~"^(playground|dog_park|track)$"](${b});node[leisure=playground](${b});node[playground](${b});way[playground](${b});`)});out body geom;`,
};
// footpaths through parks and campuses (sidewalks and crossings are drawn by the game already) and mapped trees are dense: ask for them in pieces (downtown in four, the corridor in strips) so busy servers can answer
const PIECES = [
  ...[[-3000, 50], [50, 3100]].flatMap(([x0, x1]) => [[-3200, 200], [200, 3600]].map(([z0, z1]) => ({ x0, x1, z0, z1 }))),
  ...[0, 1, 2, 3, 4, 5].map(k => ({ ...CORRIDOR, z1: -3200 - k * 1934, z0: -3200 - (k + 1) * 1934 })),
  { ...CORRIDOR, x0: 3100, z0: -3200 },
].map(bboxOf);
PIECES.forEach((b, k) => {
  Q['paths_' + k] = `way[highway~"^(footway|path|cycleway|pedestrian)$"][footway!~"^(sidewalk|crossing|traffic_island)$"][area!=yes][tunnel!=yes][indoor!=yes][level!~"^-"](${b});out body geom;`;
  Q['trees_' + k] = `node[natural=tree](${b});out body;`;
});
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
