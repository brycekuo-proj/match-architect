// 火柴建築師 Match Architect — level data, build-graph (Design) and 2D physics (Sim) on Planck.js
import { World, Vec2, Box, Chain, Circle, RevoluteJoint, PrismaticJoint, DistanceJoint } from 'planck';
import { fullLevels } from './levels_full.js';

export const L = 2.0;            // fixed match length (m)
export const TH = 0.12;          // match thickness (m)
export const CAT = { TERRAIN: 1, STRUCT: 2 };
export const QUAKE_TIME = 10;

export const PARAMS = {
  gravity: 10,
  stickDensity: 2.0,
  jointTorque: 0.35,       // glue "friction" torque (N·m)
  breakForce: 750,         // smoothed reaction force that snaps a glue joint (N)
  substeps: 5,
  velIters: 30,
  posIters: 15,
  // collapse after a failure: fire runs along the matches and melts the glue it reaches
  burnSpeed: 2.6,          // m/s a flame front travels along a match
  meltDelay: [0.06, 0.28], // s from the fire reaching a glue joint to the joint letting go
  glueFade: 1.8,           // s after the failure for all remaining glue to weaken to glueFloor
  glueFloor: 0.1,
  // 防震道具 (shop items)
  steelYield: 1.0,         // 高韌性鋼骨: joints start to yield (bend) at this share of breakForce…
  steelBreak: 1.7,         // …and only snap at this share
  cfrpLight: 0.6,          // 碳纖維包覆: wrapped matches weigh this much
  cfrpStrong: 1.8,         // and their joints are this much stronger
  isoFreq: 0.9,            // 隔震墊: natural frequency of the isolated base (Hz), well below the quake's
  isoDamping: 0.3,
  isoTravel: 0.9,          // how far the base may slide each way (m)
  strutFreq: 4,            // 彈簧避震器: spring-damper brace stiffness (Hz) and damping
  strutDamping: 0.9,
  damperShare: 0.8,        // 阻尼球: share of the sway it takes off the matches right next to it…
  damperReach: 4.5,        // …fading to nothing this many match lengths away
  damperDrop: 0.6,         // how far below its joint the ball is drawn (m)
};

// 震度 ladder: ground amplitude A (m) and frequency f (Hz)
export const SHINDO = {
  '3': { A: 0.07, f: 1.2 }, '4': { A: 0.09, f: 1.3 }, '5弱': { A: 0.11, f: 1.4 }, '5強': { A: 0.13, f: 1.45 },
  '6弱': { A: 0.15, f: 1.5 }, '6強': { A: 0.17, f: 1.55 }, '7': { A: 0.2, f: 1.6 },
};

// 地震類型: how the ground moves. Every type is scaled from the level's 震度 (its A and f, peak ground acceleration
// PGA ≈ 1.4·A·(2πf)² for the plain sway), so a stronger 震度 is stronger in every type.
//   sway  橫向搖晃  the plain side-to-side shake (all the original jobs)
//   jolt  直下型    bursts of hard up-and-down jolts with a weaker sway: loads beams, roofs and anything sticking out
//   long  長週期    a slow, wide sway: low acceleration, but tall buildings resonate and sway harder every cycle
//   after 餘震      a main shock, a short calm, then an aftershock; joints badly strained in the main shock are weaker
//   ps    P波→S波   a light, fast up-and-down rattle first (the P wave), then the strong sway arrives all at once
//   pulse 脈衝型    a near-fault quake: under a light sway, one huge shove of the ground (and a smaller one back)
export const QTYPES = ['sway', 'jolt', 'long', 'after', 'ps', 'pulse'];
export const QT = {
  jolt: { hx: 0.55, vf: 2.6, vg: 1.2, vMax: 26, bursts: [[0.3, 2.2], [3.4, 5.3], [6.6, 8.8]] },
  long: { f: 0.5, pga: 0.32, ramp: 3, flex: 1.6 },
  after: { mainEnd: 5.2, start: 6.5, gain: 0.85, fr: 1.15, fatigue: 0.4 },
  ps: { sAt: 2.5, pf: 2.2, pg: 0.45, sg: 1.15 },
  pulse: { bg: 0.4, pulses: [[2.4, 1.0, 1.35], [5.9, 1.1, -0.75]], flex: 1.0 },
};
// the building's own sway (used by the long-period and pulse quakes): one mode, natural frequency from its height
export const FLEX = { k: 7.5, fMin: 0.35, fMax: 6, zeta: 0.05, damper: 0.14 };

const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const between = (t, a, b, up = 0.25, down = 0.4) => sm((t - a) / up) * sm((b - t) / down);
// the plain sway: main swing plus a little irregular wobble (peak acceleration ≈ 1.4·A·ω²) and a slight vertical bob
const swayX = (A, w, t) => A * (Math.sin(w * t) + 0.25 * Math.sin(w * 1.62 * t + 1.3));
const swayY = (A, w, t) => A * 0.1 * Math.sin(w * 1.31 * t + 0.4);
const plainEnv = t => sm(t / 0.8) * sm((QUAKE_TIME - t) / 0.8);
// ground displacement [x, y] (m) at time t for a quake type
export function groundMotion(type, q, t) {
  const A = q.A, w = 2 * Math.PI * q.f, T = QT[type];
  switch (type) {
    case 'jolt': {
      // vertical: bursts at vf × the sway frequency, peak acceleration vg × the sway's PGA
      // (capped at vMax m/s², about 2.6 g, so the strongest 震度 don't simply shake heavy towers apart)
      const vw = w * T.vf, vA = Math.min(T.vg * 1.4 * A * w * w, T.vMax) / (vw * vw);
      let ve = 0; for (const [a, b] of T.bursts) ve = Math.max(ve, between(t, a, b, 0.3, 0.5));
      const e = plainEnv(t);
      return [T.hx * e * swayX(A, w * 1.25, t), vA * ve * (Math.sin(vw * t) + 0.3 * Math.sin(vw * 2.1 * t + 0.7))];
    }
    case 'long': {
      const wl = 2 * Math.PI * T.f, Al = T.pga * 1.4 * A * w * w / (wl * wl);
      const e = sm(t / T.ramp) * sm((QUAKE_TIME - t) / 1.2);
      return [Al * e * (Math.sin(wl * t) + 0.15 * Math.sin(wl * 1.7 * t + 0.9)), 0];
    }
    case 'after': {
      const e1 = sm(t / 0.8) * sm((T.mainEnd - t) / 0.6);
      const e2 = between(t, T.start, QUAKE_TIME, 0.2, 0.8) * T.gain, t2 = t - T.start;
      return [e1 * swayX(A, w, t) + e2 * swayX(A, w * T.fr, t2), e1 * swayY(A, w, t) + e2 * swayY(A, w * T.fr, t2)];
    }
    case 'ps': {
      // P wave: a light, fast vertical rattle; S wave: the full sway (a bit stronger), arriving almost at once
      const pw = w * T.pf, pA = T.pg * 1.4 * A / (T.pf * T.pf), eP = between(t, 0, T.sAt + 0.4, 0.15, 0.6), eS = between(t, T.sAt, QUAKE_TIME, 0.3, 0.8);
      return [0.12 * eP * swayX(A, w * 1.8, t) + T.sg * eS * swayX(A, w, t - T.sAt), pA * eP * Math.sin(pw * t) + eS * swayY(A, w, t)];
    }
    case 'pulse': {
      const e = plainEnv(t);
      let x = T.bg * e * swayX(A, w, t);
      for (const [t0, Tp, g] of T.pulses) {
        // one back-and-forth shove of the ground: displacement D·(1 − cos)/2, peak acceleration g × the sway's PGA
        if (t <= t0 || t >= t0 + Tp) continue;
        const wp = 2 * Math.PI / Tp, D = g * 1.4 * A * w * w / (0.5 * wp * wp);
        x += D * 0.5 * (1 - Math.cos(wp * (t - t0)));
      }
      return [x, T.bg * e * swayY(A, w, t)];
    }
    default: { const e = plainEnv(t); return [e * swayX(A, w, t), e * swayY(A, w, t)]; }
  }
}
// rough "how hard is it shaking" for the HUD, rumble and camera (the plain sway at full strength = 1)
export function quakeGain(type, t) {
  const T = QT[type];
  switch (type) {
    case 'jolt': { let ve = 0; for (const [a, b] of T.bursts) ve = Math.max(ve, between(t, a, b, 0.3, 0.5)); return Math.max(T.hx * plainEnv(t), ve * 1.1); }
    case 'long': return 0.75 * sm(t / T.ramp) * sm((QUAKE_TIME - t) / 1.2);
    case 'after': return Math.max(sm(t / 0.8) * sm((T.mainEnd - t) / 0.6), between(t, T.start, QUAKE_TIME, 0.2, 0.8) * T.gain);
    case 'ps': return Math.max(0.3 * between(t, 0, T.sAt + 0.4, 0.15, 0.6), T.sg * between(t, T.sAt, QUAKE_TIME, 0.3, 0.8));
    case 'pulse': { let p = 0; for (const [t0, Tp, g] of T.pulses) if (t > t0 && t < t0 + Tp) p = Math.max(p, Math.abs(g) * Math.sin(Math.PI * (t - t0) / Tp)); return Math.max(T.bg * plainEnv(t), p); }
    default: return plainEnv(t);
  }
}

// ---------------------------------------------------------------- levels (coordinates in match lengths)
const FLAT = [[-40, 0], [50, 0], [50, -2], [-40, -2]];
const T = Math.sqrt(3) / 2;
const row = n => n * T;
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push([i, 0]); return r; };
const BASE = [  // each entry is one commission (委託)
  {
    id: 1, key: 'triangle', en: {"name": "Triangle", "desc": "Build a triangle whose tip touches the star. Survive the 10-second quake and you pass! Three matches is all it takes.", "hint": "Drag a match out of a red anchor. Triangles are the sturdiest shape there is."}, name: '三角形', tag: '教學', shindo: '3', par: 3,
    desc: '搭一個三角形，頂點碰到星星。地震 10 秒不倒就過關！3 支火柴就做得到。',
    hint: '從紅色錨點拖出火柴。三角形是最穩的形狀。',
    anchors: [[0, 0], [1, 0]], stars: [[0.5, T]],
  },
  {
    id: 2, key: 'square', en: {"name": "Square", "desc": "Build a square that holds up the star. A plain four-sided square wobbles over, so add a diagonal brace!", "hint": "Press on the middle of a match and drag to glue a new match onto it as a brace."}, name: '四方形', tag: '教學', shindo: '4', par: 5,
    desc: '搭一個四方形撐住星星。只有 4 邊的四方形會晃倒，要加一支斜撐！',
    hint: '在柱子中段按住拖曳，可以把火柴黏在另一支火柴身上做斜撐。',
    anchors: [[0, 0], [1, 0]], stars: [[0.5, 1]],
  },
  {
    id: 3, key: 'twofloor', en: {"name": "Two Floors", "desc": "Stack two squares, hold the star up on the roof, and survive the 10-second quake!", "hint": "Every floor needs a brace of its own."}, name: '兩層樓', tag: '教學', shindo: '4', par: 9,
    desc: '蓋兩層四方形，屋頂撐住星星，撐過 10 秒地震！',
    hint: '每一層都需要自己的斜撐。',
    anchors: [[0, 0], [1, 0]], stars: [[0.5, 2]],
  },
  {
    id: 4, key: 'sphinx', en: {"name": "Great Sphinx", "place": "Giza, Egypt", "real": "about 20 m tall and 73 m long", "desc": "A long, low lion. There is a star on its head and another on its back, and both have to stay up.", "hint": "A row of triangles makes a nice long body."}, name: '獅身人面像', place: '埃及 · 吉薩', real: '高約 20 公尺，身長約 73 公尺', shindo: '4', par: 8, biome: 'sand',
    desc: '又矮又長的獅子。頭頂和背上各有一顆星星，兩顆都要撐住。',
    hint: '一排三角形就能撐出長長的身體。',
    anchors: range(0, 3), stars: [[1, row(2)], [2.5, row(1)]],
    sil: [[0, 0], [1, 0], [1, .27], [.9, .45], [.5, .45], [.46, .72], [.44, .92], [.37, 1], [.28, .95], [.25, .72], [.19, .57], [.06, .45], [0, .22]],
  },
  {
    id: 5, key: 'pyramid', en: {"name": "Great Pyramid", "place": "Giza, Egypt", "real": "originally about 146 m tall", "desc": "Built 4,500 years ago. The tip has to touch the star.", "hint": "Every new joint needs two matches holding it from different directions."}, name: '古夫金字塔', place: '埃及 · 吉薩', real: '原高約 146 公尺', shindo: '5弱', par: 12, biome: 'sand',
    desc: '四千五百年前的金字塔。塔尖要碰到星星。',
    hint: '每個新的接點都要有兩支火柴從不同方向撐住。',
    anchors: range(0, 3), stars: [[1.5, row(3)]],
    sil: [[0, 0], [1, 0], [.5, 1]],
  },
  {
    id: 6, key: 'pisa', en: {"name": "Leaning Tower of Pisa", "place": "Pisa, Italy", "real": "about 56 m tall, leaning about 4°", "desc": "The star is up and to the right, so the tower has to lean. With its weight off to one side, it is the easiest one to topple.", "hint": "Stack triangles diagonally upward, like a slanted ribbon."}, name: '比薩斜塔', place: '義大利 · 比薩', real: '高約 56 公尺，傾斜約 4 度', shindo: '5強', par: 10,
    desc: '星星在右上方，塔要斜著蓋。重心歪一邊，地震時最容易倒。',
    hint: '斜著往上疊三角形，像一條斜斜的帶子。',
    anchors: range(0, 2), stars: [[1.5, row(3)]],
    sil: [[.06, 0], [.4, 0], [.95, .9], [.95, 1], [.66, 1], [.62, .9]],
  },
  {
    id: 7, key: 'eiffel', en: {"name": "Eiffel Tower", "place": "Paris, France", "real": "about 330 m tall", "desc": "Four legs spread wide with an arch in the middle. The tip has to touch the star.", "hint": "Build one slanted leg on each side and join them at the top."}, name: '艾菲爾鐵塔', place: '法國 · 巴黎', real: '高約 330 公尺', shindo: '6弱', par: 20,
    desc: '四隻腳張開的鐵塔，中間是拱門。塔尖要碰到星星。',
    hint: '兩邊各蓋一隻斜腳，在上面合起來。',
    anchors: [[0, 0], [1, 0], [3, 0], [4, 0]], stars: [[2, row(4)]],
    sil: [[0, 0], [.25, 0], [.33, .17], [.5, .24], [.67, .17], [.75, 0], [1, 0], [.62, .55], [.55, .82], [.515, 1], [.485, 1], [.45, .82], [.38, .55]],
  },
  {
    id: 8, key: 'tokyotower', en: {"name": "Tokyo Tower", "place": "Tokyo, Japan", "real": "333 m tall", "desc": "Taller and slimmer than the Eiffel Tower, and the quake is stronger too.", "hint": "Spread the legs on the lower half, then run a straight column of triangles up the top half."}, name: '東京鐵塔', place: '日本 · 東京', real: '高 333 公尺', shindo: '6強', par: 28,
    desc: '比艾菲爾更高更細的紅白鐵塔，地震也更強了。',
    hint: '下半段張開腳，上半段用一條直直往上的三角形柱子。',
    anchors: [[0, 0], [1, 0], [3, 0], [4, 0]], stars: [[2, row(6)]],
    sil: [[0, 0], [.27, 0], [.5, .14], [.73, 0], [1, 0], [.66, .42], [.6, .66], [.56, .78], [.53, .9], [.51, 1], [.49, 1], [.47, .9], [.44, .78], [.4, .66], [.34, .42]],
  },
  {
    id: 9, key: 'pearl', en: {"name": "Oriental Pearl Tower", "place": "Shanghai, China", "real": "about 468 m tall", "desc": "A tall column threaded through two big pearls. Hold up both the upper and the lower star.", "hint": "Build a wide base first, then a column of triangles on top of it."}, name: '東方明珠', place: '中國 · 上海', real: '高約 468 公尺', shindo: '6強', par: 28,
    desc: '一根高柱串著兩顆大珠子。上下兩顆星星都要撐住。',
    hint: '先蓋寬寬的底座，再往上接一條三角形柱子。',
    anchors: range(0, 3), stars: [[1.5, row(3)], [1.5, row(7)]],
    sil: [[.02, 0], [.22, 0], [.42, .22], [.58, .22], [.78, 0], [.98, 0], [.6, .32], [.58, .9], [.52, 1], [.48, 1], [.42, .9], [.4, .32]],
    circles: [[1.5, row(3), 0.7], [1.5, row(7) - 0.1, 0.45]],
  },
  {
    id: 10, key: 'taipei101', en: {"name": "Taipei 101", "place": "Taipei, Taiwan", "real": "508 m tall", "desc": "It grows upward one section at a time, like bamboo. A wider base and a bigger quake.", "hint": "The higher the triangles in the base go, the harder the tower is to snap."}, name: '台北 101', place: '台灣 · 台北', real: '高 508 公尺', shindo: '6強', par: 50,
    desc: '像竹節一樣一節一節往上長。底座更寬了，地震也更大。',
    hint: '底座的三角形疊得越高，上面的塔越不容易被晃斷。',
    anchors: range(0, 6), stars: [[3, row(8)]],
    sil: [[.32, 0], [.68, 0], [.65, .14], [.62, .14], [.64, .24], [.61, .24], [.63, .34], [.6, .34], [.62, .44], [.59, .44], [.61, .54], [.58, .54], [.6, .64], [.57, .64], [.59, .74], [.56, .74], [.55, .86], [.52, .86], [.5, 1], [.48, .86], [.45, .86], [.44, .74], [.41, .74], [.43, .64], [.4, .64], [.42, .54], [.39, .54], [.41, .44], [.38, .44], [.4, .34], [.37, .34], [.39, .24], [.36, .24], [.38, .14], [.35, .14]],
  },
  ...fullLevels({ range, row }),   // 完整版 only (jobs 11+): the web / jam builds swap levels_full.js for levels_web.js
];
export const LEVELS = BASE.map(o => {
  const xs = [...o.anchors.map(a => a[0]), ...o.stars.map(s => s[0])];
  const top = Math.max(...o.stars.map(s => s[1]));
  const lv = {
    terrain: [FLAT], ...o, budget: o.par * 2,   // match quota = 2× the 3-star target
    quake: { ...SHINDO[o.shindo], type: o.qtype || 'sway' },
    view: [Math.min(...xs) - 0.55, Math.max(...xs) + 0.55, -0.3, top + 0.4],
  };
  if (!o.tag) lv.tag = '名建築';
  return lv;
});

// ---------------------------------------------------------------- geometry helpers
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - x1 - t * dx, py - y1 - t * dy), t };
}
function circleSeg(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
}
export function levelTerrain(level) {
  return level.terrain.map(poly => poly.map(([x, y]) => [x * L, y * L]));
}

// ---------------------------------------------------------------- Design: the editable build graph
export class Design {
  constructor(level) {
    this.level = level;
    this.terrain = levelTerrain(level);
    this.nodes = [];
    this.sticks = [];
    this.nid = 0;
    this.sid = 0;
    for (const [ax, ay] of level.anchors) this.nodes.push({ id: this.nid++, x: ax * L, y: ay * L, kind: 'anchor' });
  }
  snapshot() { return JSON.stringify({ nodes: this.nodes, sticks: this.sticks, nid: this.nid, sid: this.sid }); }
  restore(s) { const o = JSON.parse(s); Object.assign(this, o); }
  node(id) { return this.nodes.find(n => n.id === id); }
  stick(id) { return this.sticks.find(s => s.id === id); }
  ends(s) { const a = this.node(s.a), b = this.node(s.b); return [a.x, a.y, b.x, b.y]; }
  limit() { return this.level.budget; }
  used() { return this.sticks.length; }
  degree(nid) { return this.sticks.filter(s => s.a === nid || s.b === nid).length; }

  // what is under the pointer? nodes win over stick bodies
  hit(x, y, r) {
    let best = null;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= r && (!best || d < best.d)) best = { type: 'node', id: n.id, x: n.x, y: n.y, d };
    }
    if (best) return best;
    for (const s of this.sticks) {
      const [x1, y1, x2, y2] = this.ends(s);
      const q = segDist(x, y, x1, y1, x2, y2);
      if (q.d <= r * 0.8 && (!best || q.d < best.d)) {
        let t = Math.round(q.t * 8) / 8;
        if (t < 0.125 || t > 0.875) {
          const nId = t < 0.5 ? s.a : s.b;
          const n = this.node(nId);
          best = { type: 'node', id: nId, x: n.x, y: n.y, d: q.d };
        } else {
          best = { type: 'stick', id: s.id, t, x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, d: q.d };
        }
      }
    }
    return best;
  }

  insideTerrain(x, y) { return this.terrain.some(p => pointInPoly(x, y, p)); }

  // compute the ghost match from a start point toward the pointer (fixed length, snapping)
  preview(start, px, py) {
    const sx = start.x, sy = start.y;
    const dx = px - sx, dy = py - sy, d = Math.hypot(dx, dy);
    if (d < 0.08 * L) return null;
    const rx = sx + dx / d * L, ry = sy + dy / d * L;
    const startNode = start.type === 'node' ? start.id : null;
    const host = start.type === 'stick' ? this.stick(start.id) : null;
    let end = null;
    // 1) snap to an existing joint at (about) one match length
    for (const n of this.nodes) {
      if (n.id === startNode) continue;
      if (host && (n.id === host.a || n.id === host.b || (n.kind === 'glue' && n.host === host.id))) continue;
      const dn = Math.hypot(n.x - sx, n.y - sy);
      if (Math.abs(dn - L) > 0.15 * L) continue;
      const de = Math.hypot(n.x - rx, n.y - ry);
      if (de > 0.45 * L) continue;
      if (!end || de < end.de) end = { kind: 'node', id: n.id, x: n.x, y: n.y, de };
    }
    // 2) glue onto another match's body where the circle of radius L crosses it
    if (!end) {
      for (const s of this.sticks) {
        if (host && s.id === host.id) continue;
        if (startNode !== null && (s.a === startNode || s.b === startNode)) continue;
        const [x1, y1, x2, y2] = this.ends(s);
        for (const t of circleSeg(sx, sy, L, x1, y1, x2, y2)) {
          if (t < 0.1 || t > 0.9) continue;
          const ex = x1 + (x2 - x1) * t, ey = y1 + (y2 - y1) * t;
          const de = Math.hypot(ex - rx, ey - ry);
          if (de > 0.3 * L) continue;
          if (!end || de < end.de) end = { kind: 'stick', id: s.id, t, x: ex, y: ey, de };
        }
      }
    }
    // 3) free end, angle snapped to 15°
    if (!end) {
      let a = Math.atan2(dy, dx);
      const step = Math.PI / 12;
      a = Math.round(a / step) * step;
      end = { kind: 'free', x: sx + Math.cos(a) * L, y: sy + Math.sin(a) * L };
      for (const n of this.nodes) {
        if (Math.hypot(n.x - end.x, n.y - end.y) < 0.03 * L && n.id !== startNode) { end = { kind: 'node', id: n.id, x: n.x, y: n.y }; break; }
      }
    }
    const res = { x1: sx, y1: sy, x2: end.x, y2: end.y, end, ok: true, reason: '' };
    // validation
    if (this.used() >= this.limit()) { res.ok = false; res.reason = `這關最多 ${this.limit()} 支火柴`; res.code = 'limit'; res.n = this.limit(); }
    if (end.kind === 'node' && startNode !== null &&
        this.sticks.some(s => (s.a === startNode && s.b === end.id) || (s.b === startNode && s.a === end.id))) {
      res.ok = false; res.reason = '這裡已經有火柴了'; res.code = 'occupied';
    }
    for (let k = 1; k < 10 && res.ok; k++) {
      const t = k / 10;
      if (this.insideTerrain(sx + (end.x - sx) * t, sy + (end.y - sy) * t)) { res.ok = false; res.reason = '不能穿過地面'; res.code = 'ground'; }
    }
    if (res.ok && end.kind !== 'node' && this.insideTerrain(end.x, end.y)) { res.ok = false; res.reason = '不能插進地面'; res.code = 'groundEnd'; }
    return res;
  }

  _nodeAt(kind, x, y, extra = {}) {
    const n = { id: this.nid++, x, y, kind, ...extra };
    this.nodes.push(n);
    return n.id;
  }
  _glueNode(stickId, t, x, y) {
    const ex = this.nodes.find(n => n.kind === 'glue' && n.host === stickId && Math.abs(n.t - t) < 0.02);
    return ex ? ex.id : this._nodeAt('glue', x, y, { host: stickId, t });
  }
  commit(start, pv) {
    if (!pv || !pv.ok) return null;
    const a = start.type === 'node' ? start.id : this._glueNode(start.id, start.t, start.x, start.y);
    let b;
    if (pv.end.kind === 'node') b = pv.end.id;
    else if (pv.end.kind === 'stick') b = this._glueNode(pv.end.id, pv.end.t, pv.end.x, pv.end.y);
    else b = this._nodeAt('free', pv.end.x, pv.end.y);
    const s = { id: this.sid++, a, b };
    this.sticks.push(s);
    return s;
  }
  removeStick(id) {
    this.sticks = this.sticks.filter(s => s.id !== id);
    for (const n of this.nodes) if (n.kind === 'glue' && n.host === id) { n.kind = 'free'; delete n.host; delete n.t; }
    this._prune();
  }
  _prune() {
    this.nodes = this.nodes.filter(n => n.kind === 'anchor' || this.degree(n.id) > 0);
  }
  hitStick(x, y, r) {
    let best = null;
    for (const s of this.sticks) {
      const [x1, y1, x2, y2] = this.ends(s);
      const q = segDist(x, y, x1, y1, x2, y2);
      if (q.d <= r && (!best || q.d < best.d)) best = { id: s.id, d: q.d };
    }
    return best;
  }
  clear() { this.sticks = []; this.nodes = this.nodes.filter(n => n.kind === 'anchor'); }

  // test helper: add a segment by coordinates (metres)
  addSegment(x1, y1, x2, y2) {
    const findStart = (x, y) => {
      const n = this.nodes.find(n => Math.hypot(n.x - x, n.y - y) < 1e-3);
      if (n) return { type: 'node', id: n.id, x: n.x, y: n.y };
      for (const s of this.sticks) {
        const [a, b, c, d] = this.ends(s);
        const q = segDist(x, y, a, b, c, d);
        if (q.d < 1e-3) return { type: 'stick', id: s.id, t: q.t, x, y };
      }
      return null;
    };
    const st = findStart(x1, y1);
    if (!st) throw new Error('segment start not attached: ' + [x1, y1]);
    let end;
    const en = findStart(x2, y2);
    if (en && en.type === 'node') end = { kind: 'node', id: en.id, x: en.x, y: en.y };
    else if (en && en.type === 'stick') end = { kind: 'stick', id: en.id, t: en.t, x: x2, y: y2 };
    else end = { kind: 'free', x: x2, y: y2 };
    return this.commit(st, { ok: true, end, x1, y1, x2, y2 });
  }

  starsReached() {
    return this.level.stars.map(([px, py]) => {
      const sx = px * L, sy = py * L;
      return this.sticks.some(s => { const [a, b, c, d] = this.ends(s); return segDist(sx, sy, a, b, c, d).d < 0.12 * L; });
    });
  }
  canStart() {
    if (!this.used()) return { ok: false, reason: '先放幾支火柴吧', code: 'empty' };
    const r = this.starsReached(), miss = r.filter(v => !v).length;
    if (miss) return { ok: false, reason: r.length > 1 ? `還有 ${miss} 顆星星沒碰到` : '結構還沒碰到星星', code: r.length > 1 ? 'missStars' : 'missStar', n: miss };
    return { ok: true };
  }
}

// ---------------------------------------------------------------- Sim: physics run
export class Sim {
  // opts = shop items for this quake: { steel, iso, wraps: [stickId], struts: [{a, b}], damper: nodeId }
  constructor(level, design, P = PARAMS, opts = {}) {
    this.level = level; this.design = design; this.P = P;
    const o = this.opts = { ...(opts || {}) };
    this.wraps = new Set(o.wraps || []);
    this.t = 0; this.state = 'running'; this.reason = ''; this.events = []; this.breaks = 0;
    const w = this.world = new World({ gravity: new Vec2(0, -P.gravity) });
    const g = this.ground = w.createBody({ type: 'kinematic', position: new Vec2(0, 0) });
    for (const poly of levelTerrain(level)) {
      g.createFixture(new Chain(poly.map(([x, y]) => new Vec2(x, y)), true),
        { friction: 0.9, filterCategoryBits: CAT.TERRAIN, filterMaskBits: CAT.STRUCT });
    }
    this.bodies = new Map();
    for (const s of design.sticks) {
      const [x1, y1, x2, y2] = design.ends(s);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const b = w.createBody({ type: 'dynamic', position: new Vec2((x1 + x2) / 2, (y1 + y2) / 2), angle: Math.atan2(y2 - y1, x2 - x1), angularDamping: 0.1, linearDamping: 0.02 });
      const dens = P.stickDensity * (this.wraps.has(s.id) ? P.cfrpLight : 1);
      // on isolation bearings the frame doesn't rub on the soil (it touches the ground again once it collapses)
      b.createFixture(new Box(len / 2, TH / 2), { density: dens, friction: 0.8, filterCategoryBits: CAT.STRUCT, filterMaskBits: o.iso ? 0 : CAT.TERRAIN });
      b.stickId = s.id;
      this.bodies.set(s.id, b);
    }
    this.joints = [];
    let mStruct = 0; for (const b of this.bodies.values()) mStruct += b.getMass();
    this.mStruct = mStruct;
    // 鉛心橡膠隔震墊: the anchors sit on one heavy base that can slide, held to the ground by rubber (spring) and lead (damper)
    let base = g;
    if (o.iso && level.anchors.length) {
      const ax = level.anchors.map(a => a[0] * L), cx = (Math.min(...ax) + Math.max(...ax)) / 2, hw = (Math.max(...ax) - Math.min(...ax)) / 2 + 0.3;
      const slab = this.slab = w.createBody({ type: 'dynamic', position: new Vec2(cx, 0), fixedRotation: true });
      const mSlab = Math.max(0.5, mStruct * 0.6);
      slab.createFixture(new Box(hw, 0.05), { density: mSlab / (hw * 2 * 0.1), filterCategoryBits: 0, filterMaskBits: 0 });
      w.createJoint(new PrismaticJoint({ enableLimit: true, lowerTranslation: -P.isoTravel, upperTranslation: P.isoTravel }, g, slab, new Vec2(cx, 0), new Vec2(1, 0)));
      const M = mSlab + mStruct, om = 2 * Math.PI * P.isoFreq;
      this.iso = { x0: cx, k: M * om * om, c: 2 * P.isoDamping * M * om };
      base = slab;
    }
    this.base = base;
    const pin = (ba, bb, x, y, nodeId) => {
      const j = w.createJoint(new RevoluteJoint({ enableMotor: true, motorSpeed: 0, maxMotorTorque: P.jointTorque, collideConnected: false }, ba, bb, new Vec2(x, y)));
      const sticks = [ba.stickId, bb.stickId].filter(v => v !== undefined);
      const u = new Map();   // where along each match (0 = end a, 1 = end b) this glue sits
      for (const sid of sticks) { const [ax, ay, bx, by] = design.ends(design.stick(sid)); u.set(sid, segDist(x, y, ax, ay, bx, by).t); }
      this.joints.push({ j, nodeId, sticks, u, f: 0, broken: false, x, y, peak: 0, anchor: ba === base, cfrp: sticks.some(sid => this.wraps.has(sid)) });
    };
    for (const n of design.nodes) {
      const inc = design.sticks.filter(s => s.a === n.id || s.b === n.id);
      if (n.kind === 'anchor') { for (const s of inc) pin(base, this.bodies.get(s.id), n.x, n.y, n.id); continue; }
      if (n.kind === 'glue' && this.bodies.has(n.host)) { const hb = this.bodies.get(n.host); for (const s of inc) pin(hb, this.bodies.get(s.id), n.x, n.y, n.id); continue; }
      if (inc.length >= 2) { const hub = this.bodies.get(inc[0].id); for (const s of inc.slice(1)) pin(hub, this.bodies.get(s.id), n.x, n.y, n.id); }
    }
    // every target star rides on the match that touches it
    this.stars = [];
    for (const [px, py] of level.stars) {
      const sx = px * L, sy = py * L;
      let best = null;
      for (const s of design.sticks) {
        const [a, b, c, d] = design.ends(s);
        const q = segDist(sx, sy, a, b, c, d);
        if (!best || q.d < best.d) best = { d: q.d, s, px: a + (c - a) * q.t, py: b + (d - b) * q.t };
      }
      if (best) {
        const body = this.bodies.get(best.s.id);
        this.stars.push({ body, local: body.getLocalPoint(new Vec2(best.px, best.py)), home: { x: best.px, y: best.py }, lost: false });
      }
    }
    this.stress = new Map();
    this.burn = new Map();   // stickId → { lo, hi, len } burnt span along the match (0 = end a, the match head)
    this.fireT = null;       // time of the first failure (fire starts there)
    // 彈簧避震器: spring-damper braces between two joints (not matches, can't break)
    this.struts = [];
    for (const st of o.struts || []) {
      const A = this.holder(st.a), B = this.holder(st.b);
      if (!A || !B || A.body === B.body) continue;
      const pa = A.body.getWorldPoint(A.local), pb = B.body.getWorldPoint(B.local), len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (len < 0.2) continue;
      w.createJoint(new DistanceJoint({ frequencyHz: P.strutFreq, dampingRatio: P.strutDamping, length: len, collideConnected: false }, A.body, B.body, pa, pb));
      this.struts.push({ A, B, len });
    }
    // 阻尼球: hangs below a joint and swings against the shaking; the matches around it only have to carry part of
    // their own sway (strongest next to the ball, fading out over a few match lengths). Gameplay model of a mass damper.
    const H = o.damper !== undefined && o.damper !== null ? this.holder(o.damper) : null;
    if (H && H.body !== base) {
      const n = design.node(o.damper), wts = [];
      for (const b of this.bodies.values()) {
        const p = b.getPosition(), d = Math.hypot(p.x - n.x, p.y - n.y), wgt = Math.max(0, 1 - d / (P.damperReach * L));
        if (wgt > 0) wts.push([b, wgt * P.damperShare]);
      }
      this.damper = { nodeId: n.id, x: n.x, y: n.y, host: H.body, local: H.local, wts, swing: 0, vel: 0, gvPrev: 0 };
    }
    // quake type, and for the long-period / pulse quakes the building's own sway: a matchstick truss is far stiffer
    // than a real tower, so its first mode is modelled (like the damper) as one oscillator, natural frequency from the
    // height (taller = slower). Its swing pushes on every match in proportion to how high up it is.
    this.qt = (level.quake && level.quake.type) || 'sway';
    const share = QT[this.qt] && QT[this.qt].flex;
    let top = 0; for (const s of design.sticks) { const [, y1, , y2] = design.ends(s); top = Math.max(top, y1, y2); }
    this.height = top;
    if (share && top > 0.5) {
      const fn = Math.max(FLEX.fMin, Math.min(FLEX.fMax, FLEX.k / top));
      this.flex = { share, H: top, fn, w: 2 * Math.PI * fn, u: 0, v: 0, acc: 0, vPrev: 0, peak: 0 };
    }
    this.phase = 'main';
  }
  // the body a joint (node) rides on, and where on it
  holder(nodeId) {
    const n = this.design.node(nodeId); if (!n) return null;
    let body = null;
    if (n.kind === 'anchor') body = this.base;
    else if (n.kind === 'glue' && this.bodies.has(n.host)) body = this.bodies.get(n.host);
    else { const st = this.design.sticks.find(s => s.a === n.id || s.b === n.id); body = st ? this.bodies.get(st.id) : null; }
    return body ? { body, local: body.getLocalPoint(new Vec2(n.x, n.y)) } : null;
  }
  _itemForces() {
    if (this.iso) {
      const s = this.slab, gp = this.ground.getPosition(), gv = this.ground.getLinearVelocity();
      const dx = s.getPosition().x - gp.x - this.iso.x0, dv = s.getLinearVelocity().x - gv.x;
      s.applyForceToCenter(new Vec2(-this.iso.k * dx - this.iso.c * dv, 0), true);
    }
  }
  _damperForces(h) {
    const D = this.damper; if (!D) return;
    const gv = this.ground.getLinearVelocity().x, ag = (gv - D.gvPrev) / h; D.gvPrev = gv;
    if (this.fireT !== null) return;   // once something has failed it can't save the building
    for (const [b, w] of D.wts) b.applyForceToCenter(new Vec2(b.getMass() * ag * w, 0), true);
    // the ball itself: a pendulum pushed the other way (drawn by the renderer)
    D.vel += (-ag * 0.9 - D.swing * 30 - D.vel * 3) * h; D.swing += D.vel * h;
  }

  // the plain envelope (0.8 s fade in and out); kept for the sway and for callers that only want "is it shaking"
  quakeEnv(t) { return sm(t / 0.8) * sm((QUAKE_TIME - t) / 0.8); }
  // how hard the ground is shaking right now (the sway at full strength = A / 0.12); drives the rumble, dust and camera
  quakeLevel(t) {
    const q = this.level.quake, k = q.A / 0.12, fade = this.fireT !== null ? Math.max(0, 1 - (t - this.fireT) / 3) : 1;
    return k * fade * quakeGain(this.qt, t);
  }
  _quakeTarget(t) {
    const q = this.level.quake;
    let [x, y] = groundMotion(this.qt, q, t);
    if (this.fireT !== null) { const f = Math.max(0, 1 - (t - this.fireT) / 3); x *= f; y *= f; }   // after a failure the shaking dies down; the fire takes over
    return [x, y];
  }
  // the building's own sway (long-period / pulse quakes): driven by how the base moves, damped (more with a 阻尼球)
  _flexForces(h) {
    const F = this.flex, vb = this.base.getLinearVelocity().x, ab = (vb - F.vPrev) / h; F.vPrev = vb;
    if (this.fireT !== null) return;
    const z = FLEX.zeta + (this.damper ? FLEX.damper : 0);
    const acc = -ab - 2 * z * F.w * F.v - F.w * F.w * F.u;
    F.v += acc * h; F.u += F.v * h; F.acc = acc; F.peak = Math.max(F.peak, Math.abs(F.u));
    const y0 = this.base.getPosition().y;
    for (const b of this.bodies.values()) {
      const phi = Math.max(0, Math.min(1, (b.getPosition().y - y0) / F.H));
      if (phi > 0) b.applyForceToCenter(new Vec2(-F.share * b.getMass() * phi * acc, 0), true);
    }
  }
  // how far the drawn building leans at height y because of its own sway (draw only; capped)
  flexLean(y) {
    const F = this.flex; if (!F || this.fireT !== null) return 0;
    const phi = Math.max(0, Math.min(1, y / F.H));
    return Math.max(-0.6, Math.min(0.6, F.u * F.share * 0.35)) * phi;
  }
  _phases() {
    const t = this.t, T = QT[this.qt];
    if (this.qt === 'after') {
      if (this.phase === 'main' && t >= T.mainEnd + 0.3) { this.phase = 'calm'; this.events.push({ type: 'phase', phase: 'calm' }); }
      if (this.phase === 'calm' && t >= T.start) {
        // the aftershock: joints that came close to snapping in the main shock are weaker now
        this.phase = 'aftershock'; const scars = [];
        for (const J of this.joints) {
          if (J.broken) continue;
          const scar = Math.max(0, Math.min(1, (J.peak - 0.35) / 0.65));
          J.weak = 1 - T.fatigue * scar;
          if (scar > 0.25) scars.push({ x: J.x, y: J.y });
        }
        this.events.push({ type: 'phase', phase: 'aftershock', scars });
      }
    }
    if (this.qt === 'ps' && this.phase === 'main' && t >= 0.3 && !this.pAnnounced) { this.pAnnounced = true; this.events.push({ type: 'phase', phase: 'pwave' }); }
    if (this.qt === 'ps' && this.phase === 'main' && t >= T.sAt) { this.phase = 'swave'; this.events.push({ type: 'phase', phase: 'swave' }); }
    if (this.qt === 'pulse') {
      const i = this.pulseN || 0, p = T.pulses[i];
      if (p && t >= p[0]) { this.pulseN = i + 1; this.events.push({ type: 'phase', phase: 'pulse', big: Math.abs(p[2]) }); }
    }
  }

  step(dt) {
    const P = this.P, n = P.substeps, h = dt / n;
    for (let k = 0; k < n; k++) {
      const [tx, ty] = this._quakeTarget(this.t + h);
      const gp = this.ground.getPosition();
      this.ground.setLinearVelocity(new Vec2((tx - gp.x) / h, (ty - gp.y) / h));
      if (this.iso) this._itemForces();
      if (this.damper) this._damperForces(h);
      if (this.flex) this._flexForces(h);
      this.world.step(h, P.velIters, P.posIters);
      this.t += h;
      this._checkJoints(h);
    }
    if (this.state === 'running') this._phases();
    if (this.fireT !== null) this._fire(dt);
    this._checkGoals();
  }

  // ------------------------------------------------ fire
  ignite(sid, u = 0.5) {
    if (this.burn.has(sid) || !this.bodies.has(sid)) return;
    const [ax, ay, bx, by] = this.design.ends(this.design.stick(sid));
    u = Math.max(0, Math.min(1, u));
    this.burn.set(sid, { lo: u, hi: u, len: Math.hypot(bx - ax, by - ay) || L });
  }
  burning() { let n = 0; for (const B of this.burn.values()) if (B.lo > 0 || B.hi < 1) n++; return n; }
  _fire(dt) {
    const P = this.P;
    for (const [sid, B] of this.burn) {
      if (B.lo <= 0 && B.hi >= 1) continue;
      const du = P.burnSpeed * dt / B.len, lo0 = B.lo;
      B.lo = Math.max(0, B.lo - du); B.hi = Math.min(1, B.hi + du);
      if (lo0 > 0 && B.lo === 0) {   // flame reached the match head: it flares up
        const b = this.bodies.get(sid), p = b.getWorldPoint(new Vec2(-B.len / 2, 0));
        this.events.push({ type: 'flare', sid, x: p.x, y: p.y });
      }
    }
    for (const J of this.joints) {
      if (J.broken) continue;
      if (J.melt === undefined) {
        for (const sid of J.sticks) {
          const B = this.burn.get(sid), u = J.u.get(sid);
          if (B && u >= B.lo - 1e-6 && u <= B.hi + 1e-6) { J.melt = this.t + P.meltDelay[0] + Math.random() * (P.meltDelay[1] - P.meltDelay[0]); break; }
        }
      } else if (this.t >= J.melt) this._breakJoint(J, 'melt');
    }
  }
  _breakJoint(J, type) {
    J.broken = true; this.breaks++;
    const p = J.j.getAnchorA();
    this.world.destroyJoint(J.j);
    this.events.push({ type, x: p.x, y: p.y, jx: J.x, jy: J.y, t: this.t });
    if (this.fireT !== null) for (const sid of J.sticks) this.ignite(sid, J.u.get(sid));
  }

  _checkJoints(h) {
    const P = this.P, a = Math.min(1, h / 0.05);
    // once something has failed the glue softens (heat, shaking) so the building comes down instead of sagging
    const fade = this.fireT === null ? 1 : Math.max(P.glueFloor, 1 - (1 - P.glueFloor) * (this.t - this.fireT) / P.glueFade);
    this.stress.clear();
    for (const J of this.joints) {
      if (J.broken) continue;
      const F = J.j.getReactionForce(1 / h).length();
      J.f += (F - J.f) * a;
      const hot = this.fireT !== null && J.sticks.some(sid => this.burn.has(sid));
      const cap = P.breakForce * (J.cfrp ? P.cfrpStrong : 1) * (J.weak || 1);   // what this joint can hold (less after an aftershock scar)
      const s = J.f / cap;
      J.peak = Math.max(J.peak, s);
      let limit = cap * fade * (hot ? 0.5 : 1);
      if (this.opts.steel && this.fireT === null) {
        // 高韌性鋼骨: past the yield point the joint bends (its grip loosens, it soaks up energy) instead of snapping
        if (!J.yielding && s > P.steelYield && this.t > 0.15) { J.yielding = true; J.j.setMaxMotorTorque(P.jointTorque * 0.3); this.events.push({ type: 'yield', x: J.x, y: J.y }); }
        limit = cap * P.steelBreak;
      }
      for (const sid of J.sticks) this.stress.set(sid, Math.max(this.stress.get(sid) || 0, this.opts.steel ? s / P.steelBreak * 1.4 : s));
      if (J.f > limit && this.t > 0.15) {
        const first = this.fireT === null;
        this._breakJoint(J, 'break');
        this._fail('膠點斷了！建築被震壞', null, 'joint');
        if (first) for (const sid of J.sticks) this.ignite(sid, J.u.get(sid));
      }
    }
  }

  _fail(reason, igniteStar, code) {
    if (this.state !== 'running') return;
    this.state = 'lost'; this.reason = reason; this.reasonCode = code; this.endT = this.t;
    if (this.opts.iso) for (const b of this.bodies.values()) for (let f = b.getFixtureList(); f; f = f.getNext()) f.setFilterMaskBits(CAT.TERRAIN);
    this.fireT = this.t;
    if (igniteStar) this.ignite(igniteStar.body.stickId, 0.5);
    this.events.push({ type: 'lost', reason });
  }

  _checkGoals() {
    if (this.state !== 'running') return;
    const go = this.ground.getPosition();
    for (const st of this.stars) {
      const wp = st.body.getWorldPoint(st.local);
      if (Math.hypot(wp.x - go.x - st.home.x, wp.y - go.y - st.home.y) > 0.3 * L) {
        st.lost = true;
        this._fail(this.stars.length > 1 ? '有星星掉下來了！高度沒有守住' : '星星掉下來了！建築倒塌', st, this.stars.length > 1 ? 'stars' : 'star');
      }
    }
    if (this.state === 'running' && this.t >= QUAKE_TIME) { this.state = 'won'; this.endT = this.t; this.events.push({ type: 'won' }); }
  }

  // 結構檢測儀: run the quake on this copy; report each joint's peak load (1 = breaks) and the first failure
  *scan(dt = 1 / 60) {
    let first = null, steps = 0;
    const lim = this.opts.steel ? this.P.steelBreak : 1;
    while (this.t < QUAKE_TIME + 0.1 && !first) {
      this.step(dt); steps++;
      // where it fails, in design coordinates so the marker sits on the joint the player built
      for (const ev of this.events.splice(0)) if (ev.type === 'break' && !first) first = { x: ev.jx, y: ev.jy, t: +this.t.toFixed(1) };
      if (this.state === 'lost' && !first) { const st = this.stars.find(s => s.lost) || this.stars[0]; first = { star: true, x: st ? st.home.x : 0, y: st ? st.home.y : 0, t: +this.t.toFixed(1) }; }
      if (steps % 20 === 0) yield Math.min(1, this.t / QUAKE_TIME);
    }
    const byPoint = new Map();
    for (const J of this.joints) {
      const k = J.x.toFixed(2) + ',' + J.y.toFixed(2), v = byPoint.get(k);
      const s = J.peak / lim;
      if (!v || s > v.s) byPoint.set(k, { x: J.x, y: J.y, s });
    }
    return { first, peaks: [...byPoint.values()], survived: !first };
  }

  runHeadless(maxT = QUAKE_TIME + 0.5, dt = 1 / 60) {
    let maxStress = 0;
    while (this.state === 'running' && this.t < maxT) {
      this.step(dt);
      for (const v of this.stress.values()) maxStress = Math.max(maxStress, v);
    }
    return { state: this.state, reason: this.reason, t: +this.t.toFixed(2), maxStress: +maxStress.toFixed(2), breaks: this.breaks };
  }
}
