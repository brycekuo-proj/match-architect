// Reference builds on the triangular lattice (x in match lengths, r = row; y = r·√3/2).
// Used by the tests (every level must be solvable) and by the title-screen demo.
import { L } from './sim.js';
import { fullDesigns } from './levels_full.js';

const T = Math.sqrt(3) / 2;
const key = (x, r) => `${Math.round(x * 2)}:${r}`;

export class LatticeBuilder {
  constructor(design) {
    this.d = design;
    this.have = new Set(design.level.anchors.map(([x, y]) => key(x, Math.round(y / T))));
    this.count = 0;
  }
  pt(x, r) { return [x * L, r * T * L]; }
  has(x, r) { return this.have.has(key(x, r)); }
  // add node (x,r) braced by two existing nodes
  node(x, r, a, b) {
    if (this.has(x, r)) return;
    const [px, py] = this.pt(x, r);
    this.d.addSegment(...this.pt(...a), px, py);
    this.d.addSegment(...this.pt(...b), px, py);
    this.have.add(key(x, r)); this.count += 2;
  }
  bar(a, b) { this.d.addSegment(...this.pt(...a), ...this.pt(...b)); this.count++; }
  // triangles over anchors x0..x0+n, `rows` rows high
  pyramid(x0, n, rows) {
    for (let r = 1; r <= rows; r++)
      for (let i = 0; i <= n - r; i++) {
        const x = x0 + r / 2 + i;
        this.node(x, r, [x - 0.5, r - 1], [x + 0.5, r - 1]);
      }
  }
  // constant-width triangulated band: row r holds nodes x0..x0+w; climbs to row tr, drifting toward tx
  band(x0, w, r, tr, tx) {
    let flip = false;
    while (r < tr) {
      const inner = [];
      for (let i = 0; i < w; i++) { const x = x0 + i + 0.5; this.node(x, r + 1, [x - 0.5, r], [x + 0.5, r]); inner.push(x); }
      if (r + 1 >= tr) return;
      const mid = x0 + w / 2;
      const goRight = tx > mid + 0.01 ? true : tx < mid - 0.01 ? false : (flip = !flip);
      if (goRight) { this.node(x0 + w + 0.5, r + 1, [x0 + w, r], [x0 + w - 0.5, r + 1]); x0 = x0 + 0.5; }
      else { this.node(x0 - 0.5, r + 1, [x0, r], [x0 + 0.5, r + 1]); x0 = x0 - 0.5; }
      r++;
    }
  }
  // zig-zag triangle column from a pair of adjacent nodes in row r up to (tx, tr)
  column(left, right, tx, tr) {
    let [p, q] = [left, right];
    let flip = false;
    while (true) {
      const r = p[1] + 1, ax = (p[0] + q[0]) / 2;
      this.node(ax, r, p, q);
      if (r >= tr) return;
      const goRight = tx > ax || (tx === ax && (flip = !flip));
      const sx = goRight ? ax + 1 : ax - 1;
      const base = goRight ? (p[0] > q[0] ? p : q) : (p[0] < q[0] ? p : q);
      this.node(sx, r, base, [ax, r]);
      [p, q] = goRight ? [[ax, r], [sx, r]] : [[sx, r], [ax, r]];
    }
  }
}

const sq = (d, pts) => { for (const [a, b, c, e] of pts) d.addSegment(a * L, b * L, c * L, e * L); };
const BX = Math.sqrt(1 - 0.75 * 0.75);

export const REFERENCE = {
  1: d => sq(d, [[0, 0, 1, 0], [0, 0, 0.5, T], [1, 0, 0.5, T]]),
  2: d => sq(d, [[0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 1], [0, 0.25, BX, 1]]),
  3: d => sq(d, [[0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 1, 1], [0, 1, 1, 1], [0, 1, 0, 2], [1, 1, 1, 2], [0, 2, 1, 2], [0, 0.25, BX, 1], [0, 1.25, BX, 2]]),
  4: d => { const b = new LatticeBuilder(d); b.pyramid(0, 3, 1); b.node(1, 2, [0.5, 1], [1.5, 1]); },
  5: d => { const b = new LatticeBuilder(d); b.pyramid(0, 3, 3); },
  6: d => { const b = new LatticeBuilder(d); b.pyramid(0, 2, 2); b.node(2, 2, [1.5, 1], [1, 2]); b.node(1.5, 3, [1, 2], [2, 2]); },
  7: d => { const b = new LatticeBuilder(d); eiffelBase(b); b.node(2, 4, [1.5, 3], [2.5, 3]); },
  8: d => { const b = new LatticeBuilder(d); eiffelBase(b); b.column([1.5, 3], [2.5, 3], 2, 6); },
  9: d => { const b = new LatticeBuilder(d); b.pyramid(0, 3, 3); b.node(2.5, 3, [2, 2], [1.5, 3]); b.column([1.5, 3], [2.5, 3], 1.5, 7); },
  10: d => { const b = new LatticeBuilder(d); b.pyramid(0, 6, 5); b.column([2.5, 5], [3.5, 5], 3, 8); },
};
Object.assign(REFERENCE, fullDesigns(LatticeBuilder));   // 完整版 jobs (none in the web build)
// Eiffel-style legs on anchors 0,1,3,4 meeting in row 3
function eiffelBase(b) {
  b.node(0.5, 1, [0, 0], [1, 0]); b.node(3.5, 1, [3, 0], [4, 0]);
  b.node(1.5, 1, [1, 0], [0.5, 1]); b.node(2.5, 1, [3, 0], [3.5, 1]);
  b.node(1, 2, [0.5, 1], [1.5, 1]); b.node(2, 2, [1.5, 1], [2.5, 1]); b.node(3, 2, [2.5, 1], [3.5, 1]);
  b.node(1.5, 3, [1, 2], [2, 2]); b.node(2.5, 3, [2, 2], [3, 2]);
}
