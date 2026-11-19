// Game-world frame shared by the map tools: local metres, rotated 17.2° so Toronto's street grid is axis-aligned
// (x = east-ish, z = south-ish; north is -z).
export const LAT0 = 43.652, LON0 = -79.383, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110540, ROT = 17.2 * Math.PI / 180;
const C = Math.cos(ROT), S = Math.sin(ROT);
export const proj = g => { const x = (g.lon - LON0) * KX, z = -(g.lat - LAT0) * KY; return [x * C - z * S, x * S + z * C]; };
export const unproj = (X, Z) => { const x = X * C + Z * S, z = -X * S + Z * C; return [LAT0 - z / KY, LON0 + x / KX]; };
// fully detailed districts: every street, building and park
export const ZONES = [
  { id: 'downtown', name: 'Downtown', x0: -2900, x1: 3050, z0: -3150, z1: 1560 },
  { id: 'eastyork', name: 'East York & Don Mills', x0: 1500, x1: 7000, z0: -8300, z1: -1500 },
  { id: 'northyork', name: 'North York Centre', x0: 400, x1: 2600, z0: -14600, z1: -11400 },
];
// everything drivable: the districts plus the arterial roads between them
export const CORRIDOR = { x0: -2900, x1: 7000, z0: -14800, z1: 1560 };
export const bboxOf = b => { const c = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(p => unproj(...p)); const la = c.map(q => q[0]), lo = c.map(q => q[1]); return [Math.min(...la), Math.min(...lo), Math.max(...la), Math.max(...lo)].map(v => v.toFixed(5)).join(','); };
