// Tools for writing jobs (委託): draw the reference build as lattice art and get the anchors, the stars, the 3-star
// match count, the build itself and a faint outline guide from it; stepped ground for hill levels.
// No imports on purpose: level files load while sim.js is still starting up (sim.js → levels_full.js → …).
export const L = 2.0;                 // match length (m), same as sim.js
export const T = Math.sqrt(3) / 2;    // row height of the triangle lattice (in match lengths)
export const row = n => n * T;

// ---------------------------------------------------------------- lattice art
// One text line per lattice row, top line = highest row; everything before a '|' on a line is ignored (so the art can
// be indented in the source). One character = half a match length:
//   A  anchor (a red pin on the ground)      *  joint with a star       o  joint
//   D  joint where the reference build hangs its 阻尼球 (mass damper)    .  or space: nothing
// On the triangle lattice a joint in row r sits at x = k + r/2, so a character in row r must be in a column c with
// (c + r) even (relative to x0). Every joint is added with two matches to two joints already built (the "Henneberg"
// way the reference levels are built), so the reference uses exactly 2 matches per joint (+ any extra bars).
// opts: { x0: x of column 0, row0: row of the bottom line, bars: [[x1, r1, x2, r2]] extra matches,
//         iso, steel: shop items the reference uses, struts: [[x1, r1, x2, r2]] spring dampers,
//         wraps: [[x1, r1, x2, r2]] matches wrapped in carbon fibre,
//         open: [[x1, r1, x2, r2]] matches the reference leaves out (a spring damper in `struts` takes their place),
//         loads: [{ x, r, kg, kind }] heavy stars (kind: tank, bell, sign, garden, hoop) }
export function art(text, opts = {}) {
  const x0 = opts.x0 || 0, row0 = opts.row0 || 0;
  const lines = text.split('\n').filter(l => l.includes('|')).map(l => l.slice(l.indexOf('|') + 1).replace(/\s+$/, ''));
  if (!lines.length) throw new Error('art: no lines with a | margin');
  const pts = [];   // { x, r, kind }
  lines.forEach((ln, i) => {
    const r = row0 + (lines.length - 1 - i);
    for (let c = 0; c < ln.length; c++) {
      const ch = ln[c];
      if (ch === ' ' || ch === '.') continue;
      if (!'Ao*D'.includes(ch)) throw new Error(`art: unknown character "${ch}" in row ${r}`);
      if ((c + r) % 2 !== 0) throw new Error(`art: "${ch}" at column ${c} is off the lattice in row ${r} (column + row must be even)`);
      pts.push({ x: x0 + c / 2, r, kind: ch });
    }
  });
  const key = (x, r) => `${Math.round(x * 2)},${r}`;
  const at = new Map(pts.map(p => [key(p.x, p.r), p]));
  const anchors = pts.filter(p => p.kind === 'A').sort((a, b) => a.r - b.r || a.x - b.x);
  const stars = pts.filter(p => p.kind === '*').sort((a, b) => b.r - a.r || a.x - b.x);
  const joints = pts.filter(p => p.kind !== 'A');
  // build order: each joint braced by two joints already built (pairs below first, never two opposite neighbours)
  const NB = [[-0.5, -1], [0.5, -1], [-1, 0], [1, 0], [-0.5, 1], [0.5, 1]];
  const PAIRS = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [0, 4], [1, 5], [0, 3], [1, 2], [2, 5], [3, 4]];
  const placed = new Set(anchors.map(p => key(p.x, p.r)));
  const order = [];   // [joint, supportA, supportB]
  let left = joints.slice().sort((a, b) => a.r - b.r || a.x - b.x);
  while (left.length) {
    let progress = false;
    for (const p of left) {
      for (const [i, j] of PAIRS) {
        const a = at.get(key(p.x + NB[i][0], p.r + NB[i][1])), b = at.get(key(p.x + NB[j][0], p.r + NB[j][1]));
        if (a && b && placed.has(key(a.x, a.r)) && placed.has(key(b.x, b.r))) { order.push([p, a, b]); placed.add(key(p.x, p.r)); progress = true; break; }
      }
    }
    left = left.filter(p => !placed.has(key(p.x, p.r)));
    if (!progress) throw new Error('art: these joints cannot be braced from below or the side: ' + left.map(p => `(${p.x}, ${p.r})`).join(' '));
  }
  const bars = opts.bars || [];
  const P = (x, r) => [x * L, r * T * L];
  const same = (u, v) => Math.abs(u.x - v.x) < 1e-6 && u.r === v.r;
  const open = (opts.open || []).map(([x1, r1, x2, r2]) => {
    const e = order.find(([p, a, b]) => [a, b].some(q => (same(p, { x: x1, r: r1 }) && same(q, { x: x2, r: r2 })) || (same(p, { x: x2, r: r2 }) && same(q, { x: x1, r: r1 }))));
    if (!e) throw new Error(`art: no match between (${x1}, ${r1}) and (${x2}, ${r2}) to leave out`);
    return `${x1},${r1},${x2},${r2}`;
  });
  const isOpen = (u, v) => open.some(k => k === `${u.x},${u.r},${v.x},${v.r}` || k === `${v.x},${v.r},${u.x},${u.r}`);
  const build = d => {
    for (const [p, a, b] of order) for (const q of [a, b]) if (!isOpen(q, p)) d.addSegment(...P(q.x, q.r), ...P(p.x, p.r));
    for (const [x1, r1, x2, r2] of bars) d.addSegment(...P(x1, r1), ...P(x2, r2));
    // shop items this reference build relies on (the checker runs the quake with them)
    const nodeAt = (x, r) => { const [px, py] = P(x, r), n = d.nodes.find(n => Math.hypot(n.x - px, n.y - py) < 1e-3); return n && n.id; };
    const items = {};
    const dm = pts.find(p => p.kind === 'D'); if (dm) items.damper = nodeAt(dm.x, dm.r);
    if (opts.iso) items.iso = true;
    if (opts.steel) items.steel = true;
    if (opts.struts) items.struts = opts.struts.map(([x1, r1, x2, r2]) => ({ a: nodeAt(x1, r1), b: nodeAt(x2, r2) }));
    if (opts.wraps) items.wraps = opts.wraps.map(([x1, r1, x2, r2]) => {
      const a = nodeAt(x1, r1), b = nodeAt(x2, r2), s = d.sticks.find(s => (s.a === a && s.b === b) || (s.a === b && s.b === a));
      if (!s) throw new Error(`art: no match between (${x1}, ${r1}) and (${x2}, ${r2}) to wrap`);
      return s.id;
    });
    return Object.keys(items).length ? items : undefined;
  };
  const level = {
    anchors: anchors.map(p => [p.x, row(p.r)]),
    stars: stars.map(p => [p.x, row(p.r)]),
  };
  // heavy stars (屋頂載重), given by position: loads: [{ x, r, kg, kind }]
  if (opts.loads) level.loads = opts.loads.map(l => {
    const i = stars.findIndex(p => Math.abs(p.x - l.x) < 1e-6 && p.r === l.r);
    if (i < 0) throw new Error(`art: load at (${l.x}, ${l.r}) is not on a star`);
    return { star: i, kg: l.kg, kind: l.kind };
  });
  level.sils = outline(pts, level);
  return { level, par: joints.length * 2 + bars.length - open.length, build, joints: joints.length, pts };
}

// ---------------------------------------------------------------- faint outline guide (level.sils)
// The joints grouped into connected shapes; each shape's outline (left edges going up, right edges coming down),
// in the normalised coordinates render3d's _silhouette expects.
export function outline(pts, level) {
  const ax = level.anchors.map(a => a[0]);
  const X0 = Math.min(...ax) - 0.15, X1 = Math.max(...ax) + 0.15, top = Math.max(...level.stars.map(s => s[1])) + 0.25;
  const rows = new Map();
  for (const p of pts) { if (!rows.has(p.r)) rows.set(p.r, []); rows.get(p.r).push(p.x); }
  // runs of joints per row (a gap of more than one match length splits a row)
  const runs = [];
  for (const [r, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let s = xs[0], e = xs[0];
    for (const x of xs.slice(1)) { if (x - e > 1.01) { runs.push({ r, a: s, b: e }); s = x; } e = x; }
    runs.push({ r, a: s, b: e });
  }
  // connect runs of neighbouring rows that overlap
  const parent = runs.map((_, i) => i), find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  runs.forEach((u, i) => runs.forEach((v, j) => { if (j > i && Math.abs(u.r - v.r) === 1 && u.a <= v.b + 0.6 && v.a <= u.b + 0.6) parent[find(i)] = find(j); }));
  const groups = new Map();
  runs.forEach((u, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(u); });
  const nx = x => (x - X0) / (X1 - X0), ny = y => y / top, PAD = 0.32;
  const polys = [];
  for (const g of groups.values()) {
    const byRow = new Map();
    for (const u of g) { const o = byRow.get(u.r); byRow.set(u.r, o ? { a: Math.min(o.a, u.a), b: Math.max(o.b, u.b) } : { a: u.a, b: u.b }); }
    const rs = [...byRow.keys()].sort((a, b) => a - b);
    if (rs.length < 2) continue;
    const leftSide = [], rightSide = [];
    rs.forEach((r, k) => {
      const { a, b } = byRow.get(r), y = row(r) + (k === rs.length - 1 ? 0.22 : 0);
      leftSide.push([nx(a - PAD), ny(y)]); rightSide.push([nx(b + PAD), ny(y)]);
    });
    polys.push([...leftSide, ...rightSide.reverse()]);
  }
  return polys;
}

// ---------------------------------------------------------------- stepped ground
// steps(h0, [x1, h1], [x2, h2], …): ground h0 rows high left of x1, h1 rows from x1 to x2, and so on (heights in lattice
// rows, so anchors on a step sit exactly on a lattice row). Returns one terrain polygon in match lengths.
export function steps(h0, ...cuts) {
  const pts = [[-40, row(h0)]];
  let h = h0;
  for (const [x, nh] of cuts) { pts.push([x, row(h)], [x, row(nh)]); h = nh; }
  pts.push([50, row(h)], [50, -2], [-40, -2]);
  return pts;
}

// ---------------------------------------------------------------- a chapter of jobs
// chapter([[id, art(...), { key, name, en, shindo, qtype, desc, hint, … }], …]) → what levels_private.js merges:
// { keys (the landmark models this chapter adds; a job that reuses an earlier model with `model:` adds none),
//   levels (the job objects, anchors/stars/par/outline from the art), designs (id → build) }
export function chapter(jobs) {
  return {
    keys: jobs.filter(([, , o]) => !o.model).map(([, , o]) => o.key),
    levels: () => jobs.map(([id, a, o]) => ({ id, ...a.level, par: a.par, ...o })),
    designs: () => Object.fromEntries(jobs.map(([id, a]) => [id, a.build])),
  };
}
