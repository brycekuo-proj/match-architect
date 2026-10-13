// 卡通描邊: thick ink outlines drawn from the depth buffer.
// 1) the solid things are drawn once more into a depth-only target (effects and sprites hidden),
// 2) the scene is drawn as usual,
// 3) a full-screen pass inks the pixels just outside every depth step: silhouettes against the sky and things in
//    front of other things. It looks at 1/z, which changes linearly across any flat surface on screen, so flat
//    ground seen at a low angle stays clean and the line keeps the same width in pixels however far away it is.
import * as THREE from 'three';

const FRAG = `
#include <packing>
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cNear, cFar, thick, lo, hi, farFrom, farTo, farKeep;
uniform vec3 ink;
uniform float opacity;
varying vec2 vUv;
float W(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return d >= 0.99999 ? 0.0 : -1.0 / perspectiveDepthToViewZ(d, cNear, cFar);
}
void main() {
  float w0 = W(vUv), wm = w0, e = 0.0;
  // three rings of samples out to the line width, so a match thinner than the line is still found
  for (int k = 1; k <= 3; k++) {
    vec2 o = texel * thick * float(k) / 3.0;
    for (int i = 0; i < 4; i++) {
      vec2 d = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(0.0, 1.0) : i == 2 ? vec2(0.7071, 0.7071) : vec2(0.7071, -0.7071);
      float a = W(vUv + d * o), b = W(vUv - d * o);
      float m = max(max(a, b), w0);
      wm = max(wm, m);
      // only the farther side of a step gets ink, so the line sits around a thin match instead of covering it
      if (m > 0.0) e = max(e, max(0.0, a + b - 2.0 * w0) / m);
    }
  }
  float edge = smoothstep(lo, hi, e);
  float z = 1.0 / max(wm, 1e-6);
  edge *= mix(1.0, farKeep, smoothstep(farFrom, farTo, z));
  gl_FragColor = vec4(ink, edge * opacity);
}`;
const VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class Outline {
  // opts: thick (CSS px, half the line width), color (ink), lo/hi (how big a depth step counts), far fade
  constructor(renderer, opts = {}) {
    this.r = renderer;
    this.css = opts.thick ?? 1.7;
    this.enabled = true;
    const rt = this.rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
    rt.depthTexture = new THREE.DepthTexture(1, 1);
    rt.depthTexture.type = THREE.UnsignedIntType;
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const ink = new THREE.Color(opts.color ?? '#2a1a12');
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        tDepth: { value: rt.depthTexture }, texel: { value: new THREE.Vector2(1, 1) }, cNear: { value: 0.1 }, cFar: { value: 100 },
        thick: { value: 2 }, lo: { value: opts.lo ?? 0.06 }, hi: { value: opts.hi ?? 0.16 },
        farFrom: { value: opts.farFrom ?? 1e5 }, farTo: { value: opts.farTo ?? 2e5 }, farKeep: { value: opts.farKeep ?? 1 },
        ink: { value: new THREE.Vector3(ink.r, ink.g, ink.b) }, opacity: { value: opts.opacity ?? 0.92 },
      },
    });
    // the ink colour goes straight to the screen, so give it in sRGB
    const c = ink.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace); this.mat.uniforms.ink.value.set(c.r, c.g, c.b);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._v = new THREE.Vector2();
  }
  _size() {
    const s = this.r.getDrawingBufferSize(this._v), pr = this.r.getPixelRatio();
    if (this.rt.width !== s.x || this.rt.height !== s.y) this.rt.setSize(s.x, s.y);
    this.mat.uniforms.texel.value.set(1 / s.x, 1 / s.y);
    this.mat.uniforms.thick.value = this.css * pr;
  }
  // draw `scene` with outlines; `hide` = objects that must not cast a line (effects, sprites, transparent helpers)
  render(scene, camera, hide = []) {
    const r = this.r;
    if (!this.enabled) { r.render(scene, camera); return; }
    this._size();
    const vis = hide.map(o => o && o.visible);
    for (const o of hide) if (o) o.visible = false;
    const bg = scene.background, fog = scene.fog, au = r.shadowMap.autoUpdate, nu = r.shadowMap.needsUpdate, prevRT = r.getRenderTarget();
    scene.background = null; scene.fog = null; scene.overrideMaterial = this.depthMat;
    r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = false;
    r.setRenderTarget(this.rt); r.clear(true, true, false); r.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
    r.shadowMap.autoUpdate = au; r.shadowMap.needsUpdate = nu;
    hide.forEach((o, i) => { if (o) o.visible = vis[i]; });
    r.setRenderTarget(prevRT);
    r.render(scene, camera);
    const u = this.mat.uniforms; u.cNear.value = camera.near; u.cFar.value = camera.far;
    const ac = r.autoClear; r.autoClear = false;
    r.render(this.qScene, this.qCam);
    r.autoClear = ac;
  }
}
