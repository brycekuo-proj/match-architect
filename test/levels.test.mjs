// Every level: the reference build must reach all stars, be buildable (no match through the ground), use exactly its
// 3-star count, and survive its own 震度 and quake type (with the shop items it relies on, if any); weak builds must fail.
// node test/levels.test.mjs [id]            (web jobs + Skytree)      MAXSHINDO=1 also prints the strongest 震度 it survives
// node --import ./test/use-private.mjs test/levels.test.mjs [id|from-to]   (all 100 jobs, with the Mac-only private/)
import { LEVELS, Design, Sim, L, PARAMS, SHINDO } from '../src/sim.js';
import { REFERENCE, LatticeBuilder } from '../src/designs.js';

const T = Math.sqrt(3) / 2;
const arg = process.argv[2] || '';
const [lo, hi] = arg.includes('-') ? arg.split('-').map(Number) : arg ? [+arg, +arg] : [-Infinity, Infinity];
let bad = 0;
const order = ['3', '4', '5弱', '5強', '6弱', '6強', '7'];

function run(level, build, P = PARAMS, noItems = false) {
  const d = new Design(level); const items = build(d) || {};
  const cs = d.canStart();
  const r = new Sim(level, d, P, noItems ? {} : items).runHeadless();
  return { d, cs, r, items };
}
// can a player place every match? (no match may pass through the ground)
function placeable(d) {
  for (const s of d.sticks) {
    const [x1, y1, x2, y2] = d.ends(s);
    for (let k = 1; k < 20; k++) { const u = k / 20; if (d.insideTerrain(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u)) return `match ${s.id} goes through the ground`; }
    if (Math.abs(Math.hypot(x2 - x1, y2 - y1) - L) > 1e-3) return `match ${s.id} is not one match long`;
  }
  return '';
}
// how strong a quake does this build survive (same quake type)?
function maxShindo(level, build) {
  let best = '-';
  for (const k of order) {
    const lv = { ...level, quake: { ...level.quake, ...SHINDO[k] } };
    const { r } = run(lv, build);
    if (r.state !== 'won') break;
    best = k;
  }
  return best;
}

for (const lv of LEVELS) {
  if (lv.id < lo || lv.id > hi) continue;
  const t0 = Date.now();
  const ref = REFERENCE[lv.id];
  if (!ref) { bad++; console.log(`FAIL L${lv.id} ${lv.key}: no reference build`); continue; }
  const { d, cs, r, items } = run(lv, ref);
  const where = placeable(d);
  let ok = cs.ok && r.state === 'won' && d.used() === lv.par && lv.budget === lv.par * 2 && !where;
  let note = '';
  // a job that hands you an item (lv.needsItem) must really need it: the same build without it falls
  if (lv.needsItem) { const w = run(lv, ref, PARAMS, true).r; note = ` | without its item: ${w.state}`; if (w.state === 'won') ok = false; }
  if (!ok) bad++;
  const ms = process.env.MAXSHINDO ? ` survives≤震度${maxShindo(lv, ref)}` : '';
  const qt = lv.quake.type === 'mix' ? 'mix:' + lv.quake.mix.join('+') : lv.quake.type;
  console.log(`${ok ? 'PASS' : 'FAIL'} L${String(lv.id).padStart(3)} ${lv.key.padEnd(16)} 震度${lv.shindo.padEnd(3)} ${qt.padEnd(10)} sticks=${String(d.used()).padStart(3)} par=${String(lv.par).padStart(3)}${Object.keys(items).length ? ' items=' + Object.keys(items).join(',') : ''} canStart=${cs.ok ? 'y' : cs.reason}${where ? ' ' + where : ''} -> ${r.state}@${r.t}s maxStress=${r.maxStress}${ms}${note} ${r.reason} (${Date.now() - t0}ms)`);
}

// weak builds that must fail (only for the jobs that exist in this edition)
const weak = {
  'L2 unbraced square': [2, d => { const s = (a, b, c, e) => d.addSegment(a * L, b * L, c * L, e * L); s(0, 0, 1, 0); s(0, 0, 0, 1); s(1, 0, 1, 1); s(0, 1, 1, 1); s(1, 1, 2, 1); }],
  'L5 thin pyramid tower': [5, d => { const b = new LatticeBuilder(d); b.pyramid(1, 1, 1); b.node(1, 2, [1.5, 1], [1, 0]); }],
  'L8 narrow Tokyo tower': [8, d => { const b = new LatticeBuilder(d); b.node(0.5, 1, [0, 0], [1, 0]); b.column([0, 0], [1, 0], 2, 6); }],
  'L10 narrow 101 tower': [10, d => { const b = new LatticeBuilder(d); b.pyramid(1, 4, 2); b.column([2, 2], [3, 2], 3, 8); }],
};
for (const [name, [id, build]] of Object.entries(weak)) {
  const lv = LEVELS.find(l => l.id === id);
  if (!lv || id < lo || id > hi) continue;
  const { d, cs, r } = run(lv, build);
  const ok = !cs.ok || r.state === 'lost';
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} weak: ${name.padEnd(24)} sticks=${d.used()} canStart=${cs.ok ? 'y' : cs.reason} -> ${r.state} ${r.reason}`);
}
console.log(bad ? `${bad} unexpected` : 'all as expected');
process.exit(bad ? 1 : 0);
