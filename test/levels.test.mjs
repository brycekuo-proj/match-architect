// Every level: the reference build must reach all stars and survive its 震度; weak builds must fail.
import { LEVELS, Design, Sim, L, PARAMS, SHINDO } from '../src/sim.js';
import { REFERENCE, LatticeBuilder } from '../src/designs.js';

const T = Math.sqrt(3) / 2;
const only = process.argv[2] ? +process.argv[2] : null;
let bad = 0;
const order = ['3', '4', '5弱', '5強', '6弱', '6強', '7'];

function run(level, build, P = PARAMS) {
  const d = new Design(level); build(d);
  const cs = d.canStart();
  const r = new Sim(level, d, P).runHeadless();
  return { d, cs, r };
}
// how strong a quake does this build survive?
function maxShindo(level, build) {
  let best = '-';
  for (const k of order) {
    const lv = { ...level, quake: SHINDO[k] };
    const { r } = run(lv, build);
    if (r.state !== 'won') break;
    best = k;
  }
  return best;
}

for (const lv of LEVELS) {
  if (only && lv.id !== only) continue;
  const t0 = Date.now();
  const { d, cs, r } = run(lv, REFERENCE[lv.id]);
  const ok = cs.ok && r.state === 'won' && d.used() <= lv.par && lv.budget === lv.par * 2;
  if (!ok) bad++;
  const ms = maxShindo(lv, REFERENCE[lv.id]);
  console.log(`${ok ? 'PASS' : 'FAIL'} L${String(lv.id).padStart(2)} ${lv.name.padEnd(6, '　')} 震度${lv.shindo.padEnd(3)} sticks=${String(d.used()).padStart(2)} par=${lv.par} quota=${lv.budget} canStart=${cs.ok ? 'y' : cs.reason} -> ${r.state} maxStress=${r.maxStress} survives≤震度${ms} ${r.reason} (${Date.now() - t0}ms)`);
}

// weak builds that must fail
const weak = {
  'L2 unbraced square': [2, d => { const s = (a, b, c, e) => d.addSegment(a * L, b * L, c * L, e * L); s(0, 0, 1, 0); s(0, 0, 0, 1); s(1, 0, 1, 1); s(0, 1, 1, 1); s(1, 1, 2, 1); }],
  'L5 thin pyramid tower': [5, d => { const b = new LatticeBuilder(d); b.pyramid(1, 1, 1); b.node(1, 2, [1.5, 1], [1, 0]); }],
  'L8 narrow Tokyo tower': [8, d => { const b = new LatticeBuilder(d); b.node(0.5, 1, [0, 0], [1, 0]); b.column([0, 0], [1, 0], 2, 6); }],
  'L10 narrow 101 tower': [10, d => { const b = new LatticeBuilder(d); b.pyramid(1, 4, 2); b.column([2, 2], [3, 2], 3, 8); }],
  'L12 short-base Burj': [12, d => { const b = new LatticeBuilder(d); b.pyramid(0, 8, 4); b.column([3, 4], [4, 4], 4, 10); }],
};
for (const [name, [id, build]] of Object.entries(weak)) {
  const lv = LEVELS.find(l => l.id === id);
  if (only && id !== only) continue;
  const { d, cs, r } = run(lv, build);
  const ok = !cs.ok || r.state === 'lost';
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} weak: ${name.padEnd(24)} sticks=${d.used()} canStart=${cs.ok ? 'y' : cs.reason} -> ${r.state} ${r.reason}`);
}
console.log(bad ? `${bad} unexpected` : 'all as expected');
