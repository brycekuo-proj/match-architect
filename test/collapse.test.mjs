// After a failure the building must come down and burn: most glue lets go, most matches burn, the structure ends up low.
import { LEVELS, Design, Sim, L } from '../src/sim.js';
import { REFERENCE, LatticeBuilder } from '../src/designs.js';
import { OLD_BURJ, OLD_SAGRADA, sagradaRef } from './oldjobs.mjs';
const lv = id => id === 12 ? OLD_BURJ : id === 13 ? OLD_SAGRADA : LEVELS.find(l => l.id === id);
const cases = {
  'L2 unbraced square': [2, d => { const s = (a, b, c, e) => d.addSegment(a * L, b * L, c * L, e * L); s(0, 0, 1, 0); s(0, 0, 0, 1); s(1, 0, 1, 1); s(0, 1, 1, 1); s(1, 1, 2, 1); }],
  'L8 narrow Tokyo tower': [8, d => { const b = new LatticeBuilder(d); b.node(0.5, 1, [0, 0], [1, 0]); b.column([0, 0], [1, 0], 2, 6); }],
  'L10 narrow 101 tower': [10, d => { const b = new LatticeBuilder(d); b.pyramid(1, 4, 2); b.column([2, 2], [3, 2], 3, 8); }],
  'L13 Sagrada ref at 震度7x2': [13, d => sagradaRef(LatticeBuilder)(d), { A: 0.4, f: 1.6 }],
  'L12 short-base Burj': [12, d => { const b = new LatticeBuilder(d); b.pyramid(0, 8, 4); b.column([3, 4], [4, 4], 4, 10); }],
};
let bad = 0;
for (const [name, [id, build, quake]] of Object.entries(cases)) {
  const level = quake ? { ...lv(id), quake } : lv(id);
  const d = new Design(level); build(d);
  const sim = new Sim(level, d);
  const topY = () => { let m = -1e9; for (const b of sim.bodies.values()) m = Math.max(m, b.getPosition().y); return m; };
  const y0 = topY();
  let tFail = null, flares = 0;
  while (sim.t < 12) {
    sim.step(1 / 60);
    for (const ev of sim.events.splice(0)) { if (ev.type === 'lost') tFail = sim.t; if (ev.type === 'flare') flares++; }
    if (tFail !== null && sim.t > tFail + 3.2) break;   // the moment the result slip appears
  }
  const n = sim.bodies.size, burnt = sim.burn.size, broken = sim.joints.filter(j => j.broken).length;
  const fell = 1 - topY() / y0;
  const ok = tFail !== null && burnt >= Math.min(n, 3) && fell > 0.3;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(26)} fail@${tFail?.toFixed(2)}s  +3.2s: joints broken ${broken}/${sim.joints.length}  matches on fire ${burnt}/${n}  heads flared ${flares}  top height ${y0.toFixed(1)}→${topY().toFixed(1)}m (${(fell * 100).toFixed(0)}% down)`);
}
console.log(bad ? `${bad} FAILED` : 'collapse OK');
process.exit(bad ? 1 : 0);
