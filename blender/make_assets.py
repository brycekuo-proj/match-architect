# MatchQuake asset builder for Blender 5.x
# Usage: Blender -b -P make_assets.py -- <out_dir>
# Exports low-poly GLB models (match, car body, wheel) and renders an itch.io cover.
import bpy, bmesh, math, sys, os, json
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- helpers
def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for c in list(bpy.data.cameras):
        bpy.data.cameras.remove(c)
    for l in list(bpy.data.lights):
        bpy.data.lights.remove(l)

_mats = {}
def mat(name, color, rough=0.65, metal=0.0, emit=None, emit_strength=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    m.diffuse_color = (*color, 1.0)
    nt = m.node_tree
    if nt is not None:
        b = nt.nodes.get('Principled BSDF')
        if b is not None:
            b.inputs['Base Color'].default_value = (*color, 1.0)
            b.inputs['Roughness'].default_value = rough
            b.inputs['Metallic'].default_value = metal
            if emit is not None:
                for key in ('Emission Color', 'Emission'):
                    if key in b.inputs:
                        b.inputs[key].default_value = (*emit, 1.0)
                        break
                if 'Emission Strength' in b.inputs:
                    b.inputs['Emission Strength'].default_value = emit_strength
    _mats[name] = m
    return m

def wood_mat(name, base=(0.80, 0.60, 0.36), light=(0.95, 0.80, 0.55)):
    """Procedural wood grain, used for the Cycles cover only."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    if nt is None:
        m.diffuse_color = (*base, 1)
        return m
    n = nt.nodes
    b = n.get('Principled BSDF')
    tc = n.new('ShaderNodeTexCoord')
    mp = n.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.6, 14.0, 14.0)
    nz = n.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 4.0
    nz.inputs['Detail'].default_value = 6.0
    cr = n.new('ShaderNodeValToRGB')
    cr.color_ramp.elements[0].color = (*base, 1)
    cr.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac'])
    nt.links.new(cr.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7
    return m

def assign(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)

def apply_scale(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def cube(name, size, loc, m, bevel=0.0, seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    apply_scale(o)
    if bevel > 0:
        md = o.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = seg
        md.limit_method = 'ANGLE'
    assign(o, m)
    return o

def ellipsoid(name, radii, loc, m, seg=10, rings=7):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = radii
    apply_scale(o)
    assign(o, m)
    return o

def cylinder(name, r, depth, loc, m, verts=16, rot=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    assign(o, m)
    return o

def flat_poly(name, pts2d, z, thick, m):
    me = bpy.data.meshes.new(name)
    verts = [(x, y, z) for x, y in pts2d]
    me.from_pydata(verts, [], [list(range(len(verts)))])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    sd = o.modifiers.new('solid', 'SOLIDIFY')
    sd.thickness = thick
    assign(o, m)
    return o

def shade_flat(objs):
    for o in objs:
        if o.type == 'MESH':
            for p in o.data.polygons:
                p.use_smooth = False

def export_glb(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True)
    print('EXPORTED', path, os.path.getsize(path))

# palette (linear-ish values)
WOOD = (0.86, 0.66, 0.40)
HEAD = (0.62, 0.06, 0.04)
HEAD_TIP = (0.85, 0.20, 0.08)
SLEEVE = (0.78, 0.10, 0.06)
STRIKER = (0.24, 0.13, 0.08)
LABEL = (0.96, 0.89, 0.72)
FLAME_O = (1.00, 0.45, 0.05)
FLAME_Y = (1.00, 0.80, 0.15)
TRAY = (0.93, 0.88, 0.78)
TIRE = (0.06, 0.06, 0.07)
BUTTON = (0.95, 0.78, 0.40)

meta = {}

# ---------------------------------------------------------------- 1. match (length 1, along +X, head at -X)
def build_match(m_body, m_head, m_tip=None, length=1.0, thick=0.06, loc=(0, 0, 0), rot_y=0.0, rot_z=0.0, prefix='match'):
    body = cube(prefix + '_body', (length, thick, thick), (0, 0, 0), m_body, bevel=thick * 0.18, seg=1)
    head = ellipsoid(prefix + '_head', (thick * 0.95, thick * 0.78, thick * 0.78), (-length / 2 - thick * 0.25, 0, 0), m_head)
    parts = [body, head]
    if m_tip is not None:
        tip = ellipsoid(prefix + '_tip', (thick * 0.35, thick * 0.5, thick * 0.5), (-length / 2 - thick * 0.95, 0, 0), m_tip, seg=8, rings=5)
        parts.append(tip)
    for p in parts:
        p.location = Vector(p.location) + Vector(loc)
        p.rotation_euler = (0, rot_y, rot_z)
    # rotate around the match centre, not each part's own origin
    if rot_y or rot_z:
        piv = Vector(loc)
        from mathutils import Euler
        R = Euler((0, rot_y, rot_z)).to_matrix()
        for p, off in zip(parts, [(0, 0, 0), (-length / 2 - thick * 0.25, 0, 0), (-length / 2 - thick * 0.95, 0, 0)]):
            p.location = piv + R @ Vector(off)
    return parts

clear_scene()
m_wood = mat('wood', WOOD, 0.75)
m_head = mat('head', HEAD, 0.55)
m_tip = mat('head_tip', HEAD_TIP, 0.5)
match_parts = build_match(m_wood, m_head, m_tip)
shade_flat(match_parts)
export_glb(match_parts, os.path.join(OUT, 'match.glb'))
meta['match'] = {'length': 1.0, 'thick': 0.06, 'head_end': '-x'}

# ---------------------------------------------------------------- 2. matchbox car (metres, faces +X)
clear_scene()
L, D, H = 1.5, 0.9, 0.5          # sleeve length / depth / height
zc = 0.0
m_sleeve = mat('sleeve', SLEEVE, 0.6)
m_striker = mat('striker', STRIKER, 1.0)
m_label = mat('label', LABEL, 0.7)
m_fo = mat('flame_o', FLAME_O, 0.5, emit=FLAME_O, emit_strength=0.3)
m_fy = mat('flame_y', FLAME_Y, 0.5, emit=FLAME_Y, emit_strength=0.4)
m_tray = mat('tray', TRAY, 0.8)
m_light = mat('headlight', (1.0, 0.95, 0.6), 0.3, emit=(1.0, 0.9, 0.5), emit_strength=1.5)
car = []
car.append(cube('sleeve', (L, D, H), (0.05, 0, zc), m_sleeve, bevel=0.025))
# striker strips on both long sides
for sgn in (-1, 1):
    car.append(cube('striker_%d' % sgn, (L * 0.86, 0.012, H * 0.62), (0.05, sgn * (D / 2 + 0.004), zc), m_striker))
# top label with flame emblem
car.append(cube('label', (L * 0.78, D * 0.74, 0.012), (0.05, 0, zc + H / 2 + 0.004), m_label))
flame_out = [(0.0, 0.26), (0.10, 0.08), (0.12, -0.06), (0.06, -0.15), (-0.06, -0.15), (-0.12, -0.06), (-0.08, 0.06), (-0.02, 0.0)]
flame_in = [(0.0, 0.12), (0.05, 0.0), (0.04, -0.09), (-0.04, -0.09), (-0.05, 0.0)]
car.append(flat_poly('flame_o', [(x * 1.2 + 0.05, y * 1.2) for x, y in flame_out], zc + H / 2 + 0.012, 0.008, m_fo))
car.append(flat_poly('flame_y', [(x * 1.2 + 0.05, y * 1.2 - 0.02) for x, y in flame_in], zc + H / 2 + 0.02, 0.008, m_fy))
# drawer pulled out the back, loaded with matches
tray_len = L * 0.95
tray_x = 0.05 - 0.38
car.append(cube('tray', (tray_len, D * 0.9, H * 0.86), (tray_x, 0, zc - 0.02), m_tray, bevel=0.012))
cargo_wood = mat('cargo_wood', WOOD, 0.75)
for i, y in enumerate([-0.28, -0.14, 0.0, 0.14, 0.28]):
    jitter = (i % 2) * 0.03
    parts = build_match(cargo_wood, m_head, None, length=0.95, thick=0.07,
                        loc=(tray_x + 0.05 + jitter, y, zc + H * 0.43 + 0.03 + (i % 2) * 0.02), prefix='cargo%d' % i)
    car.extend(parts)
# headlights on the +X end
for sgn in (-1, 1):
    car.append(cylinder('lamp_%d' % sgn, 0.06, 0.02, (0.05 + L / 2 + 0.008, sgn * 0.28, zc + 0.05), m_light, verts=12, rot=(0, math.pi / 2, 0)))
shade_flat(car)
export_glb(car, os.path.join(OUT, 'car.glb'))
meta['car'] = {'body_size': [L, H, D], 'wheel_r': 0.2, 'wheels_x': [-0.45, 0.52], 'wheel_y': -0.30, 'wheel_z': 0.40}

# ---------------------------------------------------------------- 3. wheel (sewing-button wheel, axis along depth)
clear_scene()
m_tire = mat('tire', TIRE, 0.9)
m_button = mat('button', BUTTON, 0.45)
m_hole = mat('hole', (0.25, 0.14, 0.06), 0.8)
wheel = []
bpy.ops.mesh.primitive_torus_add(major_radius=0.155, minor_radius=0.05, major_segments=20, minor_segments=8,
                                 location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
t = bpy.context.active_object
t.name = 'tire'
assign(t, m_tire)
wheel.append(t)
wheel.append(cylinder('hub', 0.13, 0.08, (0, 0, 0), m_button, verts=18))
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4
    wheel.append(cylinder('hole%d' % k, 0.022, 0.085, (math.cos(a) * 0.05, 0, math.sin(a) * 0.05), m_hole, verts=8))
shade_flat(wheel)
export_glb(wheel, os.path.join(OUT, 'wheel.glb'))

with open(os.path.join(OUT, 'meta.json'), 'w') as f:
    json.dump(meta, f, indent=1)

# ---------------------------------------------------------------- 4. cover render (Cycles)
clear_scene()
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    try:
        prefs.refresh_devices()
    except Exception:
        prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed, using CPU:', e)
sc.cycles.samples = 96
try:
    sc.cycles.use_denoising = True
except Exception:
    pass
sc.render.resolution_x = 1260
sc.render.resolution_y = 1000
sc.render.resolution_percentage = 100
sc.render.film_transparent = False
sc.render.image_settings.file_format = 'PNG'
try:
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
except Exception:
    pass

world = bpy.data.worlds.new('sky')
sc.world = world
try:
    world.use_nodes = True
except Exception:
    pass
if world.node_tree is not None:
    bg = world.node_tree.nodes.get('Background')
    if bg is not None:
        bg.inputs['Color'].default_value = (0.55, 0.78, 0.95, 1)
        bg.inputs['Strength'].default_value = 0.9

g_wood = wood_mat('cover_wood')
g_head = mat('cover_head', HEAD, 0.5)
g_tip = mat('cover_tip', HEAD_TIP, 0.5)
g_grass = mat('grass', (0.36, 0.66, 0.24), 0.9)
g_rock = mat('rock', (0.62, 0.47, 0.32), 0.95)
g_rock2 = mat('rock2', (0.50, 0.36, 0.24), 0.95)
g_water = mat('water', (0.16, 0.45, 0.70), 0.15)
g_far = mat('far', (0.55, 0.70, 0.78), 1.0)
g_ember = mat('ember', (1.0, 0.35, 0.05), 0.5, emit=(1.0, 0.45, 0.08), emit_strength=12.0)

S = 2.0           # match length (one bridge panel)
TH = 0.12
half = 3.0        # bridge spans -3..3
# cliffs: extruded jagged profiles (profile in XZ, extruded along Y)
def cliff(name, prof, m, y0=-3.0, y1=3.0):
    me = bpy.data.meshes.new(name)
    n = len(prof)
    verts = [(x, y0, z) for x, z in prof] + [(x, y1, z) for x, z in prof]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    assign(o, m)
    return o

left = cliff('cliffL', [(-14, -7), (-3.0, -7), (-3.3, -4.5), (-2.9, -2.6), (-3.25, -1.2), (-3.0, -0.25), (-3.0, 0), (-14, 0)], g_rock)
right = cliff('cliffR', [(3.0, 0), (3.0, -0.3), (3.3, -1.5), (2.95, -3.0), (3.35, -5.0), (3.0, -7), (14, -7), (14, 0)], g_rock)
for nm, x0, x1 in (('grassL', -14, -3.0), ('grassR', 3.0, 14)):
    o = cube(nm, (x1 - x0, 6.0, 0.25), ((x0 + x1) / 2, 0, -0.125 + 0.01), g_grass)
cube('strataL', (1.2, 6.02, 0.5), (-3.55, 0, -2.0), g_rock2)
cube('strataR', (1.2, 6.02, 0.5), (3.6, 0, -3.4), g_rock2)
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -5.2))
w = bpy.context.active_object
assign(w, g_water)
# far low-poly hills
for i, (x, z, s) in enumerate([(-9, -1, 7), (-1, -2, 9), (8, -1.5, 8), (15, -1, 6)]):
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=s, depth=s * 0.9, location=(x, 26 + i * 3, z + s * 0.3))
    assign(bpy.context.active_object, g_far)

def place_match(p1, p2, y, scale_thick=TH, m_body=g_wood):
    p1 = Vector(p1); p2 = Vector(p2)
    mid = (p1 + p2) / 2
    d = p2 - p1
    ln = d.length
    ang = math.atan2(d.y, d.x)
    return build_match(m_body, g_head, g_tip, length=ln, thick=scale_thick, loc=(mid.x, y, mid.y), rot_y=-ang, prefix='m')

h = S * math.sqrt(3) / 2
deck = [(-3, 0), (-1, 0), (1, 0), (3, 0)]
tops = [(-2, h), (0, h), (2, h)]
for y in (-0.55, 0.55):
    for a, b in zip(deck[:-1], deck[1:]):
        place_match(a, b, y)
    for i, tp in enumerate(tops):
        place_match(deck[i], tp, y)
        place_match(tp, deck[i + 1], y)
    for a, b in zip(tops[:-1], tops[1:]):
        place_match(a, b, y)
# road: matches laid crosswise
x = -2.95
while x <= 2.95:
    parts = build_match(g_wood, g_head, g_tip, length=1.2, thick=0.1, loc=(x, 0, 0.02), rot_z=math.pi / 2 * (1 if int(x * 10) % 2 else -1), prefix='road')
    x += 0.115
# a few loose / burning matches tumbling into the gorge
for (px, pz, a) in [(-1.6, -2.4, 0.7), (1.2, -3.6, -1.1), (0.2, -1.6, 2.2)]:
    parts = place_match((px - math.cos(a), pz - math.sin(a)), (px + math.cos(a), pz + math.sin(a)), 0.3)
ember_spots = [(-1.6 - math.cos(0.7) - 0.1, -2.4 - math.sin(0.7)), (0.2 - math.cos(2.2) - 0.1, -1.6 - math.sin(2.2))]
for ex, ez in ember_spots:
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.09, depth=0.35, location=(ex, 0.3, ez + 0.2))
    assign(bpy.context.active_object, g_ember)

# import the car we exported and park it on the bridge
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, 'car.glb'))
car_objs = list(bpy.context.selected_objects)
bpy.ops.object.empty_add(location=(0, 0, 0))
car_root = bpy.context.active_object
for o in car_objs:
    if o.parent is None:
        o.parent = car_root
car_root.location = (-0.6, 0, 0.62)
car_root.rotation_euler = (0, 0.02, 0)
for wx in (-0.45, 0.52):
    for wy in (-0.40, 0.40):
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, 'wheel.glb'))
        for o in bpy.context.selected_objects:
            if o.parent is None:
                o.location = (car_root.location.x + wx, wy, car_root.location.z - 0.30)

# lights
sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.energy = 3.2
sun_d.angle = math.radians(6)
sun_d.color = (1.0, 0.93, 0.82)
sun = bpy.data.objects.new('sun', sun_d)
sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), math.radians(-12), math.radians(-35))

cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 32
cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam)
cam.location = (3.6, -10.5, 3.3)
target = bpy.data.objects.new('target', None)
sc.collection.objects.link(target)
target.location = (-0.2, 0, -0.4)
tc = cam.constraints.new('TRACK_TO')
tc.target = target
tc.track_axis = 'TRACK_NEGATIVE_Z'
tc.up_axis = 'UP_Y'
cam.rotation_euler[1] = 0
sc.camera = cam

sc.render.filepath = os.path.join(OUT, 'cover_1260x1000.png')
bpy.ops.render.render(write_still=True)
print('RENDERED', sc.render.filepath)
print('DONE')
