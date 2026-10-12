// 完工模型: the Q-version landmark (made in Blender, see blender/make_landmarks.py) spinning on a little wooden
// turntable after a level is cleared. Own small renderer on its own canvas; only runs while the reveal is open.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LANDMARKS } from './assets.js';

const b64buf = b64 => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
export const hasLandmark = key => !!(LANDMARKS && LANDMARKS[key]);

export class Turntable {
  constructor(canvas) {
    this.canvas = canvas;
    this.cache = new Map();
    this.raf = 0; this.yaw = 0; this.vel = 0; this.auto = 0.7; this.drag = null; this.t = 0;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const sc = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
    sc.add(new THREE.HemisphereLight(0xfff6e6, 0x7a5636, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 5, 4); sc.add(key);
    const rim = new THREE.DirectionalLight(0xffd7a0, 1.2); rim.position.set(4, 3, -3); sc.add(rim);
    // wooden turntable: a matchbox-coloured disc with a darker rim and a soft shadow on top
    this.stage = new THREE.Group(); sc.add(this.stage);
    const wood = new THREE.MeshStandardMaterial({ color: '#e2b47a', roughness: 0.8, flatShading: true });
    const rimM = new THREE.MeshStandardMaterial({ color: '#b3402f', roughness: 0.7, flatShading: true });
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 40), wood); this.disc.position.y = -0.06;
    this.ring = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.1, 0.12, 40), rimM); this.ring.position.y = -0.17;
    const sh = document.createElement('canvas'); sh.width = sh.height = 64;
    const g = sh.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(60,30,10,0.45)'); gr.addColorStop(1, 'rgba(60,30,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.002;
    this.stage.add(this.disc, this.ring, this.shadow);
    this.pivot = new THREE.Group(); this.stage.add(this.pivot);
    // drag to spin, with a little inertia
    canvas.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, t: performance.now() }; this.vel = 0; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, now = performance.now(), dt = Math.max(1, now - this.drag.t) / 1000;
      this.yaw += dx * 0.012; this.vel = dx * 0.012 / dt * 0.5;
      this.drag.x = e.clientX; this.drag.t = now;
    });
    const up = () => { this.drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }

  async _load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(b64buf(LANDMARKS[key]), '', res, rej));
    const root = gltf.scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m.map) m.map.anisotropy = 4;
    });
    // fit: at most 1.7 tall and 2.0 across, standing on the disc, centred on its footprint (so the leaning Pisa stays put)
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const foot = new THREE.Box3(), v = new THREE.Vector3(), yCut = box.min.y + size.y * 0.12;
    root.traverse(o => {
      if (!o.isMesh) return;
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (v.y <= yCut) foot.expandByPoint(v); }
    });
    if (!foot.isEmpty()) { const fc = foot.getCenter(new THREE.Vector3()); c.x = fc.x; c.z = fc.z; }
    const s = Math.min(1.7 / Math.max(size.y, 1e-3), 2.0 / Math.max(size.x, size.z, 1e-3));
    const holder = new THREE.Group(); holder.add(root);
    root.scale.setScalar(s); root.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    const out = { holder, h: size.y * s, r: Math.hypot(size.x, size.z) * s / 2 };
    this.cache.set(key, out);
    return out;
  }

  async show(key) {
    if (!hasLandmark(key)) return false;
    let m;
    try { m = await this._load(key); } catch (e) { console.error(e); return false; }
    this.pivot.clear(); this.pivot.add(m.holder);
    const R = Math.min(1.45, Math.max(0.95, m.r * 1.08 + 0.12));
    this.disc.scale.set(R, 1, R); this.ring.scale.set(R, 1, R);
    this.shadow.scale.set(m.r * 2.4 + 0.3, m.r * 2.4 + 0.3, 1);
    this.h = m.h; this.R = R;
    this.yaw = -0.6; this.vel = 0; this.t = 0;
    this._resize();
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this._frame); }
    return true;
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  _resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // frame the model + turntable from slightly above
    const H = this.h + 0.55, W = this.R * 2.25;
    const fov = this.camera.fov * Math.PI / 180, tn = Math.tan(fov / 2);
    const dist = Math.max(H / 2 / tn, W / 2 / (tn * this.camera.aspect)) * 1.03 + this.R * 0.4;
    const pitch = 0.26, cy = this.h * 0.42 - 0.08;
    this.camera.position.set(0, cy + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    this.camera.lookAt(0, cy - 0.05, 0);
  }

  _frame = now => {
    // the first rAF timestamp can predate the moment show() ran (long model load), so never let time run backwards
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now); this.t += dt;
    if (!this.drag) { this.vel *= Math.exp(-dt * 2.5); this.yaw += (this.auto + this.vel) * dt; }
    this.stage.rotation.y = this.yaw;
    // pop in when it appears
    const u = Math.max(0, Math.min(1, this.t / 0.55)), pop = u < 1 ? 1 - Math.pow(1 - u, 3) * Math.cos(u * 7) : 1;
    this.pivot.scale.setScalar(0.4 + 0.6 * pop);
    if (this.canvas.clientWidth && Math.abs(this.canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2) - this.renderer.domElement.width) > 2) this._resize();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this._frame);
  };
}
