#!/usr/bin/env python3
"""Samples every playable building's roof colour from the City of Toronto's aerial photos into assets/osm/roofs.json.

build-map.mjs then gives each roof without an OpenStreetMap roof:colour its real colour (light gravel, black tar,
green copper, red shingle...). Run it after build-map.mjs, then run build-map.mjs once more:

    node tools/build-map.mjs && python3 -I tools/roof-colours.py && node tools/build-map.mjs

Needs Pillow. Tiles are cached in assets/osm/ortho/ (not committed), so later runs are fast.
Imagery: City of Toronto orthophoto, Open Government Licence – Toronto (https://open.toronto.ca/open-data-license/).

Aerial photos are not true orthophotos: a tall building leans away from the camera and its roof lands beside its footprint,
so only buildings under ~30 m are sampled (towers keep the game's own roof colours).
"""
import json, math, os, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CACHE = os.path.join(ROOT, 'assets/osm/ortho')
TILE = 'https://gis.toronto.ca/arcgis/rest/services/basemap/cot_ortho/MapServer/tile/{z}/{y}/{x}'
Z = 18                     # ~0.43 m per pixel on the ground at Toronto's latitude
MAX_H = 30

# the game frame (same as tools/zones.mjs)
LAT0, LON0 = 43.652, -79.383
KX, KY, ROT = 111320 * math.cos(math.radians(LAT0)), 110540, math.radians(17.2)
C, S = math.cos(ROT), math.sin(ROT)
def unproj(X, Zz):
    x, z = X * C + Zz * S, -X * S + Zz * C
    return LAT0 - z / KY, LON0 + x / KX
def pixel(lat, lon):  # global Web Mercator pixel at zoom Z
    n = 256 * 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n

def inside(x, z, p):
    c = False
    j = len(p) - 1
    for i in range(len(p)):
        (ax, az), (bx, bz) = p[i], p[j]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: c = not c
        j = i
    return c
def edge_dist(x, z, p):
    d = 1e9
    for i in range(len(p)):
        (ax, az), (bx, bz) = p[i], p[(i + 1) % len(p)]
        dx, dz = bx - ax, bz - az
        t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1)))
        d = min(d, math.hypot(x - ax - dx * t, z - az - dz * t))
    return d
def centroid(p): return sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
def key(p): x, z = centroid(p); return f'{math.floor(x + .5)},{math.floor(z + .5)}'  # = Math.round in build-map.mjs

def samples(v):
    """points on the roof, kept ~1.2 m in from the walls (parapets, eaves and the wall leaning into view), on a grid"""
    p = v['p']
    xs, zs = [q[0] for q in p], [q[1] for q in p]
    w, d = max(xs) - min(xs), max(zs) - min(zs)
    step = max(0.8, math.sqrt(w * d / 220))
    out, x = [], min(xs) + step / 2
    while x < max(xs):
        z = min(zs) + step / 2
        while z < max(zs):
            if inside(x, z, p) and edge_dist(x, z, p) > 1.2: out.append((x, z))
            z += step
        x += step
    return out

def main():
    m = json.load(open(os.path.join(ROOT, 'assets/toronto.json')))
    play = m['play']
    todo = []
    for v in m['vols']:
        if v.get('f') or v['h'] > MAX_H or v['b'] > 1 or v.get('rcol'): continue
        cx, cz = centroid(v['p'])
        if not (play['x0'] < cx < play['x1'] and play['z0'] < cz < play['z1']): continue
        pts = samples(v)
        if len(pts) < 3: continue
        px = [pixel(*unproj(x, z)) for x, z in pts]
        todo.append((key(v['p']), px))
    tiles = sorted({(int(x // 256), int(y // 256)) for _, px in todo for x, y in px})
    print(f'{len(todo)} roofs to sample over {len(tiles)} tiles at zoom {Z}', flush=True)

    os.makedirs(CACHE, exist_ok=True)
    def get(t):
        f = os.path.join(CACHE, f'{Z}_{t[1]}_{t[0]}.jpg')
        if not os.path.exists(f):  # curl uses the system's certificate store, which Python's own often lacks on macOS
            r = subprocess.run(['curl', '-s', '-f', '--retry', '4', '--retry-delay', '2', '-m', '60', '-A', 'osm-map-builder/1.0', '-o', f + '.part',
                                '-w', '%{http_code}', TILE.format(z=Z, y=t[1], x=t[0])], capture_output=True, text=True)
            if r.returncode == 0: os.replace(f + '.part', f)
            elif r.stdout.strip() == '404': open(f, 'wb').close()  # outside the city's coverage
        return t
    t0, done = time.time(), 0
    with ThreadPoolExecutor(6) as ex:
        for _ in ex.map(get, tiles):
            done += 1
            if done % 500 == 0: print(f'  {done}/{len(tiles)} tiles, {time.time() - t0:.0f}s', flush=True)

    # sample: load tiles lazily, keep a small cache since roofs are processed in roughly spatial order
    cache = {}
    def px_at(x, y):
        t = (int(x // 256), int(y // 256))
        if t not in cache:
            if len(cache) > 3000: cache.clear()
            f = os.path.join(CACHE, f'{Z}_{t[1]}_{t[0]}.jpg')
            try: cache[t] = Image.open(f).convert('RGB').load() if os.path.getsize(f) else None
            except Exception: cache[t] = None
        im = cache[t]
        return im[int(x) % 256, int(y) % 256] if im else None
    todo.sort(key=lambda r: (int(r[1][0][1] // 2560), r[1][0][0]))
    roofs = {}
    for k, px in todo:
        cols = [c for c in (px_at(x, y) for x, y in px) if c]
        if len(cols) < 3: continue
        # leave out shadow (a neighbour's or the roof's own) and specular glare, then take the per-channel median
        lit = [c for c in cols if 40 < (c[0] * .3 + c[1] * .59 + c[2] * .11) < 245]
        use = lit if len(lit) >= max(3, len(cols) // 4) else cols
        med = [sorted(c[i] for c in use)[len(use) // 2] for i in range(3)]
        roofs[k] = '#%02x%02x%02x' % tuple(med)
    out = os.path.join(ROOT, 'assets/osm/roofs.json')
    json.dump({'attribution': 'Roof colours sampled from City of Toronto orthophotos, Open Government Licence – Toronto', 'roofs': roofs}, open(out, 'w'), separators=(',', ':'))
    print(f'{len(roofs)} roof colours -> {out}')

if __name__ == '__main__':
    main()
