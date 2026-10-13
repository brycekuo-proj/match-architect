// Shop items must really help: builds that fall without them have to survive with them, placed sensibly.
import { LEVELS, Design, Sim, L, SHINDO } from '../src/sim.js';
import { REFERENCE, LatticeBuilder } from '../src/designs.js';
const lv = id => LEVELS.find(l => l.id === id);
const at = (d, x, y) => d.nodes.find(n => Math.hypot(n.x - x * L, n.y - y * L) < 0.05).id;
const height = (d, f) => { const ns = d.nodes.filter(n => n.kind !== 'anchor'), top = Math.max(...ns.map(n => n.y)); return ns.reduce((a, n) => Math.abs(n.y - top * f) < Math.abs(a.y - top * f) ? n : a).id; };
function run(level, d, opts) {
  const sim = new Sim(level, d, undefined, opts); let peak = 0;
  while (sim.state === 'running' && sim.t < 10.2) { sim.step(1 / 60); for (const J of sim.joints) peak = Math.max(peak, J.peak); }
  return { ok: sim.state === 'won', t: sim.t, peak };
}
const weak = {
  square: [2, d => { const s = (a, b, c, e) => d.addSegment(a * L, b * L, c * L, e * L); s(0, 0, 1, 0); s(0, 0, 0, 1); s(1, 0, 1, 1); s(0, 1, 1, 1); }],
  tokyo: [8, d => { const b = new LatticeBuilder(d); b.node(0.5, 1, [0, 0], [1, 0]); b.column([0, 0], [1, 0], 2, 6); }],
  t101: [10, d => { const b = new LatticeBuilder(d); b.pyramid(1, 4, 2); b.column([2, 2], [3, 2], 3, 8); }],
  burj: [12, d => { const b = new LatticeBuilder(d); b.pyramid(0, 8, 4); b.column([3, 4], [4, 4], 4, 10); }],
};
const make = k => { const [id, build] = weak[k]; const d = new Design(lv(id)); build(d); return [lv(id), d]; };
const checks = [
  ['nothing: all four weak builds fall', () => Object.keys(weak).every(k => { const [l, d] = make(k); return !run(l, d, {}).ok; })],
  ['彈簧避震器: one strut saves the unbraced square', () => { const [l, d] = make('square'); return run(l, d, { struts: [{ a: at(d, 0, 0), b: at(d, 1, 1) }] }).ok; }],
  ['高韌性鋼骨: saves the narrow Tokyo Tower', () => { const [l, d] = make('tokyo'); return run(l, d, { steel: true }).ok; }],
  ['碳纖維: wrapping every match saves Tokyo and the Burj', () => ['tokyo', 'burj'].every(k => { const [l, d] = make(k); return run(l, d, { wraps: d.sticks.map(s => s.id) }).ok; })],
  ['碳纖維: wrapping only the 6 lowest matches still saves the narrow Tokyo', () => { const [l, d] = make('tokyo'); const low = [...d.sticks].sort((a, b) => (d.node(a.a).y + d.node(a.b).y) - (d.node(b.a).y + d.node(b.b).y)).slice(0, 6); return run(l, d, { wraps: low.map(s => s.id) }).ok; }],
  ['隔震墊: saves Tokyo, 101 and the Burj', () => ['tokyo', 't101', 'burj'].every(k => { const [l, d] = make(k); return run(l, d, { iso: true }).ok; })],
  ['隔震墊: roughly halves the load on the 101 reference at Quake 7', () => { const l = { ...lv(10), quake: SHINDO['7'] }, d = new Design(l); REFERENCE[10](d); const a = run(l, d, {}).peak, b = run(l, d, { iso: true }).peak; console.log(`    101 @7: ${(a * 100).toFixed(0)}% -> ${(b * 100).toFixed(0)}%`); return b < a * 0.65 && b > a * 0.25; }],
  ['阻尼球: hung at 2/3 height it saves Tokyo, 101 and the Burj', () => ['tokyo', 't101', 'burj'].every(k => { const [l, d] = make(k); return run(l, d, { damper: height(d, 0.66) }).ok; })],
  ['阻尼球: where it hangs matters (on the Burj, at the top it is not enough)', () => { const [l, d] = make('burj'); return !run(l, d, { damper: height(d, 1) }).ok; }],
  ['no item breaks a reference build at its own quake', () => [7, 10, 13].every(id => { const d = new Design(lv(id)); REFERENCE[id](d); const all = { steel: true, iso: true, damper: height(d, 0.66), wraps: d.sticks.slice(0, 5).map(s => s.id) }; return run(lv(id), d, all).ok; })],
];
let bad = 0;
for (const [name, f] of checks) { const ok = f(); if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); }
console.log(bad ? `${bad} FAILED` : 'items OK');
process.exit(bad ? 1 : 0);
