# make_landmarks.py - 火柴建築師 (Match Architect): 13 Q-style low-poly landmark models for the level-clear turntable.
# Blender 5.x.  Usage:
#   Blender -b -P make_landmarks.py -- <out_dir> [only=pisa,eiffel] [nopreview]
# Writes <key>.glb for every level key plus preview.png (3/4-view contact sheet) into <out_dir>.
# Conventions: Blender Z-up, base centred on the origin sitting on z=0, front faces -Y (glTF/three.js: +Z),
# towers ~2.0 units tall, wide/low models <= 2.4 on their longest horizontal side.
# Every texture is drawn procedurally (numpy) and embedded as a small palette PNG; no photos, text or logos.
import bpy, bmesh, math, sys, os, json, struct, zlib, tempfile, shutil, traceback
import numpy as np
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'landmarks')
OPTS = ARGS[1:]
ONLY = set()
for _a in OPTS:
    if _a.startswith('only='):
        ONLY = set(k for k in _a[5:].split(',') if k)
NOPREVIEW = 'nopreview' in OPTS
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix='mq_landmarks_')
PI = math.pi


# ================================================================= colour + PNG
def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def lin(h):
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb(h))


def write_png(path, img8):
    """img8: (h, w, 3) uint8, first row = top. Palette PNG when <= 256 colours, else RGB. zlib level 9."""
    h, w, _ = img8.shape

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    flat = img8.reshape(-1, 3)
    cols, inv = np.unique(flat, axis=0, return_inverse=True)
    if len(cols) <= 256:
        idx = np.asarray(inv).reshape(h, w).astype(np.uint8)
        raw = b''.join(b'\x00' + idx[y].tobytes() for y in range(h))
        body = (chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0)) +
                chunk(b'PLTE', cols.astype(np.uint8).tobytes()) +
                chunk(b'IDAT', zlib.compress(raw, 9)))
    else:
        raw = b''.join(b'\x00' + img8[y].tobytes() for y in range(h))
        body = (chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) +
                chunk(b'IDAT', zlib.compress(raw, 9)))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + body + chunk(b'IEND', b''))


# ================================================================= procedural texture painter
class Tex:
    """Tiny tiling painter. Pixel coords, origin bottom-left (= UV origin). Shapes wrap around the tile edges."""

    def __init__(s, w, h, bg):
        s.w, s.h = w, h
        s.a = np.zeros((h, w, 3), np.float32)
        s.a[:] = rgb(bg)
        Y, X = np.mgrid[0:h, 0:w]
        s.X = X.astype(np.float32) + 0.5
        s.Y = Y.astype(np.float32) + 0.5

    def M(s, f):
        m = np.zeros((s.h, s.w), bool)
        for dx in (-s.w, 0, s.w):
            for dy in (-s.h, 0, s.h):
                m |= f(s.X + dx, s.Y + dy)
        return m

    def fill(s, m, col):
        s.a[m] = rgb(col)
        return s

    def m_rect(s, x0, y0, x1, y1):
        return s.M(lambda X, Y: (X >= x0) & (X < x1) & (Y >= y0) & (Y < y1))

    def rect(s, x0, y0, x1, y1, col):
        return s.fill(s.m_rect(x0, y0, x1, y1), col)

    def m_ell(s, cx, cy, rx, ry):
        return s.M(lambda X, Y: ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1.0)

    def ell(s, cx, cy, rx, ry, col):
        return s.fill(s.m_ell(cx, cy, rx, ry), col)

    def seg(s, x0, y0, x1, y1, th, col):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy

        def f(X, Y):
            t = np.clip(((X - x0) * dx + (Y - y0) * dy) / L2, 0.0, 1.0)
            return (X - x0 - t * dx) ** 2 + (Y - y0 - t * dy) ** 2 <= (th * 0.5) ** 2
        return s.fill(s.M(f), col)

    def m_arch(s, x0, x1, y0, ys, ry):
        """round arch: rectangle up to the springline ys, then a half ellipse of height ry"""
        cx, rx = (x0 + x1) * 0.5, (x1 - x0) * 0.5
        return s.M(lambda X, Y: (X >= x0) & (X < x1) & (Y >= y0) &
                   ((Y < ys) | (((X - cx) / rx) ** 2 + ((Y - ys) / ry) ** 2 <= 1.0)))

    def m_pointed(s, x0, x1, y0, ys, ht):
        """gothic (equilateral) pointed arch of apex height ht above the springline ys"""
        w = x1 - x0
        k = ht / (w * 0.8660254)
        return s.M(lambda X, Y: (X >= x0) & (X < x1) & (Y >= y0) &
                   ((Y < ys) | (((X - x0) ** 2 + ((Y - ys) / k) ** 2 <= w * w) &
                                ((X - x1) ** 2 + ((Y - ys) / k) ** 2 <= w * w))))

    def m_poly(s, pts):
        def f(X, Y):
            inside = np.zeros(X.shape, bool)
            n = len(pts)
            for i in range(n):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % n]
                if y0 == y1:
                    continue
                cond = (y0 > Y) != (y1 > Y)
                xi = (x1 - x0) * (Y - y0) / (y1 - y0) + x0
                inside ^= cond & (X < xi)
            return inside
        return s.M(f)

    def poly(s, pts, col):
        return s.fill(s.m_poly(pts), col)

    def image(s, name):
        arr = np.clip(np.round(s.a * 255.0), 0, 255).astype(np.uint8)[::-1]
        path = os.path.join(TMP, name + '.png')
        write_png(path, arr)
        img = bpy.data.images.load(path, check_existing=False)
        img.name = name
        img.pack()
        return img

    def mean_hex(s):
        m = np.clip(s.a.reshape(-1, 3).mean(0), 0, 1)
        return '#%02x%02x%02x' % tuple(int(round(c * 255)) for c in m)


# ----------------------------------------------------------------- texture designs (all tile seamlessly)
def tx_canvas():
    t = Tex(64, 64, '#F7892B')
    t.rect(22, 0, 42, 64, '#FFF4E2')
    t.rect(-1, 0, 1, 64, '#E06F1A')
    return t


def tx_logs():                       # 2 logs per tile, horizontal
    t = Tex(64, 64, '#C27D42')
    for k in range(2):
        y = k * 32
        t.rect(0, y, 64, y + 3, '#5A3416')
        t.rect(0, y + 3, 64, y + 8, '#9C5D2C')
        t.rect(0, y + 24, 64, y + 32, '#D69658')
    t.ell(16, 16, 4, 3, '#8E5527')
    t.ell(46, 47, 3.5, 2.5, '#8E5527')
    return t


def tx_shingle():                    # staggered roof shingles, 4 rows
    t = Tex(64, 64, '#AE3A2F')
    for r in range(4):
        y = r * 16
        t.rect(0, y, 64, y + 3, '#6E1F1A')
        t.rect(0, y + 3, 64, y + 5, '#C9584A')
        off = 8 if r % 2 else 0
        for c in range(4):
            x = c * 16 + off
            t.rect(x - 1, y, x + 1, y + 16, '#7E2620')
    return t


def tx_planks(base, line):           # vertical door planks
    t = Tex(32, 32, base)
    t.rect(-1, 0, 1, 32, line)
    t.rect(15, 0, 17, 32, line)
    return t


def tx_blocks(w, h, rows, cols, bg, alt, line, lw=2):   # staggered stone courses
    t = Tex(w, h, bg)
    rh, cw = h / rows, w / cols
    for r in range(rows):
        y0 = r * rh
        if r % 2:
            t.rect(0, y0, w, y0 + rh, alt)
        t.rect(0, y0, w, y0 + lw, line)
        off = cw * 0.5 if r % 2 else 0.0
        for c in range(cols):
            x = c * cw + off
            t.rect(x - lw * 0.5, y0, x + lw * 0.5, y0 + rh, line)
    return t


def tx_house():                      # one window column, two floors (fit to the wall height)
    t = Tex(64, 128, '#F8E8C6')
    t.rect(0, 0, 64, 8, '#D9B486')
    t.rect(0, 8, 64, 10, '#C59E6E')
    t.rect(0, 61, 64, 67, '#EED6A8')
    t.rect(0, 60, 64, 61, '#D6BB8C')
    t.rect(0, 121, 64, 128, '#FFFFFF')
    t.rect(0, 120, 64, 121, '#E2CDA4')
    for y0 in (20, 81):
        for x0 in (8, 49):
            t.rect(x0, y0, x0 + 7, y0 + 36, '#5DA27B')
            for k in range(1, 6):
                t.rect(x0, y0 + 6 * k, x0 + 7, y0 + 6 * k + 1, '#4A8A65')
        t.rect(15, y0 - 1, 49, y0 + 37, '#FFFFFF')
        t.rect(18, y0 + 2, 46, y0 + 34, '#86C8E4')
        t.poly([(21, y0 + 22), (27, y0 + 32), (31, y0 + 32), (25, y0 + 22)], '#C6E9F6')
        t.rect(31, y0 + 2, 33, y0 + 34, '#FFFFFF')
        t.rect(18, y0 + 19, 46, y0 + 21, '#FFFFFF')
        t.rect(13, y0 - 5, 51, y0 - 1, '#D2713F')
    return t


def tx_tiles():                      # terracotta barrel tiles
    t = Tex(64, 64, '#D9663B')
    for c in range(4):
        x = c * 16
        t.rect(x + 2, 0, x + 8, 64, '#EB8653')
        t.rect(x + 12, 0, x + 16, 64, '#B24E2B')
    for r in range(4):
        t.rect(0, r * 16, 64, r * 16 + 2, '#8E3B1D')
    return t


def tx_nemes():                      # blue / gold headdress stripes
    t = Tex(32, 32, '#2D5DA9')
    for r in range(2):
        t.rect(0, r * 16, 32, r * 16 + 8, '#F3C53F')
    return t


def tx_pisa_gallery():               # two slender marble arches (loggia) per facet per floor
    t = Tex(64, 64, '#F6F1E7')
    t.rect(0, 0, 64, 2, '#E3DCCF')
    t.rect(0, 7, 64, 9, '#D6CEBF')
    for x0 in (0, 32):
        t.fill(t.m_arch(x0 + 5, x0 + 27, 9, 44, 10), '#D4CBBB')
        t.fill(t.m_arch(x0 + 7, x0 + 25, 9, 44, 8.5), '#7A7488')
        t.rect(x0 + 7, 9, x0 + 25, 13, '#9A94A6')
        t.rect(x0 - 2, 42, x0 + 2, 45, '#DDD5C6')
    return t


def tx_pisa_ground():                # tall blind arcade of the ground floor
    t = Tex(64, 128, '#F3EEE3')
    t.fill(t.m_arch(5, 59, 0, 92, 21), '#CFC6B6')
    t.fill(t.m_arch(8, 56, 0, 92, 18), '#E8E1D3')
    t.rect(0, 0, 64, 8, '#E0D8C9')
    return t


def tx_lattice(bar, gap, hl):        # X-braced iron lattice
    t = Tex(32, 32, gap)
    t.seg(0, 0, 32, 32, 3.4, bar)
    t.seg(32, 0, 0, 32, 3.4, bar)
    t.rect(-2, 0, 2, 32, bar)
    t.rect(0, -2, 32, 2, bar)
    t.rect(0, 1, 32, 2, hl)
    return t


def tx_deck(glass, frame):           # observation-deck window band
    t = Tex(32, 16, frame)
    t.rect(0, 4, 32, 13, glass)
    t.rect(-1, 4, 1, 13, frame)
    t.rect(15, 4, 17, 13, frame)
    return t


def tx_pearl():                      # pink sphere with a window band (sphere mapping, v = 0 bottom .. 1 top)
    t = Tex(64, 64, '#E24C90')
    t.rect(0, 26, 64, 38, '#3D2C66')
    t.rect(0, 24, 64, 26, '#F8C6DC')
    t.rect(0, 38, 64, 40, '#F8C6DC')
    for c in range(4):
        t.rect(c * 16 - 1, 26, c * 16 + 1, 38, '#F8C6DC')
    t.rect(0, 11, 64, 13, '#C93C7D')
    t.rect(0, 51, 64, 53, '#C93C7D')
    return t


def tx_glass101():                   # teal-green curtain wall grid
    t = Tex(32, 32, '#2E8D81')
    for c in (0, 8, 16, 24):
        t.rect(c - 1, 0, c + 1, 32, '#A6E3D4')
    for r in (0, 8, 16, 24):
        t.rect(0, r - 1, 32, r + 1, '#7FCDBB')
    return t


def tx_skytree():                    # white truss on pale blue
    t = Tex(32, 32, '#D2E4F4')
    t.seg(0, 0, 32, 32, 2.6, '#FFFFFF')
    t.seg(32, 0, 0, 32, 2.6, '#FFFFFF')
    t.rect(0, -1.5, 32, 1.5, '#FFFFFF')
    t.rect(0, 14.5, 32, 17.5, '#F3F7FB')
    t.rect(-1.5, 0, 1.5, 32, '#FFFFFF')
    return t


def tx_burj():                       # silver-blue glass with vertical mullions
    t = Tex(32, 32, '#A9C7E8')
    for c in (0, 8, 16, 24):
        t.rect(c, 0, c + 2, 32, '#F2F7FD')
    t.rect(4, 0, 5, 32, '#94B4D8')
    t.rect(20, 0, 21, 32, '#94B4D8')
    t.rect(0, 0, 32, 1, '#8FAED2')
    t.rect(0, 16, 32, 17, '#8FAED2')
    return t


def tx_sag_stone():                  # warm sandstone, vertical ribs + louvre slots
    t = Tex(32, 32, '#DCA66C')
    for x in (0, 16):
        t.rect(x + 1, 0, x + 5, 32, '#EDC18B')
        t.rect(x + 5, 0, x + 7, 32, '#B88450')
    t.rect(9, 6, 14, 10, '#6E4A2C')
    t.rect(25, 22, 30, 26, '#6E4A2C')
    return t


def tx_gothic():                     # nave bay: buttress rib + tall stained-glass pointed window
    t = Tex(32, 64, '#D9A267')
    t.rect(-2, 0, 2, 64, '#EAB985')
    t.rect(2, 0, 3, 64, '#AC7843')
    t.rect(0, 0, 32, 4, '#C28C55')
    t.rect(0, 60, 32, 64, '#C28C55')
    t.fill(t.m_pointed(8, 26, 8, 40, 14), '#7B4F2D')
    m = t.m_pointed(10, 24, 10, 40, 12)
    t.fill(m & (t.Y < 24), '#3F7BC6')
    t.fill(m & (t.Y >= 24) & (t.Y < 40), '#E99A3B')
    t.fill(m & (t.Y >= 40), '#40AA6E')
    t.fill(m & (np.abs(t.X - 17) < 0.8), '#7B4F2D')
    t.ell(17, 46, 3, 3, '#F5D04A')
    return t


def tx_mosaic():                     # trencadis-style coloured tiles
    cols = ['#E8473C', '#F5C22E', '#3DAA5C', '#2E7FD1', '#FFFFFF', '#F08A2E', '#9B4FC9', '#25B7C7']
    t = Tex(16, 16, '#F7F1E3')
    for i in range(4):
        for j in range(4):
            t.rect(i * 4, j * 4, i * 4 + 3, j * 4 + 3, cols[(i * 3 + j * 5) % 8])
    return t


# ================================================================= materials
def _new_mat(name):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:              # Blender < 5 needs this; 5.x always has a node tree
        try:
            m.use_nodes = True
        except Exception:
            pass
    try:
        m.use_backface_culling = True    # closed meshes with outward normals -> glTF doubleSided: false
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m, nt, bsdf


def mat_col(name, hexc, rough=0.7, metal=0.0):
    m, nt, b = _new_mat(name)
    c = lin(hexc)
    b.inputs['Base Color'].default_value = (*c, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*c, 1.0)
    return m


def mat_tex(name, tex, rough=0.7, metal=0.0):
    img = tex.image(name)
    m, nt, b = _new_mat(name)
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = img
    tn.extension = 'REPEAT'
    tn.interpolation = 'Linear'
    tn.location = (b.location.x - 320, b.location.y)
    nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*lin(tex.mean_hex()), 1.0)
    return m


# ================================================================= mesh building
PARTS = []


def V(x, y, z):
    return Vector((x, y, z))


def ring_circ(cx, cy, z, r, seg, rot=None, ry=None):
    rot = PI / seg if rot is None else rot
    ry = r if ry is None else ry
    return [V(cx + r * math.cos(rot + 2 * PI * i / seg), cy + ry * math.sin(rot + 2 * PI * i / seg), z) for i in range(seg)]


def ring_rect(cx, cy, z, hx, hy):
    return [V(cx + hx, cy - hy, z), V(cx + hx, cy + hy, z), V(cx - hx, cy + hy, z), V(cx - hx, cy - hy, z)]


def ring_chamf(cx, cy, z, h, c):
    p = [(h, -h + c), (h, h - c), (h - c, h), (-h + c, h), (-h, h - c), (-h, -h + c), (-h + c, -h), (h - c, -h)]
    return [V(cx + x, cy + y, z) for x, y in p]


def loft(rings, cap0=True, cap1=True):
    """rings: lists of Vectors (same length) or single Vectors (apex). Quads between rings, n-gon caps."""
    verts, faces, idx = [], [], []
    for r in rings:
        if isinstance(r, Vector):
            idx.append([len(verts)])
            verts.append(r)
        else:
            idx.append(list(range(len(verts), len(verts) + len(r))))
            verts.extend(r)
    for a, b in zip(idx[:-1], idx[1:]):
        n = max(len(a), len(b))
        for j in range(n):
            j1 = (j + 1) % n
            if len(a) == 1:
                faces.append([a[0], b[j1], b[j]])
            elif len(b) == 1:
                faces.append([a[j], a[j1], b[0]])
            else:
                faces.append([a[j], a[j1], b[j1], b[j]])
    if cap0 and len(idx[0]) > 2:
        faces.append(idx[0][::-1])
    if cap1 and len(idx[-1]) > 2:
        faces.append(idx[-1][:])
    return verts, faces


def _uv(bm, uvl, mode, du, dv, fu, fv, nu):
    if mode == 'sph':
        vs_all = [v.co for v in bm.verts]
        z0 = min(p.z for p in vs_all)
        z1 = max(p.z for p in vs_all)
        cx = (min(p.x for p in vs_all) + max(p.x for p in vs_all)) * 0.5
        cy = (min(p.y for p in vs_all) + max(p.y for p in vs_all)) * 0.5
        for f in bm.faces:
            ps = [l.vert.co for l in f.loops]
            rad = [math.hypot(p.x - cx, p.y - cy) for p in ps]
            us = [math.atan2(p.y - cy, p.x - cx) / (2 * PI) for p in ps]
            good = [u for u, r in zip(us, rad) if r > 1e-5]
            if good and max(good) - min(good) > 0.5:
                us = [u + 1.0 if u < 0 else u for u in us]
                good = [u for u, r in zip(us, rad) if r > 1e-5]
            avg = sum(good) / len(good) if good else 0.0
            us = [u if r > 1e-5 else avg for u, r in zip(us, rad)]
            for l, u, p in zip(f.loops, us, ps):
                l[uvl].uv = (u * nu, (p.z - z0) / max(z1 - z0, 1e-6))
        return
    dcap = du if du > 0.05 else 4.0
    for f in bm.faces:
        n = f.normal
        ps = [l.vert.co for l in f.loops]
        if abs(n.z) > 0.92:
            us = [p.x * dcap for p in ps]
            vs = [p.y * dcap for p in ps]
        else:
            t = Vector((-n.y, n.x, 0.0)).normalized()
            b = n.cross(t)
            us = [p.dot(t) for p in ps]
            vs = [p.dot(b) for p in ps]
            u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
            if fu:
                k = max(1, round((u1 - u0) * du))
                us = [(u - u0) / max(u1 - u0, 1e-9) * k for u in us]
            else:
                us = [(u - u0) * du for u in us]
            if fv:
                k = max(1, round((v1 - v0) * dv))
                vs = [(v - v0) / max(v1 - v0, 1e-9) * k for v in vs]
            else:
                vs = [(v - v0) * dv for v in vs]
        for l, u, v in zip(f.loops, us, vs):
            l[uvl].uv = (u, v)


def mk(name, vf, mat, M=None, uv='fit', du=4.0, dv=None, fu=False, fv=False, nu=4, alt=None):
    """Create one closed part. uv='fit': per-face projection on (horizontal tangent, up-the-face) axes with
    `du`/`dv` tiles per unit; fu/fv fit an integer number of tiles across the face. uv='sph': u = angle * nu,
    v = 0..1 over the part height. alt=(material, predicate(normal)) assigns a second material per face."""
    verts, faces = vf
    if M is not None:
        verts = [M @ Vector(v) for v in verts]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    uvl = bm.loops.layers.uv.new('UVMap')
    _uv(bm, uvl, uv, du, du if dv is None else dv, fu, fv, nu)
    if alt is not None:
        for f in bm.faces:
            f.material_index = 1 if alt[1](f.normal) else 0
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    if alt is not None:
        me.materials.append(alt[0])
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    PARTS.append(o)
    return o


def box(name, x, y, z0, sx, sy, sz, mat, rz=0.0, M=None, **kw):
    T = Matrix.Translation((x, y, 0.0)) @ Matrix.Rotation(rz, 4, 'Z')
    if M is not None:
        T = M @ T
    return mk(name, loft([ring_rect(0, 0, z0, sx / 2, sy / 2), ring_rect(0, 0, z0 + sz, sx / 2, sy / 2)]), mat, M=T, **kw)


def cyl(name, x, y, z0, z1, r0, r1, seg, mat, rot=None, caps=(True, True), M=None, **kw):
    top = V(x, y, z1) if r1 <= 1e-6 else ring_circ(x, y, z1, r1, seg, rot)
    return mk(name, loft([ring_circ(x, y, z0, r0, seg, rot), top], caps[0], caps[1]), mat, M=M, **kw)


def lathe(name, x, y, prof, seg, mat, rot=None, caps=(True, True), M=None, **kw):
    rings = [V(x, y, z) if r <= 1e-6 else ring_circ(x, y, z, r, seg, rot) for r, z in prof]
    return mk(name, loft(rings, caps[0], caps[1]), mat, M=M, **kw)


def sphere(name, x, y, z, r, seg, rings, mat, ry=None, rz=None, **kw):
    ry = r if ry is None else ry
    rz = r if rz is None else rz
    rs = [V(x, y, z - rz)]
    for i in range(1, rings):
        a = PI * i / rings
        rs.append(ring_circ(x, y, z - rz * math.cos(a), r * math.sin(a), seg, ry=ry * math.sin(a)))
    rs.append(V(x, y, z + rz))
    return mk(name, loft(rs), mat, **kw)


def prism_xz(name, pts, y0, y1, mat, M=None, **kw):
    """extrude a profile drawn in the XZ plane (front view) from y0 to y1"""
    return mk(name, loft([[V(px, y0, pz) for px, pz in pts], [V(px, y1, pz) for px, pz in pts]]), mat, M=M, **kw)


def rod(name, p0, p1, r, seg, mat, r1=None, **kw):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    M = Matrix.Translation(p0) @ q.to_matrix().to_4x4()
    return cyl(name, 0, 0, 0, d.length, r, r if r1 is None else r1, seg, mat, M=M, **kw)


ONE = dict(fu=True, fv=True, du=1e-3, dv=1e-3)      # exactly one texture tile per face
TOP = lambda n: n.z > 0.9                             # noqa: E731
FLAT = lambda n: abs(n.z) > 0.5                       # noqa: E731


def window(prefix, cx, cy, cz, w, h, rz, frame, glass, sill=None):
    """framed 4-pane window on a wall; local -Y is outward, (cx, cy) is on the wall plane"""
    M = Matrix.Translation((cx, cy, 0.0)) @ Matrix.Rotation(rz, 4, 'Z')
    box(prefix + '_frame', 0, -0.005, cz - h / 2 - 0.035, w + 0.07, 0.03, h + 0.07, frame, M=M)
    box(prefix + '_glass', 0, -0.025, cz - h / 2, w, 0.02, h, glass, M=M)
    box(prefix + '_mv', 0, -0.04, cz - h / 2, 0.03, 0.012, h, frame, M=M)
    box(prefix + '_mh', 0, -0.04, cz - 0.015, w, 0.012, 0.03, frame, M=M)
    if sill is not None:
        box(prefix + '_sill', 0, -0.05, cz - h / 2 - 0.08, w + 0.12, 0.10, 0.06, sill, M=M)


# ================================================================= 1. triangle -> A-frame tent
def b_triangle():
    canvas = mat_tex('tent_canvas', tx_canvas(), 0.8)
    inner = mat_col('tent_inside', '#4A2A1F', 0.9)
    flapm = mat_col('tent_flap', '#FFD98A', 0.8)
    wood = mat_col('tent_pole', '#8B5A32', 0.7)
    rope = mat_col('tent_rope', '#F3E6CC', 0.9)
    flag = mat_col('tent_flag', '#E8383D', 0.6)
    W, D, H = 0.86, 0.78, 1.28
    prism_xz('tent_body', [(-W, 0.0), (W, 0.0), (0.0, H)], -D, D, canvas, du=2.6, fu=True)
    prism_xz('tent_door', [(-0.34, 0.0), (0.34, 0.0), (0.0, 0.84)], -D - 0.012, -D + 0.01, inner)
    prism_xz('tent_flap_l', [(-0.34, 0.0), (0.0, 0.84), (-0.50, 0.26)], -D - 0.03, -D - 0.008, flapm)
    prism_xz('tent_flap_r', [(0.34, 0.0), (0.50, 0.26), (0.0, 0.84)], -D - 0.03, -D - 0.008, flapm)
    yf, yb = -D - 0.035, D + 0.035
    rod('pole_f', (0, yf, 0.0), (0, yf, H + 0.06), 0.028, 6, wood)
    rod('pole_b', (0, yb, 0.0), (0, yb, H + 0.06), 0.028, 6, wood)
    rod('ridge', (0, yf - 0.03, H - 0.01), (0, yb + 0.03, H - 0.01), 0.03, 6, wood)
    rod('mast', (0, yf, H + 0.05), (0, yf, H + 0.43), 0.014, 5, wood)
    prism_xz('pennant', [(0.01, H + 0.27), (0.01, H + 0.42), (0.27, H + 0.345)], yf - 0.012, yf + 0.012, flag)
    for sy in (-1, 1):
        top = V(0, sy * (D + 0.035), H - 0.05)
        peg = V(0, sy * (D + 0.36), 0.0)
        rod('rope', top, peg + V(0, 0, 0.05), 0.011, 4, rope)
        box('peg', peg.x, peg.y, 0.0, 0.05, 0.05, 0.09, wood)
    for sx in (-1, 1):
        for yy in (-0.42, 0.42):
            a = V(sx * W * 0.55, yy, H * 0.45)
            peg = V(sx * (W + 0.30), yy, 0.0)
            rod('rope', a, peg + V(0, 0, 0.05), 0.011, 4, rope)
            box('peg', peg.x, peg.y, 0.0, 0.05, 0.05, 0.09, wood)


# ================================================================= 2. square -> log cabin
def b_square():
    logs = mat_tex('cabin_logs', tx_logs(), 0.8)
    shing = mat_tex('cabin_shingle', tx_shingle(), 0.75)
    under = mat_col('cabin_fascia', '#7A4424', 0.8)
    trim = mat_col('cabin_trim', '#F6E7C8', 0.7)
    doorm = mat_tex('cabin_door', tx_planks('#8A5330', '#5E3519'), 0.75)
    glass = mat_col('cabin_glass', '#9FD9F2', 0.4)
    stone = mat_tex('cabin_stone', tx_blocks(32, 32, 4, 2, '#A8ACB2', '#9CA1A8', '#6E737A', 2), 0.85)
    dark = mat_col('cabin_dark', '#5C3A22', 0.8)
    gold = mat_col('cabin_knob', '#F2C440', 0.5)
    flowerbox = mat_col('cabin_flowerbox', '#B5532F', 0.8)
    pink = mat_col('cabin_flower_pink', '#FF7BAC', 0.7)
    yellow = mat_col('cabin_flower_yel', '#FFD23F', 0.7)
    firewood = mat_col('cabin_firewood', '#B07440', 0.8)
    WX, WY, WH, RZ = 0.70, 0.56, 0.88, 1.50
    s = (RZ - WH) / WX
    dvl = 4.0 / WH
    box('walls', 0, 0, 0, 2 * WX, 2 * WY, WH, logs, du=1.4, dv=dvl)
    prism_xz('gable', [(-WX, WH), (WX, WH), (0.0, RZ)], -WY, WY, logs, du=1.4, dv=dvl)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('corner', sx * WX, sy * WY, 0, 0.13, 0.13, WH + 0.01, logs, du=1.4, dv=dvl)
    ox, oy, th = 0.16, 0.15, 0.09
    ex, ze, zr = WX + ox, WH - ox * s + 0.005, RZ + 0.005
    prism_xz('roof', [(-ex, ze), (0.0, zr), (ex, ze), (ex, ze + th), (0.0, zr + th), (-ex, ze + th)],
             -WY - oy, WY + oy, shing, du=3.0, alt=(under, lambda n: n.z < 0.3))
    # door
    box('door_frame', -0.24, -WY - 0.005, 0, 0.40, 0.03, 0.64, trim)
    box('door', -0.24, -WY - 0.025, 0, 0.31, 0.03, 0.57, doorm, du=1e-3, fu=True, dv=3)
    box('knob', -0.15, -WY - 0.045, 0.27, 0.035, 0.03, 0.035, gold)
    box('step', -0.24, -WY - 0.09, 0, 0.44, 0.16, 0.05, dark)
    # windows
    window('win_f', 0.30, -WY, 0.52, 0.28, 0.25, 0.0, trim, glass)
    box('flowerbox', 0.30, -WY - 0.05, 0.33, 0.40, 0.10, 0.07, flowerbox)
    for i, x in enumerate((0.18, 0.30, 0.42)):
        box('flower', x, -WY - 0.05, 0.40, 0.06, 0.06, 0.06, pink if i % 2 == 0 else yellow)
    window('win_r', WX, 0.0, 0.52, 0.28, 0.25, PI / 2, trim, glass)
    # chimney
    box('chimney', 0.36, 0.26, 1.0, 0.20, 0.20, 0.62, stone, du=6)
    box('chimney_cap', 0.36, 0.26, 1.62, 0.26, 0.26, 0.05, dark)
    # little woodpile against the right wall
    for (yy, zz) in ((-0.40, 0.0), (-0.28, 0.0), (-0.34, 0.09)):
        rod('firewood', (WX + 0.02, yy, zz + 0.05), (WX + 0.26, yy, zz + 0.05), 0.05, 6, firewood)


# ================================================================= 3. twofloor -> two-storey house
def b_twofloor():
    wall = mat_tex('house_wall', tx_house(), 0.8)
    roof = mat_tex('house_roof', tx_tiles(), 0.7)
    eave = mat_col('house_eave', '#B4502E', 0.7)
    white = mat_col('house_white', '#FFFDF6', 0.7)
    doorm = mat_tex('house_door', tx_planks('#8C4F2B', '#653619'), 0.7)
    rail = mat_col('house_rail', '#2F7A66', 0.6)
    gold = mat_col('house_knob', '#F2C440', 0.5)
    brick = mat_tex('house_brick', tx_blocks(32, 32, 4, 2, '#C2603E', '#B65738', '#8A3B22', 2), 0.8)
    WX, WY, WH = 0.80, 0.60, 1.25
    box('walls', 0, 0, 0, 2 * WX, 2 * WY, WH, wall, du=1 / 0.53, dv=1e-3, fu=True, fv=True)
    ox = 0.14
    EX, EY = WX + ox, WY + ox
    box('eave', 0, 0, WH, 2 * EX, 2 * EY, 0.07, eave)
    z0, zr, rx = WH + 0.07, WH + 0.07 + 0.52, 0.36
    verts = [V(EX, -EY, z0), V(EX, EY, z0), V(-EX, EY, z0), V(-EX, -EY, z0), V(rx, 0, zr), V(-rx, 0, zr)]
    faces = [[3, 0, 4, 5], [1, 2, 5, 4], [0, 1, 4], [2, 3, 5], [0, 3, 2, 1]]
    mk('roof', (verts, faces), roof, du=3.0)
    box('chimney', 0.42, 0.22, 1.25, 0.15, 0.15, 0.67, brick, du=6)
    box('chimney_cap', 0.42, 0.22, 1.92, 0.20, 0.20, 0.04, white)
    # door (covers the middle ground-floor window of the wall texture)
    box('door_frame', 0, -WY - 0.005, 0, 0.42, 0.03, 0.66, white)
    box('door', 0, -WY - 0.025, 0, 0.32, 0.03, 0.59, doorm, du=1e-3, fu=True, dv=3)
    box('knob', 0.10, -WY - 0.045, 0.28, 0.035, 0.03, 0.035, gold)
    box('step', 0, -WY - 0.10, 0, 0.52, 0.18, 0.05, white)
    # balcony over the door
    bz = 0.655
    box('balc_slab', 0, -WY - 0.11, bz, 0.70, 0.24, 0.05, white)
    by = -WY - 0.21
    for x in (-0.31, -0.155, 0.0, 0.155, 0.31):
        box('post', x, by, bz + 0.05, 0.03, 0.03, 0.20, rail)
    for x in (-0.31, 0.31):
        box('post', x, -WY - 0.10, bz + 0.05, 0.03, 0.03, 0.20, rail)
    box('rail_f', 0, by, bz + 0.24, 0.66, 0.04, 0.035, rail)
    for x in (-0.31, 0.31):
        box('rail_s', x, -WY - 0.11, bz + 0.24, 0.04, 0.22, 0.035, rail)


# ================================================================= 4. sphinx
def b_sphinx():
    sand = mat_tex('sphinx_sand', tx_blocks(64, 64, 4, 1, '#E6C28A', '#DEB87F', '#C29860', 2), 0.85)
    plinth = mat_tex('sphinx_plinth', tx_blocks(64, 64, 4, 2, '#CFA46A', '#C79B60', '#A07646', 2), 0.85)
    face = mat_col('sphinx_face', '#EBC68E', 0.8)
    nemes = mat_tex('sphinx_nemes', tx_nemes(), 0.7)
    gold = mat_col('sphinx_gold', '#F2C53D', 0.5)
    dark = mat_col('sphinx_dark', '#3B2A20', 0.8)
    mouth = mat_col('sphinx_mouth', '#B07A4A', 0.8)
    PZ = 0.12
    box('plinth', 0, 0, 0, 0.92, 2.30, PZ, plinth, du=2.5)

    def ring(y, a, h):
        z = PZ
        return [V(a * 0.85, y, z), V(a, y, z + 0.3 * h), V(a, y, z + 0.68 * h), V(a * 0.68, y, z + h),
                V(-a * 0.68, y, z + h), V(-a, y, z + 0.68 * h), V(-a, y, z + 0.3 * h), V(-a * 0.85, y, z)]
    st = [(0.98, 0.20, 0.30), (0.84, 0.34, 0.46), (0.50, 0.33, 0.44), (0.05, 0.29, 0.42),
          (-0.28, 0.31, 0.50), (-0.44, 0.27, 0.54), (-0.52, 0.19, 0.44)]
    mk('body', loft([ring(*q) for q in st]), sand, du=2.2)
    for sx in (-1, 1):
        sphere('haunch', sx * 0.31, 0.62, PZ + 0.16, 0.09, 8, 5, sand, ry=0.26, rz=0.16, du=2.2)
        x = sx * 0.17

        def pr(y, hx, z1):
            return [V(x + hx, y, PZ), V(x + hx, y, z1), V(x - hx, y, z1), V(x - hx, y, PZ)]
        mk('paw', loft([pr(-0.40, 0.09, PZ + 0.17), pr(-1.00, 0.09, PZ + 0.17), pr(-1.10, 0.075, PZ + 0.11)]), sand, du=2.2)
    rod('tail', (0.33, 0.97, PZ + 0.03), (0.37, 0.55, PZ + 0.03), 0.03, 5, sand)

    def hood(z, hx, y0, y1):
        return ring_rect(0, (y0 + y1) / 2, z, hx, (y1 - y0) / 2)
    piv = Vector((0.0, -0.40, 0.62))     # Q-style: the whole head is enlarged 1.3x around the neck
    HM = Matrix.Translation(piv) @ Matrix.Scale(1.3, 4) @ Matrix.Translation(-piv)
    mk('nemes', loft([hood(0.62, 0.25, -0.52, -0.14), hood(0.95, 0.22, -0.53, -0.16), hood(1.07, 0.15, -0.50, -0.22)]), nemes, M=HM, du=3.5)
    box('face', 0, -0.555, 0.66, 0.27, 0.10, 0.31, face, M=HM)
    for sx in (-1, 1):
        box('lappet', sx * 0.185, -0.53, 0.40, 0.10, 0.08, 0.50, nemes, M=HM, du=3.5)
        box('eye', sx * 0.065, -0.61, 0.835, 0.07, 0.015, 0.03, dark, M=HM)
    box('headband', 0, -0.555, 0.955, 0.29, 0.11, 0.035, gold, M=HM)
    box('uraeus', 0, -0.615, 0.93, 0.04, 0.03, 0.08, gold, M=HM)
    box('nose', 0, -0.615, 0.76, 0.045, 0.03, 0.07, face, M=HM)
    box('mouth', 0, -0.611, 0.715, 0.08, 0.012, 0.015, mouth, M=HM)
    box('beard', 0, -0.56, 0.55, 0.07, 0.07, 0.12, nemes, M=HM, du=3.5)


# ================================================================= 5. pyramid
def b_pyramid():
    blocks = mat_tex('pyr_blocks', tx_blocks(64, 64, 4, 2, '#E9C484', '#DFB874', '#B88C52', 2), 0.85)
    gold = mat_col('pyr_gold', '#F5C842', 0.45, 0.15)
    door = mat_col('pyr_door', '#6B4A2A', 0.9)
    A, H, zt = 1.10, 1.45, 1.24
    at = A * (1 - zt / H)
    mk('pyramid', loft([ring_rect(0, 0, 0, A, A), ring_rect(0, 0, zt, at, at)]), blocks, du=2.6)
    mk('capstone', loft([ring_rect(0, 0, zt - 0.02, at + 0.025, at + 0.025), V(0, 0, H + 0.03)]), gold)
    # small entrance on the front face (a dark notch lying on the slope)
    zc = 0.30
    yface = -A * (1 - zc / H)
    k = A / H
    pts = [(-0.07, zc - 0.07), (0.07, zc - 0.07), (0.07, zc + 0.05), (0.0, zc + 0.11), (-0.07, zc + 0.05)]
    vs = []
    for px, pz in pts:
        yy = -A * (1 - pz / H)
        vs.append((px, yy - 0.012, pz))
    for px, pz in pts:
        yy = -A * (1 - pz / H)
        vs.append((px, yy + 0.02, pz))
    n = len(pts)
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    mk('entrance', ([Vector(v) for v in vs], faces), door)


# ================================================================= 6. pisa
def b_pisa():
    marble = mat_col('pisa_marble', '#F1ECE1', 0.65)
    arc = mat_tex('pisa_arcade', tx_pisa_gallery(), 0.65)
    gnd = mat_tex('pisa_ground', tx_pisa_ground(), 0.65)
    lean = Matrix.Rotation(math.radians(6.0), 4, 'Y')      # pivot = base centre, leans towards +X
    cyl('plinth', 0, 0, 0.0, 0.10, 0.49, 0.47, 16, marble)
    SEG = 16
    zb = 0.045
    cyl('ground', 0, 0, zb, 0.40, 0.40, 0.40, SEG, gnd, M=lean, caps=(False, False), **ONE)
    cyl('cornice0', 0, 0, 0.40, 0.435, 0.445, 0.445, SEG, marble, M=lean)
    z, FH = 0.435, 0.175
    for i in range(6):
        cyl('gallery%d' % i, 0, 0, z, z + FH, 0.37, 0.37, SEG, arc, M=lean, caps=(False, False), **ONE)
        z += FH
        cyl('cornice%d' % (i + 1), 0, 0, z, z + 0.03, 0.43, 0.43, SEG, marble, M=lean)
        z += 0.03
    cyl('belfry', 0, 0, z, z + 0.20, 0.27, 0.27, 12, arc, M=lean, caps=(False, False), **ONE)
    z += 0.20
    cyl('belfry_cornice', 0, 0, z, z + 0.035, 0.31, 0.31, 12, marble, M=lean)
    z += 0.035
    cyl('belfry_roof', 0, 0, z, z + 0.05, 0.22, 0.16, 12, marble, M=lean)


# ================================================================= 7. eiffel
def b_eiffel():
    lat = mat_tex('eiffel_lattice', tx_lattice('#B47A43', '#5E3A22', '#CE9459'), 0.7)
    deck = mat_col('eiffel_deck', '#7A4D2C', 0.75)
    stone = mat_col('eiffel_stone', '#C9BFAE', 0.85)
    cabin = mat_col('eiffel_cabin', '#D9A15E', 0.6)
    pts = [(0.60, 0.0, 0.105), (0.50, 0.26, 0.09), (0.40, 0.52, 0.075)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            mk('leg', loft([ring_rect(sx * c, sy * c, z, h, h) for c, z, h in pts]), lat, du=7, fu=True)
            box('foot', sx * 0.60, sy * 0.60, 0, 0.28, 0.28, 0.05, stone)
    # decorative arch under the first platform on every side
    A, B, zc, w, t, n = 0.46, 0.32, 0.14, 0.03, 0.025, 8
    rings = []
    for i in range(n + 1):
        a = PI * i / n
        p = V(A * math.cos(a), 0.0, zc + B * math.sin(a))
        nr = Vector((math.cos(a) / A, 0.0, math.sin(a) / B)).normalized()
        rings.append([p + nr * w + V(0, -t, 0), p + nr * w + V(0, t, 0), p - nr * w + V(0, t, 0), p - nr * w + V(0, -t, 0)])
    for k in range(4):
        M = Matrix.Rotation(k * PI / 2, 4, 'Z') @ Matrix.Translation((0, -0.50, 0))
        mk('arch', loft(rings), lat, M=M, du=14, fu=True)
    box('deck1', 0, 0, 0.52, 0.92, 0.92, 0.09, lat, du=10, fu=True, alt=(deck, FLAT))
    mk('mid', loft([ring_rect(0, 0, 0.61, 0.31, 0.31), ring_rect(0, 0, 1.10, 0.15, 0.15)], False, False), lat, du=8, fu=True)
    box('deck2', 0, 0, 1.10, 0.44, 0.44, 0.06, lat, du=12, fu=True, alt=(deck, FLAT))
    mk('upper', loft([ring_rect(0, 0, 1.16, 0.13, 0.13), ring_rect(0, 0, 1.72, 0.045, 0.045)], False, False), lat, du=14, fu=True)
    box('cabin', 0, 0, 1.70, 0.12, 0.12, 0.08, cabin)
    cyl('cabin_roof', 0, 0, 1.78, 1.83, 0.075, 0.03, 4, deck)
    cyl('antenna', 0, 0, 1.83, 2.0, 0.014, 0.008, 4, deck)


# ================================================================= 8. tokyo tower
def b_tokyotower():
    O = mat_tex('tt_orange', tx_lattice('#F4632A', '#A83A14', '#FF8C55'), 0.65)
    W = mat_tex('tt_white', tx_lattice('#FFFFFF', '#D8D2C8', '#FFFFFF'), 0.65)
    deck = mat_tex('tt_deck', tx_deck('#4F86BF', '#F4F2ED'), 0.5)
    roof = mat_col('tt_roof', '#E6E1D8', 0.7)
    Oc = mat_col('tt_o', '#F4632A', 0.6)
    Wc = mat_col('tt_w', '#FAF7F1', 0.6)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mk('leg', loft([ring_rect(sx * 0.58, sy * 0.58, 0.0, 0.10, 0.10), ring_rect(sx * 0.37, sy * 0.37, 0.36, 0.075, 0.075)]),
               O, du=7, fu=True)
    box('foot_bldg', 0, 0, 0, 0.80, 0.80, 0.18, deck, du=6, fu=True, fv=True, dv=1e-3, alt=(roof, FLAT))

    def hw(z):
        return 0.40 + (0.165 - 0.40) * (z - 0.36) / (0.95 - 0.36)
    for i, (z0, z1, m) in enumerate([(0.36, 0.52, W), (0.52, 0.67, O), (0.67, 0.81, W), (0.81, 0.95, O)]):
        mk('shaft%d' % i, loft([ring_rect(0, 0, z0, hw(z0), hw(z0)), ring_rect(0, 0, z1, hw(z1), hw(z1))], i == 0, False), m, du=8, fu=True)
    box('obs1', 0, 0, 0.95, 0.58, 0.58, 0.10, deck, du=6, fu=True, fv=True, dv=1e-3, alt=(roof, FLAT))
    box('obs2', 0, 0, 1.05, 0.48, 0.48, 0.085, deck, du=6, fu=True, fv=True, dv=1e-3, alt=(roof, FLAT))

    def hw2(z):
        return 0.15 + (0.07 - 0.15) * (z - 1.135) / (1.55 - 1.135)
    for i, (z0, z1, m) in enumerate([(1.135, 1.275, O), (1.275, 1.415, W), (1.415, 1.55, O)]):
        mk('upper%d' % i, loft([ring_rect(0, 0, z0, hw2(z0), hw2(z0)), ring_rect(0, 0, z1, hw2(z1), hw2(z1))], False, False), m, du=10, fu=True)
    box('top_deck', 0, 0, 1.55, 0.20, 0.20, 0.07, deck, du=8, fu=True, fv=True, dv=1e-3, alt=(roof, FLAT))
    for i, (z0, z1, r0, r1, m) in enumerate([(1.62, 1.72, 0.05, 0.042, Wc), (1.72, 1.82, 0.042, 0.033, Oc),
                                              (1.82, 1.91, 0.033, 0.024, Wc), (1.91, 2.01, 0.024, 0.010, Oc)]):
        cyl('antenna%d' % i, 0, 0, z0, z1, r0, r1, 6, m)


# ================================================================= 9. oriental pearl
def b_pearl():
    pink = mat_tex('pearl_pink', tx_pearl(), 0.55)
    conc = mat_col('pearl_column', '#ECE8F0', 0.7)
    steel = mat_col('pearl_spire', '#D5D9E0', 0.5, 0.1)
    for a in (-90, 30, 150):
        a = math.radians(a)
        c, s = math.cos(a), math.sin(a)
        mk('leg', loft([ring_circ(0.52 * c, 0.52 * s, 0.0, 0.06, 8), ring_circ(0.13 * c, 0.13 * s, 0.60, 0.05, 8)]), conc)
    for a in (90, 210, 330):
        a = math.radians(a)
        cyl('column', 0.12 * math.cos(a), 0.12 * math.sin(a), 0.0, 1.52, 0.064, 0.064, 8, conc)
    sphere('ball_low', 0, 0, 0.66, 0.33, 14, 9, pink, uv='sph', nu=6)
    for a, z in ((30, 1.07), (150, 1.17), (270, 1.27)):
        a = math.radians(a)
        sphere('ball_small', 0.15 * math.cos(a), 0.15 * math.sin(a), z, 0.085, 8, 6, pink, uv='sph', nu=2)
    sphere('ball_up', 0, 0, 1.47, 0.20, 12, 8, pink, uv='sph', nu=4)
    cyl('top_col', 0, 0, 1.60, 1.76, 0.08, 0.07, 8, conc)
    sphere('ball_top', 0, 0, 1.78, 0.075, 8, 6, pink, uv='sph', nu=2)
    cyl('spire', 0, 0, 1.83, 2.12, 0.045, 0.01, 6, steel)


# ================================================================= 10. taipei 101
def b_taipei101():
    glass = mat_tex('t101_glass', tx_glass101(), 0.45, 0.1)
    trim = mat_col('t101_trim', '#6CC3B2', 0.5)
    gold = mat_col('t101_gold', '#E9C45C', 0.5)
    steel = mat_col('t101_spire', '#D3DBDF', 0.45, 0.1)
    podium = mat_col('t101_podium', '#9ED6CB', 0.6)
    K = 1.15                                      # Q-style: everything a bit fatter than the real tower
    box('podium', 0, 0, 0, 0.84, 0.74, 0.09, podium, alt=(trim, TOP))
    mk('base', loft([ring_chamf(0, 0, 0.09, 0.27 * K, 0.06 * K), ring_chamf(0, 0, 0.47, 0.215 * K, 0.05 * K)], False, True),
       glass, du=3.5, dv=4.5, fu=True, alt=(trim, TOP))
    for k in range(4):
        R = Matrix.Rotation(k * PI / 2, 4, 'Z')
        rod('coin', R @ V(0, -0.222 * K, 0.38), R @ V(0, -0.222 * K - 0.035, 0.38), 0.05, 8, gold)
    z = 0.47
    for i in range(8):
        mk('seg%d' % i, loft([ring_chamf(0, 0, z, 0.195 * K, 0.045 * K), ring_chamf(0, 0, z + 0.135, 0.255 * K, 0.06 * K)], False, True),
           glass, du=3.5, fu=True, fv=True, dv=1e-3, alt=(trim, TOP))
        z += 0.135
    mk('crown1', loft([ring_chamf(0, 0, z, 0.175 * K, 0.04), ring_chamf(0, 0, z + 0.10, 0.16 * K, 0.035)], False, True), glass, du=3.5, fu=True, alt=(trim, TOP))
    z += 0.10
    mk('crown2', loft([ring_chamf(0, 0, z, 0.12 * K, 0.03), ring_chamf(0, 0, z + 0.07, 0.105 * K, 0.025)], False, True), glass, du=3.5, fu=True, alt=(trim, TOP))
    z += 0.07
    mk('crown3', loft([ring_chamf(0, 0, z, 0.07, 0.02), ring_chamf(0, 0, z + 0.05, 0.055, 0.015)], False, True), trim)
    z += 0.05
    cyl('spire', 0, 0, z, z + 0.28, 0.03, 0.01, 6, steel)


# ================================================================= 11. skytree
def b_skytree():
    lat = mat_tex('st_lattice', tx_skytree(), 0.6)
    white = mat_col('st_white', '#F7FAFD', 0.55)
    grey = mat_col('st_grey', '#9FB3C8', 0.6)
    glassm = mat_tex('st_glass', tx_deck('#5E7FA6', '#F3F7FB'), 0.45, 0.1)

    def tri_ring(z, R, per=4):
        cs = [(R * math.cos(math.radians(a)), R * math.sin(math.radians(a))) for a in (90, 210, 330)]
        pts = []
        for i in range(3):
            (x0, y0), (x1, y1) = cs[i], cs[(i + 1) % 3]
            for k in range(per):
                t = k / per
                pts.append(V(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z))
        return pts

    def circ(z, r):
        return ring_circ(0, 0, z, r, 12, rot=PI / 2)

    def mix(r1, r2, t):
        return [a.lerp(b, t) for a, b in zip(r1, r2)]
    rings = [tri_ring(0.0, 0.48), mix(tri_ring(0.24, 0.40), circ(0.24, 0.27), 0.5), circ(0.52, 0.20), circ(0.82, 0.16), circ(1.04, 0.145)]
    mk('shaft', loft(rings, True, False), lat, du=1e-3, fu=True, dv=7)
    cyl('deck1_bot', 0, 0, 1.02, 1.05, 0.25, 0.275, 16, white)
    cyl('deck1_glass', 0, 0, 1.05, 1.14, 0.265, 0.265, 16, glassm, caps=(False, False), **ONE)
    cyl('deck1_top', 0, 0, 1.14, 1.18, 0.28, 0.24, 16, white)
    mk('shaft2', loft([circ(1.18, 0.135), circ(1.50, 0.115)], False, False), lat, du=1e-3, fu=True, dv=7)
    cyl('deck2_bot', 0, 0, 1.49, 1.51, 0.15, 0.19, 16, white)
    cyl('deck2_glass', 0, 0, 1.51, 1.555, 0.18, 0.18, 16, glassm, caps=(False, False), **ONE)
    cyl('deck2_top', 0, 0, 1.555, 1.58, 0.19, 0.14, 16, white)
    mk('shaft3', loft([circ(1.58, 0.10), circ(1.66, 0.09)], False, False), lat, du=1e-3, fu=True, dv=7)
    cyl('antenna', 0, 0, 1.66, 2.06, 0.06, 0.012, 8, white)
    cyl('antenna_band', 0, 0, 1.78, 1.81, 0.054, 0.053, 8, grey)


# ================================================================= 12. burj khalifa
def b_burj():
    glass = mat_tex('burj_glass', tx_burj(), 0.4, 0.15)
    terr = mat_col('burj_terrace', '#DDE6EF', 0.5, 0.1)
    spire = mat_col('burj_spire', '#E6ECF2', 0.4, 0.15)
    HW = 0.13

    def wing_prof(L, ch=0.05, x0=0.03):
        return [(x0, -HW), (L - ch, -HW), (L, -HW + ch), (L, HW - ch), (L - ch, HW), (x0, HW)]
    for w, adeg in enumerate((-90, 30, 150)):     # three wings; setbacks spiral round the core
        R = Matrix.Rotation(math.radians(adeg), 4, 'Z')
        zprev = 0.0
        for i in range(5):
            ztop = 0.24 + 0.072 * (3 * i + w)
            L = 0.56 - 0.072 * i
            pr = wing_prof(L)
            mk('wing', loft([[V(x, y, zprev) for x, y in pr], [V(x, y, ztop) for x, y in pr]], False, True),
               glass, M=R, du=8, fu=True, alt=(terr, TOP))
            zprev = ztop
    mk('core', loft([ring_circ(0, 0, 0.0, 0.17, 6), ring_circ(0, 0, 1.40, 0.14, 6)], False, True), glass, du=8, fu=True, alt=(terr, TOP))
    mk('core2', loft([ring_circ(0, 0, 1.40, 0.115, 6), ring_circ(0, 0, 1.60, 0.08, 6)], False, True), glass, du=8, fu=True, alt=(terr, TOP))
    mk('core3', loft([ring_circ(0, 0, 1.60, 0.065, 6), ring_circ(0, 0, 1.70, 0.05, 6)], False, True), glass, du=8, fu=True, alt=(terr, TOP))
    cyl('spire', 0, 0, 1.70, 2.12, 0.04, 0.006, 6, spire)


# ================================================================= 13. sagrada familia
def b_sagrada():
    stone = mat_tex('sf_stone', tx_sag_stone(), 0.8)
    nave = mat_tex('sf_nave', tx_gothic(), 0.8)
    roofm = mat_col('sf_roof', '#C48F58', 0.8)
    mosaic = mat_tex('sf_mosaic', tx_mosaic(), 0.5)
    door = mat_col('sf_door', '#4B2F22', 0.85)
    gold = mat_col('sf_gold', '#F6CC45', 0.45)
    box('nave', 0, 0.03, 0, 1.0, 0.74, 0.50, nave, du=1 / 0.16, fu=True, fv=True, dv=1e-3, alt=(roofm, TOP))
    prism_xz('nave_roof', [(-0.50, 0.50), (0.50, 0.50), (0.0, 0.76)], -0.34, 0.40, stone, du=8, dv=6)
    prism_xz('portal', [(-0.065, 0.0), (0.065, 0.0), (0.065, 0.20), (0.04, 0.27), (0.0, 0.31), (-0.04, 0.27), (-0.065, 0.20)],
             -0.36, -0.335, door)
    PROF = [(1.0, 0.0), (1.0, 0.36), (0.93, 0.54), (0.72, 0.70), (0.46, 0.83), (0.25, 0.92)]

    def spire(x, y, R, H):
        lathe('spire', x, y, [(R * a, H * b) for a, b in PROF], 8, stone, caps=(False, True), du=1e-3, fu=True, dv=5)
        zt = H * 0.92
        fr = max(0.045, 0.45 * R)
        lathe('finial', x, y, [(0.0, zt - 0.01), (fr, zt + fr * 0.9), (fr * 0.6, zt + fr * 1.9), (0.0, zt + fr * 3.0)], 6, mosaic, uv='sph', nu=2)
        return zt + fr * 3.0
    for x, H in ((-0.44, 1.22), (-0.18, 1.40), (0.18, 1.40), (0.44, 1.22)):
        spire(x, -0.40, 0.095, H)
    for x, y, H in ((-0.28, -0.08, 1.50), (0.28, -0.08, 1.50), (-0.28, 0.26, 1.46), (0.28, 0.26, 1.46)):
        spire(x, y, 0.10, H)
    ztop = spire(0.0, 0.05, 0.15, 1.80)            # Jesus Christ: tallest, cross on top
    zc = ztop - 0.02
    box('cross_v', 0, 0.05, zc, 0.035, 0.035, 0.20, gold)
    box('cross_x', 0, 0.05, zc + 0.10, 0.15, 0.035, 0.035, gold)
    box('cross_y', 0, 0.05, zc + 0.10, 0.035, 0.15, 0.035, gold)
    ztop = spire(0.0, 0.40, 0.115, 1.60)           # Mary: star on top
    zs = ztop + 0.02                               # finial tip pierces the star so it never floats
    star = []
    for i in range(10):
        a = PI / 2 + i * PI / 5
        r = 0.085 if i % 2 == 0 else 0.037
        star.append((r * math.cos(a), zs + r * math.sin(a)))
    prism_xz('star', star, 0.40 - 0.018, 0.40 + 0.018, gold)


# ================================================================= scene utils, export, report
def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for x in list(coll):
            try:
                coll.remove(x)
            except Exception:
                pass
    PARTS.clear()


def finish(key):
    objs = list(PARTS)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    root = bpy.context.view_layer.objects.active
    root.name = key
    root.data.name = key
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    me = root.data
    me.polygons.foreach_set('use_smooth', [False] * len(me.polygons))
    me.validate()
    me.update()
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    zmin = float(co[:, 2].min())
    if abs(zmin) > 1e-4:
        print('  [fix] %s min z %.4f -> 0' % (key, zmin))
        co[:, 2] -= zmin
        me.vertices.foreach_set('co', co.ravel())
        me.update()
    mn, mx = co.min(0), co.max(0)
    path = os.path.join(OUT, key + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    return path, mn, mx


def glb_info(path):
    with open(path, 'rb') as f:
        data = f.read()
    clen = struct.unpack_from('<I', data, 12)[0]
    js = json.loads(data[20:20 + clen].decode('utf-8'))
    tris = verts = 0
    for m in js.get('meshes', []):
        for p in m['primitives']:
            if p.get('mode', 4) != 4:
                continue
            nv = js['accessors'][p['attributes']['POSITION']]['count']
            verts += nv
            tris += (js['accessors'][p['indices']]['count'] if 'indices' in p else nv) // 3
    imgs = [(i.get('name'), i.get('mimeType'), js['bufferViews'][i['bufferView']]['byteLength']) for i in js.get('images', [])]
    return len(data), tris, verts, imgs, [n.get('name') for n in js.get('nodes', [])], js.get('materials', [])


def fit_camera(cam, objs, az=35.0, el=24.0, margin=1.10):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) * 0.5
    az, el = math.radians(az), math.radians(el)
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    q = (-d).to_track_quat('-Z', 'Y')
    R = q.to_matrix()
    right, up = R @ Vector((1, 0, 0)), R @ Vector((0, 1, 0))
    us = [(p - c).dot(right) for p in pts]
    vs = [(p - c).dot(up) for p in pts]
    cu, cv = (max(us) + min(us)) * 0.5, (max(vs) + min(vs)) * 0.5
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(max(us) - min(us), max(vs) - min(vs)) * margin
    cam.data.clip_end = 200.0
    cam.location = c + right * cu + up * cv + d * 30.0
    cam.rotation_euler = q.to_euler()


def render_preview(keys, cols=5, TW=320):
    reset()
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'TEXTURE'
    for attr, val in (('show_backface_culling', True), ('show_cavity', False), ('show_shadows', False), ('show_object_outline', False)):
        try:
            setattr(sh, attr, val)
        except Exception:
            pass
    try:
        sc.display.render_aa = '8'
    except Exception:
        pass
    sc.render.film_transparent = True
    try:
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
    except Exception:
        pass
    sc.render.resolution_x = TW
    sc.render.resolution_y = TW
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    rows = (len(keys) + cols - 1) // cols
    bg = np.array(rgb('#CDEBFA'), np.float32)
    sheet = np.empty((rows * TW, cols * TW, 3), np.float32)
    sheet[:] = bg
    for i, key in enumerate(keys):
        for o in [o for o in sc.objects if o is not cam]:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, key + '.glb'))
        objs = [o for o in sc.objects if o.type == 'MESH']
        fit_camera(cam, objs)
        tile = os.path.join(TMP, 'tile_%s.png' % key)
        sc.render.filepath = tile
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(tile, check_existing=False)
        px = np.empty(TW * TW * 4, np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        px = px.reshape(TW, TW, 4)
        a = px[..., 3:4]
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * TW
        sheet[y0:y0 + TW, c * TW:(c + 1) * TW] = px[..., :3] * a + bg * (1.0 - a)
    out = os.path.join(OUT, 'preview.png')
    write_png(out, (np.clip(sheet, 0, 1) * 255.0 + 0.5).astype(np.uint8)[::-1])
    print('PREVIEW', out, os.path.getsize(out))


BUILDERS = [('triangle', b_triangle), ('square', b_square), ('twofloor', b_twofloor), ('sphinx', b_sphinx),
            ('pyramid', b_pyramid), ('pisa', b_pisa), ('eiffel', b_eiffel), ('tokyotower', b_tokyotower),
            ('pearl', b_pearl), ('taipei101', b_taipei101), ('skytree', b_skytree), ('burj', b_burj),
            ('sagrada', b_sagrada)]


def main():
    errors = 0
    for key, fn in BUILDERS:
        if ONLY and key not in ONLY:
            continue
        try:
            reset()
            fn()
            path, mn, mx = finish(key)
            size, tris, verts, imgs, nodes, mats = glb_info(path)
            print('MODEL %-10s %7d B  tris %5d  verts %5d  nodes %s  imgs %s  size x%.2f y%.2f z%.2f  min(%.2f,%.2f,%.2f) max(%.2f,%.2f,%.2f)' % (
                key, size, tris, verts, nodes, [(n, b) for n, _, b in imgs], mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2],
                mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]))
        except Exception:
            errors += 1
            print('ERROR building', key)
            traceback.print_exc()
    total = 0
    for key, _ in BUILDERS:
        p = os.path.join(OUT, key + '.glb')
        if os.path.exists(p):
            total += os.path.getsize(p)
    print('TOTAL GLB BYTES', total)
    if not NOPREVIEW:
        try:
            render_preview([k for k, _ in BUILDERS if os.path.exists(os.path.join(OUT, k + '.glb'))])
        except Exception:
            errors += 1
            print('ERROR preview')
            traceback.print_exc()
    shutil.rmtree(TMP, ignore_errors=True)
    print('DONE errors=%d' % errors)


# run only when Blender starts this file (-P make_landmarks.py); another script can `import make_landmarks` and reuse
# the helpers (materials, textures, loft/box/cyl/…, reset, finish, glb_info, render_preview) for its own models
if __name__ == '__main__':
    main()
