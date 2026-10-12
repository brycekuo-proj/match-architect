// 火柴建築師 Match Architect — Three.js 2.5D renderer. Physics lives on the z=0 plane; when the quake starts the
// build "opens up" into a 3D tower: a front and back frame tied together by crosswise matches.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, levelTerrain } from './sim.js';
import { MATCH_GLB } from './assets.js';

const b64buf = b64 => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
const seeded = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const DEPTH = 0.9;            // half-depth of the 3D tower during the quake (m)
const MAXI = 900;             // instance capacity

function bake(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    const pos = g.getAttribute('position');
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', pos);
    ng.setAttribute('normal', g.getAttribute('normal'));
    const c = o.material.color, arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(ng);
  });
  return mergeGeometries(parts);
}

export async function loadModels() {
  const loader = new GLTFLoader();
  const m = await new Promise((res, rej) => loader.parse(b64buf(MATCH_GLB), '', res, rej));
  return { matchGeo: bake(m.scene) };
}

const COL = {
  grass: [new THREE.Color('#7cc552'), new THREE.Color('#6ab446'), new THREE.Color('#86cd5a')],
  sand: [new THREE.Color('#ecd08f'), new THREE.Color('#e4c47f'), new THREE.Color('#f1d99d')],
  rock: [new THREE.Color('#d8b183'), new THREE.Color('#c79b6c'), new THREE.Color('#b8875a'), new THREE.Color('#cfa678')],
  glue: new THREE.Color('#fff3d6'),
  white: new THREE.Color('#ffffff'),
  burnt: new THREE.Color('#4d413b'),
};
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const ZAXIS = new THREE.Vector3(0, 0, 1), YAXIS = new THREE.Vector3(0, 1, 0);

export class View {
  constructor(canvas, models) {
    this.canvas = canvas; this.models = models;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const sc = this.scene = new THREE.Scene();
    sc.background = this._skyTexture();
    sc.fog = new THREE.Fog(0xf3dcc0, 60, 170);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
    sc.add(new THREE.HemisphereLight(0xdff1ff, 0xa07a50, 1.25));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sc.add(sun, sun.target);
    this.flameLight = new THREE.PointLight(0xff8a2a, 0, 7, 1.6);
    sc.add(this.flameLight);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.far = new THREE.Group(); sc.add(this.far);
    this.terrainG = new THREE.Group(); sc.add(this.terrainG);
    this.structG = new THREE.Group(); sc.add(this.structG);
    this.fxG = new THREE.Group(); sc.add(this.fxG);
    this._buildFar();
    this._shared();
    // instanced matches and glue blobs
    this.matchMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75 });
    this.matches = new THREE.InstancedMesh(models.matchGeo, this.matchMat, MAXI);
    this.matches.castShadow = true; this.matches.receiveShadow = true;
    this.matches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matches.setColorAt(0, COL.white);
    this.matches.count = 0; this.matches.frustumCulled = false;
    this.globs = new THREE.InstancedMesh(this.S.glueGeo, this.S.glueMat, MAXI);
    this.globs.castShadow = true; this.globs.count = 0; this.globs.frustumCulled = false;
    this.structG.add(this.matches, this.globs);
    this.cam = { target: new THREE.Vector3(), dist: 20, yaw: 0, pitch: 0.1 };
    this.camGoal = { target: new THREE.Vector3(), dist: 20, yaw: 0, pitch: 0.1 };
    this.zoom = 1; this.pan = new THREE.Vector2();
    this.zoomMin = 0.2; this.zoomMax = 1.4;   // 5x closer … a little wider than the fitted view
    this.pad = { top: 70, bottom: 130 };
    this.particles = []; this.flames = []; this.markers = []; this.starMeshes = []; this.anchorPins = [];
    this.depth = 0; this.depthGoal = 0;
    this.shake = 0; this.time = 0; this.born = new Map();
    this.reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  _skyTexture() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5fb6ea'); gr.addColorStop(0.55, '#a9daf2'); gr.addColorStop(0.85, '#f6e2c4'); gr.addColorStop(1, '#f9d7b0');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  _shared() {
    const S = this.S = {};
    S.glueGeo = new THREE.IcosahedronGeometry(0.08, 0);
    S.glueMat = new THREE.MeshStandardMaterial({ color: COL.glue, flatShading: true, roughness: 0.5 });
    S.anchorMat = new THREE.MeshStandardMaterial({ color: '#e5432f', flatShading: true, roughness: 0.4 });
    S.anchorRing = new THREE.MeshStandardMaterial({ color: '#fff4e0', flatShading: true, roughness: 0.5 });
    S.ringGeo = new THREE.RingGeometry(0.16, 0.22, 20);
    S.markerMat = new THREE.MeshBasicMaterial({ color: '#fff7c2', transparent: true, opacity: 0.8, depthTest: false });
    S.ghostMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.6, emissive: new THREE.Color('#1e6b2e'), emissiveIntensity: 0.6 });
    S.sparkGeo = new THREE.TetrahedronGeometry(0.06, 0);
    S.dustGeo = new THREE.IcosahedronGeometry(0.18, 0);
    S.flameGeo = new THREE.ConeGeometry(0.1, 0.38, 6);
    S.flameGeo.translate(0, 0.17, 0);
    S.confGeo = new THREE.PlaneGeometry(0.12, 0.07);
  }

  _buildFar() {
    const R = seeded(77);
    const cols = ['#9fc3c9', '#b4cdc8', '#8fb7bf', '#c2d6cb'];
    for (let i = 0; i < 18; i++) {
      const r = 9 + R() * 16, h = r * (0.8 + R() * 0.7);
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5 + Math.floor(R() * 3)),
        new THREE.MeshStandardMaterial({ color: cols[i % 4], flatShading: true, roughness: 1 }));
      m.position.set(-80 + i * 11 + R() * 6, h / 2 - 6, -85 - R() * 45);
      m.rotation.y = R() * 3;
      this.far.add(m);
      if (h > 18) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 5), new THREE.MeshStandardMaterial({ color: '#fbfbf5', flatShading: true }));
        cap.position.set(m.position.x, h - 6 - h * 0.14 + 0.2, m.position.z);
        cap.rotation.y = m.rotation.y; this.far.add(cap);
      }
    }
    this.clouds = [];
    const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#fff8ee', emissiveIntensity: 0.25 });
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + R() * 1.4, 0), cm);
        b.position.set(k * 1.6 - 2.4, R() * 0.6, R() * 0.8); b.scale.y = 0.65; g.add(b);
      }
      g.position.set(-70 + i * 20 + R() * 8, 18 + R() * 12, -60 - R() * 20);
      this.far.add(g); this.clouds.push(g);
    }
  }

  // ------------------------------------------------------------- level
  setLevel(level) {
    this.level = level;
    for (const g of [this.terrainG, this.fxG]) { while (g.children.length) g.remove(g.children[0]); }
    for (const m of [...this.markers, ...this.starMeshes]) this.structG.remove(m);
    if (this.ghost) { this.structG.remove(this.ghost); this.ghost = null; }
    this.markers = []; this.starMeshes = []; this.particles = []; this.flames = []; this.anchorPins = [];
    this.matches.count = 0; this.globs.count = 0; this.born.clear();
    this.terrainG.position.set(0, 0, 0);
    this.depth = this.depthGoal = 0;
    const R = seeded(level.id * 97 + 3);
    const sand = level.biome === 'sand';
    for (const poly of levelTerrain(level)) this.terrainG.add(this._terrainMesh(poly, R, sand));
    // landmark silhouette as a building guide
    this._silhouette(level);
    // scenery behind the plot
    const ax = level.anchors.map(a => a[0] * L), xmin = Math.min(...ax), xmax = Math.max(...ax);
    for (let i = 0; i < 26; i++) {
      const side = R() < 0.5 ? -1 : 1;
      const x = side < 0 ? xmin - 3 - R() * 22 : xmax + 3 + R() * 22, z = -6 - R() * 26;
      this.terrainG.add(sand ? this._palm(x, 0, z, R) : this._tree(x, 0, z, R));
    }
    for (let i = 0; i < 10; i++) this.terrainG.add(sand ? this._palm(xmin - 4 + R() * (xmax - xmin + 8), 0, -16 - R() * 18, R) : this._tree(xmin - 4 + R() * (xmax - xmin + 8), 0, -16 - R() * 18, R));
    // anchors
    for (const [x, y] of level.anchors.map(([x, y]) => [x * L, y * L])) {
      const a = new THREE.Group();
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 10), this.S.anchorMat);
      pin.rotation.x = Math.PI / 2; a.add(pin);
      const rings = [];
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), this.S.anchorRing);
        ring.rotation.x = Math.PI / 2; ring.userData.s = s; a.add(ring); rings.push(ring);
      }
      a.position.set(x, y, 0);
      a.traverse(o => { if (o.isMesh) o.castShadow = true; });
      a.userData = { pin, rings };
      this.terrainG.add(a); this.anchorPins.push(a);
    }
    this._updateAnchors();
    // stars
    for (const [sx, sy] of level.stars) {
      const s = this._starMesh();
      s.position.set(sx * L, sy * L, 0); s.userData.home = new THREE.Vector3(sx * L, sy * L, 0);
      this.structG.add(s); this.starMeshes.push(s);
    }
    this._frameLevel(true);
    const [vx0, vx1, vy0, vy1] = level.view.map(v => v * L);
    const cx = (vx0 + vx1) / 2, cy = (vy0 + vy1) / 2, half = Math.max(vx1 - vx0, vy1 - vy0) * 0.75 + 4;
    this.sun.position.set(cx - 10, cy + 20, 16);
    this.sun.target.position.set(cx, cy, 0);
    const sh = this.sun.shadow.camera;
    sh.left = -half; sh.right = half; sh.top = half; sh.bottom = -half; sh.near = 1; sh.far = 90;
    sh.updateProjectionMatrix();
  }

  _updateAnchors() {
    const dz = this.depth + 0.22;
    for (const a of this.anchorPins) {
      a.userData.pin.scale.y = dz * 2 + 0.1;
      for (const r of a.userData.rings) r.position.z = r.userData.s * dz;
    }
  }

  _silhouette(level) {
    const ax = level.anchors.map(a => a[0]);
    const x0 = (Math.min(...ax) - 0.15) * L, x1 = (Math.max(...ax) + 0.15) * L;
    const top = (Math.max(...level.stars.map(s => s[1])) + 0.25) * L;
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false });
    const add = pts => {
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      m.position.z = -DEPTH - 1.2; this.terrainG.add(m);
    };
    if (level.sil) add(level.sil.map(([nx, ny]) => [x0 + nx * (x1 - x0), ny * top]));
    if (level.circles) for (const [cx, cy, r] of level.circles) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r * L, 28), mat);
      m.position.set(cx * L, cy * L, -DEPTH - 1.15); this.terrainG.add(m);
    }
    if (level.spires) {
      add([[x0, 0], [x1, 0], [x1 - 0.4, 0.42 * top], [x0 + 0.4, 0.42 * top]]);
      for (const [sx, sy] of level.stars) {
        const X = sx * L, Y = (sy + 0.25) * L, w = 0.32 * L;
        add([[X - w, 0.3 * top], [X + w, 0.3 * top], [X + w * 0.7, Y * 0.8], [X + 0.12, Y - 0.2], [X, Y], [X - 0.12, Y - 0.2], [X - w * 0.7, Y * 0.8]]);
      }
    }
  }

  _terrainMesh(poly, R, sand) {
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    let g = new THREE.ExtrudeGeometry(shape, { depth: 140, bevelEnabled: false });
    g.translate(0, 0, -130);
    if (g.index) g = g.toNonIndexed();
    g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
    const top = sand ? COL.sand : COL.grass;
    for (let i = 0; i < pos.count; i += 3) {
      const ny = nor.getY(i), y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      let c;
      if (ny > 0.6) c = top[Math.floor(R() * 3)];
      else { const band = Math.floor((-y + 0.15) / 0.9); c = COL.rock[((band % 4) + 4) % 4].clone().multiplyScalar(0.92 + R() * 0.12); if (y > -0.22) c = top[1].clone().multiplyScalar(0.85); }
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    m.receiveShadow = true;
    return m;
  }

  _tree(x, y, z, R) {
    const g = new THREE.Group();
    const h = 1.4 + R() * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, h * 0.4, 5), new THREE.MeshStandardMaterial({ color: '#8a5a36', flatShading: true }));
    trunk.position.y = h * 0.2; g.add(trunk);
    const greens = ['#3f9a4a', '#4fae52', '#2f8a44', '#62b85a'];
    const crown = new THREE.Mesh(R() > 0.4 ? new THREE.ConeGeometry(h * 0.35, h * 0.9, 6) : new THREE.IcosahedronGeometry(h * 0.38, 0),
      new THREE.MeshStandardMaterial({ color: greens[Math.floor(R() * 4)], flatShading: true, roughness: 0.9 }));
    crown.position.y = h * 0.8; g.add(crown);
    g.position.set(x, y, z); g.rotation.y = R() * 6;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  _palm(x, y, z, R) {
    const g = new THREE.Group();
    const h = 2.2 + R() * 1.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, h, 5), new THREE.MeshStandardMaterial({ color: '#a77b4f', flatShading: true }));
    trunk.position.y = h / 2; trunk.rotation.z = (R() - 0.5) * 0.25; g.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: R() > 0.5 ? '#4f9e45' : '#5cad4c', flatShading: true, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 3), leafMat);
      leaf.position.set(0, h, 0); leaf.rotation.set(0, k * Math.PI / 3, 1.9); leaf.translateY(0.55);
      g.add(leaf);
    }
    g.position.set(x, y, z);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _starMesh() {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.14 : 0.32, a = Math.PI / 2 + i * Math.PI / 5; const p = [Math.cos(a) * r, Math.sin(a) * r]; i ? s.lineTo(...p) : s.moveTo(...p); }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 });
    g.translate(0, 0, -0.04);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#ffcf2e', emissive: '#a86b00', emissiveIntensity: 0.6, flatShading: true, metalness: 0.3, roughness: 0.35 }));
    m.castShadow = true;
    const grp = new THREE.Group(); grp.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._glowTex(), color: '#ffd76a', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.4, 1.4, 1); grp.add(glow);
    grp.userData.spin = m;
    return grp;
  }
  _glowTex() {
    if (this._gt) return this._gt;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (this._gt = new THREE.CanvasTexture(c));
  }

  // ------------------------------------------------------------- matches (instanced)
  // items: [{id, x1,y1,x2,y2, color}] ; nodes: [{x,y}] for glue blobs and crosswise ties
  _writeInstances(items, nodes) {
    let i = 0;
    const d = this.depth, zs = d > 0.01 ? [-d, d] : [0];
    for (const it of items) {
      const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
      tmpQ.setFromAxisAngle(ZAXIS, Math.atan2(it.y2 - it.y1, it.x2 - it.x1));
      const b = this.born.get(it.id), age = b === undefined ? 9 : this.time - b;
      const pop = age < 0.25 ? 1 + Math.sin(age / 0.25 * Math.PI) * 0.14 : 1;
      for (const z of zs) {
        if (i >= MAXI) break;
        tmpP.set((it.x1 + it.x2) / 2, (it.y1 + it.y2) / 2, z);
        tmpS.set(len, L * pop, L * pop);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.matches.setMatrixAt(i, tmpM);
        this.matches.setColorAt(i, it.color || COL.white);
        i++;
      }
    }
    // crosswise ties (only once the tower has opened up)
    if (d > 0.05) {
      tmpQ.setFromAxisAngle(YAXIS, Math.PI / 2);
      let k = 0;
      for (const n of nodes) {
        if (i >= MAXI) break;
        tmpP.set(n.x, n.y, 0); tmpS.set(2 * d, L * 0.85, L * 0.85);
        tmpQ.setFromAxisAngle(YAXIS, (k++ % 2) ? Math.PI / 2 : -Math.PI / 2);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.matches.setMatrixAt(i, tmpM); this.matches.setColorAt(i, COL.white); i++;
      }
    }
    this.matches.count = i;
    this.matches.instanceMatrix.needsUpdate = true;
    if (this.matches.instanceColor) this.matches.instanceColor.needsUpdate = true;
    let j = 0;
    tmpQ.identity(); tmpS.set(1, 1, 1);
    for (const n of nodes) for (const z of zs) {
      if (j >= MAXI) break;
      tmpP.set(n.x, n.y, z); tmpM.compose(tmpP, tmpQ, tmpS); this.globs.setMatrixAt(j++, tmpM);
    }
    this.globs.count = j; this.globs.instanceMatrix.needsUpdate = true;
  }

  syncDesign(design, fresh) {
    this.design = design;
    if (fresh !== undefined) this.born.set(fresh, this.time);
    this._buildItems = () => {
      const items = design.sticks.map(s => { const [x1, y1, x2, y2] = design.ends(s); return { id: s.id, x1, y1, x2, y2 }; });
      const nodes = design.nodes.filter(n => n.kind !== 'anchor' && design.degree(n.id) + (n.kind === 'glue' ? 1 : 0) >= 2);
      return { items, nodes };
    };
    const { items, nodes } = this._buildItems();
    this._writeInstances(items, nodes);
    this._markers(design);
  }
  _markers(design) {
    for (const m of this.markers) this.structG.remove(m);
    this.markers = [];
    if (!this.buildMode) return;
    for (const n of design.nodes) {
      const m = new THREE.Mesh(this.S.ringGeo, this.S.markerMat);
      m.position.set(n.x, n.y, 0.3); m.renderOrder = 5;
      this.structG.add(m); this.markers.push(m);
    }
  }

  setGhost(pv) {
    if (this.ghost) { this.structG.remove(this.ghost); this.ghost = null; }
    if (!pv) return;
    const len = Math.hypot(pv.x2 - pv.x1, pv.y2 - pv.y1);
    const g = new THREE.Group();
    const mat = this.S.ghostMat;
    mat.emissive.set(pv.ok ? '#1f7a36' : '#9a1a10');
    mat.color.set(pv.ok ? '#d9ffe0' : '#ffb3a8');
    const m = new THREE.Mesh(this.models.matchGeo, mat);
    m.scale.set(len, L, L); g.add(m);
    g.position.set((pv.x1 + pv.x2) / 2, (pv.y1 + pv.y2) / 2, 0);
    g.rotation.z = Math.atan2(pv.y2 - pv.y1, pv.x2 - pv.x1);
    const ring = new THREE.Mesh(this.S.ringGeo, new THREE.MeshBasicMaterial({ color: pv.ok ? (pv.end.kind === 'free' ? '#ffffff' : '#52ff7a') : '#ff5040', transparent: true, opacity: 0.95, depthTest: false }));
    ring.position.set(len / 2, 0, 0.35); ring.renderOrder = 6;
    const sc = pv.end.kind === 'free' ? 0.7 : 1.25; ring.scale.set(sc, sc, sc);
    g.add(ring);
    this.ghost = g; this.structG.add(g);
  }

  // ------------------------------------------------------------- simulation sync
  enterSim(sim) {
    this.sim = sim; this.buildMode = false;
    this._markers(sim.design);
    this.setGhost(null);
    this.nodeRefs = [];
    const design = sim.design;
    for (const n of design.nodes) {
      if (n.kind === 'anchor' || design.degree(n.id) + (n.kind === 'glue' ? 1 : 0) < 2) continue;
      let sid = n.kind === 'glue' ? n.host : null;
      if (sid === null || !sim.bodies.has(sid)) { const s = design.sticks.find(s => s.a === n.id || s.b === n.id); sid = s && s.id; }
      const b = sim.bodies.get(sid);
      if (b) this.nodeRefs.push({ body: b, local: b.getLocalPoint({ x: n.x, y: n.y }) });
    }
    this.depthGoal = DEPTH;
    this.camGoal.yaw = 0.42; this.camGoal.pitch = 0.2;
    this.burnt = new Set();
  }
  exitSim(design) {
    this.sim = null; this.buildMode = true;
    this.terrainG.position.set(0, 0, 0);
    for (const p of this.particles) this.fxG.remove(p.m);
    for (const f of this.flames) this.fxG.remove(f.m);
    this.particles = []; this.flames = []; this.flameLight.intensity = 0;
    this.depthGoal = 0; this.depth = 0; this._updateAnchors();
    for (const s of this.starMeshes) s.position.copy(s.userData.home);
    this.syncDesign(design);
    this.camGoal.yaw = -0.06; this.camGoal.pitch = 0.1;
    this._applyGoal();
  }

  syncSim(sim) {
    const go = sim.ground.getPosition();
    this.terrainG.position.set(go.x, go.y, 0);
    for (const J of sim.joints) if (J.broken) for (const sid of J.sticks) this.burnt.add(sid);
    const items = [];
    for (const [id, b] of sim.bodies) {
      const p = b.getPosition(), a = b.getAngle();
      const s = sim.design.stick(id);
      const [x1, y1, x2, y2] = sim.design.ends(s), hl = Math.hypot(x2 - x1, y2 - y1) / 2;
      const c = Math.cos(a) * hl, sn = Math.sin(a) * hl;
      let color;
      if (this.burnt.has(id)) color = COL.burnt;
      else {
        const k = Math.min(1, sim.stress.get(id) || 0);
        color = tmpC.setRGB(1, 1 - 0.6 * k, 1 - 0.8 * k).clone();
      }
      items.push({ id, x1: p.x - c, y1: p.y - sn, x2: p.x + c, y2: p.y + sn, color });
    }
    const nodes = this.nodeRefs.map(r => r.body.getWorldPoint(r.local));
    this._writeInstances(items, nodes);
    sim.stars.forEach((st, i) => {
      const m = this.starMeshes[i]; if (!m) return;
      const p = st.body.getWorldPoint(st.local); m.position.set(p.x, p.y, 0);
    });
  }

  // ------------------------------------------------------------- effects
  fxBreak(x, y) {
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.S.sparkGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffb238' : '#fff1a8', transparent: true }));
      m.position.set(x, y, (Math.random() - 0.5) * (this.depth * 2 + 0.2));
      this.fxG.add(m);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
      this.particles.push({ m, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, vz: (Math.random() - 0.5) * 2, life: 0.6 + Math.random() * 0.5, age: 0, g: 9, kind: 'spark' });
    }
    for (const z of [-this.depth, this.depth]) {
      const m = new THREE.Mesh(this.S.flameGeo, new THREE.MeshBasicMaterial({ color: '#ff8a1e', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(x, y, z); this.fxG.add(m);
      const core = new THREE.Mesh(this.S.flameGeo, new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.scale.setScalar(0.5); m.add(core);
      this.flames.push({ m, age: 0, life: 1.8 });
    }
    this.flameLight.position.set(x, y + 0.3, this.depth + 0.8); this.flameLight.intensity = 6;
    this.kick(0.25);
  }
  fxDust(x, y) {
    const m = new THREE.Mesh(this.S.dustGeo, new THREE.MeshStandardMaterial({ color: this.level.biome === 'sand' ? '#ead2a0' : '#d9c4a4', flatShading: true, transparent: true, opacity: 0.7, roughness: 1 }));
    m.position.set(x, y + 0.1, (Math.random() - 0.3) * 3);
    m.scale.setScalar(0.4 + Math.random() * 0.5);
    this.fxG.add(m);
    this.particles.push({ m, vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.6, vz: 0.2, life: 1.2 + Math.random(), age: 0, g: -0.2, kind: 'dust', grow: 0.9 });
  }
  fxConfetti() {
    const cols = ['#e5432f', '#ffcf2e', '#2fb3a5', '#ffffff', '#ff8a1e'];
    const [x0, x1, , y1] = this.level.view.map(v => v * L);
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(this.S.confGeo, new THREE.MeshBasicMaterial({ color: cols[i % 5], side: THREE.DoubleSide }));
      m.position.set(x0 + Math.random() * (x1 - x0), y1 + Math.random() * 3, (Math.random() - 0.5) * 3);
      this.fxG.add(m);
      this.particles.push({ m, vx: (Math.random() - 0.5), vy: -1 - Math.random(), vz: 0, life: 4 + Math.random() * 2, age: 0, g: 0.4, kind: 'conf', spin: Math.random() * 8 });
    }
  }
  kick(a) { if (!this.reduceMotion) this.shake = Math.max(this.shake, a); }

  // ------------------------------------------------------------- camera
  _frameLevel(snap) {
    if (!this.level) return;
    const [x0, x1, y0, y1] = this.level.view.map(v => v * L);
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1;
    const fov = this.camera.fov * Math.PI / 180, tn = Math.tan(fov / 2), aspect = W / H;
    const usable = Math.max(0.3, (H - this.pad.top - this.pad.bottom) / H);
    const dH = ((y1 - y0) / 2) / tn / usable, dW = ((x1 - x0) / 2) / (tn * aspect);
    const dist = Math.max(dH, dW) * 1.04 + 1.5;
    const wpp = 2 * dist * tn / H;
    const shiftY = (this.pad.bottom - this.pad.top) / 2 * wpp;
    this.fit = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - shiftY, dist };
    this._applyGoal();
    if (snap) { this.cam.target.copy(this.camGoal.target); this.cam.dist = this.camGoal.dist; this.cam.yaw = this.camGoal.yaw; this.cam.pitch = this.camGoal.pitch; }
  }
  _applyGoal() {
    if (!this.fit) return;
    this.camGoal.target.set(this.fit.cx + this.pan.x, this.fit.cy + this.pan.y, 0);
    this.camGoal.dist = this.fit.dist * this.zoom * (this.sim ? 1.05 : 1);
  }
  resetView() { this.zoom = 1; this.pan.set(0, 0); this._applyGoal(); }
  // zoom < 1 = closer. (wx, wy) is the world point that stays put under the fingers / cursor.
  zoomBy(f, wx, wy, smooth = false) {
    if (!this.fit) return;
    const z0 = this.zoom;
    this.zoom = Math.max(this.zoomMin, Math.min(this.zoomMax, this.zoom * f));
    const k = 1 - this.zoom / z0;
    const tx = this.fit.cx + this.pan.x, ty = this.fit.cy + this.pan.y;
    this.pan.x += (wx - tx) * k; this.pan.y += (wy - ty) * k;
    this._clampPan(); this._applyGoal();
    if (!smooth) { this.cam.dist = this.camGoal.dist; this.cam.target.copy(this.camGoal.target); }
  }
  // +/- buttons and keys: zoom about the middle of the free area between the HUD and the toolbar, animated
  zoomStep(f) {
    if (!this.fit || !this.level) return;
    const [, , y0, y1] = this.level.view.map(v => v * L);
    const sy = ((y0 + y1) / 2 - this.fit.cy) * this.zoom;
    this.zoomBy(f, this.fit.cx + this.pan.x, this.fit.cy + this.pan.y + sy, true);
  }
  get zoomed() { return Math.abs(this.zoom - 1) > 0.01 || this.pan.lengthSq() > 1e-4; }
  panBy(dx, dy) { this.pan.x += dx; this.pan.y += dy; this._clampPan(); this._applyGoal(); this.cam.target.copy(this.camGoal.target); }
  _clampPan() {
    const [x0, x1, y0, y1] = this.level.view.map(v => v * L);
    this.pan.x = Math.max(x0 - this.fit.cx, Math.min(x1 - this.fit.cx, this.pan.x));
    this.pan.y = Math.max(y0 - this.fit.cy - 2, Math.min(y1 - this.fit.cy + 2, this.pan.y));
  }

  screenToWorld(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    const t = -o.z / d.z;
    return { x: o.x + d.x * t, y: o.y + d.y * t };
  }
  worldToScreen(x, y) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  worldPerPx() {
    const H = this.canvas.clientHeight || 1;
    return 2 * this.cam.dist * Math.tan(this.camera.fov * Math.PI / 360) / H;
  }

  resize() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this._frameLevel(true);
  }

  // ------------------------------------------------------------- frame
  render(dt, quake = 0) {
    this.time += dt;
    const c = this.cam, g = this.camGoal, k = 1 - Math.exp(-dt * 4);
    c.target.lerp(g.target, k); c.dist += (g.dist - c.dist) * k; c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = (this.reduceMotion ? 0 : quake * 0.12) + this.shake * 0.3;
    const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    const cp = Math.cos(c.pitch);
    this.camera.position.set(c.target.x + Math.sin(c.yaw) * cp * c.dist + ox, c.target.y + Math.sin(c.pitch) * c.dist + oy, Math.cos(c.yaw) * cp * c.dist);
    this.camera.lookAt(c.target.x + ox * 0.5, c.target.y + oy * 0.5, 0);
    // tower opening into 3D
    if (Math.abs(this.depthGoal - this.depth) > 0.001) {
      this.depth += (this.depthGoal - this.depth) * (1 - Math.exp(-dt * 7));
      this._updateAnchors();
      if (!this.sim && this.design) this.syncDesign(this.design);
    }
    for (const cl of this.clouds) { cl.position.x += dt * 0.6; if (cl.position.x > 90) cl.position.x = -90; }
    for (const s of this.starMeshes) { s.userData.spin.rotation.y += dt * 1.6; s.scale.setScalar(1 + Math.sin(this.time * 3) * 0.06); }
    if (this.buildMode) {
      const s = 1 + Math.sin(this.time * 4) * 0.12;
      for (const m of this.markers) m.scale.setScalar(s);
      if (this.design && [...this.born.values()].some(b => this.time - b < 0.3)) this._writeInstances(...Object.values(this._buildItems()));
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) { this.fxG.remove(p.m); this.particles.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.kind === 'spark') { p.m.material.opacity = 1 - u; p.m.rotation.x += dt * 10; }
      else if (p.kind === 'dust') { p.m.material.opacity = 0.7 * (1 - u); p.m.scale.multiplyScalar(1 + dt * p.grow); }
      else if (p.kind === 'conf') { p.m.rotation.x += dt * p.spin; p.m.rotation.y += dt * p.spin * 0.7; p.vx += Math.sin(p.age * 3 + i) * dt; }
    }
    let fl = 0;
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i]; f.age += dt;
      const u = f.age / f.life;
      if (u >= 1) { this.fxG.remove(f.m); this.flames.splice(i, 1); continue; }
      const flick = 0.8 + Math.random() * 0.4, s = (u < 0.15 ? u / 0.15 * 1.6 : 1.6 * (1 - u)) * flick;
      f.m.scale.set(s, s * (1.1 + Math.random() * 0.3), s);
      f.m.material.opacity = 0.9 * (1 - u * 0.7);
      fl = Math.max(fl, 1 - u);
    }
    this.flameLight.intensity = fl * 5 * (0.8 + Math.random() * 0.4);
    this.renderer.render(this.scene, this.camera);
  }
}
