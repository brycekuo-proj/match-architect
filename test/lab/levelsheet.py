"""Draw a contact sheet of jobs from levelsheet.mjs JSON: ground, mud, reference matches, anchors, stars, loads.
python3 levelsheet.py in.json out.png [cols]"""
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
data = json.load(open(sys.argv[1])); out = sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
TW, TH = 420, 470
F = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
font = ImageFont.truetype(F, 17); small = ImageFont.truetype(F, 13)
rows = math.ceil(len(data) / cols)
sheet = Image.new('RGB', (cols * TW, rows * TH), '#eef6fb')
for i, lv in enumerate(data):
    ox, oy = (i % cols) * TW, (i // cols) * TH
    tile = Image.new('RGB', (TW, TH), '#cdebfa'); g = ImageDraw.Draw(tile)
    x0, x1, y0, y1 = lv['view']
    # fit the view (and the reference build) into the drawing area
    xs = [p for s in lv['segs'] for p in (s[0], s[2])] + [x0, x1]; ys = [p for s in lv['segs'] for p in (s[1], s[3])] + [y0, y1]
    X0, X1, Y0, Y1 = min(xs) - 1, max(xs) + 1, min(ys) - 0.8, max(ys) + 1.2
    sc = min((TW - 20) / (X1 - X0), (TH - 90) / (Y1 - Y0))
    P = lambda x, y: (10 + (x - X0) * sc, TH - 70 - (y - Y0) * sc)
    for poly in lv['terrain']:
        g.polygon([P(max(min(x, X1 + 5), X0 - 5), max(y, Y0 - 2)) for x, y in poly], fill='#8fcf7a', outline='#4a7a3a')
    for a, b in lv['soft']:
        ay = min([an[1] for an in lv['anchors'] if a - 1e-6 <= an[0] <= b + 1e-6] or [0])
        g.rectangle([P(a - 0.4, ay), P(b + 0.4, ay - 0.35)], fill='#6b4a2e')
    col = '#c9a26b' if lv['state'] == 'won' else '#e05040'
    for x1_, y1_, x2_, y2_ in lv['segs']: g.line([P(x1_, y1_), P(x2_, y2_)], fill=col, width=max(2, int(sc * 0.12)))
    for x, y in lv['anchors']: c = P(x, y); g.ellipse([c[0] - 5, c[1] - 5, c[0] + 5, c[1] + 5], fill='#d9392b', outline='#2a1a12')
    for ld in lv['loads']:
        sx, sy = lv['stars'][ld['star']]; cx, cy = sx, sy + ld['dy']
        g.rectangle([P(cx - ld['w'] / 2, cy + ld['h'] / 2), P(cx + ld['w'] / 2, cy - ld['h'] / 2)], fill='#7fb3c8', outline='#2a1a12')
    for x, y in lv['stars']: c = P(x, y); g.regular_polygon((c[0], c[1], 9), 5, fill='#f7c548', outline='#2a1a12')
    if lv['damper']: c = P(lv['damper']['x'], lv['damper']['y'] - 0.6); g.ellipse([c[0] - 7, c[1] - 7, c[0] + 7, c[1] + 7], fill='#555', outline='#000')
    g.rectangle([0, TH - 66, TW, TH], fill='#fff7e8')
    g.text((8, TH - 62), f"{lv['id']} {lv['name']}  ({lv['key']})", fill='#2a1a12', font=font)
    extra = (' items:' + ','.join(lv['items'])) if lv['items'] else ''
    sup = (' supply:' + ','.join(k for k in lv['supply'] if k != 'pick')) if lv['supply'] else ''
    g.text((8, TH - 38), f"震度{lv['shindo']} {lv['qt']}  par {lv['par']}/{lv['used']}  {lv['state']} {lv['stress']}{extra}{sup}", fill='#2a1a12' if lv['state'] == 'won' else '#c02020', font=small)
    g.rectangle([0, 0, TW - 1, TH - 1], outline='#2a1a12')
    sheet.paste(tile, (ox, oy))
sheet.save(out); print('saved', out, sheet.size)
