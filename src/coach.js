// Hands-on tutorial for the first jobs: a finger shows where to press and drag, a dashed outline shows where the
// match goes, a ring marks the target, and a bubble says what to do. It follows the design, so any order works.
import { L } from './sim.js';
import { t } from './i18n.js';

const T = Math.sqrt(3) / 2, BX = Math.sqrt(1 - 0.75 * 0.75);
// coordinates in match lengths; `brace` steps are done by any match glued onto another match's body
export const GUIDES = {
  1: [
    { edge: [[0, 0], [1, 0]], tip: 'g1.base' },
    { edge: [[0, 0], [0.5, T]], tip: 'g1.left' },
    { edge: [[1, 0], [0.5, T]], tip: 'g1.right' },
  ],
  2: [
    { edge: [[0, 0], [1, 0]], tip: 'g2.base' },
    { edge: [[0, 0], [0, 1]], tip: 'g2.post' },
    { edge: [[1, 0], [1, 1]], tip: 'g2.post2' },
    { edge: [[0, 1], [1, 1]], tip: 'g2.top' },
    { edge: [[0, 0.25], [BX, 1]], brace: true, tip: 'g2.brace' },
  ],
};

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

export class Coach {
  constructor(root, tip) {
    this.root = root; this.tip = tip; this.steps = null; this.idx = -1; this.mode = null; this.t0 = performance.now();
    const svg = this.svg = el('svg', { class: 'coach-svg', width: '100%', height: '100%' }, root);
    this.glow = el('line', { class: 'c-glow' }, svg);
    this.path = el('line', { class: 'c-path' }, svg);
    this.trail = el('line', { class: 'c-trail' }, svg);
    this.ringA = el('circle', { class: 'c-ring a', r: 22 }, svg);
    this.ringB = el('circle', { class: 'c-ring b', r: 22 }, svg);
    this.ripple = el('circle', { class: 'c-ripple', r: 10 }, svg);
    // pointing hand, fingertip at (0,0)
    this.hand = el('g', { class: 'c-hand' }, svg);
    el('path', { d: 'M0 2c0-3 2-5 5-5s5 2 5 5v16c1-2 3-3 5-3 3 0 5 2 5 4 1-1 2-2 4-2 3 0 5 2 5 5 1-1 2-1 3-1 3 0 5 2 5 5v11c0 11-8 19-19 19h-5c-7 0-12-3-15-9l-8-15c-1-3 0-6 3-7 2-1 5 0 6 2l2 4z', fill: '#fffaf0', stroke: '#2a1a12', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, this.hand);
    el('path', { d: 'M15 19v9M24 21v8M33 25v6', stroke: '#2a1a12', 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none', opacity: 0.45 }, this.hand);
    this.tipText = tip.querySelector('.ctext'); this.tipStep = tip.querySelector('.cstep');
  }
  start(levelId) { this.steps = GUIDES[levelId] || null; this.idx = -1; this.mode = null; this.niceUntil = 0; this.lastDone = 0; return !!this.steps; }
  stop() { this.steps = null; this.hide(); }
  get active() { return !!this.steps; }
  hide() { this.root.hidden = true; this.tip.hidden = true; document.body.classList.remove('coaching'); this._pulse(null); }

  // which steps are built; any match that is on none of them is "off the plan"
  _status(design) {
    const near = (n, p) => Math.hypot(n.x - p[0] * L, n.y - p[1] * L) < 0.08 * L;
    const isEdge = (s, e) => { const a = design.node(s.a), b = design.node(s.b); return (near(a, e[0]) && near(b, e[1])) || (near(a, e[1]) && near(b, e[0])); };
    const isBrace = s => design.node(s.a).kind === 'glue' || design.node(s.b).kind === 'glue';
    const done = this.steps.map(st => design.sticks.some(s => isEdge(s, st.edge) || (st.brace && isBrace(s))));
    const extra = design.sticks.some(s => !this.steps.some(st => isEdge(s, st.edge) || (st.brace && isBrace(s))));
    return { done, extra };
  }
  _pulse(id) {
    if (this.pulsing === id) return;
    if (this.pulsing) { const e = document.getElementById(this.pulsing); if (e) e.classList.remove('coach-pulse'); }
    this.pulsing = id;
    if (id) { const e = document.getElementById(id); if (e) e.classList.add('coach-pulse'); }
  }
  _say(key, n, total) {
    if (this.said !== key) { this.said = key; this.tipText.textContent = t(key); this.tip.classList.remove('pop'); void this.tip.offsetWidth; this.tip.classList.add('pop'); }
    this.tipStep.textContent = total ? `${n} / ${total}` : '';
  }

  // called every frame; returns true when a step was just completed (for a sound)
  update(state, design, view, dragging, canStart) {
    if (!this.steps || !(state === 'build' || state === 'sim')) { this.hide(); return false; }
    const now = performance.now();
    const { done, extra } = this._status(design);
    const nDone = done.filter(Boolean).length, total = this.steps.length + 1;
    let justDone = false;
    if (nDone > this.lastDone) { justDone = true; this.niceUntil = now + 900; }
    this.lastDone = nDone;
    this.root.hidden = false; this.tip.hidden = false; document.body.classList.add('coaching');
    const showLine = on => { for (const e of [this.glow, this.path, this.trail, this.ringA, this.ringB, this.ripple, this.hand]) e.style.display = on ? '' : 'none'; };
    if (state === 'sim') { showLine(false); this._pulse(null); this._say('g.quake', total, total); return justDone; }
    if (extra) {   // something off the plan: point at Undo
      showLine(false); this._pulse('btnUndo'); this._say('g.undo'); this._handOn(document.getElementById('btnUndo'), now); return justDone;
    }
    const next = done.indexOf(false);
    if (next < 0) {   // all built: press the quake button
      showLine(false); this._pulse(canStart ? 'btnPlay' : null);
      this._say(now < this.niceUntil ? 'g.nice' : 'g.go', total, total);
      if (now >= this.niceUntil && canStart) this._handOn(document.getElementById('btnPlay'), now);
      return justDone;
    }
    this._pulse(null);
    this._say(now < this.niceUntil ? 'g.nice' : this.steps[next].tip, next + 1, total);
    const [p, q] = this.steps[next].edge;
    const A = view.worldToScreen(p[0] * L, p[1] * L), B = view.worldToScreen(q[0] * L, q[1] * L);
    const r = this.root.getBoundingClientRect(); A.x -= r.left; A.y -= r.top; B.x -= r.left; B.y -= r.top;
    showLine(true);
    for (const ln of [this.glow, this.path]) { ln.setAttribute('x1', A.x); ln.setAttribute('y1', A.y); ln.setAttribute('x2', B.x); ln.setAttribute('y2', B.y); }
    this.ringA.setAttribute('cx', A.x); this.ringA.setAttribute('cy', A.y);
    this.ringB.setAttribute('cx', B.x); this.ringB.setAttribute('cy', B.y);
    if (dragging || now < this.niceUntil) {   // while the player drags, only keep the target
      for (const e of [this.trail, this.hand, this.ripple, this.ringA]) e.style.display = 'none';
      return justDone;
    }
    // demo loop: press at A, slide to B drawing the match, release, fade
    const D = 2400, u = ((now - this.t0) % D) / D;
    let k, alpha = 1, press = 0;
    if (u < 0.14) { k = 0; press = u / 0.14; alpha = Math.min(1, u / 0.06); }
    else if (u < 0.66) { k = ease((u - 0.14) / 0.52); press = 1; }
    else if (u < 0.78) { k = 1; press = 1 - (u - 0.66) / 0.12; }
    else { k = 1; alpha = 1 - (u - 0.78) / 0.22; }
    const hx = A.x + (B.x - A.x) * k, hy = A.y + (B.y - A.y) * k;
    this.trail.setAttribute('x1', A.x); this.trail.setAttribute('y1', A.y); this.trail.setAttribute('x2', hx); this.trail.setAttribute('y2', hy);
    this.trail.style.opacity = u < 0.14 ? 0 : alpha;
    this.hand.setAttribute('transform', `translate(${hx} ${hy}) scale(${1 - 0.12 * press})`);
    this.hand.style.opacity = alpha;
    const rip = u < 0.2 ? u / 0.2 : (u > 0.66 && u < 0.86 ? (u - 0.66) / 0.2 : -1);
    if (rip >= 0) { this.ripple.style.display = ''; this.ripple.setAttribute('cx', u < 0.2 ? A.x : B.x); this.ripple.setAttribute('cy', u < 0.2 ? A.y : B.y); this.ripple.setAttribute('r', 8 + rip * 26); this.ripple.style.opacity = 1 - rip; }
    else this.ripple.style.display = 'none';
    return justDone;
  }
  // tap demo on a button
  _handOn(btn, now) {
    if (!btn) return;
    const b = btn.getBoundingClientRect(), r = this.root.getBoundingClientRect();
    const low = b.top + b.height / 2 > r.top + r.height * 0.6;   // near the bottom: point down from above so the hand stays on screen
    const x = b.left + b.width * 0.5 - r.left, y = (low ? b.top + b.height * 0.3 : b.top + b.height * 0.55) - r.top;
    const u = ((now - this.t0) % 1400) / 1400, press = u < 0.3 ? u / 0.3 : u < 0.5 ? 1 - (u - 0.3) / 0.2 : 0;
    this.hand.style.display = ''; this.hand.style.opacity = 1;
    this.hand.setAttribute('transform', low
      ? `translate(${x - 6} ${y - 8 + press * 6}) rotate(180) scale(${1 - 0.1 * press})`
      : `translate(${x + 6} ${y + 10 - press * 6}) scale(${1 - 0.1 * press})`);
    this.ripple.style.display = press > 0 ? '' : 'none';
    this.ripple.setAttribute('cx', x); this.ripple.setAttribute('cy', y); this.ripple.setAttribute('r', 10 + press * 22); this.ripple.style.opacity = 1 - press * 0.6;
  }
}
