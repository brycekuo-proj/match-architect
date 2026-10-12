// 火柴建築師 Match Architect — level data, build-graph (Design) and 2D physics (Sim) on Planck.js
import { World, Vec2, Box, Chain, RevoluteJoint } from 'planck';

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
};

// 震度 ladder: ground amplitude A (m) and frequency f (Hz)
export const SHINDO = {
  '3': { A: 0.07, f: 1.2 }, '4': { A: 0.09, f: 1.3 }, '5弱': { A: 0.11, f: 1.4 }, '5強': { A: 0.13, f: 1.45 },
  '6弱': { A: 0.15, f: 1.5 }, '6強': { A: 0.17, f: 1.55 }, '7': { A: 0.2, f: 1.6 },
};

// ---------------------------------------------------------------- levels (coordinates in match lengths)
const FLAT = [[-40, 0], [50, 0], [50, -2], [-40, -2]];
const T = Math.sqrt(3) / 2;
const row = n => n * T;
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push([i, 0]); return r; };
const BASE = [  // each entry is one commission (委託)
  {
    id: 1, key: 'triangle', name: '三角形', tag: '教學', shindo: '3', par: 3,
    desc: '搭一個三角形，頂點碰到星星。地震 10 秒不倒就過關！3 支火柴就做得到。',
    hint: '從紅色錨點拖出火柴。三角形是最穩的形狀。',
    anchors: [[0, 0], [1, 0]], stars: [[0.5, T]],
  },
  {
    id: 2, key: 'square', name: '四方形', tag: '教學', shindo: '4', par: 5,
    desc: '搭一個四方形撐住星星。只有 4 邊的四方形會晃倒，要加一支斜撐！',
    hint: '在柱子中段按住拖曳，可以把火柴黏在另一支火柴身上做斜撐。',
    anchors: [[0, 0], [1, 0]], stars: [[0.5, 1]],
  },
  {
    id: 3, key: 'twofloor', name: '兩層樓', tag: '教學', shindo: '4', par: 9,
    desc: '蓋兩層四方形，屋頂撐住星星，撐過 10 秒地震！',
    hint: '每一層都需要自己的斜撐。',
    anchors: [[0, 0], [1, 0]], stars: [[0.5, 2]],
  },
  {
    id: 4, key: 'sphinx', name: '獅身人面像', place: '埃及 · 吉薩', real: '高約 20 公尺，身長約 73 公尺', shindo: '4', par: 8, biome: 'sand',
    desc: '又矮又長的獅子。頭頂和背上各有一顆星星，兩顆都要撐住。',
    hint: '一排三角形就能撐出長長的身體。',
    anchors: range(0, 3), stars: [[1, row(2)], [2.5, row(1)]],
    sil: [[0, 0], [1, 0], [1, .27], [.9, .45], [.5, .45], [.46, .72], [.44, .92], [.37, 1], [.28, .95], [.25, .72], [.19, .57], [.06, .45], [0, .22]],
  },
  {
    id: 5, key: 'pyramid', name: '古夫金字塔', place: '埃及 · 吉薩', real: '原高約 146 公尺', shindo: '5弱', par: 12, biome: 'sand',
    desc: '四千五百年前的金字塔。塔尖要碰到星星。',
    hint: '每個新的接點都要有兩支火柴從不同方向撐住。',
    anchors: range(0, 3), stars: [[1.5, row(3)]],
    sil: [[0, 0], [1, 0], [.5, 1]],
  },
  {
    id: 6, key: 'pisa', name: '比薩斜塔', place: '義大利 · 比薩', real: '高約 56 公尺，傾斜約 4 度', shindo: '5強', par: 10,
    desc: '星星在右上方，塔要斜著蓋。重心歪一邊，地震時最容易倒。',
    hint: '斜著往上疊三角形，像一條斜斜的帶子。',
    anchors: range(0, 2), stars: [[1.5, row(3)]],
    sil: [[.06, 0], [.4, 0], [.95, .9], [.95, 1], [.66, 1], [.62, .9]],
  },
  {
    id: 7, key: 'eiffel', name: '艾菲爾鐵塔', place: '法國 · 巴黎', real: '高約 330 公尺', shindo: '6弱', par: 20,
    desc: '四隻腳張開的鐵塔，中間是拱門。塔尖要碰到星星。',
    hint: '兩邊各蓋一隻斜腳，在上面合起來。',
    anchors: [[0, 0], [1, 0], [3, 0], [4, 0]], stars: [[2, row(4)]],
    sil: [[0, 0], [.25, 0], [.33, .17], [.5, .24], [.67, .17], [.75, 0], [1, 0], [.62, .55], [.55, .82], [.515, 1], [.485, 1], [.45, .82], [.38, .55]],
  },
  {
    id: 8, key: 'tokyotower', name: '東京鐵塔', place: '日本 · 東京', real: '高 333 公尺', shindo: '6強', par: 28,
    desc: '比艾菲爾更高更細的紅白鐵塔，地震也更強了。',
    hint: '下半段張開腳，上半段用一條直直往上的三角形柱子。',
    anchors: [[0, 0], [1, 0], [3, 0], [4, 0]], stars: [[2, row(6)]],
    sil: [[0, 0], [.27, 0], [.5, .14], [.73, 0], [1, 0], [.66, .42], [.6, .66], [.56, .78], [.53, .9], [.51, 1], [.49, 1], [.47, .9], [.44, .78], [.4, .66], [.34, .42]],
  },
  {
    id: 9, key: 'pearl', name: '東方明珠', place: '中國 · 上海', real: '高約 468 公尺', shindo: '6強', par: 28,
    desc: '一根高柱串著兩顆大珠子。上下兩顆星星都要撐住。',
    hint: '先蓋寬寬的底座，再往上接一條三角形柱子。',
    anchors: range(0, 3), stars: [[1.5, row(3)], [1.5, row(7)]],
    sil: [[.02, 0], [.22, 0], [.42, .22], [.58, .22], [.78, 0], [.98, 0], [.6, .32], [.58, .9], [.52, 1], [.48, 1], [.42, .9], [.4, .32]],
    circles: [[1.5, row(3), 0.7], [1.5, row(7) - 0.1, 0.45]],
  },
  {
    id: 10, key: 'taipei101', name: '台北 101', place: '台灣 · 台北', real: '高 508 公尺', shindo: '6強', par: 50,
    desc: '像竹節一樣一節一節往上長。底座更寬了，地震也更大。',
    hint: '底座的三角形疊得越高，上面的塔越不容易被晃斷。',
    anchors: range(0, 6), stars: [[3, row(8)]],
    sil: [[.32, 0], [.68, 0], [.65, .14], [.62, .14], [.64, .24], [.61, .24], [.63, .34], [.6, .34], [.62, .44], [.59, .44], [.61, .54], [.58, .54], [.6, .64], [.57, .64], [.59, .74], [.56, .74], [.55, .86], [.52, .86], [.5, 1], [.48, .86], [.45, .86], [.44, .74], [.41, .74], [.43, .64], [.4, .64], [.42, .54], [.39, .54], [.41, .44], [.38, .44], [.4, .34], [.37, .34], [.39, .24], [.36, .24], [.38, .14], [.35, .14]],
  },
  {
    id: 11, key: 'skytree', name: '東京晴空塔', place: '日本 · 東京', real: '高 634 公尺', shindo: '6強', par: 64,
    desc: '世界最高的電波塔，又細又長。',
    hint: '底部用很多層三角形撐開，越往上越窄。',
    anchors: range(0, 7), stars: [[3.5, row(9)]],
    sil: [[.1, 0], [.9, 0], [.6, .35], [.57, .6], [.64, .63], [.64, .67], [.56, .7], [.54, .82], [.58, .84], [.54, .86], [.51, 1], [.49, 1], [.46, .86], [.42, .84], [.46, .82], [.44, .7], [.36, .67], [.36, .63], [.43, .6], [.4, .35]],
  },
  {
    id: 12, key: 'burj', name: '杜拜塔', place: '阿聯 · 杜拜', real: '高約 828 公尺，世界最高', shindo: '7', par: 80, biome: 'sand',
    desc: '世界最高的大樓，像階梯一樣一層層往上收。第一次遇到震度 7！',
    hint: '高塔要有很寬很高的底座，地震時才站得穩。',
    anchors: range(0, 8), stars: [[4, row(10)]],
    sil: [[.1, 0], [.9, 0], [.72, .12], [.66, .13], [.64, .3], [.6, .31], [.58, .5], [.55, .51], [.54, .7], [.52, .71], [.505, 1], [.495, 1], [.48, .71], [.46, .7], [.45, .51], [.42, .5], [.4, .31], [.36, .3], [.34, .13], [.28, .12]],
  },
  {
    id: 13, key: 'sagrada', name: '聖家堂', place: '西班牙 · 巴塞隆納', real: '最高的耶穌基督塔約 172.5 公尺', shindo: '7', par: 108,
    desc: '最後一關！高第的聖家堂有一整排尖塔。五顆星星都要撐住，撐過震度 7。',
    hint: '先蓋最寬的底座，再從上面長出一根一根尖塔。',
    anchors: range(0, 10), stars: [[5, row(10)], [3.5, row(7)], [6.5, row(7)], [2.5, row(5)], [7.5, row(5)]],
    spires: true,
  },
];
export const LEVELS = BASE.map(o => {
  const xs = [...o.anchors.map(a => a[0]), ...o.stars.map(s => s[0])];
  const top = Math.max(...o.stars.map(s => s[1]));
  const lv = {
    terrain: [FLAT], ...o, budget: o.par * 2,   // match quota = 2× the 3-star target
    quake: SHINDO[o.shindo],
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
    if (this.used() >= this.limit()) { res.ok = false; res.reason = `這關最多 ${this.limit()} 支火柴`; }
    if (end.kind === 'node' && startNode !== null &&
        this.sticks.some(s => (s.a === startNode && s.b === end.id) || (s.b === startNode && s.a === end.id))) {
      res.ok = false; res.reason = '這裡已經有火柴了';
    }
    for (let k = 1; k < 10 && res.ok; k++) {
      const t = k / 10;
      if (this.insideTerrain(sx + (end.x - sx) * t, sy + (end.y - sy) * t)) { res.ok = false; res.reason = '不能穿過地面'; }
    }
    if (res.ok && end.kind !== 'node' && this.insideTerrain(end.x, end.y)) { res.ok = false; res.reason = '不能插進地面'; }
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
    if (!this.used()) return { ok: false, reason: '先放幾支火柴吧' };
    const r = this.starsReached(), miss = r.filter(v => !v).length;
    if (miss) return { ok: false, reason: r.length > 1 ? `還有 ${miss} 顆星星沒碰到` : '結構還沒碰到星星' };
    return { ok: true };
  }
}

// ---------------------------------------------------------------- Sim: physics run
export class Sim {
  constructor(level, design, P = PARAMS) {
    this.level = level; this.design = design; this.P = P;
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
      b.createFixture(new Box(len / 2, TH / 2), { density: P.stickDensity, friction: 0.8, filterCategoryBits: CAT.STRUCT, filterMaskBits: CAT.TERRAIN });
      b.stickId = s.id;
      this.bodies.set(s.id, b);
    }
    this.joints = [];
    const pin = (ba, bb, x, y, nodeId) => {
      const j = w.createJoint(new RevoluteJoint({ enableMotor: true, motorSpeed: 0, maxMotorTorque: P.jointTorque, collideConnected: false }, ba, bb, new Vec2(x, y)));
      const sticks = [ba.stickId, bb.stickId].filter(v => v !== undefined);
      const u = new Map();   // where along each match (0 = end a, 1 = end b) this glue sits
      for (const sid of sticks) { const [ax, ay, bx, by] = design.ends(design.stick(sid)); u.set(sid, segDist(x, y, ax, ay, bx, by).t); }
      this.joints.push({ j, nodeId, sticks, u, f: 0, broken: false, x, y });
    };
    for (const n of design.nodes) {
      const inc = design.sticks.filter(s => s.a === n.id || s.b === n.id);
      if (n.kind === 'anchor') { for (const s of inc) pin(g, this.bodies.get(s.id), n.x, n.y, n.id); continue; }
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
  }

  quakeEnv(t) {
    const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    return sm(t / 0.8) * sm((QUAKE_TIME - t) / 0.8);
  }
  _quakeTarget(t) {
    const q = this.level.quake;
    let env = this.quakeEnv(t);
    if (this.fireT !== null) env *= Math.max(0, 1 - (t - this.fireT) / 3);   // after a failure the shaking dies down; the fire takes over
    const w = 2 * Math.PI * q.f;
    // main sway plus a little irregular wobble; peak acceleration ≈ 1.4·A·ω²
    const x = q.A * env * (Math.sin(w * t) + 0.25 * Math.sin(w * 1.62 * t + 1.3));
    const y = q.A * 0.1 * env * Math.sin(w * 1.31 * t + 0.4);
    return [x, y];
  }

  step(dt) {
    const P = this.P, n = P.substeps, h = dt / n;
    for (let k = 0; k < n; k++) {
      const [tx, ty] = this._quakeTarget(this.t + h);
      const gp = this.ground.getPosition();
      this.ground.setLinearVelocity(new Vec2((tx - gp.x) / h, (ty - gp.y) / h));
      this.world.step(h, P.velIters, P.posIters);
      this.t += h;
      this._checkJoints(h);
    }
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
    this.events.push({ type, x: p.x, y: p.y, t: this.t });
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
      const limit = P.breakForce * fade * (hot ? 0.5 : 1);
      const s = J.f / P.breakForce;
      for (const sid of J.sticks) this.stress.set(sid, Math.max(this.stress.get(sid) || 0, s));
      if (J.f > limit && this.t > 0.15) {
        const first = this.fireT === null;
        this._breakJoint(J, 'break');
        this._fail('膠點斷了！建築被震壞');
        if (first) for (const sid of J.sticks) this.ignite(sid, J.u.get(sid));
      }
    }
  }

  _fail(reason, igniteStar) {
    if (this.state !== 'running') return;
    this.state = 'lost'; this.reason = reason; this.endT = this.t;
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
        this._fail(this.stars.length > 1 ? '有星星掉下來了！高度沒有守住' : '星星掉下來了！建築倒塌', st);
      }
    }
    if (this.state === 'running' && this.t >= QUAKE_TIME) { this.state = 'won'; this.endT = this.t; this.events.push({ type: 'won' }); }
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
