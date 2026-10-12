# MatchQuake cover: the game's Tokyo Tower build (from towers.json) as a 3D matchstick tower, Cycles render.
# Usage: Blender -b --factory-startup -P make_cover.py -- <out_dir>
import bpy, math, sys, os, json, random
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
data = json.load(open(os.path.join(HERE, 'towers.json')))
tower = data['8']
random.seed(7)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene

def mat(name, color, rough=0.7, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    m.diffuse_color = (*color, 1)
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    if emit:
        for k in ('Emission Color', 'Emission'):
            if k in b.inputs: b.inputs[k].default_value = (*emit, 1); break
        b.inputs['Emission Strength'].default_value = strength
    return m

def wood():
    m = bpy.data.materials.new('wood')
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; n = nt.nodes; b = n.get('Principled BSDF')
    tc = n.new('ShaderNodeTexCoord'); mp = n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.6, 14, 14)
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 4; nz.inputs['Detail'].default_value = 6
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.78, 0.57, 0.33, 1); cr.color_ramp.elements[1].color = (0.96, 0.82, 0.58, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac']); nt.links.new(cr.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7
    return m

M_WOOD = wood()
M_HEAD = mat('head', (0.62, 0.05, 0.035), 0.5)
M_TIP = mat('tip', (0.85, 0.2, 0.08), 0.5)
M_GLUE = mat('glue', (1.0, 0.95, 0.84), 0.4)
M_GRASS = mat('grass', (0.36, 0.64, 0.22), 0.95)
M_SOIL = mat('soil', (0.55, 0.38, 0.22), 0.95)
M_DARK = mat('crack', (0.12, 0.08, 0.05), 1.0)
M_FAR = mat('far', (0.58, 0.72, 0.80), 1.0)
M_SNOW = mat('snow', (0.97, 0.97, 0.95), 0.8)
M_STAR = mat('star', (1.0, 0.78, 0.15), 0.3, emit=(1.0, 0.75, 0.2), strength=3.0)
M_FLAME = mat('flame', (1.0, 0.4, 0.05), 0.5, emit=(1.0, 0.5, 0.1), strength=18.0)
M_ANCHOR = mat('anchor', (0.9, 0.22, 0.15), 0.4)

def match(p1, p2, y, thick=0.12, burnt=False):
    p1 = Vector((p1[0], y, p1[1])) if len(p1) == 2 else Vector(p1)
    p2 = Vector((p2[0], y, p2[1])) if len(p2) == 2 else Vector(p2)
    d = p2 - p1; ln = d.length; mid = (p1 + p2) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=mid)
    body = bpy.context.active_object; body.scale = (ln, thick, thick)
    body.data.materials.append(M_WOOD)
    bv = body.modifiers.new('b', 'BEVEL'); bv.width = thick * 0.18; bv.segments = 1
    rot = d.to_track_quat('X', 'Z')
    body.rotation_mode = 'QUATERNION'; body.rotation_quaternion = rot
    head_pos = p1 - d.normalized() * thick * 0.25
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=7, radius=1, location=head_pos)
    h = bpy.context.active_object; h.scale = (thick * 0.95, thick * 0.78, thick * 0.78)
    h.rotation_mode = 'QUATERNION'; h.rotation_quaternion = rot
    h.data.materials.append(M_DARK if burnt else M_HEAD)
    return body, h

def glue(x, y, z):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.085, location=(x, y, z))
    bpy.context.active_object.data.materials.append(M_GLUE)

D = 0.9
for (x1, z1, x2, z2) in tower['sticks']:
    for y in (-D, D):
        match((x1, z1), (x2, z2), y)
k = 0
for (x, z) in tower['nodes']:
    match((x, -D, z), (x, D, z), 0) if k % 2 else match((x, D, z), (x, -D, z), 0)
    k += 1
    for y in (-D, D): glue(x, y, z)
for (x, z) in tower['anchors']:
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.1, depth=2 * D + 0.5, location=(x, 0, z), rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.data.materials.append(M_ANCHOR)
# star on top
sx, sz = tower['stars'][0]
verts = []
for i in range(10):
    r = 0.32 if i % 2 == 0 else 0.14; a = math.pi / 2 + i * math.pi / 5
    verts.append((sx + math.cos(a) * r, 0, sz + math.sin(a) * r))
me = bpy.data.meshes.new('star'); me.from_pydata(verts, [], [list(range(10))]); me.update()
st = bpy.data.objects.new('star', me); sc.collection.objects.link(st)
sd = st.modifiers.new('s', 'SOLIDIFY'); sd.thickness = 0.1; st.data.materials.append(M_STAR)
sl = bpy.data.lights.new('starglow', 'POINT'); sl.energy = 60; sl.color = (1, 0.8, 0.4)
so = bpy.data.objects.new('starglow', sl); sc.collection.objects.link(so); so.location = (sx, -0.6, sz)

# ground: big low-poly field with an earthquake crack running toward the tower
bpy.ops.mesh.primitive_plane_add(size=120, location=(2, 0, 0))
g = bpy.context.active_object
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=40); bpy.ops.object.mode_set(mode='OBJECT')
for v in g.data.vertices:
    dist = math.hypot(v.co.x - 2, v.co.y)
    if dist > 9: v.co.z += (random.random() - 0.3) * 0.25 * min(1, (dist - 9) / 10)
for p in g.data.polygons: p.use_smooth = False
g.data.materials.append(M_GRASS)
crack = [(-9, -7), (-6, -5.2), (-4.2, -5.6), (-2.5, -3.4), (-0.8, -3.0), (0.4, -1.4)]
for (a, b) in zip(crack[:-1], crack[1:]):
    p1 = Vector((a[0], a[1], 0.0)); p2 = Vector((b[0], b[1], 0.0)); d = p2 - p1
    bpy.ops.mesh.primitive_cube_add(size=1, location=(p1 + p2) / 2)
    c = bpy.context.active_object; c.scale = (d.length + 0.15, 0.22, 0.06)
    c.rotation_euler = (0, 0, math.atan2(d.y, d.x)); c.data.materials.append(M_DARK)
# dust puffs and a couple of fallen burning matches near the crack
for i in range(14):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.25 + random.random() * 0.35,
                                          location=(-3 + random.random() * 13, -2.5 + random.random() * 1.8, 0.2 + random.random() * 0.3))
    bpy.context.active_object.data.materials.append(mat('dust%d' % i, (0.86, 0.78, 0.64), 1.0))
for (p1, p2) in [((-1.5, -3.6, 0.07), (0.3, -2.9, 0.07)), ((6.2, -2.2, 0.07), (7.6, -3.4, 0.07))]:
    match(p1, p2, 0, burnt=True)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.12, depth=0.45, location=(p1[0], p1[1], 0.3))
    bpy.context.active_object.data.materials.append(M_FLAME)
# trees and mountains
for i in range(26):
    x = random.choice([-1, 1]) * (6 + random.random() * 16) + 2; y = 3 + random.random() * 16
    h = 1.6 + random.random() * 2
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=h * 0.35, depth=h, location=(x, y, h * 0.75))
    bpy.context.active_object.data.materials.append(mat('tree%d' % i, random.choice([(0.2, 0.5, 0.25), (0.28, 0.6, 0.3), (0.18, 0.45, 0.24)]), 0.9))
    bpy.ops.mesh.primitive_cylinder_add(vertices=5, radius=0.1, depth=h * 0.5, location=(x, y, h * 0.25))
    bpy.context.active_object.data.materials.append(M_SOIL)
for i, (x, s) in enumerate([(-28, 16), (-10, 22), (10, 26), (30, 18), (46, 14)]):
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=s, depth=s * 1.1, location=(x, 70 + i * 4, s * 0.45 - 2))
    bpy.context.active_object.data.materials.append(M_FAR)
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=s * 0.3, depth=s * 0.33, location=(x, 70 + i * 4, s * 0.45 - 2 + s * 0.385))
    bpy.context.active_object.data.materials.append(M_SNOW)

# render setup
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    try: prefs.refresh_devices()
    except Exception: prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e:
    print('GPU setup failed:', e)
sc.cycles.samples = 128
sc.render.resolution_x, sc.render.resolution_y = 1260, 1000
sc.render.image_settings.file_format = 'PNG'
try:
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
world = bpy.data.worlds.new('sky'); sc.world = world
try: world.use_nodes = True
except Exception: pass
wn = world.node_tree.nodes; bg = wn.get('Background')
grad = wn.new('ShaderNodeTexGradient'); tcw = wn.new('ShaderNodeTexCoord'); sep = wn.new('ShaderNodeSeparateXYZ')
ramp = wn.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[0].color = (0.98, 0.82, 0.62, 1)
ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (0.32, 0.62, 0.92, 1)
mapr = wn.new('ShaderNodeMapRange'); mapr.inputs['From Min'].default_value = -0.2; mapr.inputs['From Max'].default_value = 0.6
world.node_tree.links.new(tcw.outputs['Generated'], sep.inputs[0])
world.node_tree.links.new(sep.outputs['Z'], mapr.inputs['Value'])
world.node_tree.links.new(mapr.outputs['Result'], ramp.inputs['Fac'])
world.node_tree.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 3.6; sun_d.angle = math.radians(5); sun_d.color = (1.0, 0.9, 0.78)
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(55), math.radians(10), math.radians(-40))
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 30
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam)
cam.location = (12.5, -17.5, 3.2)
tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = (4.0, 0, 4.3)
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
sc.camera = cam
sc.render.filepath = os.path.join(OUT, 'cover2_1260x1000.png')
bpy.ops.render.render(write_still=True)
print('RENDERED', sc.render.filepath)
