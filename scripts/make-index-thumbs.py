"""Draw one thumbnail per satellite index (public/sat-thumbs/<KEY>.webp).

A small synthetic desert farm (centre pivots at different vigour, a half-harvested
pivot, irrigated plots, greenhouse roofs, a canal and a pond, a road) is given
plausible Sentinel-2 surface reflectances per band. Each thumbnail is then
computed with that index's real formula and coloured with its own legend ramp,
so the picture shows what the index brings out. Run: python3 scripts/make-index-thumbs.py
"""
import json, os, re
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 320, 168
rng = np.random.default_rng(7)
BANDS = ['B02', 'B03', 'B04', 'B08', 'B8A', 'B11', 'B12']
R = {  # surface reflectance per class
    'sand':  [0.20, 0.28, 0.36, 0.42, 0.44, 0.55, 0.48],
    'soil':  [0.12, 0.16, 0.20, 0.26, 0.27, 0.34, 0.28],   # moist tilled soil
    'veg':   [0.03, 0.07, 0.035, 0.47, 0.48, 0.19, 0.085],
    'water': [0.07, 0.065, 0.04, 0.02, 0.02, 0.01, 0.008],
    'roof':  [0.46, 0.48, 0.49, 0.53, 0.53, 0.46, 0.41],
    'road':  [0.17, 0.18, 0.19, 0.22, 0.22, 0.25, 0.24],
}
yy, xx = np.mgrid[0:H, 0:W].astype(float)

def smooth_noise(scale, amp):
    n = rng.normal(0, 1, (H // scale + 2, W // scale + 2))
    img = Image.fromarray(((n - n.min()) / (np.ptp(n) or 1) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return (np.asarray(img, float) / 255 - 0.5) * 2 * amp

# Work at 2x and scale down at the end for soft, sensor-like edges.
SS = 2
W2, H2 = W * SS, H * SS
yy, xx = np.mgrid[0:H2, 0:W2].astype(float)

def smooth_noise(scale, amp, shape=(H2, W2)):
    h, w = shape
    n = rng.normal(0, 1, (h // scale + 2, w // scale + 2))
    img = Image.fromarray(((n - n.min()) / (np.ptp(n) or 1) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return (np.asarray(img, float) / 255 - 0.5) * 2 * amp

def soft(mask, r=1.2):
    im = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r * SS))
    return np.asarray(im, float) / 255

frac = {k: np.zeros((H2, W2)) for k in R}
frac['sand'][:] = 1.0
# dunes: long ripples plus patches
dune = 0.07 * np.sin((xx * 0.9 + yy * 0.35) / (9 * SS) + smooth_noise(30, 2.0)) + smooth_noise(26, 0.06)

def blend(mask, cls_weights):
    """mask in 0..1; cls_weights: {cls: fraction array or scalar} summing to 1 inside."""
    for k in frac:
        frac[k] *= (1 - mask)
    for k, w in cls_weights.items():
        frac[k] += mask * w

def vigour_field(base, rows=None, patchy=0.14):
    v = base + smooth_noise(14, patchy)
    if rows is not None:
        v = v + 0.05 * np.sin(rows)
    return np.clip(v, 0.02, 0.97)

# farm tracks
track = soft((np.abs(yy - 116 * SS) < 1.4 * SS) | (np.abs(xx - 212 * SS) < 1.4 * SS), 0.6)
blend(track, {'road': 1.0})
# a grid of centre pivots, mixed vigour, two with harvested sectors
pivots = [(40, 34, 30, 0.93, None), (108, 34, 30, 0.72, (0.0, 1.6)), (176, 34, 29, 0.55, None),
          (40, 92, 30, 0.38, (2.4, 4.4)), (108, 92, 29, 0.85, None), (176, 92, 30, 0.22, None),
          (52, 148, 22, 0.78, None), (128, 150, 24, 0.6, (3.6, 5.2))]
for cx, cy, r, vig, cut in pivots:
    cx, cy, r = cx * SS, cy * SS, r * SS
    d = np.hypot(xx - cx, yy - cy)
    ang = (np.arctan2(yy - cy, xx - cx) + 2 * np.pi) % (2 * np.pi)
    disk = soft(d < r, 0.7)
    v = vigour_field(vig, rows=d / SS * 1.6)
    if cut:
        sector = (ang > cut[0]) & (ang < cut[1])
        v = np.where(sector, 0.04, v)
    blend(disk, {'veg': v, 'soil': 1 - v})
    blend(soft(np.abs(d - r * 0.6) < 0.6 * SS, 0.3) * disk * 0.5, {'soil': 1.0})
# irregular plots and greenhouse rows east of the track
x = 218
while x < W - 4:
    w = int(rng.integers(12, 26)); y = 6
    while y < H - 6:
        h = int(rng.integers(14, 34))
        m = soft((xx >= x * SS) & (xx < (x + w - 2) * SS) & (yy >= y * SS) & (yy < (y + h - 2) * SS), 0.4)
        kind = rng.random()
        if kind < 0.28:
            blend(m, {'roof': 1.0})
        elif kind < 0.42:
            blend(m, {'soil': 1.0})
        else:
            v = vigour_field(0.35 + 0.6 * rng.random(), rows=yy / SS * 2.4, patchy=0.08)
            blend(m, {'veg': v, 'soil': 1 - v})
        y += h + 2
    x += w + 2
# canal and a storage pond
canal = soft(np.abs(yy - (124 + 5 * np.sin(xx / SS / 34)) * SS) < 1.8 * SS, 0.5) * (xx < 206 * SS)
blend(canal, {'water': 1.0})
pond = soft(np.hypot((xx - 190 * SS) / 1.35, yy - 152 * SS) < 10 * SS, 0.6)
blend(pond, {'water': 1.0})
bands = {}
for bi, b in enumerate(BANDS):
    v = sum(frac[k] * R[k][bi] for k in R)
    v = v * (1 + dune * frac['sand']) + rng.normal(0, 0.005, (H2, W2))
    v = np.asarray(Image.fromarray(np.clip(v, 0.001, 1).astype(np.float32), mode='F').resize((W, H), Image.LANCZOS))
    bands[b] = np.clip(v, 0.001, 1)
s = bands
eps = 1e-6

def rgb(r, g, b, gain=2.5):
    img = np.stack([r, g, b], -1) * gain
    img = np.clip(img, 0, 1) ** (1 / 1.25)
    return Image.fromarray((img * 255).astype(np.uint8))

def ramp(v, legend):
    vals = np.array([l['value'] for l in legend], float)
    cols = np.array([[int(l['color'][i:i + 2], 16) for i in (1, 3, 5)] for l in legend], float)
    out = np.stack([np.interp(v, vals, cols[:, c]) for c in range(3)], -1)
    return Image.fromarray(out.astype(np.uint8))

shim = open(os.path.join(ROOT, 'demo', 'demo-shim.js'), encoding='utf-8').read()
cat = json.loads(re.search(r'var SATCAT=(\[.*?\]);', shim).group(1))
legend = {c['key']: c['legend'] for c in cat if c.get('legend')}
expr = {
    'NDVI': (s['B08'] - s['B04']) / (s['B08'] + s['B04'] + eps),
    'SAVI': 1.5 * (s['B08'] - s['B04']) / (s['B08'] + s['B04'] + 0.5),
    'NDWI': (s['B03'] - s['B08']) / (s['B03'] + s['B08'] + eps),
    'NDMI': (s['B08'] - s['B11']) / (s['B08'] + s['B11'] + eps),
    'NDII': (s['B08'] - s['B11']) / (s['B08'] + s['B11'] + eps),
    'MSI': s['B11'] / (s['B08'] + eps),
    'BSI': ((s['B11'] + s['B04']) - (s['B08'] + s['B02'])) / ((s['B11'] + s['B04']) + (s['B08'] + s['B02']) + eps),
}
out = os.path.join(ROOT, 'public', 'sat-thumbs')
os.makedirs(out, exist_ok=True)
imgs = {
    'TRUE_COLOR': rgb(s['B04'], s['B03'], s['B02']),
    'FALSE_COLOR': rgb(s['B08'], s['B04'], s['B03'], 2.0),
    'SWIR': rgb(s['B12'], s['B8A'], s['B04'], 1.55),
}
for k, v in expr.items():
    imgs[k] = ramp(v, legend[k])
for k, im in imgs.items():
    im.save(os.path.join(out, f'{k}.webp'), quality=82, method=6)
print('wrote', len(imgs), 'thumbnails to', out)
